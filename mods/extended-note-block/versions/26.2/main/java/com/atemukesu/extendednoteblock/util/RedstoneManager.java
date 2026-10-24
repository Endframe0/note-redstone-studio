package com.atemukesu.extendednoteblock.util;

import com.atemukesu.extendednoteblock.block.ReceiverBlock;
import com.atemukesu.extendednoteblock.block.TransmitterBlock;
import java.util.HashSet;
import java.util.Set;
import net.minecraft.core.BlockPos;
import net.minecraft.core.HolderLookup;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.Tag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.saveddata.SavedData;

public class RedstoneManager {

    /*
     * Persistent State Implementation
     */
    public static class RedstoneData extends SavedData {
        // 所有已知发射器位置及其最后一次已知的供电状态
        // 即使发射器所在区块未加载，也据此判断全局是否有电
        private final Set<BlockPos> activeTransmitters = new HashSet<>();
        // 所有接收器位置
        private final Set<BlockPos> receivers = new HashSet<>();

        public static RedstoneData readNbt(CompoundTag nbt) {
            RedstoneData data = new RedstoneData();

            // 兼容旧格式：activeTransmitters 整数
            if (nbt.contains("activeTransmitters")) {
                // 旧格式没有位置信息，无法恢复；让后续 onBlockAdded 重新注册
                // 这里不恢复任何激活状态，避免误触发
            }

            // 兼容旧格式：transmitters 位置列表
            if (nbt.contains("transmitters")) {
                ListTag list = nbt.getListOrEmpty("transmitters");
                for (int i = 0; i < list.size(); i++) {
                    BlockPos pos = getBlockPos(list.getCompoundOrEmpty(i));
                    if (pos != null) data.activeTransmitters.add(pos);
                }
            }

            // 新格式：明确记录激活的发射器位置
            data.activeTransmitters.clear();
            if (nbt.contains("activeTransmittersList")) {
                ListTag list = nbt.getListOrEmpty("activeTransmittersList");
                for (int i = 0; i < list.size(); i++) {
                    BlockPos pos = getBlockPos(list.getCompoundOrEmpty(i));
                    if (pos != null) data.activeTransmitters.add(pos);
                }
            }

            // 读取接收器
            data.receivers.clear();
            if (nbt.contains("receivers")) {
                ListTag list = nbt.getListOrEmpty("receivers");
                for (int i = 0; i < list.size(); i++) {
                    BlockPos pos = getBlockPos(list.getCompoundOrEmpty(i));
                    if (pos != null) data.receivers.add(pos);
                }
            }

            return data;
        }

        public CompoundTag save() {
            CompoundTag nbt = new CompoundTag();
            // 新格式：激活的发射器位置
            ListTag txList = new ListTag();
            for (BlockPos pos : activeTransmitters) {
                txList.add(putBlockPos(pos));
            }
            nbt.put("activeTransmittersList", txList);

            // 接收器位置
            ListTag rxList = new ListTag();
            for (BlockPos pos : receivers) {
                rxList.add(putBlockPos(pos));
            }
            nbt.put("receivers", rxList);

            return nbt;
        }

        public static final net.minecraft.world.level.saveddata.SavedDataType<RedstoneData> TYPE = new net.minecraft.world.level.saveddata.SavedDataType<>(
                net.minecraft.resources.Identifier.fromNamespaceAndPath("extendednoteblock", "redstone"),
                RedstoneData::new,
                CompoundTag.CODEC.xmap(RedstoneData::readNbt, RedstoneData::save),
                null);

        public static RedstoneData get(ServerLevel world) {
            return world.getDataStorage().computeIfAbsent(TYPE);
        }

        public boolean isGlobalPowered() {
            return !activeTransmitters.isEmpty();
        }

        public void updateReceivers(ServerLevel world) {
            boolean powered = isGlobalPowered();

            var iterator = receivers.iterator();
            while (iterator.hasNext()) {
                BlockPos pos = iterator.next();
                if (!world.hasChunkAt(pos)) {
                    continue;
                }
                try {
                    BlockState state = world.getBlockState(pos);
                    if (state.getBlock() instanceof ReceiverBlock) {
                        boolean oldPowered = state.getValue(ReceiverBlock.POWERED);
                        if (oldPowered != powered) {
                            world.setBlock(pos, state.setValue(ReceiverBlock.POWERED, powered), 3);
                            world.updateNeighborsAt(pos, state.getBlock());
                        }
                    } else {
                        // 位置已不再是接收器，清理残留
                        iterator.remove();
                        setDirty();
                    }
                } catch (Exception ignored) {
                }
            }
        }
    }

    // --- Public API ---

