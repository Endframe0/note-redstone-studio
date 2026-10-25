"""Verified Beat This checkpoint cache and native Windows certificate handling."""
import hashlib
import os
from pathlib import Path
import shutil
import ssl
import sys
import urllib.request

URL='https://cloud.cp.jku.at/public.php/dav/files/7ik4RrBKTS273gp/final0.ckpt'
SIZE=81058141
SHA256='8c328b45f59d8dd3dff219253ff6a8d6482be57d0133a29140e2febbf8eb8331'

def configure_tls():
    # This is the isolated audio application entry point, not a shared library.
    # Schannel builds a current chain instead of selecting an expired cached
    # cross-sign from Python/OpenSSL's snapshot of the Windows CA stores.
    if sys.platform=='win32':
        import truststore
        truststore.inject_into_ssl()
        return 'windows-native'
    return 'python-default'

def digest(path):
    value=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for data in iter(lambda:stream.read(1024*1024),b''):value.update(data)
    return value.hexdigest()

def valid(path):
    path=Path(path)
    return path.is_file() and path.stat().st_size==SIZE and digest(path)==SHA256

def ensure_checkpoint(home,bundled=None,notify=lambda message:None):
    dest=Path(home)/'models/torch/hub/checkpoints/beat_this-final0.ckpt'
    dest.parent.mkdir(parents=True,exist_ok=True)
    if valid(dest):return dest
    temporary=dest.with_name(dest.name+f'.part-{os.getpid()}')
    try:
        if bundled and Path(bundled).is_file():
            if not valid(bundled):raise ValueError('随包节拍模型校验失败，请重新解压或下载软件包。')
            notify('复制并校验本地 Beat This 节拍模型…')
            shutil.copyfile(bundled,temporary)
        else:
            notify('下载 Beat This 节拍模型（约 81 MB），使用系统证书校验…')
            request=urllib.request.Request(URL,headers={'User-Agent':'NoteRedstoneStudio/2.12.1'})
            context=ssl.create_default_context()
            if not context.check_hostname or context.verify_mode!=ssl.CERT_REQUIRED:raise RuntimeError('HTTPS 证书校验未启用。')
            with urllib.request.urlopen(request,timeout=30,context=context) as response,temporary.open('wb') as stream:
                total=0
                while chunk:=response.read(256*1024):
                    total+=len(chunk)
                    if total>SIZE:raise ValueError('节拍模型响应大小异常。')
                    stream.write(chunk)
        if not valid(temporary):raise ValueError('节拍模型下载不完整或 SHA-256 不匹配。')
        os.replace(temporary,dest)
        return dest
    finally:temporary.unlink(missing_ok=True)
