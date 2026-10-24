# 第三方组件、结构与设计来源

主转换器以 **AGPL-3.0-or-later** 发布，完整条款见 LICENSE。配套 ENB 移植和 enb-nbs-compat 使用各目录内的 MIT 许可。第三方组件保留各自许可；主项目的许可不改变它们的授权。

## 结构研究与设计参考

- **omninbs / nbs-fractal**：https://github.com/omninbs/nbs-fractal ，AGPL-3.0-or-later。研究参考版本 c342553f17f62f8de1824e1ad45ee94fe59113f6。Compact、错位节点、重复结构重构等思路影响本项目模板。感谢理论架构作者 kemiamu，以及 madSUNitist、Chen JunFu、Fadeorite 和上游列出的贡献者。未将其网页作为远程转换服务调用。
- **0x4e49434f4c45 / Note Block Assistant**：https://github.com/0x4e49434f4c45/noteblock-assistant ，三轨互嵌、紧凑布局的结构参考。
- **Emil Kowalski / skills**：https://github.com/emilkowalski/skills ，MIT；设计工程原则与交互动效参考，非运行时依赖。
- **Paidax01 / Math Curve Loaders**：https://paidax01.github.io/math-curve-loaders/ ，Rose Four 运动参考；使用 r = a cos(4θ) 的独立 Canvas 实现，来源署名保留在 desktop/rose-four.js。
- **Etho**：https://www.youtube.com/watch?v=bYwzd62cLSw ，漏斗计时器结构研究。
- **Xisuma**：https://www.youtube.com/watch?v=UZnuZ07xlSg ，可平铺计时模块参考。
- **Meat_Mallet**：https://www.planetminecraft.com/project/improved-noteblock-machine/ ，可编程音符机研究。
- **Majiir**：https://www.minecraftforum.net/forums/minecraft-java-edition/redstone-discussion-and/326285-compact-programmable-music-box-proof-of-concept ，存储与发声分离思路研究。
- **palozon**：https://www.reddit.com/r/redstone/comments/lzzesa/ ，堆肥桶编码音乐机研究。
- **SavvyBlonk**：https://www.reddit.com/r/redstone/comments/k7q83k/ ，鼓点循环与短曲压缩研究。

结构参考不等于将上游程序打包运行，也不意味着任意新布局已获得原作者验证。

## 配套模组

- **Atemukesu / Extended Note Block**：https://github.com/atemukesu/ExtendedNoteBlock ，MIT。移植保留上游 LICENSE。低版本官方 JAR 来自 Modrinth，来源、SHA512 与对应目录许可证随下载包保留。
- **FabricMC / Fabric API**：https://github.com/FabricMC/fabric ，Apache-2.0；相应版本 JAR 包含上游许可信息。
- **Frank Asseg / exp4j**：https://github.com/fasseg/exp4j ，Apache-2.0；ENB 的表达式计算依赖，随 ENB 使用上游组件。
- **Quinn-Codes / Quinn's Better Noteblocks**：https://github.com/Quinn-Codes/QuinnsBetterNoteblocks ，可选兼容目标。资源包及数据包不包含在发行包；请从作者渠道获取并遵循作者条款。

## 桌面运行时与工具

- **Roman Sirokov / pywebview 及贡献者**：https://github.com/r0x0r/pywebview ，BSD-3-Clause。
- **Node.js contributors**：https://nodejs.org/ ，Node 及其捆绑组件许可见 runtime/Node-LICENSE.txt。
- **Python Software Foundation**：https://www.python.org/ ，PSF 许可及捆绑组件各自许可。
- **pythonnet contributors**：https://github.com/pythonnet/pythonnet ，MIT。
- **PyInstaller contributors**：https://github.com/pyinstaller/pyinstaller ，GPL-2.0-or-later，并带有生成程序的分发例外。
- **Microsoft WebView2**：https://developer.microsoft.com/microsoft-edge/webview2/ ，按 Microsoft 条款使用的独立运行时。
- **NVIDIA CUDA / NVRTC**：https://developer.nvidia.com/cuda-toolkit ，按 NVIDIA CUDA 条款；相应文本随 runtime/cuda-package 分发。
- **nbtlib contributors**：https://github.com/vberlier/nbtlib ，MIT；用于独立 NBT 回读测试。
- **maruohon、sakura-ryoko、Litematica 与 MaLiLib 贡献者**：投影格式与游戏侧生态参考，不将它们的模组混入配套 ENB 目录。
- **OpenNBS contributors**：https://github.com/OpenNBS/OpenNoteBlockStudio ，NBS 格式与音乐编辑生态。

感谢所有公开研究、文档和反馈的贡献者。音乐及第三方资源的权利归其各自作者。本项目不附带歌曲库。

本软件由 GPT6Astra 制作。
