package com.atemukesu.extendednoteblock.client.gui.screen;

import com.atemukesu.extendednoteblock.ExtendedNoteBlock;
import com.atemukesu.extendednoteblock.client.gui.screen.ExtendedNoteBlockScreen.PianoWidget;
import com.atemukesu.extendednoteblock.sound.SoundPackInfo;
import com.atemukesu.extendednoteblock.sound.SoundPackManager;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.narration.NarratableEntry;
import net.minecraft.client.gui.screens.ConfirmScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.ContainerObjectSelectionList;
import net.minecraft.client.resources.sounds.*;
import net.minecraft.client.sounds.SoundManager;
import net.minecraft.sounds.SoundSource;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.ChatFormatting;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Util;
import net.minecraft.util.RandomSource;
import org.jetbrains.annotations.Nullable;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * 音色包编辑界面。
 * - 独占式播放逻辑：一次只播放一个预览，提供清晰的播放/停止状态反馈。
 * - 移除预览按钮的点击音，防止干扰乐器音头。
 * - 界面关闭时自动停止播放。
 * - 保持了分组显示、安全删除、空状态引导等优化。
 */
public class EditPackScreen extends Screen {
    private final Screen parent;
    private SoundPackInfo packInfo;
    private SampleListWidget listWidget;

    /**
     * 当前正在播放的预览声音实例。
     */
    @Nullable
    private AbstractSoundInstance currentlyPlayingSound;
    /**
     * 触发了当前播放的列表条目，用于状态更新。
     */
    @Nullable
    private SampleListWidget.SampleEntry currentlyPlayingEntry;

    public EditPackScreen(Screen parent, SoundPackInfo packInfo) {
        super(Component.translatable("gui.extendednoteblock.edit_pack.title", packInfo.displayName()));
        this.parent = parent;
        this.packInfo = packInfo;
    }

    @Override
    protected void init() {
        super.init();
        // 初始化列表控件，占据屏幕中央大部分区域
        this.listWidget = new SampleListWidget(this.width, this.height, 32, this.height - 80);
        this.addRenderableWidget(this.listWidget);

        // 底部按钮区域的Y坐标
        int buttonY = this.height - 52;
        int bottomRowY = this.height - 28;

        // "打开文件夹" 按钮
        this.addRenderableWidget(Button.builder(
                Component.translatable("gui.extendednoteblock.edit_pack.button.open_folder"),
                button -> com.mojang.blaze3d.Blaze3D.openPath(getSamplesDirectory()))
                .bounds(this.width / 2 - 154, buttonY, 150, 20).build());

        // "重新加载" 按钮
        this.addRenderableWidget(Button.builder(
                Component.translatable("gui.extendednoteblock.edit_pack.button.reload"),
                this::reloadPackInfo).bounds(this.width / 2 + 4, buttonY, 150, 20).build());

        // "完成" 按钮
        this.addRenderableWidget(Button.builder(Component.translatable("gui.done"), (button) -> {
            if (this.minecraft != null)
                this.minecraft.gui.setScreen(this.parent);
        }).bounds(this.width / 2 - 100, bottomRowY, 200, 20).build());
    }

    /**
     * 播放一个指定的采样预览。
     * 如果已有其他预览正在播放，会先停止它。
     * 
     * @param entry      触发播放的列表条目。
     * @param soundEvent 要播放的声音事件。
     */
    private void playPreview(SampleListWidget.SampleEntry entry, SoundEvent soundEvent) {
        stopCurrentPreview(); // 确保独占播放

        this.currentlyPlayingSound = new PreviewSoundInstance(soundEvent, SoundSource.MASTER, 1.0f, 1.0f);
        if (this.minecraft != null) {
            this.minecraft.getSoundManager().play(this.currentlyPlayingSound);
            this.currentlyPlayingEntry = entry;
            entry.setPlaying(true); // 更新按钮状态
        }
    }

    /**
     * 停止当前正在播放的预览声音。
     */
    private void stopCurrentPreview() {
        if (this.currentlyPlayingSound != null && this.minecraft != null) {
            // 使用客户端的声音管理器来停止声音，这是最可靠的方式
            this.minecraft.getSoundManager().stop(this.currentlyPlayingSound);
            this.currentlyPlayingSound = null;
        }
        if (this.currentlyPlayingEntry != null) {
            this.currentlyPlayingEntry.setPlaying(false); // 重置按钮状态
            this.currentlyPlayingEntry = null;
        }
    }

