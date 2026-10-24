package com.atemukesu.extendednoteblock.sound;
import com.mojang.blaze3d.audio.SoundBuffer;
import net.minecraft.resources.Identifier;
import java.util.concurrent.CompletableFuture;
public interface SustainBufferProvider {
    CompletableFuture<SoundBuffer> enb$getSustainBuffer(Identifier path);
}
