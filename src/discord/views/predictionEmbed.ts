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

  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const opt of args.options.slice(0, 5)) {
    const button = new ButtonBuilder()
      .setCustomId(encodeVoteId({ v: 1, predictionId: args.predictionId, optionId: opt.id }))
      .setLabel(opt.label)
      .setStyle(ButtonStyle.Primary);

    const emoji = getLecTeamEmoji(opt.label);
    if (emoji) button.setEmoji(emoji);

    row.addComponents(button);
  }

  return { embeds: [embed], components: [row] };
}
