// XP economy: 1 XP per minute logged, plus a flat bonus per check-in so short
// activities still feel worthwhile, plus a bonus for clearing the weekly goal.
const XP_PER_MINUTE = 1;
const XP_PER_CHECKIN = 5;
const XP_WEEKLY_GOAL_BONUS = 50;

// Cumulative XP required to reach level L is a triangular ramp: 100, 300, 600, 1000, ...
// i.e. level L needs 100*L more XP than level L-1 needed over level L-2.
function cumulativeXpForLevel(level) {
  return 50 * level * (level + 1);
}

function getLevelFromXp(xp) {
  let level = 0;
  while (cumulativeXpForLevel(level + 1) <= xp) {
    level += 1;
  }
  return level;
}

function xpForCheckin(minutes) {
  return XP_PER_CHECKIN + minutes * XP_PER_MINUTE;
}

function levelProgress(xp) {
  const level = getLevelFromXp(xp);
  const currentFloor = cumulativeXpForLevel(level);
  const nextCeiling = cumulativeXpForLevel(level + 1);
  return {
    level,
    xp,
    xpIntoLevel: xp - currentFloor,
    xpForNextLevel: nextCeiling - currentFloor,
    xpToNextLevel: nextCeiling - xp,
  };
}

module.exports = {
  XP_PER_MINUTE,
  XP_PER_CHECKIN,
  XP_WEEKLY_GOAL_BONUS,
  xpForCheckin,
  getLevelFromXp,
  levelProgress,
};
