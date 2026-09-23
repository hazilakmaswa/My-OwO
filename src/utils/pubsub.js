const EventEmitter = require('events');
const requireDir = require('require-dir');
const dir = requireDir('./pubsubHandlers');
const bus = new EventEmitter();

class PubSub {
	constructor(main) {
		this.main = main;
		this.channels = { ...dir };
		for (const [channel, handler] of Object.entries(this.channels)) {
			bus.on(channel, (message) => {
				try { handler.handle(main, message); } catch (e) { console.error(`[PubSub:${channel}]`, e); }
			});
		}
	}
	async publish(channel, message = true) {
		const payload = typeof message === 'object' ? JSON.stringify(message) : String(message);
		setImmediate(() => bus.emit(channel, payload));
		return 1;
	}
};

PubSub.publishLocal = async function(channel, message = true) {
	const payload = typeof message === 'object' ? JSON.stringify(message) : String(message);
	setImmediate(() => bus.emit(channel, payload));
	return 1;
};

module.exports = PubSub;
