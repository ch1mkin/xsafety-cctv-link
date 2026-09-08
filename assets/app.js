const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

function pathRoom() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('room')) return params.get('room');
  const parts = window.location.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  if (last === 'go' || last === 'watch' || last === 'go.html' || last === 'watch.html') return '';
  return last;
}

function cleanRoom(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 40);
}

function peerIdFor(room) {
  return `xsafety-${cleanRoom(room)}`;
}

function setStatus(el, message, kind) {
  if (!el) return;
  el.className = `status${kind ? ` ${kind}` : ''}`;
  el.textContent = message;
}

function watchUrl(room) {
  return `${window.location.origin}/watch.html?room=${encodeURIComponent(cleanRoom(room))}`;
}

function goUrl(room) {
  return `${window.location.origin}/go.html?room=${encodeURIComponent(cleanRoom(room))}`;
}

async function listCameras(select) {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videos = devices.filter((item) => item.kind === 'videoinput');
  select.innerHTML = '';
  videos.forEach((device, index) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `Camera ${index + 1}`;
    select.appendChild(option);
  });
  if (videos.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No camera found';
    select.appendChild(option);
  }
}

function attachStream(video, stream) {
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  void video.play().catch(() => {
    // Autoplay can wait for a tap; the muted flag usually allows it.
  });
}

const TRACK_COLORS = ['#38E8FF', '#FF5C7A', '#F5A524', '#B388FF', '#3DDC97', '#FF8A4C'];

function headFromPerson(bbox) {
  const [x, y, w, h] = bbox;
  const size = Math.max(22, Math.min(w * 0.58, h * 0.3));
  return {
    x: x + (w - size) / 2,
    y: y + h * 0.03,
    w: size,
    h: size * 1.15,
  };
}

function drawTrackBoxes(ctx, heads, scaleX, scaleY) {
  heads.forEach((head, index) => {
    const color = TRACK_COLORS[index % TRACK_COLORS.length];
    const x = head.x * scaleX;
    const y = head.y * scaleY;
    const w = head.w * scaleX;
    const h = head.h * scaleY;
    const tick = Math.max(4, Math.min(12, w * 0.28));
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = `${color}22`;
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y + tick);
    ctx.lineTo(x, y);
    ctx.lineTo(x + tick, y);
    ctx.moveTo(x + w - tick, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + tick);
    ctx.moveTo(x, y + h - tick);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + tick, y + h);
    ctx.moveTo(x + w - tick, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - tick);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(`P-${String(index + 1).padStart(2, '0')}`, x, Math.max(12, y - 4));
    ctx.restore();
  });
}

function paintHud(canvas, video, heads) {
  if (!canvas || !video?.videoWidth) return;
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  drawTrackBoxes(ctx, heads, 1, 1);
}

function grabJpeg(video, heads) {
  if (!video || !video.videoWidth) return '';
  const canvas = grabJpeg.canvas || (grabJpeg.canvas = document.createElement('canvas'));
  const width = 360;
  const height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * width));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, width, height);
  drawTrackBoxes(ctx, heads || [], width / video.videoWidth, height / video.videoHeight);
  return canvas.toDataURL('image/jpeg', 0.45);
}

async function publishLive(room, video, peopleCount, heads) {
  const jpeg = grabJpeg(video, heads);
  if (!jpeg) return;
  await fetch('/api/live', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room: cleanRoom(room), jpeg, peopleCount }),
  });
}

async function loadDetector() {
  try {
    if (window.cocoSsd) return window.cocoSsd.load();
  } catch {
    return null;
  }
  return null;
}

