package com.atemukesu.extendednoteblock.block;

import com.atemukesu.extendednoteblock.util.RedstoneManager;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;

public class TransmitterBlock extends Block {
    public static final BooleanProperty POWERED = BlockStateProperties.POWERED;

    public TransmitterBlock(net.minecraft.world.level.block.state.BlockBehaviour.Properties settings) {
        super(settings);
        registerDefaultState(defaultBlockState().setValue(POWERED, false));
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        builder.add(POWERED);
    }

    @Override
    public void neighborChanged(BlockState state, Level world, BlockPos pos, Block sourceBlock, net.minecraft.world.level.redstone.Orientation orientation,
            boolean notify) {
        if (world.isClientSide())
            return;

        boolean isBeingPowered = world.hasNeighborSignal(pos);
        boolean wasPowered = state.getValue(POWERED);

        if (isBeingPowered != wasPowered) {
            world.setBlock(pos, state.setValue(POWERED, isBeingPowered), 3);
            RedstoneManager.transmitterChanged(world, pos, isBeingPowered);
        }
    }

    @Override
    public void onPlace(BlockState state, Level world, BlockPos pos, BlockState oldState, boolean notify) {
        if (!world.isClientSide()) {
            RedstoneManager.addTransmitter(world, pos);
            // 检查当前供电状态并同步
            boolean isBeingPowered = world.hasNeighborSignal(pos);
            if (isBeingPowered != state.getValue(POWERED)) {
                world.setBlock(pos, state.setValue(POWERED, isBeingPowered), 3);
                RedstoneManager.transmitterChanged(world, pos, isBeingPowered);
            }
        }
    }

    @Override
    protected void affectNeighborsAfterRemoval(BlockState state, net.minecraft.server.level.ServerLevel world, BlockPos pos, boolean moved) {
            if (state.getValue(POWERED)) RedstoneManager.transmitterChanged(world, pos, false);
            RedstoneManager.removeTransmitter(world, pos);
        super.affectNeighborsAfterRemoval(state, world, pos, moved);
    }
}
