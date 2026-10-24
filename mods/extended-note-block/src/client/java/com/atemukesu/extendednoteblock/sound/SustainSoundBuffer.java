package com.atemukesu.extendednoteblock.sound;

import com.mojang.blaze3d.audio.SoundBuffer;
import javax.sound.sampled.AudioFormat;
import org.lwjgl.openal.AL;
import org.lwjgl.openal.AL11;
import org.lwjgl.openal.SOFTLoopPoints;

/** Dedicated buffer: never alter the vanilla/shared one-shot buffer. */
public final class SustainSoundBuffer extends SoundBuffer {
    private final int start, end;
    private boolean configured;
    public SustainSoundBuffer(SustainPcm.Result result, AudioFormat format) {
        super(result.pcm(), format); start = result.start(); end = result.end();
    }
    public void configureLoop(int buffer) {
        if (configured) return;
        if (AL.getCapabilities().AL_SOFT_loop_points)
            AL11.alBufferiv(buffer, SOFTLoopPoints.AL_LOOP_POINTS_SOFT, new int[]{start, end});
        // OpenAL Soft bundled with Minecraft supports loop points. Other backends
        // still sustain by looping the buffer, but may repeat the initial attack.
        configured = true;
    }
}
