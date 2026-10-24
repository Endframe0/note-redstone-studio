package com.atemukesu.extendednoteblock.client.gui.widget;


import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractWidget;

import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;


import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class VisualCurveWidget extends AbstractWidget {

    public static class DataPoint {
        public float timePercent, value;

        public DataPoint(float t, float v) {
            this.timePercent = t;
            this.value = v;
        }
    }

    private final List<DataPoint> points = new ArrayList<>();
    private final String label;
    private final String tooltipText;
    private float minY, maxY;
    private final int themeColor;
    @SuppressWarnings("unused")
    private final boolean isVolume;

    private DataPoint draggingPoint = null;
    private long lastClickTime = 0;
    private static final long DOUBLE_CLICK_INTERVAL = 250;

    public VisualCurveWidget(int x, int y, int width, int height, String label, String tooltipText, float minY,
            float maxY, int color, boolean isVolume) {
        super(x, y, width, height, Component.translatable(label));
        this.label = Component.translatable(label).getString();
        this.tooltipText = tooltipText;
        this.minY = minY;
        this.maxY = maxY;
        this.themeColor = color;
        this.isVolume = isVolume;

        // 初始化两个端点，默认值根据类型设置
        float defaultValue = isVolume ? 1.0f : 0.0f;
        points.add(new DataPoint(0, defaultValue));
        points.add(new DataPoint(1, defaultValue));
    }

    public void setMinMax(float min, float max) {
        this.minY = min;
        this.maxY = max;
    }

    public void setHeight(int i) {
        this.height = i;
    }

    public List<DataPoint> getPoints() {
        return points;
    }

    public void setPoints(List<DataPoint> newPoints) {
        this.points.clear();
        this.points.addAll(newPoints);
        this.points.sort(Comparator.comparingDouble(p -> p.timePercent));
    }

    // 统一吸附逻辑：全部吸附到 0.1
    private float getSnappedValue(float rawValue) {
        return Math.round(rawValue * 10.0f) / 10.0f;
    }

    // 统一格式化逻辑：全部显示 1 位小数（用于刻度显示）
    @SuppressWarnings("unused")
    private String formatValue(float value) {
        return String.format("%.1f", value);
    }

    @Override
    protected void extractWidgetRenderState(GuiGraphicsExtractor context, int mouseX, int mouseY, float delta) {
        // 1. 背景与边框
        context.fill(getX(), getY(), getX() + width, getY() + height, 0xEE050505);
        context.outline(getX(), getY(), width, height, 0xFF444444);

        // 2. 绘制网格与刻度
        drawGridAndLabels(context);

        // 3. 绘制曲线
        context.enableScissor(getX() + 1, getY() + 1, getX() + width - 1, getY() + height - 1);
        renderCurveLines(context);
        renderPoints(context, mouseX, mouseY);
        context.disableScissor();

        // 4. 标题
        context.text(Minecraft.getInstance().font, "§l" + label, getX() + 5, getY() + 5,
                0xFFFFFFFF, true);
    }

    private void drawGridAndLabels(GuiGraphicsExtractor context) {
        Font tr = Minecraft.getInstance().font;
        int gridColor = 0x20FFFFFF;
        int textColor = 0x88FFFFFF;

        // X轴刻度 (底部，4个点)
        for (int i = 0; i <= 3; i++) {
            float t = i / 3.0f;
            int px = valToScreenX(t);

            context.fill(px, getY(), px + 1, getY() + height, gridColor);
            String labelX = (int) (t * 100) + "%";
            int tw = tr.width(labelX);
            // 确保文字不超出控件边界
            int tx = Mth.clamp(px - tw / 2, getX() + 2, getX() + width - tw - 2);
            context.text(tr, labelX, tx, getY() + height - 9, textColor, false);
        }
    }

    private void renderCurveLines(GuiGraphicsExtractor context) {
        if (points.size() < 2)
            return;
        points.sort(Comparator.comparingDouble(p -> p.timePercent));

        // Rasterize the editable polyline into GUI extraction quads; no immediate GL calls.
        int color = (themeColor & 0x00ffffff) | 0xcc000000;
        for (int i = 1; i < points.size(); i++) {
            DataPoint a = points.get(i - 1), b = points.get(i);
            int ax = valToScreenX(a.timePercent), ay = valToScreenY(a.value);
            int bx = valToScreenX(b.timePercent), by = valToScreenY(b.value);
            int steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
            for (int step = 0; step <= steps; step++) {
                float f = steps == 0 ? 0 : (float) step / steps;
                int x = Math.round(ax + (bx - ax) * f), y = Math.round(ay + (by - ay) * f);
                context.fill(x, y, x + 2, y + 2, color);
            }
        }
    }

    private void renderPoints(GuiGraphicsExtractor context, int mouseX, int mouseY) {
        for (DataPoint p : points) {
            int px = valToScreenX(p.timePercent);
            int py = valToScreenY(p.value);

            boolean hovered = Math.abs(mouseX - px) < 4 && Math.abs(mouseY - py) < 4;
            int color = (p == draggingPoint) ? 0xFFFFFF00 : (hovered ? 0xFFFF0000 : 0xFFFFFFFF);

            context.fill(px - 2, py - 2, px + 2, py + 2, color);

            if (hovered) {
                // 提示
                String tip = String.format(tooltipText, p.value);
                context.setTooltipForNextFrame(Minecraft.getInstance().font, Component.literal(tip), mouseX, mouseY);
            }
        }
    }

    private int valToScreenX(float t) {
        return getX() + (int) (t * (width));
    }

    private float screenToValX(double mouseX) {
        return (float) (mouseX - getX()) / (width);
    }

    private int valToScreenY(float v) {
        float relY = (v - minY) / (maxY - minY);
        return getY() + (int) ((1.0f - relY) * (height));
    }

    private float screenToValY(double mouseY) {
        float relY = 1.0f - (float) (mouseY - getY()) / (height);
        return relY * (maxY - minY) + minY;
    }

    @Override
    public boolean mouseClicked(net.minecraft.client.input.MouseButtonEvent event, boolean doubleClick) {
        double mouseX = event.x(), mouseY = event.y(); int button = event.button();
        if (!isMouseOver(mouseX, mouseY))
            return false;

        long now = System.currentTimeMillis();
        boolean isDoubleClick = (now - lastClickTime < DOUBLE_CLICK_INTERVAL);
        lastClickTime = now;

        if (button == 1) { // 右键删除
            for (DataPoint p : points) {
                if (Math.abs(mouseX - valToScreenX(p.timePercent)) < 5
                        && Math.abs(mouseY - valToScreenY(p.value)) < 5) {
                    if (p.timePercent > 0.0f && p.timePercent < 1.0f && points.size() > 2) {
                        points.remove(p);
                        return true;
                    }
                }
            }
        }

        if (button == 0 && isDoubleClick) { // 双击添加
            float newTime = Mth.clamp(screenToValX(mouseX), 0.001f, 0.999f);
            float newVal = getSnappedValue(Mth.clamp(screenToValY(mouseY), minY, maxY));
            points.add(new DataPoint(newTime, newVal));
            points.sort(Comparator.comparingDouble(p -> p.timePercent));
            return true;
        }

        if (button == 0) { // 单击抓取
            for (DataPoint p : points) {
                if (Math.abs(mouseX - valToScreenX(p.timePercent)) < 5
                        && Math.abs(mouseY - valToScreenY(p.value)) < 5) {
                    draggingPoint = p;
                    return true;
                }
            }
        }
        return super.mouseClicked(event, doubleClick);
    }

    @Override
    public boolean mouseDragged(net.minecraft.client.input.MouseButtonEvent event, double deltaX, double deltaY) {
        double mouseX = event.x(), mouseY = event.y(); int button = event.button();
        if (button == 0 && draggingPoint != null) {
            // 只有非边缘点可以左右移动
            if (draggingPoint.timePercent > 0.0f && draggingPoint.timePercent < 1.0f) {
                draggingPoint.timePercent = Mth.clamp(screenToValX(mouseX), 0.0f, 1.0f);
            }

            // 垂直方向统一吸附到 0.1
            float rawVal = screenToValY(mouseY);
            draggingPoint.value = Mth.clamp(getSnappedValue(rawVal), minY, maxY);

            points.sort(Comparator.comparingDouble(p -> p.timePercent));
            return true;
        }
        return false;
    }

    @Override
    public boolean mouseReleased(net.minecraft.client.input.MouseButtonEvent event) {
        double mouseX = event.x(), mouseY = event.y(); int button = event.button();
        draggingPoint = null;
        return super.mouseReleased(event);
    }

    @Override
    protected void updateWidgetNarration(
            net.minecraft.client.gui.narration.NarrationElementOutput builder) {
    }
}