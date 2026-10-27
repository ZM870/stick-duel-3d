import { Arena } from './arena.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { Game } from './game.js';
import { CHARACTERS, CHARACTER_ORDER } from './config.js';
import { LanClient } from './net.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('game');
const arena = new Arena(canvas);
const input = new Input();
input.bind();
const audio = new AudioEngine();

// Bambu Studio / 3MF 导出的网格（骨骼版优先，静态版 fallback）
const loadedModels = {};
const gltfLoader = new GLTFLoader();

async function loadPair(id, riggedUrl, staticUrl) {
  try {
    const gltf = await gltfLoader.loadAsync(riggedUrl);
    loadedModels[id] = { scene: gltf.scene, animations: gltf.animations };
    return;
  } catch (err) {
    console.warn(`${id} 骨骼 GLB 加载失败，尝试静态网格`, err);
  }
  try {
    const gltf = await gltfLoader.loadAsync(staticUrl);
    loadedModels[id] = { scene: gltf.scene, animations: [] };
  } catch (err) {
    console.warn(`${id} 静态 GLB 也加载失败，使用程序化模型`, err);
  }
}

const MODEL_URLS = {
  naigou: './assets/models/naigou_rigged.glb',
  naiwa: './assets/models/naiwa_rigged.glb?v=13',
  naishu: './assets/models/naishu_rigged.glb',
  penguin: './assets/models/penguin_rigged.glb?v=3',
};
const MODEL_STATIC_URLS = {
  naigou: './assets/models/naigou_bambu.glb',
  naiwa: './assets/models/naiwa_bambu.glb',
  naishu: './assets/models/naishu_bambu.glb',
  penguin: './assets/models/penguin_bambu.glb?v=3',
};
const modelLoads = new Map();

async function ensureModel(id) {
  const char = CHARACTERS[id];
  if (!char?.modelUrl || loadedModels[id]) return;
  if (modelLoads.has(id)) return modelLoads.get(id);
  const rigged = MODEL_URLS[id];
  const staticUrl = MODEL_STATIC_URLS[id];
  if (!rigged) return;
  const job = loadPair(id, rigged, staticUrl)
    .then(() => arena.addBambuModels(loadedModels))
    .finally(() => modelLoads.delete(id));
  modelLoads.set(id, job);
  return job;
}

function ensurePair(a, b) {
  return Promise.all([ensureModel(a), ensureModel(b)]);
}
let game = null;

