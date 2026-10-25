"""Verify checkpoint integrity, atomic cache publication and verified TLS requests."""
from pathlib import Path
import hashlib,io,sys,tempfile
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'engine'))
import beat_support as beat
data=b'unit-test checkpoint, not neural weights';checksum=hashlib.sha256(data).hexdigest()
with tempfile.TemporaryDirectory() as directory,patch.object(beat,'SIZE',len(data)),patch.object(beat,'SHA256',checksum):
    base=Path(directory);bundle=base/'bundle.ckpt';bundle.write_bytes(data)
    cached=beat.ensure_checkpoint(base/'local',bundle)
    assert cached.read_bytes()==data
    with patch('urllib.request.urlopen',side_effect=AssertionError('cache hit must be offline')):
        assert beat.ensure_checkpoint(base/'local',bundle)==cached
    cached.write_bytes(b'x'*len(data));assert beat.ensure_checkpoint(base/'local',bundle).read_bytes()==data
    captured={}
    def response(request,**kwargs):
        captured.update(kwargs);return io.BytesIO(data)
    with patch('urllib.request.urlopen',side_effect=response):
        assert beat.ensure_checkpoint(base/'network').read_bytes()==data
    assert captured['context'].check_hostname and captured['context'].verify_mode==2
    with patch('urllib.request.urlopen',return_value=io.BytesIO(b'x'*len(data))):
        try:beat.ensure_checkpoint(base/'bad');raise AssertionError('bad hash accepted')
        except ValueError:pass
    assert not list((base/'bad').rglob('*.part-*'))
    assert not (base/'bad/models/torch/hub/checkpoints/beat_this-final0.ckpt').exists()
print('PASS beat model: hash/size checks, offline reuse, corruption recovery, verified TLS and incomplete-download cleanup')
