"""Unicode-safe audio reading; FFmpeg handles actual containers and codecs."""
from pathlib import Path
import subprocess

def load_source_audio(source,notify=lambda message:None):
    import numpy as np
    import torch
    import soundfile as sf
    from muscriptor.utils.audio import resample
    path=Path(source).expanduser().resolve()
    if not path.is_file():raise ValueError('音频文件不存在或不是普通文件：'+str(path))
    with path.open('rb') as stream:container=stream.read(12)
    try:
        if container[4:8]==b'ftyp':raise ValueError('MP4/M4A container needs FFmpeg')
        # File handles avoid libsndfile's inconsistent Windows Unicode paths.
        with path.open('rb') as stream:data,rate=sf.read(stream,dtype='float32',always_2d=True)
        wave=torch.from_numpy(np.ascontiguousarray(data.T)).mean(dim=0,keepdim=True)
        return resample(wave,rate,16000) if rate!=16000 else wave
    except (sf.LibsndfileError,ValueError,RuntimeError) as error:
        notify('直接解码未成功，使用 FFmpeg 按实际媒体格式读取音轨…')
    import imageio_ffmpeg
    executable=imageio_ffmpeg.get_ffmpeg_exe()
    result=subprocess.run([executable,'-v','error','-nostdin','-i',str(path),'-map','0:a:0','-vn',
        '-t','3600.05','-ac','1','-ar','16000','-f','f32le','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,
        creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if result.returncode:
        message=result.stderr.decode('utf-8',errors='replace').strip()
        if 'matches no streams' in message or 'does not contain any stream' in message:
            raise ValueError('文件中没有可读取的音轨。请选音频文件或含音轨的媒体文件；仅修改扩展名不能补出声音。')
        raise ValueError('无法解码音轨：'+message[-900:])
    if not result.stdout or len(result.stdout)%4:raise ValueError('媒体文件未解码出有效音频采样。')
    return torch.from_numpy(np.frombuffer(result.stdout,dtype='<f4').copy()).unsqueeze(0)
