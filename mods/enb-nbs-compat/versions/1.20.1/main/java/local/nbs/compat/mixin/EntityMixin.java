package local.nbs.compat.mixin;
import local.nbs.compat.*;
import com.atemukesu.extendednoteblock.block.entity.ExtendedNoteBlockEntity;
import net.minecraft.nbt.NbtCompound;
import org.spongepowered.asm.mixin.*;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Mixin(net.minecraft.block.entity.BlockEntity.class)
public abstract class EntityMixin implements CompatNote {
 @Unique private String nbsVoice = "";
 public String nbsVoice() { return nbsVoice; }
 @Inject(method="readNbt", at=@At("TAIL"), remap=true)
 private void nbsRead(NbtCompound nbt, CallbackInfo ci) { if ((Object)this instanceof ExtendedNoteBlockEntity) nbsVoice = nbt.getString("vanillaInstrument"); }
 @Inject(method="writeNbt", at=@At("TAIL"), remap=true)
 private void nbsWrite(NbtCompound nbt, CallbackInfo ci) { if (!nbsVoice.isEmpty()) { nbt.putString("vanillaInstrument",nbsVoice); nbt.putBoolean("oneShot",true); nbt.putBoolean("holdUntilRelease",false); } }
}
