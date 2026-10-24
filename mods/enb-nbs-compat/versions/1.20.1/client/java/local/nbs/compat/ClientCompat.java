package local.nbs.compat;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.MinecraftClient;
import net.minecraft.util.math.BlockPos;
public class ClientCompat implements ClientModInitializer {
 public void onInitializeClient() {ClientPlayNetworking.registerGlobalReceiver(Compat.ID,(client,handler,buf,response)->{var pos=buf.readBlockPos();var voice=buf.readString(64);var note=buf.readInt();var velocity=buf.readInt();client.execute(()->play(client,pos,voice,note,velocity));});}
 private static void play(MinecraftClient client,BlockPos pos,String voice,int note,int velocity) {
  if (!Compat.VOICES.contains(voice)||note<0||note>127||velocity<1||velocity>127) return;
  client.getSoundManager().play(new NbsSound(new net.minecraft.util.Identifier("minecraft", "block.note_block."+voice),pos,note,velocity));
 }
}
