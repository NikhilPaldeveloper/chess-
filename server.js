const express = require('express');
const http = require('http');
const { Server } = require('socket.io');  // Updated import
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());  // Enable CORS

const server = http.createServer(app);
const io = new Server(server, {  // Updated initialization
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files (optional)
app.use(express.static('public'));

// In-memory storage
const games = new Map();
const users = new Map();
const waitingPlayers = new Set();

io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('login', (username) => {
        users.set(socket.id, { username });
        console.log(`User ${username} logged in`);
    });

    socket.on('createGame', (data) => {
        const gameId = uuidv4();
        const user = users.get(socket.id);

        if (data.type === 'random') {
            if (waitingPlayers.size > 0) {
                // Match with waiting player
                const opponent = waitingPlayers.values().next().value;
                waitingPlayers.delete(opponent);
                
                games.set(gameId, {
                    players: [socket.id, opponent],
                    moves: [],
                    status: 'active'
                });

                socket.join(gameId);
                io.to(opponent).emit('gameJoined', { gameId });
                socket.emit('gameJoined', { gameId });
            } else {
                // Add to waiting list
                waitingPlayers.add(socket.id);
                socket.emit('gameCreated', { gameId });
            }
        } else {
            games.set(gameId, {
                players: [socket.id],
                moves: [],
                status: 'waiting'
            });
            socket.join(gameId);
            socket.emit('gameCreated', { gameId });
        }
    });

    socket.on('joinGame', (data) => {
        const game = games.get(data.gameId);
        if (!game) {
            socket.emit('gameError', { message: 'Game not found' });
            return;
        }

        if (game.players.length >= 2) {
            socket.emit('gameError', { message: 'Game is full' });
            return;
        }

        game.players.push(socket.id);
        game.status = 'active';
        socket.join(data.gameId);
        io.to(data.gameId).emit('gameJoined', { gameId: data.gameId });
    });

    socket.on('move', (data) => {
        const game = games.get(data.gameId);
        if (game && game.status === 'active') {
            game.moves.push(data.move);
            socket.to(data.gameId).emit('moveMade', { move: data.move });
        }
    });

    socket.on('disconnect', () => {
        users.delete(socket.id);
        waitingPlayers.delete(socket.id);
        
        games.forEach((game, gameId) => {
            if (game.players.includes(socket.id)) {
                io.to(gameId).emit('gameError', { message: 'Opponent disconnected' });
                games.delete(gameId);
            }
        });
        console.log('Client disconnected');
    });
});

// Basic route for testing
app.get('/', (req, res) => {
    res.send('Chess Server is running');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});