/*
 * OwO Bot - JSON database adapter
 * Replaces MySQL/MariaDB with a local JSON-backed SQL compatibility layer.
 *
 * The bot still uses its existing query() calls, so command code does not
 * need a full rewrite. Data is stored in data/db.json (or DB_PATH).
 */
const fs = require('fs');
const path = require('path');
const alasql = require('alasql');

const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, '../data/db.json'));
const SCHEMA_PATH = path.join(__dirname, '../data/db.schema.json');

const clone = (v) => JSON.parse(JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x));

function nowSql() {
	return new Date();
}

alasql.fn.NOW = nowSql;
alasql.fn.IF = (condition, yes, no) => (condition ? yes : no);
alasql.fn.TIMESTAMPDIFF = (unit, from, to) => {
	const a = new Date(from).getTime();
	const b = new Date(to).getTime();
	if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
	const diff = b - a;
	switch (String(unit).toUpperCase()) {
		case 'SECOND': return Math.floor(diff / 1000);
		case 'MINUTE': return Math.floor(diff / 60000);
		case 'HOUR': return Math.floor(diff / 3600000);
		case 'DAY': return Math.floor(diff / 86400000);
		case 'WEEK': return Math.floor(diff / 604800000);
		case 'MONTH': return (new Date(to).getFullYear() - new Date(from).getFullYear()) * 12 +
			new Date(to).getMonth() - new Date(from).getMonth();
		default: return diff;
	}
};

function loadJson(file, fallback) {
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch {
		return fallback;
	}
}

function saveJsonAtomic(file, value) {
	const dir = path.dirname(file);
	fs.mkdirSync(dir, { recursive: true });
	const tmp = `${file}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(value, (_, x) => typeof x === 'bigint' ? x.toString() : x, 2));
	fs.renameSync(tmp, file);
}

const schema = loadJson(SCHEMA_PATH, {});
let state = loadJson(DB_PATH, {});
for (const table of Object.keys(schema)) {
	if (!Array.isArray(state[table])) state[table] = [];
}

const db = new alasql.Database('owo_json');

function createTables() {
	for (const [table, info] of Object.entries(schema)) {
		const columns = info.columns.map((c) => `\`${c.name}\` ${c.type || 'STRING'}`).join(', ');
		try {
			db.exec(`CREATE TABLE \`${table}\` (${columns})`);
		} catch (e) {
			if (!/already exists/i.test(e.message)) throw e;
		}
		if (state[table].length) {
			const names = info.columns.map((c) => `\`${c.name}\``).join(',');
			for (const row of state[table]) {
				const vals = info.columns.map((c) => valueForSql(row[c.name]));
				try {
					db.exec(`INSERT INTO \`${table}\` (${names}) VALUES (${vals.join(',')})`);
				} catch (_) {
					// Seed data is static. Duplicate rows are harmless.
				}
			}
		}
	}
}

function valueForSql(v) {
	if (v === null || v === undefined) return 'NULL';
	if (typeof v === 'bigint') return `'${v.toString()}'`;
	if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
	if (v instanceof Date) return `'${v.toISOString().slice(0,19).replace('T',' ')}'`;
	return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\r/g, '\\r').replace(/\n/g, '\\n')}'`;
}

function syncStateFromDb(tableNames) {
	for (const table of tableNames) {
		const t = db.tables[table];
		if (!t) continue;
		state[table] = t.data.map((row) => ({ ...row }));
	}
}

let flushTimer = null;
function scheduleFlush() {
	clearTimeout(flushTimer);
	flushTimer = setTimeout(() => {
		try { saveJsonAtomic(DB_PATH, state); }
		catch (e) { console.error('[JSON DB] save failed:', e); }
	}, 100);
}

function splitStatements(sql) {
	const result = [];
	let start = 0, quote = null, escape = false, depth = 0;
	for (let i = 0; i < sql.length; i++) {
		const ch = sql[i];
		if (quote) {
			if (escape) escape = false;
			else if (ch === '\\') escape = true;
			else if (ch === quote) quote = null;
		} else if (ch === "'" || ch === '"' || ch === '`') {
			quote = ch;
		} else if (ch === '(') depth++;
		else if (ch === ')') depth--;
		else if (ch === ';' && depth === 0) {
			if (sql.slice(start, i).trim()) result.push(sql.slice(start, i).trim());
			start = i + 1;
		}
	}
	if (sql.slice(start).trim()) result.push(sql.slice(start).trim());
	return result;
}

