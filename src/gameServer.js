const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
      origin: "*", // Altere isso conforme necessário para o ambiente de produção
      methods: ["GET", "POST"],
    },
  });

const queue = [];
const games = new Map();

io.on('connection', (socket) => {
  console.log('A user connected with ID:', socket.id);

  socket.on('joinQueue', (data) => {
    console.log('User joined queue:', socket.id, 'with bet:', data.bet);
    queue.push({ id: socket.id, bet: data.bet });
    console.log('Current queue:', queue);
    if (queue.length >= 2) {
      const player1 = queue.shift();
      const player2 = queue.shift();
      console.log('Starting game with players:', player1.id, player2.id);
      startGame(player1, player2);
    }
  });

  socket.on('leaveQueue', () => {
    const index = queue.findIndex(player => player.id === socket.id);
    if (index !== -1) {
      queue.splice(index, 1);
    }
  });

  socket.on('selectCell', (data) => {
    const game = games.get(socket.id);
    if (game && game.currentPlayer === socket.id) {
      const { row, col } = data;
      if (!game.revealedCells[row][col]) {
        game.revealedCells[row][col] = true;
        if (game.grid[row][col]) {
          // Hit a mine
          game.gameOver = true;
          game.winner = game.players.find(id => id !== socket.id);
          io.to(game.players[0]).to(game.players[1]).emit('updateGame', {
            revealedCells: game.revealedCells,
            currentPlayer: game.currentPlayer,
            gameOver: game.gameOver,
            winner: game.winner,
            lastRevealedCell: { row, col, isMine: true }
          });
        } else {
          // Switch turns
          game.currentPlayer = game.players.find(id => id !== socket.id);
          io.to(game.players[0]).to(game.players[1]).emit('updateGame', {
            revealedCells: game.revealedCells,
            currentPlayer: game.currentPlayer,
            gameOver: game.gameOver,
            winner: game.winner,
            lastRevealedCell: { row, col, isMine: false }
          });
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
    // Remove the player from the queue if they're in it
    const queueIndex = queue.findIndex(player => player.id === socket.id);
    if (queueIndex !== -1) {
      queue.splice(queueIndex, 1);
    }
    
    // End the game if the disconnected player was in one
    for (const [gameId, game] of games.entries()) {
      if (game.players.includes(socket.id)) {
        const winner = game.players.find(id => id !== socket.id);
        io.to(winner).emit('gameOver', { winner });
        games.delete(gameId);
        break;
      }
    }
  });
});

function startGame(player1, player2) {
  const grid = createGrid(5, 3); // 5x5 grid with 3 mines
  const game = {
    players: [player1.id, player2.id],
    grid: grid,
    revealedCells: Array(5).fill(null).map(() => Array(5).fill(false)),
    currentPlayer: Math.random() < 0.5 ? player1.id : player2.id,
    gameOver: false,
    winner: null
  };

  games.set(player1.id, game);
  games.set(player2.id, game);

  io.to(player1.id).emit('matchFound', {
    grid: grid,
    revealedCells: game.revealedCells,
    currentPlayer: game.currentPlayer,
    opponent: player2.id,
  });

  io.to(player2.id).emit('matchFound', {
    grid: grid,
    revealedCells: game.revealedCells,
    currentPlayer: game.currentPlayer,
    opponent: player1.id,
  });
}

function createGrid(size, minesCount) {
  const grid = Array(size).fill(null).map(() => Array(size).fill(false));
  let placedMines = 0;
  while (placedMines < minesCount) {
    const x = Math.floor(Math.random() * size);
    const y = Math.floor(Math.random() * size);
    if (!grid[y][x]) {
      grid[y][x] = true;
      placedMines++;
    }
  }
  return grid;
}

module.exports = { app, server };
