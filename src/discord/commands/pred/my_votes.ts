import { prisma } from "#db/prisma.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { getById as getTournamentById } from "../../../services/tournament.js";

async function respond(i: ChatInputCommandInteraction, content: string) {
    // 64 = MessageFlags.Ephemeral
    if (i.deferred) return i.editReply({ content });
    if (i.replied) return i.followUp({ content, flags: 64 });
    return i.reply({ content, flags: 64 });
}

export async function predSeeVotes(i: ChatInputCommandInteraction) {
    if (!i.inGuild()) {
        return respond(i, "Solo en servidores.");
    }

    const predictionId = i.options.getString("id", false);
    const tournamentIdRaw = i.options.getString("tournament", false);
    const tournamentId = tournamentIdRaw ?? undefined;
    const guildId = i.guildId!;
    const userId = i.user.id;

    // Verificar que el torneo existe si se especifica
    let tournamentName = "";
    if (tournamentId) {
        try {
            const tournament = await getTournamentById(tournamentId, guildId);
            if (!tournament) {
                return respond(i, "❌ Torneo no encontrado en este servidor.");
            }
            tournamentName = ` - ${tournament.name}`;
        } catch (e) {
            return respond(i, "❌ Error al verificar el torneo.");
        }
    }

    const votes = await prisma.vote.findMany({
        where: {
            userId,
            ...(predictionId ? { predictionId } : {}),
            prediction: { 
                guildId, 
                status: { in: ["OPEN", "CLOSED"] },
                ...(tournamentId ? { tournamentId } : {}),
            },
        },
        orderBy: { createdAt: "desc" },
        include: {
            prediction: {
                select: {
                    id: true,
                    title: true,
                    status: true,
                    lockTime: true,
                    channelId: true,
                    messageId: true,
                    tournamentId: true,
                },
            },
            option: {
                select: { label: true },
            },
        },
    });

    if (predictionId && votes.length === 0) {
        return respond(
            i,
            "No tienes ningún voto registrado para esa predicción, o ya está resuelta, o no pertenece a este servidor."
        );
    }

    if (!predictionId && votes.length === 0) {
        return respond(i, "No tienes votos en predicciones **no resueltas** (OPEN/CLOSED) en este servidor.");
    }

    const statusEmoji = (s: string) => (s === "OPEN" ? "🟢" : s === "CLOSED" ? "🟡" : "🔴");

    const formatBlock = (v: (typeof votes)[number]) => {
        const pred = v.prediction;
        const link = pred.messageId
            ? `https://discord.com/channels/${guildId}/${pred.channelId}/${pred.messageId}`
            : null;
        return [
            `${statusEmoji(pred.status)} **${pred.title}**`,
            `➡️ Tu voto: **${v.option.label}**`,
            link ? `🔗 ${link}` : null,
        ]
            .filter(Boolean)
            .join("\n");
    };

    const header = predictionId
        ? `🗳️ Tu voto (predicción no resuelta)${tournamentName}`
        : `🗳️ Tus votos en predicciones no resueltas${tournamentName}`;

    // Discord: límite ~2000 chars en content. Ajustamos el número de items mostrados si hace falta.
    let maxItems = predictionId ? 1 : 15;
    while (maxItems > 1) {
        const shown = votes.slice(0, maxItems);
        const remaining = votes.length - shown.length;
        const blocks = shown.map(formatBlock).join("\n\n");
        const footer =
            remaining > 0 ? `… y **${remaining}** más (total: ${votes.length}).` : `Total: ${votes.length}.`;

        const content = [header, "", blocks, "", footer].filter(Boolean).join("\n");
        if (content.length <= 1900) return respond(i, content);
        maxItems -= 1;
    }

    // Fallback ultra-corto
    const first = votes[0];
    if (!first) return respond(i, header);
    return respond(i, [header, "", formatBlock(first)].join("\n"));
}