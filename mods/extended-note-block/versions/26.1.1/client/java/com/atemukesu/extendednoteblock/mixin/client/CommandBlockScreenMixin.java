package com.atemukesu.extendednoteblock.mixin.client;

import com.atemukesu.extendednoteblock.config.TickFixConfig;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.CommandBlockEditScreen;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.StringWidget;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(CommandBlockEditScreen.class)
public abstract class CommandBlockScreenMixin extends Screen {

    protected CommandBlockScreenMixin(Component title) {
        super(title);
    }

    @Inject(method = "init", at = @At("TAIL"))
    private void addTickFixToggle(CallbackInfo ci) {
        boolean enabled = TickFixConfig.isEnabled();

        int btnWidth = 100;
        int btnHeight = 20;
        int btnX = this.width - btnWidth - 8;
        int btnY = this.height - btnHeight - 8;

        Component restartText = Component.translatable("gui.extendednoteblock.tick_fix.restart_required");
        int labelWidth = font.width(restartText);
        StringWidget label = new StringWidget(labelWidth, btnHeight, restartText, font);
        label.setPosition(btnX - 4 - labelWidth, btnY);
        addRenderableWidget(label);

        addRenderableWidget(Button.builder(
                Component.translatable("gui.extendednoteblock.tick_fix." + (enabled ? "enabled" : "disabled")),
                button -> {
                    boolean newState = !TickFixConfig.isEnabled();
                    TickFixConfig.setEnabled(newState);
                    button.setMessage(Component.translatable(
                            "gui.extendednoteblock.tick_fix." + (newState ? "enabled" : "disabled")));
                })
                .bounds(btnX, btnY, btnWidth, btnHeight)
                .build());
    }
}
