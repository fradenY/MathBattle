const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {};

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'math_multiplayer.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

function generateProblem(settings) {
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const types = [];
  if (settings.add) types.push(() => {
    const left = rand(settings.add_left_min, settings.add_left_max);
    const right = rand(settings.add_right_min, settings.add_right_max);
    return { text: `${left} + ${right}`, answer: left + right };
  });
  if (settings.sub) types.push(() => {
    const left = rand(settings.add_left_min, settings.add_left_max);
    const right = rand(settings.add_right_min, settings.add_right_max);
    return { text: `${left + right} - ${left}`, answer: right };
  });
  if (settings.mul) types.push(() => {
    const left = rand(settings.mul_left_min, settings.mul_left_max);
    const right = rand(settings.mul_right_min, settings.mul_right_max);
    return { text: `${left} × ${right}`, answer: left * right };
  });
  if (settings.div) types.push(() => {
    const left = rand(settings.mul_left_min, settings.mul_left_max);
    const right = rand(settings.mul_right_min, settings.mul_right_max);
    return left !== 0 ? { text: `${left * right} ÷ ${left}`, answer: right } : null;
  });

  let problem;
  while (!problem) problem = types[Math.floor(Math.random() * types.length)]();
  return problem;
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('joinRoom', ({ roomId, settings }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = { 
        players: [], 
        settings: settings,
        gameState: { started: false, scores: {}, currentProblem: null, durationLeft: settings.duration || 120, timerId: null }
      };
    }
    const playerIndex = rooms[roomId].players.length + 1;
    const tempNickname = `Player ${playerIndex}`;
    rooms[roomId].players.push({ id: socket.id, nickname: tempNickname, ready: false });
    rooms[roomId].gameState.scores[tempNickname] = 0;
    socket.join(roomId);

    console.log(`User ${socket.id} joined room ${roomId} as ${tempNickname}`);
    io.to(roomId).emit('updatePlayers', rooms[roomId].players);
  });

  socket.on('playerReady', ({ roomId, nickname }) => {
    if (!rooms[roomId]) return;
    const player = rooms[roomId].players.find(p => p.id === socket.id);
    if (player) {
      const oldNickname = player.nickname;
      player.nickname = nickname;
      player.ready = true;
      rooms[roomId].gameState.scores[nickname] = rooms[roomId].gameState.scores[oldNickname] || 0;
      delete rooms[roomId].gameState.scores[oldNickname];
    }

    console.log(`User ${socket.id} (${nickname}) is ready in room ${roomId}`);
    io.to(roomId).emit('updatePlayers', rooms[roomId].players);

    const allReady = rooms[roomId].players.every(p => p.ready);
    if (rooms[roomId].players.length >= 2 && allReady && !rooms[roomId].gameState.started) {
      console.log(`All players ready in room ${roomId}, starting countdown`);
      io.to(roomId).emit('startCountdown');
    }
  });

  socket.on('startGame', ({ roomId }) => {
    if (!rooms[roomId] || rooms[roomId].gameState.started) return;
    rooms[roomId].gameState.started = true;
    rooms[roomId].gameState.currentProblem = generateProblem(rooms[roomId].settings);

    console.log(`Game starting in room ${roomId}`);
    io.to(roomId).emit('gameStarted', { problem: rooms[roomId].gameState.currentProblem.text });

    const timer = setInterval(() => {
      if (!rooms[roomId] || !rooms[roomId].gameState) {
        clearInterval(timer); // Stop if room is gone
        return;
      }
      rooms[roomId].gameState.durationLeft--;
      io.to(roomId).emit('updateTime', rooms[roomId].gameState.durationLeft);
      if (rooms[roomId].gameState.durationLeft <= 0) {
        clearInterval(timer);
        const scores = rooms[roomId].gameState.scores;
        console.log('Final scores:', scores); // Debug log
        let winner;
        const scoreKeys = Object.keys(scores);
        const hasNonZeroScore = scoreKeys.some(key => scores[key] > 0);
        if (!hasNonZeroScore) {
          winner = "No winner"; // Fallback if all scores are 0 or no scores
        } else {
          winner = scoreKeys.reduce((a, b) => scores[a] > scores[b] ? a : b);
        }
        console.log('Winner determined:', winner); // Debug log
        io.to(roomId).emit('gameOver', { scores, winner });
        delete rooms[roomId];
      }
    }, 1000);
    rooms[roomId].gameState.timerId = timer; // Store timer ID
  });

  socket.on('submitAnswer', ({ roomId, answer }) => {
    if (rooms[roomId] && rooms[roomId].gameState.started) {
      const currentProblem = rooms[roomId].gameState.currentProblem;
      const player = rooms[roomId].players.find(p => p.id === socket.id);
      if (player && answer === currentProblem.answer) {
        rooms[roomId].gameState.scores[player.nickname] = (rooms[roomId].gameState.scores[player.nickname] || 0) + 1;
        rooms[roomId].gameState.currentProblem = generateProblem(rooms[roomId].settings);
        io.to(roomId).emit('updateProblem', rooms[roomId].gameState.currentProblem.text);
        io.to(roomId).emit('updateScore', rooms[roomId].gameState.scores);
      }
    }
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const disconnectedPlayer = room.players.find(p => p.id === socket.id);
      room.players = room.players.filter(p => p.id !== socket.id);
      if (disconnectedPlayer) delete room.gameState.scores[disconnectedPlayer.nickname];
      if (room.players.length === 0) {
        if (room.gameState.timerId) {
          clearInterval(room.gameState.timerId); // Clear timer if room is empty
        }
        delete rooms[roomId];
      } else {
        io.to(roomId).emit('updatePlayers', room.players);
        io.to(roomId).emit('playerLeft', room.players);
        io.to(roomId).emit('updateScore', room.gameState.scores);
      }
    }
    console.log('A user disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));