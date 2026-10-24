package com.atemukesu.extendednoteblock;

import com.atemukesu.extendednoteblock.item.ConductorWandItem;
import com.atemukesu.extendednoteblock.network.ModPayloads;
import com.atemukesu.extendednoteblock.screen.ModScreenHandlers;
import com.atemukesu.extendednoteblock.sound.SoundPackManager;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.event.player.AttackBlockCallback;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.minecraft.client.gui.screens.MenuScreens;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.InteractionHand;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.Level;

import com.atemukesu.extendednoteblock.client.gui.screen.ExtendedNoteBlockScreen;
import com.atemukesu.extendednoteblock.config.ConfigManager;
import com.atemukesu.extendednoteblock.network.ClientModMessages;

import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.minecraft.client.KeyMapping;
import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtUtils;
import net.minecraft.network.chat.Component;


public class ExtendedNoteBlockClient implements ClientModInitializer {

    private static final KeyMapping.Category KEY_CATEGORY = KeyMapping.Category.register(net.minecraft.resources.Identifier.fromNamespaceAndPath("extendednoteblock", "controls"));
    private static KeyMapping openWandGuiKey;
    private static KeyMapping clearSelectionKey;

    @Override
    public void onInitializeClient() {
        MenuScreens.register(ModScreenHandlers.EXTENDED_NOTE_BLOCK_SCREEN_HANDLER, ExtendedNoteBlockScreen::new);
        ConfigManager.initialize();
        SoundPackManager.getInstance().scanPacks();
        ClientModMessages.registerS2CPackets();
        com.atemukesu.extendednoteblock.util.ClientSmoothMoveManager.init();

        // Register KeyBindings
        openWandGuiKey = KeyMappingHelper.registerKeyMapping(new KeyMapping(
                "key.extendednoteblock.open_wand_gui",
                InputConstants.Type.KEYBOARD,
                InputConstants.KEY_RETURN,
                KEY_CATEGORY));

        clearSelectionKey = KeyMappingHelper.registerKeyMapping(new KeyMapping(
                "key.extendednoteblock.clear_selection",
                InputConstants.Type.KEYBOARD,
                InputConstants.KEY_BACKSPACE,
                KEY_CATEGORY));

        // Register Client Tick Event
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            if (client.player == null)
                return;

            while (openWandGuiKey.consumeClick()) {
                if (client.player.getMainHandItem().getItem() instanceof ConductorWandItem) {
                    CompoundTag nbt = client.player.getMainHandItem().getOrDefault(DataComponents.CUSTOM_DATA, CustomData.EMPTY).copyTag();
                    if (nbt != null && nbt.contains("Pos1") && nbt.contains("Pos2")) {
                        BlockPos p1 = nbt.getCompound("Pos1").flatMap(ConductorWandItem::readSelectionPos).orElse(null);
                        BlockPos p2 = nbt.getCompound("Pos2").flatMap(ConductorWandItem::readSelectionPos).orElse(null);
                        if (p1 != null && p2 != null) ClientModMessages.sendScanRequestToServer(p1, p2);
                    } else {
                        client.player.sendOverlayMessage(Component.translatable("gui.extendednoteblock.conductor.incomplete"));
                    }
                }
            }

            while (clearSelectionKey.consumeClick()) {
                if (client.player.getMainHandItem().getItem() instanceof ConductorWandItem) {
                    // 1. Send Clear Packet to Server
                    ClientModMessages.sendClearSelectionToServer();

                    // 2. Clear Client Side NBT for instant visual feedback
                    var stack = client.player.getMainHandItem();
                    CompoundTag nbt = stack.getOrDefault(DataComponents.CUSTOM_DATA, CustomData.EMPTY).copyTag();
                    nbt.remove("Pos1");
                    nbt.remove("Pos2");
                    stack.set(DataComponents.CUSTOM_DATA, CustomData.of(nbt));
                    client.player.sendOverlayMessage(Component.translatable("gui.extendednoteblock.conductor.selection_cleared"));
                }
            }
        });

        // Register attack block callback for ConductorWand
        AttackBlockCallback.EVENT.register(this::onAttackBlock);
        UseBlockCallback.EVENT.register((player, world, hand, hitResult) -> {
            if (player.getItemInHand(hand).getItem() instanceof ConductorWandItem) {
                // 修改为 PASS，让 Item 类的 useOnBlock 方法能够执行
                // Item.useOnBlock 返回 SUCCESS 会自动阻止方块的默认交互（如打开 NoteBlock GUI）
                return InteractionResult.PASS;
            }
            return InteractionResult.PASS;
        });

        // Register visualizer
        ClientTickEvents.END_CLIENT_TICK.register(com.atemukesu.extendednoteblock.client.renderer.ConductorWandRenderer::tick);
        net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> com.atemukesu.extendednoteblock.sound.ClientSoundManager.clear());

    }

    private InteractionResult onAttackBlock(Player player, Level world, InteractionHand hand, BlockPos pos, Direction direction) {
        ItemStack stack = player.getItemInHand(hand);
        if (stack.getItem() instanceof ConductorWandItem) {
            if (world.isClientSide()) {
                // 发包给服务端设置 Pos1
                ClientPlayNetworking.send(new ModPayloads.SetWandPosPayload(1, pos));
            }
            // 返回 SUCCESS 会阻止方块被挖掘
            return InteractionResult.SUCCESS;
        }
        return InteractionResult.PASS;
    }

}