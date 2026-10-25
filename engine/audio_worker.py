"""JSON-line bridge for optional MuScriptor 0.4.0. Run in its isolated venv."""
import contextlib
import dataclasses
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import gc
import warnings
import io

sys.path.insert(0,str(Path(__file__).resolve().parent))
from beat_support import configure_tls,ensure_checkpoint,SHA256 as BEAT_SHA256
from audio_decode import load_source_audio

PROTOCOL=sys.stdout
MODEL='MuScriptor/muscriptor-small'
MODEL_SIZE='small'
MODEL_SHAPES={'small':(768,14),'medium':(1024,24),'large':(1536,48)}

def emit(phase,**data):
    PROTOCOL.write(json.dumps({'phase':phase,**data},ensure_ascii=False)+'\n');PROTOCOL.flush()

def atomic(path,data):
    path=Path(path);temp=path.with_name(path.name+f'.part-{os.getpid()}')
    try:
        temp.write_bytes(data);os.replace(temp,path)
    finally:temp.unlink(missing_ok=True)

def digest(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
    return h.hexdigest()

def choose_device(torch,requested):
    if requested=='cpu':return 'cpu',None
    try:
        if not torch.cuda.is_available():return 'cpu','CUDA 不可用'
        probe=torch.zeros(1,device='cuda');torch.cuda.synchronize();del probe
        return 'cuda',None
    except Exception as error:return 'cpu',type(error).__name__

def gpu_failure(error):
    return type(error).__name__=='OutOfMemoryError' or isinstance(error,RuntimeError) and any(s in str(error).lower() for s in ('cuda','cudnn','cublas','no kernel image','device-side'))

def midi_count(data):
    from mido import MidiFile
    return sum(1 for track in MidiFile(file=io.BytesIO(data)).tracks for event in track if event.type=='note_on' and event.velocity>0)

def prepare(home,bundled=None,local=None):
    from huggingface_hub import hf_hub_download
    saved=home/f'{MODEL_SIZE}-model.json'
    for folder in ([Path(local)] if local else [])+([Path(bundled)] if bundled else []):
        weights=folder/'model.safetensors';config=folder/'config.json'
        if weights.is_file() and config.is_file():
            shape=json.loads(config.read_text('utf-8'))
            if (shape.get('dim'),shape.get('num_layers'))!=MODEL_SHAPES[MODEL_SIZE]:raise ValueError('本地模型配置与所选模型不匹配。')
            checksum=digest(weights)
            ready={'model':MODEL,'revision':'local-'+checksum,'weightsSHA256':checksum,'weights':str(weights),'config':str(config),'bytes':weights.stat().st_size,'bundled':not bool(local)}
            atomic(saved,json.dumps(ready,ensure_ascii=False,indent=2).encode('utf-8'));return ready
        if local:raise ValueError('本地模型目录需同时包含 model.safetensors 和 config.json。')
    try:
        ready=json.loads(saved.read_text('utf-8'))
        if ready['model']==MODEL and Path(ready['weights']).is_file() and Path(ready['config']).is_file():
            if not ready.get('weightsSHA256'):
                ready['weightsSHA256']=digest(ready['weights']);atomic(saved,json.dumps(ready,ensure_ascii=False,indent=2).encode('utf-8'))
            return ready
    except (OSError,ValueError,KeyError,TypeError):pass
    emit('audio-loading',message=f'下载 MuScriptor {MODEL_SIZE.title()} 权重，首次使用需要对应模型的 Hugging Face 授权…')
    weights=hf_hub_download(MODEL,'model.safetensors')
    revision=Path(weights).parent.name
    config=hf_hub_download(MODEL,'config.json',revision=revision)
    ready={'model':MODEL,'revision':revision,'weightsSHA256':digest(weights),'weights':str(weights),'config':str(config),'bytes':Path(weights).stat().st_size}
    atomic(saved,json.dumps(ready,ensure_ascii=False,indent=2).encode('utf-8'))
    return ready

def transcribe(config,home):
    from muscriptor import TranscriptionModel
    from muscriptor.events import NoteStartEvent,ProgressEvent
    from muscriptor.utils.midi import ExportOptions
    import torch
    prepared=prepare(home,config.get('bundledModel'),config.get('localModel'))
    source=Path(config['input']);source_digest=digest(source)
    key=hashlib.sha256((source_digest+prepared['weightsSHA256']+'muscriptor-0.4.0-default-no-quantize-system-tls-v2').encode()).hexdigest()[:20]
    stem=re.sub(r'[<>:"/\\|?*\x00-\x1f]','_',source.stem).strip('. ')[:65] or 'audio'
    folder=Path(config['output'])/'音频转录'/f'{stem}-{key}'
    folder.mkdir(parents=True,exist_ok=True)
    midi=folder/'转录.mid';report=folder/'转录说明.json'
    try:
        prior=json.loads(report.read_text('utf-8'))
        if prior['sourceSHA256']==source_digest and prior['midiSHA256']==digest(midi):
            actual=midi_count(midi.read_bytes())
            if prior['notes']!=actual:
                prior.setdefault('decodedNoteEvents',prior['notes']);prior['notes']=actual
                atomic(report,json.dumps(prior,ensure_ascii=False,indent=2).encode('utf-8'))
            emit('audio-done',midi=str(midi),folder=str(folder),cached=True,notes=actual);return
    except (OSError,ValueError,KeyError,TypeError):pass
    device,fallback=choose_device(torch,config.get('device','auto'))
    if fallback:emit('log',message='显卡检测未通过，自动使用 CPU：'+fallback)
    wav=load_source_audio(source,lambda message:emit('log',message=message));duration=wav.shape[-1]/16000
    if duration>3600:raise ValueError('音频超过 60 分钟，请先裁剪。')
    start=time.monotonic();transcription_warnings=[]
    for attempt in range(2):
        events=[];notes=0;model=None
        emit('audio-loading',message=f'载入 {MODEL_SIZE.title()} 模型 · {"NVIDIA GPU" if device=="cuda" else "CPU"}')
        try:
            model=TranscriptionModel.load_model(prepared['weights'],device=device)
            with warnings.catch_warnings(record=True) as captured:
                warnings.simplefilter('always')
                for event in model.transcribe(audio=(wav,16000),batch_size=1,prelude_forcing=True):
                    if isinstance(event,ProgressEvent):emit('audio-progress',completed=event.completed,total=event.total,notes=notes,device=device)
                    else:
                        events.append(event)
                        if isinstance(event,NoteStartEvent):notes+=1
            transcription_warnings=[str(w.message) for w in captured]
            for message in transcription_warnings:emit('log',message='转录提示：'+message)
            break
        except Exception as error:
            if device!='cuda' or not gpu_failure(error) or attempt:raise
            fallback=type(error).__name__;device='cpu'
            emit('log',message='GPU 转录遇到运行或显存问题，自动改用 CPU 重新转录：'+fallback)
            del model;gc.collect()
            try:torch.cuda.empty_cache()
            except Exception:pass
    if not notes:raise ValueError('所选模型未识别到音符，请换一段更清晰的音乐测试。')
    emit('audio-beats',message='识别节拍并保存 MIDI；随后按 10t / 20t 适配原版电路…')
    beat_warning=None;beat_error=None
    try:
        ensure_checkpoint(home,config.get('beatModel'),lambda message:emit('audio-beats',message=message))
        grid=model.detect_beat_grid_for((wav,16000),True)
        if grid is None:raise RuntimeError('未得到可用的节拍网格。')
        emit('log',message=f'已识别节拍：{grid.bpm:.3f} BPM，拍号分子 {grid.beats_per_bar or "未确定"}；不额外进行节拍网格量化。')
    except Exception as error:
        grid=None;beat_warning=type(error).__name__;beat_error=str(error)
        emit('log',message='节拍检测未完成：'+beat_warning+'；使用绝对起音时间导出，120 BPM 为占位速度。')
    data=model.events_to_midi_bytes(iter(events),beat_grid=grid,export=ExportOptions(quantize=False,fill_gaps=0,trim_leading_bars=False))
    if data[:4]!=b'MThd':raise ValueError('MuScriptor 未输出有效 MIDI。')
    written_notes=midi_count(data)
    if not written_notes:raise ValueError('模型解码后没有可导出的 MIDI 音符，请换一段更清晰的音频。')
    atomic(midi,data)
    details={'source':str(source),'sourceSHA256':source_digest,'model':MODEL,'modelRevision':prepared['revision'],
        'packageVersion':'0.4.0','notes':written_notes,'decodedNoteEvents':notes,'sourceSeconds':duration,'device':device,'seconds':time.monotonic()-start,
        'velocityInferred':False,'midiVelocity':100,'controllersInferred':False,'quantizedByTranscriber':False,
        'detectedBpm':grid.bpm if grid is not None else None,'beatsPerBar':grid.beats_per_bar if grid is not None else None,'beatWarning':beat_warning,'beatError':beat_error,'beatModelSHA256':BEAT_SHA256 if grid is not None else None,'pipelineVersion':2,'transcriptionWarnings':transcription_warnings,'gpuFallback':fallback,'midiSHA256':digest(midi)}
    atomic(report,json.dumps(details,ensure_ascii=False,indent=2).encode('utf-8'))
    emit('audio-done',midi=str(midi),folder=str(folder),cached=False,notes=written_notes)

def main():
    global MODEL,MODEL_SIZE
    config=json.loads(sys.stdin.readline());home=Path(config['home']).expanduser().resolve();home.mkdir(parents=True,exist_ok=True)
    try:
        configure_tls()
        MODEL_SIZE=config.get('model','small')
        if MODEL_SIZE not in MODEL_SHAPES:raise ValueError('模型选择无效。')
        MODEL=f'MuScriptor/muscriptor-{MODEL_SIZE}'
        # Upstream progress must never pollute the JSON stdout protocol.
        with contextlib.redirect_stdout(sys.stderr):
            if config['action']=='login':
                from huggingface_hub import login
                token=config.pop('token','').strip()
                if not token.startswith('hf_'):raise ValueError('请输入 Hugging Face 的读取令牌。')
                login(token=token,add_to_git_credential=False)
                emit('log',message='Hugging Face 已登录；令牌由 Hugging Face 缓存管理，不写入软件配置。')
                prepare(home,config.get('bundledModel'),config.get('localModel'));emit('audio-ready',message='所选模型已准备好，可以开始转换。')
            elif config['action']=='prepare':
                prepare(home,config.get('bundledModel'),config.get('localModel'));emit('audio-ready',message='所选模型已准备好，可以开始转换。')
            elif config['action']=='transcribe':transcribe(config,home)
            else:raise ValueError('未知音频任务。')
    except Exception as error:
        name=type(error).__name__
        auth=name in ('GatedRepoError','RepositoryNotFoundError','LocalTokenNotFoundError') or getattr(getattr(error,'response',None),'status_code',None) in (401,403)
        message=('所选模型权重需要授权：先在对应模型页面接受条款，再点“登录 Hugging Face”输入读取令牌。' if auth else re.sub(r'hf_[A-Za-z0-9_]+','[令牌已隐藏]',str(error)))
        emit('error',message=message,errorCode='audio-auth-required' if auth else 'audio-failed');return 1
    return 0

if __name__=='__main__':raise SystemExit(main())
