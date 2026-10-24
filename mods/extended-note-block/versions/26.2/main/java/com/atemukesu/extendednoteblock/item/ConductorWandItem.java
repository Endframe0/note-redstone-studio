package com.atemukesu.extendednoteblock.item;

import com.atemukesu.extendednoteblock.network.ModMessages;
import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.core.BlockPos;
import net.minecraft.core.component.DataComponents;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtUtils;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.item.component.TooltipDisplay;
import java.util.Optional;
import java.util.function.Consumer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class ConductorWandItem extends Item {
    public ConductorWandItem(Item.Properties properties) {
        super(properties.stacksTo(1));
    }

    @Override
    public void appendHoverText(ItemStack stack, TooltipContext context, TooltipDisplay display, Consumer<Component> tooltip, TooltipFlag type) {
        tooltip.accept(Component.translatable("item.extendednoteblock.conductor_wand.tooltip1"));
        tooltip.accept(Component.translatable("item.extendednoteblock.conductor_wand.tooltip2"));
        tooltip.accept(Component.translatable("item.extendednoteblock.conductor_wand.tooltip3"));
        super.appendHoverText(stack, context, display, tooltip, type);
    }

    // 左键点击方块 (BlockBreak事件前) - 设置点1
    // 注意：Fabric Item类没有直接的onLeftClickBlock，通常通过AttackBlockCallback事件处理，
    // 或者利用 canMine 返回 false 并在里面处理逻辑 (虽然hacky但常用)。
    // 这里假设你在模组主类注册了 AttackBlockCallback.EVENT.register(...) 来调用此逻辑。
    @Environment(EnvType.CLIENT)
    public void onLeftClick(Player player, BlockPos pos) {
        ItemStack stack = player.getMainHandItem();
        if (stack.getItem() == this) {
            CompoundTag nbt = stack.getOrDefault(DataComponents.CUSTOM_DATA, CustomData.EMPTY).copyTag();
            nbt.put("Pos1", writeSelectionPos(pos));
            stack.set(DataComponents.CUSTOM_DATA, CustomData.of(nbt));
            ModMessages.displayMessage(player, Component.translatable("gui.extendednoteblock.conductor.pos_set", 1, pos.toShortString()),
                    true);
        }
    }

    // Right Click Block - Set Pos2
    @Override
    public InteractionResult useOn(UseOnContext context) {
        Level world = context.getLevel();
        BlockPos pos = context.getClickedPos();
        Player player = context.getPlayer();
        ItemStack stack = context.getItemInHand();

        // 1. Always set Pos2 on Client for immediate visual feedback
        // 2. Server will handle the actual logic storage/sync via standard item sync or
        // packets if needed,
        // but here we also set it on Server side for persistence.
        CompoundTag nbt = stack.getOrDefault(DataComponents.CUSTOM_DATA, CustomData.EMPTY).copyTag();
        nbt.put("Pos2", writeSelectionPos(pos));
        stack.set(DataComponents.CUSTOM_DATA, CustomData.of(nbt));

        if (world.isClientSide() && player != null) {
            ModMessages.displayMessage(player, Component.translatable("gui.extendednoteblock.conductor.pos_set", 2, pos.toShortString()),
                    true);
        }

        return InteractionResult.SUCCESS;
    }

    // Remove direct GUI opening from Item use
    @Override
    public InteractionResult use(Level world, Player player, InteractionHand hand) {
        return super.use(world, player, hand);
    }

    // 抽取打开GUI的逻辑
    public void openGui(Player player, ItemStack stack) {
        CompoundTag nbt = stack.getOrDefault(DataComponents.CUSTOM_DATA, CustomData.EMPTY).copyTag();
        if (nbt.contains("Pos1") && nbt.contains("Pos2")) {
            BlockPos p1 = nbt.getCompound("Pos1").flatMap(ConductorWandItem::readSelectionPos).orElse(null);
            BlockPos p2 = nbt.getCompound("Pos2").flatMap(ConductorWandItem::readSelectionPos).orElse(null);
            if (p1 != null && p2 != null && player instanceof ServerPlayer serverPlayer)
                ModMessages.sendScanRequest(serverPlayer, p1, p2);
        } else {
            ModMessages.displayMessage(player, Component.translatable("gui.extendednoteblock.conductor.incomplete"), false);
        }
    }

    public static Optional<BlockPos> readSelectionPos(CompoundTag pos) {
        if (pos.getInt("X").isEmpty() || pos.getInt("Y").isEmpty() || pos.getInt("Z").isEmpty()) return Optional.empty();
        return Optional.of(new BlockPos(pos.getIntOr("X", 0), pos.getIntOr("Y", 0), pos.getIntOr("Z", 0)));
    }

    public static CompoundTag writeSelectionPos(BlockPos pos) {
        CompoundTag tag = new CompoundTag();
        tag.putInt("X", pos.getX()); tag.putInt("Y", pos.getY()); tag.putInt("Z", pos.getZ());
        return tag;
    }
}
