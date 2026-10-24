package com.atemukesu.extendednoteblock.item;

import com.atemukesu.extendednoteblock.ExtendedNoteBlock;
import com.atemukesu.extendednoteblock.block.ModBlocks;
import net.fabricmc.fabric.api.creativetab.v1.FabricCreativeModeTab;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.ItemStack;

import static com.atemukesu.extendednoteblock.ExtendedNoteBlock.CONDUCTOR_WAND;

public class ModItemGroups {

    public static final CreativeModeTab EXTENDED_NOTE_BLOCK_GROUP = Registry.register(BuiltInRegistries.CREATIVE_MODE_TAB,
            Identifier.fromNamespaceAndPath(ExtendedNoteBlock.MOD_ID, "extended_note_block_group"),
            FabricCreativeModeTab.builder()
                    .title(Component.translatable("itemgroup.extendednoteblock"))
                    .icon(() -> new ItemStack(ModBlocks.EXTENDED_NOTE_BLOCK))
                    .displayItems((displayContext, entries) -> {
                        entries.accept(ModBlocks.EXTENDED_NOTE_BLOCK);
                        entries.accept(ModBlocks.GLOBAL_REDSTONE_TRANSMITTER);
                        entries.accept(ModBlocks.GLOBAL_REDSTONE_RECEIVER);
                        entries.accept(CONDUCTOR_WAND);
                    })
                    .build());

    public static void registerItemGroups() {
        ExtendedNoteBlock.LOGGER.info("Registering Item Groups for " + ExtendedNoteBlock.MOD_ID);
    }
}