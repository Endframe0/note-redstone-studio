package com.atemukesu.extendednoteblock.client.renderer;
import com.atemukesu.extendednoteblock.item.ConductorWandItem;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.gizmos.Gizmos;
import net.minecraft.gizmos.GizmoStyle;
import net.minecraft.world.phys.AABB;
/** 26.1 render-extraction compatible selection preview, including occluded edges. */
public final class ConductorWandRenderer {
    public static void tick(Minecraft client) {
        if (client.player == null || client.level == null) return;
        var stack = client.player.getMainHandItem();
        if (!(stack.getItem() instanceof ConductorWandItem)) return;
        var nbt = stack.getOrDefault(DataComponents.CUSTOM_DATA, CustomData.EMPTY).copyTag();
        BlockPos p1 = nbt.getCompound("Pos1").flatMap(ConductorWandItem::readSelectionPos).orElse(null);
        BlockPos p2 = nbt.getCompound("Pos2").flatMap(ConductorWandItem::readSelectionPos).orElse(null);
        try (var collector = client.collectPerTickGizmos()) {
            if (p1 != null) Gizmos.cuboid(p1, GizmoStyle.strokeAndFill(0xffff5555, 2.0f, 0x30ff5555)).setAlwaysOnTop();
            if (p2 != null) Gizmos.cuboid(p2, GizmoStyle.strokeAndFill(0xff5599ff, 2.0f, 0x305599ff)).setAlwaysOnTop();
            if (p1 != null && p2 != null) {
                AABB bounds = new AABB(Math.min(p1.getX(), p2.getX()), Math.min(p1.getY(), p2.getY()), Math.min(p1.getZ(), p2.getZ()),
                    Math.max(p1.getX(), p2.getX()) + 1, Math.max(p1.getY(), p2.getY()) + 1, Math.max(p1.getZ(), p2.getZ()) + 1);
                Gizmos.cuboid(bounds, GizmoStyle.stroke(0xffffffff, 1.5f)).setAlwaysOnTop();
            }
        }
    }
}
