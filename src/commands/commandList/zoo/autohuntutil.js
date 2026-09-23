/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */
/*
 * OwO Bot for Discord
 * Copyright (C) 2019 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const path = require('path');
const mysql = require('../../../botHandlers/jsonDatabaseHandler.js');

let macro;

try {
	macro = require(path.resolve(__dirname, '../../../../tokens/macro.js'));
} catch (e) {
	console.error(
		'[Autohunt] macro.js tidak ditemukan di tokens/macro.js atau secret/macro.js.'
	);

	try {
		macro = require(path.resolve(__dirname, '../../../../secret/macro.js'));
	} catch (secretError) {
		console.error(
			'[Autohunt] Fallback secret/macro.js juga tidak ditemukan.'
		);
	}
}

const traits = {
	efficiency: { inc: 10, pow: 1.748, base: 25, upg: 1, max: 215, prefix: '/H' },
	duration: { inc: 10, pow: 1.7, base: 0.5, upg: 0.1, max: 235, prefix: 'H' },
	cost: { inc: 1000, pow: 3.4, base: 10, upg: -1, max: 5, prefix: ' cowoncy' },
	gain: { inc: 10, pow: 1.8, base: 0, upg: 25, max: 200, prefix: ' essence/H' },
	exp: { inc: 10, pow: 1.8, base: 0, upg: 35, max: 200, prefix: ' xp/H' },
	radar: { inc: 50, pow: 2.5, base: 0, upg: 0.00000004, max: 999, prefix: ' %' },
};

const bots = [
	'<:cbot:459996048379609098>',
	'<:ubot:459996048660889600>',
	'<:rbot:459996049361338379>',
	'<:ebot:459996050174902272>',
	'<:mbot:459996049784963073>',
	'<a:lbot:459996050883608576>',
	'<a:fbot:1122059611206328350>',
];

let totalBots = 4000000;

setInterval(() => {
	updateTotal().catch((error) => {
		console.error('[Autohunt] Gagal menghitung total bot:', error.message);
	});
}, 60 * 60 * 1000);

updateTotal().catch((error) => {
	console.error('[Autohunt] Gagal menghitung total bot:', error.message);
});

exports.getLvl = function (xp, gain, traitName) {
	let totalxp = 0;
	let temp = {};
	let hit = false;
	let prevlvl = 0;
	const trait = traits[traitName];

	for (let i = 1; i <= trait.max + 1; i++) {
		let lvlxp = Math.trunc(trait.inc * Math.pow(i, trait.pow));
		totalxp += lvlxp;
		if (!hit && totalxp > xp) {
			prevlvl = i - 1;
			hit = true;
		}
		if (hit || i == trait.max + 1) {
			if (totalxp > xp + gain || i == trait.max + 1) {
				temp.lvl = i - 1;
				if (temp.lvl == trait.max) temp.max = true;
				temp.currentxp = xp + gain - (totalxp - lvlxp);
				temp.maxxp = lvlxp;
				if (prevlvl < temp.lvl) {
					temp.lvlup = true;
					temp.gain = trait.upg;
				}
				temp.stat = trait.base + trait.upg * temp.lvl;
				if (traitName != 'radar') temp.stat = Math.trunc(temp.stat * 10) / 10;
				else temp.stat = Math.round(temp.stat * 10000000) / 100000;
				temp.prefix = trait.prefix;
				return temp;
			}
		}
	}
};

exports.getMaxXp = function (lvl, trait) {
	return Math.trunc(traits[trait].inc * Math.pow(lvl, trait.pow));
};

exports.captcha = async function (p, word, text) {
	if (!macro || typeof macro.generateBuffer !== 'function') {
		throw new Error('macro.js tidak tersedia untuk captcha');
	}
	const buffer = await macro.generateBuffer(word);
	p.send(text, null, { file: buffer, name: 'captcha.png' });
};

exports.getBot = function (result) {
	if (result == undefined) return bots[0];

	const rank = result.rank;
	if (!rank || totalBots == undefined) return bots[0];
	if (rank <= 1) return bots[6];

	const percent = ((totalBots - rank) / totalBots) * 100;

	if (percent <= 43.85) return bots[0];
	else if (percent <= 78.85) return bots[1];
	else if (percent <= 98.85) return bots[2];
	else if (percent <= 99.85) return bots[3];
	else if (percent <= 99.95) return bots[4];
	return bots[5];
};

exports.getTotalBots = function () {
	return totalBots;
};

async function updateTotal() {
	const sql = 'SELECT COUNT(id) AS `total` FROM autohunt;';
	const result = await mysql.query(sql);
	const total = result[0]?.total ?? 0;
	if (total) totalBots = total;
}
