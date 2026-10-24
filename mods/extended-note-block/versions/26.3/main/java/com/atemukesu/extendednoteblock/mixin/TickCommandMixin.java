package com.atemukesu.extendednoteblock.mixin;

import com.mojang.brigadier.CommandDispatcher;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.server.commands.TickCommand;
import com.atemukesu.extendednoteblock.config.TickFixConfig;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(TickCommand.class)
public class TickCommandMixin {

    @Inject(method = "register", at = @At("TAIL"))
    private static void onRegister(CommandDispatcher<CommandSourceStack> dispatcher, CallbackInfo ci) {
        if (!TickFixConfig.isEnabled()) return;

        var tickNode = dispatcher.getRoot().getChild("tick");
        if (tickNode != null) {
            @SuppressWarnings("unchecked")
            var accessor = (CommandNodeAccessor<CommandSourceStack>) tickNode;
            accessor.setRequirement(source -> source.permissions().hasPermission(net.minecraft.server.permissions.Permissions.COMMANDS_GAMEMASTER));
        }
    }
}
