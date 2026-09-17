require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

module.exports = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  guildId: process.env.GUILD_ID || null,
  checkinChannelId: process.env.CHECKIN_CHANNEL_ID || null,
  announceChannelId: process.env.ANNOUNCE_CHANNEL_ID || process.env.CHECKIN_CHANNEL_ID || null,
  weeklyGoalMinutes: parseInt(process.env.WEEKLY_GOAL_MINUTES || '180', 10),
  weeklyRecapCron: process.env.WEEKLY_RECAP_CRON || '0 20 * * 0',
  timezone: process.env.TIMEZONE || 'Asia/Kuala_Lumpur',
  databasePath: process.env.DATABASE_PATH || './data/180moves.db',
};
