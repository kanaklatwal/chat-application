import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SERVER_URL = process.env.REACT_APP_SERVER_URL || "http://localhost:4000";

function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// --- Login screen -----------------------------------------------------

function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError("Please enter a username");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // Dummy login: server just registers the username, no password check
      const res = await fetch(`${SERVER_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) throw new Error("Login failed");
      const data = await res.json();
      onLogin(data.user);
    } catch (err) {
      setError("Could not reach server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>💬 Simple Chat</h1>
        <p>Enter a username to join the conversation.</p>
        <input
          type="text"
          placeholder="Your name"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={loading}>
          {loading ? "Joining..." : "Join Chat"}
        </button>
      </form>
    </div>
  );
}

// --- Chat screen -------------------------------------------------------

function Chat({ username, onLogout }) {
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [draft, setDraft] = useState("");
  const [typingUser, setTypingUser] = useState("");
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    const socket = io(SERVER_URL);
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("user:join", username);
    });

    socket.on("chat:history", (history) => {
      setMessages(history);
    });

    socket.on("chat:message", (message) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.on("system:message", (message) => {
      setMessages((prev) => [...prev, { ...message, system: true, id: `sys-${Date.now()}` }]);
    });

    socket.on("users:online", (users) => {
      setOnlineUsers(users);
    });

    socket.on("chat:typing", (who) => {
      setTypingUser(who);
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTypingUser(""), 1500);
    });

    return () => {
      socket.disconnect();
    };
  }, [username]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    socketRef.current.emit("chat:message", { user: username, text: draft });
    setDraft("");
  };

  const handleTyping = (e) => {
    setDraft(e.target.value);
    socketRef.current.emit("chat:typing", username);
  };

  return (
    <div className="chat-screen">
      <header className="chat-header">
        <div>
          <strong>Simple Chat</strong>
          <span className="online-count"> · {onlineUsers.length} online</span>
        </div>
        <div className="header-right">
          <span className="me">{username}</span>
          <button className="logout-btn" onClick={onLogout}>
            Leave
          </button>
        </div>
      </header>

      <main className="messages">
        {messages.map((msg) =>
          msg.system ? (
            <div key={msg.id} className="system-message">
              {msg.text}
            </div>
          ) : (
            <div
              key={msg.id}
              className={`message-row ${msg.user === username ? "mine" : ""}`}
            >
              <div className="bubble">
                {msg.user !== username && <div className="sender">{msg.user}</div>}
                <div className="text">{msg.text}</div>
                <div className="timestamp">{formatTime(msg.timestamp)}</div>
              </div>
            </div>
          )
        )}
        <div ref={messagesEndRef} />
      </main>

      <div className="typing-indicator">{typingUser && `${typingUser} is typing...`}</div>

      <form className="composer" onSubmit={sendMessage}>
        <input
          type="text"
          placeholder="Type a message..."
          value={draft}
          onChange={handleTyping}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

// --- Root app ------------------------------------------------------------

export default function App() {
  const [username, setUsername] = useState(null);

  if (!username) {
    return <Login onLogin={setUsername} />;
  }

  return <Chat username={username} onLogout={() => setUsername(null)} />;
}
