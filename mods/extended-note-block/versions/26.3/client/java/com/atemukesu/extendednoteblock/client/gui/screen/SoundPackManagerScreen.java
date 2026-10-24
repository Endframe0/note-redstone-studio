package com.atemukesu.extendednoteblock.client.gui.screen;

import com.atemukesu.extendednoteblock.sound.SoundPackInfo;
import com.atemukesu.extendednoteblock.sound.SoundPackManager;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.narration.NarratableEntry;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.ContainerObjectSelectionList;
import net.minecraft.network.chat.Component;
import net.minecraft.ChatFormatting;
import net.minecraft.util.Util;

import java.nio.file.Path;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/**
 * 音色包管理器界面。
 * 允许用户查看、选择、创建和编辑音色包。
 */
public class SoundPackManagerScreen extends Screen {
    /**
     * 打开此界面的父界面，用于返回。
     */
    private final Screen parent;
    /**
     * 显示音色包列表的UI组件。
     */
    private SoundPackListWidget listWidget;

    /**
     * 构造函数。
     * 
     * @param parent 打开此界面的父屏幕实例。
     */
    public SoundPackManagerScreen(Screen parent) {
        super(Component.translatable("gui.extendednoteblock.pack_manager.title"));
        this.parent = parent;
    }

    /**
     * 初始化界面布局和组件。
     * 在屏幕显示或窗口大小改变时调用。
     */
    @Override
    protected void init() {
        super.init();
        // 重新扫描音色包目录，确保列表是最新的。
        SoundPackManager.getInstance().scanPacks();

        // 创建并添加音色包列表控件
        int listBottom = this.height - 60;
        this.listWidget = new SoundPackListWidget(this.width, this.height, 32, listBottom);
        this.addRenderableWidget(this.listWidget);

        // 创建并添加 "创建新包" 按钮
        int topButtonRowY = this.height - 52;
        this.addRenderableWidget(Button
                .builder(Component.translatable("gui.extendednoteblock.pack_manager.button.create_new"), button -> {
                    if (this.minecraft != null)
                        this.minecraft.gui.setScreen(new CreatePackScreen(this));
                }).bounds(this.width / 2 - 154, topButtonRowY, 150, 20).build());

        // 创建并添加 "打开文件夹" 按钮
        this.addRenderableWidget(Button.builder(
                Component.translatable("gui.extendednoteblock.pack_manager.button.open_folder"),
                button -> {
                    Path packDir = SoundPackManager.getInstance().getPacksDirectory();
                    com.mojang.blaze3d.Blaze3D.openPath(packDir);
                }).bounds(this.width / 2 + 4, topButtonRowY, 150, 20).build());

        // 创建并添加 "完成" 按钮
        this.addRenderableWidget(Button.builder(Component.translatable("gui.done"), button -> {
            if (this.minecraft != null)
                this.minecraft.gui.setScreen(this.parent);
        }).bounds(this.width / 2 - 100, this.height - 28, 200, 20).build());

        // 初始化时，自动选中当前激活的音色包。
        String activeId = SoundPackManager.getInstance().getActivePackId();
        if (activeId != null) {
            this.listWidget.children().stream()
                    .filter(entry -> entry.pack.id().equals(activeId))
                    .findFirst()
                    .ifPresent(entry -> this.listWidget.setSelected(entry, true));
        }

        // 添加赞助按钮
        this.addRenderableWidget(
                Button.builder(Component.translatable("gui.extendednoteblock.sponsor.button"), button -> {
                    if (this.minecraft != null)
                        this.minecraft.gui.setScreen(new SponsorScreen(this));
                }).bounds(this.width - 105, 6, 100, 20).build());
    }

    /**
     * 当屏幕被关闭时调用（例如按ESC键）。
     * 确保返回到父屏幕。
     */
    @Override
    public void onClose() {
        if (this.minecraft != null)
            this.minecraft.gui.setScreen(this.parent);
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
        this.listWidget.extractRenderState(context, mouseX, mouseY, delta);
        context.centeredText(this.font, this.title, this.width / 2, 13, 0xFFFFFFFF);
    }

