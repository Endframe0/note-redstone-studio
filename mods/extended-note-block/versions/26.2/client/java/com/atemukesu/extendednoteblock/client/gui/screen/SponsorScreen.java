package com.atemukesu.extendednoteblock.client.gui.screen;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.CommonComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Util;

import java.net.URI;

public class SponsorScreen extends Screen {
    private final Screen parent;
    public static final String SPONSOR_URL = "https://afdian.com/a/atommix";

    public SponsorScreen(Screen parent) {
        super(Component.translatable("gui.extendednoteblock.sponsor.title"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        super.init();

        int y = this.height - 70; // Buttons at the bottom

        // Sponsor Button
        this.addRenderableWidget(
                Button.builder(Component.translatable("gui.extendednoteblock.sponsor.action"), button -> {
                    Util.getPlatform().openUri(URI.create(SPONSOR_URL));
                }).bounds(this.width / 2 - 100, y, 200, 20).build());

        y += 25;

        // Back Button
        this.addRenderableWidget(Button.builder(CommonComponents.GUI_BACK, button -> {
            this.minecraft.gui.setScreen(this.parent);
        }).bounds(this.width / 2 - 100, y, 200, 20).build());
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor context, int mouseX, int mouseY, float delta) {
        super.extractRenderState(context, mouseX, mouseY, delta);
        context.centeredText(this.font, this.title, this.width / 2, 20, 0xFFFFFFFF);

        int y = 50;
        Component description = Component.translatable("gui.extendednoteblock.sponsor.description");
        context.centeredText(this.font, description, this.width / 2, y, 0xFFEEEEEE);
        y += 25;

        Component story = Component.translatable("gui.extendednoteblock.sponsor.story");
        context.textWithWordWrap(this.font, story, 20, y, this.width - 40, 0xFFAAAAAA);

        int storyHeight = this.font.wordWrapHeight(story, this.width - 40);
        y += storyHeight + 30;

        Component thanks = Component.translatable("gui.extendednoteblock.sponsor.thanks");
        context.centeredText(this.font, thanks, this.width / 2, y, 0xFFFFADAA);
    }

    @Override
    public void onClose() {
        this.minecraft.gui.setScreen(this.parent);
    }
}
