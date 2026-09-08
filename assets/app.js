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
  return `${window.location.origin}/watch/${encodeURIComponent(cleanRoom(room))}`;
}

function goUrl(room) {
  return `${window.location.origin}/go/${encodeURIComponent(cleanRoom(room))}`;
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
    const urlEl = document.querySelector('#watch-url');
    const initial = cleanRoom(pathRoom());
    if (initial) roomInput.value = initial;

    let localStream;
    let peer;

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      attachStream(preview, localStream);
      await listCameras(cameraSelect);
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
        history.replaceState({}, '', `/go/${encodeURIComponent(room)}`);
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
        attachStream(video, stream);
        setStatus(status, 'Live occupancy feed.', 'ok');
      });
    });
    peer.on('error', (err) => {
      if (err?.type === 'peer-unavailable') {
        setStatus(status, 'Waiting for the webcam machine to open Broadcast and keep the tab open…');
        return;
      }
      setStatus(status, err?.message || 'Could not join the room.', 'error');
    });
  },
};