const menu = document.getElementById('menu');
const result = document.getElementById('result');
const startBtn = document.getElementById('start-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const muteBtn = document.getElementById('mute-btn');
const restartBtn = document.getElementById('restart-btn');
const continueBtn = document.getElementById('continue-btn');
const exitBtn = document.getElementById('exit-btn');
const errorBanner = document.getElementById('error-banner');
const p1Roster = document.getElementById('p1-roster');
const p2Roster = document.getElementById('p2-roster');
const matchupEl = document.getElementById('matchup');
const difficultyOptions = document.getElementById('difficulty-options');
const characterSelect = document.getElementById('character-select');
const characterCards = document.getElementById('character-cards');
const selectOpponent = document.getElementById('select-opponent');
const selectBack = document.getElementById('select-back');
const selectConfirm = document.getElementById('select-confirm');
const loading = document.getElementById('loading');
const forceLandscapeBtn = document.getElementById('force-landscape');
const lanBtn = document.getElementById('lan-btn');
const lanMenu = document.getElementById('lan-menu');
const lanCreate = document.getElementById('lan-create');
const lanIp = document.getElementById('lan-ip');
const lanDirectUrl = document.getElementById('lan-direct-url');
const lanIpInput = document.getElementById('lan-ip-input');
const lanJoin = document.getElementById('lan-join');
const lanStatus = document.getElementById('lan-status');
const lanChars = document.getElementById('lan-chars');
const lanRoleLabel = document.getElementById('lan-role-label');
const lanStart = document.getElementById('lan-start');
const lanBack = document.getElementById('lan-back');
const lanPause = document.getElementById('lan-pause');
const lanResume = document.getElementById('lan-resume');
const lanExit = document.getElementById('lan-exit');

let selectedP1 = CHARACTER_ORDER[0];
let selectedP2 = CHARACTER_ORDER[1];
let selectedDifficulty = 'normal';

// 纯静态托管（Cloudflare Pages 等）没有 Node WebSocket，隐藏局域网入口
const staticHost = /(^|\.)(pages\.dev|netlify\.app|vercel\.app|github\.io)$/i.test(location.hostname) ||
  /trycloudflare\.com|tunnelmole\.net$/i.test(location.hostname);
if (staticHost) {
  const lanEntry = document.getElementById('lan-btn');
  if (lanEntry) lanEntry.style.display = 'none';
}

let lanConn = null;
let lanRole = null;
let lanHostChar = null;
let lanClientChar = null;
let lanRunning = false;
let lanStarting = false;
let lanClosing = false;
let lanPaused = false;

function colorHex(c) {
  return `#${c.toString(16).padStart(6, '0')}`;
}

function renderRoster() {
  for (const [el, selected, side] of [[p1Roster, selectedP1, 0], [p2Roster, selectedP2, 1]]) {
    if (!el) continue;
    el.innerHTML = CHARACTER_ORDER.map((id) => {
      const c = CHARACTERS[id];
      return `<button type="button" class="char-chip${id === selected ? ' active' : ''}" data-char="${id}" data-side="${side}" style="--chip:${colorHex(c.accent)}"><i></i>${c.name}</button>`;
    }).join('');
  }
  if (matchupEl) matchupEl.textContent = `${CHARACTERS[selectedP1].name}  VS  电脑·${CHARACTERS[selectedP2].name}`;
}

for (const [el, side] of [[p1Roster, 0], [p2Roster, 1]]) {
  el?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-char]');
    if (!btn) return;
    audio.resume();
    if (side === 0) selectedP1 = btn.dataset.char;
    else selectedP2 = btn.dataset.char;
    renderRoster();
  });
}
renderRoster();

function renderDifficulty() {
  if (!difficultyOptions) return;
  for (const btn of difficultyOptions.querySelectorAll('[data-difficulty]')) {
    btn.classList.toggle('active', btn.dataset.difficulty === selectedDifficulty);
  }
}

difficultyOptions?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-difficulty]');
  if (!btn) return;
  audio.resume();
  selectedDifficulty = btn.dataset.difficulty;
  game?.setDifficulty(selectedDifficulty);
  renderDifficulty();
});
renderDifficulty();

const isTouch =
  window.matchMedia?.('(pointer: coarse)').matches ||
  (navigator.maxTouchPoints || 0) > 0;

function showError(message) {
  if (!errorBanner) return;
  errorBanner.textContent = `运行错误：${String(message).slice(0, 500)}`;
  errorBanner.classList.add('show');
  console.error(message);
}

window.addEventListener('error', (e) => showError(e.error?.stack || e.message));
window.addEventListener('unhandledrejection', (e) => showError(e.reason?.stack || e.reason));

async function goFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
    }
    if (screen.orientation?.lock) {
      await screen.orientation.lock('landscape').catch(() => {});
    }
  } catch {
    // 用户拒绝或浏览器不支持：忽略
  }
}

function forceLandscape() {
  audio.resume();
  document.body.classList.add('forced-landscape');
  requestAnimationFrame(() => {
    arena.resize();
    setTimeout(() => arena.resize(), 180);
  });
  goFullscreen();
}

forceLandscapeBtn?.addEventListener('click', forceLandscape);

