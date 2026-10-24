package local.nbs.compat.mixin;
import local.nbs.compat.*;
import net.minecraft.client.sound.SoundSystem;
import net.minecraft.client.sound.SoundInstance;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
@Mixin(value=SoundSystem.class,priority=1500)
public abstract class SoundMixin {
 @Inject(method="getAdjustedPitch",at=@At("HEAD"),cancellable=true)
 private void nbsPitch(SoundInstance sound,CallbackInfoReturnable<Float> ci) {if(sound instanceof NbsSound) ci.setReturnValue(sound.getPitch());}
 @ModifyVariable(method="play",at=@At("STORE"),ordinal=1)
 private float nbsRadius(float original,SoundInstance sound) {return sound instanceof NbsSound?48f:original;}
}
