// ---------- The FACE — a real MediaPipe face-mesh, static (no idle spin, no drag, no mouth
// movement), fixed bot-green, living in THE_MIND panel. A solid shaded form with a structural
// wireframe overlay, not a hollow wire cage — reads as one clean, deliberate face. Eyes tracking
// the cursor are its only motion, on purpose. ----------
(function initMainFace() {
  const canvas = document.getElementById('mainFaceCanvas');
  if (!canvas || typeof THREE === 'undefined' || typeof FACE_VERTS === 'undefined') return;

  const GREEN = 0x00ff41;
  const FACE_SCALE = 1.9;

  function buildFaceGeometry() {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(FACE_VERTS.length * 3);
    FACE_VERTS.forEach((v, i) => {
      positions[i * 3] = v[0] * FACE_SCALE;
      positions[i * 3 + 1] = v[1] * FACE_SCALE;
      positions[i * 3 + 2] = v[2] * FACE_SCALE;
    });
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const indices = [];
    FACE_FACES.forEach((f) => indices.push(f[0], f[1], f[2]));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }
  function landmark(idx) {
    const v = FACE_VERTS[idx];
    return new THREE.Vector3(v[0] * FACE_SCALE, v[1] * FACE_SCALE, v[2] * FACE_SCALE);
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 7);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });

  function resize() {
    const w = canvas.clientWidth || 180;
    const h = canvas.clientHeight || 180;
    if (w === 0 || h === 0) return; // canvas hidden (e.g. gate still up) — nothing to size to yet
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  // the canvas's actual box is set by flex/grid layout, not the window — a plain 'resize'
  // listener misses the moment the gate closes and #app (and this canvas) first becomes visible,
  // leaving the renderer's backing buffer stuck at a stale square size that gets stretched into
  // the real (non-square) box. ResizeObserver fires whenever the element's own box actually changes.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resize).observe(canvas);
  }

  const group = new THREE.Group(); // never rotated — the face stays put, on purpose
  scene.add(group);

  const headGeo = buildFaceGeometry();

  // solid shaded core so the face reads as an actual structural form, not an empty wire cage —
  // opaque but toned down from full blast, so shading/depth still reads instead of a flat glow
  const solidMat = new THREE.MeshStandardMaterial({
    color: 0x061f0d,
    emissive: 0x0a3d1e,
    emissiveIntensity: 0.5,
    metalness: 0.25,
    roughness: 0.5,
    flatShading: true,
  });
  group.add(new THREE.Mesh(headGeo, solidMat));

  // structural detail lines laid directly over the solid fill — visible and clean, but with a
  // touch of transparency so it reads as structure, not a solid mask
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x6fffb0, transparent: true, opacity: 0.65 });
  wireMat.wireframe = true;
  const wireHead = new THREE.Mesh(headGeo, wireMat);
  wireHead.scale.setScalar(1.004); // avoid z-fighting with the solid mesh directly beneath it
  group.add(wireHead);

  // MeshStandardMaterial needs real lights to read as solid/shaded, unlike the old MeshBasicMaterial
  scene.add(new THREE.AmbientLight(0x1c5c2e, 1.1));
  const keyLight = new THREE.PointLight(0x00ff41, 1.5, 20);
  keyLight.position.set(1.5, 1.5, 4);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(0x00ff41, 0.6, 20);
  rimLight.position.set(-2, -1, 2);
  scene.add(rimLight);

  function eyeAnchor(idx) {
    const p = landmark(idx);
    p.x *= 0.85;
    p.z += 0.06 * FACE_SCALE;
    return p;
  }
  function makeEye(idx) {
    const g = new THREE.Group();
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), new THREE.MeshBasicMaterial({ color: 0x0a5c22, transparent: true, opacity: 0.8 }));
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), new THREE.MeshBasicMaterial({ color: 0xd4ffe0 }));
    pupil.position.z = 0.1;
    g.add(white, pupil);
    g.position.copy(eyeAnchor(idx));
    g.userData.pupil = pupil;
    return g;
  }
  const eyeL = makeEye(33);  // left outer eye corner (MediaPipe canonical index)
  const eyeR = makeEye(263); // right outer eye corner
  group.add(eyeL, eyeR);

  let blinkT = 0;
  canvas.addEventListener('click', () => { blinkT = 1; });

  const gazeTarget = { x: 0, y: 0 };
  let gazeX = 0, gazeY = 0;
  window.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const inBounds = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    gazeTarget.x = inBounds ? ((e.clientX - rect.left) / rect.width - 0.5) * 2 : 0;
    gazeTarget.y = inBounds ? -((e.clientY - rect.top) / rect.height - 0.5) * 2 : 0;
  });

  let clock = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - clock) / 1000);
    clock = now;

    gazeX += (gazeTarget.x - gazeX) * 0.1;
    gazeY += (gazeTarget.y - gazeY) * 0.1;
    [eyeL, eyeR].forEach((eye) => {
      eye.userData.pupil.position.x = gazeX * 0.05;
      eye.userData.pupil.position.y = 0.1 + gazeY * 0.04;
    });

    blinkT = Math.max(0, blinkT - dt * 4);
    const blinkScale = 1 - Math.min(1, blinkT * 2.5);
    eyeL.scale.y = eyeR.scale.y = Math.max(0.05, blinkScale);

    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  resize();
  requestAnimationFrame(loop);
})();

