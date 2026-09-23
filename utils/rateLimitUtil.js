/*
 * OwO Bot for Discord
 * Copyright (C) 2024 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */
const request = require('request');

let influxErrorShown = false;
let bucketWarningShown = false;

exports.init = function (bucket, debug) {
	if (!bucket || typeof bucket.getState !== 'function') {
		if (!bucketWarningShown) {
			console.warn(
				'[RateLimit] Bucket tidak tersedia. Pengiriman metrik rate limit dinonaktifkan.'
			);
			bucketWarningShown = true;
		}
		return null;
	}

	return setInterval(() => {
		logBucket(bucket, debug).catch((error) => {
			console.error('[RateLimit] Gagal mencatat bucket:', error.message);
		});
	}, 10000);
};

async function logBucket(bucket, debug) {
	if (!bucket || typeof bucket.getState !== 'function') {
		return;
	}

	if (!process.env.INFLUXDB_HOST) {
		return;
	}

	const { concurrent, queueCount, bucketCount, waiting } = bucket.getState();
	const body = {
		password: process.env.INFLUXDB_PASS,
		metric: 'ratelimit',
		server: process.env.SHARDER_SERVER,
		concurrent,
		queueCount,
		bucketCount,
		waiting,
	};

	if (debug) {
		body.debug = true;
	}

	return new Promise((resolve) => {
		request(
			{
				method: 'POST',
				uri: `${process.env.INFLUXDB_HOST}/qos`,
				json: true,
				body,
			},
			function (err) {
				if (err && !influxErrorShown) {
					console.error(
						'[RateLimit] InfluxDB tidak aktif. Upload metrik dinonaktifkan.'
					);
					influxErrorShown = true;
				}
				resolve();
			}
		);
	});
}
