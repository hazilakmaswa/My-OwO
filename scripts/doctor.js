const fs = require('fs');
const path = require('path');

const checks = [
	['package.json', fs.existsSync(path.join(__dirname, '../package.json'))],
	['JSON database', fs.existsSync(path.join(__dirname, '../data/db.json'))],
	['JSON schema', fs.existsSync(path.join(__dirname, '../data/db.schema.json'))],
	['local Redis JSON', fs.existsSync(path.join(__dirname, '../data/redis.json'))],
];

let failed = false;
for (const [name, ok] of checks) {
	console.log(`${ok ? 'OK ' : 'ERR'} ${name}`);
	if (!ok) failed = true;
}

for (const forbidden of ['mysql', 'redis']) {
	if (fs.existsSync(path.join(__dirname, `../src/utils/${forbidden}.js`)) && forbidden === 'mysql') {
		// mysql.js is intentionally kept as a compatibility filename but is no longer
		// the MySQL package; it is the JSON DB adapter.
	}
}

if (failed) process.exit(1);
console.log('OwO JSON edition looks ready.');
