package com.atemukesu.extendednoteblock.block;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.MenuProvider;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.block.BaseEntityBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.EnumProperty;
import net.minecraft.world.phys.BlockHitResult;
import org.jetbrains.annotations.Nullable;
import com.atemukesu.extendednoteblock.block.entity.ExtendedNoteBlockEntity;
import com.atemukesu.extendednoteblock.sound.ServerSoundManager;
import com.atemukesu.extendednoteblock.util.NotePitch;
import com.mojang.serialization.MapCodec;

public class ExtendedNoteBlockBlock extends BaseEntityBlock {

    public static final EnumProperty<NotePitch> PITCH = EnumProperty.create("pitch", NotePitch.class);

    private static final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "ExtendedNoteBlockDelayScheduler");
        thread.setDaemon(true);
        return thread;
    });

    public ExtendedNoteBlockBlock(Properties settings) {
        super(settings);
        this.registerDefaultState(this.stateDefinition.any()
                .setValue(BlockStateProperties.POWERED, false)
                .setValue(PITCH, NotePitch.C));
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        builder.add(BlockStateProperties.POWERED);
        builder.add(PITCH);
    }

    private void triggerNote(Level world, BlockPos pos) {
        if (world.isClientSide() || !(world instanceof ServerLevel serverWorld)) {
            return;
        }

        // 生成粒子效果
        if (world.getBlockEntity(pos) instanceof ExtendedNoteBlockEntity blockEntity) {
            double particleColor = (blockEntity.getNote() % 25) / 24.0D;
            serverWorld.sendParticles(
                    ParticleTypes.NOTE,
                    pos.getX() + 0.5D,
                    pos.getY() + 1.2D,
                    pos.getZ() + 0.5D,
                    0, particleColor, 0.0D, 0.0D, 1.0D);

            // ============== Advanced Features v1.4.0 ==============
            // 检查是否启用了高级模式
            if (blockEntity.isOneShot()) {
                ServerSoundManager.playOneShot(serverWorld, pos, blockEntity.getInstrumentId(), blockEntity.getNote(), blockEntity.getVelocity());
            } else if (blockEntity.isAdvancedModeEnabled()) {
                // 使用新的高级播放方法
                ServerSoundManager.playAdvancedSound(
                        serverWorld,
                        pos,
                        blockEntity.getInstrumentId(),
                        blockEntity.getNote(),
                        blockEntity.getVelocity(),
                        blockEntity.getSustain(),
                        blockEntity.getFadeInTime(),
                        blockEntity.getFadeOutTime(),
                        blockEntity.getPitchBendPoints(),
                        blockEntity.getVolumePoints(),
                        blockEntity.getSoundPath());
            } else {
                // 使用传统方法
                ServerSoundManager.playSound(
                        serverWorld,
                        pos,
                        blockEntity.getInstrumentId(),
                        blockEntity.getNote(),
                        blockEntity.getVelocity(),
                        blockEntity.getSustain(),
                        blockEntity.getFadeInTime(),
                        blockEntity.getFadeOutTime());
            }
        }
    }

    public void previewNote(Level world, BlockPos pos) {
        if (world.isClientSide() || !(world instanceof ServerLevel serverWorld)) {
            return;
        }
        if (world.getBlockEntity(pos) instanceof ExtendedNoteBlockEntity blockEntity) {
            // 粒子
            double particleColor = (blockEntity.getNote() % 25) / 24.0D;
            serverWorld.sendParticles(
                    ParticleTypes.NOTE,
                    pos.getX() + 0.5D,
                    pos.getY() + 1.2D,
                    pos.getZ() + 0.5D,
                    0, particleColor, 0.0D, 0.0D, 1.0D);
            // 预览：短暂的持续时间，没有淡入淡出
            ServerSoundManager.playSound(serverWorld, pos, blockEntity.getInstrumentId(), blockEntity.getNote(),
                    blockEntity.getVelocity(), 20, 0, 3);
        }
    }

    @Override
    public void tick(BlockState state, ServerLevel world, BlockPos pos,
            net.minecraft.util.RandomSource random) {
    }

    private void stopNote(Level world, BlockPos pos) {
        if (world.isClientSide() || !(world instanceof ServerLevel serverWorld)) {
            return;
        }
        // [修改] 在停止声音之前，先取消任何计划中的任务
        if (world.getBlockEntity(pos) instanceof ExtendedNoteBlockEntity blockEntity) {
            blockEntity.cancelScheduledSound();
        }
        ServerSoundManager.stopSound(serverWorld, pos);
    }

    @Override
    public InteractionResult useWithoutItem(BlockState state, Level world, BlockPos pos, Player player,
            BlockHitResult hit) {
        if (!world.isClientSide()) {
            MenuProvider screenHandlerFactory = state.getMenuProvider(world, pos);
            if (screenHandlerFactory != null) {
                player.openMenu(screenHandlerFactory);
            }
        }
        return InteractionResult.SUCCESS;
    }

    @Override
    public void neighborChanged(BlockState state, Level world, BlockPos pos, Block sourceBlock, net.minecraft.world.level.redstone.Orientation orientation,
            boolean notify) {
        if (world.isClientSide()) {
            return;
        }

        boolean isPowered = world.hasNeighborSignal(pos);
        boolean wasPowered = state.getValue(BlockStateProperties.POWERED);

        if (world.getBlockEntity(pos) instanceof ExtendedNoteBlockEntity blockEntity) {
            if (isPowered != wasPowered) {
                if (isPowered) { // 上升沿
                    // 1. 立即更新 POWERED 和 PITCH
                    NotePitch correctPitch = NotePitch.fromMidiNote(blockEntity.getNote());
                    BlockState newState = state.setValue(BlockStateProperties.POWERED, true).setValue(PITCH, correctPitch);
                    world.setBlock(pos, newState, Block.UPDATE_ALL);

                    // 2. 取消之前的延迟任务（如果有）
                    blockEntity.cancelScheduledSound();

                    // 3. 提交新的延迟发声任务（仅发声，不再设置 POWERED）
                    int delay = blockEntity.getDelayedPlayingTime();
                    if (delay > 0) {
                        ScheduledFuture<?> future = scheduler.schedule(() -> {
                            world.getServer().execute(() -> {
                                // 再次检查信号是否仍然为高，防止误触发
                                if (world.getBlockEntity(pos) == blockEntity && world.hasNeighborSignal(pos) &&
                                        world.getBlockState(pos).getValue(BlockStateProperties.POWERED)) {
                                    triggerNote(world, pos);
                                }
                            });
                        }, delay, TimeUnit.MILLISECONDS);
                        blockEntity.setScheduledFuture(future);
                    } else {
                        // 无延迟则立即发声
                        triggerNote(world, pos);
                    }
                } else { // 下降沿
                    blockEntity.cancelScheduledSound();
                    if (blockEntity.shouldHoldUntilRelease() && !blockEntity.isOneShot()) stopNote(world, pos);
                    world.setBlock(pos, state.setValue(BlockStateProperties.POWERED, false), Block.UPDATE_ALL);
                }
            }
        } else {
            // 如果没有方块实体，仅更新 POWERED 状态
            if (isPowered != wasPowered) {
                world.setBlock(pos, state.setValue(BlockStateProperties.POWERED, isPowered), Block.UPDATE_ALL);
            }
        }
    }

    @Override
    public void destroy(LevelAccessor world, BlockPos pos, BlockState state) {
        if (state.getValue(BlockStateProperties.POWERED)) {
            if (!world.isClientSide() && world instanceof ServerLevel serverWorld) {
                this.stopNote(serverWorld, pos);
            }
        }
        super.destroy(world, pos, state);
    }

    @Override
    protected void affectNeighborsAfterRemoval(BlockState state, ServerLevel world, BlockPos pos, boolean moved) {
        ServerSoundManager.stopSound(world, pos);
        super.affectNeighborsAfterRemoval(state, world, pos, moved);
    }

    @Override
    public void setPlacedBy(Level world, BlockPos pos, BlockState state, @Nullable LivingEntity placer,
            ItemStack itemStack) {
        super.setPlacedBy(world, pos, state, placer, itemStack);
        if (!world.isClientSide()) {
            if (world.getBlockEntity(pos) instanceof ExtendedNoteBlockEntity entity) {
                NotePitch correctPitch = NotePitch.fromMidiNote(entity.getNote());
                world.setBlock(pos, state.setValue(PITCH, correctPitch), 2);
            }
        }
    }

    @Nullable
    @Override
    public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new ExtendedNoteBlockEntity(pos, state);
    }


    @Override
    public RenderShape getRenderShape(BlockState state) {
        return RenderShape.MODEL;
    }
}
