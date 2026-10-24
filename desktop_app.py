"""Offline WebView2 desktop shell. Conversion always runs in a child process."""
import copy
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from collections import deque
from pathlib import Path

from profiles import settings_path, read_settings, write_settings
from desktop_options import (BASE, SUPPORTS, BUDGETS, SOUND_ENGINES, SOUND_HINTS,
    HORIZONTAL_OPTIONS, SPACE_OPTIONS, RADIUS_OPTIONS, make_options, VERSIONS)

VERSION = '2.11.1'
DEFAULTS = dict(adaptive=True, objective='体积优先', target='26.1.2', budget='持续优化 · 手动导出',
    support='圆石', speed='1', pitch='严格保留', timing='严格保留', transpose='0',
    auto_sound='纯原版音符盒',auto_pitch='严格保留',
    sound_engine='原版音符盒', threads=str(min(os.cpu_count() or 1, 32)),
    aspect='长边最多比短边长 50%', spatial_aspect='最长边最多是最短边的 2 倍',
    listening_radius='40 格', backend='CPU 多核', max_tracks='8',
    midi_timing='节拍适配（小幅变速）',midi_speed_tolerance='10',midi_envelope='按设置淡入淡出',midi_fade_in='0',midi_fade_out='50',
    auto_start_wiring=True, heavy_core=False, limit_0='80', limit_1='80', limit_2='48')
CHOICES = dict(midi_timing=['节拍适配（小幅变速）','保持原速（允许量化）','严格原速（不可量化）'],midi_speed_tolerance=['0','1','3','5','10','15','20','25'],midi_envelope=['按设置淡入淡出','不使用淡入淡出'],objective=['体积优先', '极限省材（强制乐句复用）', '毒曲（宽高 ≤100，自动跟随）'],
    target=[v['id'] for v in VERSIONS], budget=list(BUDGETS), support=list(SUPPORTS), speed=['1','0.5','2'],
    pitch=['严格保留','八度折叠 / 半音取整'],
    timing=['严格保留','最近红石刻（±50 ms）','20t 严格保留（实验）','20t 最近游戏刻（±25 ms）','自动识别（严格保留）'],
    sound_engine=list(SOUND_ENGINES),auto_sound=['纯原版音符盒','ENB 模组音符盒'],auto_pitch=['严格保留','八度折叠 / 半音取整'], aspect=list(HORIZONTAL_OPTIONS),
    spatial_aspect=list(SPACE_OPTIONS), listening_radius=list(RADIUS_OPTIONS),
    backend=['CPU 多核','CPU + NVIDIA GPU'], max_tracks=['1','2','3','4','6','8'])
NUMERIC = dict(midi_fade_in=(0,20000),midi_fade_out=(0,20000),transpose=(-48,48), threads=(1,128), limit_0=(4,512), limit_1=(4,512), limit_2=(4,384))
LANES = {'material-reuse':'省材复用','ordinary':'普通布线','sand-packing':'层间压缩',
    'snare':'沙子独立音轨','reuse':'乐句复用','heavy-core':'沉重核心'}


def clean(values, strict=False):
    result = DEFAULTS.copy()
    for key, default in DEFAULTS.items():
        value = values.get(key, default)
        if key == 'objective' and isinstance(value,str) and value.startswith('毒曲'):
            value = CHOICES[key][2]
        valid = True
        if key in CHOICES: valid = isinstance(value,str) and value in CHOICES[key]
        elif key in NUMERIC:
            try:
                lo, hi = NUMERIC[key]
                valid = lo <= int(value) <= hi and float(value) == int(value)
                value = str(int(value))
            except (ValueError, TypeError): valid = False
        elif isinstance(default,bool): valid = isinstance(value,bool)
        if not valid and strict: raise ValueError('设置无效：'+key)
        result[key] = value if valid else default
    return result