function normalizeSql(sql) {
	return sql
		.replace(/\/\*![\s\S]*?\*\//g, '')
		.replace(/\bFOR\s+UPDATE\b/gi, '')
		.replace(/\bLOCK\s+IN\s+SHARE\s+MODE\b/gi, '')
		.replace(/\bIGNORE\b/gi, '')
		.replace(/\bUSING\s+BTREE\b/gi, '');
}

function normalizeParams(params) {
	return (Array.isArray(params) ? params : [params]).map((v) => typeof v === 'bigint' ? v.toString() : v);
}

function tableName(sql) {
	const m = sql.match(/^(?:INSERT(?:\s+IGNORE)?\s+INTO|UPDATE(?:\s+IGNORE)?|DELETE\s+FROM)\s+`?([A-Za-z0-9_]+)`?/i);
	return m && m[1];
}

function primaryKey(table, row) {
	const info = schema[table];
	if (!info) return null;
	const keys = info.pk || [];
	if (!keys.length) return null;
	return keys.map(k => `${k}=${row[k] === undefined ? '' : String(row[k])}`).join('|');
}

function uniqueKey(table, row) {
	const info = schema[table];
	if (!info) return null;
	const sets = [info.pk || [], ...(info.unique || [])].filter(x => x.length);
	for (const keys of sets) {
		const vals = keys.map(k => row[k]);
		if (vals.some(v => v === undefined || v === null)) continue;
		return keys.map(k => `${k}=${String(row[k])}`).join('|');
	}
	return null;
}

function duplicateRow(table, row) {
	const info = schema[table];
	if (!info) return null;
	const sets = [info.pk || [], ...(info.unique || [])].filter(x => x.length);
	return db.tables[table].data.find(existing => sets.some(keys =>
		keys.length && keys.every(k => existing[k] !== undefined && existing[k] !== null &&
			row[k] !== undefined && row[k] !== null && String(existing[k]) === String(row[k]))
	)) || null;
}

function nextAuto(table) {
	const col = schema[table] && schema[table].auto;
	if (!col) return undefined;
	const values = db.tables[table].data.map(r => Number(r[col])).filter(Number.isFinite);
	return values.length ? Math.max(...values) + 1 : 1;
}

function parseTuples(text) {
	const tuples = [];
	let current = '', quote = null, escape = false, depth = 0;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quote) {
			current += ch;
			if (escape) escape = false;
			else if (ch === '\\') escape = true;
			else if (ch === quote) quote = null;
		} else if (ch === "'" || ch === '"') {
			quote = ch; current += ch;
		} else if (ch === '(') {
			depth++; current += ch;
		} else if (ch === ')') {
			depth--; current += ch;
			if (depth === 0) { tuples.push(current.trim()); current = ''; }
		} else if (depth === 0 && ch === ',') {
			// separator between tuples
		} else current += ch;
	}
	return tuples;
}

function splitValues(text) {
	const out = []; let cur = '', quote = null, escape = false, depth = 0;
	for (const ch of text) {
		if (quote) {
			cur += ch;
			if (escape) escape = false;
			else if (ch === '\\') escape = true;
			else if (ch === quote) quote = null;
		} else if (ch === "'" || ch === '"') { quote = ch; cur += ch; }
		else if (ch === '(') { depth++; cur += ch; }
		else if (ch === ')') { depth--; cur += ch; }
		else if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; }
		else cur += ch;
	}
	out.push(cur.trim());
	return out;
}

function parseLiteral(v, params, paramIndex) {
	v = v.trim();
	if (v === '?') return params[paramIndex.value++];
	if (/^null$/i.test(v)) return null;
	if (/^now\(\)$/i.test(v)) return nowSql();
	if (/^\(\s*SELECT\b[\s\S]*\)$/i.test(v)) {
		const inner = v.slice(1, -1).trim();
		const result = db.exec(inner, params);
		const row = Array.isArray(result) ? result[0] : result;
		return row ? row[Object.keys(row)[0]] : null;
	}
	if (/^-?\d+$/.test(v)) {
		// Discord snowflakes must not pass through JS Number.
		return v.length >= 15 ? v : Number(v);
	}
	if (/^-?\d+\.\d+$/.test(v)) return Number(v);
	if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
		return v.slice(1,-1).replace(/''/g, "'").replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');
	}
	return v;
}