function renderCharacterCards() {
  if (!characterCards) return;
  characterCards.innerHTML = CHARACTER_ORDER.map((id) => {
    const c = CHARACTERS[id];
    const accent = colorHex(c.accent ?? c.bodyColor ?? 0xffd45c);
    const body = colorHex(c.bodyColor ?? c.accent ?? 0xffd45c);
    const belly = colorHex(c.bellyColor ?? 0xfff1cf);
    const active = id === selectedP1;
    return `<button type="button" class="char-card${active ? ' active' : ''}" data-select-char="${id}" style="--accent:${accent};--body:${body};--belly:${belly}">
      <div class="char-avatar" aria-hidden="true"></div>
      <h3>${c.name}<small>${c.title ?? ''}</small></h3>
      <div class="char-sub">HP ${c.maxHp} · 速度 ${c.speed}</div>
      <div class="char-stats"><span>${c.skills.attack.name}</span><span>${c.skills.skill1.name}</span></div>
      <div class="char-skill">技2：${c.skills.skill2.name} · 奥义：${c.skills.ultimate.name}</div>
    </button>`;
  }).join('');
  if (selectOpponent) {
    selectOpponent.innerHTML = `你的对手：<b>电脑 · ${CHARACTERS[selectedP2].name}</b>`;
  }
}

function openCharacterSelect() {
  audio.resume();
  result?.classList.remove('show');
  menu?.classList.add('hidden');
  characterSelect?.classList.add('show');
  renderCharacterCards();
  ensureModel(selectedP1);
}

function closeCharacterSelect() {
  characterSelect?.classList.remove('show');
  menu?.classList.remove('hidden');
  renderRoster();
}

characterCards?.addEventListener('click', (e) => {
  const card = e.target.closest('[data-select-char]');
  if (!card) return;
  audio.resume();
  selectedP1 = card.dataset.selectChar;
  renderCharacterCards();
  renderRoster();
  ensureModel(selectedP1);
});

selectBack?.addEventListener('click', closeCharacterSelect);
selectConfirm?.addEventListener('click', startGame);

let starting = false;

async function startGame() {
  if (starting) return;
  starting = true;
  if (selectConfirm) selectConfirm.disabled = true;
  audio.resume();
  try {
    loading?.classList.add('show');
    // 只加载当前选中的两名角色，不再等全部模型下载完
    await ensurePair(selectedP1, selectedP2);
    if (!game) {
      game = new Game(arena, input, audio, loadedModels);
      window.__game = game;
      game.setDifficulty(selectedDifficulty);
    }
    lanMenu?.classList.remove('show');
    continueBtn.hidden = false;
    if (exitBtn) exitBtn.textContent = '退出';
    loading?.classList.remove('show');
    menu?.classList.add('hidden');
    characterSelect?.classList.remove('show');
    result?.classList.remove('show');
    document.body.classList.add('playing');
    game.setDifficulty(selectedDifficulty);
    game.startMatch(selectedP1, selectedP2);
    if (isTouch) goFullscreen();
  } catch (err) {
    loading?.classList.remove('show');
    showError(err?.stack || err?.message || err);
  } finally {
    starting = false;
    if (selectConfirm) selectConfirm.disabled = false;
  }
}

startBtn?.addEventListener('click', openCharacterSelect);

function continueMatch() {
  if (lanRunning) {
    exitToMenu();
    return;
  }
  result?.classList.remove('show');
  document.body.classList.remove('result-open');
  menu?.classList.add('hidden');
  characterSelect?.classList.remove('show');
  document.body.classList.add('playing');
  if (!game) {
    startGame();
    return;
  }
  audio.resume();
  game.setDifficulty(selectedDifficulty);
  game.startMatch(selectedP1, selectedP2);
}

function exitToMenu() {
  if (lanRunning || lanConn) closeLanSession(false);
  result?.classList.remove('show');
  characterSelect?.classList.remove('show');
  menu?.classList.remove('hidden');
  document.body.classList.remove('result-open', 'playing');
  game?.returnToMenu();
  continueBtn.hidden = false;
  if (exitBtn) exitBtn.textContent = '退出';
  renderRoster();
  renderCharacterCards();
}

function lanSetStatus(text) {
  if (lanStatus) lanStatus.textContent = text || '';
}

