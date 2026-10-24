package com.atemukesu.extendednoteblock.mixin.client;

import com.atemukesu.extendednoteblock.client.gui.screen.SoundPackManagerScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.options.OptionsScreen;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import java.util.Optional;

/**
 * 注入 Minecraft 的选项屏幕 ({@link OptionsScreen})。
 * <p>
 * <b>目的:</b> 在游戏的主选项菜单中添加一个“声音包”按钮，为用户提供一个方便的入口来访问本模组的声音包管理界面。
 * </p>
 */
@Mixin(OptionsScreen.class)
public abstract class OptionsScreenMixin extends Screen {
    protected OptionsScreenMixin(Component title) {
        super(title);
    }

    /**
     * 注入到 {@code init} 方法的末尾。
     * <p>
     * <b>注入点:</b> {@code RETURN} - 在目标方法的所有代码执行完毕后。这是添加新UI元素的理想位置。
     * <b>行为:</b>
     * 1. 动态地查找屏幕上的“完成”按钮。这比依赖固定的按钮位置或索引更具兼容性。
     * 2. 如果找到了“完成”按钮，就执行以下操作：
     * a. 记录“完成”按钮的原始Y坐标。
     * b. 将“完成”按钮向下移动，为新按钮腾出空间。
     * c. 创建一个新的“声音包”按钮，并将其放置在“完成”按钮原来的位置上。
     * d. 为新按钮设置点击事件，使其打开 {@link SoundPackManagerScreen}。
     * e. 将新按钮添加到屏幕的子控件列表中，使其可见并可交互。
     * </p>
     *
     * @param ci 回调信息对象。
     */
    @Inject(method = "init", at = @At("RETURN"))
    private void addSoundPacksButton(CallbackInfo ci) {
        int buttonHeight = 20;
        int verticalSpacing = 4;
        String doneButtonText = Component.translatable("gui.done").getString();

        // 通过遍历子元素来查找“完成”按钮
        Optional<Button> doneButtonOpt = this.children().stream()
                .filter(element -> element instanceof Button)
                .map(element -> (Button) element)
                .filter(button -> button.getMessage().getString().equals(doneButtonText))
                .findFirst();

        if (doneButtonOpt.isPresent()) {
            Button doneButton = doneButtonOpt.get();
            int originalDoneY = doneButton.getY();

            // 26.1 anchors the footer at the bottom: share its row instead of moving Done off-screen.
            int originalWidth = doneButton.getWidth();
            int halfWidth = (originalWidth - verticalSpacing) / 2;
            doneButton.setWidth(halfWidth);

            // 在“完成”按钮原来的位置上创建我们的新按钮
            Button soundPacksButton = Button.builder(
                    Component.translatable("gui.extendednoteblock.options.sound_packs_button"),
                    (button) -> {
                        if (this.minecraft != null) {
                            this.minecraft.setScreen(new SoundPackManagerScreen((OptionsScreen) (Object) this));
                        }
                    })
                    .bounds(doneButton.getX() + halfWidth + verticalSpacing, originalDoneY,
                            originalWidth - halfWidth - verticalSpacing, buttonHeight)
                    .build();

            this.addRenderableWidget(soundPacksButton);
        }
    }
}
