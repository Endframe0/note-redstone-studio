# 开发与构建

主程序：Python 3.12 + Node.js 22 或更新版本；Windows 桌面界面需要 WebView2。

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python desktop_app.py
```

源码启动时请将 Node 安装到默认的 `C:\Program Files\nodejs`，或把 `node.exe` 放进项目 `runtime/`。命令行引擎只需要 Node：

```powershell
node engine/cli.cjs your-config.json
```

配置字段示例见 `config.example.json`，将 input 改为自己的 NBS 路径。仓库不附带歌曲。

## 打包桌面程序

1. 下载对应 Release，完整解压。从其中的 `_internal/runtime` 复制运行时到项目 `runtime/`，保留 Node、GPU/NVRTC 及许可证文件。
2. 把发行包的 `配套模组` 复制到项目 `companion/配套模组`。这些二进制依赖不进入 Git 历史。
3. 激活虚拟环境，确认 `python` 和 `node` 在 PATH，执行 `powershell -ExecutionPolicy Bypass -File build.ps1`。

`-RebuildGpu` 可重新编译 Python GPU 辅助进程；CUDA 核心在 `engine/gpu-kernel.cu`。NVRTC 运行库按 NVIDIA 自身许可分发，主项目许可证不覆盖它。

## 引擎回归

测试在运行时创建极短的合成音符数据，不从仓库分发 NBS 歌曲。

```powershell
node tests/versions.cjs
python tests/versions-readback.py
node tests/versions-enb.cjs
```

这些检查覆盖序列化、目标版本、时序与 ENB 字段；不代替 Minecraft 实机试听。

## ENB 移植与兼容补丁

`mods/extended-note-block` 基于 Atemukesu 的 MIT 项目，保留上游代码与许可；本项目增加高版本适配、原版音色标记、力度和一次性声音兼容。

使用 JDK 25，在该目录运行，例如：

```powershell
.\gradlew.bat '-PmcVersion=26.3' '-Pmod_version=1.9.1+mc26.3-port.1' build
```

将两个参数中的版本一起换为 26.1、26.1.1、26.1.2、26.2 或 26.3。配套主项目源码中的构建适配用于这些版本；旧的上游版本目录作为来源保留，不是推荐构建入口。

`mods/enb-nbs-compat` 是官方 ENB 1.20.1 / 1.21.1 的小型兼容补丁。先按上文放好 `companion/配套模组`，再运行：

```powershell
.\gradlew.bat '-PmcVersion=1.20.1' build
.\gradlew.bat '-PmcVersion=1.21.1' build
```

客户端和服务端都需要相同组合。此补丁不能代替官方 ENB。
