package com.atemukesu.extendednoteblock.screen;

import com.atemukesu.extendednoteblock.block.entity.ExtendedNoteBlockEntity;
import com.atemukesu.extendednoteblock.util.CurvePoint;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ContainerData;
import net.minecraft.world.inventory.SimpleContainerData;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;

public class ExtendedNoteBlockScreenHandler extends AbstractContainerMenu {
    public final ExtendedNoteBlockEntity blockEntity;
    private final ContainerData propertyDelegate;
    public final BlockPos blockPos;

    public static final StreamCodec<RegistryFriendlyByteBuf, FriendlyByteBuf> PACKET_CODEC = StreamCodec.ofMember(
            ExtendedNoteBlockScreenHandler::writeToBuf,
            buf -> new FriendlyByteBuf(buf.readBytes(buf.readableBytes()))
    );

    private static void writeToBuf(FriendlyByteBuf data, RegistryFriendlyByteBuf buf) {
        try {
            buf.writeBytes(data, data.readerIndex(), data.readableBytes());
        } finally {
            data.release();
        }
    }

    public ExtendedNoteBlockScreenHandler(int syncId, Inventory inventory, ExtendedNoteBlockEntity entity,
                                          ContainerData delegate) {
        super(ModScreenHandlers.EXTENDED_NOTE_BLOCK_SCREEN_HANDLER, syncId);
        this.blockEntity = entity;
        this.propertyDelegate = delegate;
        this.blockPos = entity.getBlockPos();
        addDataSlots(delegate);
    }

    public ExtendedNoteBlockScreenHandler(int syncId, Inventory inventory, FriendlyByteBuf buf) {
        this(syncId, inventory, readOpeningData(buf));
    }

    private record OpeningData(BlockPos pos, int[] values, List<CurvePoint> pitch, List<CurvePoint> volume,
                               List<Vec3> path, String expressionX, String expressionY, String expressionZ) {}

    private ExtendedNoteBlockScreenHandler(int syncId, Inventory inventory, OpeningData data) {
        this(syncId, inventory, requireEntity(inventory, data.pos()), new SimpleContainerData(7));
        for (int i = 0; i < data.values().length; i++) this.propertyDelegate.set(i, data.values()[i]);
        this.blockEntity.setPitchBendPoints(data.pitch());
        this.blockEntity.setVolumePoints(data.volume());
        this.blockEntity.setSoundPath(data.path());
        this.blockEntity.setStoredExpressionX(data.expressionX());
        this.blockEntity.setStoredExpressionY(data.expressionY());
        this.blockEntity.setStoredExpressionZ(data.expressionZ());
    }

    private static ExtendedNoteBlockEntity requireEntity(Inventory inventory, BlockPos pos) {
        if (inventory.player.level().getBlockEntity(pos) instanceof ExtendedNoteBlockEntity entity) return entity;
        throw new IllegalStateException("Missing Extended Note Block at " + pos);
    }

    private static int readCount(FriendlyByteBuf buf) {
        int count = buf.readInt();
        if (count < 0 || count > 4096) throw new io.netty.handler.codec.DecoderException("Invalid menu collection size: " + count);
        return count;
    }

    private static OpeningData readOpeningData(FriendlyByteBuf buf) {
        try {
            BlockPos pos = buf.readBlockPos();
            int[] values = new int[7];
            for (int i = 0; i < values.length; i++) values[i] = buf.readInt();
            List<CurvePoint> pitch = new ArrayList<>();
            int pitchSize = readCount(buf);
            for (int i = 0; i < pitchSize; i++) pitch.add(new CurvePoint(buf.readFloat(), buf.readFloat()));
            List<CurvePoint> volume = new ArrayList<>();
            int volumeSize = readCount(buf);
            for (int i = 0; i < volumeSize; i++) volume.add(new CurvePoint(buf.readFloat(), buf.readFloat()));
            List<Vec3> path = new ArrayList<>();
            int pathSize = readCount(buf);
            for (int i = 0; i < pathSize; i++) path.add(new Vec3(buf.readDouble(), buf.readDouble(), buf.readDouble()));
            return new OpeningData(pos, values, pitch, volume, path, buf.readUtf(), buf.readUtf(), buf.readUtf());
        } finally {
            buf.release();
        }
    }
    public int getNote() {
        return this.propertyDelegate.get(0);
    }

    public int getVelocity() {
        return this.propertyDelegate.get(1);
    }

    public int getSustain() {
        return this.propertyDelegate.get(2);
    }

    public int getDelayedPlayingTime() {
        return this.propertyDelegate.get(3);
    }

    public int getFadeInTime() {
        return this.propertyDelegate.get(4);
    }

    public int getFadeOutTime() {
        return this.propertyDelegate.get(5);
    }

    public int getInstrumentId() {
        return this.propertyDelegate.get(6);
    }

    @Override
    public ItemStack quickMoveStack(Player player, int slot) {
        return ItemStack.EMPTY;
    }

    @Override
    public boolean stillValid(Player player) {
        return this.blockEntity.getLevel().getBlockEntity(this.blockPos) == this.blockEntity &&
                player.distanceToSqr(net.minecraft.world.phys.Vec3.atCenterOf(this.blockPos)) < 64.0;
    }

    @Override
    public void removed(Player player) {
        super.removed(player);
        // previewNote 已由 PreviewRequestPayload 处理，此处不再重复触发
    }
}