    /**
     * 内部类，用于实现和管理音色包列表的显示和交互。
     */
    private class SoundPackListWidget extends ContainerObjectSelectionList<SoundPackListWidget.PackEntry> {
        /**
         * 构造函数。
         * 
         * @param width      列表宽度
         * @param height     列表高度
         * @param top        列表顶部Y坐标
         * @param bottom     列表底部Y坐标
         */
        public SoundPackListWidget(int width, int height, int top, int bottom) {
            super(SoundPackManagerScreen.this.minecraft, width, bottom - top, top, 35);
            this.updateEntries();
        }

        /**
         * 更新列表中的所有条目。
         * 会清空现有条目，然后从 SoundPackManager 获取最新的音色包列表并填充。
         */
        public void updateEntries() {
            this.clearEntries();
            SoundPackManager.getInstance().getAvailablePacks()
                    .stream()
                    // 按显示名称排序（不区分大小写）
                    .sorted(Comparator.comparing(SoundPackInfo::displayName, String.CASE_INSENSITIVE_ORDER))
                    .forEach(pack -> this.addEntry(new PackEntry(pack)));
        }

        /**
         * 当用户点击一个条目时，设置其为选中状态。
         * 
         * @param entry 被选中的条目。
         */
        @Override
        public void setSelected(PackEntry entry) {
            this.setSelected(entry, false);
        }

        /**
         * 设置选中条目，并决定是否触发激活音色包的逻辑。
         * 
         * @param entry  要选中的条目。
         * @param silent 如果为 true，则仅在UI上选中，不触发激活音色包的动作。
         */
        public void setSelected(PackEntry entry, boolean silent) {
            super.setSelected(entry);
            // 如果不是静默设置，并且音色包状态正常或为空，则将其设为当前激活的音色包。
            if (entry != null && !silent && (entry.pack.status() == SoundPackInfo.Status.OK
                    || entry.pack.status() == SoundPackInfo.Status.EMPTY)) {
                SoundPackManager.getInstance().setActivePack(entry.pack.id());
            }
        }

        /**
         * 获取滚动条的X坐标。
         * 
         * @return 滚动条的X坐标。
         */
        @Override
        public int scrollBarX() {
            return this.width / 2 + 158;
        }

        /**
         * 获取列表行的宽度。
         * 
         * @return 行的宽度。
         */
        @Override
        public int getRowWidth() {
            return 310;
        }

        /**
         * 内部类，代表列表中的一个音色包条目。
         */
        public class PackEntry extends ContainerObjectSelectionList.Entry<PackEntry> {
            /**
             * 该条目对应的音色包信息。
             */
            final SoundPackInfo pack;
            /**
             * 条目右侧的“编辑”按钮。
             */
            private final Button actionButton;
            /**
             * Minecraft 客户端实例的引用。
             */
            private final Minecraft minecraft;

            /**
             * 构造函数。
             * 
             * @param pack 音色包的信息对象。
             */
            public PackEntry(SoundPackInfo pack) {
                this.pack = pack;
                this.minecraft = Minecraft.getInstance();

                // 初始化 "编辑" 按钮
                this.actionButton = Button.builder(
                        Component.translatable("gui.extendednoteblock.pack_manager.button.edit"),
                        button -> {
                            // 点击按钮时，如果音色包不是zip压缩包，则打开编辑界面
                            if (this.minecraft != null && !pack.isZip()) {
                                this.minecraft.gui.setScreen(new EditPackScreen(SoundPackManagerScreen.this, pack));
                            }
                        }).build();

                // 根据音色包状态设置 "编辑" 按钮的可用性和提示信息
                if (pack.isZip()) {
                    // 如果是.zip文件，则禁用编辑按钮并添加提示
                    this.actionButton.active = false;
                    this.actionButton.setTooltip(
                            Tooltip.create(Component.translatable("gui.extendednoteblock.pack_manager.tooltip.zip_uneditable")));
                } else if (pack.status() == SoundPackInfo.Status.INVALID) {
                    // 如果音色包无效，也禁用编辑按钮并添加提示
                    this.actionButton.active = false;
                    this.actionButton.setTooltip(
                            Tooltip.create(Component.translatable("gui.extendednoteblock.pack_manager.tooltip.invalid_pack")));
                }
            }

