"""Optional MuScriptor runtime, separate from the converter and its Python."""
import hashlib
import os
import re
from pathlib import Path
import shutil
import sys

AUDIO_EXTENSIONS={'.mp3','.wav','.flac','.ogg','.m4a','.aif','.aiff','.opus'}
MODEL_URL='https://huggingface.co/MuScriptor/muscriptor-small'
PACKAGE='muscriptor==0.4.0'
TLS_PACKAGE='truststore>=0.10.4,<1'
DECODER_PACKAGE='imageio-ffmpeg==0.6.0'
MODEL_LABELS=['Small-0.1b-默认-低级','Medium-0.3b-1.5G显存-中级(手动下载)','Large-1.4b-6.1G显存-高级(手动下载)']

def model_key(label):
    match=re.match(r'^(small|medium|large)(?=$|[\s·-])',str(label or 'small').strip(),re.I)
    if not match:raise ValueError('请选择 Small、Medium 或 Large。')
    return match.group(1).lower()

def is_audio(path):
    return Path(path).suffix.lower() in AUDIO_EXTENSIONS

def default_home():
    return os.environ.get('NRS_AUDIO_HOME') or str(Path(os.environ.get('LOCALAPPDATA',Path.home()))/'NoteRedstoneStudio'/'audio-small')

def runtime(home):
    return Path(home).expanduser().resolve()/'venv'/'Scripts'/'python.exe'

def bundled_model(base,model='small'):
    return (Path(base).parent/'模型' if getattr(sys,'frozen',False) else Path(base)/'models')/f'muscriptor-{model_key(model)}'

def validate_local(folder,model):
    if not folder:return
    import json
    path=Path(folder).expanduser()
    if not (path/'model.safetensors').is_file() or not (path/'config.json').is_file():raise ValueError('本地模型目录需包含 model.safetensors 和 config.json。')
    try:shape=json.loads((path/'config.json').read_text('utf-8'))
    except (OSError,ValueError):raise ValueError('本地模型 config.json 无效。')
    expected={'small':(768,14),'medium':(1024,24),'large':(1536,48)}[model_key(model)]
    if (shape.get('dim'),shape.get('num_layers'))!=expected:raise ValueError('本地目录与所选模型不匹配，请选择对应目录或清空目录使用缓存。')

def status(home,base=None,model='small',local=''):
    import json
    root=Path(home).expanduser().resolve()
    try:
        info=json.loads((root/f'{model_key(model)}-model.json').read_text('utf-8'))
        ready=info['model']==f'MuScriptor/muscriptor-{model_key(model)}' and Path(info['weights']).is_file() and Path(info['config']).is_file()
    except (OSError,ValueError,KeyError,TypeError):
        info={};ready=False
    if (base or local) and not ready:
        folder=Path(local) if local else bundled_model(base,model);ready=(folder/'model.safetensors').is_file() and (folder/'config.json').is_file()
    try:runtime_ready=json.loads((root/'runtime-ready.json').read_text('utf-8')).get('schema',0)>=2
    except (OSError,ValueError,TypeError):runtime_ready=False
    return {'installed':runtime(home).is_file() and runtime_ready,'modelReady':ready,
            'home':str(root),'model':'MuScriptor '+model_key(model).title(),'licenseURL':'https://huggingface.co/MuScriptor/muscriptor-'+model_key(model)}

def environment(home):
    env=os.environ.copy();root=Path(home).expanduser().resolve()
    env.update(PYTHONUTF8='1',PYTHONUNBUFFERED='1',HF_HUB_CACHE=str(root/'models'/'hub'),
        TORCH_HOME=str(root/'models'/'torch'),UV_CACHE_DIR=str(root/'cache'/'uv'),
        HF_HUB_DISABLE_TELEMETRY='1',HF_HUB_DISABLE_PROGRESS_BARS='1')
    return env

def setup_commands(home,base,device):
    root=Path(home).expanduser().resolve();root.mkdir(parents=True,exist_ok=True)
    uv=next((p for p in [Path(base)/'runtime'/'uv.exe',Path.home()/'.local/bin/uv.exe'] if p.is_file()),None)
    uv=uv or shutil.which('uv')
    if not uv:raise ValueError('缺少可选音频安装工具 uv，请按 docs/audio.md 安装。')
    commands=[]
    if not runtime(home).is_file():
        python='3.12' if getattr(sys,'frozen',False) else sys.executable
        commands.append([str(uv),'venv',str(root/'venv'),'--python',python])
    commands.append([str(uv),'pip','install','--python',str(runtime(home)),'--torch-backend',
        'cpu' if device=='cpu' else 'cu128',PACKAGE,TLS_PACKAGE,DECODER_PACKAGE])
    return commands

def source_hash(file):
    h=hashlib.sha256()
    with Path(file).open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()
