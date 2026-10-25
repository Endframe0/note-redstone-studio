"""Independent binary NBT check; optionally pass a real-song conversion report."""
import json, sys
from pathlib import Path
import nbtlib

audit=json.loads(Path(sys.argv[1] if len(sys.argv)>1 else 'tests/output/midi-adaptive/verification.json').read_text('utf-8'))
blocks=audit.get('blocks')
if not isinstance(blocks,list):
    blocks=json.loads((Path(audit['folder'])/'扩展音符盒配置.json').read_text('utf-8'))['blocks']
n=nbtlib.load(audit['schematic'])
entities=[e for r in n['Regions'].values() for e in r['TileEntities'] if str(e['id'])=='extendednoteblock:extended_note_block_entity']
from collections import Counter
from struct import pack,unpack
f32=lambda v:unpack('f',pack('f',float(v)))[0]
def key(e,native):
    curve=e.get('AdvancedData',{}).get('VolumePoints',[]) if native else e.get('volumePoints',[])
    return (int(e['note']),int(e['velocity']),int(e['sustainTime']),int(e['fadeInTime']),int(e['fadeOutTime']),tuple((f32(p['t']),f32(p['v'])) for p in curve))
assert len(entities)==len(blocks)
assert Counter(key(e,True) for e in entities)==Counter(key(e,False) for e in blocks)
natural=[e for e in entities if str(e['vanillaInstrument'])=='snare']
timed=[e for e in entities if str(e['vanillaInstrument'])!='snare']
assert all(int(e['oneShot']) and not int(e['holdUntilRelease']) and int(e['sustainTime'])==0 and int(e['fadeInTime'])==0 and int(e['fadeOutTime'])==0 and 'AdvancedData' not in e for e in natural)
assert all(not int(e['oneShot']) and not int(e['holdUntilRelease']) for e in timed)
for e in (b for b in blocks if b['vanillaInstrument']!='snare'):
    info=e['envelopeInfo']; tail=info.get('quietTail')
    if tail:
        assert int(e['sustainTime'])==tail['endTick']+1<=tail['originalDurationTicks']
        assert tail['threshold']==.11 and 0<tail['fadeTicks']<=5
        assert tail['endTick']-tail['startTick']==tail['fadeTicks']
        assert e['volumePoints'][-1]['v']==0 and e['volumePoints'][-1]['t']==1
    else:
        assert int(e['sustainTime'])>info['gateTicks']
print(f'PASS adaptive binary NBT: {len(timed)} individual curves, {len(natural)} natural snares, durations, releases, velocities and playback flags')
