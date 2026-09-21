const { EmbedBuilder } = require('discord.js');
const config = require('./config');
const db = require('./db');

const TRACK_LABELS = {
  minutes: 'Lifetime Minutes',
  streak: 'Weekly Streak',
};

// Checks whether `value` has newly crossed any configured milestone thresholds
// for `track` that this user hasn't already been awarded, assigns the linked
// Discord role for each, and returns the list of newly awarded milestones.
async function checkMilestones({ guild, userId, track, value }) {
  const pending = db.getUnawardedMilestones(guild.id, userId, track, value);
  if (pending.length === 0) return [];

  const member = await guild.members.fetch(userId).catch(() => null);
  const awarded = [];

  for (const milestone of pending) {
    db.recordMilestoneAwarded(guild.id, userId, track, milestone.threshold);
    if (member) {
      const ok = await member.roles.add(milestone.role_id).then(() => true).catch((err) => {
        console.error(
          `Failed to assign milestone role ${milestone.role_id} to ${userId} in guild ${guild.id}:`,
          err.message
        );
        return false;
      });
      awarded.push({ ...milestone, roleAssigned: ok });
    } else {
      awarded.push({ ...milestone, roleAssigned: false });
    }
  }

  return awarded;
}

async function announceMilestones({ guild, userId, track, awarded }) {
  if (awarded.length === 0) return;
  const channelId = config.announceChannelId;
  if (!channelId) return;
  const channel =
    guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel) return;

  for (const m of awarded) {
    const roleNote = m.roleAssigned ? `<@&${m.role_id}>` : `**${m.label}**`;
    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('🏅 Milestone Unlocked!')
      .setDescription(
        `<@${userId}> just unlocked ${roleNote} (${TRACK_LABELS[track] || track}: ${m.threshold})!`
      );
    await channel.send({ embeds: [embed] }).catch(() => {});
  }
}

module.exports = { checkMilestones, announceMilestones, TRACK_LABELS };
