package com.atemukesu.extendednoteblock.mixin.client;
import com.atemukesu.extendednoteblock.sound.StoppablePositionalSoundInstance;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.client.sounds.SoundEngine;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
/** Keep extended pitches and the original 48-block radius local to ENB sounds. */
@Mixin(SoundEngine.class)
public abstract class SoundSystemMixin {
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
