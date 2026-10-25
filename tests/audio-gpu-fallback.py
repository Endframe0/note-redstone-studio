"""Run in the optional audio venv: inject a GPU failure, exercise CPU retry."""
from pathlib import Path
import importlib.util,io,json,sys,tempfile
from unittest.mock import patch
import torch,mido
from muscriptor.events import NoteStartEvent,NoteEndEvent
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('worker',root/'engine/audio_worker.py')
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
attempts=[]
buf=io.BytesIO();m=mido.MidiFile();track=mido.MidiTrack();m.tracks.append(track)
track.extend([mido.Message('note_on',note=60,velocity=100),mido.Message('note_off',note=60,time=240)]);m.save(file=buf)
class Model:
    def transcribe(self,**kwargs):
        start=NoteStartEvent(pitch=60,start_time=0,index=0,instrument='acoustic_piano')
        yield start;yield NoteEndEvent(end_time=.25,start_event=start)
    def detect_beat_grid_for(self,*args):return None
    def events_to_midi_bytes(self,*args,**kwargs):return buf.getvalue()
def load(weights,device):
    attempts.append(device)
    if device=='cuda':raise RuntimeError('CUDA out of memory - injected regression fault')
    return Model()
with tempfile.TemporaryDirectory() as directory:
    p=Path(directory);source=p/'sample.wav';source.write_bytes(b'fixture only: audio loader is replaced')
    prepared={'weights':str(p/'model.safetensors'),'revision':'test','weightsSHA256':'0'*64}
    with patch.object(worker,'prepare',return_value=prepared),patch.object(worker,'choose_device',return_value=('cuda',None)),patch.object(worker,'ensure_checkpoint'),patch('muscriptor.TranscriptionModel.load_model',side_effect=load),patch.object(worker,'load_source_audio',return_value=torch.zeros(1,16000)):
        worker.transcribe({'input':str(source),'output':str(p/'out'),'device':'auto'},p)
    report=json.loads(next((p/'out').rglob('转录说明.json')).read_text('utf-8'))
    assert attempts==['cuda','cpu'],attempts
    assert report['device']=='cpu' and report['gpuFallback']=='RuntimeError' and report['notes']==1
print('PASS injected CUDA runtime failure: automatic single CPU retry, valid MIDI saved, fallback recorded')
