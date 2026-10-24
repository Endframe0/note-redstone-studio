package enbqa;

import com.atemukesu.extendednoteblock.sound.*;
import com.mojang.blaze3d.audio.SoundBuffer;
import net.fabricmc.loader.api.entrypoint.PreLaunchEntrypoint;
import net.minecraft.client.sounds.JOrbisAudioStream;
import org.lwjgl.openal.*;
import java.nio.*;
import java.nio.file.*;
import javax.sound.sampled.*;
import java.io.*;

/** No window/device output: transformed Minecraft buffers rendered with OpenAL Soft loopback. */
public class AudioAudit implements PreLaunchEntrypoint {
    static int assertions;
    static void check(boolean test, String label) {
        if (!test) throw new AssertionError(label);
        assertions++; System.out.println("ENB_SUSTAIN_PASS " + label);
    }
    static float[] render(long device, int frames) {
        float[] pcm = new float[frames]; SOFTLoopback.alcRenderSamplesSOFT(device, pcm, frames); return pcm;
    }
    static double rms(float[] pcm) { double v=0; for(float f:pcm)v+=f*f;return Math.sqrt(v/pcm.length); }
    static int upload(SoundBuffer buffer) throws Exception {
        var method = SoundBuffer.class.getDeclaredMethod("getAlBuffer");method.setAccessible(true);
        return ((java.util.OptionalInt)method.invoke(buffer)).orElseThrow();
    }
    public void onPreLaunch() {
        try {
            // Fail if a new injection no longer matches a supported client version.
            for (String name : new String[]{"net.minecraft.client.sounds.SoundEngine", "net.minecraft.client.sounds.SoundBufferLibrary", "com.mojang.blaze3d.audio.SoundBuffer"})
                Class.forName(name, false, getClass().getClassLoader());
            long device=SOFTLoopback.alcLoopbackOpenDeviceSOFT((String)null);
            check(device!=0,"loopback device");
            long context=ALC10.alcCreateContext(device,new int[]{ALC10.ALC_FREQUENCY,48000,
                    SOFTLoopback.ALC_FORMAT_CHANNELS_SOFT,SOFTLoopback.ALC_MONO_SOFT,
                    SOFTLoopback.ALC_FORMAT_TYPE_SOFT,SOFTLoopback.ALC_FLOAT_SOFT,0});
            check(context!=0 && ALC10.alcMakeContextCurrent(context),"loopback context");
            AL.createCapabilities(ALC.createCapabilities(device));
            check(AL.getCapabilities().AL_SOFT_loop_points,"sample loop extension");
            for (String path : Files.readAllLines(Path.of(System.getProperty("enb.qa.samples")))) {
                String[] row=path.split("\\|",2); String name=row[0];
                try(var stream=new JOrbisAudioStream(Files.newInputStream(Path.of(row[1])))) {
                    var format=stream.getFormat();var pcm=stream.readAll();
                    var result=SustainPcm.prepare(pcm.duplicate(),format);
                    check(result.start()>0 && result.end()>result.start(),name+" valid loop retains attack");
                    var sustained=new SustainSoundBuffer(result,format);
                    int buffer=upload(sustained), source=AL10.alGenSources();
                    int[] points=new int[2];AL11.alGetBufferiv(buffer,SOFTLoopPoints.AL_LOOP_POINTS_SOFT,points);
                    check(points[0]==result.start() && points[1]==result.end(),name+" actual loop points");
                    // Sharing an already attached buffer must not reset OpenAL loop points.
                    AL10.alSourcei(source,AL10.AL_BUFFER,buffer);upload(sustained);
                    check(AL10.alGetError()==0,name+" buffer reusable while attached");
                    AL10.alSourcei(source,AL10.AL_LOOPING,AL10.AL_TRUE);AL10.alSourcef(source,AL10.AL_GAIN,.3f);
                    AL10.alSourcePlay(source);render(device,48000*3);
                    float[] held=render(device,24000);double level=rms(held);
                    check(AL10.alGetSourcei(source,AL10.AL_SOURCE_STATE)==AL10.AL_PLAYING && level>.00001,name+" audible after 3 seconds");
                    AL10.alSourcef(source,AL10.AL_GAIN,.03f);render(device,4800);
                    double quiet=rms(render(device,24000));
                    check(quiet<level*.2 && quiet>level*.04,name+" envelope controls ongoing sample");
                    AL10.alSourcef(source,AL10.AL_PITCH,4f);render(device,48000);
                    check(AL10.alGetSourcei(source,AL10.AL_SOURCE_STATE)==AL10.AL_PLAYING,name+" high pitch still sustains");
                    AL10.alSourceStop(source);render(device,4800);
                    check(rms(render(device,4800))<.000001,name+" stop becomes silence");
                    AL10.alDeleteSources(source);sustained.discardAlBuffer();
                    var natural=new SoundBuffer(pcm.duplicate(),format);buffer=upload(natural);source=AL10.alGenSources();
                    AL10.alSourcei(source,AL10.AL_BUFFER,buffer);AL10.alSourcePlay(source);
                    int naturalSeconds = 1 + (int)Math.ceil(pcm.remaining() / (format.getFrameSize() * format.getSampleRate()));
                    for(int second=0;second<naturalSeconds;second++)render(device,48000);
                    check(AL10.alGetSourcei(source,AL10.AL_SOURCE_STATE)==AL10.AL_STOPPED,name+" natural one-shot still ends");
                    AL10.alDeleteSources(source);natural.discardAlBuffer();
                    check(AL10.alGetError()==0,name+" no OpenAL error");
                }
            }
            ALC10.alcMakeContextCurrent(0);ALC10.alcDestroyContext(context);ALC10.alcCloseDevice(device);
            System.out.println("ENB_SUSTAIN_COMPLETE assertions="+assertions);System.exit(0);
        } catch(Throwable failure) {failure.printStackTrace();System.exit(23);}
    }
}
