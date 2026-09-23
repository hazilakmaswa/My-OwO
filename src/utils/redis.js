/*
 * Local JSON replacement for Redis.
 * Keeps the original redis.js API so command code remains compatible.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.resolve(process.env.REDIS_JSON_PATH || path.join(__dirname, '../data/redis.json'));
let state = { hashes: {}, sets: {}, zsets: {}, strings: {}, expires: {} };

try { state = { ...state, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch (_) {}

function save() {
	fs.mkdirSync(path.dirname(FILE), { recursive: true });
	const tmp = `${FILE}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
	fs.renameSync(tmp, FILE);
}

function expireCheck(key) {
	const expires = state.expires[key];
	if (expires && expires <= Date.now()) {
		delete state.hashes[key]; delete state.sets[key]; delete state.zsets[key]; delete state.strings[key]; delete state.expires[key];
		return true;
	}
	return false;
}

function hgetall(key) {
	expireCheck(key);
	return { ...(state.hashes[key] || {}) };
}
function ensureHash(key) { if (!state.hashes[key]) state.hashes[key] = {}; return state.hashes[key]; }

exports.hgetall = async (key) => hgetall(key);
exports.hget = async (key, field) => hgetall(key)[field] ?? null;
exports.hset = async (key, field, val = 1) => {
	const h = ensureHash(key);
	const exists = Object.prototype.hasOwnProperty.call(h, field);
	h[field] = String(val);
	save();
	return exists ? 0 : 1;
};
exports.hdel = async (key, field) => {
	const h = ensureHash(key);
	const exists = Object.prototype.hasOwnProperty.call(h, field);
	delete h[field]; save();
	return exists ? 1 : 0;
};
exports.hmget = async (key, fields) => {
	fields = Array.isArray(fields) ? fields : [fields];
	const h = hgetall(key);
	return fields.map(f => h[f] ?? null);
};
exports.hmset = async (key, values) => {
	const h = ensureHash(key);
	if (Array.isArray(values)) {
		for (let i = 0; i < values.length; i += 2) h[values[i]] = String(values[i + 1]);
	} else {
		Object.entries(values || {}).forEach(([k,v]) => h[k] = String(v));
	}
	save(); return 'OK';
};
exports.hincrby = async (key, field, val = 1) => {
	const h = ensureHash(key);
	h[field] = String((parseInt(h[field], 10) || 0) + Number(val));
	save(); return Number(h[field]);
};

// This API is historically used as a sorted-set increment.
exports.incr = async (key, member, val = 1) => {
	if (!state.zsets[key]) state.zsets[key] = {};
	state.zsets[key][String(member)] = (Number(state.zsets[key][String(member)]) || 0) + Number(val);
	save(); return state.zsets[key][String(member)];
};

function sorted(key) {
	expireCheck(key);
	return Object.entries(state.zsets[key] || {}).sort((a,b) => Number(b[1]) - Number(a[1]));
}
exports.getTop = async (key, count = 5) => {
	const out = [];
	sorted(key).slice(0,count).forEach(([id,score]) => out.push(id, String(score)));
	return out;
};
exports.getRange = async (key, min, max) => {
	const out = [];
	sorted(key).slice(Number(min), Number(max)+1).forEach(([id,score]) => out.push(id, String(score)));
	return out;
};
exports.zscore = async (key, id) => {
	const v = state.zsets[key] && state.zsets[key][String(id)];
	return v === undefined ? null : String(v);
};
exports.getXP = exports.zscore;
exports.getRank = async (key, id) => {
	const index = sorted(key).findIndex(([member]) => String(member) === String(id));
	return index < 0 ? null : index;
};

exports.sadd = async (key, value) => {
	if (!state.sets[key]) state.sets[key] = {};
	const k = String(value);
	if (state.sets[key][k]) return 0;
	state.sets[key][k] = true; save(); return 1;
};
exports.del = async (key) => {
	const existed = !!(state.hashes[key] || state.sets[key] || state.zsets[key] || state.strings[key]);
	delete state.hashes[key]; delete state.sets[key]; delete state.zsets[key]; delete state.strings[key]; delete state.expires[key];
	save(); return existed ? 1 : 0;
};
exports.expire = async (key, seconds = 259200) => {
	state.expires[key] = Date.now() + Number(seconds) * 1000;
	save(); return 1;
};
exports.zrem = async (key, member) => {
	if (!state.zsets[key] || !(String(member) in state.zsets[key])) return 0;
	delete state.zsets[key][String(member)]; save(); return 1;
};

exports.client = {
	on() {},
};
