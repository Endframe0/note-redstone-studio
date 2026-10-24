# ENB 延音回归

`AudioAudit.java` 是测试专用 Fabric `preLaunch` 入口。它在创建游戏窗口之前运行，并自行退出；不要放进用户游戏的常用 mods 目录或发行包。

使用对应 Minecraft 版本的 Loom client runtime classpath 编译，测试 JAR 的 `fabric.mod.json` 声明 `entrypoints.preLaunch=["enbqa.AudioAudit"]`。运行 `runClient` 时通过 `-Dfabric.addMods=<测试 JAR>` 加载，设置 `-Denb.qa.samples=<UTF-8 文本路径>`。输入文件每行格式为 `名称|本机 OGG 绝对路径`，素材使用本机 Minecraft assets 或 ENB 默认音源包，不随测试分发。

测试会检查实际经过 Mixin 的 SoundEngine、SoundBufferLibrary、SoundBuffer 类，以及 OpenAL Soft 离线回环渲染：循环点、重复使用同一 buffer、3 秒后的可听信号、音量变化、高音、停止后的静音、自然一次性播放结束和 OpenAL 错误。它不打开设备扬声器或窗口，也不等于整曲主观试听。

`FaderAudit.java` 与实际 `ActiveSoundFader.java` 一起编译；`stub/ModMessages.java` 只替换网络发送端，记录包络音量。测试目录必须放在 classpath 首位。检查 1、2、20、80、1200 游戏刻时长、淡入淡出和红石释放时提前结束。桩类绝不能进入正式模组。

port.2 验证：26.1、26.1.1、26.1.2、26.2、26.3 各通过 75 项 OpenAL 检查；26.1.2 追加钢琴、教堂管风琴、弦乐、小号默认 GM 采样后共 111 项。GM 音源部分采样长于 20 秒，因此自然结束断言按实际 PCM 时长等待，不假定固定 10 秒。

循环处理只应用于按时长播放的 ENB 音符。原版音效、NBS `oneShot=true` 不使用持续采样缓存。缓存在资源重载时释放，停止包发送给原服务器上的玩家，避免离开原区块的客户端漏收停止事件。

底层循环点依据 [AL_SOFT_loop_points 规范](https://github.com/openalext/openalext/blob/master/AL_SOFT_loop_points.txt)。不支持该扩展的非标准 OpenAL 后端会退化为整段循环，可能重复起音。