    /**
     * 获取当前音色包的采样文件夹路径。
     * 路径格式为: .../pack_name/assets/mod_id/sounds/notes/
     * 
     * @return 采样文件夹的 Path 对象。
     */
    private Path getSamplesDirectory() {
        return packInfo.directory().resolve("assets").resolve(ExtendedNoteBlock.MOD_ID).resolve("sounds")
                .resolve("notes");
    }

    /**
     * 重新加载音色包信息并刷新界面。
     * 
     * @param button 触发此操作的按钮（可以为null）。
     */
    private void reloadPackInfo(Button button) {
        stopCurrentPreview(); // 重载前停止声音
        SoundPackManager.getInstance().loadOrUpdatePack(this.packInfo.directory(), false);
        this.packInfo = SoundPackManager.getInstance().getPackInfoById(this.packInfo.id());
        this.listWidget.updateEntries();

        if (this.minecraft != null) {
            // 弹出Toast提示用户资源已重载
            this.minecraft.gui.toastManager().addToast(new net.minecraft.client.gui.components.toasts.SystemToast(
                    net.minecraft.client.gui.components.toasts.SystemToast.SystemToastId.PERIODIC_NOTIFICATION,
                    Component.translatable("gui.extendednoteblock.edit_pack.reloaded.title"),
                    Component.translatable("gui.extendednoteblock.edit_pack.reloaded.description")));
            // 触发Minecraft的资源重载
            this.minecraft.reloadResourcePacks();
        }
    }

    /**
     * 当屏幕关闭时调用。
     */
    @Override
    public void onClose() {
        stopCurrentPreview(); // 关闭界面时停止声音
        if (this.minecraft != null) {
            this.minecraft.gui.setScreen(this.parent);
        }
    }

    /**
     * 当屏幕被移除时调用（例如切换到另一个屏幕）。
     * 确保声音被停止。
     */
    @Override
    public void removed() {
        super.removed();
        stopCurrentPreview();
    }

    /**
     * 渲染屏幕主内容。
     */
    @Override
    public void extractRenderState(GuiGraphicsExtractor context, int mouseX, int mouseY, float delta) {
        super.extractRenderState(context, mouseX, mouseY, delta);

        Component hint1 = Component.translatable("gui.extendednoteblock.edit_pack.hint1").withStyle(ChatFormatting.YELLOW);
        context.centeredText(font, hint1, this.width / 2, this.height - 76, 0xFFFFFFFF);
        Component hint2 = Component.translatable("gui.extendednoteblock.edit_pack.hint2").withStyle(ChatFormatting.GRAY);
        context.centeredText(font, hint2, this.width / 2, this.height - 66, 0xFFFFFFFF);

        this.listWidget.extractRenderState(context, mouseX, mouseY, delta);

        context.centeredText(this.font, this.title, this.width / 2, 13, 0xFFFFFFFF);
    }

    /**
     * 一个自定义的按钮控件，它在被点击时不会播放默认的UI声音。
     * 用于预览按钮，以避免干扰乐器采样的音头。
     */
    private static class NoSoundButtonWidget extends Button {
        @Override
        protected void extractContents(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float delta) {
            extractDefaultSprite(graphics);
            extractDefaultLabel(graphics.textRendererForWidget(this, net.minecraft.client.gui.GuiGraphicsExtractor.HoveredTextEffects.NONE));
        }
        // 构造函数保持为 protected，通过 Builder 创建
        protected NoSoundButtonWidget(int x, int y, int width, int height, Component message, OnPress onPress,
                CreateNarration narrationSupplier) {
            super(x, y, width, height, message, onPress, narrationSupplier);
        }

        // 修复：将静态工厂方法重命名为 `create` 以避免与父类冲突
        public static Builder create(Component message, OnPress onPress) {
            return new Builder(message, onPress);
        }

        @Override
        public void playDownSound(SoundManager soundManager) {
            // 重写此方法并保持为空，以禁用按钮点击音。
        }

        // 自定义的 Builder 类，不再继承 vanilla 的 Builder，以避免可见性问题
        public static class Builder {
            private final Component message;
            private final OnPress onPress;
            private int x;
            private int y;
            private int width = 150;
            private int height = 20;
            @Nullable
            private Tooltip tooltip;

            public Builder(Component message, OnPress onPress) {
                this.message = message;
                this.onPress = onPress;
            }

