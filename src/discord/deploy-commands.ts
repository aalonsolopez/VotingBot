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
        .addStringOption(o =>
          o
            .setName("lock_at")
            .setDescription('Fecha/hora de cierre (ISO 8601 o "DD-MM-YYYY HH:MM")')
            .setRequired(true)
        )
        .addStringOption(o => o.setName("game").setDescription("Juego").setRequired(false))
        .addStringOption(o => o.setName("tournament").setDescription("Tournament ID (opcional)").setRequired(false))
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
      s.setName("undo").setDescription("Deshacer resolución (admin)")
        .addStringOption(o => o.setName("id").setDescription("Prediction ID").setRequired(true))
    )
    .addSubcommand(s =>
      s.setName("leaderboard").setDescription("Tabla de puntos")
        .addStringOption(o => o.setName("user").setDescription("Usuario a consultar").setRequired(false))
        .addBooleanOption(o => o.setName("total").setDescription("¿Quieres ver el total?").setRequired(false))
        .addIntegerOption(o => o.setName("top").setDescription("Filtrar numero de participantes en el top").setRequired(false))
        .addStringOption(o => o.setName("tournament").setDescription("Tournament ID para filtrar (opcional)").setRequired(false))
    )
    .addSubcommand(s =>
      s.setName("my_votes").setDescription("Ver mis votos (no resueltos)")
        .addStringOption(o => o.setName("id").setDescription("Prediction ID (opcional)").setRequired(false))
        .addStringOption(o => o.setName("tournament").setDescription("Tournament ID para filtrar (opcional)").setRequired(false))
    ),
  new SlashCommandBuilder()
    .setName("tournament")
    .setDescription("Gestión de torneos")
    .addSubcommand(s =>
      s.setName("create").setDescription("Crear torneo")
        .addStringOption(o => o.setName("name").setDescription("Nombre del torneo").setRequired(true))
        .addStringOption(o => o.setName("start_date").setDescription("Fecha de inicio (opcional)").setRequired(false))
        .addStringOption(o => o.setName("end_date").setDescription("Fecha de fin (opcional)").setRequired(false))
    )
    .addSubcommand(s =>
      s.setName("deactivate").setDescription("Activar/desactivar torneo")
        .addStringOption(o => o.setName("id").setDescription("Tournament ID").setRequired(true))
        .addStringOption(o => o.setName("action").setDescription("Acción: deactivate o activate").setRequired(true)
          .addChoices(
            { name: "Deactivate", value: "deactivate" },
            { name: "Activate", value: "activate" }
          ))
    )
    .addSubcommand(s =>
      s.setName("select").setDescription("Seleccionar torneo activo")
    )
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

await rest.put(
  Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID),
  { body: commands },
);

console.log("✅ Comandos registrados");