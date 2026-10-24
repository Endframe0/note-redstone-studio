package com.atemukesu.extendednoteblock.mixin.client;
import com.mojang.blaze3d.audio.SoundBuffer;
import com.atemukesu.extendednoteblock.sound.SustainSoundBuffer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import java.util.OptionalInt;
@Mixin(SoundBuffer.class)
public abstract class SustainBufferMixin {
    @Inject(method="getAlBuffer", at=@At("RETURN"))
    private void enb$loopPoints(CallbackInfoReturnable<OptionalInt> ci) {
        if ((Object)this instanceof SustainSoundBuffer sustain && ci.getReturnValue().isPresent())
            sustain.configureLoop(ci.getReturnValue().getAsInt());
    }
}
