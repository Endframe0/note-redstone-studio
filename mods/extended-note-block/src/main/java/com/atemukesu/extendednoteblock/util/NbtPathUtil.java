package com.atemukesu.extendednoteblock.util;

import net.minecraft.nbt.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class NbtPathUtil {
    private static final Pattern LIST_PATTERN = Pattern.compile("([^\\[\\]]+)\\[(\\d+)\\]");

    /**
     * 根据路径修改 NBT 数据
     * 
     * @param root       根 NBT Compound
     * @param pathString 路径 (e.g., "Items[0].Count" or "display.Name")
     * @param valueStr   新值的字符串表示
     * @param opMode     0=Set, 1=Add, 2=Multiply
     */
    public static void apply(CompoundTag root, String pathString, String valueStr, int opMode) {
        try {
            String[] parts = pathString.split("\\.");
            Tag current = root;
            Tag parent = null;
            String lastKey = null;
            int lastIndex = -1;

            // 遍历路径找到目标节点
            for (int i = 0; i < parts.length; i++) {
                String part = parts[i];
                Matcher matcher = LIST_PATTERN.matcher(part);

                parent = current;

                if (matcher.matches()) {
                    // 处理列表: ListName[Index]
                    String listName = matcher.group(1);
                    int index = Integer.parseInt(matcher.group(2));

                    if (current instanceof CompoundTag c) {
                        current = c.get(listName);
                        lastKey = null;
                    } else {
                        return;
                    } // 路径错误

                    if (current instanceof ListTag list) {
                        if (index >= 0 && index < list.size()) {
                            parent = list; // Parent becomes the list
                            lastIndex = index;
                            if (i < parts.length - 1) {
                                current = list.get(index);
                            }
                        } else {
                            return;
                        } // 索引越界
                    } else {
                        return;
                    }
                } else {
                    // 处理普通对象: KeyName
                    if (current instanceof CompoundTag c) {
                        lastKey = part;
                        lastIndex = -1;
                        if (i < parts.length - 1) {
                            current = c.get(part);
                            if (current == null)
                                return; // 路径中断
                        }
                    } else {
                        return;
                    }
                }
            }

            // 执行修改
            if (parent instanceof CompoundTag c && lastKey != null) {
                modifyValue(c, lastKey, valueStr, opMode);
            } else if (parent instanceof ListTag l && lastIndex != -1) {
                // NbtList 修改比较麻烦，因为没有直接的 set(index, value) for primitives
                // 我们需要提取旧值，计算，然后 set
                modifyListValue(l, lastIndex, valueStr, opMode);
            }

        } catch (Exception e) {
            // 忽略修改失败，防止奔溃
        }
    }

    private static void modifyValue(CompoundTag parent, String key, String valStr, int op) {
        if (!parent.contains(key))
            return; // 只修改已存在的，不创建新键(为了安全)
        Tag old = parent.get(key);

        // 如果是数字且模式不是SET
        if (op != 0 && old instanceof NumericTag num) {
            try {
                double oldVal = num.doubleValue();
                double modVal = Double.parseDouble(valStr);
                double newVal = oldVal;

                switch (op) {
                    case 1 -> newVal = oldVal + modVal; // ADD
                    case 2 -> newVal = oldVal * modVal; // MULT
                    case 3 -> newVal = oldVal / (modVal == 0 ? 1 : modVal); // DIV
                    case 4 -> newVal = oldVal - modVal; // SUB
                    default -> newVal = oldVal * modVal; // Fallback to mult for legacy safety? Or just oldVal. derived
                                                         // from previous code behavior
                }

                if (old instanceof IntTag)
                    parent.putInt(key, (int) newVal);
                else if (old instanceof DoubleTag)
                    parent.putDouble(key, newVal);
                else if (old instanceof FloatTag)
                    parent.putFloat(key, (float) newVal);
                else if (old instanceof ShortTag)
                    parent.putShort(key, (short) newVal);
                else if (old instanceof ByteTag)
                    parent.putByte(key, (byte) newVal);
                else if (old instanceof LongTag)
                    parent.putLong(key, (long) newVal);
            } catch (NumberFormatException ignored) {
            }
        } else if (op == 0) {
            // SET 模式，尝试解析类型
            try {
                if (old instanceof IntTag)
                    parent.putInt(key, Integer.parseInt(valStr));
                else if (old instanceof DoubleTag)
                    parent.putDouble(key, Double.parseDouble(valStr));
                else if (old instanceof FloatTag)
                    parent.putFloat(key, Float.parseFloat(valStr));
                else if (old instanceof ByteTag)
                    parent.putByte(key, Byte.parseByte(valStr));
                else if (old instanceof ShortTag)
                    parent.putShort(key, Short.parseShort(valStr));
                else if (old instanceof LongTag)
                    parent.putLong(key, Long.parseLong(valStr));
                else if (old instanceof StringTag)
                    parent.putString(key, valStr);
            } catch (Exception e) {
                // 如果解析失败且原本是String，当作String存入
                if (old instanceof StringTag)
                    parent.putString(key, valStr);
            }
        }
    }

    private static void modifyListValue(ListTag list, int index, String valStr, int op) {
        Tag old = list.get(index);
        if (op != 0 && old instanceof NumericTag num) {
            try {
                double oldVal = num.doubleValue();
                double modVal = Double.parseDouble(valStr);
                double newVal = oldVal;

                switch (op) {
                    case 1 -> newVal = oldVal + modVal; // ADD
                    case 2 -> newVal = oldVal * modVal; // MULT
                    case 3 -> newVal = oldVal / (modVal == 0 ? 1 : modVal); // DIV
                    case 4 -> newVal = oldVal - modVal; // SUB
                    default -> newVal = oldVal * modVal;
                }

                if (old instanceof IntTag)
                    list.set(index, IntTag.valueOf((int) newVal));
                else if (old instanceof FloatTag)
                    list.set(index, FloatTag.valueOf((float) newVal));
                else if (old instanceof DoubleTag)
                    list.set(index, DoubleTag.valueOf(newVal));
                else
                    list.set(index, IntTag.valueOf((int) newVal)); // fallback
            } catch (NumberFormatException ignored) {
            }
        } else if (op == 0) {
            try {
                if (old instanceof IntTag)
                    list.set(index, IntTag.valueOf(Integer.parseInt(valStr)));
                else if (old instanceof FloatTag)
                    list.set(index, FloatTag.valueOf(Float.parseFloat(valStr)));
                else if (old instanceof DoubleTag)
                    list.set(index, DoubleTag.valueOf(Double.parseDouble(valStr)));
                else if (old instanceof StringTag)
                    list.set(index, StringTag.valueOf(valStr));
                else if (old instanceof ByteTag)
                    list.set(index, ByteTag.valueOf(Byte.parseByte(valStr)));
                else if (old instanceof ShortTag)
                    list.set(index, ShortTag.valueOf(Short.parseShort(valStr)));
                else if (old instanceof LongTag)
                    list.set(index, LongTag.valueOf(Long.parseLong(valStr)));
                else
                    list.set(index, StringTag.valueOf(valStr)); // fallback to string if type is unknown
            } catch (Exception e) {
                // If parsing fails, set as string
                list.set(index, StringTag.valueOf(valStr));
            }
        }
    }
}
