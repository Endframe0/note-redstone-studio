"""Optional NVIDIA CUDA layout search. Only the NVIDIA driver and bundled NVRTC are needed.
JSON-lines protocol; CPU validates every proposed circuit. No network or world access.
"""
import array
import ctypes as C
import json
import os
from pathlib import Path
import queue
import sys
import threading
import time


def emit(value):
    print(json.dumps(value, ensure_ascii=True), flush=True)


class Cuda:
    def __init__(self, dll_dir=None):
        if os.name != 'nt':
            raise RuntimeError('此 GPU 后端仅支持 Windows NVIDIA 显卡')
        root = Path(dll_dir) if dll_dir else Path(__file__).resolve().parents[1] / 'runtime' / 'cuda-package'
        dlls = sorted(p for p in root.rglob('nvrtc64_*.dll') if '.alt.' not in p.name)
        if not dlls:
            raise RuntimeError('缺少 NVRTC 运行库，请使用完整便携包')
        self.dll_handle = os.add_dll_directory(str(dlls[0].parent))
        self.builtins = [C.WinDLL(str(p)) for p in dlls[0].parent.glob('nvrtc-builtins*.dll')]
        self.nvrtc = C.WinDLL(str(dlls[0]))
        nvmajor, nvminor = C.c_int(), C.c_int()
        self.ncall('nvrtcVersion', [C.c_void_p, C.c_void_p], C.byref(nvmajor), C.byref(nvminor))
        arch_count = C.c_int()
        self.ncall('nvrtcGetNumSupportedArchs', [C.c_void_p], C.byref(arch_count))
        supported = (C.c_int * arch_count.value)()
        self.ncall('nvrtcGetSupportedArchs', [C.c_void_p], supported)
        self.driver = C.WinDLL('nvcuda.dll')
        self.functions = {}
        self.call('cuInit', [C.c_uint], 0)
        driver_version = C.c_int()
        self.call('cuDriverGetVersion', [C.c_void_p], C.byref(driver_version))
        # We JIT newly generated PTX; CUDA minor-version binary compatibility
        # alone does not guarantee that an older driver can parse that PTX.
        required_driver_api = nvmajor.value * 1000 + nvminor.value * 10
        if driver_version.value < required_driver_api:
            raise RuntimeError(f'显卡驱动支持 CUDA {driver_version.value // 1000}.{driver_version.value % 1000 // 10}，'
                               f'本包 PTX 编译需要 CUDA {nvmajor.value}.{nvminor.value} 驱动支持；请更新 NVIDIA 驱动')
        device = C.c_int()
        self.call('cuDeviceGet', [C.POINTER(C.c_int), C.c_int], C.byref(device), 0)
        name = C.create_string_buffer(256)
        self.call('cuDeviceGetName', [C.c_void_p, C.c_int, C.c_int], name, 256, device)
        self.name = name.value.decode('utf-8')
        major, minor = C.c_int(), C.c_int()
        self.call('cuDeviceComputeCapability', [C.c_void_p, C.c_void_p, C.c_int], C.byref(major), C.byref(minor), device)
        device_arch = major.value * 10 + minor.value
        available = [a for a in supported if a <= device_arch]
        if not available:
            raise RuntimeError(f'{self.name} 的计算能力为 {major.value}.{minor.value}，'
                               f'本包编译器最低支持 {min(supported) // 10}.{min(supported) % 10}')
        target_arch = max(available)
        self.info = {'device': self.name, 'computeCapability': f'{major.value}.{minor.value}',
                     'nvrtc': f'{nvmajor.value}.{nvminor.value}', 'driverCudaVersion': driver_version.value,
                     'ptxTarget': f'compute_{target_arch}'}
        self.context = C.c_void_p()
        self.call('cuCtxCreate_v2', [C.c_void_p, C.c_uint, C.c_int], C.byref(self.context), 0, device)
        source = (Path(__file__).parent / 'gpu-kernel.cu').read_bytes()
        prog = C.c_void_p()
        self.ncall('nvrtcCreateProgram', [C.c_void_p, C.c_char_p, C.c_char_p, C.c_int, C.c_void_p, C.c_void_p], C.byref(prog), source, b'layout.cu', 0, None, None)
        options = (C.c_char_p * 2)(f'--gpu-architecture=compute_{target_arch}'.encode(), b'--std=c++11')
        try:
            self.ncall('nvrtcCompileProgram', [C.c_void_p, C.c_int, C.c_void_p], prog, 2, options)
        except Exception:
            length = C.c_size_t()
            self.ncall('nvrtcGetProgramLogSize', [C.c_void_p, C.c_void_p], prog, C.byref(length))
            log = C.create_string_buffer(length.value)
            self.ncall('nvrtcGetProgramLog', [C.c_void_p, C.c_void_p], prog, log)
            raise RuntimeError(log.value.decode('utf-8', 'replace'))
        length = C.c_size_t()
        self.ncall('nvrtcGetPTXSize', [C.c_void_p, C.c_void_p], prog, C.byref(length))
        ptx = C.create_string_buffer(length.value)
        self.ncall('nvrtcGetPTX', [C.c_void_p, C.c_void_p], prog, ptx)
        self.ncall('nvrtcDestroyProgram', [C.c_void_p], C.byref(prog))
        self.module, self.kernel = C.c_void_p(), C.c_void_p()
        self.call('cuModuleLoadData', [C.c_void_p, C.c_void_p], C.byref(self.module), ptx)
        self.call('cuModuleGetFunction', [C.c_void_p, C.c_void_p, C.c_char_p], C.byref(self.kernel), self.module, b'measure')
        self.buffers = {}

    def invoke(self, lib, name, types, args):
        fn = getattr(lib, name)
        fn.argtypes = types
        fn.restype = C.c_int
        code = fn(*args)
        if code:
            raise RuntimeError(f'{name} failed ({code})')

    def call(self, name, types, *args):
        return self.invoke(self.driver, name, types, args)

    def ncall(self, name, types, *args):
        return self.invoke(self.nvrtc, name, types, args)

    def alloc(self, name, size):
        prev = self.buffers.get(name)
        if not prev or prev[1] < size:
            if prev:
                self.call('cuMemFree_v2', [C.c_uint64], prev[0])
            ptr = C.c_uint64()
            self.call('cuMemAlloc_v2', [C.c_void_p, C.c_size_t], C.byref(ptr), size)
            self.buffers[name] = (ptr.value, size)
        return self.buffers[name][0]

    def upload(self, name, values):
        data = array.array('i', values).tobytes()
        ptr = self.alloc(name, len(data))
        self.call('cuMemcpyHtoD_v2', [C.c_uint64, C.c_void_p, C.c_size_t], ptr, data, len(data))
        return ptr

    def download(self, ptr, count):
        buf = (C.c_int * count)()
        self.call('cuMemcpyDtoH_v2', [C.c_void_p, C.c_uint64, C.c_size_t], buf, ptr, count * 4)
        return list(buf)

    def measure(self, music, parents, batch=4096, seed=1, mutate=True):
        stride = max(len(p['counts']) for p in parents)
        packed = []
        for p in parents:
            R = len(p['counts'])
            shifts = p.get('rowShifts') or [0]*R
            packed.extend([p['cap'], p['rows'], R, int(p.get('branchMode') == 'direct')+2*int(p.get('buttonMode')=='external')])
            packed.extend(p['counts'] + [0]*(stride-R))
            packed.extend(shifts + [0]*(stride-len(shifts)))
        mp = self.upload('music', music)
        pp = self.upload('parents', packed)
        out = self.alloc('out', batch*8*4)
        counts = self.alloc('counts', batch*stride*4)
        shifts = self.alloc('shifts', batch*stride*4)
        scratch = self.alloc('scratch', batch*stride*8)
        args = [C.c_uint64(mp), C.c_int(len(music)//4), C.c_uint64(pp), C.c_int(len(parents)), C.c_int(stride), C.c_int(batch), C.c_uint(seed), C.c_int(mutate), C.c_uint64(out), C.c_uint64(counts), C.c_uint64(shifts), C.c_uint64(scratch)]
        pointers = (C.c_void_p*len(args))(*[C.cast(C.pointer(x), C.c_void_p).value for x in args])
        self.call('cuLaunchKernel', [C.c_void_p, C.c_uint, C.c_uint, C.c_uint, C.c_uint, C.c_uint, C.c_uint, C.c_uint, C.c_void_p, C.c_void_p, C.c_void_p], self.kernel, (batch+127)//128, 1, 1, 128, 1, 1, 0, None, pointers, None)
        self.call('cuCtxSynchronize', [])
        values = self.download(out, batch*8)
        return [values[i:i+8] for i in range(0,len(values),8)], counts, shifts, stride


def run():
    first = sys.stdin.readline()
    if not first:
        return
    init = json.loads(first)
    cuda = Cuda(sys.argv[sys.argv.index('--cuda-dir')+1] if '--cuda-dir' in sys.argv else None)
    if init.get('type') == 'probe':
        emit({'type':'ready',**cuda.info})
        return
    song, opt = init['song'], init.get('opt', {})
    music = []
    for e in song['events']:
        music.extend([e['tick'],len(e['notes']),sum(n['instrument']==3 for n in e['notes']),0])
    pool, seen = [], set()

    def add(p):
        if not p.get('counts') or len(p['counts']) > 2048 or p.get('spacing',2)!=2:
            return
        cap, rows, counts = p.get('cap'), p.get('rows'), p['counts']
        if not isinstance(cap,int) or not 1<=cap<=170 or not isinstance(rows,int) or not 1<=rows<=60:
            return
        if any(not isinstance(c,int) or not 1<=c<=cap for c in counts) or sum(counts)!=len(song['events']):
            return
        shifts = p.get('rowShifts') or [0]*len(counts)
        if len(shifts)!=len(counts) or any(not isinstance(s,int) or not 0<=s<=cap-c for s,c in zip(shifts,counts)):
            return
        cut=0
        for c in counts[:-1]:
            cut+=c
            if music[cut*4]-music[(cut-1)*4]<2: return
        p = dict(p, buttonMode='external' if opt.get('externalInputs') else 'buffered', spacing=2)
        key = json.dumps(p, sort_keys=True)
        if key not in seen:
            seen.add(key)
            pool.append(p)
            if len(pool)>64: pool.pop(0)
            if len(seen)>10000: seen.clear()
    for p in init.get('seeds',[]):
        for mode in ['direct','delayed']: add(dict(p,branchMode=mode))
    incoming = queue.Queue()
    def reader():
        try:
            for line in sys.stdin: incoming.put(json.loads(line))
        finally: incoming.put({'type':'stop'})
    threading.Thread(target=reader,daemon=True).start()
    attempts,batches,total_ms,last = 0,0,0,time.monotonic()
    emit({'type':'ready',**cuda.info,'message':f'GPU 已启用：{cuda.name}（计算能力 {cuda.info["computeCapability"]}）；普通几何搜索由 GPU 加速，新模板和电路复核使用 CPU。'})
    batch = int(opt.get('gpuBatch',4096))
    if batch<1 or batch>65536: raise ValueError('gpuBatch must be 1..65536')
    while True:
        while not incoming.empty():
            msg = incoming.get()
            if msg['type']=='stop' and not opt.get('gpuTestAll'): return
            if msg['type']=='elite': add(msg['params'])
        if not pool:
            time.sleep(.05)
            continue
        parents=pool[:]
        start=time.perf_counter()
        output,cp,sp,stride = cuda.measure(music,parents,batch,seed=(batches+1)*7919,mutate=not opt.get('gpuNoMutate',False))
        total_ms+=(time.perf_counter()-start)*1000
        attempts+=batch;batches+=1
        rank=[]
        for i,o in enumerate(output):
            volume,x,y,z,penalty,pi,cap,rows=o
            if volume<=0 or volume>8000000 or x>opt.get('maxX',512) or y>opt.get('maxY',19) or z>opt.get('maxZ',512): continue
            ratio=max(x,z)/min(x,z);limit=opt.get('maxAspect',1.5)
            score=volume*(1+.10*penalty)*((max(1,ratio/limit)**2) if limit else 1)
            spatial=opt.get('maxSpatialAspect',0)
            radius=opt.get('maxListeningRadius',0)
            if spatial: score*=max(1,max(x,y,z)/min(x,y,z)/spatial)**2
            if radius: score*=max(1,(x*x+y*y+z*z)**.5/2/radius)**3
            rank.append((score,i))
        rank.sort()
        selected=rank if opt.get('gpuTestAll') else rank[:32]
        for _,i in selected:
            o=output[i];volume,x,y,z,penalty,pi,cap,rows=o
            p=parents[pi];R=len(p['counts'])
            params=dict(p,counts=cuda.download(cp+i*stride*4,R),rowShifts=cuda.download(sp+i*stride*4,R))
            # Diverse near-best geometry can evolve on GPU; the CPU still audits exports.
            if not opt.get('gpuTestAll') and i%4==0: add(params)
            emit({'type':'candidate','params':params,'volume':volume,'dimensions':[x,y,z],'penalty':penalty})
        if time.monotonic()-last>1 or opt.get('gpuTestAll'):
            last=time.monotonic()
            emit({'type':'stats','device':cuda.name,'attempts':attempts,'batches':batches,'kernelAndTransferMs':total_ms})
        if opt.get('gpuTestAll'): return


if __name__=='__main__':
    try:
        run()
    except Exception as e:
        emit({'type':'error','message':f'GPU 不可用：{e}；CPU 可继续运行。'})
        sys.exit(1)
