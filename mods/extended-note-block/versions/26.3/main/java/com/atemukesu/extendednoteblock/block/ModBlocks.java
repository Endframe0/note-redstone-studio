package com.atemukesu.extendednoteblock.block;

import com.atemukesu.extendednoteblock.ExtendedNoteBlock;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import java.util.function.Function;

public class ModBlocks {
    public static final Block EXTENDED_NOTE_BLOCK = registerBlock("extended_note_block", ExtendedNoteBlockBlock::new,
            BlockBehaviour.Properties.ofFullCopy(Blocks.NOTE_BLOCK)
                    .lightLevel(state -> state.getValue(BlockStateProperties.POWERED) ? 15 : 0));
    public static final Block GLOBAL_REDSTONE_TRANSMITTER = registerBlock("global_redstone_transmitter", TransmitterBlock::new,
            BlockBehaviour.Properties.ofFullCopy(Blocks.STONE).strength(1.5f));
    public static final Block GLOBAL_REDSTONE_RECEIVER = registerBlock("global_redstone_receiver", ReceiverBlock::new,
            BlockBehaviour.Properties.ofFullCopy(Blocks.STONE).strength(1.5f)
                    .lightLevel(state -> state.getValue(BlockStateProperties.POWERED) ? 15 : 0));
    private static Block registerBlock(String name, Function<BlockBehaviour.Properties, Block> factory, BlockBehaviour.Properties properties) {
        Identifier id = Identifier.fromNamespaceAndPath(ExtendedNoteBlock.MOD_ID, name);
        Block block = factory.apply(properties.setId(ResourceKey.create(Registries.BLOCK, id)));
        Registry.register(BuiltInRegistries.BLOCK, id, block);
        Registry.register(BuiltInRegistries.ITEM, id,
                new BlockItem(block, new Item.Properties().setId(ResourceKey.create(Registries.ITEM, id)).useBlockDescriptionPrefix()));
        return block;
    }
    public static void registerModBlocks() {
        ExtendedNoteBlock.LOGGER.info("Registering ModBlocks for " + ExtendedNoteBlock.MOD_ID);
    }
}
