import type { ChatInputCommandInteraction } from "discord.js";
import { PermissionsBitField } from "discord.js";

export function isAdminOrMod(i: ChatInputCommandInteraction): boolean {
  const member = i.member;
  // @ts-expect-error - typing de i.member varía
  const perms = member?.permissions ? new PermissionsBitField(member.permissions) : null;
  if (!perms) return false;

  return (
    perms.has(PermissionsBitField.Flags.Administrator) ||
    perms.has(PermissionsBitField.Flags.ManageGuild) ||
    perms.has(PermissionsBitField.Flags.ModerateMembers) ||
    perms.has(PermissionsBitField.Flags.ManageMessages) ||
    perms.has(PermissionsBitField.Flags.KickMembers) ||
    perms.has(PermissionsBitField.Flags.BanMembers)
  );
}
