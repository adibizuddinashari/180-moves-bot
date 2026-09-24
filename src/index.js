const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder } = require('discord.js');
const cron = require('node-cron');
const config = require('./config');
const commandList = require('./commands');
const { parseCheckin, containsFitnessLink } = require('./parser');
const { runWeeklyRecap } = require('./weekly');
const { recordCheckin } = require('./checkinService');

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

// Without these, an unlistened 'error' event (e.g. a transient WebSocket
// handshake timeout) is fatal to the whole Node process — discord.js already
// retries the gateway connection automatically, so logging is all we need.
client.on('error', (err) => console.error('Discord client error:', err));
client.on('shardError', (err) => console.error('Discord shard error:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));

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
    const hasImage = message.attachments.some((a) => (a.contentType || '').startsWith('image/'));
    const hasFitnessLink = containsFitnessLink(message.content);

    if (hasImage || hasFitnessLink) {
      await message.react('📸').catch(() => {});
      await message
        .reply({
          content:
            "Nice — but I can't read stats off screenshots or link previews yet. " +
            'Reply with the duration too (e.g. "45 min" or "ran 5k in 32 min") and I\'ll log it.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
    } else {
      await message.react('❓').catch(() => {});
    }
    return;
  }

  const { minutes, activity } = parsed;
  const userId = message.author.id;

  const result = await recordCheckin({
    guild: message.guild,
    userId,
    minutes,
    activity,
    messageId: message.id,
  });

  await message.react('✅').catch(() => {});

  const remaining = Math.max(0, result.goal - result.weekAfter.minutes);
  let replyText = `Logged **${minutes} min** of **${activity}**. Weekly total: **${result.weekAfter.minutes}/${result.goal} min** (+${result.xpEarned} XP)`;
  replyText += remaining > 0 ? ` — ${remaining} min to go!` : ' — goal hit for the week! 🎉';

  await message.reply({ content: replyText, allowedMentions: { repliedUser: false } }).catch(() => {});

  if (result.leveledUp) {
    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle('🎉 Level Up!')
      .setDescription(`${message.author} just reached **Level ${result.levelAfter}**!`);
    const announceChannel =
      config.announceChannelId && config.announceChannelId !== message.channelId
        ? message.guild.channels.cache.get(config.announceChannelId)
        : message.channel;
    await (announceChannel || message.channel).send({ embeds: [embed] }).catch(() => {});
  }
});

client.login(config.token);
