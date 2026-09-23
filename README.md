# OwO Bot — Local JSON Edition

A cleaned fork of Discord-OwO-Bot configured to run as a normal Node.js service without MariaDB/MySQL or Redis.

## Storage

- `data/db.json` — bot/economy/game data.
- `data/redis.json` — local replacement for the Redis hashes, sets and sorted sets used by the original code.
- Both files are created/updated automatically.
- Set `DB_PATH` or `REDIS_JSON_PATH` if your host provides a persistent volume.

The original SQL dump files are intentionally removed from this edition. The static game tables are pre-seeded in `data/db.json`.

## Requirements

- Node.js 18.18+ (Node 20 LTS recommended)
- A Discord bot token

## Run

```bash
npm install
cp .env.example .env
# put your Discord token in .env
npm start
```

Development:

```bash
npm run dev
```

## Environment

Required:

```env
BOT_TOKEN=
```

Optional:

```env
CLIENT_ID=
DBL_TOKEN=
WEEBSH_TOKEN=
PATREON_CLIENT_ID=
PATREON_CLIENT_SECRET=
PATREON_ACCESS_TOKEN=

DB_PATH=./data/db.json
REDIS_JSON_PATH=./data/redis.json

SHARD_COUNT=1
CLUSTERS=1
DEBUG=false
```

`SHARD_COUNT=1` is the default for simple bot hosting. Increase it only when you actually need multiple Discord shards.

## Railway

1. Upload/push this repository.
2. Set `BOT_TOKEN` in Variables.
3. Use the default start command: `npm start`.
4. Add a persistent volume if you need JSON data to survive redeploys/restarts.
5. Mount the volume and point `DB_PATH` and `REDIS_JSON_PATH` at files on that volume.

## Replit

1. Import the repository.
2. Add `BOT_TOKEN` to Secrets.
3. Run `npm start`.
4. Keep `data/` on persistent storage if your Replit setup can recreate the workspace.

## Generic bot hosting

The project is a standard Node.js application:

```text
Install: npm install
Start:   npm start
```

No MariaDB/MySQL server and no Redis server are required.

## Notes about the migration

The command layer still calls `query()` in many places because the goal is to preserve the original command structure. The database adapter translates the commonly used MySQL-style operations to a local JSON-backed SQL engine and keeps the original result shape (`rows`, `affectedRows`, `insertId`) where practical.

This is intended as a standalone fork, not as a drop-in replacement for a production MariaDB/Redis cluster. JSON persistence is simple and portable, but it is not suitable for very large multi-process deployments with high write concurrency.

## License

See `LICENSE`.
