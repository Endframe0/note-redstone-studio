package com.atemukesu.extendednoteblock.block;

import com.atemukesu.extendednoteblock.util.RedstoneManager;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;

public class ReceiverBlock extends Block {
    public static final BooleanProperty POWERED = BlockStateProperties.POWERED;

    public ReceiverBlock(net.minecraft.world.level.block.state.BlockBehaviour.Properties settings) {
        super(settings);
        registerDefaultState(defaultBlockState().setValue(POWERED, false));
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        builder.add(POWERED);
    }

    // 处理红石输出
    @Override
    public boolean isSignalSource(BlockState state) {
        return true;
    }

    @Override
    public int getSignal(BlockState state, BlockGetter world, BlockPos pos, Direction direction) {
        return state.getValue(POWERED) ? 15 : 0;
    }

    @Override
    public void onPlace(BlockState state, Level world, BlockPos pos, BlockState oldState, boolean notify) {
        if (!world.isClientSide()) {
            RedstoneManager.addReceiver(world, pos);
            // 放置时立即检查全局状态
            boolean globalPower = RedstoneManager.isGlobalPowered(world);
            if (state.getValue(POWERED) != globalPower) {
                world.setBlock(pos, state.setValue(POWERED, globalPower), 3);
            }
        }
    }

    @Override
    protected void affectNeighborsAfterRemoval(BlockState state, net.minecraft.server.level.ServerLevel world, BlockPos pos, boolean moved) {
            RedstoneManager.removeReceiver(world, pos);
        super.affectNeighborsAfterRemoval(state, world, pos, moved);
    }
}
