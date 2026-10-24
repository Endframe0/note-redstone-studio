package com.atemukesu.extendednoteblock.client.gui.widget;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.narration.NarratableEntry;
import net.minecraft.client.gui.components.ContainerObjectSelectionList;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;

public class EnbBulkEditorWidget extends ContainerObjectSelectionList<EnbBulkEditorWidget.Entry> {

    public EnbBulkEditorWidget(Minecraft minecraft, int width, int height, int top, int bottom) {
        super(minecraft, width, bottom - top, top, 50);
        this.centerListVertically = false;
    }

    @Override
    public int getRowWidth() {
        return 380;
    }

    public void addSection(Component title) {
        this.addEntry(new HeaderEntry(title));
    }

    @Override
    public int addEntry(Entry entry) {
        return super.addEntry(entry);
    }

    @Override
    public int scrollBarX() {
        return this.width - 15;
    }

    // 基础条目抽象类
    public abstract static class Entry extends ContainerObjectSelectionList.Entry<Entry> {
        public abstract String getKey();

        public abstract String getValue();
    }

    // 1. 标题装饰条目
    public static class HeaderEntry extends Entry {
        private final Component text;

        public HeaderEntry(Component text) {
            this.text = text;
        }

        @Override
        public String getKey() {
            return "";
        }

        @Override
        public String getValue() {
            return "";
        }

        @Override
        public void extractContent(GuiGraphicsExtractor context, int mouseX, int mouseY, boolean hovered, float delta) {
            int index = 0, x = getContentX(), y = getContentY(), width = getContentWidth(), height = getContentHeight();
            context.fill(x, y + height - 5, x + width, y + height - 4, 0x55FFFFFF);
            context.text(Minecraft.getInstance().font, text, x, y + 15, 0xFFFFAA00, true);
        }

        @Override
        public List<? extends GuiEventListener> children() {
            return List.of();
        }

        @Override
        public List<? extends NarratableEntry> narratables() {
            return List.of();
        }
    }

    // 2. 数值参数条目 (Note, Velocity, Sustain)
    public static class NumberEntry extends Entry {
        private final String key;
        private final Component label;
        public final EditBox input;
        public final net.minecraft.client.gui.components.Button modeButton;
        public int mode = 0; // 0=SET, 1=ADD, 2=MULT
        private final boolean showMode;

        public NumberEntry(String key, Component label, String initialValue) {
            this(key, label, initialValue, true);
        }

        public NumberEntry(String key, Component label, String initialValue, boolean showMode) {
            this.key = key;
            this.label = label;
            this.showMode = showMode;
            Font tr = Minecraft.getInstance().font;
            this.input = new EditBox(tr, 0, 0, 60, 16, label);
            this.input.setValue(initialValue);

            if (showMode) {
                this.modeButton = net.minecraft.client.gui.components.Button.builder(getModeText(), b -> {
                    this.mode = (this.mode + 1) % 3;
                    b.setMessage(getModeText());
                }).bounds(0, 0, 20, 16).build();
            } else {
                this.modeButton = null;
            }
        }

        private Component getModeText() {
            return switch (mode) {
                case 1 -> Component.literal("+").withStyle(net.minecraft.ChatFormatting.GREEN);
                case 2 -> Component.literal("×").withStyle(net.minecraft.ChatFormatting.AQUA);
                default -> Component.literal("=").withStyle(net.minecraft.ChatFormatting.YELLOW);
            };
        }

        @Override
        public String getKey() {
            return key;
        }

        @Override
        public String getValue() {
            return input.getValue();
        }

        @Override
        public void extractContent(GuiGraphicsExtractor context, int mouseX, int mouseY, boolean hovered, float delta) {
            int index = 0, x = getContentX(), y = getContentY(), width = getContentWidth(), height = getContentHeight();
            context.text(Minecraft.getInstance().font, label, x, y + 12, 0xFFFFFFFF, true);

            // Mode Button
            if (showMode && modeButton != null) {
                modeButton.setX(x + width - 95);
                modeButton.setY(y + 8);
                modeButton.extractRenderState(context, mouseX, mouseY, delta);
            }

            // Input
            input.setX(x + width - 70);
            input.setY(y + 8);
            input.extractRenderState(context, mouseX, mouseY, delta);
        }

        @Override
        public List<? extends GuiEventListener> children() {
            if (showMode && modeButton != null) {
                return List.of(input, modeButton);
            }
            return List.of(input);
        }

        @Override
        public List<? extends NarratableEntry> narratables() {
            if (showMode && modeButton != null) {
                return List.of(input, modeButton);
            }
            return List.of(input);
        }
    }

    // 3. 表达式条目 (X, Y, Z)
    public static class MathEntry extends Entry {
        private final String id;
        public final MathExpressionWidget input;

        public MathEntry(String id, String initialValue) {
            this.id = id;
            Font tr = Minecraft.getInstance().font;
            this.input = new MathExpressionWidget(tr, 0, 0, 200, 16, Component.literal(id));
            this.input.setValue(initialValue);
        }

        @Override
        public String getKey() {
            return "Expression" + id;
        }

        @Override
        public String getValue() {
            return input.getValue();
        }

        @Override
        public void extractContent(GuiGraphicsExtractor context, int mouseX, int mouseY, boolean hovered, float delta) {
            int index = 0, x = getContentX(), y = getContentY(), width = getContentWidth(), height = getContentHeight();
            context.text(Minecraft.getInstance().font, "§d" + id + "(t, d)", x, y + 12,
                    0xFFFFFFFF, true);
            input.setX(x + width - 210);
            input.setY(y + 8);
            input.extractRenderState(context, mouseX, mouseY, delta);
        }

        @Override
        public List<? extends GuiEventListener> children() {
            return List.of(input);
        }

        @Override
        public List<? extends NarratableEntry> narratables() {
            return List.of(input);
        }
    }

    // 4. 曲线条目 (Volume, Pitch)
    public static class CurveEntry extends Entry {
        public final VisualCurveWidget curve;
        private final boolean isVol;

        public CurveEntry(String title, boolean isVol, ListTag pts) {
            this.isVol = isVol;
            this.curve = new VisualCurveWidget(0, 0, 340, 80, title, "",
                    isVol ? 0f : -24f, isVol ? 2f : 24f, isVol ? 0xFF55FF55 : 0xFFFFFF55, isVol);

            if (pts != null) {
                List<VisualCurveWidget.DataPoint> data = new ArrayList<>();
                for (int i = 0; i < pts.size(); i++) {
                    CompoundTag tag = pts.getCompound(i).orElse(new CompoundTag());
                    data.add(new VisualCurveWidget.DataPoint(tag.getFloat("t").orElse(0f), tag.getFloat("v").orElse(0f)));
                }
                curve.setPoints(data);
            }
        }

        @Override
        public String getKey() {
            return isVol ? "VolumePoints" : "PitchBendPoints";
        }

        @Override
        public String getValue() {
            return "";
        } // 曲线值通过 getPoints 拿

        @Override
        public void extractContent(GuiGraphicsExtractor context, int mouseX, int mouseY, boolean hovered, float delta) {
            int index = 0, x = getContentX(), y = getContentY(), width = getContentWidth(), height = getContentHeight();
            curve.setX(x);
            curve.setY(y + 5);
            curve.setWidth(width);
            curve.setHeight(80);
            curve.extractRenderState(context, mouseX, mouseY, delta);
        }

        public int getHeight() {
            return 90;
        }

        @Override
        public List<? extends GuiEventListener> children() {
            return List.of(curve);
        }

        @Override
        public List<? extends NarratableEntry> narratables() {
            return List.of(curve);
        }
    }
}