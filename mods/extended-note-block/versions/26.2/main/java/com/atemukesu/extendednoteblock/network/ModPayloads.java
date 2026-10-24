package com.atemukesu.extendednoteblock.network;

import com.atemukesu.extendednoteblock.util.CurvePoint;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;
import net.minecraft.world.phys.Vec3;

public class ModPayloads {
    private static int readCount(FriendlyByteBuf buf, int maximum) {
        int count = buf.readInt();
        if (count < 0 || count > maximum) throw new io.netty.handler.codec.DecoderException("Invalid Extended Note Block collection size: " + count);
        return count;
    }

    private static CurvePoint readCurvePoint(FriendlyByteBuf buf) {
        float time = buf.readFloat(), value = buf.readFloat();
        if (!Float.isFinite(time) || !Float.isFinite(value))
            throw new io.netty.handler.codec.DecoderException("Non-finite Extended Note Block curve point");
        return new CurvePoint(time, value);
    }

    private static Vec3 readPathPoint(FriendlyByteBuf buf) {
        double x = buf.readDouble(), y = buf.readDouble(), z = buf.readDouble();
        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z))
            throw new io.netty.handler.codec.DecoderException("Non-finite Extended Note Block sound path");
        return new Vec3(x, y, z);
    }

    // ============== C2S Payloads ==============

    // C2S - Update Note Block
    public record UpdateNoteBlockPayload(
            BlockPos pos, int note, int velocity, int sustain, int delay, int fadeIn, int fadeOut, int instrumentId
    ) implements CustomPacketPayload {
        public static final Type<UpdateNoteBlockPayload> ID = new Type<>(Identifier.fromNamespaceAndPath("extendednoteblock", "update_note_block"));
        public static final StreamCodec<FriendlyByteBuf, UpdateNoteBlockPayload> CODEC = StreamCodec.ofMember(
                (payload, buf) -> {
                    buf.writeBlockPos(payload.pos);
                    buf.writeInt(payload.note);
                    buf.writeInt(payload.velocity);
                    buf.writeInt(payload.sustain);
                    buf.writeInt(payload.delay);
                    buf.writeInt(payload.fadeIn);
                    buf.writeInt(payload.fadeOut);
                    buf.writeInt(payload.instrumentId);
                },
                buf -> new UpdateNoteBlockPayload(
                        buf.readBlockPos(), buf.readInt(), buf.readInt(), buf.readInt(),
                        buf.readInt(), buf.readInt(), buf.readInt(), buf.readInt()
                )
        );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return ID;
        }
    }

    // C2S - Advanced Settings
    public record AdvancedSettingsPayload(
            BlockPos pos, List<CurvePoint> volumePoints, List<CurvePoint> pitchBendPoints,
            List<Vec3> soundPath, String storedExprX, String storedExprY, String storedExprZ
    ) implements CustomPacketPayload {
        public static final Type<AdvancedSettingsPayload> ID = new Type<>(Identifier.fromNamespaceAndPath("extendednoteblock", "advanced_settings"));
        public static final StreamCodec<FriendlyByteBuf, AdvancedSettingsPayload> CODEC = StreamCodec.ofMember(
                (payload, buf) -> {
                    buf.writeBlockPos(payload.pos);

                    // Write volume points
                    List<CurvePoint> volPoints = payload.volumePoints;
                    buf.writeInt(volPoints.size());
                    for (CurvePoint p : volPoints) {
                        buf.writeFloat(p.time);
                        buf.writeFloat(p.value);
                    }

                    // Write pitch bend points
                    List<CurvePoint> pitchPoints = payload.pitchBendPoints;
                    buf.writeInt(pitchPoints.size());
                    for (CurvePoint p : pitchPoints) {
                        buf.writeFloat(p.time);
                        buf.writeFloat(p.value);
                    }

                    // Write sound path
                    List<Vec3> path = payload.soundPath;
                    buf.writeInt(path.size());
                    for (Vec3 v : path) {
                        buf.writeDouble(v.x);
                        buf.writeDouble(v.y);
                        buf.writeDouble(v.z);
                    }

                    // Write expressions
                    buf.writeUtf(payload.storedExprX);
                    buf.writeUtf(payload.storedExprY);
                    buf.writeUtf(payload.storedExprZ);
                },
                buf -> {
                    BlockPos pos = buf.readBlockPos();

                    int volSize = readCount(buf, 4096);
                    List<CurvePoint> volumePoints = new ArrayList<>();
                    for (int i = 0; i < volSize; i++) {
                        volumePoints.add(readCurvePoint(buf));
                    }

                    int pitchSize = readCount(buf, 4096);
                    List<CurvePoint> pitchBendPoints = new ArrayList<>();
                    for (int i = 0; i < pitchSize; i++) {
                        pitchBendPoints.add(readCurvePoint(buf));
                    }

                    int pathSize = readCount(buf, 4096);
                    List<Vec3> soundPath = new ArrayList<>();
                    for (int i = 0; i < pathSize; i++) {
                        soundPath.add(readPathPoint(buf));
                    }

                    String exprX = buf.readUtf();
                    String exprY = buf.readUtf();
                    String exprZ = buf.readUtf();

                    return new AdvancedSettingsPayload(pos, volumePoints, pitchBendPoints, soundPath, exprX, exprY, exprZ);
                }
        );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return ID;
        }
    }

    // C2S - Scan Request
    public record ScanRequestPayload(BlockPos pos1, BlockPos pos2) implements CustomPacketPayload {
        public static final Type<ScanRequestPayload> ID = new Type<>(Identifier.fromNamespaceAndPath("extendednoteblock", "scan_request"));
        public static final StreamCodec<FriendlyByteBuf, ScanRequestPayload> CODEC = StreamCodec.ofMember(
                (payload, buf) -> {
                    buf.writeBlockPos(payload.pos1);
                    buf.writeBlockPos(payload.pos2);
                },
                buf -> new ScanRequestPayload(buf.readBlockPos(), buf.readBlockPos())
        );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return ID;
        }
    }

    // C2S - Bulk Update
    public record BulkUpdatePayload(
            BlockPos p1, BlockPos p2, String targetBlockId,
            String updatesJson, boolean hasAdvanced, CompoundTag advancedPatch
    ) implements CustomPacketPayload {
        public static final Type<BulkUpdatePayload> ID = new Type<>(Identifier.fromNamespaceAndPath("extendednoteblock", "bulk_update"));
        public static final StreamCodec<FriendlyByteBuf, BulkUpdatePayload> CODEC = StreamCodec.ofMember(
                (payload, buf) -> {
                    buf.writeBlockPos(payload.p1);
                    buf.writeBlockPos(payload.p2);
                    buf.writeUtf(payload.targetBlockId);
                    buf.writeUtf(payload.updatesJson);
                    buf.writeBoolean(payload.hasAdvanced);
                    if (payload.hasAdvanced) {
                        buf.writeNbt(payload.advancedPatch);
                    }
                },
                buf -> {
                    BlockPos p1 = buf.readBlockPos();
                    BlockPos p2 = buf.readBlockPos();
                    String targetBlockId = buf.readUtf();
                    String updatesJson = buf.readUtf();
                    boolean hasAdvanced = buf.readBoolean();
                    CompoundTag advancedPatch = hasAdvanced ? buf.readNbt() : null;
                    return new BulkUpdatePayload(p1, p2, targetBlockId, updatesJson, hasAdvanced, advancedPatch);
                }
        );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return ID;
        }
    }

    // C2S - Set Wand Pos
    public record SetWandPosPayload(int pointIndex, BlockPos pos) implements CustomPacketPayload {
        public static final Type<SetWandPosPayload> ID = new Type<>(Identifier.fromNamespaceAndPath("extendednoteblock", "set_wand_pos"));
        public static final StreamCodec<FriendlyByteBuf, SetWandPosPayload> CODEC = StreamCodec.ofMember(
                (payload, buf) -> {
                    buf.writeInt(payload.pointIndex);
                    if (payload.pointIndex != 0) {
                        buf.writeBlockPos(payload.pos);
                    }
                },
                buf -> {
                    int pointIndex = buf.readInt();
                    BlockPos pos = (pointIndex != 0) ? buf.readBlockPos() : null;
                    return new SetWandPosPayload(pointIndex, pos);
                }
        );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return ID;
        }
    }

    // ============== C2S - Preview Request ==============
    public record PreviewRequestPayload(BlockPos pos) implements CustomPacketPayload {
        public static final Type<PreviewRequestPayload> ID = new Type<>(Identifier.fromNamespaceAndPath("extendednoteblock", "preview_request"));
        public static final StreamCodec<FriendlyByteBuf, PreviewRequestPayload> CODEC = StreamCodec.ofMember(
                (payload, buf) -> buf.writeBlockPos(payload.pos),
                buf -> new PreviewRequestPayload(buf.readBlockPos())
        );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return ID;
        }
    }

    // ============== S2C Payloads ==============

    // S2C - Start Sound
    public record StartSoundPayload(
            BlockPos pos, UUID soundId, int instrumentId, int note, int velocity, float initialVolume
    ) implements CustomPacketPayload {
        public static final Type<StartSoundPayload> ID = new Type<>(Identifier.fromNamespaceAndPath("extendednoteblock", "start_sound"));
        public static final StreamCodec<FriendlyByteBuf, StartSoundPayload> CODEC = StreamCodec.ofMember(
                (payload, buf) -> {
                    buf.writeBlockPos(payload.pos);
                    buf.writeUUID(payload.soundId);
                    buf.writeInt(payload.instrumentId);
                    buf.writeInt(payload.note);
                    buf.writeInt(payload.velocity);
                    buf.writeFloat(payload.initialVolume);
                },
                buf -> new StartSoundPayload(
                        buf.readBlockPos(), buf.readUUID(), buf.readInt(), buf.readInt(),
                        buf.readInt(), buf.readFloat()
                )
        );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return ID;
        }
    }

    // S2C - Update Volume
    public record UpdateVolumePayload(UUID soundId, float volume) implements CustomPacketPayload {
        public static final Type<UpdateVolumePayload> ID = new Type<>(Identifier.fromNamespaceAndPath("extendednoteblock", "update_volume"));
        public static final StreamCodec<FriendlyByteBuf, UpdateVolumePayload> CODEC = StreamCodec.ofMember(
                (payload, buf) -> {
                    buf.writeUUID(payload.soundId);
                    buf.writeFloat(payload.volume);
                },
                buf -> new UpdateVolumePayload(buf.readUUID(), buf.readFloat())
        );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return ID;
        }
    }

    // S2C - Stop Sound
    public record StopSoundPayload(UUID soundId) implements CustomPacketPayload {
        public static final Type<StopSoundPayload> ID = new Type<>(Identifier.fromNamespaceAndPath("extendednoteblock", "stop_sound"));
        public static final StreamCodec<FriendlyByteBuf, StopSoundPayload> CODEC = StreamCodec.ofMember(
                (payload, buf) -> buf.writeUUID(payload.soundId),
                buf -> new StopSoundPayload(buf.readUUID())
        );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return ID;
        }
    }

    // S2C - Smooth Move
    public record SmoothMovePayload(double x, double y, double z, boolean isStop) implements CustomPacketPayload {
        public static final Type<SmoothMovePayload> ID = new Type<>(Identifier.fromNamespaceAndPath("extendednoteblock", "smooth_move"));
        public static final StreamCodec<FriendlyByteBuf, SmoothMovePayload> CODEC = StreamCodec.ofMember(
                (payload, buf) -> {
                    buf.writeDouble(payload.x);
                    buf.writeDouble(payload.y);
                    buf.writeDouble(payload.z);
                    buf.writeBoolean(payload.isStop);
                },
                buf -> new SmoothMovePayload(buf.readDouble(), buf.readDouble(), buf.readDouble(), buf.readBoolean())
        );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return ID;
        }
    }

    // S2C - Advanced Update
    public record AdvancedUpdatePayload(
            UUID soundId, float vol, float pitchMul, double x, double y, double z
    ) implements CustomPacketPayload {
        public static final Type<AdvancedUpdatePayload> ID = new Type<>(Identifier.fromNamespaceAndPath("extendednoteblock", "adv_update"));
        public static final StreamCodec<FriendlyByteBuf, AdvancedUpdatePayload> CODEC = StreamCodec.ofMember(
                (payload, buf) -> {
                    buf.writeUUID(payload.soundId);
                    buf.writeFloat(payload.vol);
                    buf.writeFloat(payload.pitchMul);
                    buf.writeDouble(payload.x);
                    buf.writeDouble(payload.y);
                    buf.writeDouble(payload.z);
                },
                buf -> new AdvancedUpdatePayload(
                        buf.readUUID(), buf.readFloat(), buf.readFloat(),
                        buf.readDouble(), buf.readDouble(), buf.readDouble()
                )
        );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return ID;
        }
    }

    // S2C - Start Advanced Sound
    public record StartAdvancedSoundPayload(
            BlockPos pos, UUID soundId, int instrumentId, int note,
            float initialVolume, float initialPitchMul, double x, double y, double z
    ) implements CustomPacketPayload {
        public static final Type<StartAdvancedSoundPayload> ID = new Type<>(Identifier.fromNamespaceAndPath("extendednoteblock", "start_adv_sound"));
        public static final StreamCodec<FriendlyByteBuf, StartAdvancedSoundPayload> CODEC = StreamCodec.ofMember(
                (payload, buf) -> {
                    buf.writeBlockPos(payload.pos);
                    buf.writeUUID(payload.soundId);
                    buf.writeInt(payload.instrumentId);
                    buf.writeInt(payload.note);
                    buf.writeFloat(payload.initialVolume);
                    buf.writeFloat(payload.initialPitchMul);
                    buf.writeDouble(payload.x);
                    buf.writeDouble(payload.y);
                    buf.writeDouble(payload.z);
                },
                buf -> new StartAdvancedSoundPayload(
                        buf.readBlockPos(), buf.readUUID(), buf.readInt(), buf.readInt(),
                        buf.readFloat(), buf.readFloat(),
                        buf.readDouble(), buf.readDouble(), buf.readDouble()
                )
        );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return ID;
        }
    }

    // S2C - Scan Response
    public record ScanResponsePayload(
            BlockPos min, BlockPos max, Map<String, Integer> counts, Map<String, CompoundTag> samples
    ) implements CustomPacketPayload {
        public static final Type<ScanResponsePayload> ID = new Type<>(Identifier.fromNamespaceAndPath("extendednoteblock", "scan_response"));
        public static final StreamCodec<FriendlyByteBuf, ScanResponsePayload> CODEC = StreamCodec.ofMember(
                (payload, buf) -> {
                    buf.writeBlockPos(payload.min);
                    buf.writeBlockPos(payload.max);
                    buf.writeInt(payload.counts.size());
                    for (Map.Entry<String, Integer> entry : payload.counts.entrySet()) {
                        buf.writeUtf(entry.getKey());
                        buf.writeInt(entry.getValue());
                        buf.writeNbt(payload.samples.get(entry.getKey()));
                    }
                },
                buf -> {
                    BlockPos min = buf.readBlockPos();
                    BlockPos max = buf.readBlockPos();
                    int size = readCount(buf, 4096);
                    Map<String, Integer> counts = new HashMap<>();
                    Map<String, CompoundTag> samples = new HashMap<>();
                    for (int i = 0; i < size; i++) {
                        String id = buf.readUtf();
                        int count = buf.readInt();
                        CompoundTag nbt = buf.readNbt();
                        counts.put(id, count);
                        samples.put(id, nbt);
                    }
                    return new ScanResponsePayload(min, max, counts, samples);
                }
        );

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return ID;
        }
    }
}
