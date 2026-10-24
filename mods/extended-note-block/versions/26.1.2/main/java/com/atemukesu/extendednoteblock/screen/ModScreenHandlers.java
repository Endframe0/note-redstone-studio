package com.atemukesu.extendednoteblock.screen;

import com.atemukesu.extendednoteblock.ExtendedNoteBlock;
import net.fabricmc.fabric.api.menu.v1.ExtendedMenuType;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.resources.Identifier;
import net.minecraft.world.inventory.MenuType;

public class ModScreenHandlers {
    public static final MenuType<ExtendedNoteBlockScreenHandler> EXTENDED_NOTE_BLOCK_SCREEN_HANDLER = Registry
            .register(BuiltInRegistries.MENU, Identifier.fromNamespaceAndPath(ExtendedNoteBlock.MOD_ID, "extended_note_block"),
                    new ExtendedMenuType<ExtendedNoteBlockScreenHandler, FriendlyByteBuf>(
                            ExtendedNoteBlockScreenHandler::new,
                            ExtendedNoteBlockScreenHandler.PACKET_CODEC));

    public static void registerScreenHandlers() {
        ExtendedNoteBlock.LOGGER.info("Registering Screen Handlers for " + ExtendedNoteBlock.MOD_ID);
    }
}