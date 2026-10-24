package local.nbs.compat;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.network.RegistryByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;
public record Play(BlockPos pos,String voice,int note,int velocity) implements CustomPayload {
 public static final Id<Play> ID=new Id<>(Identifier.of("enb_nbs_compat", "play"));
 public static final PacketCodec<RegistryByteBuf,Play> CODEC=new PacketCodec<>() {
  public Play decode(RegistryByteBuf b) {return new Play(b.readBlockPos(),b.readString(64),b.readInt(),b.readInt());}
  public void encode(RegistryByteBuf b,Play p) {b.writeBlockPos(p.pos);b.writeString(p.voice);b.writeInt(p.note);b.writeInt(p.velocity);}
 };
 public Id<? extends CustomPayload> getId(){return ID;}
}
