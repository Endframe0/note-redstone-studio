package com.atemukesu.extendednoteblock.sound;

import com.atemukesu.extendednoteblock.network.ModMessages;
import com.atemukesu.extendednoteblock.util.CurvePoint;
import java.util.List;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;

/**
 * 负责在服务器端管理一个正在播放的声音的生命周期，包括淡入、持续和淡出。
 * 它计算最终的绝对音量，并直接发送给客户端应用。
 * <p>
 * - sustainTicks: 代表音符播放的总时长。
 * - fadeInTicks: 在总时长的开头部分进行淡入，从音量0平滑过渡到最大音量。
 * - fadeOutTicks: 在总时长的结尾部分进行淡出，从最大音量平滑过渡到0。
 * - Velocity: 用于计算基础的最大音量。
 */
public class ActiveSoundFader {
    private final ServerLevel world;
    private final BlockPos pos;
    private final UUID soundId;
    private final int originalVelocity;
    private final int sustainTicks;
    private final int fadeInTicks;
    private final int fadeOutTicks;
    private final long startedGameTick;

    // ============== Advanced Features v1.4.0 ==============
    private List<CurvePoint> pitchBendPoints;
    private List<CurvePoint> volumePoints;
    private List<Vec3> soundPath;

    private int currentTick = 0;
    private float currentAbsoluteVolume = 0.0f;
    private boolean isFinished = false;

    // 用于处理由外部事件（如红石信号关闭）触发的强制淡出
    private boolean isFadingOutForced = false;
    private int forcedFadeOutStartTick = -1;
    private float volumeOnForcedFadeOut = 1.0f;

    public ActiveSoundFader(ServerLevel world, BlockPos pos, UUID soundId, int velocity,
            int sustainTicks, int fadeInTicks, int fadeOutTicks) {
        this.world = world;
        this.pos = pos;
        this.soundId = soundId;
        this.originalVelocity = velocity;
        this.sustainTicks = Math.max(1, sustainTicks);
        this.fadeInTicks = Math.max(0, fadeInTicks);
        this.fadeOutTicks = Math.max(0, fadeOutTicks);
        this.startedGameTick = world == null ? 0 : world.getGameTime();
        this.currentAbsoluteVolume = fadeInTicks > 0 ? 0 : velocity / 127.0f;
    }

    // ============== Advanced Features Setters v1.4.0 ==============
    public void setPitchBendPoints(List<CurvePoint> points) {
        this.pitchBendPoints = points;
    }

    public void setVolumePoints(List<CurvePoint> points) {
        this.volumePoints = points;
    }

    public void setSoundPath(List<Vec3> path) {
        this.soundPath = path;
    }

    /**
     * 每个游戏刻调用一次，用于更新声音的音量。
     *
     * @return 如果声音的生命周期已结束，则返回 true。
     */
    public boolean tick() {
        if (isFinished)
            return true;
        currentTick = world == null ? currentTick + 1
                : (int)Math.clamp(world.getGameTime() - startedGameTick, 0L, Integer.MAX_VALUE);
        if (currentTick >= sustainTicks || (isFadingOutForced
                && currentTick - forcedFadeOutStartTick >= fadeOutTicks)) {
            isFinished = true;
            return true;
        }

        // 计算当前进度 (0.0 ~ 1.0)
        // 使用 float 确保精度
        float progress = (sustainTicks > 1) ? (float) currentTick / (sustainTicks - 1) : 0.0f;

        // 计算当前状态
        SoundState state = calculateStateAt(progress);
        float volume = state.volume;
        if (isFadingOutForced) {
            float remaining = 1.0f - (float)(currentTick - forcedFadeOutStartTick) / fadeOutTicks;
            volume = Math.min(volume, volumeOnForcedFadeOut * Math.max(0, remaining));
        }
        currentAbsoluteVolume = volume;

        // 发送更新
        ModMessages.sendAdvancedUpdateToClients(world, pos, soundId, volume, state.pitch, state.x, state.y,
                state.z);

        return false;
    }

    // 线性插值辅助方法 - 根据插值计算规范进行改进
    @SuppressWarnings("unused")
    private float interpolate(List<Float> curve, float progress) {
        if (curve.isEmpty())
            return 0;
        if (curve.size() == 1)
            return curve.get(0);

        // 将进度映射到曲线数据点索引
        float floatIdx = progress * (curve.size() - 1);
        int idx = (int) Math.floor(floatIdx);
        float nextProgress = floatIdx - idx;

        // 确保索引不越界
        if (idx >= curve.size() - 1)
            return curve.get(curve.size() - 1);
        if (idx < 0)
            return curve.get(0);

        // 线性插值计算
        float leftValue = curve.get(idx);
        float rightValue = curve.get(idx + 1);
        return leftValue + nextProgress * (rightValue - leftValue);
    }