window.XSafetyCctv = {
  bootHome() {
    const roomInput = document.querySelector('#room');
    const goBtn = document.querySelector('#go');
    const watchBtn = document.querySelector('#watch');
    goBtn.addEventListener('click', () => {
      const room = cleanRoom(roomInput.value);
      if (!room) return;
      window.location.href = goUrl(room);
    });
    watchBtn.addEventListener('click', () => {
      const room = cleanRoom(roomInput.value);
      if (!room) return;
      window.location.href = watchUrl(room);
    });
  },

  async startBroadcast() {
    const roomInput = document.querySelector('#room');
    const cameraSelect = document.querySelector('#camera');
    const startBtn = document.querySelector('#start');
    const copyBtn = document.querySelector('#copy');
    const status = document.querySelector('#status');
    const preview = document.querySelector('#preview');
    const hud = document.querySelector('#hud');
    const urlEl = document.querySelector('#watch-url');
    const initial = cleanRoom(pathRoom());
    if (initial) roomInput.value = initial;

    let localStream;
    let peer;
    let peopleCount = 0;
    let heads = [];
    let detector = null;
    let publishTimer;
    let detectTimer;

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } },
      });
      attachStream(preview, localStream);
      await listCameras(cameraSelect);
      detector = await loadDetector();
    } catch (err) {
      setStatus(status, 'Camera permission is required on this machine.', 'error');
      startBtn.disabled = true;
      return;
    }

    cameraSelect.addEventListener('change', async () => {
      const deviceId = cameraSelect.value;
      if (!deviceId) return;
      const next = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: deviceId } },
      });
      localStream.getTracks().forEach((track) => track.stop());
      localStream = next;
      attachStream(preview, localStream);
    });

    startBtn.addEventListener('click', () => {
      const room = cleanRoom(roomInput.value);
      if (!room) {
        setStatus(status, 'Enter the institution code first.', 'error');
        return;
      }
      if (peer) peer.destroy();
      const id = peerIdFor(room);
      urlEl.textContent = watchUrl(room);
      peer = new Peer(id, { debug: 0, config: ICE });
      peer.on('open', () => {
        setStatus(status, 'Live. Keep this tab open. Paste the watch URL in XSAFETY.', 'ok');
        history.replaceState({}, '', `/go.html?room=${encodeURIComponent(room)}`);
      });
      peer.on('error', (err) => {
        if (err?.type === 'unavailable-id') {
          setStatus(status, 'This room is already broadcasting in another tab. Close that tab or pick another code.', 'error');
          return;
        }
        setStatus(status, err?.message || 'Could not start the room.', 'error');
      });
      peer.on('connection', (conn) => {
        conn.on('open', () => {
          if (localStream) peer.call(conn.peer, localStream);
        });
      });
      peer.on('call', (call) => {
        call.answer(localStream);
      });
      window.clearInterval(publishTimer);
      window.clearInterval(detectTimer);
      detectTimer = window.setInterval(async () => {
        if (!detector || !preview.videoWidth) return;
        try {
          const preds = await detector.detect(preview);
          const people = preds.filter((item) => item.class === 'person' && item.score > 0.45);
          peopleCount = people.length;
          heads = people.map((item) => headFromPerson(item.bbox));
          paintHud(hud, preview, heads);
          const occupancy = document.querySelector('#occupancy');
          if (occupancy) occupancy.textContent = `Occupancy markers · ${peopleCount}`;
        } catch {
          // Keep last occupancy if a frame fails.
        }
      }, 700);
      let publishing = false;
      publishTimer = window.setInterval(() => {
        if (publishing) return;
        publishing = true;
        void publishLive(room, preview, peopleCount, heads).finally(() => {
          publishing = false;
        });
      }, 180);
    });

    copyBtn.addEventListener('click', async () => {
      const room = cleanRoom(roomInput.value);
      if (!room) return;
      await navigator.clipboard.writeText(watchUrl(room));
      setStatus(status, 'Watch URL copied. Paste it on the institution in the app.', 'ok');
    });
  },

  startWatch() {
    const status = document.querySelector('#status');
    const video = document.querySelector('#live');
    const fallback = document.querySelector('#fallback');
    const room = cleanRoom(pathRoom() || new URLSearchParams(window.location.search).get('room'));
    if (!room) {
      setStatus(status, 'Missing room code in the URL.', 'error');
      return;
    }

    const target = peerIdFor(room);
    const peer = new Peer({ debug: 0, config: ICE });
    let connected = false;

    function join() {
      if (connected) return;
      const conn = peer.connect(target, { reliable: true });
      conn.on('error', () => {
        window.setTimeout(join, 2000);
      });
    }

    async function pollFrames() {
      if (connected) return;
      try {
        const response = await fetch(`/api/live?room=${encodeURIComponent(room)}`);
        if (!response.ok) return;
        const payload = await response.json();
        if (!payload.jpeg || !fallback) return;
        fallback.src = payload.jpeg;
        fallback.hidden = false;
        setStatus(status, `Live occupancy feed · ${payload.peopleCount ?? 0} people`, 'ok');
      } catch {
        // Wait for the next tick.
      }
    }

    peer.on('open', () => {
      setStatus(status, 'Connecting to the webcam room…');
      join();
      window.setInterval(() => {
        if (!connected) join();
      }, 4000);
    });
    peer.on('call', (call) => {
      call.answer();
      call.on('stream', (stream) => {
        connected = true;
        if (fallback) fallback.hidden = true;
        attachStream(video, stream);
        setStatus(status, 'Live occupancy feed.', 'ok');
      });
    });
    peer.on('error', (err) => {
      if (err?.type === 'peer-unavailable') {
        setStatus(status, 'Waiting for occupancy frames from the webcam machine…');
        return;
      }
      setStatus(status, err?.message || 'Could not join the room.', 'error');
    });
    void pollFrames();
    window.setInterval(() => {
      void pollFrames();
    }, 220);
  },
};
