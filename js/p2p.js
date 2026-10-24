/**
 * P2P Network Controller using PeerJS for Chess WebRTC communication
 * Fully hardened with Google/Cloudflare STUN servers and robust handshaking
 */
class ChessP2P {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.myPeerId = null;
        this.targetHostId = null;
        this.isHost = false;
        this.handlers = {};
        this.isConnected = false;
        this.connectTimeout = null;

        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
                { urls: 'stun:stun.cloudflare.com:3478' }
            ]
        };
    }

    on(event, handler) {
        this.handlers[event] = handler;
    }

    emit(event, data) {
        if (this.handlers[event]) {
            try {
                this.handlers[event](data);
            } catch (err) {
                console.error(`Error in P2P handler for event ${event}:`, err);
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

    initHost(roomId, onReady) {
        this.disconnect();
        this.isHost = true;
        const targetId = roomId || this.generateRoomId();
        console.log('[P2P] Initializing Host with ID:', targetId);

        try {
            this.peer = new Peer(targetId, {
                debug: 1,
                config: this.rtcConfig
            });
        } catch (e) {
            console.error('[P2P] Peer constructor failed:', e);
            this.emit('error', 'Не удалось инициализировать P2P клиент.');
            return;
        }

        this.peer.on('open', (id) => {
            console.log('[P2P] Host Peer opened with ID:', id);
            this.myPeerId = id;
            if (onReady) onReady(id);
            this.emit('host-ready', id);
        });

        this.peer.on('connection', (connection) => {
            console.log('[P2P] Host received incoming connection from:', connection.peer);
            if (this.conn && this.conn.open) {
                console.warn('[P2P] Already connected, rejecting new connection');
                connection.close();
                return;
            }
            this.conn = connection;
            this.setupConnection();
        });

        this.peer.on('error', (err) => {
            console.error('[P2P] Host peer error:', err);
            if (err.type === 'unavailable-id') {
                // Retry with a fresh random ID
                console.log('[P2P] ID unavailable, generating fresh ID...');
                this.initHost(null, onReady);
            } else {
                this.emit('error', `Ошибка сети: ${err.type || err.message}`);
            }
        });
    }

    connectToHost(rawHostId) {
        this.disconnect();
        this.isHost = false;

        let hostId = rawHostId.trim().toLowerCase();
        if (!hostId.startsWith('gem-')) {
            hostId = `gem-${hostId}`;
        }
        this.targetHostId = hostId;

        console.log('[P2P] Connecting as Guest to Host ID:', hostId);
        this.emit('connecting', hostId);

        try {
            this.peer = new Peer({
                debug: 1,
                config: this.rtcConfig
            });
        } catch (e) {
            console.error('[P2P] Guest peer constructor failed:', e);
            this.emit('error', 'Не удалось запустить P2P клиент.');
            return;
        }

        // Set 15s connection timeout
        clearTimeout(this.connectTimeout);
        this.connectTimeout = setTimeout(() => {
            if (!this.isConnected) {
                console.warn('[P2P] Connection timeout reached');
                this.emit('error', 'Время ожидания подключения истекло. Убедитесь, что создатель игры открыл комнату и находится в сети.');
            }
        }, 15000);

        this.peer.on('open', (myId) => {
            console.log('[P2P] Guest peer opened with ID:', myId);
            this.myPeerId = myId;

            try {
                this.conn = this.peer.connect(this.targetHostId, {
                    reliable: true
                });
                this.setupConnection();
            } catch (err) {
                console.error('[P2P] peer.connect threw:', err);
                this.emit('error', 'Не удалось соединиться с хостом.');
            }
        });

        this.peer.on('error', (err) => {
            console.error('[P2P] Guest peer error:', err);
            clearTimeout(this.connectTimeout);
            if (err.type === 'peer-unavailable') {
                this.emit('error', `Комната "${hostId}" не найдена. Возможно, создатель игры вышел или код неверный.`);
            } else {
                this.emit('error', `Ошибка соединения: ${err.type || err.message}`);
            }
        });
    }

    setupConnection() {
        if (!this.conn) return;

        const onConnectionEstablished = () => {
            if (this.isConnected) return;
            this.isConnected = true;
            clearTimeout(this.connectTimeout);
            console.log('[P2P] DataChannel opened successfully! isHost =', this.isHost);
            this.emit('connected', { isHost: this.isHost });

            // If Guest, send immediate hello/join message so Host knows we are ready
            if (!this.isHost) {
                this.send('guest-join', { ready: true });
            }
        };

        if (this.conn.open) {
            // Already open
            setTimeout(onConnectionEstablished, 10);
        } else {
            this.conn.on('open', onConnectionEstablished);
        }

        this.conn.on('data', (data) => {
            console.log('[P2P] Received packet:', data);
            if (data && data.type) {
                this.emit(`msg:${data.type}`, data.payload);
            }
        });

        this.conn.on('close', () => {
            console.log('[P2P] Connection closed');
            this.isConnected = false;
            this.emit('disconnected');
        });

        this.conn.on('error', (err) => {
            console.error('[P2P] Connection channel error:', err);
            this.emit('error', 'Ошибка канала передачи данных.');
        });
    }

    send(type, payload = {}) {
        if (this.conn && this.conn.open) {
            console.log('[P2P] Sending packet:', type, payload);
            try {
                this.conn.send({ type, payload });
            } catch (err) {
                console.error('[P2P] Error sending data:', err);
            }
        } else {
            console.warn('[P2P] Cannot send packet, connection is not open:', type);
        }
    }

    disconnect() {
        clearTimeout(this.connectTimeout);
        if (this.conn) {
            try {
                this.conn.close();
            } catch (e) {}
            this.conn = null;
        }
        if (this.peer) {
            try {
                this.peer.destroy();
            } catch (e) {}
            this.peer = null;
        }
        this.isConnected = false;
    }
}

window.chessP2P = new ChessP2P();
