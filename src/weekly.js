const { EmbedBuilder } = require('discord.js');
const config = require('./config');
const db = require('./db');
const { getPreviousWeekKey } = require('./weekUtils');
const { levelProgress } = require('./leveling');

// Runs at the scheduled cron time (default Sunday 20:00). By then the ISO week
// has NOT rolled over yet (week rolls Monday 00:00), so we summarize the week
// that is about to end using the current week key, then update streaks.
async function runWeeklyRecap(client) {
  const { getIsoWeekKey } = require('./weekUtils');
  const weekKey = getIsoWeekKey();
  const goal = config.weeklyGoalMinutes;

  for (const guild of client.guilds.cache.values()) {
    const members = db.getAllMembersWithWeeklyTotals(guild.id, weekKey);
    if (members.length === 0) continue;

    const hitGoal = [];
    const missedGoal = [];

    for (const m of members) {
      const met = m.minutes >= goal;
      let currentStreak = m.current_streak;
      let bestStreak = m.best_streak;

      if (met) {
        currentStreak = m.last_goal_week === getPreviousWeekKey() ? currentStreak + 1 : 1;
        bestStreak = Math.max(bestStreak, currentStreak);
        db.updateStreak(guild.id, m.user_id, {
          currentStreak,
          bestStreak,
          lastGoalWeek: weekKey,
        });
        hitGoal.push({ ...m, currentStreak });
      } else if (m.minutes > 0) {
        db.updateStreak(guild.id, m.user_id, {
          currentStreak: 0,
          bestStreak,
          lastGoalWeek: m.last_goal_week,
        });
        missedGoal.push(m);
      }
    }

    const channelId = config.announceChannelId;
    if (!channelId) continue;
    const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel) continue;

    hitGoal.sort((a, b) => b.minutes - a.minutes);

    const lines = [];
    if (hitGoal.length > 0) {
      lines.push(`**Hit the ${goal}-minute goal:**`);
      for (const m of hitGoal) {
        const streakTxt = m.currentStreak > 1 ? ` 🔥 ${m.currentStreak}-week streak` : '';
        lines.push(`• <@${m.user_id}> — ${m.minutes} min${streakTxt}`);
      }
    } else {
      lines.push('No one hit the goal this week — next week is a fresh start! 💪');
    }

    if (missedGoal.length > 0) {
      lines.push('', `**Logged activity but under goal:**`);
      for (const m of missedGoal.sort((a, b) => b.minutes - a.minutes)) {
        lines.push(`• <@${m.user_id}> — ${m.minutes}/${goal} min`);
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('📊 Weekly Recap — 180 Moves')
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'A new week starts now. Log your check-ins to keep the streak alive!' });

    await channel.send({ embeds: [embed] }).catch((err) => console.error('Failed to send weekly recap:', err));
  }
}

module.exports = { runWeeklyRecap };
