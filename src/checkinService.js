const config = require('./config');
const db = require('./db');
const { xpForCheckin, XP_WEEKLY_GOAL_BONUS, getLevelFromXp, levelProgress } = require('./leveling');
const { checkMilestones, announceMilestones } = require('./milestones');

// Records a check-in (real or admin-injected), updates XP/level, and checks
// the lifetime-minutes milestone track. Returns everything the caller needs
// to render a response: weekly progress, XP earned, level-up, and any newly
// unlocked milestones (roles already assigned by the time this resolves).
async function recordCheckin({ guild, userId, minutes, activity, messageId = null }) {
  const guildId = guild.id;

  const memberBefore = db.getMember(guildId, userId);
  const levelBefore = getLevelFromXp(memberBefore.total_xp);

  const weekBefore = db.getWeeklyMinutes(guildId, userId);
  const goal = config.weeklyGoalMinutes;
  const crossedGoalThisCheckin = weekBefore.minutes < goal && weekBefore.minutes + minutes >= goal;

  let xpEarned = xpForCheckin(minutes);
  if (crossedGoalThisCheckin) xpEarned += XP_WEEKLY_GOAL_BONUS;

  db.addCheckin({ guildId, userId, messageId, minutes, activity, xpEarned });

  const memberAfter = db.getMember(guildId, userId);
  const progress = levelProgress(memberAfter.total_xp);
  const weekAfter = db.getWeeklyMinutes(guildId, userId);

  const newMilestones = await checkMilestones({
    guild,
    userId,
    track: 'minutes',
    value: memberAfter.total_minutes,
  });
  await announceMilestones({ guild, userId, track: 'minutes', awarded: newMilestones });

  return {
    xpEarned,
    goal,
    weekAfter,
    levelBefore,
    levelAfter: progress.level,
    leveledUp: progress.level > levelBefore,
    newMilestones,
    totalMinutes: memberAfter.total_minutes,
  };
}

module.exports = { recordCheckin };