    /**
     * 通知指定发射器状态变化。
     */
    public static void transmitterChanged(Level world, BlockPos pos, boolean powered) {
        if (world.isClientSide() || !(world instanceof ServerLevel serverWorld))
            return;

        RedstoneData data = RedstoneData.get(serverWorld);
        boolean changed;
        if (powered) {
            changed = data.activeTransmitters.add(pos);
        } else {
            changed = data.activeTransmitters.remove(pos);
        }

        if (changed) {
            data.setDirty();
            data.updateReceivers(serverWorld);
        }
    }

    /**
     * 注册发射器位置并同步当前状态（方块放置时调用）。
     */
    public static void addTransmitter(Level world, BlockPos pos) {
        if (world.isClientSide() || !(world instanceof ServerLevel serverWorld))
            return;

        RedstoneData data = RedstoneData.get(serverWorld);
        BlockState state = world.getBlockState(pos);
        boolean powered = state.getBlock() instanceof TransmitterBlock && state.getValue(TransmitterBlock.POWERED);

        if (powered) {
            if (data.activeTransmitters.add(pos)) {
                data.setDirty();
                data.updateReceivers(serverWorld);
            }
        } else {
            // 即使没电也确保旧残留被清理
            if (data.activeTransmitters.remove(pos)) {
                data.setDirty();
                data.updateReceivers(serverWorld);
            }
        }
    }

    /**
     * 移除发射器（方块被破坏时调用）。
     */
    public static void removeTransmitter(Level world, BlockPos pos) {
        if (world.isClientSide() || !(world instanceof ServerLevel serverWorld))
            return;

        RedstoneData data = RedstoneData.get(serverWorld);
        if (data.activeTransmitters.remove(pos)) {
            data.setDirty();
            data.updateReceivers(serverWorld);
        }
    }

    public static boolean isGlobalPowered(Level world) {
        if (world.isClientSide() || !(world instanceof ServerLevel serverWorld))
            return false;
        return RedstoneData.get(serverWorld).isGlobalPowered();
    }

    public static void addReceiver(Level world, BlockPos pos) {
        if (world.isClientSide() || !(world instanceof ServerLevel serverWorld))
            return;
        RedstoneData data = RedstoneData.get(serverWorld);
        if (data.receivers.add(pos)) {
            data.setDirty();
        }
        // 放置后立即同步当前状态
        boolean globalPower = data.isGlobalPowered();
        BlockState state = world.getBlockState(pos);
        if (state.getBlock() instanceof ReceiverBlock && state.getValue(ReceiverBlock.POWERED) != globalPower) {
            world.setBlock(pos, state.setValue(ReceiverBlock.POWERED, globalPower), 3);
        }
    }

    public static void removeReceiver(Level world, BlockPos pos) {
        if (world.isClientSide() || !(world instanceof ServerLevel serverWorld))
            return;
        RedstoneData data = RedstoneData.get(serverWorld);
        if (data.receivers.remove(pos)) {
            data.setDirty();
        }
    }

    /**
     * 存档重载后调用：延迟几 tick，等区块加载完毕后再同步所有接收器。
     */
    public static void syncOnWorldLoad(Level world) {
        if (world instanceof ServerLevel serverWorld) {
            try {
                // 跨 1 tick 延迟执行，确保玩家所在区块已加载
                serverWorld.getServer().execute(() -> {
                    serverWorld.getServer().execute(() -> {
                        RedstoneData data = RedstoneData.get(serverWorld);
                        data.updateReceivers(serverWorld);
                    });
                });
            } catch (Exception ignored) {
            }
        }
    }

    // ---- BlockPos 序列化辅助 ----

    // 自己实现 BlockPos 序列化/反序列化，避免 NbtHelper.fromBlockPos 使用大写 keys 导致不兼容
    private static CompoundTag putBlockPos(BlockPos pos) {
        CompoundTag nbt = new CompoundTag();
        nbt.putInt("x", pos.getX());
        nbt.putInt("y", pos.getY());
        nbt.putInt("z", pos.getZ());
        return nbt;
    }

    private static BlockPos getBlockPos(CompoundTag nbt) {
        if (nbt == null) return null;
        // 优先读小写 x,y,z（自己写的格式）
        if (nbt.contains("x") && nbt.contains("y")
                && nbt.contains("z")) {
            return new BlockPos(nbt.getIntOr("x", 0), nbt.getIntOr("y", 0), nbt.getIntOr("z", 0));
        }
        // 兼容 NbtHelper.fromBlockPos 生成的大写 X,Y,Z
        if (nbt.contains("X") && nbt.contains("Y")
                && nbt.contains("Z")) {
            return new BlockPos(nbt.getIntOr("X", 0), nbt.getIntOr("Y", 0), nbt.getIntOr("Z", 0));
        }
        return null;
    }
}
