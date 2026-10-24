package com.atemukesu.extendednoteblock.network;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.core.BlockPos;
import java.util.UUID;
/** Test-only packet sink. Never packaged into the mod. */
public class ModMessages {
    public static float lastVolume;
    public static void sendAdvancedUpdateToClients(ServerLevel world,BlockPos pos,UUID id,float volume,float pitch,double x,double y,double z){lastVolume=volume;}
}
