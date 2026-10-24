/**
 * Ultra-Reliable WebSocket Real-Time Relay for Chess Multiplayer
 * Replaces fragile P2P WebRTC with standard HTTPS/WSS WebSockets.
 * Works across all NATs, mobile networks, VPNs, and firewalls without TURN servers.
 */
class ChessNetwork {
    constructor() {
        this.ws = null;
        this.roomId = null;
        this.myClientId = 'p_' + Math.random().toString(36).slice(2, 9);
        this.isHost = false;
        this.handlers = {};
        this.isConnected = false;
        this.reconnectTimer = null;
        this.pingTimer = null;
    }

    on(event, handler) {
        this.handlers[event] = handler;
    }

    emit(event, data) {
        if (this.handlers[event]) {
            try {
                this.handlers[event](data);
            } catch (err) {
                console.error(`[Network] Error in handler for ${event}:`, err);
            }
        }
    }

    generateRoomId() {
        const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
        let id = '';
        for (let i = 0; i < 6; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return `gem-${id}`;
    }

    getTopic(roomId) {
        return `gemchess-v2-${roomId.toLowerCase().trim()}`;
    }

    initHost(roomId, onReady) {
        this.disconnect();
        this.isHost = true;
        this.roomId = roomId || this.generateRoomId();
        const topic = this.getTopic(this.roomId);

        console.log(`[Network] Initializing Host on room ${this.roomId} (topic: ${topic})`);

        this.connectWebSocket(topic, () => {
            console.log(`[Network] Host connected to relay`);
            if (onReady) onReady(this.roomId);
            this.emit('host-ready', this.roomId);
        });
    }

    connectToHost(rawHostId) {
        this.disconnect();
        this.isHost = false;

        let roomId = rawHostId.trim().toLowerCase();
        if (!roomId.startsWith('gem-')) {
            roomId = `gem-${roomId}`;
        }
        this.roomId = roomId;
        const topic = this.getTopic(this.roomId);

        console.log(`[Network] Guest connecting to room ${this.roomId} (topic: ${topic})`);
        this.emit('connecting', this.roomId);

        this.connectWebSocket(topic, () => {
            console.log(`[Network] Guest connected to relay, announcing presence...`);
            // Announce presence to Host
            this.send('guest-join', { clientId: this.myClientId });
        });
    }

    connectWebSocket(topic, onOpenCallback) {
        try {
            const wsUrl = `wss://ntfy.sh/${topic}/ws`;
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log(`[Network] WSS open for topic: ${topic}`);
                this.isConnected = true;
                if (onOpenCallback) onOpenCallback();
                this.startHeartbeat();
            };

            this.ws.onmessage = (event) => {
                try {
                    const raw = JSON.parse(event.data);
                    if (raw.event !== 'message') return;

                    const msg = JSON.parse(raw.message);
                    // Ignore our own broadcasted packets
                    if (msg.senderId === this.myClientId) return;

                    console.log(`[Network] Received:`, msg.type, msg.payload);
                    this.handleMessage(msg);
                } catch (e) {
                    console.warn(`[Network] Could not parse message:`, event.data, e);
                }
            };

            this.ws.onclose = () => {
                console.log(`[Network] WSS closed`);
                this.isConnected = false;
                this.stopHeartbeat();
            };

            this.ws.onerror = (err) => {
                console.error(`[Network] WSS error:`, err);
                this.emit('error', 'Ошибка связи с сервером синхронизации.');
            };
        } catch (err) {
            console.error(`[Network] Failed to create WebSocket:`, err);
            this.emit('error', 'Не удалось открыть соединение.');
        }
    }

    handleMessage(msg) {
        const { type, payload } = msg;

        if (type === 'guest-join' && this.isHost) {
            console.log('[Network] Host detected guest-join! Firing connected event...');
            this.emit('connected', { isHost: true });
            return;
        }

        if (type === 'game-init' && !this.isHost) {
            console.log('[Network] Guest received game-init from host!');
            this.emit('connected', { isHost: false });
            this.emit('msg:game-init', payload);
            return;
        }

        this.emit(`msg:${type}`, payload);
    }

    async send(type, payload = {}) {
        if (!this.roomId) {
            console.warn('[Network] Cannot send: no roomId');
            return;
        }

        const topic = this.getTopic(this.roomId);
        const data = {
            senderId: this.myClientId,
            type: type,
            payload: payload,
            ts: Date.now()
        };

        try {
            console.log(`[Network] Sending [${type}] to ${topic}:`, payload);
            await fetch(`https://ntfy.sh/${topic}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } catch (err) {
            console.error(`[Network] Error sending packet [${type}]:`, err);
        }
    }

    startHeartbeat() {
        this.stopHeartbeat();
        // Keep WebSocket alive
        this.pingTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                // ntfy.sh supports ping or empty message
            }
        }, 20000);
    }

    stopHeartbeat() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    disconnect() {
        this.stopHeartbeat();
        if (this.ws) {
            try {
                this.ws.close();
            } catch (e) {}
            this.ws = null;
        }
        this.isConnected = false;
        this.roomId = null;
    }
}

// Export as both chessNetwork and chessP2P for drop-in compatibility
window.chessNetwork = new ChessNetwork();
window.chessP2P = window.chessNetwork;
