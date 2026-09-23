/*
 * OwO Bot for Discord - JSON storage edition
 * Single-process friendly entry point for Railway/Replit/bot hosts.
 */
require('dotenv').config();

if (!process.env.BOT_TOKEN) {
	console.error('BOT_TOKEN is missing. Create a .env file or configure the host environment.');
	process.exit(1);
}

const config = require('./src/data/config.json');
const rateLimitUtil = require('./utils/rateLimitUtil.js');
const Sharder = require('eris-sharder').Master;

const shardCount = Math.max(1, parseInt(process.env.SHARD_COUNT || '1', 10));
const clusters = Math.max(1, parseInt(process.env.CLUSTERS || '1', 10));

(async () => {
	try {
		console.log(`[OwO] Starting with ${shardCount} shard(s), ${clusters} cluster(s).`);
		console.log(`[OwO] JSON DB: ${process.env.DB_PATH || './data/db.json'}`);
		console.log(`[OwO] Local Redis replacement: ${process.env.REDIS_JSON_PATH || './data/redis.json'}`);

		const sharder = new Sharder(`Bot ${process.env.BOT_TOKEN}`, config.sharder.path, {
			name: config.sharder.name,
			clientOptions: config.eris.clientOptions,
			debug: process.env.DEBUG === 'true',
			shards: shardCount,
			clusters,
			firstShardID: 0,
			lastShardID: shardCount - 1,
		});

		if (sharder.bucket) {
			rateLimitUtil.init(sharder.bucket, process.env.DEBUG === 'true');
		} else {
			console.warn(
				'[OwO] Rate limit bucket tidak tersedia pada sharder master. Statistik rate limit dilewati.'
			);
		}
	} catch (e) {
		console.error('[OwO] Failed to start:', e);
		process.exitCode = 1;
	}
})();
