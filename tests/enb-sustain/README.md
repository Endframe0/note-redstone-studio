# ENB 延音回归

`AudioAudit.java` 是测试专用 Fabric `preLaunch` 入口。它在创建游戏窗口之前运行，并自行退出；不要放进用户游戏的常用 mods 目录或发行包。

使用对应 Minecraft 版本的 Loom client runtime classpath 编译，测试 JAR 的 `fabric.mod.json` 声明 `entrypoints.preLaunch=["enbqa.AudioAudit"]`。运行 `runClient` 时通过 `-Dfabric.addMods=<测试 JAR>` 加载，设置 `-Denb.qa.samples=<UTF-8 文本路径>`。输入文件每行格式为 `名称|本机 OGG 绝对路径`，素材使用本机 Minecraft assets 或 ENB 默认音源包，不随测试分发。

`AudioAudit.java` 需与 `OneShotAudit.java` 一同编译。后者覆盖 20 种乐器的负编号数据包编码、自然/定时模式分流、试听共用播放入口，以及实际注入的 SoundEngine 缓存选择。输入中加入 `guitar`、`bell`、`chime`，分别指向真实游戏吉他、铃铛和 `icechime.ogg` 采样；钢琴应使用当前声音事件对应的 `harp2.ogg`。额外检查音高 42、53、54、66、78、79、90 的自然结束时间。若测试环境还加载 NoteBlock Flat Audio，附加其低音截尾钩子的兼容检查；这不能替代真实游戏触发链验收。

测试会检查实际经过 Mixin 的 SoundEngine、SoundBufferLibrary、SoundBuffer 类，以及 OpenAL Soft 离线回环渲染：循环点、重复使用同一 buffer、3 秒后的可听信号、音量变化、高音、停止后的静音、自然一次性播放结束和 OpenAL 错误。它不打开设备扬声器或窗口，也不等于整曲主观试听。

`FaderAudit.java` 与实际 `ActiveSoundFader.java` 一起编译；`stub/ModMessages.java` 只替换网络发送端，记录包络音量。测试目录必须放在 classpath 首位。检查 1、2、20、80、1200 游戏刻时长、淡入淡出和红石释放时提前结束。桩类绝不能进入正式模组。

port.3 验证：26.1、26.1.1、26.1.2、26.2、26.3 各通过 123 项 OpenAL 检查，包含八种原版音色和钢琴、教堂管风琴、弦乐、小号默认 GM 采样。新增稳态 RMS 检查：按八个基波周期测量幅度，要求最大值 / 最小值小于 1.04；本次十二种采样均小于 1.002。此指标针对持续段，不代表起音、所有第三方音源或整曲主观试听。GM 音源部分采样长于 20 秒，因此自然结束断言按实际 PCM 时长等待，不假定固定 10 秒。

循环处理只应用于按时长播放的 ENB 音符。原版音效、NBS `oneShot=true` 不使用持续采样缓存。缓存在资源重载时释放，停止包发送给原服务器上的玩家，避免离开原区块的客户端漏收停止事件。

底层循环点依据 [AL_SOFT_loop_points 规范](https://github.com/openalext/openalext/blob/master/AL_SOFT_loop_points.txt)。不支持该扩展的非标准 OpenAL 后端会退化为整段循环，可能重复起音。
