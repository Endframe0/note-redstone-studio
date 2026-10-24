package com.atemukesu.extendednoteblock.mixin.client;
import com.atemukesu.extendednoteblock.sound.StoppablePositionalSoundInstance;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.client.sounds.SoundEngine;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.Redirect;
import com.mojang.blaze3d.audio.SoundBuffer;
import net.minecraft.client.resources.sounds.Sound;
import net.minecraft.client.sounds.SoundBufferLibrary;
import net.minecraft.resources.Identifier;
import com.atemukesu.extendednoteblock.sound.SustainBufferProvider;
import java.util.concurrent.CompletableFuture;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
/** Keep extended pitches and the original 48-block radius local to ENB sounds. */
@Mixin(SoundEngine.class)
public abstract class SoundSystemMixin {
    @Redirect(method = "play", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/resources/sounds/Sound;shouldStream()Z"))
    private boolean enb$staticSustain(Sound sound, SoundInstance instance) {
        return !(instance instanceof StoppablePositionalSoundInstance && instance.isLooping()) && sound.shouldStream();
    }
    @Redirect(method = "play", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/sounds/SoundBufferLibrary;getCompleteBuffer(Lnet/minecraft/resources/Identifier;)Ljava/util/concurrent/CompletableFuture;"))
    private CompletableFuture<SoundBuffer> enb$sustainBuffer(SoundBufferLibrary library, Identifier path, SoundInstance instance) {
        return instance instanceof StoppablePositionalSoundInstance && instance.isLooping()
                ? ((SustainBufferProvider)library).enb$getSustainBuffer(path) : library.getCompleteBuffer(path);
    }
    @ModifyVariable(method = "play", at = @At("STORE"), ordinal = 1)
    private float enb$attenuation(float original, SoundInstance instance) {
        return instance instanceof StoppablePositionalSoundInstance ? 48.0f : original;
    }
    @Inject(method = "calculatePitch", at = @At("HEAD"), cancellable = true)
    private void enb$unclampedPitch(SoundInstance instance, CallbackInfoReturnable<Float> cir) {
        if (instance instanceof StoppablePositionalSoundInstance) {
            float pitch = instance.getPitch();
            cir.setReturnValue(Float.isFinite(pitch) && pitch > 0 ? pitch : 1.0f);
        }
    }
}
