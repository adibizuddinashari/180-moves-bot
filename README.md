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
- **Slash commands**:
  - `/stats [user]` — weekly progress, level, XP, streak
  - `/leaderboard [scope]` — weekly minutes or all-time XP leaderboard
  - `/checkin-help` — reminds members how to format a check-in

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
npm run deploy-commands   # registers /stats, /leaderboard, /checkin-help
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

The parser (`src/parser.js`) looks for a duration (`30 min`, `1 hour`, `1h30m`,
`half an hour`, etc.) and an activity keyword from a built-in list (run, walk,
yoga, gym, swim, bike, hike, sports, ...). If no duration is found, nothing is
logged and the bot reacts ❓. If a duration is found but no known activity
keyword, it logs the minutes under a generic "activity" label — progress still
counts.

## Customizing

- **Weekly goal**: `WEEKLY_GOAL_MINUTES` in `.env` (default 180).
- **Recap schedule**: `WEEKLY_RECAP_CRON` (default `0 20 * * 0`, Sunday 8pm).
- **XP economy / level curve**: `src/leveling.js`.
- **Activity keywords**: `src/parser.js` → `ACTIVITY_KEYWORDS`.
