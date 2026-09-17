const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');
const { getIsoWeekKey } = require('./weekUtils');

const dir = path.dirname(config.databasePath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    message_id TEXT,
    week_key TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    activity TEXT NOT NULL,
    xp_earned INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_checkins_week ON checkins (guild_id, week_key);
  CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins (guild_id, user_id);

  CREATE TABLE IF NOT EXISTS members (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    total_xp INTEGER NOT NULL DEFAULT 0,
    total_minutes INTEGER NOT NULL DEFAULT 0,
    current_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    last_goal_week TEXT,
    PRIMARY KEY (guild_id, user_id)
  );
`);

function ensureMember(guildId, userId) {
  db.prepare(
    `INSERT INTO members (guild_id, user_id) VALUES (?, ?)
     ON CONFLICT(guild_id, user_id) DO NOTHING`
  ).run(guildId, userId);
}

function addCheckin({ guildId, userId, messageId, minutes, activity, xpEarned }) {
  const weekKey = getIsoWeekKey();
  ensureMember(guildId, userId);

  db.prepare(
    `INSERT INTO checkins (guild_id, user_id, message_id, week_key, minutes, activity, xp_earned)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(guildId, userId, messageId, weekKey, minutes, activity, xpEarned);

  db.prepare(
    `UPDATE members SET total_xp = total_xp + ?, total_minutes = total_minutes + ?
     WHERE guild_id = ? AND user_id = ?`
  ).run(xpEarned, minutes, guildId, userId);

  return weekKey;
}

function getWeeklyMinutes(guildId, userId, weekKey = getIsoWeekKey()) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(minutes), 0) AS minutes, COUNT(*) AS checkins
       FROM checkins WHERE guild_id = ? AND user_id = ? AND week_key = ?`
    )
    .get(guildId, userId, weekKey);
  return row;
}

function getMember(guildId, userId) {
  ensureMember(guildId, userId);
  return db
    .prepare(`SELECT * FROM members WHERE guild_id = ? AND user_id = ?`)
    .get(guildId, userId);
}

function getWeeklyLeaderboard(guildId, weekKey = getIsoWeekKey(), limit = 10) {
  return db
    .prepare(
      `SELECT user_id, SUM(minutes) AS minutes, COUNT(*) AS checkins
       FROM checkins WHERE guild_id = ? AND week_key = ?
       GROUP BY user_id ORDER BY minutes DESC LIMIT ?`
    )
    .all(guildId, weekKey, limit);
}

function getAllTimeLeaderboard(guildId, limit = 10) {
  return db
    .prepare(
      `SELECT user_id, total_xp, total_minutes, current_streak, best_streak
       FROM members WHERE guild_id = ? ORDER BY total_xp DESC LIMIT ?`
    )
    .all(guildId, limit);
}

function getAllMembersWithWeeklyTotals(guildId, weekKey) {
  return db
    .prepare(
      `SELECT m.user_id, m.current_streak, m.best_streak, m.last_goal_week,
              COALESCE(c.minutes, 0) AS minutes
       FROM members m
       LEFT JOIN (
         SELECT user_id, SUM(minutes) AS minutes
         FROM checkins WHERE guild_id = ? AND week_key = ?
         GROUP BY user_id
       ) c ON c.user_id = m.user_id
       WHERE m.guild_id = ?`
    )
    .all(guildId, weekKey, guildId);
}

function updateStreak(guildId, userId, { currentStreak, bestStreak, lastGoalWeek }) {
  db.prepare(
    `UPDATE members SET current_streak = ?, best_streak = ?, last_goal_week = ?
     WHERE guild_id = ? AND user_id = ?`
  ).run(currentStreak, bestStreak, lastGoalWeek, guildId, userId);
}

module.exports = {
  db,
  addCheckin,
  getWeeklyMinutes,
  getMember,
  getWeeklyLeaderboard,
  getAllTimeLeaderboard,
  getAllMembersWithWeeklyTotals,
  updateStreak,
};
