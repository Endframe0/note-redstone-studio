package com.atemukesu.extendednoteblock.client.gui.widget;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.network.chat.Component;
import net.minecraft.ChatFormatting;

import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MathExpressionWidget extends EditBox {
    // 匹配数学函数、变量 t、d 和数字
    private static final Pattern HIGHLIGHT_PATTERN = Pattern.compile(
            "(?<func>sin|cos|tan|abs|sqrt|pi|exp|log|pow)|(?<var>t|d)|(?<num>\\d+(\\.\\d+)?)|(?<op>[+\\-*/^()])"
    );

    private Consumer<String> textChangeCallback;

    public MathExpressionWidget(Font font, int x, int y, int width, int height, Component text) {
        super(font, x, y, width, height, text);
        // 设置一个渲染器，通过 Style 覆盖默认文本渲染逻辑
        this.addFormatter((string, firstCharacterIndex) -> {
            return getHighlightedText(string);
        });

        // 设置文本变化监听器
        this.setResponder(this::onTextChange);
    }

    // 设置文本变化回调
    public void setTextChangeCallback(Consumer<String> callback) {
        this.textChangeCallback = callback;
    }

    // 文本变化处理方法
    private void onTextChange(String newText) {
        if (textChangeCallback != null) {
            textChangeCallback.accept(newText);
        }
    }

    private FormattedCharSequence getHighlightedText(String text) {
        net.minecraft.network.chat.MutableComponent mutableText = Component.empty();
        Matcher matcher = HIGHLIGHT_PATTERN.matcher(text);
        int lastPos = 0;

        while (matcher.find()) {
            // 添加匹配前的普通文本
            if (matcher.start() > lastPos) {
                mutableText.append(Component.literal(text.substring(lastPos, matcher.start())).withStyle(ChatFormatting.GRAY));
            }

            String match = matcher.group();
            ChatFormatting color = ChatFormatting.WHITE;

            if (matcher.group("func") != null) color = ChatFormatting.AQUA;      // 函数为青色
            else if (matcher.group("var") != null) color = ChatFormatting.GREEN; // 变量t为绿色
            else if (matcher.group("num") != null) color = ChatFormatting.GOLD;  // 数字为金色
            else if (matcher.group("op") != null) color = ChatFormatting.LIGHT_PURPLE; // 运算符

            mutableText.append(Component.literal(match).withStyle(color));
            lastPos = matcher.end();
        }

        if (lastPos < text.length()) {
            mutableText.append(Component.literal(text.substring(lastPos)).withStyle(ChatFormatting.GRAY));
        }

        return mutableText.getVisualOrderText();
    }
}