/**
 * Chess AI Engine with Easy, Medium, and Hard difficulties
 * Uses Minimax with Alpha-Beta Pruning & Piece-Square Tables
 */

class ChessAI {
    constructor() {
        // Standard piece values
        this.pieceValues = {
            p: 100,
            n: 320,
            b: 330,
            r: 500,
            q: 900,
            k: 20000
        };

        // Piece-Square Tables (White perspective, mirror for Black)
        this.pawnTable = [
            0,  0,  0,  0,  0,  0,  0,  0,
            50, 50, 50, 50, 50, 50, 50, 50,
            10, 10, 20, 30, 30, 20, 10, 10,
             5,  5, 10, 25, 25, 10,  5,  5,
             0,  0,  0, 20, 20,  0,  0,  0,
             5, -5,-10,  0,  0,-10, -5,  5,
             5, 10, 10,-20,-20, 10, 10,  5,
             0,  0,  0,  0,  0,  0,  0,  0
        ];

        this.knightTable = [
            -50,-40,-30,-30,-30,-30,-40,-50,
            -40,-20,  0,  0,  0,  0,-20,-40,
            -30,  0, 10, 15, 15, 10,  0,-30,
            -30,  5, 15, 20, 20, 15,  5,-30,
            -30,  0, 15, 20, 20, 15,  0,-30,
            -30,  5, 10, 15, 15, 10,  5,-30,
            -40,-20,  0,  5,  5,  0,-20,-40,
            -50,-40,-30,-30,-30,-30,-40,-50
        ];

        this.bishopTable = [
            -20,-10,-10,-10,-10,-10,-10,-20,
            -10,  0,  0,  0,  0,  0,  0,-10,
            -10,  0,  5, 10, 10,  5,  0,-10,
            -10,  5,  5, 10, 10,  5,  5,-10,
            -10,  0, 10, 10, 10, 10,  0,-10,
            -10, 10, 10, 10, 10, 10, 10,-10,
            -10,  5,  0,  0,  0,  0,  5,-10,
            -20,-10,-10,-10,-10,-10,-10,-20
        ];

        this.rookTable = [
              0,  0,  0,  0,  0,  0,  0,  0,
              5, 10, 10, 10, 10, 10, 10,  5,
             -5,  0,  0,  0,  0,  0,  0, -5,
             -5,  0,  0,  0,  0,  0,  0, -5,
             -5,  0,  0,  0,  0,  0,  0, -5,
             -5,  0,  0,  0,  0,  0,  0, -5,
             -5,  0,  0,  0,  0,  0,  0, -5,
              0,  0,  0,  5,  5,  0,  0,  0
        ];

        this.queenTable = [
            -20,-10,-10, -5, -5,-10,-10,-20,
            -10,  0,  0,  0,  0,  0,  0,-10,
            -10,  0,  5,  5,  5,  5,  0,-10,
             -5,  0,  5,  5,  5,  5,  0, -5,
              0,  0,  5,  5,  5,  5,  0, -5,
            -10,  5,  5,  5,  5,  5,  0,-10,
            -10,  0,  5,  0,  0,  0,  0,-10,
            -20,-10,-10, -5, -5,-10,-10,-20
        ];

        this.kingMiddleTable = [
            -30,-40,-40,-50,-50,-40,-40,-30,
            -30,-40,-40,-50,-50,-40,-40,-30,
            -30,-40,-40,-50,-50,-40,-40,-30,
            -30,-40,-40,-50,-50,-40,-40,-30,
            -20,-30,-30,-40,-40,-30,-30,-20,
            -10,-20,-20,-20,-20,-20,-20,-10,
             20, 20,  0,  0,  0,  0, 20, 20,
             20, 30, 10,  0,  0, 10, 30, 20
        ];
    }

    getPieceValue(piece, squareIndex) {
        if (!piece) return 0;
        const val = this.pieceValues[piece.type];
        let posVal = 0;
        const idx = piece.color === 'w' ? squareIndex : 63 - squareIndex;

        switch (piece.type) {
            case 'p': posVal = this.pawnTable[idx]; break;
            case 'n': posVal = this.knightTable[idx]; break;
            case 'b': posVal = this.bishopTable[idx]; break;
            case 'r': posVal = this.rookTable[idx]; break;
            case 'q': posVal = this.queenTable[idx]; break;
            case 'k': posVal = this.kingMiddleTable[idx]; break;
        }

        return (val + posVal) * (piece.color === 'w' ? 1 : -1);
    }

