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
for i,file in enumerate(audit['brassSchematics']):
    brass=nbtlib.load(file)
    if i==0:
        palette=[b for r in brass['Regions'].values() for b in r['BlockStatePalette']]
        instruments={str(b['Properties']['instrument']) for b in palette if str(b['Name'])=='minecraft:note_block'}
        assert instruments=={'trumpet','trumpet_exposed','trumpet_weathered','trumpet_oxidized'},instruments
        assert {'minecraft:waxed_copper_block','minecraft:waxed_exposed_copper','minecraft:waxed_weathered_copper','minecraft:waxed_oxidized_copper'} <= {str(b['Name']) for b in palette}
    else:
        notes=[e for r in brass['Regions'].values() for e in r['TileEntities'] if str(e['id']).startswith('extendednoteblock:')]
        assert len(notes)==8
        assert {str(e['vanillaInstrument']) for e in notes}=={'trumpet','trumpet_exposed','trumpet_weathered','trumpet_oxidized'}
        assert all(int(e['note'])==(72 if str(e['vanillaInstrument']) in ('trumpet_weathered','trumpet_oxidized') else 60) for e in notes)
print('PASS 26.x MIDI brass NBT: four copper timbres, waxed bases, octave compensation, vanilla and ENB.')
