"""Independent NBT readback of the actual MIDI conversion output."""
import json
from pathlib import Path
import nbtlib

audit=json.loads(Path('tests/output/midi/verification.json').read_text('utf-8'))
n=nbtlib.load(audit['schematic'])
entities=[e for region in n['Regions'].values() for e in region['TileEntities'] if str(e['id'])=='extendednoteblock:extended_note_block_entity']
actual=sorted((int(e['note']),int(e['velocity']),int(e['sustainTime']),int(e['fadeInTime']),int(e['fadeOutTime']),int(e['oneShot']),int(e['holdUntilRelease'])) for e in entities)
expected=sorted((e['note'],e['velocity'],e['sustainTime'],e['fadeInTime'],e['fadeOutTime'],0,0) for e in audit['blocks'])
assert actual==expected,(actual,expected)
assert len(actual)==5
vanilla=nbtlib.load(audit['vanillaSchematic'])
palette=[str(b['Name']) for r in vanilla['Regions'].values() for b in r['BlockStatePalette']]
assert 'minecraft:note_block' in palette and all(b.startswith('minecraft:') for b in palette)
assert not any(str(e['id']).startswith('extendednoteblock:') for r in vanilla['Regions'].values() for e in r['TileEntities'])
print('PASS independent MIDI NBT: pitches, velocities, durations, fades, oneShot and holdUntilRelease.')
print('PASS vanilla MIDI NBT: vanilla note blocks only; no mod block IDs or ENB entities.')