function lanShowChars() {
  if (!lanChars) return;
  lanChars.hidden = false;
  if (lanRoleLabel) lanRoleLabel.textContent = lanRole === 'host' ? '主机 · 选择你的角色' : '客户端 · 选择你的角色';
}

function lanRenderChars() {
  for (const btn of lanChars?.querySelectorAll('[data-lan-char]') || []) {
    const own = lanRole === 'host' ? lanHostChar : lanClientChar;
    btn.classList.toggle('active', btn.dataset.lanChar === own);
  }
  if (lanStart) {
    lanStart.hidden = !(lanRole === 'host' && lanHostChar && lanClientChar && lanHostChar !== lanClientChar);
  }
}

function lanWsUrl(raw) {
  let host = String(raw || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  if (!host) return null;
  if (!/:\d+$/.test(host)) host += `:${location.port || 8080}`;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws`;
}

function lanAttach(conn) {
  conn.on('created', (msg) => {
    lanRole = 'host';
    if (lanIp) lanIp.textContent = `${msg.ip}:${msg.port}`;
    if (lanDirectUrl) lanDirectUrl.textContent = `http://${msg.ip}:${msg.port}`;
    lanSetStatus('房间已创建，等待玩家加入');
    lanShowChars();
    lanRenderChars();
  });
  conn.on('joined', (msg) => {
    lanRole = 'client';
    if (msg.hostChar) lanHostChar = msg.hostChar;
    lanSetStatus('已加入房间，等待主机开始');
    lanShowChars();
    lanRenderChars();
  });
  conn.on('peerJoined', () => {
    lanSetStatus('客户端已连接，等待选人');
    lanShowChars();
  });
  conn.on('peerChar', (msg) => {
    if (lanRole === 'host') lanClientChar = msg.char;
    else lanHostChar = msg.char;
    lanRenderChars();
    if (lanHostChar && lanClientChar && lanHostChar === lanClientChar) {
      lanSetStatus('双方不能选择同一个角色');
    } else if (lanHostChar && lanClientChar) {
      lanSetStatus(lanRole === 'host' ? '双方已选人，可以开始' : '等待主机开始');
    }
  });
  conn.on('start', (msg) => {
    startLanBattle(msg.hostChar, msg.clientChar);
  });
  conn.on('state', (msg) => game?.receiveLanState(msg));
  conn.on('event', (msg) => game?.receiveLanEvents(msg.events));
  conn.on('input', (msg) => game?.applyLanInput(msg));
  conn.on('pause', (msg) => {
    if (!game) return;
    game.paused = !!msg.paused;
    lanPaused = !!msg.paused;
    showLanPause(lanPaused);
  });
  conn.on('pauseRequest', () => {
    if (lanRole === 'host') {
      const paused = !game?.paused;
      if (game) game.paused = paused;
      lanPaused = paused;
      conn.send('pause', { paused });
      showLanPause(paused);
    }
  });
  conn.on('peerLeft', (msg) => lanFatal(msg.message || '对方已断开'));
  conn.on('error', (msg) => lanSetStatus(msg.message || '连接失败'));
  conn.on('close', () => {
    if (!lanClosing) lanFatal('连接已断开');
  });
}

