package local.nbs.compat.mixin;
import local.nbs.compat.*;
import com.atemukesu.extendednoteblock.block.ExtendedNoteBlockBlock;
import com.atemukesu.extendednoteblock.block.entity.ExtendedNoteBlockEntity;
import net.minecraft.world.World;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Mixin(value=ExtendedNoteBlockBlock.class, remap=false)
public abstract class BlockMixin {
 @Inject(method="triggerNote", at=@At("HEAD"), cancellable=true, remap=false)
 private void nbsPlay(World world, BlockPos pos, CallbackInfo ci) {
  if (world instanceof ServerWorld server && world.getBlockEntity(pos) instanceof ExtendedNoteBlockEntity entity && entity instanceof CompatNote data && Compat.VOICES.contains(data.nbsVoice())) {
   Compat.emit(server,pos,data.nbsVoice(),entity.getNote(),entity.getVelocity());ci.cancel();
  }
 }
}
