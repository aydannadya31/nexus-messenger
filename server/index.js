import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { AccessToken } from 'livekit-server-sdk';

const PORT = process.env.PORT || 3001;
const app = express();
app.use(cors());
app.use(express.json());

// ─── Health ───────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, engine: 'nexus-messenger-server' });
});

// ─── LiveKit Token ────────────────────────────────────────
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_WS_URL = process.env.LIVEKIT_WS_URL || '';

app.post('/api/livekit/token', (req, res) => {
  const { room, identity } = req.body;
  if (!room || !identity) {
    return res.status(400).json({ error: 'room and identity required' });
  }
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_WS_URL) {
    return res.status(503).json({ error: 'LiveKit not configured' });
  }

  try {
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      ttl: '1h',
    });
    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
    const token = at.toJwt();
    res.json({ token, wsUrl: LIVEKIT_WS_URL });
  } catch (err) {
    res.status(500).json({ error: 'Token generation failed' });
  }
});

// ─── Agora Token ───────────────────────────────────────────
const AGORA_APP_ID = process.env.AGORA_APP_ID || '';
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || '';

app.post('/api/agora/token', async (req, res) => {
  const { channel, uid } = req.body;
  if (!channel) {
    return res.status(400).json({ error: 'channel required' });
  }
  if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
    return res.status(503).json({ error: 'Agora not configured' });
  }

  try {
    const { RtcTokenBuilder, RtcRole } = await import('agora-access-token');
    const role = RtcRole.PUBLISHER;
    const expireTime = Math.floor(Date.now() / 1000) + 3600;
    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channel,
      uid || 0,
      role,
      expireTime,
    );
    res.json({ token, appId: AGORA_APP_ID });
  } catch (err) {
    res.status(500).json({ error: 'Agora token generation failed' });
  }
});

// ─── Daily.co Room ─────────────────────────────────────────
const DAILY_API_KEY = process.env.DAILY_API_KEY || '';

app.post('/api/daily/room', async (_req, res) => {
  if (!DAILY_API_KEY) {
    return res.status(503).json({ error: 'Daily.co not configured' });
  }
  try {
    const resp = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        properties: { enable_prejoin_ui: false, start_video_off: true },
      }),
    });
    const data = await resp.json();
    res.json({ url: data.url });
  } catch (err) {
    res.status(500).json({ error: 'Daily room creation failed' });
  }
});

// ─── HTTP server ──────────────────────────────────────────
const server = createServer(app);

// ─── WebSocket Relay ──────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });

/** Map<roomId, Set<WebSocket>> */
const rooms = new Map();

wss.on('connection', (ws) => {
  let currentRoom = null;
  let userId = null;

  ws.on('message', (data) => {
    // First message should be a JSON join
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'join' && msg.room && msg.userId) {
        currentRoom = msg.room;
        userId = msg.userId;

        if (!rooms.has(currentRoom)) {
          rooms.set(currentRoom, new Set());
        }
        rooms.get(currentRoom).add(ws);

        ws.send(JSON.stringify({ type: 'room_joined', room: currentRoom }));
        return;
      }
    } catch { /* binary data = audio chunk */ }

    // Binary audio chunk — broadcast to room peers
    if (currentRoom && rooms.has(currentRoom)) {
      for (const client of rooms.get(currentRoom)) {
        if (client !== ws && client.readyState === 1) {
          client.send(data);
        }
      }
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      rooms.get(currentRoom).delete(ws);
      if (rooms.get(currentRoom).size === 0) {
        rooms.delete(currentRoom);
      }
    }
  });
});

// ─── Start ────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`Nexus Messenger server running on port ${PORT}`);
});
