package com.atemukesu.extendednoteblock.client.gui.screen;

import com.atemukesu.extendednoteblock.sound.SoundPackInfo;
import com.atemukesu.extendednoteblock.sound.SoundPackManager;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.network.chat.Component;
import net.minecraft.ChatFormatting;
import java.util.regex.Pattern;

/**
 * “创建新音色包”界面。
 * 提供一个文本输入框让用户为新音色包命名。
 */
public class CreatePackScreen extends Screen {
    /**
     * 打开此界面的父界面，用于返回。
     */
    private final Screen parent;
    /**
     * 用于输入新音色包名称的文本框。
     */
    private EditBox nameField;
    /**
     * 用于确认创建操作的按钮。
     */
    private Button createButton;

    // 用于验证名称的正则表达式
    // 该表达式允许字母(a-z, A-Z)，数字(0-9)，下划线(_)和连字符(-)
    // ^ 和 $ 确保整个字符串都必须匹配这个规则
    private static final Pattern VALID_NAME_PATTERN = Pattern.compile("^[a-zA-Z0-9_-]+$");

    /**
     * 构造函数。
     *
     * @param parent 打开此界面的父屏幕实例。
     */
    public CreatePackScreen(Screen parent) {
        super(Component.translatable("gui.extendednoteblock.create_pack.title"));
        this.parent = parent;
    }

    // 一个辅助方法用于检查名称是否有效
    private boolean isNameValid(String name) {
        if (name == null || name.trim().isEmpty()) {
            return false; // 空名称无效
        }
        return VALID_NAME_PATTERN.matcher(name.trim()).matches();
    }

    /**
     * 初始化界面布局和组件。
     * 在屏幕显示或窗口大小改变时调用。
     */
    @Override
    protected void init() {
        super.init();
        int fieldWidth = 200;
        int fieldX = this.width / 2 - fieldWidth / 2;

        this.nameField = new EditBox(this.font, fieldX, this.height / 2 - 20, fieldWidth, 20,
                Component.translatable("gui.extendednoteblock.create_pack.name_field"));
        this.addRenderableWidget(this.nameField);
        this.setInitialFocus(this.nameField);

        // 为输入框添加更严格的监听器
        this.nameField.setResponder(text -> {
            String trimmedText = text.trim();
            boolean isValid = isNameValid(trimmedText);

            // 当名称不为空且字符合法时，"创建"按钮才可用
            this.createButton.active = isValid;

            // 如果文本不为空且包含非法字符，则将输入框颜色设为红色以提示用户
            // 如果文本为空或是合法的，则恢复为默认白色
            if (!trimmedText.isEmpty() && !isValid) {
                this.nameField.setTextColor((0xff000000 | ChatFormatting.RED.getColor()));
            } else {
                this.nameField.setTextColor(0xFFFFFFFF);
            }
        });

        this.createButton = Button.builder(
                Component.translatable("gui.extendednoteblock.create_pack.button.create"),
                button -> createAndEditPack())
                .bounds(this.width / 2 - 100, this.height / 2 + 20, 200, 20).build();
        this.createButton.active = false;
        this.addRenderableWidget(this.createButton);

        this.addRenderableWidget(Button.builder(Component.translatable("gui.cancel"), (button) -> {
            if (this.minecraft != null)
                this.minecraft.setScreen(this.parent);
        }).bounds(this.width / 2 - 100, this.height / 2 + 44, 200, 20).build());
    }

    /**
     * 处理创建新音色包并跳转到编辑界面的逻辑。
     */
    private void createAndEditPack() {
        String displayName = this.nameField.getValue().trim();
        // 增加一道保险，尽管按钮状态已经阻止了无效输入，但最好还是检查
        if (!isNameValid(displayName))
            return;

        SoundPackInfo newPack = SoundPackManager.getInstance().createNewPack(displayName);
        if (newPack != null && minecraft != null) {
            minecraft.setScreen(new EditPackScreen(this.parent, newPack));
        } else {
            this.nameField.setTextColor((0xff000000 | ChatFormatting.RED.getColor()));
            // 如果创建失败的原因是重名，变红依然是有效的反馈
        }
    }

    /**
     * 当屏幕被关闭时调用（例如按ESC键）。
     * 确保返回到父屏幕。
     */
    @Override
    public void onClose() {
        if (this.minecraft != null)
            this.minecraft.setScreen(this.parent);
    }

    /**
     * 渲染屏幕上的所有元素。
     *
     * @param context 绘图上下文
     * @param mouseX  鼠标X坐标
     * @param mouseY  鼠标Y坐标
     * @param delta   帧时间差
     */
    @Override
    public void extractRenderState(GuiGraphicsExtractor context, int mouseX, int mouseY, float delta) {
        super.extractRenderState(context, mouseX, mouseY, delta);
        context.centeredText(this.font, this.title, this.width / 2, this.height / 2 - 50,
                0xFFFFFFFF);
        context.text(this.font, Component.translatable("gui.extendednoteblock.create_pack.name_field"),
                this.nameField.getX(), this.nameField.getY() - 12, 0xFFA0A0A0, true);

        // 当输入不合法时，显示一个提示信息
        String trimmedText = this.nameField.getValue().trim();
        if (!trimmedText.isEmpty() && !isNameValid(trimmedText)) {
            Component tooltip = Component.translatable("gui.extendednoteblock.create_pack.invalid_name")
                    .withStyle(ChatFormatting.RED);
            context.text(this.font, tooltip, this.nameField.getX(),
                    this.nameField.getY() + this.nameField.getHeight() + 4, 0xFFFFFFFF, true);
        }
    }
}