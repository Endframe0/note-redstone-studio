package com.atemukesu.extendednoteblock.client.gui.screen;

import com.atemukesu.extendednoteblock.config.ConfigManager;
import com.atemukesu.extendednoteblock.sound.SoundPackManager;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.chat.Component;

public class PreLaunchCheckScreen extends Screen {
    private enum State {
        CHECKING, SUCCESS, FAILURE
    }

    private State currentState = State.CHECKING;
    private int ticks = 0;
    private final Component checkingText = Component.translatable("gui.extendednoteblock.pre_check.status.checking");
    private final Component successText = Component.translatable("gui.extendednoteblock.pre_check.status.success");
    private final Component failureText = Component.translatable("gui.extendednoteblock.pre_check.status.failure");

    public PreLaunchCheckScreen() {
        super(Component.translatable("gui.extendednoteblock.pre_check.title"));
    }

    @Override
    protected void init() {
        super.init();
        runCheck();
    }

    private void runCheck() {
        this.currentState = State.CHECKING;
        new Thread(() -> {
            boolean packFilesReady = ConfigManager.isActiveSoundPackReady();
            boolean packIsEnabled = SoundPackManager.getInstance().isCurrentPackActuallyEnabled();

            // 如果包未启用，尝试自动启用它
            if (!packIsEnabled) {
                String activeId = SoundPackManager.getInstance().getActivePackId();
                if (activeId != null && !activeId.isBlank()) {
                    SoundPackManager.getInstance().setActivePack(activeId);
                    // 重新检查
                    packIsEnabled = SoundPackManager.getInstance().isCurrentPackActuallyEnabled();
                }
            }

            final boolean finalCheckResult = packFilesReady && packIsEnabled;
            if (this.minecraft != null) {
                this.minecraft.execute(() -> {
                    this.currentState = finalCheckResult ? State.SUCCESS : State.FAILURE;
                    this.ticks = 0; // 重置计时器
                });
            }
        }, "ENB-PreLaunchCheck").start();
    }

    @Override
    public void tick() {
        super.tick();
        this.ticks++;
        if (this.currentState == State.SUCCESS && this.ticks > 40) {
            if (this.minecraft != null) {
                this.minecraft.setScreen(new TitleScreen());
            }
        } else if (this.currentState == State.FAILURE && this.ticks > 40) {
            if (this.minecraft != null) {
                this.minecraft.setScreen(new SoundPackManagerScreen(new TitleScreen()));
            }
        }
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor context, int mouseX, int mouseY, float delta) {
        super.extractRenderState(context, mouseX, mouseY, delta);
        context.centeredText(this.font, this.title, this.width / 2, this.height / 2 - 50,
                0xFFFFFFFF);
        Component statusText;
        int statusColor;
        switch (this.currentState) {
            case SUCCESS:
                statusText = this.successText;
                statusColor = 0xFF55FF55;
                break;
            case FAILURE:
                statusText = this.failureText;
                statusColor = 0xFFFF5555;
                break;
            default:
                statusText = this.checkingText;
                statusColor = 0xFFFFFF55;
                break;
        }
        context.centeredText(this.font, statusText, this.width / 2, this.height / 2, statusColor);
        renderProgressBar(context);
    }

    private void renderProgressBar(GuiGraphicsExtractor context) {
        int barWidth = 200;
        int barHeight = 8;
        int barX = (this.width - barWidth) / 2;
        int barY = this.height / 2 + 20;
        context.fill(barX - 1, barY - 1, barX + barWidth + 1, barY + barHeight + 1, 0xFF000000);
        context.fill(barX, barY, barX + barWidth, barY + barHeight, 0xFF555555);
        if (this.currentState == State.CHECKING) {
            int sliderWidth = 50;
            float progress = (Math.abs(System.currentTimeMillis() % 2000L - 1000L)) / 1000.0f;
            int sliderPos = (int) (progress * (barWidth - sliderWidth));
            context.fill(barX + sliderPos, barY, barX + sliderPos + sliderWidth, barY + barHeight, 0xFF55FF55);
        }
    }

    @Override
    public boolean shouldCloseOnEsc() {
        return false;
    }
}