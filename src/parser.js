// Parses free-form check-in messages like:
//   "ran 30 min"
//   "30 minutes of yoga this morning, felt great"
//   "walked the dog for an hour"
//   "1h30m bike ride"
//   "hiit workout - 45 mins"
// Returns { minutes, activity } or null if no duration could be found.

const ACTIVITY_KEYWORDS = [
  'running', 'run', 'ran', 'jog', 'jogging', 'jogged',
  'walking', 'walk', 'walked', 'hike', 'hiking', 'hiked', 'trekking',
  'yoga', 'pilates', 'stretching', 'stretch', 'stretched',
  'gym', 'workout', 'weights', 'lifting', 'lifted', 'strength training', 'strength',
  'cardio', 'hiit',
  'cycling', 'cycle', 'cycled', 'biking', 'bike', 'biked',
  'swimming', 'swim', 'swam',
  'dance', 'dancing', 'danced', 'zumba',
  'basketball', 'football', 'soccer', 'badminton', 'tennis', 'volleyball',
  'climbing', 'climb', 'climbed', 'bouldering',
  'rowing', 'row', 'rowed',
  'boxing', 'boxed', 'kickboxing', 'muay thai',
  'skating', 'skateboarding', 'skiing', 'ski', 'skied', 'skated',
  'sports', 'exercise', 'exercised', 'training', 'trained',
  // Bahasa Melayu
  'lari', 'berlari',
  'jalan', 'berjalan', 'jalan kaki', 'mendaki', 'mendaki bukit',
  'senaman', 'bersenam', 'gim',
  'berbasikal', 'basikal',
  'renang', 'berenang',
  'menari', 'tarian',
  'regangan',
];

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/\bhalf an hour\b/g, '30 minutes')
    .replace(/\bhalf a hour\b/g, '30 minutes')
    .replace(/\ban hour\b/g, '1 hour')
    .replace(/\ba hour\b/g, '1 hour')
    .replace(/\bquarter of an hour\b/g, '15 minutes')
    // Bahasa Melayu
    .replace(/\bsetengah jam\b/g, '30 minit')
    .replace(/\bsuku jam\b/g, '15 minit')
    .replace(/\bsejam\b/g, '1 jam');
}

function parseDuration(rawText) {
  const text = normalize(rawText);
  let totalMinutes = 0;
  let matched = false;

  // Combined "1h30m" / "1 h 30 m" / "1 jam 30 minit" style
  const compact = text.match(
    /\b(\d+(?:\.\d+)?)\s*(?:h(?:rs?|ours?)?|jam)\s*(\d+(?:\.\d+)?)\s*(?:m(?:ins?|inutes?)?|minit)\b/
  );
  if (compact) {
    totalMinutes += parseFloat(compact[1]) * 60 + parseFloat(compact[2]);
    matched = true;
  } else {
    const hourMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h|jam)\b/);
    if (hourMatch) {
      totalMinutes += parseFloat(hourMatch[1]) * 60;
      matched = true;
    }
    const minuteMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m|minit)\b/);
    if (minuteMatch) {
      totalMinutes += parseFloat(minuteMatch[1]);
      matched = true;
    }
  }

  if (!matched || totalMinutes <= 0) return null;
  return Math.round(totalMinutes);
}

function parseActivity(rawText) {
  const text = rawText.toLowerCase();
  for (const keyword of ACTIVITY_KEYWORDS) {
    const re = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`);
    if (re.test(text)) {
      return keyword;
    }
  }
  return null;
}

function parseCheckin(rawText) {
  const minutes = parseDuration(rawText);
  if (minutes === null) return null;
  const activity = parseActivity(rawText) || 'activity';
  return { minutes, activity };
}

// Hosts for fitness apps whose shared links/embeds carry the workout data as
// an image or unfurled card rather than as plain text the parser can read.
const FITNESS_LINK_HOSTS = [
  'strava.com',
  'strava.app.link',
  'hevyapp.com',
  'hevy.com',
  'garmin.com',
  'connect.garmin.com',
  'whoop.com',
  'fitbit.com',
  'nike.com/run-club',
  'zwift.com',
];

function containsFitnessLink(rawText) {
  const urls = rawText.match(/https?:\/\/[^\s]+/gi) || [];
  return urls.some((url) => {
    const lower = url.toLowerCase();
    return FITNESS_LINK_HOSTS.some((host) => lower.includes(host));
  });
}

module.exports = {
  parseCheckin,
  parseDuration,
  parseActivity,
  containsFitnessLink,
  ACTIVITY_KEYWORDS,
  FITNESS_LINK_HOSTS,
};