    public static class SoundState {
        public final float volume;
        public final float pitch;
        public final double x, y, z;

        public SoundState(float v, float p, double x, double y, double z) {
            this.volume = v;
            this.pitch = p;
            this.x = x;
            this.y = y;
            this.z = z;
        }
    }

    public SoundState calculateStateAt(float progress) {
        float baseMaxVolume = originalVelocity / 127.0f;
        float currentVolume = 0.0f;
        float currentPitchMul = 1.0f;

        // 1. 计算音量 (线性插值)
        if (volumePoints != null && !volumePoints.isEmpty()) {
            float curveValue = interpolateValue(volumePoints, progress);
            currentVolume = curveValue * baseMaxVolume;
        } else {
            // [兼容旧逻辑] 淡入淡出计算...
            // 确保没有 volumePoints 时逻辑正确
            float volumeMultiplier = 1.0f;
            float age = progress * Math.max(0, sustainTicks - 1);
            if (fadeInTicks > 0 && age <= fadeInTicks) {
                float fadeInProgress = Math.min(1.0f, age / fadeInTicks);
                volumeMultiplier = Math.min(volumeMultiplier, fadeInProgress);
            }

            // 计算淡出效果
            if (fadeOutTicks > 0 && sustainTicks > 0) {
                float fadeOutStartTick = sustainTicks - fadeOutTicks;
                if (age >= fadeOutStartTick) {
                    float fadeOutProgress = Math.max(0, (sustainTicks - age) / fadeOutTicks);
                    volumeMultiplier = Math.min(volumeMultiplier, fadeOutProgress);
                }
            }
            currentVolume = baseMaxVolume * volumeMultiplier;
        }

        // 2. 计算弯音 (线性插值)
        if (pitchBendPoints != null && !pitchBendPoints.isEmpty()) {
            float semitones = interpolateValue(pitchBendPoints, progress);
            currentPitchMul = (float) Math.pow(2.0, semitones / 12.0);
        }

        // 3. 计算位置 (数组索引映射，因为 soundPath 仍是逐帧生成的)
        // 如果想把 SoundPath 也改成关键点插值，逻辑同上
        double curX = pos.getX() + 0.5;
        double curY = pos.getY() + 0.5;
        double curZ = pos.getZ() + 0.5;

        if (soundPath != null && !soundPath.isEmpty()) {
            int index = Mth.clamp((int) (progress * (soundPath.size() - 1)), 0, soundPath.size() - 1);
            Vec3 offset = soundPath.get(index);
            curX += offset.x;
            curY += offset.y;
            curZ += offset.z;
        }

        return new SoundState(currentVolume, currentPitchMul, curX, curY, curZ);
    }

    /**
     * 核心插值算法：根据时间进度 t，在关键点列表中找到前后两个点进行线性插值
     */
    private float interpolateValue(List<CurvePoint> points, float t) {
        if (points.isEmpty())
            return 0f;

        // 边界处理
        if (t <= points.get(0).time)
            return points.get(0).value;
        if (t >= points.get(points.size() - 1).time)
            return points.get(points.size() - 1).value;

        // 寻找区间
        for (int i = 0; i < points.size() - 1; i++) {
            CurvePoint p1 = points.get(i);
            CurvePoint p2 = points.get(i + 1);

            if (t >= p1.time && t <= p2.time) {
                // 计算局部进度
                float range = p2.time - p1.time;
                if (range <= 0.00001f)
                    return p1.value; // 防止除以0

                float localT = (t - p1.time) / range;
                // Lerp: a + (b - a) * t
                return p1.value + (p2.value - p1.value) * localT;
            }
        }

        return points.get(points.size() - 1).value;
    }

    /**
     * 强制开始淡出过程，通常在音符被外部事件（如红石信号关闭）中断时调用。
     */
    public void startFadeOut() {
        if (!isFadingOutForced) {
            isFadingOutForced = true;
            forcedFadeOutStartTick = world == null ? currentTick
                    : (int)Math.clamp(world.getGameTime() - startedGameTick, 0L, Integer.MAX_VALUE);
            volumeOnForcedFadeOut = this.currentAbsoluteVolume;

            if (fadeOutTicks <= 0) {
                isFinished = true;
            }
        }
    }

    public ServerLevel getWorld() {
        return world;
    }

    public BlockPos getPos() {
        return pos;
    }

    public UUID getSoundId() {
        return soundId;
    }

    public boolean isFinished() {
        return isFinished;
    }
}
