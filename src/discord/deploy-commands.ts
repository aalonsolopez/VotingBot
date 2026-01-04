import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { env } from "#config/env.js";

const commands = [
  new SlashCommandBuilder()
    .setName("pred")
    .setDescription("Predicciones")
    .addSubcommand(s =>
      s.setName("create").setDescription("Crear predicción")
        .addStringOption(o => o.setName("title").setDescription("Título").setRequired(true))
        .addStringOption(o => o.setName("options").setDescription("Opciones CSV: A,B,C").setRequired(true))
        .addStringOption(o => o.setName("game").setDescription("Juego").setRequired(false))
    )
    .addSubcommand(s =>
      s.setName("stats").setDescription("Ver stats")
        .addStringOption(o => o.setName("id").setDescription("Prediction ID").setRequired(true))
    )
    .addSubcommand(s =>
      s.setName("resolve").setDescription("Resolver (admin)")
        .addStringOption(o => o.setName("id").setDescription("Prediction ID").setRequired(true))
        .addStringOption(o => o.setName("winner").setDescription("Option ID ganadora").setRequired(true))
    )
    .addSubcommand(s =>
      s.setName("leaderboard").setDescription("Tabla de puntos")
    )
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

await rest.put(
  Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID),
  { body: commands },
);

console.log("✅ Comandos registrados");