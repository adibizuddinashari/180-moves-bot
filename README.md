# 180 Moves Bot

Discord bot for the **180 Moves** community server. Members post activity check-ins
in a designated channel; the bot parses the message, tracks weekly progress toward
a 180-minute goal, awards XP, and runs a leveling system with streaks and leaderboards.

## Features

- **Free-form check-ins**: post naturally in the check-in channel — "ran 30 min",
  "walked the dog for an hour", "1h yoga session" — the bot parses duration +
  activity, reacts ✅, and replies with your weekly total. Unparseable messages
  get a ❓ reaction (no minutes logged).
- **Leveling/XP**: 1 XP per minute logged + a flat bonus per check-in + a bonus
  for crossing the weekly goal. Level-up is announced automatically.
- **Weekly recap**: a scheduled job (default Sunday 20:00) posts who hit the
  180-minute goal, tracks weekly streaks, and resets the week.
- **Milestones**: admins map lifetime-minute and weekly-streak thresholds to
  Discord roles; the bot auto-assigns the role and announces it the moment a
  member crosses one. See [Milestones](#milestones) below.
- **Slash commands**:
  - `/stats [user]` — weekly progress, level, XP, streak
  - `/leaderboard [scope]` — weekly minutes or all-time XP leaderboard
  - `/checkin-help` — reminds members how to format a check-in
  - `/milestone-add`, `/milestone-remove`, `/milestone-list` — [Admin] manage milestones
  - `/admin-log-checkin` — [Admin] manually log a check-in for a user (bot missed their message, or testing)
  - `/admin-set-streak` — [Admin] test streak milestones instantly
  - `/admin-reset-user` — [Admin] wipe a user's check-ins/XP/streaks/milestones (e.g. after testing on a real account)

## Setup

### 1. Create the Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. Under **Bot**, click **Reset Token** and copy it → this is `DISCORD_TOKEN`.
3. Under **Bot**, enable the **Message Content Intent** (required to read check-in text).
4. Copy the **Application ID** from **General Information** → this is `CLIENT_ID`.
5. Under **OAuth2 → URL Generator**, select scopes `bot` and `applications.commands`,
   and permissions `Send Messages`, `Read Message History`, `Add Reactions`,
   `Use Slash Commands`, `Embed Links`. Open the generated URL to invite the bot
   to your server.

### 2. Get channel IDs

In Discord, enable Developer Mode (User Settings → Advanced), then right-click
your check-in channel → **Copy Channel ID** for `CHECKIN_CHANNEL_ID`. Optionally
do the same for an announcements channel for `ANNOUNCE_CHANNEL_ID` (defaults to
the check-in channel if left blank).

### 3. Configure environment

```bash
cp .env.example .env
# fill in DISCORD_TOKEN, CLIENT_ID, CHECKIN_CHANNEL_ID, etc.
```

### 4. Install and run locally

```bash
npm install
npm run deploy-commands   # registers all slash commands
npm start
```

Set `GUILD_ID` in `.env` during development so slash commands register instantly
to your server instead of waiting ~1 hour for global propagation.

## Deploying to Railway

1. Push this project to a GitHub repo.
2. In Railway, **New Project → Deploy from GitHub repo**.
3. Add all variables from `.env.example` under **Variables**.
4. Add a **Volume** mounted at `/data` and set `DATABASE_PATH=/data/180moves.db`
   — without a volume, the SQLite file is wiped on every redeploy.
5. Railway auto-detects `npm start` from `package.json`. Set the **Start Command**
   explicitly to `npm start` if it doesn't.
6. After the first deploy, run `npm run deploy-commands` once (via Railway's
   shell, or locally with the same `.env`) to register slash commands.

## How check-ins are parsed

The parser (`src/parser.js`) looks for a duration and an activity keyword from
a built-in list (run, walk, yoga, gym, swim, bike, hike, sports, ... — plus
Bahasa Melayu equivalents like lari, jalan, senaman, renang). If no duration
is found, nothing is logged and the bot reacts ❓. If a duration is found but
no known activity keyword, it logs the minutes under a generic "activity"
label — progress still counts.

Supported duration formats:
- Words: `30 min`, `1 hour`, `1h30m`, `half an hour`, `45 mins`
- Bahasa Melayu: `30 minit`, `1 jam`, `sejam`, `setengah jam`, `suku jam`, `1 jam 30 minit`
- Timecode: `2:03:34` (H:MM:SS — the "moving time" format Strava/Hevy display). Bare `MM:SS` (e.g. `23:45`) is intentionally **not** treated as a duration since it's indistinguishable from someone mentioning a clock time like "ran at 6:30" — only the three-part H:MM:SS form is unambiguous enough to parse automatically.

## Milestones

Two independent tracks, each mapped to a Discord role:

- **`minutes`** — lifetime minutes logged across all check-ins (e.g. 500, 1,500, 5,000).
- **`streak`** — consecutive weeks hitting the weekly goal, updated by the Sunday recap job (e.g. 4, 8, 12 weeks).

### 1. Create the roles in Discord

Server Settings → Roles → create one role per tier (e.g. "🥉 180 Mover", "🥈 Dedicated Mover", "🔥 4-Week Streak"). Make sure the bot's own role is positioned **above** these roles in the role list, and the bot has the **Manage Roles** permission — otherwise it can see the role but can't assign it.

### 2. Map thresholds to roles

Run these in Discord (admin-only — hidden from regular members by default):

```
/milestone-add track:Lifetime minutes threshold:500 role:@180 Mover
/milestone-add track:Lifetime minutes threshold:1500 role:@Dedicated Mover
/milestone-add track:Weekly streak threshold:4 role:@4-Week Streak
```

`/milestone-list` shows everything configured. `/milestone-remove track:... threshold:...` deletes one.

### 3. Test before relying on real activity

You don't need to wait weeks of real check-ins to confirm a milestone fires:

```
/admin-log-checkin user:@you text:"600 min"
```

This logs a real check-in (counts toward weekly progress, XP, and level) and immediately reports back whether it crossed any `minutes` milestone and whether the role assignment succeeded — so you can catch a bad role hierarchy/permission before members hit it for real.

### Manually crediting a missed check-in

If the parser fails to read someone's message (unsupported phrasing, a language it doesn't recognize yet, a typo), you don't need to ask them to repost — as an admin, run it through the same parser members' check-ins use, by typing it the way they did:

```
/admin-log-checkin user:@Naz text:"123 minit trail run"
```

`text` accepts anything the check-in parser understands — English, Bahasa Melayu, or an `H:MM:SS` timecode (see [How check-ins are parsed](#how-check-ins-are-parsed)) — and auto-detects both the duration and the activity from it. If `text` can't be parsed (or the parser genuinely can't handle a phrasing yet), the command tells you so without logging anything; fall back to setting the exact values yourself:

```
/admin-log-checkin user:@Naz minutes:123 activity:"trail run"
```

Either way, this runs through the exact same logic as a real check-in: it adds to their weekly total, awards XP, checks for a level-up, and checks the `minutes` milestone track — a full, correct backfill, not just a number edit.

```
/admin-set-streak user:@you weeks:4
```

This directly sets a test account's streak counter and checks it against the `streak` track, without waiting for Sunday's recap job. Useful for confirming a streak milestone before the first real week rolls over.

Both commands are restricted to members with the **Manage Server** permission.

### 4. Clean up test data

If you tested on your own real account (rather than a throwaway test account), your check-ins, XP, and any milestone roles from testing are now mixed in with real data. Clear them with:

```
/admin-reset-user user:@you
```

This deletes all of that user's check-ins, resets XP/minutes/streaks to 0, clears milestone-award records (so milestones can re-fire correctly later), and removes any Discord roles that testing granted. Pass `remove_roles:false` if you'd rather keep the roles and only wipe the numbers. This is destructive and cannot be undone — double-check the `user` option before running it.

## Customizing

- **Weekly goal**: `WEEKLY_GOAL_MINUTES` in `.env` (default 180).
- **Recap schedule**: `WEEKLY_RECAP_CRON` (default `0 20 * * 0`, Sunday 8pm).
- **XP economy / level curve**: `src/leveling.js`.
- **Activity keywords**: `src/parser.js` → `ACTIVITY_KEYWORDS`.
