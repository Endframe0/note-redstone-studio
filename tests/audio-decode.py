"""Actual codec tests in the optional audio venv; synthetic sounds only."""
from pathlib import Path
import sys,tempfile,wave,math,struct,subprocess,hashlib
import imageio_ffmpeg
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'engine'))
from audio_decode import load_source_audio
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
with tempfile.TemporaryDirectory(prefix='音频测试-') as temporary:
    root=Path(temporary);wav=root/'中文 空格.wav'
    with wave.open(str(wav),'wb') as stream:
        stream.setnchannels(1);stream.setsampwidth(2);stream.setframerate(22050)
        stream.writeframes(b''.join(struct.pack('<h',int(8000*math.sin(2*math.pi*440*i/22050))) for i in range(22050)))
    signal=load_source_audio(wav);assert signal.shape==(1,16000)
    for name,options in [('真实 MP3.mp3',['-c:a','libmp3lame']),('扩展名错误.mp3',['-c:a','aac','-f','mp4'])]:
        file=root/name
        subprocess.run([ffmpeg,'-v','error','-y','-i',str(wav),*options,str(file)],check=True)
        before=hashlib.sha256(file.read_bytes()).digest();decoded=load_source_audio(file)
        assert .9<decoded.shape[-1]/16000<1.2 and float(decoded.square().mean())>.001
        assert hashlib.sha256(file.read_bytes()).digest()==before
    video=root/'只有视频.mp3'
    subprocess.run([ffmpeg,'-v','error','-y','-f','lavfi','-i','color=size=16x16:duration=0.1','-an','-c:v','mpeg4','-f','mp4',str(video)],check=True)
    try:load_source_audio(video);raise AssertionError('video-only file accepted')
    except ValueError as error:assert '没有可读取的音轨' in str(error)
    try:load_source_audio(root/'不存在.mp3');raise AssertionError('missing file accepted')
    except ValueError as error:assert '不存在' in str(error)
print('PASS audio decoding: Unicode WAV/MP3, AAC-in-MP4 with wrong extension, video-only and missing-file errors, original file preserved')
