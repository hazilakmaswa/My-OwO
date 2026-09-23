/*
 * OwO Bot for Discord
 * Patreon API handler tanpa dependensi patreon-discord.
 */
const axios = require('axios');

const members = Object.create(null);
const cache = Object.create(null);

exports.request = async function (cookie) {
	console.log('getting cowoncy...');
	const cowoncyList = await getCowoncy(cookie);
	console.log('getting pets...');
	const petList = await getPets(cookie);
	console.log('getting customized command...');
	const customizedList = await getCustomizedCommand(cookie);
	console.log('getting custom command...');
	const commandList = await getCommand(cookie);

	return {
		cowoncy: cowoncyList,
		pet: petList,
		customizedCommand: customizedList,
		customCommand: commandList,
	};
};

function getCowoncy(cookie) {
	return getUsers(
		cookie,
		'https://www.patreon.com/api/reward-items/159691/deliverables?include=member.user.null&filter[delivery_status]=not_delivered&fields[user]=full_name,social_connections&json-api-version=1.0&page[count]=100',
		[]
	);
}

function getPets(cookie) {
	return getUsers(
		cookie,
		'https://www.patreon.com/api/reward-items/120005/deliverables?include=member.user.null&filter[delivery_status]=not_delivered&fields[user]=full_name,social_connections&json-api-version=1.0&page[count]=100',
		[]
	);
}

function getCustomizedCommand(cookie) {
	return getUsers(
		cookie,
		'https://www.patreon.com/api/reward-items/120006/deliverables?include=member.user.null&filter[delivery_status]=not_delivered&fields[user]=full_name,social_connections&json-api-version=1.0&page[count]=100',
		[]
	);
}

function getCommand(cookie) {
	return getUsers(
		cookie,
		'https://www.patreon.com/api/reward-items/120008/deliverables?include=member.user.null&filter[delivery_status]=not_delivered&fields[user]=full_name,social_connections&json-api-version=1.0&page[count]=100',
		[]
	);
}

async function getUsers(cookie, url, list) {
	try {
		const response = await axios.get(url, { headers: { cookie } });
		const data = response.data || {};
		const included = Array.isArray(data.included) ? data.included : [];

		for (const item of included) {
			if (item.type === 'member' && item.relationships?.user?.data?.id) {
				members[item.relationships.user.data.id] = item.id;
			}
		}

		for (const item of included) {
			if (item.type !== 'user') continue;
			const discord = item.attributes?.social_connections?.discord;
			list.push({
				name: item.attributes?.full_name,
				discord: discord?.user_id || (await getDiscordId(item.id)),
				user_id: item.id,
			});
		}

		if (data.links?.next) return getUsers(cookie, data.links.next, list);
		console.log('list length: ' + list.length);
		return list;
	} catch (error) {
		console.error(error);
		return list;
	}
}

async function getDiscordId(userId) {
	const memberId = members[userId];
	const token = process.env.PATREON_ACCESS_TOKEN;
	if (!memberId || !token) return null;
	if (cache[memberId]) return cache[memberId];

	try {
		const response = await axios.get(
			`https://www.patreon.com/api/oauth2/v2/members/${memberId}?include=user&fields[user]=social_connections`,
			{ headers: { Authorization: `Bearer ${token}` } }
		);
		const included = response.data?.included || [];
		const user = included.find((item) => item.type === 'user');
		const discordId = user?.attributes?.social_connections?.discord?.user_id || null;
		if (discordId) cache[memberId] = discordId;
		return discordId;
	} catch (error) {
		console.error('Gagal mengambil Discord ID Patreon:', error.message);
		return null;
	}
}
