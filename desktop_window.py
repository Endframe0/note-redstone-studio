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
        install_resize_frame(window, hwnd)
        user.SetWindowLongW(hwnd,-16,style|0x00020000|0x00010000|0x00080000|0x00040000)
        if not window.focus:
            user.SetWindowLongW(hwnd,-20,user.GetWindowLongW(hwnd,-20)|0x08000000)
        # Refresh non-client capabilities without moving, showing or activating.
        user.SetWindowPos(hwnd,None,0,0,0,0,0x0020|0x0001|0x0002|0x0004|0x0010)
    if window.native.InvokeRequired:window.native.Invoke(Action(apply))
    else:apply()


def install_resize_frame(window, hwnd):
    """Keep a native sizing frame while painting the complete client area ourselves."""
    if getattr(window, '_resize_proc', None):return
    user=ctypes.windll.user32
    comctl=ctypes.windll.comctl32
    proc_type=ctypes.WINFUNCTYPE(ctypes.c_ssize_t,wintypes.HWND,wintypes.UINT,
                              wintypes.WPARAM,wintypes.LPARAM,ctypes.c_size_t,ctypes.c_size_t)
    comctl.DefSubclassProc.argtypes=[wintypes.HWND,wintypes.UINT,wintypes.WPARAM,wintypes.LPARAM]
    comctl.DefSubclassProc.restype=ctypes.c_ssize_t
    comctl.SetWindowSubclass.argtypes=[wintypes.HWND,proc_type,ctypes.c_size_t,ctypes.c_size_t]
    comctl.SetWindowSubclass.restype=wintypes.BOOL
    user.GetWindowRect.argtypes=[wintypes.HWND,ctypes.POINTER(wintypes.RECT)]
    user.IsZoomed.argtypes=[wintypes.HWND]
    def native_proc(handle,message,wparam,lparam,subclass_id,data):
        if message==0x83 and wparam:return 0 # WM_NCCALCSIZE: no OS caption/border painting
        if message==0x84 and not user.IsZoomed(handle):
            rect=wintypes.RECT();user.GetWindowRect(handle,ctypes.byref(rect))
            x=ctypes.c_short(lparam&0xffff).value;y=ctypes.c_short((lparam>>16)&0xffff).value
            margin=max(6,round(6*window.native.DeviceDpi/96))
            left=x<rect.left+margin;right=x>=rect.right-margin
            top=y<rect.top+margin;bottom=y>=rect.bottom-margin
            if left:return 13 if top else 16 if bottom else 10
            if right:return 14 if top else 17 if bottom else 11
            if top:return 12
            if bottom:return 15
        return comctl.DefSubclassProc(handle,message,wparam,lparam)
    window._resize_proc=proc_type(native_proc) # callback must outlive the native window
    if not comctl.SetWindowSubclass(hwnd,window._resize_proc,1,0):
        window._resize_proc=None
        raise ctypes.WinError()


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
        user.GetAsyncKeyState.argtypes=[ctypes.c_int]
        user.GetAsyncKeyState.restype=ctypes.c_short
        if not user.GetAsyncKeyState(0x01)&0x8000:return
        point=wintypes.POINT();user.GetCursorPos(ctypes.byref(point))
        position=(point.x&0xffff)|((point.y&0xffff)<<16)
        user.SendMessageW.argtypes=[wintypes.HWND,wintypes.UINT,wintypes.WPARAM,wintypes.LPARAM]
        user.ReleaseCapture()
        user.SendMessageW(hwnd,0xA1,hit,position) # WM_NCLBUTTONDOWN, OS interactive sizing
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