class DesktopAPI:
    def __init__(self):
        self._window = None
        self._lock = threading.RLock()
        self._settings_file = settings_path()
        data = read_settings(self._settings_file)
        self._values = clean(data.get('last',{}) if isinstance(data.get('last'),dict) else {})
        paths = data.get('paths',{})
        if not isinstance(paths,dict):paths={}
        self._paths = {'input':str(paths.get('input','')), 'output':str(paths.get('output',Path.home()/'Desktop'/'NBS红石投影'))}
        if len(sys.argv)>1 and sys.argv[1].lower().endswith(('.nbs','.mid','.midi')): self._paths['input']=sys.argv[1]
        saved = data.get('profiles',[])
        self._profiles=[]
        for i in range(5):
            p=saved[i] if isinstance(saved,list) and i<len(saved) and isinstance(saved[i],dict) else {}
            name=p.get('name')
            self._profiles.append({'name':name.strip()[:24] if isinstance(name,str) and name.strip() else f'配置 {i+1}',
                'settings':clean({'adaptive':False,**p['settings']}) if isinstance(p.get('settings'),dict) else None})
        self._selected=data.get('selected',0)
        if not isinstance(self._selected,int) or not 0<=self._selected<=5:self._selected=0
        self._appearance=data.get('appearance',{})
        if not isinstance(self._appearance,dict): self._appearance={}
        if self._appearance.get('theme') not in ('light','dark','glass'):self._appearance['theme']='glass'
        if self._appearance.get('font_size') not in (90,100,110,120,130):self._appearance['font_size']=100
        self._native_theme=None;self._native_acrylic=False;self._maximized=False
        self._worker=None; self._thread=None; self._stop_file=None
        self._allow_close=False; self._close_requested=False
        self._cancel=threading.Event(); self._finish=threading.Event()
        self._events=deque(maxlen=2000); self._sequence=0
        self._state={'phase':'idle','running':False,'attempts':0,'elapsed':0,'best':None,'lanes':[],
            'notes':0,'onsets':0,'message':'准备好下一段旋律。','report':None}
        self._preview=None; self._preview_layers={}; self._report=None

    def _persist(self):
        write_settings(self._settings_file,dict(version=2, profiles=self._profiles,selected=self._selected,
            last=self._values,paths=self._paths,appearance=self._appearance))

    def bootstrap(self):
        with self._lock:
            return copy.deepcopy(dict(version=VERSION,values=self._values,paths=self._paths,profiles=self._profiles,
                selected=self._selected,appearance=self._appearance,choices=CHOICES,defaults=DEFAULTS,
                soundHints=SOUND_HINTS,state=self._state,versions=VERSIONS))

    def save_settings(self, values, paths, appearance=None):
        try:
            with self._lock:
                self._values=clean(values,strict=True)
                self._paths={k:str(paths.get(k,'')) for k in ('input','output')}
                if isinstance(appearance,dict):
                    self._appearance={'theme':appearance.get('theme') if appearance.get('theme') in ('light','dark','glass') else 'glass',
                        'motion':appearance.get('motion',True) is not False,
                        'font_size':appearance.get('font_size') if appearance.get('font_size') in (90,100,110,120,130) else 100}
                self._persist()
            return {'ok':True}
        except Exception as error:return {'ok':False,'error':str(error)}

    def profile(self, action, index, values=None, name=None):
        try:
            if not isinstance(index,int) or not 0<=index<=5:raise ValueError('请选择配置槽。')
            with self._lock:
                if action=='load':
                    self._selected=index
                    v=DEFAULTS if index==0 else self._profiles[index-1]['settings']
                    if v is not None:self._values=clean(v)
                elif action=='save' and index:
                    self._values=clean(values,strict=True)
                    self._profiles[index-1]['settings']=self._values.copy()
                    self._selected=index
                elif action=='rename' and index:
                    name=str(name or '').strip()
                    if not 1<=len(name)<=24:raise ValueError('名称需为 1–24 个字。')
                    self._profiles[index-1]['name']=name
                else:raise ValueError('默认配置不可修改，请使用配置槽。')
                self._persist()
                return {'ok':True,'values':self._values.copy(),'profiles':copy.deepcopy(self._profiles),'selected':self._selected}
        except Exception as error:return {'ok':False,'error':str(error)}

    def inspect_song(self, values, paths):
        """Runs off the UI thread; no settings mutations or layout search."""
        try:
            opt=make_options({**clean(values,strict=True),**paths})
            node=BASE/'runtime/node.exe'
            if not node.exists():node=Path('C:/Program Files/nodejs/node.exe')
            result=subprocess.run([str(node),str(BASE/'engine/adaptive.cjs')],input=json.dumps(opt),
                capture_output=True,text=True,encoding='utf-8',timeout=30,
                creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            if result.returncode:raise ValueError(result.stderr.strip() or '文件分析失败')
            return json.loads(result.stdout)
        except subprocess.TimeoutExpired:return {'ok':False,'error':'文件分析超过 30 秒，请检查文件或使用手动配置。'}
        except Exception as error:return {'ok':False,'error':str(error)}

    def pick(self, kind):
        import webview
        if kind=='input':
            result=self._window.create_file_dialog(webview.FileDialog.OPEN,allow_multiple=False,file_types=('音乐文件 (*.nbs;*.mid;*.midi)','MIDI 文件 (*.mid;*.midi)','NBS 文件 (*.nbs)'))
        else:result=self._window.create_file_dialog(webview.FileDialog.FOLDER)
        return str(result[0]) if result else None

    def set_theme(self,theme):
        if theme not in ('light','dark','glass'):return {'ok':False,'error':'未知主题'}
        if self._window and self._native_theme!=theme:
            try:
                from desktop_window import apply_backdrop
                acrylic=apply_backdrop(self._window,theme)
                self._native_theme=theme
                self._native_acrylic=acrylic
                return {'ok':True,'acrylic':acrylic}
            except Exception:return {'ok':True,'acrylic':False}
        return {'ok':True,'acrylic':self._native_acrylic}

    def window_action(self,action):
        if action=='minimize':self._window.minimize()
        elif action=='maximize':
            if self._maximized:self._window.restore()
            else:self._window.maximize()
        elif action=='close':self._window.destroy()
        else:return {'ok':False,'error':'未知窗口操作'}
        return {'ok':True}

    def resize_window(self,edge):
        if not self._maximized:
            from desktop_window import start_resize
            start_resize(self._window,edge)
        return {'ok':True}

    def drag_window(self):
        from desktop_window import start_drag
        start_drag(self._window)
        return {'ok':True}

    def _window_state(self,maximized):
        self._maximized=maximized
        try:self._window.evaluate_js('window.setMaximized && window.setMaximized('+json.dumps(maximized)+')')
        except Exception:pass

    def _event(self, phase, message):
        self._sequence+=1
        self._events.append({'id':self._sequence,'phase':phase,'message':message,'time':time.strftime('%H:%M:%S')})

    def start(self, values, paths):
        with self._lock:
            if self._state['running']:return {'ok':False,'error':'已有转换正在进行。'}
            try:
                v=clean(values,strict=True)
                opt=make_options({**v,**paths})
                self._values=v; self._paths={k:str(paths[k]) for k in ('input','output')}
                self._persist()
                self._cancel.clear();self._finish.clear();self._preview=None;self._preview_layers={};self._report=None
                self._events.clear()
                self._state.update(phase='reading',running=True,attempts=0,elapsed=0,best=None,lanes=[],
                    notes=0,onsets=0,message='读取音乐，分析可用模板…',report=None)
                self._event('log','开始：'+opt['input'])
                self._started=time.monotonic()
                self._thread=threading.Thread(target=self._run,args=(opt,),daemon=True)
                self._thread.start()
                return {'ok':True}
            except Exception as error:return {'ok':False,'error':str(error)}

    def _run(self,opt):
        config=None;code=1
        try:
            fd,stop=tempfile.mkstemp(suffix='.redstone-stop');os.close(fd);Path(stop).unlink()
            with self._lock:
                self._stop_file=stop
                if self._finish.is_set():Path(stop).write_text('export',encoding='ascii')
            opt['stopFile']=stop
            with tempfile.NamedTemporaryFile(mode='w',suffix='.json',encoding='utf-8',delete=False) as f:
                json.dump(opt,f,ensure_ascii=False);config=f.name
            node=BASE/'runtime/node.exe'
            if not node.exists():node=Path('C:/Program Files/nodejs/node.exe')
            self._worker=subprocess.Popen([str(node),str(BASE/'engine/cli.cjs'),config],stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            if self._cancel.is_set():self._kill()
            for line in self._worker.stdout:
                try:
                    event=json.loads(line)
                    if not isinstance(event,dict):raise ValueError()
                    self._consume(event)
                except (ValueError,KeyError,TypeError) as error:
                    with self._lock:self._event('log',line.strip())
            code=self._worker.wait()
        except Exception as error:
            with self._lock:self._state.update(phase='error',message=str(error));self._event('error',str(error))
        finally:
            if config:Path(config).unlink(missing_ok=True)
            with self._lock:
                if self._stop_file:Path(self._stop_file).unlink(missing_ok=True)
                self._worker=None;self._stop_file=None
                self._state['running']=False
                self._state['wallElapsed']=time.monotonic()-self._started
                if self._cancel.is_set():self._state.update(phase='cancelled',message='已取消，可以调整设置后重新开始。');self._event('log','转换已取消。')
                elif code and self._state['phase']!='error':self._state.update(phase='error',message=f'进程退出，代码 {code}');self._event('error',self._state['message'])
                elif not self._state['report'] and self._state['phase']!='error':self._state.update(phase='error',message='转换结束，但没有返回投影文件。')

    def _consume(self,event):
        phase=event.get('phase')
        with self._lock:
            s=self._state
            if phase=='parsed':
                s.update(notes=event['notes'],onsets=event['events'],phase='searching',message='分析完成，正在寻找更好的布局…')
                self._event('log',f"已读取 {event['notes']:,} 个音符 · {event['events']:,} 个时序单元")
                for w in event.get('warnings',[]):self._event('warning',w)
            elif phase=='portfolio-progress':
                s['attempts']=max(s['attempts'],int(event.get('attempts',0)))
                s['elapsed']=max(s['elapsed'],float(event.get('elapsed',0)))
                score=event.get('bestMaterialUnits') if event.get('objective')=='materials' else event.get('bestVolume')
                dims=event.get('dimensionsXZY')
                if score is not None and dims and (s['best'] is None or score<=s['best']['score']):
                    s['best']={'dimensions':dims,'score':score,'unit':'件材料' if event.get('objective')=='materials' else '格³'}
                if not self._finish.is_set() and not self._cancel.is_set():s.update(phase='searching',message='多模板并行搜索 · 当前最优方案自动保存')
            elif phase=='portfolio-start':
                label=LANES.get(event.get('lane'),event.get('lane','搜索'))
                if label not in s['lanes']:s['lanes'].append(label)
                self._event('log','已启动：'+label)
            elif phase=='reuse-analysis':
                ratio=event.get('ratio');msg=event.get('reason','本次不启用')
                self._event('log',(f'重复度分析 · 预计可省 {ratio:.1%} 的音符；' if ratio is not None else '乐句复用 · ')+msg)
            elif phase=='pipeline-best':
                self._event('best','找到更优布局：'+' × '.join(map(str,event['dimensionsXZY'])))
            elif phase=='done':
                r=event['report'];self._report=r
                summary={key:r[key] for key in ('folder','schematic','dimensions','notes','volume','totalBlocks','blocks','durationSeconds','template') if key in r}
                s.update(phase='done',report=summary,message='转换完成，投影已导出。')
                d=r['dimensions'];s['best']={'dimensions':[d['x'],d['z'],d['y']],'score':r.get('materialOptimization',{}).get('units',r['volume']),'unit':'件材料' if r.get('materialOptimization') else '格³'}
                self._event('success','已输出：'+r['schematic'])
                self._event('log','本次生成已完成；静态检查不能替代整曲实机演奏验证。')
                if r.get('externalStart'):self._event('log','外部启动线已包含，不计入主体体积；总入口需 1 红石刻脉冲，勿接普通按钮长脉冲。')
                elif r.get('toxic'):self._event('log','已包含启动按钮与跟随控制；保留原朝向、命令方块 NBT，建议旁观模式。')
                else:self._event('log',f"{len(r.get('inputs',[]))} 个绿色玻璃同步入口，需自行连接外部启动线。")
                if r.get('containers'):self._event('warning',f"有漏斗装填要求；启动后至少等 {r['safeRestartAfterTicks']/10:.1f} 秒再重播，见输出说明。")
            elif phase in ('error','log'):
                self._event(phase,str(event.get('message','')))
                if phase=='error':s.update(phase='error',message=event.get('message','转换失败'))

    def poll(self, after=0):
        with self._lock:
            state=copy.deepcopy(self._state)
            if state['running']:state['wallElapsed']=time.monotonic()-self._started
            return {'state':state,'events':[dict(e) for e in self._events if e['id']>after],'cursor':self._sequence}

    def finish(self):
        with self._lock:
            if not self._state['running']:return {'ok':False,'error':'当前没有正在进行的搜索。'}
            if self._state['best'] is None:return {'ok':False,'error':'还没有找到有效方案，请等待首个方案后再导出。'}
            self._finish.set()
            if self._stop_file:Path(self._stop_file).write_text('export',encoding='ascii')
            self._state.update(phase='exporting',message='正在结束搜索并导出当前最优方案…')
            return {'ok':True}

    def cancel(self):
        with self._lock:
            if self._state['running']:
                self._cancel.set();self._state.update(phase='cancelling',message='正在取消转换…')
                threading.Thread(target=self._kill,daemon=True).start()
        return {'ok':True}

    def _kill(self):
        worker=self._worker
        if worker and worker.poll() is None:
            try:subprocess.run(['taskkill','/PID',str(worker.pid),'/T','/F'],capture_output=True,timeout=8,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            except (OSError,subprocess.TimeoutExpired):
                if worker.poll() is None:worker.terminate()

    def preview_layer(self, layer):
        with self._lock:report=self._state['report']
        if not report:return None
        if self._preview is None:
            data=json.loads((Path(report['folder'])/'层预览.json').read_text('utf-8'))
            grouped={}
            for b in data.pop('blocks',[]):grouped.setdefault(int(b[1]),[]).append(b)
            self._preview_layers=grouped;self._preview=data
        y=max(0,min(int(layer),self._preview['size'][1]-1))
        return {**self._preview,'layer':y,'blocks':self._preview_layers.get(y,[])}

    def open_output(self):
        r=self._state['report'];path=Path(r['folder'] if r else self._paths['output'])
        if not path.is_dir():return {'ok':False,'error':'输出文件夹尚未生成。'}
        os.startfile(str(path));return {'ok':True}

    def _close(self):
        if self._allow_close:return True
        if self._close_requested:return False
        if self._state['running']:
            if not self._window.create_confirmation_dialog('结束转换？','还有转换正在进行。关闭窗口将取消计算；已保存的搜索缓存会保留。'):return False
        self._close_requested=True
        # The WinForms closing event is on the UI thread. Flush/kill off-thread
        # so evaluating JavaScript or waiting on child processes cannot deadlock it.
        threading.Thread(target=self._shutdown,daemon=True).start()
        return False

    def _shutdown(self):
        # Flush the most recent edit even if the 220 ms autosave hasn't fired.
        try:
            snapshot=self._window.evaluate_js('''initialized ? ({
                values: {...values, ...Object.fromEntries([...document.querySelectorAll('[data-setting]')]
                    .map(el => [el.dataset.setting, el.type === 'checkbox' ? el.checked : el.value]))},
                paths: {input: document.querySelector('#inputPath').value, output: document.querySelector('#outputPath').value},
                appearance
            }) : null''')
            if isinstance(snapshot,dict):self.save_settings(snapshot['values'],snapshot['paths'],snapshot.get('appearance'))
        except Exception:pass
        self.cancel()
        if self._thread:self._thread.join(timeout=10)
        try:
            with self._lock:self._persist()
        finally:
            self._allow_close=True
            self._window.destroy()


def main():
    import webview
    from desktop_window import app_identity,configure_shell
    app_identity()
    api=DesktopAPI()
    window=webview.create_window(f'音符工坊 · Note Redstone Studio {VERSION}',str(BASE/'desktop/index.html'),js_api=api,
        width=1320,height=920,min_size=(900,680),background_color='#e5edf6',text_select=True,
        frameless=True,easy_drag=False,transparent=True)
    api._window=window
    window.events.before_show+=lambda:configure_shell(window)
    window.events.closing+=api._close
    window.events.maximized+=lambda:api._window_state(True)
    window.events.restored+=lambda:api._window_state(False)
    webview.start(gui='edgechromium',debug='--debug-ui' in sys.argv,private_mode=True,icon=str(BASE/'desktop/studio.ico'))


if __name__=='__main__':main()
