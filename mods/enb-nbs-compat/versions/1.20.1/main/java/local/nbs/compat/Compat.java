package local.nbs.compat;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.networking.v1.*;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;
import java.util.Set;
public class Compat implements ModInitializer {
 public static final Set<String> VOICES=Set.of("harp","bass","basedrum","snare","hat","guitar","flute","bell","chime","xylophone","iron_xylophone","cow_bell","didgeridoo","bit","banjo","pling");
 public static final Identifier ID=new Identifier("enb_nbs_compat", "play");
 public void onInitialize() {}
 public static void emit(ServerWorld world,BlockPos pos,String voice,int note,int velocity) { for (var player:PlayerLookup.tracking(world,pos)) {var buf=PacketByteBufs.create();buf.writeBlockPos(pos);buf.writeString(voice);buf.writeInt(note);buf.writeInt(velocity);ServerPlayNetworking.send(player,ID,buf);} }
}