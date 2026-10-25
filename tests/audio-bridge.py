"""Bridge logic tests. Real neural inference is a separate local MP3 audit."""
from pathlib import Path
import importlib.util,json,os,sys,tempfile,time,types
from unittest.mock import patch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root))
import desktop_audio as audio
spec=importlib.util.spec_from_file_location('audio_worker',root/'engine/audio_worker.py')
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)

class Cuda:
    def __init__(self,available=True,fail=False):self.available=available;self.fail=fail
    def is_available(self):return self.available
    def synchronize(self):
        if self.fail:raise RuntimeError('CUDA driver probe failed')
class Torch:
    def __init__(self,available=True,fail=False):self.cuda=Cuda(available,fail);self.probes=0
    def zeros(self,*args,**kwargs):self.probes+=1;assert kwargs['device']=='cuda';return object()

t=Torch();assert worker.choose_device(t,'auto')==('cuda',None) and t.probes==1
t=Torch(False);assert worker.choose_device(t,'auto')[0]=='cpu' and t.probes==0
t=Torch(fail=True);assert worker.choose_device(t,'auto')==('cpu','RuntimeError')
t=Torch();assert worker.choose_device(t,'cpu')==('cpu',None) and t.probes==0
assert worker.gpu_failure(RuntimeError('CUDA out of memory'))
assert not worker.gpu_failure(ValueError('bad model file'))

with tempfile.TemporaryDirectory() as tmp:
    base=Path(tmp);home=base/'home';home.mkdir()
    for size,shape in worker.MODEL_SHAPES.items():
        worker.MODEL_SIZE=size;worker.MODEL=f'MuScriptor/muscriptor-{size}'
        folder=base/size;folder.mkdir();(folder/'model.safetensors').write_bytes(b'fixture-not-inference')
        (folder/'config.json').write_text(json.dumps({'dim':shape[0],'num_layers':shape[1]}),'utf-8')
        info=worker.prepare(home,local=str(folder));assert info['model']==worker.MODEL
        assert audio.status(home,model=size)['modelReady']
        assert (home/f'{size}-model.json').is_file()
    worker.MODEL_SIZE='large';worker.MODEL='MuScriptor/muscriptor-large'
    try:worker.prepare(home,local=str(base/'small'));raise AssertionError('wrong model accepted')
    except ValueError:pass
    for label in audio.MODEL_LABELS:assert audio.model_key(label) in worker.MODEL_SHAPES
    assert audio.is_audio('music.MP3') and not audio.is_audio('music.mid')
    os.environ['NBS_SETTINGS_DIR']=str(base/'prefs')
    from desktop_app import DesktopAPI,DEFAULTS,clean
    for label in audio.MODEL_LABELS:
        v=clean({**DEFAULTS,'audio_model':label},strict=True);assert v['audio_model']==label
    assert audio.MODEL_LABELS==['Small-0.1b-默认-低级','Medium-0.3b-1.5G显存-中级(手动下载)','Large-1.4b-6.1G显存-高级(手动下载)']
    for size,legacy in [('small','Small · 默认试用'),('medium','Medium · 自行安装'),('large','Large · 自行安装')]:
        expected=next(label for label in audio.MODEL_LABELS if audio.model_key(label)==size)
        assert audio.model_key(legacy)==size
        assert clean({'audio_model':legacy},strict=True)['audio_model']==expected
    for bad in ['Smallish','MediumBroken','LargeXYZ']:
        try:audio.model_key(bad);raise AssertionError('invalid model prefix accepted')
        except ValueError:pass
    sample=base/'sample.mp3';sample.write_bytes(b'fixture')
    api=DesktopAPI();v={**DEFAULTS,'audio_home':str(home)}
    inspected=api.inspect_song(v,{'input':str(sample),'output':str(base/'out')})
    assert inspected['ok'] and inspected['audio']
    assert api.bootstrap()['defaults']['auto_sound']=='纯原版音符盒'
    stub=base/'slow.py';stub.write_text('import json,time\nprint(json.dumps({"phase":"audio-progress","completed":0,"total":10,"notes":0}),flush=True)\ntime.sleep(30)\n','utf-8')
    def slow(self,opt,action):
        self._process([sys.executable,str(stub)])
        if self._cancel.is_set():raise RuntimeError('cancelled')
    api._audio=types.MethodType(slow,api)
    assert api.start(v,{'input':str(sample),'output':str(base/'out')})['ok']
    end=time.monotonic()+8
    while api._state['phase']!='transcribing' and time.monotonic()<end:time.sleep(.05)
    assert api._state['phase']=='transcribing'
    start=time.monotonic();api.cancel();api._thread.join(10)
    assert not api._thread.is_alive() and api._state['phase']=='cancelled'
    assert api._worker is None and time.monotonic()-start<8
print('PASS audio bridge: 3 external model selections, local model validation, pure vanilla default, actual CUDA probe/CPU fallback, preflight and child-process cancellation')