            public Builder bounds(int x, int y, int width, int height) {
                this.x = x;
                this.y = y;
                this.width = width;
                this.height = height;
                return this;
            }

            // 修复：移除了未使用的 tooltip 方法

            public NoSoundButtonWidget build() {
                NoSoundButtonWidget button = new NoSoundButtonWidget(this.x, this.y, this.width, this.height,
                        this.message, this.onPress, DEFAULT_NARRATION);
                button.setTooltip(this.tooltip);
                return button;
            }
        }
    }

    /**
     * 一个专门用于UI预览的可停止的声音实例。
     */
    private static class PreviewSoundInstance extends AbstractSoundInstance {
        public PreviewSoundInstance(SoundEvent sound, SoundSource category, float volume, float pitch) {
            super(sound, category, RandomSource.create());
            this.volume = volume;
            this.pitch = pitch;
            this.relative = true;
            this.attenuation = Attenuation.NONE;
            this.x = 0;
            this.y = 0;
            this.z = 0;
        }
    }

    /**
     * 内部类，用于显示采样文件的列表。
     */
    private class SampleListWidget extends ContainerObjectSelectionList<SampleListWidget.Entry> {

        public SampleListWidget(int width, int height, int top, int bottom) {
            super(EditPackScreen.this.minecraft, width, bottom - top, top, 35);
            updateEntries();
        }

        public void updateEntries() {
            this.clearEntries();
            if (packInfo.availableNotes().isEmpty()) {
                this.addEntry(new EmptyEntry());
            } else {
                packInfo.availableNotes().keySet().stream()
                        .sorted()
                        .forEach(instrumentId -> {
                            this.addEntry(new InstrumentHeaderEntry(instrumentId));
                            List<Integer> notes = packInfo.availableNotes().get(instrumentId);
                            notes.sort(Comparator.naturalOrder());
                            for (int note : notes) {
                                this.addEntry(new SampleEntry(instrumentId, note));
                            }
                        });
            }
        }

        @Override
        public int getRowWidth() {
            return 350;
        }

        @Override
        public int scrollBarX() {
            return (this.width / 2) + (getRowWidth() / 2) + 4;
        }

        public abstract class Entry extends ContainerObjectSelectionList.Entry<Entry> {
        }

        public class EmptyEntry extends Entry {
            @Override
            public void extractContent(GuiGraphicsExtractor context, int mouseX, int mouseY, boolean hovered, float tickDelta) {
            int index = 0, x = getContentX(), y = getContentY(), entryWidth = getContentWidth(), entryHeight = getContentHeight();
                Component emptyMessage = Component.translatable("gui.extendednoteblock.edit_pack.empty_pack_message")
                        .withStyle(ChatFormatting.GRAY);
                int listHeight = SampleListWidget.this.getBottom() - SampleListWidget.this.getY();
                int textY = SampleListWidget.this.getY() + listHeight / 2 - 4; // 垂直居中
                context.centeredText(font, emptyMessage, SampleListWidget.this.width / 2, textY,
                        0xFFFFFFFF);
            }

            @Override
            public List<? extends NarratableEntry> narratables() {
                return Collections.emptyList();
            }

            @Override
            public List<? extends GuiEventListener> children() {
                return Collections.emptyList();
            }
        }

        public class InstrumentHeaderEntry extends Entry {
            private final Component title;

            public InstrumentHeaderEntry(int instrumentId) {
                // 根据乐器ID选择对应的翻译key
                Component instrumentNameText = (instrumentId == 128)
                        ? Component.translatable("gui.extendednoteblock.edit_pack.instrument.drum_kit")
                        : Component.translatable("gui.extendednoteblock.edit_pack.instrument.generic");

                // 使用可翻译的格式化字符串来组合最终的标题
                this.title = Component
                        .translatable("gui.extendednoteblock.edit_pack.instrument.header_format", instrumentNameText,
                                instrumentId)
                        .withStyle(ChatFormatting.YELLOW, ChatFormatting.BOLD);
            }

            @Override
            public void extractContent(GuiGraphicsExtractor context, int mouseX, int mouseY, boolean hovered, float tickDelta) {
            int index = 0, x = getContentX(), y = getContentY(), entryWidth = getContentWidth(), entryHeight = getContentHeight();
                context.centeredText(minecraft.font, this.title,
                        minecraft.getWindow().getGuiScaledWidth() / 2, y + entryHeight / 2 - 4, 0xFFFFFFFF);
            }

