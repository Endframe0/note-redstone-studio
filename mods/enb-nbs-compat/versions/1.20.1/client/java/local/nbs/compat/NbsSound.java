package local.nbs.compat;
import net.minecraft.client.sound.AbstractSoundInstance;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
public class NbsSound extends AbstractSoundInstance {
 public NbsSound(Identifier id,BlockPos pos,int note,int velocity) {
  super(id,SoundCategory.RECORDS,Random.create());
  this.x=pos.getX()+.5;this.y=pos.getY()+.5;this.z=pos.getZ()+.5;
  this.volume=velocity/127f;this.pitch=(float)Math.pow(2,(note-66)/12.0);
  this.repeat=false;this.relative=false;this.attenuationType=AttenuationType.LINEAR;
 }
}
