package com.atemukesu.extendednoteblock.sound;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import javax.sound.sampled.AudioFormat;

/** Attack followed by an overlapping sustain loop. No pitch/time stretching. */
public final class SustainPcm {
    public record Result(ByteBuffer pcm, int start, int end) { }

    public static Result prepare(ByteBuffer input, AudioFormat format) {
        if (format.getSampleSizeInBits() != 16 || !AudioFormat.Encoding.PCM_SIGNED.equals(format.getEncoding()))
            throw new IllegalArgumentException("ENB sustain requires signed 16-bit PCM");
        int channels = format.getChannels(), stride = channels * 2;
        int frames = input.remaining() / stride;
        if (frames < 16) throw new IllegalArgumentException("ENB sustain sample is empty or too short");
        ByteOrder order = format.isBigEndian() ? ByteOrder.BIG_ENDIAN : ByteOrder.LITTLE_ENDIAN;
        ByteBuffer source = input.slice().order(order);
        int rate = (int) format.getSampleRate();
        int span = Math.max(8, Math.min(rate / 8, frames / 2));
        int first = Math.min(rate / 25, frames / 8); // retain at least the initial attack
        int last = Math.min(frames - span, rate / 2);
        int best = first;
        double bestEnergy = -1;
        // Use an audible region after the attack, not the silent/decayed end.
        for (int start = first; start <= last; start += Math.max(1, rate / 200)) {
            double energy = 0;
            for (int i = start; i < start + span; i += 4)
                for (int ch = 0; ch < channels; ch++) {
                    double v = source.getShort(i * stride + ch * 2);
                    energy += v * v;
                }
            if (energy > bestEnergy) { bestEnergy = energy; best = start; }
        }
        int end = best + span, fade = Math.max(2, span / 4);
        ByteBuffer pcm = ByteBuffer.allocateDirect(end * stride).order(order);
        ByteBuffer prefix = source.duplicate(); prefix.limit(end * stride); pcm.put(prefix);
        // At the end, continue into the beginning of the loop; skip its overlapped
        // frames on wrap. Smoothstep makes both splice endpoints continuous.
        for (int i = 0; i < fade; i++) {
            double u = (double)i / (fade - 1), blend = u * u * (3 - 2 * u);
            for (int ch = 0; ch < channels; ch++) {
                int dest = (end - fade + i) * stride + ch * 2;
                double a = source.getShort(dest), b = source.getShort((best + i) * stride + ch * 2);
                pcm.putShort(dest, (short)Math.round(a + (b - a) * blend));
            }
        }
        pcm.flip();
        return new Result(pcm, best + fade, end);
    }
    private SustainPcm() { }
}