function executeInsert(sql, params) {
	const m = sql.match(/^INSERT(?:\s+IGNORE)?\s+INTO\s+`?([A-Za-z0-9_]+)`?\s*(?:\(([^)]*)\))?\s+VALUES\s+([\s\S]*?)(?:\s+ON\s+DUPLICATE\s+KEY\s+UPDATE\s+([\s\S]*))?$/i);
	if (!m) return null;
	const [, table, colText, valuesText, dupText] = m;
	const info = schema[table];
	if (!info) throw new Error(`Unknown table: ${table}`);
	const columns = (colText ? colText.split(',') : info.columns.map(c => c.name)).map(c => c.trim().replace(/`/g,''));
	const tuples = parseTuples(valuesText);
	const paramIndex = { value: 0 };
	let affected = 0, insertId;

	for (const tuple of tuples) {
		const raw = tuple.replace(/^\(/,'').replace(/\)$/,'');
		const values = splitValues(raw).map(v => parseLiteral(v, params, paramIndex));
		const row = {};
		columns.forEach((c, i) => { row[c] = values[i]; });
		if (info.auto && row[info.auto] === undefined) row[info.auto] = nextAuto(table);

		const dup = duplicateRow(table, row);
		if (dup) {
			if (!dupText) continue;
			const assignments = dupText.split(',').map(x => x.trim()).filter(Boolean);
			for (const assignment of assignments) {
				const am = assignment.match(/^`?([A-Za-z0-9_]+)`?\s*=\s*(.*)$/i);
				if (!am) continue;
				const col = am[1], expr = am[2];
				// Support VALUES(col), arithmetic against existing values, literals and NOW().
				let value;
				const vm = expr.match(/^VALUES\(`?([A-Za-z0-9_]+)`?\)$/i);
				if (vm) value = row[vm[1]];
				else if (/^NOW\(\)$/i.test(expr)) value = nowSql();
				else {
					const arithmetic = expr.match(/^`?([A-Za-z0-9_]+)`?\s*([+-])\s*(\d+(?:\.\d+)?)$/);
					if (arithmetic) value = Number(dup[arithmetic[1]]) + (arithmetic[2] === '+' ? 1 : -1) * Number(arithmetic[3]);
					else value = parseLiteral(expr, params, paramIndex);
				}
				dup[col] = value;
			}
			affected++;
		} else {
			db.tables[table].data.push(row);
			insertId = row[info.auto];
			affected++;
		}
	}
	syncStateFromDb([table]);
	scheduleFlush();
	return { affectedRows: affected, insertId, changedRows: affected };
}

function executeOne(sql, params) {
	sql = normalizeSql(sql.trim());
	if (!sql) return [];

	const insertResult = executeInsert(sql, params);
	if (insertResult) return insertResult;

	// MySQL's UPDATE ... JOIN syntax is rewritten for the common user.uid = user_item.uid pattern.
	sql = sql.replace(
		/^UPDATE\s+`?([A-Za-z0-9_]+)`?\s+INNER\s+JOIN\s+`?([A-Za-z0-9_]+)`?\s+ON\s+(.+?)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/is,
		'UPDATE $1 SET $4 WHERE $5'
	);
	sql = sql.replace(
		/^UPDATE\s+`?([A-Za-z0-9_]+)`?\s+LEFT\s+JOIN\s+`?([A-Za-z0-9_]+)`?\s+ON\s+(.+?)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/is,
		'UPDATE $1 SET $4 WHERE $5'
	);

	// Convert a few MySQL-only constructs that appear in this bot.
	sql = sql.replace(/\bUPDATE\s+IGNORE\b/gi, 'UPDATE');
	sql = sql.replace(/\bINSERT\s+IGNORE\b/gi, 'INSERT');
	sql = sql.replace(/\bTIMESTAMPDIFF\s*\(/gi, 'TIMESTAMPDIFF(');

	try {
		const result = db.exec(sql, params);
		const t = tableName(sql);
		if (/^(UPDATE|DELETE)\b/i.test(sql) && t) {
			syncStateFromDb([t]);
			scheduleFlush();
			const affected = typeof result === 'number' ? result : (result && result.length ? result.length : 0);
			return { affectedRows: affected, changedRows: affected };
		}
		if (/^SELECT\b/i.test(sql)) return result || [];
		return result || { affectedRows: 0 };
	} catch (error) {
		error.message = `[JSON DB] ${error.message}\nSQL: ${sql}`;
		throw error;
	}
}

class JsonConnection {
	query(sql, variables, callback) {
		if (typeof variables === 'function') {
			callback = variables; variables = [];
		}
		const params = normalizeParams(variables || []);
		const run = () => {
			try {
				const statements = splitStatements(sql);
				const results = statements.map(statement => executeOne(statement, params));
				const value = results.length === 1 ? results[0] : results;
				if (callback) callback(null, value);
				return value;
			} catch (e) {
				if (callback) callback(e);
				else throw e;
				throw e;
			}
		};
		if (callback) return run();
		return Promise.resolve().then(run);
	}

	getConnection(callback) {
		const tx = new JsonTransaction();
		if (callback) return callback(null, tx);
		return Promise.resolve(tx);
	}
}

class JsonTransaction extends JsonConnection {
	constructor() {
		super();
		this.snapshot = clone(state);
	}
	beginTransaction(callback) { if (callback) callback(null); return Promise.resolve(); }
	commit(callback) {
		syncStateFromDb(Object.keys(schema));
		scheduleFlush();
		if (callback) callback(null);
		return Promise.resolve();
	}
	rollback(callback) {
		state = this.snapshot;
		rebuild();
		if (callback) callback(null);
		return Promise.resolve();
	}
	release() {}
}

function rebuild() {
	for (const name of Object.keys(db.tables)) {
		try { db.exec(`DROP TABLE \`${name}\``); } catch (_) {}
	}
	createTables();
}

createTables();

const con = new JsonConnection();
module.exports = { con, mysql: { escape: (v) => valueForSql(v) }, db, state };
