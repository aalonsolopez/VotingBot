import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  LEC_TEAM_EMOJIS: z.string().optional(),
  PRED_IDS_CHANNEL_ID: z.string().optional(),
  ANNOUNCEMENTS_CHANNEL_ID: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);