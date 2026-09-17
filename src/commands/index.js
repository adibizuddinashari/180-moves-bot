const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const db = require('../db');
const { levelProgress } = require('../leveling');
const { getIsoWeekKey } = require('../weekUtils');

function progressBar(current, goal, size = 14) {
  const ratio = Math.min(current / goal, 1);
  const filled = Math.round(ratio * size);
  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('stats')
      .setDescription('Show your weekly progress and level')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('Check someone else\'s stats').setRequired(false)
      ),
    async execute(interaction) {
      const target = interaction.options.getUser('user') || interaction.user;
      const guildId = interaction.guildId;
      const weekKey = getIsoWeekKey();
      const weekly = db.getWeeklyMinutes(guildId, target.id, weekKey);
      const member = db.getMember(guildId, target.id);
      const progress = levelProgress(member.total_xp);
      const goal = config.weeklyGoalMinutes;

      const embed = new EmbedBuilder()
        .setColor(weekly.minutes >= goal ? 0x57f287 : 0x5865f2)
        .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
        .setTitle('180 Moves — Weekly Progress')
        .addFields(
          {
            name: `This week: ${weekly.minutes}/${goal} min`,
            value: `${progressBar(weekly.minutes, goal)}  ${Math.min(
              100,
              Math.round((weekly.minutes / goal) * 100)
            )}%`,
          },
          { name: 'Check-ins this week', value: String(weekly.checkins), inline: true },
          { name: 'Level', value: String(progress.level), inline: true },
          {
            name: 'XP',
            value: `${progress.xp} (${progress.xpIntoLevel}/${progress.xpForNextLevel} to next level)`,
            inline: true,
          },
          { name: 'Current streak', value: `${member.current_streak} week(s)`, inline: true },
          { name: 'Best streak', value: `${member.best_streak} week(s)`, inline: true },
          { name: 'Lifetime minutes', value: String(member.total_minutes), inline: true }
        );

      await interaction.reply({ embeds: [embed] });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('Show the leaderboard')
      .addStringOption((opt) =>
        opt
          .setName('scope')
          .setDescription('Weekly minutes or all-time XP')
          .addChoices(
            { name: 'This week (minutes)', value: 'weekly' },
            { name: 'All-time (XP)', value: 'alltime' }
          )
      ),
    async execute(interaction) {
      const scope = interaction.options.getString('scope') || 'weekly';
      const guildId = interaction.guildId;

      if (scope === 'weekly') {
        const rows = db.getWeeklyLeaderboard(guildId, getIsoWeekKey(), 10);
        if (rows.length === 0) {
          await interaction.reply('No check-ins logged yet this week.');
          return;
        }
        const lines = rows.map((r, i) => {
          const hit = r.minutes >= config.weeklyGoalMinutes ? ' ✅' : '';
          return `**${i + 1}.** <@${r.user_id}> — ${r.minutes} min (${r.checkins} check-ins)${hit}`;
        });
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`This Week's Leaderboard (goal: ${config.weeklyGoalMinutes} min)`)
          .setDescription(lines.join('\n'));
        await interaction.reply({ embeds: [embed] });
      } else {
        const rows = db.getAllTimeLeaderboard(guildId, 10);
        if (rows.length === 0) {
          await interaction.reply('No check-ins logged yet.');
          return;
        }
        const lines = rows.map((r, i) => {
          const level = levelProgress(r.total_xp).level;
          return `**${i + 1}.** <@${r.user_id}> — Level ${level} (${r.total_xp} XP, ${r.total_minutes} min lifetime)`;
        });
        const embed = new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle('All-Time Leaderboard')
          .setDescription(lines.join('\n'));
        await interaction.reply({ embeds: [embed] });
      }
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('checkin-help')
      .setDescription('Show how to log a check-in'),
    async execute(interaction) {
      const channelMention = config.checkinChannelId ? `<#${config.checkinChannelId}>` : 'the check-in channel';
      await interaction.reply({
        content: [
          `Post in ${channelMention} describing what you did and how long, e.g.:`,
          '• "30 min run this morning"',
          '• "walked the dog for an hour"',
          '• "1h yoga session"',
          '',
          `The bot reacts ✅ once it's logged. Goal is ${config.weeklyGoalMinutes} minutes/week.`,
        ].join('\n'),
        ephemeral: true,
      });
    },
  },
];

module.exports = commands;