async function lanCreateRoom() {
  if (lanConn) closeLanSession(false);
  lanRole = 'host';
  lanHostChar = null;
  lanClientChar = null;
  lanSetStatus('正在创建房间...');
  const conn = new LanClient();
  lanConn = conn;
  lanAttach(conn);
  try {
    await conn.connect(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    conn.send('create');
  } catch (err) {
    lanSetStatus(err.message);
    closeLanSession(false);
  }
}

async function lanJoinRoom() {
  if (location.protocol === 'https:') {
    lanSetStatus('当前是 HTTPS 公网页面，不能直连局域网。请用 http://主机IP:8080 打开后再加入');
    return;
  }
  const url = lanWsUrl(lanIpInput?.value);
  if (!url) {
    lanSetStatus('请输入主机 IP');
    return;
  }
  if (lanConn) closeLanSession(false);
  lanRole = 'client';
  lanHostChar = null;
  lanClientChar = null;
  lanSetStatus('正在连接主机...');
  const conn = new LanClient();
  lanConn = conn;
  lanAttach(conn);
  try {
    await conn.connect(url);
    conn.send('join');
  } catch (err) {
    lanSetStatus(err.message);
    closeLanSession(false);
  }
}

async function startLanBattle(hostChar, clientChar) {
  if (lanStarting) return;
  lanStarting = true;
  lanRunning = true;
  lanPaused = false;
  lanSetStatus('正在加载角色...');
  try {
    await ensurePair(hostChar, clientChar);
    if (!game) {
      game = new Game(arena, input, audio, loadedModels);
      window.__game = game;
    }
    lanMenu?.classList.remove('show');
    menu?.classList.add('hidden');
    characterSelect?.classList.remove('show');
    result?.classList.remove('show');
    lanPause?.classList.remove('show');
    document.body.classList.add('playing');
    document.body.classList.remove('result-open');
    if (lanRole === 'host') {
      game.setupLanHost(hostChar, clientChar, (msg) => lanConn?.sendRaw(msg));
    } else {
      game.setupLanClient(hostChar, clientChar, (msg) => lanConn?.sendRaw(msg));
      audio.resume();
      audio.startBattleBgm();
    }
    continueBtn.hidden = true;
    if (exitBtn) exitBtn.textContent = '返回菜单';
    lanSetStatus('');
    if (isTouch) goFullscreen();
  } catch (err) {
    lanRunning = false;
    lanSetStatus(err?.message || '加载失败');
    showError(err?.stack || err?.message || err);
  } finally {
    lanStarting = false;
  }
}

function closeLanSession(toMenu = true) {
  lanClosing = true;
  try { lanConn?.close(); } catch { /* ignore */ }
  lanConn = null;
  lanRole = null;
  lanRunning = false;
  lanPaused = false;
  lanHostChar = null;
  lanClientChar = null;
  showLanPause(false);
  if (game) {
    game.paused = false;
    game.netMode = null;
  }
  lanMenu?.classList.remove('show');
  if (toMenu) {
    menu?.classList.remove('hidden');
    document.body.classList.remove('playing', 'result-open');
    game?.returnToMenu();
    continueBtn.hidden = false;
    if (exitBtn) exitBtn.textContent = '退出';
  }
  setTimeout(() => { lanClosing = false; }, 80);
}

function lanFatal(message) {
  if (lanClosing) return;
  showError(message);
  closeLanSession(true);
}

function showLanPause(show) {
  lanPause?.classList.toggle('show', !!show);
  document.body.classList.toggle('lan-paused', !!show);
}

function toggleLanPause() {
  if (!lanRunning || !game || !lanConn || game.state === 'matchOver') return;
  if (lanRole === 'host') {
    const paused = !game.paused;
    game.paused = paused;
    lanPaused = paused;
    lanConn.send('pause', { paused });
    showLanPause(paused);
  } else {
    lanConn.send('pauseRequest', {});
  }
}

lanBtn?.addEventListener('click', () => {
  menu?.classList.add('hidden');
  lanMenu?.classList.add('show');
  lanSetStatus('未连接');
  if (lanIp) lanIp.textContent = '--';
  lanChars.hidden = true;
  if (lanStart) lanStart.hidden = true;
  if (lanIpInput) lanIpInput.value = '';
  lanRole = null;
  lanHostChar = null;
  lanClientChar = null;
  lanRenderChars();
});
lanCreate?.addEventListener('click', lanCreateRoom);
lanJoin?.addEventListener('click', lanJoinRoom);
lanBack?.addEventListener('click', () => {
  closeLanSession(true);
  lanMenu?.classList.remove('show');
});
lanChars?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-lan-char]');
  if (!btn || !lanConn) return;
  const char = btn.dataset.lanChar;
  if ((lanRole === 'host' ? lanClientChar : lanHostChar) === char) {
    lanSetStatus('这个角色已被对方选择');
    return;
  }
  if (lanRole === 'host') lanHostChar = char;
  else lanClientChar = char;
  lanConn.send('char', { char });
  lanRenderChars();
});
lanStart?.addEventListener('click', () => {
  if (lanRole !== 'host' || !lanHostChar || !lanClientChar) return;
  lanConn?.send('start', { hostChar: lanHostChar, clientChar: lanClientChar });
});
lanResume?.addEventListener('click', () => {
  if (!lanConn || !game) return;
  if (lanRole === 'host') {
    game.paused = false;
    lanPaused = false;
    lanConn.send('pause', { paused: false });
    showLanPause(false);
  } else {
    lanConn.send('pauseRequest', {});
  }
});
lanExit?.addEventListener('click', () => {
  closeLanSession(true);
  lanMenu?.classList.remove('show');
});

