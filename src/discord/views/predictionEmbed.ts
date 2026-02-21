import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { encodeVoteId } from "../ids/customId.js";
import { getLecTeamEmoji } from "../lec/teamEmojis.js";

export function buildPredictionMessage(args: {
  predictionId: string;
  title: string;
  game?: string | null;
  options: { id: string; label: string }[];
  showIds?: boolean;
}) {
  const embed = new EmbedBuilder()
    .setTitle(args.title)
    .setDescription(args.game ? `🎮 ${args.game}` : null)
    .setColor("#cab0ec");

  if (args.showIds) {
    embed.setFooter({ text: `ID: ${args.predictionId}` })
    .setColor("#cab0ec");
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < Math.min(args.options.length, 25); i++) {
    const opt = args.options[i];
    if (!opt) continue;
    if (i % 5 === 0) rows.push(new ActionRowBuilder<ButtonBuilder>());

    const button = new ButtonBuilder()
      .setCustomId(encodeVoteId({ v: 1, predictionId: args.predictionId, optionId: opt.id }))
      .setLabel(opt.label)
      .setStyle(ButtonStyle.Primary);

    const emoji = getLecTeamEmoji(opt.label);
    if (emoji) button.setEmoji(emoji);

    const currentRow = rows[rows.length - 1];
    if (currentRow) currentRow.addComponents(button);
  }

  return { embeds: [embed], components: rows };
}
