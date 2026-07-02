/**
 * Simple real-time chat server.
 *
 * - Express serves a couple of small REST endpoints (dummy login + message history).
 * - Socket.io handles real-time message delivery and online-user tracking.
 * - Everything is kept in memory, so data resets whenever the server restarts.
 *   Swap the in-memory arrays/maps below for a real database in production.
 */

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // fine for a demo; lock this down in production
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 4000;

// ---- In-memory "database" -------------------------------------------------

/** @type {{ id: string, user: string, text: string, timestamp: string }[]} */
const messageHistory = [];

/** Maps socket.id -> username, so we can announce who left / list who's online */
const onlineUsers = new Map();

const MAX_HISTORY = 200; // avoid unbounded memory growth

// ---- REST endpoints ---------------------------------------------------

// Dummy login: no password check, just registers a username.
// A real app would verify credentials and return a signed token.
app.post("/api/login", (req, res) => {
  const { username } = req.body;

  if (!username || !username.trim()) {
    return res.status(400).json({ error: "Username is required" });
  }

  return res.json({
    user: username.trim(),
    token: `dummy-token-${Date.now()}`, // placeholder for a real JWT/session token
  });
});

// Fetch message history (useful when a client first connects / reconnects)
app.get("/api/messages", (req, res) => {
  res.json(messageHistory);
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", onlineUsers: onlineUsers.size });
});

// ---- Socket.io real-time logic -----------------------------------------

io.on("connection", (socket) => {
  console.log(`[connect] ${socket.id}`);

  // Client announces itself right after connecting
  socket.on("user:join", (username) => {
    onlineUsers.set(socket.id, username);

    // Send the new user the current history + online list
    socket.emit("chat:history", messageHistory);
    io.emit("users:online", Array.from(onlineUsers.values()));

    socket.broadcast.emit("system:message", {
      text: `${username} joined the chat`,
      timestamp: new Date().toISOString(),
    });
  });

  // Incoming chat message
  socket.on("chat:message", ({ user, text }) => {
    if (!text || !text.trim()) return;

    const message = {
      id: `${socket.id}-${Date.now()}`,
      user: user || "Anonymous",
      text: text.trim(),
      timestamp: new Date().toISOString(),
    };

    messageHistory.push(message);
    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();

    // Broadcast to everyone, including the sender, so all clients stay in sync
    io.emit("chat:message", message);
  });

  // Optional: typing indicator
  socket.on("chat:typing", (username) => {
    socket.broadcast.emit("chat:typing", username);
  });

  socket.on("disconnect", () => {
    const username = onlineUsers.get(socket.id);
    onlineUsers.delete(socket.id);
    io.emit("users:online", Array.from(onlineUsers.values()));

    if (username) {
      socket.broadcast.emit("system:message", {
        text: `${username} left the chat`,
        timestamp: new Date().toISOString(),
      });
    }
    console.log(`[disconnect] ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Chat server listening on http://localhost:${PORT}`);
});
