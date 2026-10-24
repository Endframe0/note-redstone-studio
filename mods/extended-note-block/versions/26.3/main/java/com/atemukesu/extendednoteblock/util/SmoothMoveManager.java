package com.atemukesu.extendednoteblock.util;

import com.atemukesu.extendednoteblock.network.ModMessages;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

public class SmoothMoveManager {
    private static final List<MoveTask> tasks = new ArrayList<>();

    public static void init() {
        ServerTickEvents.START_SERVER_TICK.register(SmoothMoveManager::tick);
        ServerLifecycleEvents.SERVER_STOPPING.register(server -> {
            tasks.forEach(MoveTask::cleanup);
            tasks.clear();
        });
    }

    public static void startMove(Entity entity, Vec3 velocity, int duration) {
        stopMove(entity);
        tasks.add(new MoveTask(entity, velocity, duration));
    }

    public static void stopMove(Entity entity) {
        boolean removed = tasks.removeIf(t -> {
            if (t.entity != entity) return false;
            t.cleanup();
            return true;
        });
        if (removed && entity instanceof ServerPlayer player) {
            ModMessages.sendSmoothMoveToClient(player, player.position(), true);
        }
    }

    public static boolean isMoving(Entity entity) {
        return tasks.stream().anyMatch(t -> t.entity == entity);
    }

    private static void tick(MinecraftServer server) {
        if (tasks.isEmpty())
            return;

        Iterator<MoveTask> it = tasks.iterator();
        while (it.hasNext()) {
            MoveTask task = it.next();

            // 任务完成检查
            if (task.isFinished()) {
                it.remove();
                task.cleanup(); // Restore noClip
                if (task.entity instanceof ServerPlayer player) {
                    ModMessages.sendSmoothMoveToClient(player, player.position(), true);
                }
                continue;
            }

            // 执行逻辑
            task.tick();

            // 每 Tick 强制同步：覆盖客户端所有的预测/回滚
            if (task.entity instanceof ServerPlayer player) {
                // isStop = false
                ModMessages.sendSmoothMoveToClient(player, task.getTrustedPos(), false);
            }
        }
    }

    private static class MoveTask {
        final Entity entity;
        final Vec3 velocity;
        final int duration;
        final boolean originalNoPhysics;

        Vec3 trustedPos;

        final Vec3 startPos;
        final Vec3 targetPos;

        int ticksPassed;

        MoveTask(Entity entity, Vec3 velocity, int duration) {
            this.entity = entity;
            this.velocity = velocity;
            this.duration = duration;
            this.originalNoPhysics = entity.noPhysics;
            this.ticksPassed = 0;

            // 初始化锚点
            this.startPos = entity.position();
            this.trustedPos = startPos; // 初始信任位置

            if (duration > 0) {
                this.targetPos = startPos.add(velocity.scale(duration));
            } else {
                this.targetPos = null;
            }

            // Enable spectator-like movement
            entity.noPhysics = true;
        }

        void cleanup() {
            entity.noPhysics = originalNoPhysics;
        }

        void tick() {
            if (entity.isRemoved()) {
                ticksPassed = duration;
                return;
            }

            ticksPassed++;
            Vec3 newPos;

            if (duration > 0) {
                // 有限移动：插值计算（不受 TPS 波动影响总时长，受 TPS 影响实时速度）
                double t = (double) ticksPassed / duration;
                if (t > 1.0)
                    t = 1.0;
                newPos = startPos.lerp(targetPos, t);
            } else {
                // 无限移动：基于内部 trustedPos 累加（不受客户端回滚影响）
                // 这里的 trustedPos 是上一 tick 计算出的理论位置
                newPos = trustedPos.add(velocity);
            }

            // 更新内部信任坐标
            this.trustedPos = newPos;

            // 强行应用到实体（覆盖 Minecraft 所有的物理/碰撞/客户端修正）
            entity.setPos(newPos);
            entity.syncPosition = true;

            // 关键：对于 ServerPlayer，我们需要不断重置它的 fallDistance 等，防止累计摔落伤害或动作异常
            entity.fallDistance = 0;
        }

        Vec3 getTrustedPos() {
            return trustedPos;
        }

        boolean isFinished() {
            return entity.isRemoved() || (duration >= 0 && ticksPassed >= duration);
        }
    }
}
