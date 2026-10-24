package com.atemukesu.extendednoteblock.util;

import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.world.phys.Vec3;

public class ClientSmoothMoveManager {

    private static Vec3 targetPos = null;
    private static final double SMOOTHING_FACTOR = 0.55;

    // 回放状态缓存（null表示未检测）
    private static Boolean isReplayActive = null;
    private static long lastReplayCheckTime = 0;
    private static final long REPLAY_CHECK_INTERVAL_MS = 1000; // 1秒

    public static void init() {
        ClientTickEvents.END_CLIENT_TICK.register(ClientSmoothMoveManager::tick);
    }

    // 反射检测
    private static boolean isInReplay() {
        try {
            Class<?> replayModClass = Class.forName("com.replaymod.replay.ReplayModReplay");
            Object instance = replayModClass.getField("instance").get(null);
            if (instance == null) return false;
            java.lang.reflect.Method getReplayHandler = replayModClass.getMethod("getReplayHandler");
            return getReplayHandler.invoke(instance) != null;
        } catch (Exception e) {
            return false;
        }
    }

    // 刷新回放状态（仅在移动活跃时调用）
    private static void refreshReplayStatus() {
        long now = System.currentTimeMillis();
        if (now - lastReplayCheckTime >= REPLAY_CHECK_INTERVAL_MS) {
            isReplayActive = isInReplay();
            lastReplayCheckTime = now;
        }
    }

    public static void updateMove(Vec3 position, boolean isStop) {
        Minecraft client = Minecraft.getInstance();
        if (client.player == null) return;

        // 1. 处理停止包：结束移动，但不清除缓存（保留状态）
        if (isStop) {
            targetPos = null;
            // 如果当前处于回放中，就不拉回玩家
            if (isReplayActive != null && isReplayActive) {
                return; // 不执行 setPosition
            }
            // 不在回放中，正常拉回
            if (position != null) {
                client.player.setPos(position);
                client.player.setDeltaMovement(Vec3.ZERO);
            }
            return;
        }

        // 2. 处理移动包：先确保状态已检测
        //    首次收到移动包时立即检测
        if (isReplayActive == null) {
            isReplayActive = isInReplay();
            lastReplayCheckTime = System.currentTimeMillis();
        }

        // 如果处于回放中，忽略所有位置包（包括后续的移动包和停止包）
        if (isReplayActive) {
            return;
        }

        // 3. 正常平滑逻辑（不在回放中）
        if (position == null) return;

        if (targetPos == null || position.distanceToSqr(client.player.position()) > 100) {
            client.player.setPos(position);
        }
        targetPos = position;
    }

    // 客户端的 Tick 循环（每帧执行）
    private static void tick(Minecraft client) {
        if (client.player == null) return;

        // 只有存在移动目标时，才定期刷新回放状态
        if (targetPos != null) {
            refreshReplayStatus();
            // 如果刷新后发现进入了回放，立即停止后续的平滑移动
            if (isReplayActive != null && isReplayActive) {
                targetPos = null; // 放弃当前的平滑移动
                return;
            }
        }

        // 执行平滑插值（原逻辑）
        if (targetPos == null) return;

        Vec3 currentPos = client.player.position();
        if (currentPos.distanceToSqr(targetPos) < 0.0001) {
            client.player.setPos(targetPos);
            return;
        }

        Vec3 newPos = currentPos.lerp(targetPos, SMOOTHING_FACTOR);
        client.player.setPos(newPos);
        client.player.setDeltaMovement(Vec3.ZERO);
    }
}
