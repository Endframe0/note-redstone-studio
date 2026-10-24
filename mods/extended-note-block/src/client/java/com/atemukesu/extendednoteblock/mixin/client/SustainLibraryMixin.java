package com.atemukesu.extendednoteblock.mixin.client;
import com.atemukesu.extendednoteblock.sound.*;
import com.mojang.blaze3d.audio.SoundBuffer;
import net.minecraft.client.sounds.AudioStream;
import net.minecraft.client.sounds.SoundBufferLibrary;
import net.minecraft.resources.Identifier;
import org.spongepowered.asm.mixin.*;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import java.util.Map;
import java.util.concurrent.*;
@Mixin(SoundBufferLibrary.class)
public abstract class SustainLibraryMixin implements SustainBufferProvider {
    @Shadow public abstract CompletableFuture<AudioStream> getStream(Identifier path, boolean loop);
    @Unique private final Map<Identifier, CompletableFuture<SoundBuffer>> enb$sustains = new ConcurrentHashMap<>();
    @Override public CompletableFuture<SoundBuffer> enb$getSustainBuffer(Identifier path) {
        return enb$sustains.computeIfAbsent(path, id -> getStream(id, false).thenApply(stream -> {
            try (stream) {
                var format = stream.getFormat();
                // A bounded prefix is sufficient to retain attack and find a loop.
                var data = stream.read((int)(format.getSampleRate() * format.getFrameSize()));
                return new SustainSoundBuffer(SustainPcm.prepare(data, format), format);
            } catch (java.io.IOException e) { throw new CompletionException(e); }
        }));
    }
    @Inject(method="clear", at=@At("HEAD"))
    private void enb$clear(CallbackInfo ci) {
        enb$sustains.values().forEach(future -> future.thenAccept(SoundBuffer::discardAlBuffer));
        enb$sustains.clear();
    }
}