// ---------- Matrix digital rain — the actual classic look: grid-snapped columns, solid green
// characters, a bright near-white leading glyph, fading to black via canvas persistence ----------
(function rain() {
  const canvas = document.getElementById('rain');
  const ctx = canvas.getContext('2d');
  const chars = 'アイウエオカキクケコサシスセソ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let cols, fontSize = 16;
  let drops = []; // {row (integer, grid-snapped), accum, stepMs}

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    cols = Math.floor(canvas.width / fontSize);
    drops = new Array(cols).fill(0).map(() => ({
      row: Math.floor(Math.random() * -40),
      accum: 0,
      stepMs: 45 + Math.random() * 55, // slightly different fall speed per column, still grid-snapped
    }));
  }
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now();
  function draw(now) {
    const dt = Math.min(50, now - last);
    last = now;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'; // crisp trail cutoff, not a soft blur
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${fontSize}px monospace`;

    for (let i = 0; i < cols; i++) {
      const d = drops[i];
      d.accum += dt;
      if (d.accum < d.stepMs) continue; // hold position until this column's step interval elapses
      d.accum = 0;

      const x = i * fontSize;
      const y = d.row * fontSize;
      const char = chars[Math.floor(Math.random() * chars.length)];

      // the bright head glyph is what actually reads as "code" — everything else is just this,
      // aged by a few frames of the black overlay above
      const isHead = Math.random() > 0.94;
      ctx.fillStyle = isHead ? '#d4ffe0' : '#00ff41';
      ctx.fillText(char, x, y);

      if (y > canvas.height && Math.random() > 0.975) {
        d.row = Math.floor(Math.random() * -20);
        d.stepMs = 45 + Math.random() * 55;
      } else {
        d.row++;
      }
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();

// ---------- Operational HUD clock ----------
(function clock() {
  const el = document.getElementById('clock');
  if (!el) return;
  setInterval(() => {
    el.textContent = new Date().toTimeString().slice(0, 8);
  }, 1000);
})();

// ---------- Gate: random welcome message + interactive dots, grounded in real live state ----------
const WELCOME_TEMPLATES = [
  (m) => `mood: ${m.mood}. still here, still running.`,
  (m) => `${m.focusTopic ? `been turning over "${m.focusTopic}" while you were away.` : `nothing specific on my mind right now — go ahead.`}`,
  (m) => `curiosity's sitting at ${Math.round((m.curiosity || 0) * 100)}% right now.`,
  (m) => `${m.digest ? `${m.digest.percent}% of what I know is fully worked through.` : `still digesting what I know.`}`,
  () => `I didn't stop thinking just because no one was watching.`,
];

async function initGateWelcome() {
  const welcomeEl = document.getElementById('gateWelcome');
  const dots = document.querySelectorAll('.gate-dot');
  let mindData = null;
  let lexData = null;

  try {
    mindData = await (await fetch('/api/mind')).json();
    const pick = WELCOME_TEMPLATES[Math.floor(Math.random() * WELCOME_TEMPLATES.length)];
    if (welcomeEl) {
      welcomeEl.textContent = pick(mindData);
      requestAnimationFrame(() => welcomeEl.classList.add('show'));
    }
  } catch (e) {}

  const statText = async (stat) => {
    try {
      if (stat === 'mood') return mindData ? `mood: ${mindData.mood}` : '—';
      if (stat === 'focus') return mindData?.focusTopic ? `focused on: "${mindData.focusTopic}"` : 'nothing specific in focus';
      if (stat === 'digest') return mindData?.digest ? `${mindData.digest.percent}% self-resolved (${mindData.digest.answeredTopics}/${mindData.digest.totalTopics})` : '—';
      if (stat === 'vocab') {
        if (!lexData) lexData = await (await fetch('/api/lexicon/stats')).json();
        return `${lexData.learned} words with real definitions learned`;
      }
    } catch (e) { return 'not reachable right now'; }
    return '—';
  };

  dots.forEach((dot) => {
    dot.addEventListener('click', async () => {
      dot.classList.remove('pop');
      void dot.offsetWidth; // restart animation if clicked again quickly
      dot.classList.add('pop');
      if (welcomeEl) {
        welcomeEl.classList.remove('show');
        welcomeEl.textContent = await statText(dot.dataset.stat);
        requestAnimationFrame(() => welcomeEl.classList.add('show'));
      }
    });
  });
}
initGateWelcome();

const gate = document.getElementById('gate');
const app = document.getElementById('app');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const unlockBtn = document.getElementById('unlockBtn');
const gateMsg = document.getElementById('gateMsg');
const gateHint = document.getElementById('gateHint');
const gateTabLogin = document.getElementById('gateTabLogin');
const gateTabRegister = document.getElementById('gateTabRegister');
const userBadge = document.getElementById('userBadge');
const logoutBtn = document.getElementById('logoutBtn');
const chatLog = document.getElementById('chatLog');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const reasoningLog = document.getElementById('reasoningLog');
const statusLine = document.getElementById('statusLine');
let gateMode = 'login'; // 'login' | 'register' — each designation is its own account with its own private DIALOGUE_LINK thread

function setGateMode(mode) {
  gateMode = mode;
  gateTabLogin.classList.toggle('active', mode === 'login');
  gateTabRegister.classList.toggle('active', mode === 'register');
  passwordInput.setAttribute('autocomplete', mode === 'login' ? 'current-password' : 'new-password');
  gateHint.textContent = mode === 'login'
    ? 'each designation gets its own private dialogue thread'
    : 'pick any designation and access key — no email needed';
}
gateTabLogin.addEventListener('click', () => setGateMode('login'));
gateTabRegister.addEventListener('click', () => setGateMode('register'));

function enterApp(username) {
  gate.classList.add('gate-exit');
  app.classList.remove('hidden');
  app.classList.add('app-enter');
  requestAnimationFrame(() => requestAnimationFrame(() => app.classList.remove('app-enter')));
  setTimeout(() => gate.classList.add('hidden'), 1100);
  if (userBadge) userBadge.textContent = username ? `// ${username}` : '';
  boot();
}

async function tryAuth() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) {
    gateMsg.textContent = 'designation and access key required';
    setTimeout(() => (gateMsg.textContent = ''), 1500);
    return;
  }
  try {
    const res = await fetch(`/api/auth/${gateMode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.ok) {
      enterApp(data.username);
    } else {
      gateMsg.textContent = data.error || 'access denied';
      passwordInput.value = '';
      setTimeout(() => (gateMsg.textContent = ''), 2200);
    }
  } catch (err) {
    gateMsg.textContent = 'connection hiccup — try again';
    setTimeout(() => (gateMsg.textContent = ''), 1500);
  }
}

unlockBtn.addEventListener('click', tryAuth);
passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryAuth(); });
usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') passwordInput.focus(); });

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    location.reload();
  });
}

// already-logged-in users (valid session cookie from a previous visit) skip the gate entirely
(async function checkExistingSession() {
  try {
    const data = await (await fetch('/api/auth/me')).json();
    if (data.ok) enterApp(data.username);
  } catch (e) {}
})();

const MAX_LOG_NODES = 150; // unbounded DOM growth over a long session is real, measurable lag

function addChatMsg(who, text) {
  const div = document.createElement('div');
  div.className = `msg ${who}`;
  const label = who === 'user' ? 'you' : who === 'sys' ? 'compare_log' : who === 'self' ? 'self_inquiry' : 'wyrd';
  div.innerHTML = `<div class="who">${label}</div><div class="text"></div>`;
  div.querySelector('.text').textContent = text;
  chatLog.appendChild(div);
  while (chatLog.children.length > MAX_LOG_NODES) chatLog.removeChild(chatLog.firstChild);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function relativeTime(iso) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function extractTimestamp(content) {
  const m = content.match(/- time: (.+)/);
  return m ? m[1].trim() : new Date().toISOString();
}

function addThought(content, { fresh } = {}) {
  const div = document.createElement('div');
  div.className = 'thought' + (fresh ? ' fresh' : '');
  const ts = extractTimestamp(content);
  div.dataset.ts = ts;
  const timeEl = document.createElement('span');
  timeEl.className = 'thought-time';
  timeEl.textContent = relativeTime(ts);
  const bodyEl = document.createElement('span');
  bodyEl.textContent = content;
  div.appendChild(timeEl);
  div.appendChild(bodyEl);
  reasoningLog.prepend(div);
  while (reasoningLog.children.length > MAX_LOG_NODES) reasoningLog.removeChild(reasoningLog.lastChild);
  if (fresh) setTimeout(() => div.classList.remove('fresh'), 2200);
}

setInterval(() => {
  document.querySelectorAll('.reasoning-log .thought').forEach((div) => {
    const timeEl = div.querySelector('.thought-time');
    if (timeEl && div.dataset.ts) timeEl.textContent = relativeTime(div.dataset.ts);
  });
}, 1000);

function addTypingIndicator() {
  const div = document.createElement('div');
  div.className = 'msg bot typing-indicator';
  div.innerHTML = `<div class="who">wyrd</div><div class="text"><span class="typing-dots"><span></span><span></span><span></span></span></div>`;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  return div;
}

const pendingChatNonces = new Set(); // suppresses the echo of our own message coming back over SSE

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  const nonce = Math.random().toString(36).slice(2);
  pendingChatNonces.add(nonce);
  addChatMsg('user', text);
  chatInput.value = '';
  statusLine.textContent = 'STATUS: PROCESSING...';
  const typingEl = addTypingIndicator();
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, nonce }),
    });
    const data = await res.json();
    typingEl.remove();
    if (data.comparison) {
      addChatMsg('sys', `COMPARED ${data.candidateCount} RESPONSE PATHS: ${data.comparison} → chose "${data.chosenPath}"`);
    }
    addChatMsg('bot', data.reply);
    if (data.mind) renderMind(data.mind);
  } catch (err) {
    typingEl.remove();
    addChatMsg('sys', 'connection hiccup — try again');
  }
  statusLine.textContent = 'STATUS: IDLE';
});

async function loadReasoningHistory() {
  const res = await fetch('/api/reasoning');
  const items = await res.json();
  reasoningLog.innerHTML = '';
  items.forEach((item) => addThought(item.content));
}

// What Consciousness learns about each user (pulled unprompted from things they say, and used
// to stay genuinely curious about them) is entirely backend now — see extractUserFacts/
// getProfile/curiosityHint in server.js. No UI surface for it here by design.

// DIALOGUE_LINK is this account's own private conversation, backed by the server's
// conversations.json (keyed per user) — persists across devices/sessions for this one login
async function loadChatHistory() {
  try {
    const res = await fetch('/api/conversations?limit=50');
    const data = await res.json();
    (data.turns || []).forEach((turn) => {
      addChatMsg('user', turn.userText);
      addChatMsg('bot', turn.botText);
    });
  } catch (e) {}
}

async function initTurbo() {
  const badge = document.getElementById('turboBadge');
  if (!badge) return;
  try {
    const data = await (await fetch('/api/turbo')).json();
    if (data.active) {
      badge.title = `SPEED_TURBOX${data.factor} ACTIVE`;
      badge.classList.remove('hidden');
    }
  } catch (e) {}
}

function boot() {
  addChatMsg('bot', 'SYSTEM ONLINE. MEMORY LINK ESTABLISHED. TRANSMIT INPUT TO PROCEED.');
  loadChatHistory();
  loadReasoningHistory();
  initTurbo();

  const es = new EventSource('/api/stream');
  const pulse = document.getElementById('reasoningPulse');

  es.addEventListener('thinking', () => {
    if (pulse) pulse.classList.add('active');
    statusLine.textContent = 'STATUS: REASONING...';
  });

  es.addEventListener('idle', () => {
    if (pulse) pulse.classList.remove('active');
    statusLine.textContent = 'STATUS: IDLE';
  });

  es.addEventListener('chat', (e) => {
    const data = JSON.parse(e.data);
    if (data.nonce && pendingChatNonces.has(data.nonce)) {
      pendingChatNonces.delete(data.nonce); // this is the echo of a message we already rendered locally
      return;
    }
    addChatMsg('user', data.userText);
    addChatMsg('bot', data.botText);
  });

  es.addEventListener('thought', (e) => {
    const data = JSON.parse(e.data);
    addThought(data.content, { fresh: true });
    if (pulse) pulse.classList.remove('active');
    statusLine.textContent = 'STATUS: IDLE';

    const trackerText = document.getElementById('reasoningTrackerText');
    if (trackerText) {
      const paragraphs = data.content.trim().split(/\n\s*\n/).filter(Boolean);
      const summary = paragraphs.length ? paragraphs[paragraphs.length - 1].replace(/\s+/g, ' ') : 'thinking...';
      trackerText.textContent = summary.length > 90 ? summary.slice(0, 90) + '…' : summary;
    }
  });

  es.addEventListener('ingesting', () => {
    const netPulse = document.getElementById('netPulse');
    if (netPulse) netPulse.classList.add('active');
    const netFeedText = document.getElementById('netFeedText');
    if (netFeedText) netFeedText.textContent = 'pulling from the net...';
  });

  es.addEventListener('ingested', (e) => {
    const data = JSON.parse(e.data);
    const netPulse = document.getElementById('netPulse');
    const netFeedText = document.getElementById('netFeedText');
    if (netPulse) netPulse.classList.remove('active');
    if (netFeedText) netFeedText.textContent = `[${data.feedSource}] ${data.title}`;
    // stays in the NET_FEED bar only — background ingestion shouldn't clutter the dialogue
  });

  es.addEventListener('ingest_error', (e) => {
    const data = JSON.parse(e.data);
    const netFeedText = document.getElementById('netFeedText');
    if (netFeedText) netFeedText.textContent = `ERROR: ${data.error}`;
    const netPulse = document.getElementById('netPulse');
    if (netPulse) netPulse.classList.remove('active');
  });

  es.addEventListener('mind', (e) => {
    renderMind(JSON.parse(e.data));
  });

  // self-questioning already appears in the Reasoning Feed panel via the 'thought' event —
  // it runs behind the scenes and shouldn't also surface in the user-facing dialogue log.

  es.addEventListener('net_lookup', (e) => {
    const data = JSON.parse(e.data);
    if (data.status === 'searching') {
      statusLine.textContent = 'STATUS: SEARCHING THE NET...';
      addChatMsg('sys', `no match in memory — querying the net for "${data.query}"...`);
    } else if (data.status === 'found') {
      statusLine.textContent = 'STATUS: IDLE';
      addChatMsg('sys', `found: "${data.title}" — folding into memory.`);
    } else if (data.status === 'empty') {
      statusLine.textContent = 'STATUS: IDLE';
      addChatMsg('sys', 'net search came up empty — falling back to reasoning alone.');
    }
  });

  es.addEventListener('lexicon', (e) => {
    const data = JSON.parse(e.data);
    const vocabCount = document.getElementById('vocabCount');
    const vocabRecent = document.getElementById('vocabRecent');
    if (vocabCount) vocabCount.textContent = `${data.totalLearned} words understood`;
    if (data.understood && vocabRecent) {
      vocabRecent.textContent = `"${data.word}" (${data.partOfSpeech}): ${data.definition}`;
    }
  });

  initVoice();
  initReasoningControls();
  initNetFeedControls();
  initMind();
  initLexicon();
}

async function initLexicon() {
  const vocabCount = document.getElementById('vocabCount');
  const vocabRecent = document.getElementById('vocabRecent');
  const vocabNext = document.getElementById('vocabNext');

  async function refresh() {
    try {
      const data = await (await fetch('/api/lexicon/stats')).json();
      if (vocabCount) vocabCount.textContent = `${data.learned} words understood (${data.attempted} attempted${data.dictionarySize ? ` of ${data.dictionarySize.toLocaleString()} known` : ''})`;
      if (vocabRecent && data.recent && data.recent.length) {
        const r = data.recent[data.recent.length - 1];
        vocabRecent.textContent = `"${r.word}" (${r.partOfSpeech}): ${r.definition}`;
      }
      window.__lexiconNextAt = data.nextTickAt;
    } catch (e) {}
  }

  refresh();
  setInterval(refresh, 12000);

  setInterval(() => {
    if (!window.__lexiconNextAt || !vocabNext) return;
    const remaining = Math.max(0, Math.round((window.__lexiconNextAt - Date.now()) / 1000));
    vocabNext.textContent = `next in ${remaining}s`;
  }, 1000);
}

function formatEta(digest) {
  if (!digest) return 'ETA: --';
  if (digest.backlog === 0 && digest.totalTopics > 0) return 'ETA: caught up';
  if (digest.etaMinutes == null) return 'ETA: calculating...';
  if (digest.etaMinutes < 1) return 'ETA: <1m';
  if (digest.etaMinutes < 60) return `ETA: ${digest.etaMinutes}m`;
  return `ETA: ${Math.round((digest.etaMinutes / 60) * 10) / 10}h`;
}

function renderMind(mind) {
  const moodEl = document.getElementById('mindMood');
  const focusEl = document.getElementById('mindFocus');
  const goalEl = document.getElementById('mindGoal');
  const curiosityBar = document.getElementById('curiosityBar');
  const confidenceBar = document.getElementById('confidenceBar');
  if (moodEl) moodEl.textContent = mind.mood;
  if (focusEl) focusEl.textContent = mind.focusTopic || '—';
  if (goalEl) goalEl.textContent = mind.activeGoal || '—';
  if (curiosityBar) curiosityBar.style.width = `${Math.round((mind.curiosity || 0) * 100)}%`;
  if (confidenceBar) confidenceBar.style.width = `${Math.round((mind.confidence || 0) * 100)}%`;

  const digest = mind.digest;
  const digestPercent = document.getElementById('digestPercent');
  const digestBar = document.getElementById('digestBar');
  const digestEta = document.getElementById('digestEta');
  const digestDetail = document.getElementById('digestDetail');
  if (digest) {
    if (digestPercent) digestPercent.textContent = `${digest.percent}%`;
    if (digestBar) digestBar.style.width = `${digest.percent}%`;
    if (digestEta) digestEta.textContent = formatEta(digest);
    if (digestDetail) digestDetail.textContent = `${digest.answeredTopics} / ${digest.totalTopics} topics resolved${digest.ratePerMin ? ` — ${digest.ratePerMin}/min` : ''}`;
  }
}

async function initMind() {
  try {
    const mind = await (await fetch('/api/mind')).json();
    renderMind(mind);
  } catch (e) {}
}

async function initNetFeedControls() {
  const netTriggerBtn = document.getElementById('netTriggerBtn');
  const netNextCycle = document.getElementById('netNextCycle');
  const netFeedText = document.getElementById('netFeedText');

  try {
    const recent = await (await fetch('/api/feed/recent')).json();
    if (recent.length && netFeedText) netFeedText.textContent = `[${recent[0].feedSource}] ${recent[0].title}`;
  } catch (e) {}

  if (netTriggerBtn) {
    netTriggerBtn.addEventListener('click', async () => {
      netTriggerBtn.disabled = true;
      await fetch('/api/feed/trigger', { method: 'POST' });
      setTimeout(refreshNetNext, 500);
      setTimeout(() => (netTriggerBtn.disabled = false), 1500);
    });
  }

  async function refreshNetNext() {
    try {
      const data = await (await fetch('/api/feed/next')).json();
      window.__netNextAt = data.nextTickAt;
    } catch (e) {}
  }

  refreshNetNext();
  setInterval(refreshNetNext, 15000);

  setInterval(() => {
    if (!window.__netNextAt || !netNextCycle) return;
    const remaining = Math.max(0, Math.round((window.__netNextAt - Date.now()) / 1000));
    netNextCycle.textContent = `NEXT: ${remaining}s`;
  }, 1000);
}

function initReasoningControls() {
  const triggerBtn = document.getElementById('triggerBtn');
  const nextCycle = document.getElementById('nextCycle');
  if (!triggerBtn || !nextCycle) return;

  triggerBtn.addEventListener('click', async () => {
    triggerBtn.disabled = true;
    await fetch('/api/reasoning/trigger', { method: 'POST' });
    setTimeout(refreshNextCycle, 500);
    setTimeout(() => (triggerBtn.disabled = false), 1000);
  });

  async function refreshNextCycle() {
    try {
      const res = await fetch('/api/reasoning/next');
      const data = await res.json();
      window.__nextTickAt = data.nextTickAt;
    } catch (e) {}
  }

  refreshNextCycle();
  setInterval(refreshNextCycle, 15000);

  setInterval(() => {
    if (!window.__nextTickAt) return;
    const remaining = Math.max(0, Math.round((window.__nextTickAt - Date.now()) / 1000));
    nextCycle.textContent = `NEXT: ${remaining}s`;
  }, 1000);

  // reasoning keeps running continuously in the backend regardless of whether this is open —
  // the modal is just an on-demand window into it, not a requirement for it to function
  const viewLogBtn = document.getElementById('viewLogBtn');
  const closeLogBtn = document.getElementById('closeLogBtn');
  const modal = document.getElementById('reasoningLogModal');
  if (viewLogBtn && modal) {
    viewLogBtn.addEventListener('click', () => {
      modal.classList.remove('hidden');
      loadReasoningHistory();
    });
  }
  if (closeLogBtn && modal) {
    closeLogBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
  }
}

// ---------- Voice command layer ----------
function submitChatText(text) {
  chatInput.value = text;
  chatForm.requestSubmit();
}

// local "active commands" resolved instantly, without hitting the chat pipeline
const VOICE_COMMANDS = [
  { pattern: /^clear (the )?(chat|dialogue|log)$/i, action: () => { chatLog.innerHTML = ''; addChatMsg('bot', 'DIALOGUE LOG CLEARED.'); } },
  { pattern: /^clear (the )?(reasoning|feed)$/i, action: () => { reasoningLog.innerHTML = ''; addChatMsg('bot', 'REASONING FEED CLEARED (display only — files retained).'); } },
  { pattern: /^(show|refresh) (status|blocks)$/i, action: async () => {
    try {
      const data = await (await fetch('/api/memory')).json();
      addChatMsg('bot', `STATUS OK. BLOCKS: ${data.blocks.length}`);
    } catch (e) {
      addChatMsg('bot', 'STATUS OK.');
    }
  } },
  { pattern: /^lock( system)?$/i, action: () => { app.classList.add('hidden'); gate.classList.remove('hidden'); passwordInput.value=''; } },
];

function resolveVoiceCommand(transcript) {
  const clean = transcript.trim().replace(/[.!?]+$/, '');
  for (const cmd of VOICE_COMMANDS) {
    if (cmd.pattern.test(clean)) {
      cmd.action();
      return true;
    }
  }
  return false;
}

function initVoice() {
  const micBtn = document.getElementById('micBtn');
  const voiceStatus = document.getElementById('voiceStatus');
  if (!micBtn) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.disabled = true;
    micBtn.title = 'voice recognition not supported in this browser';
    voiceStatus.textContent = 'VOICE INPUT UNAVAILABLE IN THIS BROWSER';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = true;

  let listening = false;

  recognition.onstart = () => {
    listening = true;
    micBtn.classList.add('listening');
    statusLine.textContent = 'STATUS: LISTENING...';
    voiceStatus.textContent = 'LISTENING...';
  };

  recognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += t;
      else interim += t;
    }
    if (interim) voiceStatus.textContent = `HEARING: "${interim.trim()}"`;
    if (final) {
      voiceStatus.textContent = `TRANSCRIBED: "${final.trim()}"`;
      const wasCommand = resolveVoiceCommand(final);
      if (!wasCommand) submitChatText(final.trim());
    }
  };

  recognition.onerror = (event) => {
    voiceStatus.textContent = `VOICE ERROR: ${event.error}`;
  };

  recognition.onend = () => {
    listening = false;
    micBtn.classList.remove('listening');
    statusLine.textContent = 'STATUS: IDLE';
    setTimeout(() => { if (!listening) voiceStatus.textContent = ''; }, 2500);
  };

  micBtn.addEventListener('click', () => {
    if (listening) {
      recognition.stop();
    } else {
      try { recognition.start(); } catch (e) {}
    }
  });
}