            @Override
            public List<? extends NarratableEntry> narratables() {
                return Collections.emptyList();
            }

            @Override
            public List<? extends GuiEventListener> children() {
                return Collections.emptyList();
            }
        }

        public class SampleEntry extends Entry {
            private final int instrumentId;
            private final int note;
            private final SoundEvent soundEvent;
            private final Button previewButton;
            private final Button removeButton;
            private boolean isPlaying = false;

            public SampleEntry(int instrumentId, int note) {
                this.instrumentId = instrumentId;
                this.note = note;
                Identifier soundId = Identifier.fromNamespaceAndPath(ExtendedNoteBlock.MOD_ID,
                        "notes." + this.instrumentId + "." + this.note);
                this.soundEvent = SoundEvent.createVariableRangeEvent(soundId);

                // 修复：使用重命名后的 `create` 方法
                this.previewButton = NoSoundButtonWidget.create(Component.literal("▶"), button -> {
                    if (this.isPlaying) {
                        EditPackScreen.this.stopCurrentPreview();
                    } else {
                        EditPackScreen.this.playPreview(this, this.soundEvent);
                    }
                }).bounds(0, 0, 20, 20).build();
                updatePreviewButtonState();

                this.removeButton = Button.builder(Component.literal("❌"), button -> {
                    Component question = Component.translatable("gui.extendednoteblock.edit_pack.delete_confirm.question",
                            this.instrumentId + "." + this.note + ".ogg");
                    Component warning = Component.translatable("gui.extendednoteblock.edit_pack.delete_confirm.warning")
                            .withStyle(ChatFormatting.RED);

                    minecraft.gui.setScreen(new ConfirmScreen(
                            confirmed -> {
                                if (confirmed) {
                                    this.deleteFile();
                                }
                                minecraft.gui.setScreen(EditPackScreen.this);
                            },
                            question, warning));
                }).bounds(0, 0, 20, 20).build();
                this.removeButton
                        .setTooltip(Tooltip.create(Component.translatable("gui.extendednoteblock.edit_pack.tooltip.remove")));
            }

            private void deleteFile() {
                try {
                    Path fileToRemove = getSamplesDirectory().resolve(this.instrumentId + "." + this.note + ".ogg");
                    Files.deleteIfExists(fileToRemove);
                    EditPackScreen.this.reloadPackInfo(null);
                } catch (IOException e) {
                    ExtendedNoteBlock.LOGGER.error("Failed to delete sample file", e);
                }
            }

            private void updatePreviewButtonState() {
                if (isPlaying) {
                    this.previewButton.setMessage(Component.literal("⏹"));
                    this.previewButton.setTooltip(
                            Tooltip.create(Component.translatable("gui.extendednoteblock.edit_pack.tooltip.stop_preview")));
                } else {
                    this.previewButton.setMessage(Component.literal("▶"));
                    this.previewButton.setTooltip(
                            Tooltip.create(Component.translatable("gui.extendednoteblock.edit_pack.tooltip.preview")));
                }
            }

            public void setPlaying(boolean playing) {
                this.isPlaying = playing;
                updatePreviewButtonState();
            }

            @Override
            public void extractContent(GuiGraphicsExtractor context, int mouseX, int mouseY, boolean hovered, float tickDelta) {
            int index = 0, x = getContentX(), y = getContentY(), entryWidth = getContentWidth(), entryHeight = getContentHeight();
                String noteName = PianoWidget.getNoteName(note);
                Component infoText = Component.translatable("gui.extendednoteblock.edit_pack.sample_info", noteName, note);

                context.text(minecraft.font, infoText, x + 5, y + (entryHeight - 8) / 2, 0xFFFFFFFF, true);

                int buttonY = y + (entryHeight - 20) / 2;
                this.removeButton.setX(x + entryWidth - this.removeButton.getWidth() - 5);
                this.removeButton.setY(buttonY);
                this.previewButton.setX(this.removeButton.getX() - this.previewButton.getWidth() - 5);
                this.previewButton.setY(buttonY);

                this.removeButton.extractRenderState(context, mouseX, mouseY, tickDelta);
                this.previewButton.extractRenderState(context, mouseX, mouseY, tickDelta);
            }

            @Override
            public List<? extends GuiEventListener> children() {
                return List.of(this.previewButton, this.removeButton);
            }

            @Override
            public List<? extends NarratableEntry> narratables() {
                return List.of(this.previewButton, this.removeButton);
            }
        }
    }
}