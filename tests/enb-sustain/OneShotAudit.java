package enbqa;

import com.atemukesu.extendednoteblock.sound.*;
import com.atemukesu.extendednoteblock.network.ModPayloads.StartSoundPayload;
import net.minecraft.core.BlockPos;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.client.sounds.SoundBufferLibrary;
import net.minecraft.server.packs.resources.ResourceProvider;
import net.minecraft.server.packs.resources.Resource;
import com.mojang.blaze3d.audio.SoundBuffer;
import io.netty.buffer.Unpooled;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import org.objectweb.asm.*;
import org.lwjgl.openal.*;

/** Exercises the real signed packet codec, sample selector and transformed buffer redirect. */
public final class OneShotAudit {
    public static void run(long device) throws Exception {
        if(net.fabricmc.loader.api.FabricLoader.getInstance().isModLoaded("noteblock_flat_audio")) checkTailCompatibility();
        var resolver = ClientSoundManager.class.getDeclaredMethod("resolveSample", int.class, int.class);
        resolver.setAccessible(true);
        for (int index=0; index<20; index++) {
            var outgoing = new StartSoundPayload(BlockPos.ZERO, UUID.randomUUID(), -1001-index, 66, 100, 100f/127);
            var wire = new FriendlyByteBuf(Unpooled.buffer());
            StartSoundPayload.CODEC.encode(wire, outgoing);
            var incoming = StartSoundPayload.CODEC.decode(wire); wire.release();
            AudioAudit.check(incoming.instrumentId()==outgoing.instrumentId(), "oneShot packet preserves instrument "+index);
            Object sample = resolver.invoke(null, incoming.instrumentId(), incoming.note());
            var flag=sample.getClass().getDeclaredMethod("oneShot"); flag.setAccessible(true);
            AudioAudit.check((boolean)flag.invoke(sample), "client recognizes natural instrument "+index);
            AudioAudit.check(!(boolean)flag.invoke(resolver.invoke(null,-1-index,66)), "client retains timed instrument "+index);
        }
        // Regression: preview must share the redstone entry point, never force 20-tick playback.
        final int[] previewCalls = new int[2];
        try(var in=OneShotAudit.class.getResourceAsStream("/com/atemukesu/extendednoteblock/block/ExtendedNoteBlockBlock.class")) {
            new ClassReader(in).accept(new ClassVisitor(Opcodes.ASM9) {
                public MethodVisitor visitMethod(int access,String name,String desc,String sig,String[] ex) {
                    if (!name.equals("previewNote")) return null;
                    return new MethodVisitor(Opcodes.ASM9) {
                        public void visitMethodInsn(int opcode,String owner,String name,String desc,boolean itf) {
                            if (name.equals("triggerNote")) previewCalls[0]++;
                            if (name.equals("playSound")) previewCalls[1]++;
                        }
                    };
                }
            },0);
        }
        AudioAudit.check(previewCalls[0]==1 && previewCalls[1]==0,"preview uses actual block policy");
        // Invoke the applied SoundEngine mixin, with a real library and actual game samples.
        var engineClass=Class.forName("net.minecraft.client.sounds.SoundEngine");
        var unsafeField=sun.misc.Unsafe.class.getDeclaredField("theUnsafe"); unsafeField.setAccessible(true);
        var unsafe=(sun.misc.Unsafe)unsafeField.get(null);
        Object engine=unsafe.allocateInstance(engineClass);
        var redirect=Arrays.stream(engineClass.getDeclaredMethods())
                .filter(m->m.getName().contains("enb$sustainBuffer")).findFirst().orElseThrow();
        redirect.setAccessible(true);
        for(String row:Files.readAllLines(Path.of(System.getProperty("enb.qa.samples")))) {
            String[] pair=row.split("\\|",2);
            if(!List.of("guitar","bell","chime").contains(pair[0])) continue;
            var id=Identifier.fromNamespaceAndPath("minecraft","sounds/note/"+pair[0]+".ogg");
            var library=new SoundBufferLibrary(new ResourceProvider() {
                public Optional<Resource> getResource(Identifier unused) { return Optional.empty(); }
                public java.io.InputStream open(Identifier unused) throws java.io.IOException {return Files.newInputStream(Path.of(pair[1]));}
            });
            var event=SoundEvent.createVariableRangeEvent(id);
            var natural=new StoppablePositionalSoundInstance(event,SoundSource.RECORDS,1,1,BlockPos.ZERO,false);
            var timed=new StoppablePositionalSoundInstance(event,SoundSource.RECORDS,1,1,BlockPos.ZERO,true);
            var original=library.getCompleteBuffer(id).join();
            SoundBuffer held=(SoundBuffer)((CompletableFuture<?>)redirect.invoke(engine,library,id,timed)).join();
            SoundBuffer once=(SoundBuffer)((CompletableFuture<?>)redirect.invoke(engine,library,id,natural)).join();
            AudioAudit.check(held instanceof SustainSoundBuffer,pair[0]+" timed uses sustain buffer");
            AudioAudit.check(once==original && !(once instanceof SustainSoundBuffer),pair[0]+" oneShot uses unchanged vanilla buffer after sustain");
            AudioAudit.check(!natural.isLooping() && timed.isLooping(),pair[0]+" independent loop states");
            double rawSeconds;
            try(var stream=new net.minecraft.client.sounds.JOrbisAudioStream(Files.newInputStream(Path.of(pair[1])))) {
                var format=stream.getFormat();
                rawSeconds=stream.readAll().remaining()/(format.getFrameSize()*(double)format.getSampleRate());
            }
            int index=Arrays.asList(ClientSoundManager.VANILLA_INSTRUMENTS).indexOf(pair[0]);
            for(int note:new int[]{42,53,54,66,78,79,90}) {
                Object sample=resolver.invoke(null,-1001-index,note);
                var flag=sample.getClass().getDeclaredMethod("oneShot"); flag.setAccessible(true);
                var pitchMethod=sample.getClass().getDeclaredMethod("pitch"); pitchMethod.setAccessible(true);
                float pitch=(float)pitchMethod.invoke(sample);
                AudioAudit.check((boolean)flag.invoke(sample),pair[0]+" natural mode at note "+note);
                int source=AL10.alGenSources();
                AL10.alSourcei(source,AL10.AL_BUFFER,AudioAudit.upload(once));
                AL10.alSourcei(source,AL10.AL_LOOPING,natural.isLooping()?AL10.AL_TRUE:AL10.AL_FALSE);
                AL10.alSourcef(source,AL10.AL_PITCH,pitch);
                AL10.alSourcePlay(source);
                double elapsed=0,expected=rawSeconds/pitch;
                while(AL10.alGetSourcei(source,AL10.AL_SOURCE_STATE)==AL10.AL_PLAYING && elapsed<expected+1) {
                    AudioAudit.render(device,4800);elapsed+=.1;
                }
                AudioAudit.check(AL10.alGetSourcei(source,AL10.AL_SOURCE_STATE)==AL10.AL_STOPPED
                        && Math.abs(elapsed-expected)<.15,pair[0]+" ends naturally at note "+note);
                System.out.println("ENB_ONESHOT_DURATION instrument="+pair[0]+" note="+note+" pitch="+pitch+" expected="+expected+" actual="+elapsed);
                AL10.alDeleteSources(source);
            }
            library.clear();
        }
    }

