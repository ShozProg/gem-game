/**
 * P2P Network Controller using PeerJS for Chess WebRTC communication
 */
class ChessP2P {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.myPeerId = null;
        this.isHost = false;
        this.handlers = {};
        this.isConnected = false;
    }

    on(event, handler) {
        this.handlers[event] = handler;
    }

    emit(event, data) {
        if (this.handlers[event]) {
            this.handlers[event](data);
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
        this.isHost = true;
        const targetId = roomId || this.generateRoomId();

        try {
            this.peer = new Peer(targetId, {
                debug: 1
            });
        } catch (e) {
            console.error('Peer creation failed', e);
            this.emit('error', 'Не удалось инициализировать P2P соединение.');
            return;
        }

        this.peer.on('open', (id) => {
            this.myPeerId = id;
            if (onReady) onReady(id);
            this.emit('host-ready', id);
        });

        this.peer.on('connection', (connection) => {
            if (this.conn) {
                // Already have a player
                connection.close();
                return;
            }
            this.conn = connection;
            this.setupConnection();
        });

        this.peer.on('error', (err) => {
            console.warn('Peer error:', err);
            if (err.type === 'unavailable-id') {
                // Retry with new ID
                this.initHost(null, onReady);
            } else {
                this.emit('error', err.message || 'Ошибка соединения');
            }
        });
    }

    connectToHost(hostId) {
        this.isHost = false;
        try {
            this.peer = new Peer({ debug: 1 });
        } catch (e) {
            this.emit('error', 'Не удалось запустить P2P клиент.');
            return;
        }

        this.peer.on('open', (id) => {
            this.myPeerId = id;
            const fullHostId = hostId.startsWith('gem-') ? hostId : `gem-${hostId.toLowerCase().trim()}`;
            this.conn = this.peer.connect(fullHostId, {
                reliable: true
            });
            this.setupConnection();
        });

        this.peer.on('error', (err) => {
            console.warn('Peer error:', err);
            this.emit('error', 'Не удалось найти комнату или подключиться к оппоненту.');
        });
    }

    setupConnection() {
        this.conn.on('open', () => {
            this.isConnected = true;
            this.emit('connected', { isHost: this.isHost });
        });

        this.conn.on('data', (data) => {
            if (data && data.type) {
                this.emit(`msg:${data.type}`, data.payload);
            }
        });

        this.conn.on('close', () => {
            this.isConnected = false;
            this.emit('disconnected');
        });

        this.conn.on('error', (err) => {
            console.error('Connection error:', err);
            this.emit('error', 'Ошибка P2P канала передачи данных.');
        });
    }

    send(type, payload = {}) {
        if (this.conn && this.conn.open) {
            this.conn.send({ type, payload });
        }
    }

    disconnect() {
        if (this.conn) {
            this.conn.close();
            this.conn = null;
        }
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.isConnected = false;
    }
}

window.chessP2P = new ChessP2P();
