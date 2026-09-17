const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder } = require('discord.js');
const cron = require('node-cron');
const config = require('./config');
const db = require('./db');
const commandList = require('./commands');
const { parseCheckin } = require('./parser');
const { xpForCheckin, XP_WEEKLY_GOAL_BONUS, getLevelFromXp, levelProgress } = require('./leveling');
const { runWeeklyRecap } = require('./weekly');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

client.commands = new Collection();
for (const command of commandList) {
  client.commands.set(command.data.name, command);
}

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);

  cron.schedule(config.weeklyRecapCron, () => runWeeklyRecap(client), {
    timezone: config.timezone,
  });
  console.log(`Weekly recap scheduled: "${config.weeklyRecapCron}" (${config.timezone})`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error executing /${interaction.commandName}:`, err);
    const payload = { content: 'Something went wrong running that command.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!config.checkinChannelId || message.channelId !== config.checkinChannelId) return;
  if (!message.guildId) return;

  const parsed = parseCheckin(message.content);
  if (!parsed) {
    await message.react('❓').catch(() => {});
    return;
  }

  const { minutes, activity } = parsed;
  const guildId = message.guildId;
  const userId = message.author.id;

  const memberBefore = db.getMember(guildId, userId);
  const levelBefore = getLevelFromXp(memberBefore.total_xp);

  const weekBefore = db.getWeeklyMinutes(guildId, userId);
  const goal = config.weeklyGoalMinutes;
  const crossedGoalThisCheckin = weekBefore.minutes < goal && weekBefore.minutes + minutes >= goal;

  let xpEarned = xpForCheckin(minutes);
  if (crossedGoalThisCheckin) xpEarned += XP_WEEKLY_GOAL_BONUS;

  db.addCheckin({ guildId, userId, messageId: message.id, minutes, activity, xpEarned });

  const memberAfter = db.getMember(guildId, userId);
  const progress = levelProgress(memberAfter.total_xp);
  const weekAfter = db.getWeeklyMinutes(guildId, userId);

  await message.react('✅').catch(() => {});

  const remaining = Math.max(0, goal - weekAfter.minutes);
  let replyText = `Logged **${minutes} min** of **${activity}**. Weekly total: **${weekAfter.minutes}/${goal} min** (+${xpEarned} XP)`;
  replyText += remaining > 0 ? ` — ${remaining} min to go!` : ' — goal hit for the week! 🎉';

  await message.reply({ content: replyText, allowedMentions: { repliedUser: false } }).catch(() => {});

  if (progress.level > levelBefore) {
    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle('🎉 Level Up!')
      .setDescription(`${message.author} just reached **Level ${progress.level}**!`);
    const announceChannel =
      config.announceChannelId && config.announceChannelId !== message.channelId
        ? message.guild.channels.cache.get(config.announceChannelId)
        : message.channel;
    await (announceChannel || message.channel).send({ embeds: [embed] }).catch(() => {});
  }
});

client.login(config.token);
