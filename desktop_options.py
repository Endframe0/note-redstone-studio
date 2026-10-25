"""Shared desktop choices and stable 2.x profile keys."""
import os, sys, json
from pathlib import Path
from desktop_audio import is_audio
BASE = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
VERSIONS = json.loads((BASE / 'engine' / 'versions.json').read_text(encoding='utf-8'))
VERSION_MAP = {v['id']: v for v in VERSIONS}
SUPPORTS = {'圆石': 'cobblestone', '石头': 'stone', '淡灰色羊毛': 'light_gray_wool',
            '石英块': 'quartz_block', '铁块': 'iron_block', '金块': 'gold_block'}
SUPPORTS.update({name + '混凝土': color + '_concrete' for color, name in [
    ('white','白色'), ('orange','橙色'), ('magenta','品红色'), ('light_blue','淡蓝色'),
    ('yellow','黄色'), ('lime','黄绿色'), ('pink','粉红色'), ('gray','灰色'),
    ('light_gray','淡灰色'), ('cyan','青色'), ('purple','紫色'), ('blue','蓝色'),
    ('brown','棕色'), ('green','绿色'), ('red','红色'), ('black','黑色')]})
HORIZONTAL_OPTIONS = {'必须正方形': 1.0, **{f'长边最多比短边长 {percent}%': 1 + percent / 100
                      for percent in [10, 20, 30, 50, 75, 100, 150, 200, 300, 400, 700]}, '不限': 0}
SPACE_OPTIONS = {f'最长边最多是最短边的 {ratio:g} 倍': ratio
                 for ratio in [1, 1.2, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6, 8, 10]}
SPACE_OPTIONS['不限'] = 0
RADIUS_OPTIONS = {f'{radius} 格': radius for radius in [12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80, 96, 128]}
RADIUS_OPTIONS['不限'] = 0
BUDGETS = {'试算 · 10 秒': 10, '快速 · 30 秒': 30, '普通 · 1 分钟': 60,
           '深入 · 5 分钟': 300, '深入 · 10 分钟': 600, '充分 · 30 分钟': 1800,
           '充分 · 60 分钟': 3600, '长时间 · 3 小时': 10800, '持续优化 · 手动导出': 0}
SOUND_ENGINES = {'原版音符盒': 'vanilla', 'Quinn 扩展音域（v1.3）': 'quinn',
                 'ENB 扩展音域（MIDI 0–127）': 'extended'}
SOUND_HINTS = {'vanilla': '原版两八度；不需要额外音域模组或数据包。',
               'quinn': 'Quinn 需 26.1.2、数据包＋资源包；投影粘贴须包含实体。',
               'extended': 'ENB 保留音符力度×音轨音量；需配套模组，粘贴须保留方块实体 NBT。'}