    private static void checkTailCompatibility() throws Exception {
        var wrap=Arrays.stream(ClientSoundManager.class.getDeclaredMethods())
                .filter(m->m.getName().contains("flat$play") && m.getParameterCount()==4 && m.getParameterTypes()[3]==int.class).findFirst().orElseThrow();
        wrap.setAccessible(true);
        System.out.println("ENB_TAIL_HOOK "+wrap);
        var operation=java.lang.reflect.Proxy.newProxyInstance(OneShotAudit.class.getClassLoader(),
                new Class<?>[]{wrap.getParameterTypes()[2]},(proxy,method,args)->null);
        for(float pitch:new float[]{.25f,.49f,.5f,1,2,4}) {
            var sound=new StoppablePositionalSoundInstance(SoundEvent.createVariableRangeEvent(
                    Identifier.fromNamespaceAndPath("minecraft","block.note_block.chime")),
                    SoundSource.RECORDS,1,pitch,BlockPos.ZERO,false);
            wrap.invoke(null,null,sound,operation,-1009);
            for(int tick=0;tick<24;tick++) sound.tick();
            AudioAudit.check(sound.isStopped()==(pitch<.5f),"flat audio low-tail cutoff at pitch "+pitch);
            AudioAudit.check(!sound.isLooping(),"flat audio preserves oneShot at pitch "+pitch);
        }
    }
}
