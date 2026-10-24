package com.atemukesu.extendednoteblock.command;

import com.atemukesu.extendednoteblock.util.SmoothMoveManager;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.FloatArgumentType;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import com.mojang.brigadier.suggestion.SuggestionProvider;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.SharedSuggestionProvider;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;

public class SmoothMoveCommand {
    private static final SuggestionProvider<CommandSourceStack> DIRECTION_SUGGESTIONS = (context,
            builder) -> SharedSuggestionProvider.suggest(new String[] { "north", "south", "east", "west", "x", "-x", "y",
                    "-y", "z", "-z", "forward", "look" }, builder);

    public static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
        dispatcher.register(Commands.literal("smoothmove")
                .requires(source -> source.permissions().hasPermission(net.minecraft.server.permissions.Permissions.COMMANDS_GAMEMASTER))
                .then(Commands.literal("stop")
                        .then(Commands.argument("targets", EntityArgument.entities())
                                .executes(SmoothMoveCommand::executeStop)))
                .then(Commands.argument("targets", EntityArgument.entities())
                        .then(Commands.argument("direction", StringArgumentType.word())
                                .suggests(DIRECTION_SUGGESTIONS)
                                .then(Commands.argument("speed", FloatArgumentType.floatArg(0.0001f, 10.0f))
                                        .executes(ctx -> executeStart(ctx, -1)) // Optional duration -> -1
                                        .then(Commands
                                                .argument("duration", IntegerArgumentType.integer(0))
                                                .executes(ctx -> executeStart(ctx,
                                                        IntegerArgumentType.getInteger(ctx, "duration"))))))));
    }

    private static int executeStop(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
        Collection<? extends Entity> targets = EntityArgument.getEntities(context, "targets");
        int count = 0;
        for (Entity entity : targets) {
            if (SmoothMoveManager.isMoving(entity)) {
                SmoothMoveManager.stopMove(entity);
                count++;
            }
        }

        final int c = count;
        if (count > 0) {
            context.getSource().sendSuccess(
                    () -> Component.translatable("commands.extendednoteblock.smoothmove.stop.success", c), true);
        }
        return count;
    }

    private static int executeStart(CommandContext<CommandSourceStack> context, int duration)
            throws CommandSyntaxException {
        Collection<? extends Entity> targets = EntityArgument.getEntities(context, "targets");
        String direction = StringArgumentType.getString(context, "direction");
        float speed = FloatArgumentType.getFloat(context, "speed");

        int count = 0;
        List<Entity> failed = new ArrayList<>();

        for (Entity entity : targets) {
            if (SmoothMoveManager.isMoving(entity)) {
                failed.add(entity);
                continue;
            }

            Vec3 vel = calculateVelocity(entity, direction, speed);
            if (vel != null) {
                SmoothMoveManager.startMove(entity, vel, duration);
                count++;
            }
        }

        // Feedback
        if (!failed.isEmpty()) {
            for (Entity e : failed) {
                context.getSource().sendFailure(
                        Component.translatable("commands.extendednoteblock.smoothmove.already_moving", e.getDisplayName()));
            }
        }

        if (count > 0) {
            final int c = count;
            final boolean infinite = duration < 0;
            context.getSource().sendSuccess(
                    () -> infinite
                            ? Component.translatable("commands.extendednoteblock.smoothmove.success_infinite", c, direction)
                            : Component.translatable("commands.extendednoteblock.smoothmove.success", c, direction),
                    true);
        } else if (failed.size() == targets.size()) {
            // All failed
            // Already sent errors
        } else {
            context.getSource().sendFailure(Component.translatable("commands.extendednoteblock.smoothmove.failed"));
        }

        return count;
    }

    private static Vec3 calculateVelocity(Entity entity, String direction, float speed) {
        Vec3 vec = switch (direction.toLowerCase()) {
            case "north" -> new Vec3(0, 0, -1);
            case "south" -> new Vec3(0, 0, 1);
            case "east" -> new Vec3(1, 0, 0);
            case "west" -> new Vec3(-1, 0, 0);
            case "x" -> new Vec3(1, 0, 0);
            case "-x" -> new Vec3(-1, 0, 0);
            case "y" -> new Vec3(0, 1, 0);
            case "-y" -> new Vec3(0, -1, 0);
            case "z" -> new Vec3(0, 0, 1);
            case "-z" -> new Vec3(0, 0, -1);
            case "forward" -> Vec3.directionFromRotation(0, entity.getYRot()).normalize();
            case "look" -> entity.getLookAngle().normalize();
            default -> null;
        };

        return vec != null ? vec.scale(speed) : null;
    }
}
