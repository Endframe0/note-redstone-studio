package local.nbs.compat;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.MinecraftClient;
import net.minecraft.util.math.BlockPos;
public class ClientCompat implements ClientModInitializer {
 public void onInitializeClient() {ClientPlayNetworking.registerGlobalReceiver(Play.ID,(p,c)->c.client().execute(()->play(c.client(),p.pos(),p.voice(),p.note(),p.velocity())));}
 private static void play(MinecraftClient client,BlockPos pos,String voice,int note,int velocity) {
  if (!Compat.VOICES.contains(voice)||note<0||note>127||velocity<1||velocity>127) return;
  client.getSoundManager().play(new NbsSound(net.minecraft.util.Identifier.of("minecraft", "block.note_block."+voice),pos,note,velocity));
 }
}