    evaluateBoard(chessInstance) {
        let total = 0;
        const board = chessInstance.board();
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const piece = board[r][f];
                if (piece) {
                    const sqIdx = r * 8 + f;
                    total += this.getPieceValue(piece, sqIdx);
                }
            }
        }
        return total;
    }

    /**
     * Choose best move based on difficulty
     */
    getBestMove(chessInstance, difficulty = 'medium') {
        const moves = chessInstance.moves({ verbose: true });
        if (moves.length === 0) return null;

        if (difficulty === 'easy') {
            return this.getEasyMove(chessInstance, moves);
        } else if (difficulty === 'hard') {
            return this.getMinimaxMove(chessInstance, 3);
        } else {
            // Medium
            return this.getMinimaxMove(chessInstance, 2);
        }
    }

    /**
     * Easy mode: 60% random, 40% simple capture/check greedy move
     */
    getEasyMove(chessInstance, moves) {
        if (Math.random() < 0.6) {
            return moves[Math.floor(Math.random() * moves.length)];
        }

        // Greedy: find move with best immediate capture
        let bestScore = -Infinity;
        let candidates = [];
        const isWhite = chessInstance.turn() === 'w';

        for (const m of moves) {
            chessInstance.move(m);
            const score = this.evaluateBoard(chessInstance) * (isWhite ? 1 : -1);
            chessInstance.undo();

            if (score > bestScore) {
                bestScore = score;
                candidates = [m];
            } else if (score === bestScore) {
                candidates.push(m);
            }
        }

        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    /**
     * Minimax with Alpha-Beta Pruning
     */
    getMinimaxMove(chessInstance, depth) {
        const isMaximizing = chessInstance.turn() === 'w';
        const moves = chessInstance.moves({ verbose: true });
        if (moves.length === 0) return null;

        // Move ordering: sort captures and promotions first for better pruning
        moves.sort((a, b) => {
            let scoreA = (a.captured ? this.pieceValues[a.captured] * 10 : 0) + (a.promotion ? 800 : 0);
            let scoreB = (b.captured ? this.pieceValues[b.captured] * 10 : 0) + (b.promotion ? 800 : 0);
            return scoreB - scoreA;
        });

        let bestMove = null;
        let bestVal = isMaximizing ? -Infinity : Infinity;

        for (const move of moves) {
            chessInstance.move(move);
            const val = this.minimax(chessInstance, depth - 1, -Infinity, Infinity, !isMaximizing);
            chessInstance.undo();

            if (isMaximizing) {
                if (val > bestVal) {
                    bestVal = val;
                    bestMove = move;
                }
            } else {
                if (val < bestVal) {
                    bestVal = val;
                    bestMove = move;
                }
            }
        }

        return bestMove || moves[0];
    }

    minimax(chessInstance, depth, alpha, beta, isMaximizing) {
        if (depth === 0 || chessInstance.game_over()) {
            if (chessInstance.in_checkmate()) {
                return isMaximizing ? -50000 : 50000;
            }
            if (chessInstance.in_draw()) {
                return 0;
            }
            return this.evaluateBoard(chessInstance);
        }

        const moves = chessInstance.moves({ verbose: true });
        if (moves.length === 0) {
            return this.evaluateBoard(chessInstance);
        }

        // Fast sort captures first
        moves.sort((a, b) => (b.captured ? 1 : 0) - (a.captured ? 1 : 0));

        if (isMaximizing) {
            let maxEval = -Infinity;
            for (const move of moves) {
                chessInstance.move(move);
                const evalVal = this.minimax(chessInstance, depth - 1, alpha, beta, false);
                chessInstance.undo();
                maxEval = Math.max(maxEval, evalVal);
                alpha = Math.max(alpha, evalVal);
                if (beta <= alpha) break; // Beta cutoff
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (const move of moves) {
                chessInstance.move(move);
                const evalVal = this.minimax(chessInstance, depth - 1, alpha, beta, true);
                chessInstance.undo();
                minEval = Math.min(minEval, evalVal);
                beta = Math.min(beta, evalVal);
                if (beta <= alpha) break; // Alpha cutoff
            }
            return minEval;
        }
    }
}

window.chessAI = new ChessAI();