continueBtn?.addEventListener('click', continueMatch);
exitBtn?.addEventListener('click', exitToMenu);
restartBtn?.addEventListener('click', continueMatch);
fullscreenBtn?.addEventListener('click', goFullscreen);
muteBtn?.addEventListener('click', () => {
  audio.enabled = !audio.enabled;
  if (!audio.enabled) {
    audio.stopRasenganCharge();
    audio.stopNaiwaUltimate();
    audio.stopPenguinSong();
    audio.stopPenguinUltimate(200);
    audio.stopBattleBgm(250);
  } else if (game?.state === 'fighting') {
    audio.startBattleBgm();
  }
  muteBtn.textContent = audio.enabled ? '声音：开' : '声音：关';
});

window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select')) return;
  if (lanMenu?.classList.contains('show') && e.code === 'Escape') {
    e.preventDefault();
    closeLanSession(true);
    lanMenu.classList.remove('show');
    return;
  }
  if (lanRunning && game && e.code === 'Escape' && !result?.classList.contains('show')) {
    e.preventDefault();
    toggleLanPause();
    return;
  }
  const selectOpen = characterSelect?.classList.contains('show');
  if (selectOpen) {
    if (e.code === 'Enter' || e.code === 'Space') {
      if (e.target.closest?.('[data-select-char], #select-confirm, #select-back')) return;
      e.preventDefault();
      startGame();
    } else if (e.code === 'Escape') {
      e.preventDefault();
      closeCharacterSelect();
    }
    return;
  }
  if (e.code === 'Enter' || e.code === 'Space') {
    if (menu && !menu.classList.contains('hidden')) {
      e.preventDefault();
      openCharacterSelect();
    } else if (result.classList.contains('show')) {
      e.preventDefault();
      continueMatch();
    }
  }
  if (e.code === 'Escape' && result.classList.contains('show')) {
    e.preventDefault();
    exitToMenu();
  }
  if (e.code === 'KeyM') {
    audio.enabled = !audio.enabled;
    if (!audio.enabled) {
      audio.stopRasenganCharge();
      audio.stopNaiwaUltimate();
      audio.stopPenguinSong();
      audio.stopPenguinUltimate(200);
      audio.stopBattleBgm(250);
    } else if (game?.state === 'fighting') {
      audio.startBattleBgm();
    }
    if (muteBtn) muteBtn.textContent = audio.enabled ? '声音：开' : '声音：关';
  }
});

function handleResize() {
  if (window.innerWidth > window.innerHeight) {
    document.body.classList.remove('forced-landscape');
  }
  arena.resize();
}

window.addEventListener('resize', handleResize);
window.visualViewport?.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', () => setTimeout(handleResize, 250));

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  if (game) {
    game.update(dt);
    game.render();
  } else {
    arena.render();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 调试/截图：?auto=1 直接开局
const params = new URLSearchParams(location.search);
if (params.get('auto') === '1') {
  startGame();
}

window.__game = game;
window.__arena = arena;
