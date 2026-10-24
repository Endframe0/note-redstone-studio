package com.atemukesu.extendednoteblock.sound;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
/** GM sample playback plus precisely pitched vanilla instruments for NBS conversion. */
public class ClientSoundManager {
    private static final Map<UUID, StoppablePositionalSoundInstance> PLAYING_SOUNDS = new ConcurrentHashMap<>();
    private static final float MIN_ALIVE_VOLUME = 0.0001f;
    public static final String[] VANILLA_INSTRUMENTS = {
        "harp", "bass", "basedrum", "snare", "hat", "guitar", "flute", "bell", "chime", "xylophone",
        "iron_xylophone", "cow_bell", "didgeridoo", "bit", "banjo", "pling", "trumpet",
        "trumpet_exposed", "trumpet_weathered", "trumpet_oxidized"
    };
    private record Sample(Identifier id, float pitch, boolean oneShot) { }
    private static Sample resolveSample(int instrument, int note) {
        if (note < 0 || note > 127) return null;
        boolean oneShot = instrument <= -1001 && instrument >= -1020;
        int vanilla = oneShot ? -instrument - 1001 : -instrument - 1;
        if (instrument < 0) {
            if (vanilla < 0 || vanilla >= VANILLA_INSTRUMENTS.length) return null;
            return new Sample(Identifier.fromNamespaceAndPath("minecraft", "block.note_block." + VANILLA_INSTRUMENTS[vanilla]),
                    (float) Math.pow(2.0, (note - 66) / 12.0), oneShot);
        }
        SoundPackInfo pack = SoundPackManager.getInstance().getActivePackInfo();
        if (pack == null || pack.availableNotes().isEmpty()) return null;
        int closest = pack.getClosestNoteFor(instrument, note);
        float pitch = (float) Math.pow(2.0, (note - closest) / 12.0);
        if (instrument == 128) {
            if (!pack.availableNotes().getOrDefault(instrument, List.of()).contains(note)) return null;
            closest = note; pitch = 1.0f;
        }
        return new Sample(Identifier.fromNamespaceAndPath("extendednoteblock", "notes." + instrument + "." + closest), pitch, false);
    }
    public static void playSound(BlockPos pos, UUID soundId, int instrumentId, int note, int velocity, float initialVolume) {
        stopSound(soundId);
        Sample sample = resolveSample(instrumentId, note);
        if (sample == null) return;
        StoppablePositionalSoundInstance instance = new StoppablePositionalSoundInstance(
                SoundEvent.createVariableRangeEvent(sample.id), SoundSource.RECORDS,
                Math.max(initialVolume, MIN_ALIVE_VOLUME), sample.pitch, pos);
        if (!sample.oneShot) PLAYING_SOUNDS.put(soundId, instance);
        Minecraft.getInstance().getSoundManager().play(instance);
    }
    public static void updateVolume(UUID id, float volume) {
        StoppablePositionalSoundInstance sound = PLAYING_SOUNDS.get(id);
        if (sound != null) sound.setVolume(Math.max(volume, MIN_ALIVE_VOLUME));
    }
    public static void stopSound(UUID id) {
        StoppablePositionalSoundInstance sound = PLAYING_SOUNDS.remove(id);
        if (sound != null) sound.stopSound();
    }
    public static void stopSound(BlockPos pos) {
        PLAYING_SOUNDS.values().removeIf(sound -> {
            if (!sound.getOriginPos().equals(pos)) return false;
            sound.stopSound(); return true;
        });
    }
    public static void playAdvancedSound(BlockPos pos, UUID soundId, int instrumentId, int note,
            float initialVol, float initialPitchMul, double x, double y, double z) {
        stopSound(soundId);
        Sample sample = resolveSample(instrumentId, note);
        if (sample == null) return;
        StoppablePositionalSoundInstance sound = new StoppablePositionalSoundInstance(
                SoundEvent.createVariableRangeEvent(sample.id), SoundSource.RECORDS,
                Math.max(initialVol, MIN_ALIVE_VOLUME), sample.pitch * initialPitchMul, pos);
        sound.setPosition(x, y, z);
        sound.setBasePitch(sample.pitch);
        if (!sample.oneShot) PLAYING_SOUNDS.put(soundId, sound);
        Minecraft.getInstance().getSoundManager().play(sound);
    }
    public static void updateAdvanced(UUID id, float volume, float pitchMul, double x, double y, double z) {
        StoppablePositionalSoundInstance sound = PLAYING_SOUNDS.get(id);
        if (sound == null) return;
        sound.setVolume(Math.max(volume, MIN_ALIVE_VOLUME));
        sound.setPitch(sound.getBasePitch() * pitchMul);
        sound.setPosition(x, y, z);
    }
    public static void clear() {
        PLAYING_SOUNDS.values().forEach(StoppablePositionalSoundInstance::stopSound);
        PLAYING_SOUNDS.clear();
    }
}
