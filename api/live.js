const store = globalThis.__xsafetyFrames || (globalThis.__xsafetyFrames = new Map());

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
};

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://mefbqlrloqgmclrfdcib.supabase.co';
const SUPABASE_ANON =
  process.env.SUPABASE_ANON_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZmJxbHJsb3FnbWNscmZkY2liIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3OTA0MDYsImV4cCI6MjEwNDM2NjQwNn0.GYdOM5f8wkOK3u7sIX9f-1aXYsZACPMlvRIQQLiqIF4';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function roomKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 40);
}

async function saveRemote(room, jpeg, peopleCount) {
  if (!SUPABASE_URL || !SUPABASE_ANON) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/cctv_room_live`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        room,
        jpeg,
        people_count: peopleCount,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch {
    // In-memory still holds the latest frame on this instance.
  }
}

async function loadRemote(room) {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/cctv_room_live?room=eq.${encodeURIComponent(room)}&select=jpeg,people_count,updated_at`,
      {
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
        },
      },
    );
    if (!response.ok) return null;
    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.jpeg) return null;
    return {
      jpeg: row.jpeg,
      peopleCount: Number(row.people_count) || 0,
      at: row.updated_at,
    };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const room = roomKey(body.room);
    const jpeg = String(body.jpeg || '');
    const peopleCount = Number(body.peopleCount) || 0;
    if (!room || !jpeg.startsWith('data:image')) {
      res.status(400).json({ error: 'room and jpeg required' });
      return;
    }
    const row = { jpeg, peopleCount, at: new Date().toISOString() };
    store.set(room, row);
    await saveRemote(room, jpeg, peopleCount);
    res.status(200).json({ ok: true, peopleCount });
    return;
  }

  const room = roomKey(req.query.room);
  const local = store.get(room);
  const remote = local ? null : await loadRemote(room);
  const row = local || remote;
  if (!row) {
    res.status(404).json({ error: 'no live frame' });
    return;
  }
  res.status(200).json(row);
}
