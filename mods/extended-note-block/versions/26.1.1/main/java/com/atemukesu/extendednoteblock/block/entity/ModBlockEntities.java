package com.atemukesu.extendednoteblock.block.entity;

import com.atemukesu.extendednoteblock.ExtendedNoteBlock;
import com.atemukesu.extendednoteblock.block.ModBlocks;
import net.fabricmc.fabric.api.object.builder.v1.block.entity.FabricBlockEntityTypeBuilder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.entity.BlockEntityType;

public class ModBlockEntities {
    public static BlockEntityType<ExtendedNoteBlockEntity> EXTENDED_NOTE_BLOCK_ENTITY;

    public static void registerBlockEntities() {
        ExtendedNoteBlock.LOGGER.info("Registering Block Entities for " + ExtendedNoteBlock.MOD_ID);
        EXTENDED_NOTE_BLOCK_ENTITY = Registry.register(
                BuiltInRegistries.BLOCK_ENTITY_TYPE,
                Identifier.fromNamespaceAndPath(ExtendedNoteBlock.MOD_ID, "extended_note_block_entity"),
                FabricBlockEntityTypeBuilder.<ExtendedNoteBlockEntity>create(
                        ExtendedNoteBlockEntity::new,
                        ModBlocks.EXTENDED_NOTE_BLOCK).build());
    }
}