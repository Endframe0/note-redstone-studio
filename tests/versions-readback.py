import json
from pathlib import Path
import nbtlib
items=json.loads(Path('tests/version-output/results.json').read_text('utf-8'))
for item in items:
 n=nbtlib.load(item['file'])
 assert int(n['MinecraftDataVersion'])==item['dataVersion']
 assert int(n['Version'])==item['format']
 entities=[e for region in n['Regions'].values() for e in region['TileEntities']]
 if item.get('hopper'):
  e=next(e for e in entities if str(e['id'])=='minecraft:hopper');stack=e['Items'][0]
  assert ('count' in stack)==item['components']
  assert ('Count' in stack)!=item['components']
  assert int(stack['count' if item['components'] else 'Count'])==32
 elif 'commands' in item: assert len(entities)==item['commands']
print('PASS independent NBT readback:',len(items),'exports')
