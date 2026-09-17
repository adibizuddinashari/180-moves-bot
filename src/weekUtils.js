// ISO week helpers. Weeks run Monday 00:00 UTC -> Sunday 23:59:59 UTC.
// Good enough for a community accountability bot; not meant for
// millisecond-precise timezone handling.

function getIsoWeekStart(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Sunday -> 7
  if (day !== 1) {
    d.setUTCDate(d.getUTCDate() - (day - 1));
  }
  return d;
}

function getIsoWeekKey(date = new Date()) {
  const weekStart = getIsoWeekStart(date);
  const year = weekStart.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const daysSinceJan1 = Math.round((weekStart - jan1) / 86400000);
  const weekNum = Math.floor(daysSinceJan1 / 7) + 1;
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function getPreviousWeekKey(date = new Date()) {
  const weekStart = getIsoWeekStart(date);
  const prev = new Date(weekStart);
  prev.setUTCDate(prev.getUTCDate() - 7);
  return getIsoWeekKey(prev);
}

module.exports = { getIsoWeekStart, getIsoWeekKey, getPreviousWeekKey };