            /**
             * 渲染单个列表条目。
             */
            @Override
            public void extractContent(GuiGraphicsExtractor context, int mouseX, int mouseY, boolean hovered, float tickDelta) {
            int index = 0, x = getContentX(), y = getContentY(), entryWidth = getContentWidth(), entryHeight = getContentHeight();
                // 显示音色包名称
                Component displayName = Component.literal(pack.displayName());

                // 如果是zip文件，在名称后添加灰色后缀
                if (pack.isZip()) {
                    displayName = displayName.copy().append(Component.literal(" (.zip)").withStyle(ChatFormatting.GRAY));
                }

                // 根据音色包状态显示不同的状态文本和颜色
                final Component statusText;
                long sampleCount = pack.availableNotes().values().stream().mapToLong(List::size).sum();

                switch (pack.status()) {
                    case OK ->
                        statusText = Component.translatable("gui.extendednoteblock.pack_manager.status.ok", sampleCount)
                                .withStyle(ChatFormatting.GREEN);
                    case EMPTY -> statusText = Component.translatable("gui.extendednoteblock.pack_manager.status.empty")
                            .withStyle(ChatFormatting.YELLOW);
                    default -> statusText = Component.translatable("gui.extendednoteblock.pack_manager.status.invalid")
                            .withStyle(ChatFormatting.RED);
                }

                // 动态设置 "编辑" 按钮的位置和大小，并渲染它
                this.actionButton.setX(x + entryWidth - 80 - 5);
                this.actionButton.setY(y + (entryHeight - 20) / 2);
                this.actionButton.setWidth(80);
                this.actionButton.extractRenderState(context, mouseX, mouseY, tickDelta);

                // 如果当前条目是已激活的音色包，在前面显示一个绿色箭头指示符
                if (Objects.equals(pack.id(), SoundPackManager.getInstance().getActivePackId())) {
                    context.text(minecraft.font, "▶ ", x, y + entryHeight / 2 - 4, 0xFF55FF55, true);
                }

                // 绘制音色包名称和状态文本
                context.text(minecraft.font, displayName, x + 10, y + 4, 0xFFFFFFFF, true);
                context.text(minecraft.font, statusText, x + 10, y + 18, 0xFFA0A0A0, true);
            }

            /**
             * 处理鼠标点击事件。
             * 
             * @return 如果事件被处理，则返回 true。
             */
            @Override
            public boolean mouseClicked(net.minecraft.client.input.MouseButtonEvent event, boolean doubleClick) {
        double mouseX = event.x(), mouseY = event.y(); int button = event.button();
                // 优先处理 "编辑" 按钮的点击
                if (this.actionButton.mouseClicked(event, doubleClick)) {
                    return true;
                }
                // 如果是鼠标左键点击条目本身，则选中该条目
                if (button == 0) {
                    SoundPackListWidget.this.setSelected(this);
                    return true;
                }
                return false;
            }

            /**
             * 返回此条目中可作为子元素处理的UI组件列表 (用于事件传递)。
             * 
             * @return 包含 "编辑" 按钮的列表。
             */
            @Override
            public List<? extends GuiEventListener> children() {
                return Collections.singletonList(this.actionButton);
            }

            /**
             * 返回此条目中可选中的UI组件列表 (用于Tab键导航等)。
             * 
             * @return 包含 "编辑" 按钮的列表。
             */
            @Override
            public List<? extends NarratableEntry> narratables() {
                return Collections.singletonList(this.actionButton);
            }
        }
    }
}