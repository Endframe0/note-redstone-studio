package com.atemukesu.extendednoteblock.mixin.client;
import net.minecraft.sounds.SoundEvent;
import org.spongepowered.asm.mixin.Mixin;
/** ENB attenuation is scoped in SoundSystemMixin instead of changing all vanilla sounds. */
@Mixin(SoundEvent.class)
public abstract class SoundEventMixin { }
