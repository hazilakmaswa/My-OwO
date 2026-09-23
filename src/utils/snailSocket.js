/*
 * OwO Bot for Discord
 * Copyright (C) 2021 Christopher Thai
 * This software is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 * For more information, see README.md and LICENSE
 */

const io = require('socket.io-client');

class SnailSocket {
	constructor(main) {
		this.main = main;
		this.socket = null;
		this.enabled = Boolean(process.env.SNAIL_SOCKET);

		if (!this.enabled) {
			console.info(
				'[SnailSocket] SNAIL_SOCKET tidak dikonfigurasi. Fitur SnailSocket dinonaktifkan.'
			);
			return;
		}

		this.socket = io(process.env.SNAIL_SOCKET, {
			auth: {
				token: process.env.SNAIL_TOKEN,
			},
			reconnection: true,
			reconnectionAttempts: 3,
			reconnectionDelay: 5000,
		});

		this.socket.on('error', (error) => {
			console.error('[SnailSocket] Error:', error?.message || error);
		});

		this.socket.on('disconnect', (reason) => {
			console.warn('[SnailSocket] Terputus:', reason);
		});

		this.socket.on('connect', () => {
			console.info('[SnailSocket] Terhubung.');
		});

		this.socket.on('connect_error', (error) => {
			console.error(
				'[SnailSocket] Gagal terhubung:',
				error?.message || error
			);
		});
	}

	messageChannel(channelId, contents) {
		if (!this.socket) return;
		this.socket.emit('message-channel', { channelId, contents });
	}

	userBanned(userId, isBanned) {
		if (!this.socket) return;
		this.socket.emit('user-banned', { userId, isBanned });
	}
}

module.exports = SnailSocket;
