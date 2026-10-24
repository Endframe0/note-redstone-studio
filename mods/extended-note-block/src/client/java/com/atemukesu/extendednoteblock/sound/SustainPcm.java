package com.atemukesu.extendednoteblock.sound;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import javax.sound.sampled.AudioFormat;

/** Attack followed by an overlapping sustain loop. No pitch/time stretching. */
public final class SustainPcm {
    public record Result(ByteBuffer pcm, int start, int end) { }

    /** Build a phase-locked periodic sustain instead of crossfading unrelated phases. */
    public static Result prepare(ByteBuffer input, AudioFormat format) {
        if (format.getSampleSizeInBits() != 16 || !AudioFormat.Encoding.PCM_SIGNED.equals(format.getEncoding()))
            throw new IllegalArgumentException("ENB sustain requires signed 16-bit PCM");
        int channels = format.getChannels(), stride = channels * 2;
        ByteOrder order = format.isBigEndian() ? ByteOrder.BIG_ENDIAN : ByteOrder.LITTLE_ENDIAN;
        ByteBuffer source = input.slice().order(order);
        int frames = source.remaining() / stride, rate = (int)format.getSampleRate();
        if (frames < 64) return noiseLoop(input, format);
        int start = Math.min(rate * 8 / 100, frames / 4);
        int window = Math.min(rate * 15 / 100, frames - start);
        double[][] samples = new double[channels][window];
        double[] mono = new double[window];
        for (int ch = 0; ch < channels; ch++) {
            double mean = 0;
            for (int i=0;i<window;i++) mean += source.getShort((start+i)*stride+ch*2);
            mean /= window;
            for (int i=0;i<window;i++) {
                samples[ch][i] = source.getShort((start+i)*stride+ch*2)-mean;
                // Start with one channel to avoid anti-phase stereo cancellation.
                if (ch==0) mono[i] = samples[ch][i];
            }
        }
        double strongest=-1;
        for(double[] channel:samples){double energy=0;for(double v:channel)energy+=v*v;if(energy>strongest){strongest=energy;mono=channel;}}
        int low=Math.max(4,rate/4000), high=Math.min(rate/40,window/3);
        if(high<=low+2)return noiseLoop(input,format);
        double[] corr=new double[high+1]; double best=-1;
        for(int lag=low;lag<=high;lag++) {
            double aa=0,bb=0,ab=0;
            for(int i=0;i<window-high;i+=2){double a=mono[i],b=mono[i+lag];aa+=a*a;bb+=b*b;ab+=a*b;}
            corr[lag]=ab/Math.sqrt(Math.max(1,aa*bb));best=Math.max(best,corr[lag]);
        }
        if(best<.60)return noiseLoop(input,format); // unpitched percussion
        int lag=-1;
        for(int i=low+1;i<high;i++)if(corr[i]>=Math.max(.60,best*.97)&&corr[i]>=corr[i-1]&&corr[i]>corr[i+1]){lag=i;break;}
        if(lag<0)return noiseLoop(input,format);
        double curvature=corr[lag-1]-2*corr[lag]+corr[lag+1];
        double period=lag+(Math.abs(curvature)>1e-9?Math.clamp(.5*(corr[lag-1]-corr[lag+1])/curvature,-.5,.5):0);
        int cycles=Math.max(1,(int)(window/period)-1), bins=1024;
        double[][] table=new double[channels][bins];
        for(int ch=0;ch<channels;ch++) {
            double targetEnergy=0,energy=0,peak=0;
            for(double value:samples[ch])targetEnergy+=value*value;
            for(int i=0;i<bins;i++) {
                double value=0;
                for(int c=0;c<cycles;c++)value+=interpolate(samples[ch],(c+(double)i/bins)*period);
                table[ch][i]=value/cycles;energy+=table[ch][i]*table[ch][i];peak=Math.max(peak,Math.abs(table[ch][i]));
            }
            double gain=Math.min(Math.sqrt(targetEnergy/window/Math.max(1,energy/bins)),32700/Math.max(1,peak));
            for(int i=0;i<bins;i++)table[ch][i]*=gain;
        }
        // 32 periods make rounding error much smaller than a one-sample-period loop.
        int loopFrames=Math.max(32,(int)Math.round(period*32));
        double step=32.0/loopFrames;
        int fade=Math.min(window/2,Math.max(rate/40,(int)Math.ceil(period*4)));
        int loopStart=start+fade, end=loopStart+loopFrames;
        ByteBuffer pcm=ByteBuffer.allocateDirect(end*stride).order(order);
        for(int i=0;i<end;i++)for(int ch=0;ch<channels;ch++){
            double value;
            if(i<start)value=source.getShort(i*stride+ch*2);
            else {
                double phase=(i-start)*step;
                value=periodic(table[ch],(phase-Math.floor(phase))*bins);
                if(i<loopStart){double u=(double)(i-start)/fade;u=u*u*(3-2*u);value=source.getShort(i*stride+ch*2)*(1-u)+value*u;}
            }
            pcm.putShort((short)Math.clamp(Math.round(value),-32768,32767));
        }
        pcm.flip();return new Result(pcm,loopStart,end);
    }
    private static double interpolate(double[] samples,double at){int i=(int)at;double u=at-i;return samples[i]*(1-u)+samples[Math.min(i+1,samples.length-1)]*u;}
    private static double periodic(double[] table,double at){int i=(int)at;double u=at-i;return table[i%table.length]*(1-u)+table[(i+1)%table.length]*u;}

    private static Result noiseLoop(ByteBuffer input, AudioFormat format) {
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
