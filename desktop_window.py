"""Native effects for this application's own WinForms window only."""
import ctypes
import os
from ctypes import wintypes


def app_identity():
    if os.name=='nt':
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID('NBS.RedstoneStudio.Desktop')


def configure_shell(window):
    """Retain shell minimize/maximize commands without a native caption bar.

    WinForms FormBorderStyle.None strips these flags. Explorer then treats the
    taskbar button as activation-only, even though our HTML minimize works.
    """
    if os.name!='nt' or window.native is None:return
    from System import Action
    def apply():
        hwnd=int(window.native.Handle.ToInt64())
        user=ctypes.windll.user32
        user.GetWindowLongW.argtypes=[wintypes.HWND,ctypes.c_int]
        user.GetWindowLongW.restype=wintypes.LONG
        user.SetWindowLongW.argtypes=[wintypes.HWND,ctypes.c_int,wintypes.LONG]
        user.SetWindowLongW.restype=wintypes.LONG
        user.SetWindowPos.argtypes=[wintypes.HWND,wintypes.HWND,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_int,wintypes.UINT]
        style=user.GetWindowLongW(hwnd,-16)
        user.SetWindowLongW(hwnd,-16,style|0x00020000|0x00010000|0x00080000)
        if not window.focus:
            user.SetWindowLongW(hwnd,-20,user.GetWindowLongW(hwnd,-20)|0x08000000)
        # Refresh non-client capabilities without moving, showing or activating.
        user.SetWindowPos(hwnd,None,0,0,0,0,0x0020|0x0001|0x0002|0x0004|0x0010)
    if window.native.InvokeRequired:window.native.Invoke(Action(apply))
    else:apply()


def apply_backdrop(window,theme):
    if os.name!='nt' or window.native is None:return False
    from System import Action
    from System.Drawing import Color
    result=[]
    def apply():
        form=window.native
        hwnd=int(form.Handle.ToInt64())
        dwm=ctypes.windll.dwmapi
        dwm.DwmSetWindowAttribute.argtypes=[wintypes.HWND,wintypes.DWORD,ctypes.c_void_p,wintypes.DWORD]
        dwm.DwmSetWindowAttribute.restype=ctypes.c_long
        def attr(key,value):
            v=ctypes.c_int(value)
            return dwm.DwmSetWindowAttribute(hwnd,key,ctypes.byref(v),ctypes.sizeof(v))
        class Margins(ctypes.Structure):
            _fields_=[('left',ctypes.c_int),('right',ctypes.c_int),('top',ctypes.c_int),('bottom',ctypes.c_int)]
        dwm.DwmExtendFrameIntoClientArea.argtypes=[wintypes.HWND,ctypes.POINTER(Margins)]
        form.webview.DefaultBackgroundColor=Color.Transparent
        attr(20,1 if theme=='dark' else 0)
        attr(33,2) # DWMWCP_ROUND
        if theme=='glass':
            # Windows 11 build 22621+: DWMSBT_TRANSIENTWINDOW = Desktop Acrylic.
            ok=attr(38,3)==0
            form.BackColor=Color.Black if ok else Color.FromArgb(222,233,246)
            dwm.DwmExtendFrameIntoClientArea(hwnd,ctypes.byref(Margins(*([-1]*4 if ok else [1]*4))))
            result.append(ok)
        else:
            attr(38,1)
            form.BackColor=Color.FromArgb(23,23,25) if theme=='dark' else Color.FromArgb(242,243,244)
            dwm.DwmExtendFrameIntoClientArea(hwnd,ctypes.byref(Margins(1,1,1,1)))
            result.append(False)
        # WinForms updates its window styles while changing the backdrop color.
        # Restore shell capabilities after that update, not only before Show().
        configure_shell(window)
    window.native.Invoke(Action(apply))
    return bool(result and result[0])


def start_resize(window,edge):
    hit={'left':10,'right':11,'top':12,'top-left':13,'top-right':14,'bottom':15,'bottom-left':16,'bottom-right':17}.get(edge)
    if hit is None:return
    from System import Action
    def resize():
        hwnd=int(window.native.Handle.ToInt64())
        user=ctypes.windll.user32
        user.SendMessageW.argtypes=[wintypes.HWND,wintypes.UINT,wintypes.WPARAM,wintypes.LPARAM]
        user.ReleaseCapture()
        user.SendMessageW(hwnd,0xA1,hit,0) # WM_NCLBUTTONDOWN, OS interactive sizing
    window.native.BeginInvoke(Action(resize))


def start_drag(window):
    """Hand caption dragging to Windows rather than JS mousemove callbacks."""
    from System import Action
    def drag():
        user=ctypes.windll.user32
        user.GetAsyncKeyState.argtypes=[ctypes.c_int]
        user.GetAsyncKeyState.restype=ctypes.c_short
        # A fast click may already have ended while crossing the JS bridge.
        if not user.GetAsyncKeyState(0x01)&0x8000:return
        point=wintypes.POINT()
        user.GetCursorPos(ctypes.byref(point))
        position=(point.x&0xffff)|((point.y&0xffff)<<16)
        user.SendMessageW.argtypes=[wintypes.HWND,wintypes.UINT,wintypes.WPARAM,wintypes.LPARAM]
        user.ReleaseCapture()
        user.SendMessageW(int(window.native.Handle.ToInt64()),0xA1,2,position)
    window.native.BeginInvoke(Action(drag))
