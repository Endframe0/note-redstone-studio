package com.atemukesu.extendednoteblock.client.gui.screen;

import com.atemukesu.extendednoteblock.client.gui.widget.MathExpressionWidget;
import com.atemukesu.extendednoteblock.client.gui.widget.VisualCurveWidget;
import com.atemukesu.extendednoteblock.network.ClientModMessages;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.network.chat.Component;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.objecthunter.exp4j.ExpressionBuilder;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class ConductorScreen extends Screen {
    private final BlockPos min, max;
    private final CompoundTag sample;

    // UI Components
    private EditBox noteInput, velocityInput, sustainInput;
    private EditBox fadeInInput, fadeOutInput;

    private VisualCurveWidget volCurve;
    private VisualCurveWidget pitchCurve;
    private EditBox rangeInput;
    private MathExpressionWidget exprX, exprY, exprZ;

    // State
    private int pitchBendRange = 2;
    private String errorMessageX, errorMessageY, errorMessageZ;
    private long errorDisplayTimeX, errorDisplayTimeY, errorDisplayTimeZ;
    private static final long ERROR_DISPLAY_DURATION = 5000;

    // Field Modes: "note" -> 0=Set, 1=Add, 2=Mult, 3=Div, 4=Sub
    private final Map<String, Integer> fieldModes = new HashMap<>();
    private final Map<String, Button> fieldModeButtons = new HashMap<>();
    private final Map<String, EditBox> fieldInputs = new HashMap<>(); // [NEW] Track inputs

    public ConductorScreen(BlockPos min, BlockPos max, Map<String, Integer> counts, Map<String, CompoundTag> samples) {
        super(Component.translatable("gui.extendednoteblock.conductor.title"));
        this.min = min;
        this.max = max;
        this.sample = samples.getOrDefault("extendednoteblock:extended_note_block", new CompoundTag());

        try {
            this.pitchBendRange = com.atemukesu.extendednoteblock.config.ConfigManager.getConfig().pitchBendRange;
        } catch (Exception e) {
            this.pitchBendRange = 2;
        }
    }

    @Override
    protected void init() {
        int sidebarWidth = 160; // Increased sidebar width for mode buttons
        int canvasWidth = this.width - sidebarWidth - 30;
        int canvasHeight = (this.height - 180) / 2;
        int gap = 35;

        // --- Left Sidebar: Basic Parameters ---
        int leftX = 20;
        int currentY = 50;

        // Field setup helper
        // Note
        noteInput = createFieldRow("note", leftX, currentY, 60);
        currentY += 35;

        // Velocity
        velocityInput = createFieldRow("velocity", leftX, currentY, 100);
        currentY += 35;

        // Sustain
        sustainInput = createFieldRow("sustainTime", leftX, currentY, 40);
        currentY += 35;

        // Fade In
        fadeInInput = createFieldRow("fadeInTime", leftX, currentY, 0);
        currentY += 35;

        // Fade Out
        fadeOutInput = createFieldRow("fadeOutTime", leftX, currentY, 0);
        currentY += 35;

        // --- Right Area: Advanced Curves ---
        int curveX = sidebarWidth + 10;
        int curveYStart = 35;

        // Vol Curve
        volCurve = new VisualCurveWidget(curveX, curveYStart, canvasWidth, canvasHeight,
                Component.translatable("gui.extendednoteblock.advanced.volume_envelope").getString(),
                Component.translatable("gui.extendednoteblock.advanced.volume_tooltip_format").getString(),
                0f, 2f, 0xFF55FF55, true);
        addRenderableWidget(volCurve);

        // Vol Mode Button (Top Right)
        createModeButton("volCurve", curveX + canvasWidth - 20, curveYStart - 22);

        // Pitch Curve
        int pitchY = curveYStart + canvasHeight + gap;
        pitchCurve = new VisualCurveWidget(curveX, pitchY, canvasWidth, canvasHeight,
                Component.translatable("gui.extendednoteblock.advanced.pitch_bend_semitones").getString(),
                Component.translatable("gui.extendednoteblock.advanced.pitch_tooltip_format").getString(),
                -pitchBendRange, pitchBendRange, 0xFFFFFF55, false);
        addRenderableWidget(pitchCurve);

        // Range Config for Pitch with +/- buttons
        // Layout: [KeepBtn] [Label] [-] [Input] [+]
        // Positioned at top-right of the pitch curve header area

        int rangeGroupY = pitchY - 20;
        int maxX = curveX + canvasWidth;

        // 1. Plus Button (Rightmost)
        addRenderableWidget(Button.builder(Component.literal("+"), b -> adjustRange(1))
                .bounds(maxX - 20, rangeGroupY, 20, 20).build());

        // 2. Range Input (30px wide, 2px gap)
        rangeInput = new EditBox(font, maxX - 20 - 2 - 30, rangeGroupY, 30, 20,
                Component.translatable("gui.extendednoteblock.advanced.range"));
        rangeInput.setValue(String.valueOf(pitchBendRange));
        rangeInput.setResponder(this::onRangeChanged);
        addRenderableWidget(rangeInput);

        // 3. Minus Button (2px gap from input)
        addRenderableWidget(Button.builder(Component.literal("-"), b -> adjustRange(-1))
                .bounds(maxX - 20 - 2 - 30 - 2 - 20, rangeGroupY, 20, 20).build());

        // 4. Pitch Keep Mode Button (Moved further left to avoid label overlap)
        createModeButton("pitchCurve", maxX - 150, rangeGroupY);

        // --- Bottom Area: Expressions ---
        int exprYPos = pitchY + canvasHeight + 30;
        int sectionWidth = canvasWidth / 3;
        int btnSize = 20;
        int exprInputWidth = sectionWidth - btnSize - 5;

        // Expr X
        int x1 = curveX;
        createModeButton("exprX", x1, exprYPos);
        exprX = new MathExpressionWidget(font, x1 + btnSize + 2, exprYPos, exprInputWidth, 20,
                Component.translatable("gui.extendednoteblock.advanced.x_axis"));

        // Expr Y
        int x2 = curveX + sectionWidth;
        createModeButton("exprY", x2, exprYPos);
        exprY = new MathExpressionWidget(font, x2 + btnSize + 2, exprYPos, exprInputWidth, 20,
                Component.translatable("gui.extendednoteblock.advanced.y_axis"));

        // Expr Z
        int x3 = curveX + sectionWidth * 2;
        createModeButton("exprZ", x3, exprYPos);
        exprZ = new MathExpressionWidget(font, x3 + btnSize + 2, exprYPos, exprInputWidth, 20,
                Component.translatable("gui.extendednoteblock.advanced.z_axis"));

        // Callbacks
        exprX.setTextChangeCallback(t -> validateSingleExpression("X", t, () -> errorMessageX, m -> errorMessageX = m,
                () -> errorDisplayTimeX, time -> errorDisplayTimeX = time));
        exprY.setTextChangeCallback(t -> validateSingleExpression("Y", t, () -> errorMessageY, m -> errorMessageY = m,
                () -> errorDisplayTimeY, time -> errorDisplayTimeY = time));
        exprZ.setTextChangeCallback(t -> validateSingleExpression("Z", t, () -> errorMessageZ, m -> errorMessageZ = m,
                () -> errorDisplayTimeZ, time -> errorDisplayTimeZ = time));

        addRenderableWidget(exprX);
        addRenderableWidget(exprY);
        addRenderableWidget(exprZ);

        // Update visuals for Expr/Curve modes (initially Keep)
        updateFieldVisuals("volCurve", -1);
        updateFieldVisuals("pitchCurve", -1);
        updateFieldVisuals("exprX", -1);
        updateFieldVisuals("exprY", -1);
        updateFieldVisuals("exprZ", -1);

        // --- Action Buttons ---
        int btnY = height - 30;
        addRenderableWidget(Button.builder(Component.translatable("gui.extendednoteblock.conductor.button.clear"), b -> {
            ClientModMessages.sendClearSelectionToServer();
            this.onClose();
        }).bounds(20, btnY, 80, 20).build());

        addRenderableWidget(
                Button.builder(Component.translatable("gui.extendednoteblock.conductor.button.apply"), b -> apply())
                        .bounds(110, btnY, 80, 20).build());

        loadSampleData();
    }

    // Helper to create: [Mode] [-] [Input] [+]
    // Modes: -1=Keep, 0=Set, 1=Add, 4=Sub, 2=Mult, 3=Div
    private EditBox createFieldRow(String key, int x, int y, int defaultValue) {
        // Default Mode: Keep (-1)
        fieldModes.putIfAbsent(key, -1);

        // Mode Button
        Button modeBtn = Button.builder(getModeText(fieldModes.get(key)), b -> {
            cycleMode(key, b);
        }).bounds(x, y, 20, 20).build();
        addRenderableWidget(modeBtn);
        fieldModeButtons.put(key, modeBtn);

        // Minus Button
        EditBox input = new EditBox(font, x + 46, y, 40, 20, Component.literal(""));
        addRenderableWidget(Button.builder(Component.literal("-"), b -> adjustField(key, input, -1))
                .bounds(x + 24, y, 20, 20).build());

        // Input Field
        int sampleVal = sample.contains(key) ? sample.getInt(key).orElse(0) : defaultValue;
        input.setValue(String.valueOf(sampleVal));
        addRenderableWidget(input);
        fieldInputs.put(key, input); // Track input

        // Plus Button
        addRenderableWidget(Button.builder(Component.literal("+"), b -> adjustField(key, input, 1))
                .bounds(x + 88, y, 20, 20).build());

        // Initialize Visual State
        updateFieldVisuals(key, fieldModes.get(key));

        return input;
    }

    // New helper for simple Keep/Set toggle button
    private void createModeButton(String key, int x, int y) {
        fieldModes.putIfAbsent(key, -1); // Default Keep
        Button btn = Button.builder(getModeText(fieldModes.get(key)), b -> {
            int m = fieldModes.getOrDefault(key, -1);
            // Toggle between -1 (Keep) and 0 (Set)
            m = (m == -1) ? 0 : -1;
            fieldModes.put(key, m);
            b.setMessage(getModeText(m));
            updateFieldVisuals(key, m);
        }).bounds(x, y, 20, 20).build();
        fieldModeButtons.put(key, btn);
        addRenderableWidget(btn);
    }

    private void cycleMode(String key, Button btn) {
        int m = fieldModes.getOrDefault(key, -1);
        // Cycle: -1(Keep) -> 0(Set) -> 1(Add) -> 4(Sub) -> 2(Mult) -> 3(Div) -> -1
        m = switch (m) {
            case -1 -> 0;
            case 0 -> 1;
            case 1 -> 4;
            case 4 -> 2;
            case 2 -> 3;
            case 3 -> -1;
            default -> -1;
        };
        fieldModes.put(key, m);
        btn.setMessage(getModeText(m));

        // Update Visuals based on new mode
        updateFieldVisuals(key, m);
    }

    private void updateFieldVisuals(String key, int mode) {
        // Handle Curves separately if needed (VisualCurveWidget doesn't have
        // setEditable,
        // but we can maybe change color or something? For now do nothing special for
        // curves visually
        // other than button text).
        // Actually, users want to know if it's disabled.
        // We can check key to see if it's an input widget

        if (fieldInputs.containsKey(key)) {
            EditBox input = fieldInputs.get(key);
            if (mode == -1) {
                input.setEditable(false);
                input.setTextColor(0xFF888888);
            } else {
                input.setEditable(true);
                input.setTextColor(0xFFE0E0E0);
            }
        }

        // Expressions
        MathExpressionWidget targetExpr = null;
        if (key.equals("exprX"))
            targetExpr = exprX;
        if (key.equals("exprY"))
            targetExpr = exprY;
        if (key.equals("exprZ"))
            targetExpr = exprZ;

        if (targetExpr != null) {
            if (mode == -1) {
                targetExpr.setEditable(false);
                targetExpr.setTextColor(0xFF888888);
            } else {
                targetExpr.setEditable(true);
                targetExpr.setTextColor(0xFFE0E0E0);
            }
        }

        // For Curves, we might want to flag them as disabled in their render?
        // But VisualCurveWidget class is not open to modification here easily without
        // reflection or adding methods.
        // We'll rely on the "K" button status.
    }

    private Component getModeText(int mode) {
        return switch (mode) {
            case 0 -> Component.literal("=").withStyle(ChatFormatting.YELLOW);
            case 1 -> Component.literal("+").withStyle(ChatFormatting.GREEN);
            case 2 -> Component.literal("x").withStyle(ChatFormatting.AQUA);
            case 3 -> Component.literal("/").withStyle(ChatFormatting.AQUA);
            case 4 -> Component.literal("-").withStyle(ChatFormatting.RED);
            default -> Component.literal("K").withStyle(ChatFormatting.GRAY); // Keep
        };
    }

    private void adjustField(String key, EditBox field, int delta) {
        if (fieldModes.getOrDefault(key, -1) == -1)
            return; // Don't adjust if in Keep mode
        try {
            // For Set/Add/Sub, we just adjust integer value?
            // If mode calls for decimals (Mult/Div), this +/- might be weird.
            // But assume normal integer adjustment for now.
            float val = Float.parseFloat(field.getValue());
            // If integer string, keep it integer
            if (field.getValue().contains(".")) {
                field.setValue(String.format("%.1f", val + delta));
            } else {
                field.setValue(String.valueOf((int) val + delta));
            }
        } catch (NumberFormatException e) {
            field.setValue(String.valueOf(delta));
        }
    }

    private void adjustRange(int delta) {
        try {
            int current = Integer.parseInt(rangeInput.getValue());
            int newVal = Math.max(1, Math.min(48, current + delta));
            rangeInput.setValue(String.valueOf(newVal));
            // Trigger listener manually or let setText do it? setText usually doesn't
            // trigger listener in older versions but does in newer.
            // onRangeChanged handles the logic so it should be fine if setText triggers it.
            // If not, we call it:
            onRangeChanged(String.valueOf(newVal));
        } catch (NumberFormatException ignored) {
        }
    }

    private void onRangeChanged(String text) {
        try {
            int r = Integer.parseInt(text);
            if (r > 0 && r <= 48) {
                this.pitchBendRange = r;
                pitchCurve.setMinMax(-r, r);
            }
        } catch (NumberFormatException ignored) {
        }
    }

    private void loadSampleData() {
        if (sample.contains("AdvancedData")) {
            CompoundTag adv = sample.getCompound("AdvancedData").orElse(new CompoundTag());
            if (adv.contains("VolumePoints"))
                loadPoints(volCurve, adv.getList("VolumePoints").orElse(new ListTag()));
            if (adv.contains("PitchBendPoints"))
                loadPoints(pitchCurve, adv.getList("PitchBendPoints").orElse(new ListTag()));

            if (adv.contains("ExpressionX"))
                exprX.setValue(adv.getString("ExpressionX").orElse(""));
            if (adv.contains("ExpressionY"))
                exprY.setValue(adv.getString("ExpressionY").orElse(""));
            if (adv.contains("ExpressionZ"))
                exprZ.setValue(adv.getString("ExpressionZ").orElse(""));
        }
    }

    private void loadPoints(VisualCurveWidget widget, ListTag list) {
        List<VisualCurveWidget.DataPoint> points = new ArrayList<>();
        for (int i = 0; i < list.size(); i++) {
            CompoundTag p = list.getCompound(i).orElse(new CompoundTag());
            points.add(new VisualCurveWidget.DataPoint(p.getFloat("t").orElse(0f), p.getFloat("v").orElse(0f)));
        }
        widget.setPoints(points);
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor context, int mouseX, int mouseY, float delta) {
        super.extractRenderState(context, mouseX, mouseY, delta);

        context.centeredText(font,
                Component.translatable("gui.extendednoteblock.conductor.title_styled"), width / 2, 8, 0xFFD4AF37);
        context.centeredText(font,
                Component.translatable("gui.extendednoteblock.conductor.selection_info", min.toShortString(),
                        max.toShortString()),
                width / 2, 20, 0xFFAAAAAA);

        // Sidebar Labels
        int leftX = 20;
        int currentY = 50;
        drawLabel(context, "gui.extendednoteblock.conductor.param.note", leftX, currentY);
        currentY += 35;
        drawLabel(context, "gui.extendednoteblock.conductor.param.velocity", leftX, currentY);
        currentY += 35;
        drawLabel(context, "gui.extendednoteblock.conductor.param.sustain", leftX, currentY);
        currentY += 35;
        drawLabel(context, "gui.extendednoteblock.fadein_time", leftX, currentY);
        currentY += 35;
        drawLabel(context, "gui.extendednoteblock.fadeout_time", leftX, currentY);
        currentY += 35;

        // Expression Labels
        context.text(font, Component.translatable("gui.extendednoteblock.advanced.x_axis"),
                exprX.getX(), exprX.getY() - 10, 0xFFAAAAAA, true);
        context.text(font, Component.translatable("gui.extendednoteblock.advanced.y_axis"),
                exprY.getX(), exprY.getY() - 10, 0xFFAAAAAA, true);
        context.text(font, Component.translatable("gui.extendednoteblock.advanced.z_axis"),
                exprZ.getX(), exprZ.getY() - 10, 0xFFAAAAAA, true);

        // Range Label
        context.text(font, Component.translatable("gui.extendednoteblock.advanced.range_label"),
                rangeInput.getX() - 22 - 45, rangeInput.getY() + 6, 0xFFAAAAAA, true);

        drawExpressionError(context, exprX, errorMessageX, errorDisplayTimeX);
        drawExpressionError(context, exprY, errorMessageY, errorDisplayTimeY);
        drawExpressionError(context, exprZ, errorMessageZ, errorDisplayTimeZ);
    }

    private void drawLabel(GuiGraphicsExtractor context, String key, int x, int y) {
        context.text(font, Component.translatable(key), x, y - 10, 0xFFFFFFFF, true);
    }

    private void apply() {
        if (!validateExpressions())
            return;

        List<ClientModMessages.BulkUpdateEntry> updates = new ArrayList<>();
        CompoundTag rootPatch = new CompoundTag();
        CompoundTag advancedData = new CompoundTag();

        // 1. Basic Fields with Modes
        addUpdate(updates, "note", noteInput);
        addUpdate(updates, "velocity", velocityInput);
        addUpdate(updates, "sustainTime", sustainInput);
        addUpdate(updates, "fadeInTime", fadeInInput);
        addUpdate(updates, "fadeOutTime", fadeOutInput);

        // 2. Curves
        // 2. Curves
        if (fieldModes.getOrDefault("volCurve", -1) != -1) {
            ListTag volPoints = new ListTag();
            for (VisualCurveWidget.DataPoint p : volCurve.getPoints()) {
                CompoundTag tag = new CompoundTag();
                tag.putFloat("t", p.timePercent);
                tag.putFloat("v", p.value);
                volPoints.add(tag);
            }
            advancedData.put("VolumePoints", volPoints);
        }

        if (fieldModes.getOrDefault("pitchCurve", -1) != -1) {
            ListTag pitchPoints = new ListTag();
            for (VisualCurveWidget.DataPoint p : pitchCurve.getPoints()) {
                CompoundTag tag = new CompoundTag();
                tag.putFloat("t", p.timePercent);
                tag.putFloat("v", p.value);
                pitchPoints.add(tag);
            }
            advancedData.put("PitchBendPoints", pitchPoints);
        }

        // 3. Sound Path & Expressions
        // 3. Sound Path & Expressions
        String sx = exprX.getValue(), sy = exprY.getValue(), sz = exprZ.getValue();

        // Only update if not in Keep mode
        if (fieldModes.getOrDefault("exprX", -1) != -1)
            advancedData.putString("ExpressionX", sx);
        if (fieldModes.getOrDefault("exprY", -1) != -1)
            advancedData.putString("ExpressionY", sy);
        if (fieldModes.getOrDefault("exprZ", -1) != -1)
            advancedData.putString("ExpressionZ", sz);

        @SuppressWarnings("unused")
        int sustain = 40;
        try {
            sustain = Integer.parseInt(sustainInput.getValue());
        } catch (Exception ignored) {
        }

        // Note: SoundPath is now recalculated on the server side in ModMessages.java
        // This ensures it uses the correct per-block sustain and existing expression
        // values if in Keep mode.
        advancedData.put("SoundPath", new ListTag());

        if (!advancedData.isEmpty()) {
            rootPatch.put("AdvancedData", advancedData);
        }

        ClientModMessages.sendSmartBulkUpdateToServer(min, max, "extendednoteblock:extended_note_block", updates,
                rootPatch);
        this.onClose();
    }

    private void addUpdate(List<ClientModMessages.BulkUpdateEntry> updates, String key, EditBox input) {
        int mode = fieldModes.getOrDefault(key, -1);
        if (mode == -1)
            return; // Skip if Keep mode
        String val = input.getValue();
        updates.add(new ClientModMessages.BulkUpdateEntry(key, mode, val));
    }

    private boolean validateExpressions() {
        return validate(exprX.getValue()) && validate(exprY.getValue()) && validate(exprZ.getValue());
    }

    private boolean validate(String expr) {
        if (expr.trim().isEmpty())
            return true;
        try {
            new ExpressionBuilder(expr).variables("t", "d").build().setVariable("t", 0.5).setVariable("d", 10)
                    .evaluate();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void validateSingleExpression(String label, String expr, java.util.function.Supplier<String> getError,
            java.util.function.Consumer<String> setError, java.util.function.Supplier<Long> getTime,
            java.util.function.Consumer<Long> setTime) {
        if (!expr.trim().isEmpty()) {
            try {
                double res = new ExpressionBuilder(expr).variables("t", "d").build().setVariable("t", 0.5)
                        .setVariable("d", 10).evaluate();
                if (Double.isNaN(res) || Double.isInfinite(res))
                    throw new ArithmeticException("Invalid");
                setError.accept(null);
            } catch (Exception e) {
                setError.accept(
                        Component.translatable("gui.extendednoteblock.advanced.error.invalid_syntax", label).getString());
                setTime.accept(System.currentTimeMillis());
            }
        } else {
            setError.accept(null);
        }
    }

    private void drawExpressionError(GuiGraphicsExtractor context, MathExpressionWidget widget, String errorMessage,
            long errorDisplayTime) {
        if (errorMessage != null && System.currentTimeMillis() - errorDisplayTime < ERROR_DISPLAY_DURATION) {
            int errorX = widget.getX() + widget.getWidth() + 5;
            int errorY = widget.getY();
            int errorTextWidth = Math.min(font.width(errorMessage), 200);
            int clampedErrorX = Math.min(errorX, width - errorTextWidth - 5);
            context.fill(clampedErrorX, errorY, clampedErrorX + errorTextWidth, errorY + 12, 0xCCFF0000);
            String displayText = font.plainSubstrByWidth(errorMessage, 200);
            context.text(font, displayText, clampedErrorX + 2, errorY + 2, 0xFFFFFFFF, false);
        }
    }
}