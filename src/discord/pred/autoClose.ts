import type { Client } from "discord.js";
import { ActionRowBuilder, ButtonBuilder } from "discord.js";
import { prisma } from "#db/prisma.js";
import { env } from "#config/env.js";

export async function sendAutoCloseMessage(
  client: Client,
  args: {
    guildId: string;
    channelId: string;
    messageId?: string | null;
    title: string;
    lockTime?: Date | null;
  }
): Promise<void> {
  const announcementsChannelId = env.ANNOUNCEMENTS_CHANNEL_ID ?? "1400445241533927424";

  const jumpLink = args.messageId
    ? `https://discord.com/channels/${args.guildId}/${args.channelId}/${args.messageId}`
    : null;

  const lockInfo = args.lockTime ? `<t:${Math.floor(args.lockTime.getTime() / 1000)}:F>` : null;

  const content = [
    `⏰ Votaciones cerradas automáticamente: **${args.title}**`,
    lockInfo ? `Cierre: ${lockInfo}` : null,
    jumpLink ? `Mensaje: ${jumpLink}` : null,
  ].filter(Boolean).join("\n");

  const preferred = await client.channels.fetch(announcementsChannelId).catch(() => null);
  if (preferred && preferred.isTextBased() && "send" in preferred) {
    await preferred.send({ content }).catch(() => null);
    return;
  }

  const fallback = await client.channels.fetch(args.channelId).catch(() => null);
  if (fallback && fallback.isTextBased() && "send" in fallback) {
    await fallback.send({ content }).catch(() => null);
  }
}

export async function disableMessageButtons(client: Client, channelId: string, messageId: string): Promise<void> {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (!msg) return;

  if (!msg.components?.length) return;

  const disabledRows = msg.components.flatMap((row) => {
    if (!("components" in row)) return [];

    const newRow = new ActionRowBuilder<ButtonBuilder>();
    for (const c of (row.components as any[])) {
      const b = ButtonBuilder.from(c as any).setDisabled(true);
      newRow.addComponents(b);
    }
    return [newRow];
  });

  await msg.edit({ components: disabledRows }).catch(() => null);
}

export async function closeExpiredPredictions(client: Client): Promise<number> {
  const now = new Date();

  // Traemos candidatas (pequeño lote) para poder editar mensajes en Discord.
  const candidates = await prisma.prediction.findMany({
    where: {
      status: "OPEN",
      lockTime: { not: null, lte: now },
    },
    select: { id: true, guildId: true, channelId: true, messageId: true, title: true, lockTime: true },
    take: 50,
  });

  let closed = 0;

  for (const p of candidates) {
    const res = await prisma.prediction.updateMany({
      where: { id: p.id, status: "OPEN" },
      data: { status: "CLOSED" },
    });

    if (res.count !== 1) continue;
    closed += 1;

    if (p.messageId) {
      await disableMessageButtons(client, p.channelId, p.messageId);
    }

    await sendAutoCloseMessage(client, {
      guildId: p.guildId,
      channelId: p.channelId,
      messageId: p.messageId,
      title: p.title,
      lockTime: p.lockTime,
    });
  }

  return closed;
}

export function startPredictionAutoClose(client: Client, opts?: { intervalMs?: number }) {
  const intervalMs = opts?.intervalMs ?? 30_000;

  // Ejecuta una vez al arrancar para ponerse al día.
  void closeExpiredPredictions(client).catch(() => null);

  const timer = setInterval(() => {
    void closeExpiredPredictions(client).catch(() => null);
  }, intervalMs);

  return () => clearInterval(timer);
}
