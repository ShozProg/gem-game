/**
 * Main Application Controller for Gem Chess
 * Supports AI Bot (Easy/Medium/Hard), Hotseat, and Online P2P (PeerJS)
 */
(() => {
    // Game State
    let chess = null;
    let selectedSquare = null;
    let validMoves = [];
    let isFlipped = false;
    let pendingPromotion = null;
    let gameMode = 'ai'; // 'ai' | 'hotseat' | 'p2p-host' | 'p2p-guest' | 'connecting'
    let aiDifficulty = 'medium'; // 'easy' | 'medium' | 'hard'
    let myColor = 'w'; // 'w' | 'b'
    let isGameOver = false;
    let isAiThinking = false;

    // Time Control State
    let timeControl = { baseMs: 600000, incMs: 0 }; // default 10m + 0s
    let clocks = { w: 600000, b: 600000 };
    let clockTimer = null;
    let lastClockTick = null;

    // DOM Elements
    const boardEl = document.getElementById('chessboard');
    const statusBanner = document.getElementById('status-banner');
    const statusText = document.getElementById('status-text');
    const statusIcon = document.getElementById('status-icon');
    const movesCountEl = document.getElementById('moves-count');
    const historyTbody = document.getElementById('history-tbody');
    const gameModeBadge = document.getElementById('game-mode-badge');
    const shareContainer = document.getElementById('p2p-share-container');
    const shareLinkInput = document.getElementById('share-link-input');

    // Player Elements
    const topBar = document.getElementById('top-player-bar');
    const bottomBar = document.getElementById('bottom-player-bar');
    const topName = document.getElementById('top-player-name');
    const bottomName = document.getElementById('bottom-player-name');
    const topClock = document.getElementById('top-player-clock');
    const bottomClock = document.getElementById('bottom-player-clock');
    const topCapturedEl = document.getElementById('top-captured-pieces');
    const bottomCapturedEl = document.getElementById('bottom-captured-pieces');
    const topAvatar = document.getElementById('top-player-avatar');
    const bottomAvatar = document.getElementById('bottom-player-avatar');

    // Modals
    const modalLobby = document.getElementById('modal-lobby');
    const modalWaiting = document.getElementById('modal-waiting');
    const modalPromotion = document.getElementById('modal-promotion');
    const modalGameOver = document.getElementById('modal-gameover');
    const promoChoicesEl = document.getElementById('promotion-choices');

    const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

    /* ==========================================================================
       Initialization
       ========================================================================== */
    function init() {
        try {
            chess = new Chess();
        } catch (err) {
            console.error('Failed to create Chess instance', err);
            showToast('Ошибка загрузки шахматного движка!');
            return;
        }

        bindEvents();
        setupP2PListeners();

        // Check if user opened page via an invite link: ?game=XYZ or ?room=XYZ
        const urlParams = new URLSearchParams(window.location.search);
        const joinRoom = urlParams.get('game') || urlParams.get('room');

        if (joinRoom) {
            console.log('[App] Auto-joining room from URL:', joinRoom);
            prepareP2PJoin(joinRoom);
        } else {
            // Default: offline game with AI
            startNewGame('ai', 600000, 0, 'w', 'medium');
        }
    }

    function bindEvents() {
        document.getElementById('btn-new-game').addEventListener('click', () => {
            modalLobby.classList.add('active');
        });

        document.getElementById('modal-lobby-close').addEventListener('click', () => {
            modalLobby.classList.remove('active');
        });

        document.getElementById('modal-waiting-close').addEventListener('click', () => {
            modalWaiting.classList.remove('active');
        });

        document.getElementById('select-game-mode').addEventListener('change', (e) => {
            const val = e.target.value;
            const groupTime = document.getElementById('group-time-control');
            const groupColor = document.getElementById('group-color-choice');
            const groupRoom = document.getElementById('group-room-id');
            const groupAi = document.getElementById('group-ai-difficulty');

            groupAi.style.display = (val === 'ai') ? 'flex' : 'none';
            groupRoom.style.display = (val === 'p2p-join') ? 'flex' : 'none';
            groupTime.style.display = (val === 'p2p-join') ? 'none' : 'flex';
            groupColor.style.display = (val === 'p2p-join') ? 'none' : 'flex';
        });

        document.getElementById('btn-start-game-confirm').addEventListener('click', handleLobbySubmit);

        document.getElementById('btn-toggle-sound').addEventListener('click', (e) => {
            const enabled = window.chessAudio.toggle();
            e.target.textContent = enabled ? '🔊 Звук' : '🔇 Звук';
            showToast(enabled ? 'Звук включен' : 'Звук выключен');
        });

        document.getElementById('btn-flip-board').addEventListener('click', () => {
            isFlipped = !isFlipped;
            renderBoard();
            updatePlayerBars();
        });

        document.getElementById('btn-copy-link').addEventListener('click', copyShareLink);
        document.getElementById('btn-modal-copy-link').addEventListener('click', copyShareLink);

        document.getElementById('btn-resign').addEventListener('click', handleResign);
        document.getElementById('btn-offer-draw').addEventListener('click', handleOfferDraw);

        document.getElementById('btn-gameover-rematch').addEventListener('click', () => {
            modalGameOver.classList.remove('active');
            if (gameMode.startsWith('p2p')) {
                window.chessP2P.send('rematch-offer');
                showToast('Предложение реванша отправлено сопернику');
            } else if (gameMode === 'ai') {
                startNewGame('ai', timeControl.baseMs, timeControl.incMs, myColor, aiDifficulty);
            } else {
                startNewGame('hotseat', timeControl.baseMs, timeControl.incMs, myColor);
            }
        });

        document.getElementById('btn-gameover-close').addEventListener('click', () => {
            modalGameOver.classList.remove('active');
        });
    }

    /* ==========================================================================
       Lobby & P2P Networking
       ========================================================================== */
    function handleLobbySubmit() {
        const mode = document.getElementById('select-game-mode').value;
        const timeVal = document.getElementById('select-time-control').value.split(',');
        const baseMs = parseInt(timeVal[0]) * 1000;
        const incMs = parseInt(timeVal[1]) * 1000;
        let colorChoice = document.getElementById('select-color-choice').value;
        const diffChoice = document.getElementById('select-ai-difficulty').value;

        if (colorChoice === 'random') {
            colorChoice = Math.random() < 0.5 ? 'w' : 'b';
        }

        modalLobby.classList.remove('active');

        if (mode === 'ai') {
            window.chessP2P.disconnect();
            startNewGame('ai', baseMs, incMs, colorChoice, diffChoice);
            const sideName = colorChoice === 'w' ? 'белыми' : 'черными';
            showToast(`Игра с ботом (${diffChoice}) началась. Вы играете ${sideName}!`);
        } else if (mode === 'hotseat') {
            window.chessP2P.disconnect();
            startNewGame('hotseat', baseMs, incMs, colorChoice);
            showToast('Начата локальная партия на одном экране');
        } else if (mode === 'p2p-create') {
            createOnlineGame(baseMs, incMs, colorChoice);
        } else if (mode === 'p2p-join') {
            const rawRoom = document.getElementById('input-room-id').value.trim();
            if (!rawRoom) {
                showToast('Введите код комнаты или ссылку');
                return;
            }
            prepareP2PJoin(rawRoom);
        }
    }

    function createOnlineGame(baseMs, incMs, colorChoice) {
        window.chessP2P.disconnect();
        clearInterval(clockTimer);

        // Switch mode to host immediately so bot NEVER triggers
        gameMode = 'p2p-host';
        myColor = colorChoice;
        timeControl = { baseMs, incMs };
        isAiThinking = false;
        isGameOver = false;

        // Reset board for upcoming game
        chess = new Chess();
        selectedSquare = null;
        validMoves = [];
        isFlipped = (myColor === 'b');
        renderBoard();
        updateGameBadges();
        updatePlayerBars();

        statusBanner.className = 'status-banner';
        statusText.textContent = '⏳ Создание онлайн-комнаты...';

        window.chessP2P.initHost(null, (roomId) => {
            const shareUrl = `${window.location.origin}${window.location.pathname}?game=${roomId}`;
            document.getElementById('modal-share-link').value = shareUrl;
            shareLinkInput.value = shareUrl;
            shareContainer.style.display = 'block';
            modalWaiting.classList.add('active');

            statusBanner.className = 'status-banner';
            statusText.textContent = `⏳ Ожидание соперника (код: ${roomId})`;
            showToast(`Комната создана! Отправьте ссылку другу.`);
        });
    }

    function prepareP2PJoin(rawRoomInput) {
        window.chessP2P.disconnect();
        clearInterval(clockTimer);

        // Parse ID from URL or text
        let roomId = rawRoomInput.trim();
        if (roomId.includes('game=')) {
            try {
                roomId = new URL(roomId).searchParams.get('game');
            } catch (e) {
                roomId = roomId.split('game=')[1].split('&')[0];
            }
        } else if (roomId.includes('room=')) {
            try {
                roomId = new URL(roomId).searchParams.get('room');
            } catch (e) {
                roomId = roomId.split('room=')[1].split('&')[0];
            }
        }

        roomId = roomId.trim().toLowerCase();
        if (!roomId.startsWith('gem-')) {
            roomId = `gem-${roomId}`;
        }

        // Set state to connecting P2P guest - bot MUST NOT run!
        gameMode = 'connecting';
        isAiThinking = false;
        isGameOver = false;
        chess = new Chess();
        selectedSquare = null;
        validMoves = [];
        renderBoard();

        gameModeBadge.textContent = '🌐 Подключение...';
        gameModeBadge.style.background = '#eab308';
        statusBanner.className = 'status-banner';
        statusText.textContent = `🔄 Подключение к комнате ${roomId}...`;
        topName.textContent = 'Соперник (Ожидание)';
        bottomName.textContent = 'Вы (Подключение)';

        showToast(`Подключение к комнате ${roomId}...`);
        window.chessP2P.connectToHost(roomId);
    }

    function setupP2PListeners() {
        // When WebRTC connection is opened
        window.chessP2P.on('connected', ({ isHost }) => {
            console.log('[App] P2P Connected callback! isHost =', isHost);
            modalWaiting.classList.remove('active');
            window.chessAudio.playNotify();

            if (isHost) {
                // Host determines guest color
                const guestColor = (myColor === 'w') ? 'b' : 'w';
                console.log('[App] Host sending game-init to guest. guestColor =', guestColor);

                const sendInit = () => {
                    window.chessP2P.send('game-init', {
                        guestColor: guestColor,
                        baseMs: timeControl.baseMs,
                        incMs: timeControl.incMs
                    });
                };

                sendInit();
                // Send twice with slight delay to guarantee delivery across initial WebRTC handshake
                setTimeout(sendInit, 250);

                startNewGame('p2p-host', timeControl.baseMs, timeControl.incMs, myColor);
                showToast('Соперник подключился! Партия началась.');
            }
        });

        // Guest says hello
        window.chessP2P.on('msg:guest-join', () => {
            console.log('[App] Host received guest-join! Resending game-init...');
            const guestColor = (myColor === 'w') ? 'b' : 'w';
            window.chessP2P.send('game-init', {
                guestColor: guestColor,
                baseMs: timeControl.baseMs,
                incMs: timeControl.incMs
            });
        });

        // Guest receives configuration from host
        window.chessP2P.on('msg:game-init', (data) => {
            console.log('[App] Guest received game-init:', data);
            myColor = data.guestColor;
            timeControl = { baseMs: data.baseMs, incMs: data.incMs };

            startNewGame('p2p-guest', data.baseMs, data.incMs, myColor);
            window.chessAudio.playNotify();
            showToast(`Успешное подключение! Вы играете ${myColor === 'w' ? 'белыми' : 'черными'}.`);
        });

        // Move received over P2P
        window.chessP2P.on('msg:move', (data) => {
            console.log('[App] Received move from opponent:', data);
            const move = chess.move({
                from: data.from,
                to: data.to,
                promotion: data.promotion
            });

            if (move) {
                if (data.clocks) {
                    clocks = data.clocks;
                }
                handleMoveSound(move);
                onMoveComplete(move);
            } else if (data.fen) {
                // Fallback sync if discrepancy
                console.warn('[App] Move failed locally, syncing FEN:', data.fen);
                chess.load(data.fen);
                renderBoard();
                updateStatus();
            }
        });

        window.chessP2P.on('msg:resign', () => {
            const winner = myColor === 'w' ? 'Белые' : 'Черные';
            endGame(`Соперник сдался. Победили ${winner}!`, 'Сдача соперника');
        });

        window.chessP2P.on('msg:offer-draw', () => {
            if (confirm('Соперник предлагает ничью. Согласиться?')) {
                window.chessP2P.send('accept-draw');
                endGame('Партия завершилась вничью по соглашению сторон.', 'Ничья');
            } else {
                window.chessP2P.send('decline-draw');
                showToast('Вы отклонили предложение ничьей.');
            }
        });

        window.chessP2P.on('msg:accept-draw', () => {
            endGame('Соперник согласился на ничью.', 'Ничья по соглашению');
        });

        window.chessP2P.on('msg:decline-draw', () => {
            showToast('Соперник отклонил предложение ничьей.');
        });

        window.chessP2P.on('msg:rematch-offer', () => {
            if (confirm('Соперник предлагает реванш. Начать новую партию со сменой цветов?')) {
                myColor = (myColor === 'w') ? 'b' : 'w';
                window.chessP2P.send('rematch-accept', { myNewColor: myColor });
                startNewGame(gameMode, timeControl.baseMs, timeControl.incMs, myColor);
            }
        });

        window.chessP2P.on('msg:rematch-accept', (data) => {
            myColor = (data.myNewColor === 'w') ? 'b' : 'w';
            startNewGame(gameMode, timeControl.baseMs, timeControl.incMs, myColor);
            showToast('Реванш принят! Новая партия началась.');
        });

        window.chessP2P.on('disconnected', () => {
            if (!isGameOver && gameMode.startsWith('p2p')) {
                showToast('Соперник отключился от игры.');
                statusBanner.className = 'status-banner alert-check';
                statusText.textContent = 'Соперник отключился от партии';
            }
        });

        window.chessP2P.on('error', (err) => {
            console.error('[App] P2P Error:', err);
            showToast(err);
            if (gameMode === 'connecting') {
                statusBanner.className = 'status-banner alert-check';
                statusText.textContent = 'Ошибка подключения к комнате';
            }
        });
    }

    /* ==========================================================================
       Game Flow & Board Logic
       ========================================================================== */
    function startNewGame(mode, baseMs, incMs, playerColor = 'w', difficulty = 'medium') {
        console.log(`[App] startNewGame: mode=${mode}, color=${playerColor}, time=${baseMs}`);
        chess = new Chess();
        selectedSquare = null;
        validMoves = [];
        isGameOver = false;
        isAiThinking = false;
        gameMode = mode;
        myColor = playerColor;
        aiDifficulty = difficulty;
        isFlipped = (myColor === 'b');

        timeControl = { baseMs, incMs };
        clocks = { w: baseMs, b: baseMs };
        clearInterval(clockTimer);
        lastClockTick = null;

        updateGameBadges();
        updatePlayerBars();
        renderBoard();
        updateStatus();
        renderHistory();
        renderCaptured();

        if (baseMs > 0) {
            startClock();
        } else {
            topClock.textContent = '∞';
            bottomClock.textContent = '∞';
        }

        // If playing against AI and player is Black, AI makes first move as White
        if (gameMode === 'ai' && myColor === 'b') {
            triggerAiMove();
        }
    }

    function updateGameBadges() {
        if (gameMode === 'ai') {
            const diffNames = { easy: '🟢 Лёгкий бот', medium: '🟡 Средний бот', hard: '🔴 Сложный бот' };
            gameModeBadge.textContent = diffNames[aiDifficulty] || '🤖 Бот';
            gameModeBadge.style.background = '#8b5cf6';
            shareContainer.style.display = 'none';
        } else if (gameMode === 'hotseat') {
            gameModeBadge.textContent = '👥 Hotseat';
            gameModeBadge.style.background = '#64748b';
            shareContainer.style.display = 'none';
        } else if (gameMode === 'connecting') {
            gameModeBadge.textContent = '🌐 Подключение...';
            gameModeBadge.style.background = '#eab308';
            shareContainer.style.display = 'none';
        } else {
            gameModeBadge.textContent = '🌐 P2P Онлайн';
            gameModeBadge.style.background = '#3b82f6';
            shareContainer.style.display = 'block';
        }
    }

    function updatePlayerBars() {
        const isWhiteAtBottom = !isFlipped;

        if (gameMode === 'ai') {
            const diffNames = { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный' };
            if (myColor === 'w') {
                bottomName.textContent = 'Вы (Белые)';
                topName.textContent = `Бот [${diffNames[aiDifficulty]}] (Черные)`;
                bottomAvatar.textContent = '♔';
                topAvatar.textContent = '🤖';
            } else {
                bottomName.textContent = 'Вы (Черные)';
                topName.textContent = `Бот [${diffNames[aiDifficulty]}] (Белые)`;
                bottomAvatar.textContent = '♚';
                topAvatar.textContent = '🤖';
            }
        } else if (gameMode === 'hotseat') {
            bottomName.textContent = isWhiteAtBottom ? 'Белые' : 'Черные';
            topName.textContent = isWhiteAtBottom ? 'Черные' : 'Белые';
            bottomAvatar.textContent = isWhiteAtBottom ? '♔' : '♚';
            topAvatar.textContent = isWhiteAtBottom ? '♚' : '♔';
        } else if (gameMode === 'connecting') {
            bottomName.textContent = 'Вы';
            topName.textContent = 'Соперник (Подключение...)';
            bottomAvatar.textContent = '♟';
            topAvatar.textContent = '⏳';
        } else {
            // Online P2P
            if (myColor === 'w') {
                bottomName.textContent = 'Вы (Белые)';
                topName.textContent = 'Соперник (Черные)';
                bottomAvatar.textContent = '♔';
                topAvatar.textContent = '♚';
            } else {
                bottomName.textContent = 'Вы (Черные)';
                topName.textContent = 'Соперник (Белые)';
                bottomAvatar.textContent = '♚';
                topAvatar.textContent = '♔';
            }
        }
        updateClockDisplay();
    }

    function renderBoard() {
        boardEl.innerHTML = '';
        const board = chess.board();
        const ranks = isFlipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
        const files = isFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
        const fileLetters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

        const inCheckKingSquare = chess.in_check() ? findKingSquare(chess.turn()) : null;
        const history = chess.history({ verbose: true });
        const lastMove = history.length > 0 ? history[history.length - 1] : null;

        for (let r of ranks) {
            for (let f of files) {
                const sqName = `${fileLetters[f]}${r + 1}`;
                const sqEl = document.createElement('div');
                const isLight = (r + f) % 2 !== 0;
                sqEl.className = `square ${isLight ? 'light' : 'dark'}`;
                sqEl.dataset.square = sqName;

                if (lastMove && (lastMove.from === sqName || lastMove.to === sqName)) {
                    sqEl.classList.add('last-move');
                }

                if (selectedSquare === sqName) {
                    sqEl.classList.add('selected');
                }

                if (inCheckKingSquare === sqName) {
                    sqEl.classList.add('in-check');
                }

                // Coordinates indicators
                if ((!isFlipped && f === 0) || (isFlipped && f === 7)) {
                    const rankCoord = document.createElement('span');
                    rankCoord.className = 'coord coord-rank';
                    rankCoord.textContent = r + 1;
                    sqEl.appendChild(rankCoord);
                }
                if ((!isFlipped && r === 0) || (isFlipped && r === 7)) {
                    const fileCoord = document.createElement('span');
                    fileCoord.className = 'coord coord-file';
                    fileCoord.textContent = fileLetters[f];
                    sqEl.appendChild(fileCoord);
                }

                // Piece
                const piece = board[7 - r][f];
                if (piece) {
                    const pieceEl = document.createElement('div');
                    pieceEl.className = 'piece';
                    pieceEl.style.backgroundImage = `url('assets/pieces/${piece.color}${piece.type.toUpperCase()}.svg')`;
                    pieceEl.draggable = isMyTurn() && canControlPiece(piece.color);
                    pieceEl.dataset.square = sqName;

                    pieceEl.addEventListener('dragstart', handleDragStart);
                    sqEl.appendChild(pieceEl);
                }

                // Move hints
                const moveHint = validMoves.find(m => m.to === sqName);
                if (moveHint) {
                    const hintEl = document.createElement('div');
                    if (moveHint.captured || moveHint.flags.includes('e')) {
                        hintEl.className = 'hint-capture';
                    } else {
                        hintEl.className = 'hint-dot';
                    }
                    sqEl.appendChild(hintEl);
                }

                sqEl.addEventListener('click', () => handleSquareClick(sqName));
                sqEl.addEventListener('dragover', (e) => e.preventDefault());
                sqEl.addEventListener('drop', handleDrop);

                boardEl.appendChild(sqEl);
            }
        }
    }

    function canControlPiece(pieceColor) {
        if (gameMode === 'connecting') return false;
        if (gameMode === 'hotseat') return true;
        if (gameMode === 'ai') return pieceColor === myColor && !isAiThinking;
        return pieceColor === myColor; // Online P2P
    }

    function isMyTurn() {
        if (isGameOver || isAiThinking || gameMode === 'connecting') return false;
        if (gameMode === 'hotseat') return true;
        return chess.turn() === myColor;
    }

    function findKingSquare(color) {
        const board = chess.board();
        const fileLetters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const p = board[r][f];
                if (p && p.type === 'k' && p.color === color) {
                    return `${fileLetters[f]}${8 - r}`;
                }
            }
        }
        return null;
    }

    /* ==========================================================================
       User Interactions
       ========================================================================== */
    function handleSquareClick(square) {
        if (isGameOver || isAiThinking || gameMode === 'connecting') return;

        if (selectedSquare) {
            const move = validMoves.find(m => m.to === square);
            if (move) {
                attemptMove(selectedSquare, square);
                return;
            }
        }

        const piece = chess.get(square);
        if (piece && isMyTurn() && canControlPiece(piece.color) && piece.color === chess.turn()) {
            selectedSquare = square;
            validMoves = chess.moves({ square, verbose: true });
        } else {
            selectedSquare = null;
            validMoves = [];
        }
        renderBoard();
    }

    function handleDragStart(e) {
        if (isGameOver || !isMyTurn()) {
            e.preventDefault();
            return;
        }
        const square = e.target.dataset.square;
        const piece = chess.get(square);
        if (!piece || piece.color !== chess.turn() || !canControlPiece(piece.color)) {
            e.preventDefault();
            return;
        }

        selectedSquare = square;
        validMoves = chess.moves({ square, verbose: true });
        renderBoard();
        e.dataTransfer.setData('text/plain', square);
    }

    function handleDrop(e) {
        e.preventDefault();
        const targetSquare = e.currentTarget.dataset.square;
        if (selectedSquare && targetSquare) {
            const move = validMoves.find(m => m.to === targetSquare);
            if (move) {
                attemptMove(selectedSquare, targetSquare);
            }
        }
    }

    /* ==========================================================================
       Move Execution & AI Bot
       ========================================================================== */
    function attemptMove(from, to) {
        const piece = chess.get(from);
        if (!piece) return;

        const isPromotion = piece.type === 'p' && ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'));

        if (isPromotion) {
            showPromotionModal(piece.color, (promoPiece) => {
                executeMove(from, to, promoPiece);
            });
            return;
        }

        executeMove(from, to, null);
    }

    function showPromotionModal(color, callback) {
        pendingPromotion = callback;
        promoChoicesEl.innerHTML = '';
        const choices = ['q', 'r', 'b', 'n'];

        choices.forEach(ch => {
            const btn = document.createElement('button');
            btn.className = 'promo-piece-btn';
            const img = document.createElement('img');
            img.src = `assets/pieces/${color}${ch.toUpperCase()}.svg`;
            btn.appendChild(img);

            btn.addEventListener('click', () => {
                modalPromotion.classList.remove('active');
                if (pendingPromotion) {
                    const cb = pendingPromotion;
                    pendingPromotion = null;
                    cb(ch);
                }
            });
            promoChoicesEl.appendChild(btn);
        });

        modalPromotion.classList.add('active');
    }

    function executeMove(from, to, promotion = null) {
        const moveObj = { from, to };
        if (promotion) moveObj.promotion = promotion;

        const move = chess.move(moveObj);
        if (!move) return;

        selectedSquare = null;
        validMoves = [];

        // Apply increment
        if (timeControl.baseMs > 0) {
            const prevPlayer = move.color;
            clocks[prevPlayer] += timeControl.incMs;
        }

        handleMoveSound(move);

        // Send move over P2P
        if (gameMode.startsWith('p2p')) {
            window.chessP2P.send('move', {
                from: move.from,
                to: move.to,
                promotion: move.promotion,
                clocks: clocks,
                fen: chess.fen()
            });
        }

        onMoveComplete(move);

        // Check if AI turn next (ONLY in AI mode!)
        if (gameMode === 'ai' && !isGameOver && chess.turn() !== myColor) {
            triggerAiMove();
        }
    }

    function triggerAiMove() {
        if (gameMode !== 'ai') return;
        isAiThinking = true;
        statusBanner.className = 'status-banner';
        statusText.textContent = 'Бот рассчитывает ход... 🤔';

        const delay = Math.floor(Math.random() * 350) + 350;
        setTimeout(() => {
            if (isGameOver || gameMode !== 'ai') {
                isAiThinking = false;
                return;
            }

            const bestMove = window.chessAI.getBestMove(chess, aiDifficulty);
            isAiThinking = false;

            if (bestMove) {
                const move = chess.move({
                    from: bestMove.from,
                    to: bestMove.to,
                    promotion: bestMove.promotion || 'q'
                });

                if (move) {
                    if (timeControl.baseMs > 0) {
                        clocks[move.color] += timeControl.incMs;
                    }
                    handleMoveSound(move);
                    onMoveComplete(move);
                }
            }
        }, delay);
    }

    function handleMoveSound(move) {
        if (chess.in_checkmate() || chess.in_draw()) {
            window.chessAudio.playGameOver(!chess.in_checkmate() || (gameMode !== 'hotseat' && chess.turn() !== myColor));
        } else if (chess.in_check()) {
            window.chessAudio.playCheck();
        } else if (move.flags.includes('k') || move.flags.includes('q')) {
            window.chessAudio.playCastle();
        } else if (move.captured) {
            window.chessAudio.playCapture();
        } else {
            window.chessAudio.playMove();
        }
    }

    function onMoveComplete(move) {
        renderBoard();
        updateStatus();
        renderHistory();
        renderCaptured();
        updatePlayerHighlight();
    }

    /* ==========================================================================
       Status, History & Captured Pieces
       ========================================================================== */
    function updateStatus() {
        const turn = chess.turn();
        const turnName = turn === 'w' ? 'белых' : 'черных';
        statusIcon.textContent = turn === 'w' ? '⚪' : '⚫';

        if (chess.in_checkmate()) {
            const winner = turn === 'w' ? 'Черные' : 'Белые';
            endGame(`Мат! Победили ${winner}.`, 'Мат');
            return;
        }

        if (chess.in_draw()) {
            let reason = 'Ничья';
            if (chess.in_stalemate()) reason = 'Пат (нет легальных ходов)';
            else if (chess.in_threefold_repetition()) reason = 'Троекратное повторение позиции';
            else if (chess.insufficient_material()) reason = 'Недостаточность материала';
            endGame(`Партия завершена. ${reason}.`, 'Ничья');
            return;
        }

        if (chess.in_check()) {
            statusBanner.className = 'status-banner alert-check';
            statusText.textContent = `Шах королю ${turnName}!`;
        } else {
            statusBanner.className = 'status-banner';
            statusText.textContent = `Ход ${turnName}`;
        }
    }

    function renderHistory() {
        const history = chess.history();
        movesCountEl.textContent = `${history.length} ${getNoun(history.length, 'ход', 'хода', 'ходов')}`;

        historyTbody.innerHTML = '';
        for (let i = 0; i < history.length; i += 2) {
            const tr = document.createElement('tr');
            const numTd = document.createElement('td');
            numTd.className = 'history-num';
            numTd.textContent = `${Math.floor(i / 2) + 1}.`;

            const whiteTd = document.createElement('td');
            whiteTd.className = 'history-move';
            whiteTd.textContent = history[i];

            const blackTd = document.createElement('td');
            blackTd.className = 'history-move';
            blackTd.textContent = history[i + 1] || '';

            tr.appendChild(numTd);
            tr.appendChild(whiteTd);
            tr.appendChild(blackTd);
            historyTbody.appendChild(tr);
        }

        const container = document.getElementById('history-container');
        container.scrollTop = container.scrollHeight;
    }

    function renderCaptured() {
        const board = chess.board();
        const activePieces = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };

        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const p = board[r][f];
                if (p && p.type !== 'k') {
                    activePieces[p.color][p.type]++;
                }
            }
        }

        const startPieces = { p: 8, n: 2, b: 2, r: 2, q: 1 };
        const capturedByWhite = [];
        const capturedByBlack = [];

        let whiteMaterial = 0;
        let blackMaterial = 0;

        ['q', 'r', 'b', 'n', 'p'].forEach(type => {
            const whiteLost = startPieces[type] - activePieces['w'][type];
            for (let i = 0; i < whiteLost; i++) capturedByBlack.push({ color: 'w', type });

            const blackLost = startPieces[type] - activePieces['b'][type];
            for (let i = 0; i < blackLost; i++) capturedByWhite.push({ color: 'b', type });

            whiteMaterial += activePieces['w'][type] * PIECE_VALUES[type];
            blackMaterial += activePieces['b'][type] * PIECE_VALUES[type];
        });

        const isWhiteAtBottom = !isFlipped;
        const bottomCaptured = isWhiteAtBottom ? capturedByWhite : capturedByBlack;
        const topCaptured = isWhiteAtBottom ? capturedByBlack : capturedByWhite;

        const bottomMatDiff = isWhiteAtBottom ? (whiteMaterial - blackMaterial) : (blackMaterial - whiteMaterial);
        const topMatDiff = -bottomMatDiff;

        fillCapturedContainer(bottomCapturedEl, bottomCaptured, bottomMatDiff);
        fillCapturedContainer(topCapturedEl, topCaptured, topMatDiff);
    }

    function fillCapturedContainer(container, pieces, diff) {
        container.innerHTML = '';
        pieces.forEach(p => {
            const img = document.createElement('img');
            img.className = 'captured-piece-icon';
            img.src = `assets/pieces/${p.color}${p.type.toUpperCase()}.svg`;
            container.appendChild(img);
        });

        if (diff > 0) {
            const badge = document.createElement('span');
            badge.className = 'material-diff';
            badge.textContent = `+${diff}`;
            container.appendChild(badge);
        }
    }

    function updatePlayerHighlight() {
        const turn = chess.turn();
        const isWhiteAtBottom = !isFlipped;
        const isBottomTurn = (isWhiteAtBottom && turn === 'w') || (!isWhiteAtBottom && turn === 'b');

        bottomBar.classList.toggle('active', isBottomTurn);
        topBar.classList.toggle('active', !isBottomTurn);
    }

    /* ==========================================================================
       Clocks & Timers
       ========================================================================== */
    function startClock() {
        clearInterval(clockTimer);
        lastClockTick = Date.now();

        clockTimer = setInterval(() => {
            if (isGameOver || gameMode === 'connecting') {
                clearInterval(clockTimer);
                return;
            }

            const now = Date.now();
            const delta = now - lastClockTick;
            lastClockTick = now;

            if (chess.history().length === 0) return;

            const turn = chess.turn();
            clocks[turn] -= delta;

            if (clocks[turn] <= 0) {
                clocks[turn] = 0;
                clearInterval(clockTimer);
                updateClockDisplay();
                const loser = turn === 'w' ? 'Белых' : 'Черных';
                const winner = turn === 'w' ? 'Черные' : 'Белые';
                window.chessAudio.playGameOver(gameMode !== 'hotseat' && turn !== myColor);
                endGame(`Время у ${loser} вышло! Победили ${winner}.`, 'Флаг (таймаут)');
                return;
            }

            updateClockDisplay();
        }, 100);
    }

    function updateClockDisplay() {
        if (timeControl.baseMs === 0) return;

        const isWhiteAtBottom = !isFlipped;
        const bottomTime = isWhiteAtBottom ? clocks.w : clocks.b;
        const topTime = isWhiteAtBottom ? clocks.b : clocks.w;

        bottomClock.textContent = formatTime(bottomTime);
        topClock.textContent = formatTime(topTime);

        bottomClock.classList.toggle('low-time', bottomTime < 30000 && bottomTime > 0);
        topClock.classList.toggle('low-time', topTime < 30000 && topTime > 0);
    }

    function formatTime(ms) {
        const totalSec = Math.max(0, Math.floor(ms / 1000));
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    /* ==========================================================================
       Game Over & Actions
       ========================================================================== */
    function endGame(detail, reason) {
        isGameOver = true;
        clearInterval(clockTimer);

        statusBanner.className = 'status-banner alert-gameover';
        statusText.textContent = reason;

        document.getElementById('gameover-title').textContent = reason;
        document.getElementById('gameover-reason').textContent = detail;
        document.getElementById('gameover-detail').textContent = `Сделано ходов: ${chess.history().length}`;

        modalGameOver.classList.add('active');
    }

    function handleResign() {
        if (isGameOver || gameMode === 'connecting') return;
        if (!confirm('Вы действительно хотите сдаться?')) return;

        if (gameMode.startsWith('p2p')) {
            window.chessP2P.send('resign');
            const winner = myColor === 'w' ? 'Черные' : 'Белые';
            endGame(`Вы сдались. Победили ${winner}!`, 'Сдача');
        } else if (gameMode === 'ai') {
            const winner = myColor === 'w' ? 'Черные (Бот)' : 'Белые (Бот)';
            endGame(`Вы сдались. Победил ${winner}!`, 'Сдача');
        } else {
            const turn = chess.turn();
            const winner = turn === 'w' ? 'Черные' : 'Белые';
            endGame(`Победили ${winner} ввиду сдачи соперника.`, 'Сдача');
        }
    }

    function handleOfferDraw() {
        if (isGameOver || gameMode === 'connecting') return;
        if (gameMode.startsWith('p2p')) {
            window.chessP2P.send('offer-draw');
            showToast('Предложение ничьей отправлено сопернику...');
        } else if (gameMode === 'ai') {
            const evalScore = window.chessAI.evaluateBoard(chess);
            const isAiLosing = (myColor === 'w' && evalScore > 300) || (myColor === 'b' && evalScore < -300);
            if (isAiLosing || Math.abs(evalScore) < 150) {
                endGame('Бот принял ваше предложение ничьей.', 'Ничья');
            } else {
                showToast('Бот отклонил предложение ничьей (позиция в его пользу).');
            }
        } else {
            if (confirm('Оба игрока согласны на ничью?')) {
                endGame('Партия завершилась вничью по соглашению сторон.', 'Ничья');
            }
        }
    }

    function copyShareLink() {
        const url = shareLinkInput.value || document.getElementById('modal-share-link').value;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => {
                showToast('Ссылка скопирована в буфер обмена!');
            }).catch(() => {
                showToast('Не удалось скопировать ссылку.');
            });
        }
    }

    function showToast(message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    function getNoun(number, one, two, five) {
        let n = Math.abs(number);
        n %= 100;
        if (n >= 5 && n <= 20) return five;
        n %= 10;
        if (n === 1) return one;
        if (n >= 2 && n <= 4) return two;
        return five;
    }

    window.addEventListener('DOMContentLoaded', init);
})();
