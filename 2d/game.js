/* 奶黄小队 2D 横屏对战 - 独立新版本 */
(() => {
  'use strict';
  const canvas = document.getElementById('arena');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const W = 1280, H = 720;
  const GROUND = 590;
  const WORLD_W = 5200;
  const ARENA_LEFT = 140, ARENA_RIGHT = WORLD_W - 140;

  const CHARS = {
    naiwa: {
      id: 'naiwa', name: '奶娃', title: '黄色豆泥人', img: './assets/chars/naiwa.png',
      hp: 1120, speed: 270, scale: 1.0, hip: 0.63, color: '#ffd45c', accent: '#ff9f43',
      skills: { attack: '奶娃拳', skill1: '奶娃冲撞', skill2: '奶娃火球', ultimate: '奶娃爆发' },
    },
    naishu: {
      id: 'naishu', name: '奶鼠', title: '黄色大耳鼠', img: './assets/chars/naishu.png',
      hp: 960, speed: 310, scale: 0.98, hip: 0.64, color: '#ffe38a', accent: '#f3b94c',
      skills: { attack: '鼠鼠掌', skill1: '大耳飞扑', skill2: '奶酪弹', ultimate: '鼠鼠风暴' },
    },
    penguin: {
      id: 'penguin', name: '企鹅', title: '企鹅女孩', img: './assets/chars/penguin.png',
      hp: 1040, speed: 285, scale: 1.05, hip: 0.63, color: '#9fe8ff', accent: '#ffb15c',
      skills: { attack: '企鹅啄', skill1: '滑冰冲撞', skill2: '冰弹', ultimate: '极寒风暴' },
    },
    thanos: {
      id: 'thanos', name: '灭霸', title: '泰坦征服者', img: './assets/chars/thanos.png',
      hp: 1600, speed: 225, scale: 1.24, hip: 0.56, color: '#8f5cff', accent: '#eebd62',
      skills: { attack: '泰坦重击', skill1: '空间拉扯', skill2: '泰坦硬壳', ultimate: '平衡裁决' },
    },
  };
  const ORDER = ['naiwa', 'naishu', 'penguin', 'thanos'];
  const JIANGUO_IMG = './assets/chars/jianguo.png';
  const images = {};
  let selected = 'naiwa';
  let game = null;
  let audioCtx = null;
  let lastTime = 0;
  const keys = new Set();
  const pressed = new Set();
  const touch = { left: false, right: false };

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  async function preload() {
    const list = ORDER.map((id) => CHARS[id]);
    list.push({ img: JIANGUO_IMG });
    await Promise.all(list.map(async (c) => {
      images[c.img] = await loadImage(c.img);
    }));
    $('loading2d').classList.remove('show');
    renderMenu();
  }

  function renderMenu() {
    const grid = $('char-grid');
    grid.innerHTML = ORDER.map((id) => {
      const c = CHARS[id];
      return `<button class="char-card2d ${id === selected ? 'active' : ''}" data-char2d="${id}">
        <img src="${c.img}" alt="${c.name}" />
        <div class="cname">${c.name}</div><div class="ctag">${c.title}</div>
      </button>`;
    }).join('');
    grid.querySelectorAll('[data-char2d]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selected = btn.dataset.char2d;
        renderMenu();
        ensureAudio();
      });
    });
  }

  function ensureAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch { /* ignore */ }
  }
  function tone(freq, dur, type = 'sine', vol = 0.045, slide = 0) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(25, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + dur + 0.03);
  }
  function thump() { tone(95, 0.13, 'triangle', 0.08, -45); }
  function slash() { tone(720, 0.08, 'sawtooth', 0.025, 300); }
  function hitSound() { tone(150, 0.1, 'square', 0.04, -80); thump(); }
  function ultimateSound() { tone(70, 0.6, 'sawtooth', 0.07, 55); }

  class Fighter {
    constructor(id, x, facing, isAI = false) {
      this.data = CHARS[id]; this.id = id; this.x = x; this.y = 0; this.vx = 0; this.vy = 0;
      this.facing = facing; this.isAI = isAI; this.hp = this.data.hp; this.maxHp = this.data.hp;
      this.energy = 40; this.state = 'idle'; this.time = 0; this.anim = Math.random() * 4;
      this.attackCd = 0; this.skill1Cd = 0; this.skill2Cd = 0; this.ultCd = 0; this.dodgeCd = 0;
      this.hitFlash = 0; this.dodgeTime = 0; this.hitStun = 0; this.combo = 0; this.comboTimer = 0;
      this.roundWins = 0; this.guarding = false; this.guardTime = 0; this.projectiles = [];
      this.isKo = false;
    }
    get img() { return images[this.data.img]; }
    get bodyH() { return 292 * this.data.scale; }
    get bodyW() { return this.img ? this.bodyH * this.img.width / this.img.height : 150; }
    canAct() { return this.hitStun <= 0 && this.state !== 'ko' && this.state !== 'attack' && this.state !== 'skill' && this.state !== 'ultimate' && this.state !== 'dodge'; }
    move(dir) {
      if (!this.canAct()) return;
      this.vx += dir * this.data.speed * 8.5 * (1 / 60);
      this.facing = dir > 0 ? 1 : -1;
    }
    jump() {
      if (!this.canAct() || this.y > 0.1) return;
      this.vy = -680; this.y = 0.1; tone(210, 0.1, 'triangle', 0.02, 100);
    }
    dodge() {
      if (!this.canAct() || this.dodgeCd > 0) return;
      this.dodgeCd = 3; this.dodgeTime = 0.36; this.state = 'dodge'; this.time = 0;
      this.vx = this.facing * 560; tone(500, 0.12, 'sawtooth', 0.02, -250);
    }
    attack() {
      if (!this.canAct() || this.attackCd > 0) return;
      this.state = 'attack'; this.time = 0; this.attackCd = 0.30; this.combo = this.comboTimer > 0 ? (this.combo + 1) % 4 : 0;
      this.comboTimer = 0.72; this.hitDone = false; slash();
    }
    skill1() {
      if (!this.canAct() || this.skill1Cd > 0 || this.energy < 15) return;
      this.state = 'skill'; this.skillKind = 'dash'; this.time = 0; this.hitDone = false;
      this.skill1Cd = this.id === 'thanos' ? 8 : 5; this.energy -= 15;
      this.vx = this.facing * (this.id === 'thanos' ? 400 : 700); this.skillColor = this.data.accent;
      tone(280, 0.18, 'sawtooth', 0.04, 180);
    }
    skill2() {
      if (!this.canAct() || this.skill2Cd > 0 || this.energy < 20) return;
      this.state = 'skill'; this.skillKind = 'projectile'; this.time = 0; this.hitDone = false;
      this.skill2Cd = this.id === 'thanos' ? 12 : 6; this.energy -= 20; this.skillColor = this.id === 'thanos' ? '#eebd62' : this.data.color;
      this.projectiles.push({ x: this.x + this.facing * 50, y: GROUND - this.bodyH * 0.58, vx: this.facing * 760, r: this.id === 'thanos' ? 30 : 20, color: this.skillColor, owner: this, life: 1.4 });
      tone(360, 0.2, 'triangle', 0.035, 220);
    }
    ultimate() {
      if (!this.canAct() || this.ultCd > 0 || this.energy < 100) return;
      this.state = 'ultimate'; this.time = 0; this.ultCd = 18; this.energy = 0; this.hitDone = false;
      this.ultWave = 0; this.summon = null;
      if (this.id === 'thanos') {
        this.summon = { x: this.x + this.facing * 120, hp: 320, timer: 4, punch: 1.2, img: images[JIANGUO_IMG] };
      }
      ultimateSound();
    }
    takeHit(dmg, from) {
      if (this.state === 'dodge' || this.state === 'ko') return false;
      const guard = this.state === 'ultimate' && this.id === 'thanos' ? 0.65 : 1;
      this.hp = Math.max(0, this.hp - dmg * guard);
      this.hitFlash = 1; this.hitStun = 0.18; this.vx = Math.sign(this.x - from.x) * 180;
      this.state = 'hit'; this.time = 0; hitSound();
      if (this.hp <= 0) { this.hp = 0; this.state = 'ko'; this.isKo = true; this.time = 0; }
      return true;
    }
    update(dt, opponent) {
      this.time += dt; this.anim += dt;
      this.attackCd = Math.max(0, this.attackCd - dt); this.skill1Cd = Math.max(0, this.skill1Cd - dt);
      this.skill2Cd = Math.max(0, this.skill2Cd - dt); this.ultCd = Math.max(0, this.ultCd - dt);
      this.dodgeCd = Math.max(0, this.dodgeCd - dt); this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
      this.hitStun = Math.max(0, this.hitStun - dt); this.comboTimer = Math.max(0, this.comboTimer - dt);
      if (this.state !== 'ko') this.energy = Math.min(100, this.energy + dt * 4.5);
      if (this.state === 'ko') { this.vx *= 0.9; this.x += this.vx * dt; return; }
      if (this.hitStun > 0) { this.state = 'hit'; }
      // physics
      this.vy += 1900 * dt; this.y += this.vy * dt;
      if (this.y > 0) { this.y = 0; this.vy = 0; }
      this.x += this.vx * dt;
      this.vx *= Math.pow(0.001, dt);
      const minGap = 90;
      if (Math.abs(this.x - opponent.x) < minGap) {
        const dir = this.x < opponent.x ? -1 : 1;
        this.x = opponent.x + dir * minGap;
      }
      this.x = Math.max(ARENA_LEFT, Math.min(ARENA_RIGHT, this.x));
      if (this.state === 'attack') {
        if (!this.hitDone && this.time > 0.13 && Math.abs(this.x - opponent.x) < 155 && Math.abs(this.y - opponent.y) < 180) {
          this.hitDone = true;
          const dmg = [36, 42, 52, 68][this.combo];
          opponent.takeHit(dmg, this);
          effects.push(new SlashEffect(this.x + this.facing * 90, GROUND - this.bodyH * 0.55, this.facing, this.data.accent));
        }
        if (this.time > 0.28) { this.state = 'idle'; this.time = 0; }
        return;
      }
      if (this.state === 'skill') {
        if (this.skillKind === 'dash') {
          if (!this.hitDone && Math.abs(this.x - opponent.x) < 145) {
            this.hitDone = true; opponent.takeHit(this.id === 'thanos' ? 70 : 52, this);
            effects.push(new RingEffect(this.x, GROUND, this.data.accent, 1.7));
          }
          if (this.time > 0.35) { this.state = 'idle'; this.time = 0; }
        } else if (this.time > 0.38) { this.state = 'idle'; this.time = 0; }
        return;
      }
      if (this.state === 'ultimate') {
        if (this.id === 'thanos') {
          if (this.summon) {
            this.summon.timer -= dt; this.summon.punch -= dt;
            const s = this.summon;
            if (s.punch <= 0) { s.punch = 1.1; if (Math.abs(s.x - opponent.x) < 190) { opponent.takeHit(48, { x: s.x }); effects.push(new RingEffect(opponent.x, GROUND, '#eebd62', 1.2)); } }
          }
          if (!this.hitDone && this.time > 0.9) { this.hitDone = true; effects.push(new RingEffect(this.x, GROUND, '#eebd62', 7)); }
          if (this.time > 6.2) { this.state = 'idle'; this.time = 0; this.summon = null; }
        } else {
          if (!this.hitDone && this.time > 0.35) {
            this.hitDone = true;
            if (Math.abs(this.x - opponent.x) < 300) opponent.takeHit(130, this);
            effects.push(new RingEffect(this.x, GROUND, this.data.color, 4.5));
            effects.push(new PillarEffect(this.x, this.data.color));
          }
          if (this.time > 1.0) { this.state = 'idle'; this.time = 0; }
        }
        return;
      }
      if (this.state === 'dodge') {
        this.dodgeTime -= dt;
        if (this.dodgeTime <= 0) { this.state = 'idle'; this.time = 0; this.vx *= 0.1; }
        return;
      }
      if (this.state === 'hit') { if (this.time > 0.22) { this.state = 'idle'; this.time = 0; } return; }
      this.state = Math.abs(this.vx) > 15 ? 'run' : 'idle';
    }
    draw() {
      const img = this.img; if (!img) return;
      const h = this.bodyH, w = this.bodyW;
      const bob = this.state === 'run' ? Math.sin(this.anim * 14) * 3 : Math.sin(this.anim * 3) * 1.5;
      const hip = this.data.hip;
      const hipY = h * (hip - 1);
      ctx.save();
      ctx.translate(this.x, GROUND - this.y + bob);
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.ellipse(0, 4, w * 0.33, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.scale(-this.facing, 1);
      if (this.hitFlash > 0) ctx.globalAlpha = 0.72 + Math.sin(this.hitFlash * 30) * 0.2;
      if (this.state === 'ko') ctx.rotate(this.facing * 0.9);
      if (this.state === 'attack') ctx.rotate(-0.06);
      if (this.state === 'ultimate' && this.id !== 'thanos') ctx.rotate(-0.03);
      const legSwing = this.state === 'run' ? Math.sin(this.anim * 14) * 0.10 : 0;
      if (this.state === 'run') {
        // lower body (animated around hip)
        ctx.save();
        ctx.translate(0, hipY);
        ctx.rotate(legSwing);
        ctx.drawImage(img, 0, img.height * hip, img.width, img.height * (1 - hip), -w / 2, 0, w, h * (1 - hip));
        ctx.restore();
        // upper body; overlap slightly to hide the hip seam
        const overlap = 12;
        ctx.drawImage(img, 0, 0, img.width, Math.min(img.height, img.height * hip + overlap), -w / 2, -h, w, h * hip + overlap);
      } else {
        ctx.drawImage(img, 0, 0, img.width, img.height, -w / 2, -h, w, h);
      }
      ctx.restore();
      if (this.hitFlash > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = this.hitFlash * 0.25;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(this.x, GROUND - h * 0.55, w * 0.28, h * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      // thanos summon
      if (this.summon && this.summon.timer > 0 && this.summon.img) {
        const s = this.summon; const sh = 430; const sw = sh * s.img.width / s.img.height;
        ctx.save(); ctx.globalAlpha = 0.92; ctx.drawImage(s.img, s.x - sw / 2, GROUND - sh, sw, sh); ctx.restore();
      }
    }
  }

  class SlashEffect { constructor(x, y, facing, color) { this.x = x; this.y = y; this.life = 0.3; this.max = 0.3; this.facing = facing; this.color = color; } update(dt) { this.life -= dt; } draw() { const p = this.life / this.max; ctx.save(); ctx.globalAlpha = p; ctx.strokeStyle = this.color; ctx.lineWidth = 14 * p; ctx.beginPath(); ctx.arc(this.x, this.y, 72, -1.2 + (1 - p) * 2, 0.8 + (1 - p) * 2); ctx.stroke(); ctx.restore(); } }
  class RingEffect { constructor(x, y, color, max) { this.x = x; this.y = y; this.color = color; this.max = max; this.life = 0.55; this.total = 0.55; } update(dt) { this.life -= dt; } draw() { const p = 1 - this.life / this.total; ctx.save(); ctx.globalAlpha = 1 - p; ctx.strokeStyle = this.color; ctx.lineWidth = 5 * (1 - p); ctx.beginPath(); ctx.ellipse(this.x, this.y, this.max * 55 * p, this.max * 15 * p, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); } }
  class PillarEffect { constructor(x, color) { this.x = x; this.color = color; this.life = 0.7; this.total = 0.7; } update(dt) { this.life -= dt; } draw() { const p = this.life / this.total; ctx.save(); ctx.globalAlpha = p; ctx.fillStyle = this.color; ctx.fillRect(this.x - 30, 120, 60, GROUND - 120); ctx.restore(); } }

  const effects = [];
  function aiInput(f, o) {
    if (!f.canAct() || f.isKo) return;
    const dx = o.x - f.x;
    f.facing = dx >= 0 ? 1 : -1;
    if (Math.abs(dx) > 190) f.move(Math.sign(dx));
    else if (f.attackCd <= 0 && Math.random() < 0.06) f.attack();
    else if (f.skill1Cd <= 0 && f.energy >= 15 && Math.random() < 0.015) f.skill1();
    else if (f.skill2Cd <= 0 && f.energy >= 20 && Math.random() < 0.012) f.skill2();
    else if (f.energy >= 100 && f.ultCd <= 0 && Math.random() < 0.008) f.ultimate();
  }

  function newGame(p1, p2) {
    game = {
      p1: new Fighter(p1, 2200, 1, false), p2: new Fighter(p2, 3100, -1, true),
      time: 90, round: 1, state: 'countdown', countdown: 2.6, shake: 0, over: false,
      cameraX: 2010, cameraShake: 0,
    };
    $('menu2d').classList.remove('show'); $('result2d').classList.remove('show'); $('hud2d').style.display = 'flex';
    $('p1-name').textContent = game.p1.data.name; $('p2-name').textContent = game.p2.data.name;
    $('p1-hp').style.width = '100%'; $('p2-hp').style.width = '100%';
    $('p1-energy').style.width = '40%'; $('p2-energy').style.width = '40%';
    $('p1-buffs').innerHTML = ''; $('p2-buffs').innerHTML = '';
    ensureAudio();
  }

  function inputPlayer(f) {
    if (!game || game.state !== 'fighting' || f.isKo) return;
    let axis = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft') || touch.left) axis -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight') || touch.right) axis += 1;
    if (axis) f.move(axis);
    if (pressed.has('Space')) { f.jump(); pressed.delete('Space'); }
    if (pressed.has('KeyJ')) { f.attack(); pressed.delete('KeyJ'); }
    if (pressed.has('KeyK')) { f.skill1(); pressed.delete('KeyK'); }
    if (pressed.has('KeyL')) { f.skill2(); pressed.delete('KeyL'); }
    if (pressed.has('KeyI')) { f.ultimate(); pressed.delete('KeyI'); }
    if (pressed.has('ShiftLeft') || pressed.has('ShiftRight')) { f.dodge(); pressed.delete('ShiftLeft'); pressed.delete('ShiftRight'); }
  }

  function update(dt) {
    if (!game) return;
    game.shake = Math.max(0, game.shake - dt * 4);
    if (game.state === 'countdown') {
      game.countdown -= dt;
      if (game.countdown <= 0) game.state = 'fighting';
    } else if (game.state === 'fighting') {
      game.time = Math.max(0, game.time - dt);
      inputPlayer(game.p1);
      aiInput(game.p2, game.p1);
      game.p1.update(dt, game.p2); game.p2.update(dt, game.p1);
      for (const f of [game.p1, game.p2]) {
        for (const p of f.projectiles) {
          p.x += p.vx * dt; p.life -= dt;
          if (p.life > 0 && Math.abs(p.x - (p.owner === game.p1 ? game.p2.x : game.p1.x)) < p.r + 55 && Math.abs(p.y - (GROUND - (p.owner === game.p1 ? game.p2 : game.p1).bodyH * 0.55)) < 100) {
            const target = p.owner === game.p1 ? game.p2 : game.p1;
            if (target.takeHit(45, { x: p.x })) { p.life = 0; effects.push(new RingEffect(p.x, p.y, p.color, 1.2)); }
          }
        }
        f.projectiles = f.projectiles.filter((p) => p.life > 0);
      }
      if (game.p1.isKo || game.p2.isKo || game.time <= 0) endMatch();
    }
    for (const e of effects) e.update(dt);
    for (let i = effects.length - 1; i >= 0; i--) if (effects[i].life <= 0) effects.splice(i, 1);
    if (game && game.state !== 'countdown') {
      const target = Math.max(0, Math.min(WORLD_W - W, (game.p1.x + game.p2.x) / 2 - W / 2));
      game.cameraX += (target - game.cameraX) * Math.min(1, dt * 4.2);
      game.cameraShake = game.shake;
    }
    updateHUD();
  }

  function updateHUD() {
    if (!game) return;
    for (const [f, side] of [[game.p1, 'p1'], [game.p2, 'p2']]) {
      $(side + '-hp').style.width = Math.max(0, f.hp / f.maxHp * 100) + '%';
      $(side + '-hp-text').textContent = Math.ceil(f.hp);
      $(side + '-energy').style.width = f.energy + '%';
    }
    $('timer').textContent = Math.ceil(game.time);
    $('round-label').textContent = game.state === 'countdown' ? 'READY' : `ROUND ${game.round}`;
  }

  function endMatch() {
    if (game.over) return;
    game.over = true; game.state = 'over';
    const p1 = game.p1, p2 = game.p2;
    const win = p1.hp > p2.hp || (p1.hp === p2.hp && p1.hp > 0) ? p1 : p2;
    $('result-title2d').textContent = win === p1 ? '胜利' : '败北';
    $('result-sub2d').textContent = `${p1.data.name}  ${Math.ceil(p1.hp)}  :  ${Math.ceil(p2.hp)}  ${p2.data.name}`;
    $('result2d').classList.add('show');
  }

  function drawBackground(camX = 0) {
    const t = performance.now() / 1000;
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#102542'); sky.addColorStop(0.38, '#31597d'); sky.addColorStop(0.68, '#b46f58'); sky.addColorStop(1, '#e9b27b');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // sun and high clouds (slow parallax)
    const sunX = 990 - camX * 0.035;
    ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffd99a'; ctx.beginPath(); ctx.arc(sunX, 150, 64, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 0.12;
    for (let i = 0; i < 9; i++) {
      const x = ((i * 420 - camX * 0.08 + t * 7) % (W + 500)) - 200;
      ctx.beginPath(); ctx.ellipse(x, 95 + (i % 4) * 42, 120, 16, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // mountain ridges, two parallax layers
    for (let layer = 0; layer < 3; layer++) {
      const off = camX * (0.10 + layer * 0.035);
      const y = 335 + layer * 52; const amp = 72 - layer * 12;
      ctx.fillStyle = ['#2c4660', '#213a52', '#182e44'][layer];
      ctx.beginPath(); ctx.moveTo(-20, GROUND);
      for (let sx = -20; sx <= W + 20; sx += 44) ctx.lineTo(sx, y - Math.abs(Math.sin((sx + off) * 0.005 + layer)) * amp);
      ctx.lineTo(W + 20, GROUND); ctx.closePath(); ctx.fill();
    }

    // distant tree line
    ctx.fillStyle = '#132f35';
    for (let i = 0; i < 30; i++) {
      const wx = i * 210 + 80; const sx = wx - camX * 0.24;
      if (sx < -180 || sx > W + 180) continue;
      const h = 100 + (i * 37 % 70);
      ctx.beginPath(); ctx.moveTo(sx - 45, 390); ctx.quadraticCurveTo(sx, 390 - h, sx + 45, 390); ctx.closePath(); ctx.fill();
    }

    // bamboo grove (mid layer)
    for (let i = 0; i < 34; i++) {
      const wx = 40 + i * 135 + Math.sin(i * 2.2) * 26;
      const sx = wx - camX * 0.55;
      if (sx < -80 || sx > W + 80) continue;
      const h = 330 + (i * 23 % 100);
      ctx.strokeStyle = i % 2 ? '#1d3a35' : '#28483d'; ctx.lineWidth = 5 + (i % 3);
      ctx.beginPath(); ctx.moveTo(sx, GROUND); ctx.bezierCurveTo(sx + 6, GROUND - h * 0.45, sx - 8, GROUND - h * 0.78, sx + 12, GROUND - h); ctx.stroke();
      ctx.fillStyle = i % 2 ? '#315b42' : '#3c6b4a';
      for (let j = 0; j < 5; j++) {
        const yy = GROUND - h + 80 + j * 52;
        ctx.beginPath(); ctx.moveTo(sx, yy); ctx.quadraticCurveTo(sx + 34, yy - 24, sx + 56, yy - 42); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(sx + 55, yy - 44, 18, 5, -0.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    // temple / training hall at the left
    const templeX = 620 - camX * 0.68;
    if (templeX > -330 && templeX < W + 330) {
      ctx.save(); ctx.translate(templeX, 0);
      ctx.fillStyle = '#171d24'; ctx.beginPath(); ctx.moveTo(-110, 355); ctx.lineTo(0, 295); ctx.lineTo(110, 355); ctx.closePath(); ctx.fill();
      ctx.fillRect(-88, 355, 176, 92);
      ctx.fillStyle = '#4b3426'; ctx.fillRect(-104, 350, 208, 14);
      ctx.fillStyle = '#d7a76a'; for (let x = -65; x <= 65; x += 34) ctx.fillRect(x, 380, 13, 28);
      ctx.fillStyle = '#8e3830'; ctx.fillRect(-6, 300, 12, 55);
      ctx.restore();
    }

    // torii gates along the stage
    for (const gx of [2700, 3700, 4700]) {
      const sx = gx - camX;
      if (sx < -260 || sx > W + 260) continue;
      ctx.save(); ctx.globalAlpha = 0.94; ctx.fillStyle = '#8e3830';
      ctx.fillRect(sx - 72, 335, 20, 255); ctx.fillRect(sx + 52, 335, 20, 255);
      ctx.fillRect(sx - 104, 320, 208, 18); ctx.fillStyle = '#5b2220'; ctx.fillRect(sx - 82, 355, 164, 11);
      ctx.restore();
    }

    // stone lanterns / training posts
    for (let i = 0; i < 12; i++) {
      const wx = 240 + i * 330; const sx = wx - camX * 0.92;
      if (sx < -70 || sx > W + 70) continue;
      ctx.fillStyle = '#263037'; ctx.fillRect(sx - 13, GROUND - 88, 26, 88);
      ctx.fillStyle = '#c7a36a'; ctx.fillRect(sx - 19, GROUND - 110, 38, 22);
      ctx.fillStyle = '#f2c879'; ctx.fillRect(sx - 8, GROUND - 106, 16, 12);
    }

    // training dummies and supply crates
    for (const wx of [820, 2380, 4200]) {
      const sx = wx - camX * 0.92;
      if (sx < -100 || sx > W + 100) continue;
      ctx.fillStyle = '#3b2a1d'; ctx.fillRect(sx - 5, GROUND - 145, 10, 145);
      ctx.fillStyle = '#8b5938'; ctx.fillRect(sx - 34, GROUND - 190, 68, 12);
      ctx.fillStyle = '#c79a62'; ctx.beginPath(); ctx.arc(sx, GROUND - 160, 17, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6d442b'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sx - 30, GROUND - 134); ctx.lineTo(sx + 30, GROUND - 134); ctx.stroke();
    }
    for (const wx of [640, 1880, 3560, 4860]) {
      const sx = wx - camX * 0.96;
      if (sx < -90 || sx > W + 90) continue;
      ctx.fillStyle = '#4b3624'; ctx.fillRect(sx - 26, GROUND - 42, 52, 42);
      ctx.strokeStyle = '#24170e'; ctx.lineWidth = 3; ctx.strokeRect(sx - 26, GROUND - 42, 52, 42);
      ctx.beginPath(); ctx.moveTo(sx - 26, GROUND - 42); ctx.lineTo(sx + 26, GROUND); ctx.stroke();
    }
    for (const wx of [420, 1500, 2750, 3900, 5050]) {
      const sx = wx - camX * 0.96;
      if (sx < -80 || sx > W + 80) continue;
      ctx.fillStyle = '#3a3e40'; ctx.beginPath(); ctx.ellipse(sx, GROUND - 8, 34, 14, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4b4f50'; ctx.beginPath(); ctx.ellipse(sx + 12, GROUND - 12, 18, 10, 0, Math.PI, Math.PI * 2); ctx.fill();
    }

    // foreground bamboo framing
    ctx.save(); ctx.globalAlpha = 0.55;
    for (const side of [0, 1]) {
      const base = side ? W - 80 : 80;
      for (let j = 0; j < 3; j++) {
        const sx = base + (side ? -1 : 1) * j * 34;
        ctx.strokeStyle = '#0d201f'; ctx.lineWidth = 12 - j * 2;
        ctx.beginPath(); ctx.moveTo(sx, H); ctx.quadraticCurveTo(sx + 12, 380, sx - 8, 100 + j * 50); ctx.stroke();
        ctx.fillStyle = '#142b25';
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(sx + (side ? -1 : 1) * (28 + k * 6), 170 + k * 70, 25, 6, side ? 0.5 : -0.5, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.restore();

    // ground and stone tiles
    ctx.fillStyle = '#171b20'; ctx.fillRect(0, GROUND, W, H - GROUND);
    const g = ctx.createLinearGradient(0, GROUND, 0, H); g.addColorStop(0, '#5a4632'); g.addColorStop(0.12, '#3b2e24'); g.addColorStop(1, '#14110f');
    ctx.fillStyle = g; ctx.fillRect(0, GROUND + 8, W, H - GROUND);
    ctx.strokeStyle = '#c7a36a35'; ctx.lineWidth = 2;
    const x0 = -((camX * 1) % 92);
    for (let x = x0; x < W + 92; x += 92) { ctx.beginPath(); ctx.moveTo(x, GROUND + 12); ctx.lineTo(x + 40, H); ctx.stroke(); }
    ctx.strokeStyle = '#b18c5944'; ctx.beginPath(); ctx.moveTo(0, GROUND + 14); ctx.lineTo(W, GROUND + 14); ctx.stroke();

    // foreground grass
    ctx.strokeStyle = '#56704a77'; ctx.lineWidth = 2;
    for (let x = -20; x < W + 20; x += 16) {
      const h = 8 + ((x + camX * 1.1) * 13 % 17 + 17) % 17;
      ctx.beginPath(); ctx.moveTo(x, GROUND + 10); ctx.lineTo(x + 4, GROUND - h); ctx.stroke();
    }

    // drifting petals
    ctx.save(); ctx.fillStyle = '#efb7a0aa';
    for (let i = 0; i < 18; i++) {
      const px = ((i * 197 - camX * 0.2 + t * 24) % (W + 100)) - 50;
      const py = 160 + ((i * 83 + t * 20) % 300);
      ctx.beginPath(); ctx.ellipse(px, py, 3.5, 1.5, Math.sin(t + i) * 0.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function frame(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000 || 0.016); lastTime = now;
    update(dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const camX = game ? game.cameraX : 0;
    drawBackground(camX);
    if (game) {
      const shakeX = (Math.random() - 0.5) * game.shake * 10;
      ctx.save(); ctx.translate(-camX + shakeX, 0);
      game.p1.draw(); game.p2.draw();
      for (const e of effects) e.draw();
      ctx.restore();
      if (game.state === 'countdown') {
        ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '900 100px "Microsoft YaHei"'; ctx.fillText(Math.ceil(game.countdown) > 0 ? Math.ceil(game.countdown) : 'FIGHT!', W / 2, 240); ctx.restore();
      }
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (!keys.has(e.code)) pressed.add(e.code); keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  document.querySelectorAll('#touch2d [data-act]').forEach((btn) => {
    const act = btn.dataset.act;
    const down = (e) => { e.preventDefault(); ensureAudio(); if (act === 'left') touch.left = true; else if (act === 'right') touch.right = true; else pressed.add({ attack: 'KeyJ', skill1: 'KeyK', skill2: 'KeyL', ultimate: 'KeyI', dodge: 'ShiftLeft', jump: 'Space' }[act]); };
    const up = (e) => { e.preventDefault(); if (act === 'left') touch.left = false; else if (act === 'right') touch.right = false; };
    btn.addEventListener('pointerdown', down); btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('pointerleave', up);
  });

  $('start2d').addEventListener('click', () => {
    ensureAudio();
    const pool = ORDER.filter((id) => id !== selected);
    newGame(selected, pool[Math.floor(Math.random() * pool.length)]);
  });
  $('rematch2d').addEventListener('click', () => {
    const pool = ORDER.filter((id) => id !== selected);
    newGame(selected, pool[Math.floor(Math.random() * pool.length)]);
  });
  $('menu2d-btn').addEventListener('click', () => {
    $('result2d').classList.remove('show'); $('menu2d').classList.add('show'); $('hud2d').style.display = 'none'; game = null;
  });
  $('back3d').addEventListener('click', () => { location.href = '../?v=73'; });

  function fit() {
    canvas.width = W;
    canvas.height = H;
  }
  window.addEventListener('resize', fit);
  fit();
  preload();
  requestAnimationFrame(frame);
})();