def make_options(values):
    version = VERSION_MAP.get(values['target'])
    if not version: raise ValueError('请选择支持的 Java 正式版本。')
    if not Path(values['input']).is_file():raise ValueError('请先选择有效的 NBS 或 MIDI 文件。')
    if not values['output'].strip():raise ValueError('请选择输出目录。')
    midi_source=is_audio(values['input']) or Path(values['input']).suffix.lower() in ('.mid','.midi')
    def pitch_mode(label):
        return 'smart' if midi_source and label=='原版智能八度（保留音级）' else 'fold' if label=='八度折叠 / 半音取整' else 'strict'
    midi=dict(midiTimingMode={'节拍适配（小幅变速）':'fit','保持原速（允许量化）':'original','严格原速（不可量化）':'strict'}.get(values.get('midi_timing'),'fit'),midiSpeedTolerance=float(values.get('midi_speed_tolerance',10)),midiEnvelope={'MIDI 自适应包络':'adaptive','不使用淡入淡出':'none'}.get(values.get('midi_envelope'),'custom'),midiFadeInMs=int(values.get('midi_fade_in',0)),midiFadeOutMs=int(values.get('midi_fade_out',50)))
    if midi_source:
        resolution=values.get('midi_resolution','紧凑优先（低误差时用 10t）')
        midi.update(midiPrefer10t=resolution.startswith('紧凑优先'),midiAutoResolution=not resolution.startswith('固定'),timeResolution=20 if resolution=='固定 20t' else 10)
    if values.get('adaptive'):
        # Hidden manual settings never veto a fresh automatic plan.
        return dict(input=values['input'],output=values['output'],target=values['target'],support=SUPPORTS[values['support']],adaptive=True,maxAspect=HORIZONTAL_OPTIONS[values['aspect']],maxSpatialAspect=SPACE_OPTIONS[values['spatial_aspect']],soundEngine='extended' if values.get('auto_sound')=='ENB 模组音符盒' else 'vanilla',pitch=pitch_mode(values.get('auto_pitch')),**midi)
    limits=[512,100,100] if not values['objective'].startswith('体积优先') else [int(values[f"limit_{i}"]) for i in range(3)]
    opt={'input':values['input'],'output':values['output'],'target':values['target'],
         'objective':'toxic' if values['objective'].startswith('毒曲') else 'materials' if values['objective'].startswith('极限省材') else 'volume',
         'seconds':BUDGETS[values['budget']],
         'workers':int(values['threads']),'maxTracks':int(values['max_tracks']),'externalInputs':True,'autoStartWiring':values['auto_start_wiring'],
         'maxAspect':HORIZONTAL_OPTIONS[values['aspect']],
         'maxSpatialAspect':SPACE_OPTIONS[values['spatial_aspect']],
         'maxListeningRadius':RADIUS_OPTIONS[values['listening_radius']],
         'backend':'gpu' if values['backend']=='CPU + NVIDIA GPU' else 'cpu',
         'support':SUPPORTS[values['support']],
         'speed':float(values['speed']),'transpose':int(values['transpose']),
         'timing':'auto' if values['timing'].startswith('自动') else 'strict' if '严格保留' in values['timing'] else 'quantize',
         'timeResolution':20 if values['timing'].startswith('20t') else 10,
         'pitch':pitch_mode(values['pitch']),
         'soundEngine':SOUND_ENGINES[values['sound_engine']],
         'maxX':limits[0],'maxZ':limits[1],'maxY':limits[2]}
    is_midi=midi_source
    if is_midi: opt.update(timing='auto',timeResolution=10)
    if opt['timeResolution']==20 and opt['objective'] not in ('volume','toxic'):
        raise ValueError('20t 支持体积优先和毒曲模式；省材模式请选 10t。')
    opt.update(heavyCore=values['heavy_core'], stagedSearch=True)
    if opt['soundEngine']=='quinn' and opt['target']!='26.1.2':
        raise ValueError('Quinn 扩展音域需要 Java 26.1.2 和官方 v1.3 数据包、资源包。')
    if opt['soundEngine']=='extended' and version['enb'] not in ('port','upstream+compat'):
        raise ValueError('此版本尚无 ENB 组合。请选择 1.20.1、1.21.1 或 26.x；纯原版投影仍可使用当前版本。')
    if opt['objective']=='toxic':
        opt.update(backend='cpu', heavyCore=False, autoStartWiring=True)
    if opt['objective']=='materials':
        if not version['reuse']:raise ValueError('乐句复用使用铜灯，需要 Java 1.21 或更新版本。')
        opt['heavyCore']=False
    if opt['heavyCore'] and not version['heavyCore']:
        raise ValueError('沉重核心模板需要 Java 1.21 或更新版本。')
    if opt['objective']=='materials':
        opt.update(backend='cpu', maxX=512, maxZ=512, maxY=384, maxAspect=0, maxSpatialAspect=0, maxListeningRadius=0)
    if opt['backend']=='gpu':
        helper=BASE/'runtime'/'gpu'/'gpu_backend.exe'
        opt['gpuCommand']=([str(helper)] if getattr(sys,'frozen',False) or helper.exists() else [sys.executable,str(BASE/'engine'/'gpu_backend.py')]) + ['--cuda-dir',str(BASE/'runtime'/'cuda-package')]
    opt.update(midi)
    return opt
