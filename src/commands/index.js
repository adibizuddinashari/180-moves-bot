const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const db = require('../db');
const { levelProgress } = require('../leveling');
const { getIsoWeekKey } = require('../weekUtils');
const { checkMilestones, announceMilestones, TRACK_LABELS } = require('../milestones');
const { recordCheckin } = require('../checkinService');

const TRACK_CHOICES = [
  { name: 'Lifetime minutes', value: 'minutes' },
  { name: 'Weekly streak', value: 'streak' },
];

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
          '• "30 minit lari" / "1 jam senaman" (Bahasa Melayu works too!)',
          '• "2:03:34 trail run" (H:MM:SS from your app\'s "moving time" also works)',
          '',
          "Sharing a Strava link or a Hevy/app screenshot? Add the duration as text too —",
          'I can\'t read stats off images or link previews yet, e.g. "leg day 💪 52 min" + your screenshot.',
          '',
          `The bot reacts ✅ once it's logged. Goal is ${config.weeklyGoalMinutes} minutes/week.`,
        ].join('\n'),
        ephemeral: true,
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('milestone-add')
      .setDescription('[Admin] Add or update a milestone unlock')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((opt) =>
        opt.setName('track').setDescription('What the milestone is based on').setRequired(true).addChoices(...TRACK_CHOICES)
      )
      .addIntegerOption((opt) =>
        opt
          .setName('threshold')
          .setDescription('Minutes (lifetime) or weeks (streak) required')
          .setRequired(true)
          .setMinValue(1)
      )
      .addRoleOption((opt) => opt.setName('role').setDescription('Role to grant at this milestone').setRequired(true))
      .addStringOption((opt) => opt.setName('label').setDescription('Display name (defaults to the role name)')),
    async execute(interaction) {
      const track = interaction.options.getString('track', true);
      const threshold = interaction.options.getInteger('threshold', true);
      const role = interaction.options.getRole('role', true);
      const label = interaction.options.getString('label') || role.name;

      db.addMilestone(interaction.guildId, track, threshold, role.id, label);

      await interaction.reply({
        content: `✅ Milestone set: **${TRACK_LABELS[track]} ≥ ${threshold}** → ${role} (${label})`,
        ephemeral: true,
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('milestone-remove')
      .setDescription('[Admin] Remove a milestone')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((opt) =>
        opt.setName('track').setDescription('Which track').setRequired(true).addChoices(...TRACK_CHOICES)
      )
      .addIntegerOption((opt) =>
        opt.setName('threshold').setDescription('Threshold value to remove').setRequired(true).setMinValue(1)
      ),
    async execute(interaction) {
      const track = interaction.options.getString('track', true);
      const threshold = interaction.options.getInteger('threshold', true);
      const removed = db.removeMilestone(interaction.guildId, track, threshold);

      await interaction.reply({
        content: removed
          ? `🗑️ Removed the ${TRACK_LABELS[track]} ≥ ${threshold} milestone.`
          : "No milestone found with that track/threshold.",
        ephemeral: true,
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('milestone-list')
      .setDescription('Show configured milestones')
      .addStringOption((opt) =>
        opt.setName('track').setDescription('Filter by track').addChoices(...TRACK_CHOICES)
      ),
    async execute(interaction) {
      const track = interaction.options.getString('track');
      const rows = db.listMilestones(interaction.guildId, track);

      if (rows.length === 0) {
        await interaction.reply({ content: 'No milestones configured yet.', ephemeral: true });
        return;
      }

      const byTrack = {};
      for (const r of rows) {
        byTrack[r.track] = byTrack[r.track] || [];
        byTrack[r.track].push(r);
      }

      const lines = [];
      for (const [t, list] of Object.entries(byTrack)) {
        lines.push(`**${TRACK_LABELS[t] || t}**`);
        for (const m of list) {
          lines.push(`• ${m.threshold} → <@&${m.role_id}> (${m.label})`);
        }
      }

      const embed = new EmbedBuilder().setColor(0x9b59b6).setTitle('🏅 Configured Milestones').setDescription(lines.join('\n'));
      await interaction.reply({ embeds: [embed] });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('admin-log-checkin')
      .setDescription('[Admin] Manually log a check-in for a user (bot missed a message, or you\'re testing milestones)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addUserOption((opt) => opt.setName('user').setDescription('Who to credit').setRequired(true))
      .addIntegerOption((opt) =>
        opt.setName('minutes').setDescription('Minutes to log').setRequired(true).setMinValue(1)
      )
      .addStringOption((opt) => opt.setName('activity').setDescription('Activity label (default: "activity")')),
    async execute(interaction) {
      const user = interaction.options.getUser('user', true);
      const minutes = interaction.options.getInteger('minutes', true);
      const activity = interaction.options.getString('activity') || 'activity';

      const result = await recordCheckin({ guild: interaction.guild, userId: user.id, minutes, activity });

      const lines = [
        `Logged **${minutes} min** of **${activity}** for ${user}.`,
        `Weekly total: ${result.weekAfter.minutes}/${result.goal} min (+${result.xpEarned} XP)`,
        `Lifetime minutes: ${result.totalMinutes}`,
      ];
      if (result.leveledUp) lines.push(`🎉 Leveled up to **${result.levelAfter}**!`);
      if (result.newMilestones.length > 0) {
        lines.push(
          `🏅 Unlocked: ${result.newMilestones.map((m) => `${m.label} (${m.threshold})${m.roleAssigned ? '' : ' — role assign failed, check bot permissions'}`).join(', ')}`
        );
      }

      await interaction.reply({ content: lines.join('\n'), ephemeral: true });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('admin-set-streak')
      .setDescription('[Admin] Force a user\'s weekly streak to test streak milestones')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addUserOption((opt) => opt.setName('user').setDescription('Who to set').setRequired(true))
      .addIntegerOption((opt) =>
        opt.setName('weeks').setDescription('Streak length in weeks').setRequired(true).setMinValue(0)
      ),
    async execute(interaction) {
      const user = interaction.options.getUser('user', true);
      const weeks = interaction.options.getInteger('weeks', true);
      const guildId = interaction.guildId;

      const member = db.getMember(guildId, user.id);
      db.updateStreak(guildId, user.id, {
        currentStreak: weeks,
        bestStreak: Math.max(member.best_streak, weeks),
        lastGoalWeek: getIsoWeekKey(),
      });

      const newMilestones = await checkMilestones({ guild: interaction.guild, userId: user.id, track: 'streak', value: weeks });
      await announceMilestones({ guild: interaction.guild, userId: user.id, track: 'streak', awarded: newMilestones });

      const lines = [`Set ${user}'s current streak to **${weeks} week(s)**.`];
      if (newMilestones.length > 0) {
        lines.push(
          `🏅 Unlocked: ${newMilestones.map((m) => `${m.label} (${m.threshold})${m.roleAssigned ? '' : ' — role assign failed, check bot permissions'}`).join(', ')}`
        );
      }

      await interaction.reply({ content: lines.join('\n'), ephemeral: true });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('admin-reset-user')
      .setDescription("[Admin] Wipe a user's check-ins, XP, streaks, and milestone progress (e.g. after testing)")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addUserOption((opt) => opt.setName('user').setDescription('Who to reset').setRequired(true))
      .addBooleanOption((opt) =>
        opt.setName('remove_roles').setDescription('Also remove any milestone roles granted (default: true)')
      ),
    async execute(interaction) {
      const user = interaction.options.getUser('user', true);
      const removeRolesOpt = interaction.options.getBoolean('remove_roles');
      const shouldRemoveRoles = removeRolesOpt === null ? true : removeRolesOpt;
      const guildId = interaction.guildId;

      const awardedRoles = db.getAwardedMilestoneRoles(guildId, user.id);
      const checkinsDeleted = db.deleteCheckinsForUser(guildId, user.id);
      db.resetMemberStats(guildId, user.id);
      db.clearAwardedMilestones(guildId, user.id);

      const lines = [
        `🧹 Reset ${user}: deleted ${checkinsDeleted} check-in(s), XP/minutes/streaks back to 0, milestone progress cleared.`,
      ];

      if (awardedRoles.length > 0) {
        if (shouldRemoveRoles) {
          const member = await interaction.guild.members.fetch(user.id).catch(() => null);
          const removed = [];
          const failed = [];
          for (const r of awardedRoles) {
            const ok = member
              ? await member.roles.remove(r.role_id).then(() => true).catch(() => false)
              : false;
            (ok ? removed : failed).push(r.label);
          }
          if (removed.length > 0) lines.push(`Removed roles: ${removed.join(', ')}`);
          if (failed.length > 0) lines.push(`Could not remove (check bot permissions/hierarchy): ${failed.join(', ')}`);
        } else {
          lines.push(`Roles left in place: ${awardedRoles.map((r) => r.label).join(', ')}`);
        }
      }

      await interaction.reply({ content: lines.join('\n'), ephemeral: true });
    },
  },
];

module.exports = commands;
