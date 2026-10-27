import * as THREE from '../vendor/three.module.js';
import { CHARACTERS, CHARACTER_ORDER, ROUND_TIME, WINS_NEEDED } from './config.js';
import { Fighter } from './fighter.js';
import { AIController } from './ai.js';
import { ParticleSystem, Projectile, Ring, Slash, Pillar, DamageText, RasenganCharge, RockBurst, WindAura, Footprint, StonePickup, PeckStar, MiniRing, WindArc, GoldCross, BeakOrb, GroundAura, MusicNote, QuestionMark, ShieldAura, SlowAura, Feather, EllipsisMark } from './effects.js';

const $ = (id) => document.getElementById(id);

function aiLabel(character) {
  return `电脑·${character.name}`;
}

function colorHex(c) {
  return `#${new THREE.Color(c).getHexString()}`;
}

function disposeObject(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) m?.dispose?.();
  });
}

export class Game {
  constructor(arena, input, audio, loadedModels = {}) {
    this.arena = arena;
    this.input = input;
    this.audio = audio;
    this.loadedModels = loadedModels;
    this.scene = arena.scene;
    this.time = 0;
    this.state = 'menu';
    this.timer = ROUND_TIME;
    this.round = 1;
    this.countdown = 0;
    this.roundOverTimer = 0;
    this.flash = 0;
    this.p1Id = CHARACTER_ORDER[0];
    this.p2Id = CHARACTER_ORDER[1];
    this.difficulty = 'normal';
    this.ai = new AIController(1, this.difficulty);
    this.particles = new ParticleSystem(this.scene, 360);
    this.projectiles = [];
    this.rings = [];
    this.slashes = [];
    this.pillars = [];
    this.damageTexts = [];
    this.charges = [];
    this.rockBursts = [];
    this.windAuras = [];
    this.footprints = [];
    this.stonePickups = [];
    this.penguinOrbs = [];
    this.groundAuras = [];
    this.notes = [];
    this.questions = [];
    this.shieldAuras = [];
    this.feathers = [];
    this.slowAuras = [];
    this.netMode = null;
    this.lanSend = null;
    this.localPlayer = 0;
    this.netEvents = [];
    this.netAccum = 0;
    this.netInputAccum = 0;
    this.netLastAxis = { x: 0, y: 0 };
    this.netLastHeld = { attack: false };
    this.netSnapshot = null;
    this.netProjectiles = new Map();
    this.paused = false;
    this.netResultShown = false;
    this.projectileSeq = 0;
    this.fighters = [
      new Fighter(this, 0, CHARACTERS[this.p1Id]),
      new Fighter(this, 1, CHARACTERS[this.p2Id]),
    ];
    this.fighters[0].wins = 0;
    this.fighters[1].wins = 0;

    this.ui = {
      p1Name: $('p1-name'),
      p2Name: $('p2-name'),
      p1Hp: $('p1-hp'),
      p2Hp: $('p2-hp'),
      p1HpText: $('p1-hp-text'),
      p2HpText: $('p2-hp-text'),
      p1Energy: $('p1-energy'),
      p2Energy: $('p2-energy'),
      p1Wins: $('p1-wins'),
      p2Wins: $('p2-wins'),
      timer: $('timer'),
      roundLabel: $('round-label'),
      announce: $('announce'),
      toast: $('toast'),
      flash: $('flash'),
      result: $('result'),
      resultTitle: $('result-title'),
      resultSub: $('result-sub'),
    };
    this.buttons = [...document.querySelectorAll('[data-player][data-action]')];
    this.ui.p1Name.textContent = this.fighters[0].char.name;
    this.ui.p2Name.textContent = aiLabel(this.fighters[1].char);
    this.ui.roundLabel.textContent = 'ROUND 1';
    this.updateHUD();
  }

  setCharacters(p1Id, p2Id) {
    if (!CHARACTERS[p1Id] || !CHARACTERS[p2Id]) return;
    if (p1Id === this.p1Id && p2Id === this.p2Id) {
      this.ui.p1Name.textContent = this.fighters[0].char.name;
      this.ui.p2Name.textContent = aiLabel(this.fighters[1].char);
      return;
    }
    for (const f of this.fighters) {
      this.arena.scene.remove(f.stickman.root);
      disposeObject(f.stickman.root);
    }
    this.p1Id = p1Id;
    this.p2Id = p2Id;
    this.fighters = [
      new Fighter(this, 0, CHARACTERS[p1Id]),
      new Fighter(this, 1, CHARACTERS[p2Id]),
    ];
    this.fighters[0].wins = 0;
    this.fighters[1].wins = 0;
    this.ui.p1Name.textContent = this.fighters[0].char.name;
    this.ui.p2Name.textContent = aiLabel(this.fighters[1].char);
    this.updateHUD();
  }

  setDifficulty(mode) {
    this.difficulty = ['easy', 'normal', 'hard'].includes(mode) ? mode : 'normal';
    this.ai.setDifficulty(this.difficulty);
  }

  receiveLanState(msg) {
    if (this.netMode === 'client') this.netSnapshot = msg;
  }

  receiveLanEvents(events) {
    if (this.netMode === 'client') this.applyNetEvents(events);
  }

  setupLanHost(hostChar, clientChar, send) {
    this.netMode = 'host';
    this.lanSend = send;
    this.localPlayer = 0;
    this.paused = false;
    this.netResultShown = false;
    this.netEvents = [];
    this.netAccum = 0;
    this.startMatch(hostChar, clientChar);
  }

  setupLanClient(hostChar, clientChar, send) {
    this.netMode = 'client';
    this.lanSend = send;
    this.localPlayer = 1;
    this.paused = false;
    this.netResultShown = false;
    this.netSnapshot = null;
    this.netEvents = [];
    this.netInputAccum = 0;
    this.netLastAxis = { x: 0, y: 0 };
    this.netLastHeld = { attack: false };
    this.setCharacters(hostChar, clientChar);
    this.fighters.forEach((f) => {
      f.resetRound();
      f.netTarget = { x: f.x, z: f.z, y: f.y };
    });
    this.state = 'countdown';
    this.countdown = 3;
    this.timer = ROUND_TIME;
    this.round = 1;
    this.input.enabled = true;
    this.input.clear();
    this.ui.result.classList.remove('show');
    document.body.classList.remove('result-open');
    this.updateHUD();
  }

  applyLanInput(msg) {
    if (this.netMode !== 'host' || !msg) return;
    const axis = msg.axis || {};
    this.input.setAI(1, {
      x: Math.max(-1, Math.min(1, Number(axis.x) || 0)),
      y: Math.max(-1, Math.min(1, Number(axis.y) || 0)),
    });
    for (const action of msg.actions || []) {
      if (['attack', 'skill1', 'skill2', 'ultimate', 'jump', 'dodge'].includes(action)) {
        this.input.pressAI(1, action);
      }
    }
    this.input.setAIHeld(1, 'attack', msg.held?.attack === true);
  }

  emitNet(type, data = {}) {
    if (this.netMode === 'host') this.netEvents.push({ type, ...data });
  }

  netHostTick(dt) {
    if (this.netMode !== 'host' || !this.lanSend) return;
    this.netAccum += dt;
    if (this.netAccum < 0.05) return;
    this.netAccum = 0;
    if (this.netEvents.length) {
      this.lanSend({ type: 'event', events: this.netEvents });
      this.netEvents = [];
    }
    const winner = this.state === 'matchOver'
      ? this.fighters.find((f) => f.wins >= WINS_NEEDED)?.player
      : null;
    this.lanSend({
      type: 'state',
      time: this.time,
      state: this.state,
      countdown: this.countdown,
      timer: this.timer,
      round: this.round,
      winner,
      fighters: this.fighters.map((f) => ({
        x: f.x, z: f.z, y: f.y, vx: f.vx, vz: f.vz,
        facingAngle: f.facingAngle, state: f.state, stateTime: f.stateTime,
        currentAction: f.currentAction, current: f.current ? {
          key: f.current.key, name: f.current.name, type: f.current.type,
          style: f.current.style, custom: f.current.custom, channel: f.current.channel,
          startup: f.current.startup, active: f.current.active, recovery: f.current.recovery,
        } : null,
        hp: f.hp, maxHp: f.maxHp, energy: f.energy, invuln: f.invuln,
        cooldowns: f.cooldowns, penguinShield: f.penguinShield,
        penguinShieldStacks: f.penguinShieldStacks,
        penguinConfusedUntil: f.penguinConfusedUntil,
        penguinDeepUntil: f.penguinDeepUntil,
        penguinStunUntil: f.penguinStunUntil,
        slowUntil: f.slowUntil, slowFactor: f.slowFactor,
        grounded: f.grounded, spinAngle: f.spinAngle, wins: f.wins,
      })),
      projectiles: this.projectiles.map((p) => ({
        id: p.netId, x: p.x, z: p.z, y: p.y, radius: p.radius, style: p.style,
        color: p.skill?.color ?? 0xffffff,
      })),
    });
  }

  updateLanClient(dt) {
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt * 2.8);
    this.ui.flash.style.opacity = String(Math.min(0.75, this.flash * 0.55));
    this.netInputAccum += dt;
    const actions = [];
    for (const action of ['attack', 'skill1', 'skill2', 'ultimate', 'jump', 'dodge']) {
      if (this.input.consume(0, action)) actions.push(action);
    }
    const raw = this.input.axis(0);
    const fwd = this.arena.getCameraForward?.() ?? { x: 0, z: -1 };
    const axis = {
      x: (-fwd.z) * raw.x + fwd.x * (-raw.y),
      y: fwd.x * raw.x + fwd.z * (-raw.y),
    };
    const changed = Math.hypot(axis.x - this.netLastAxis.x, axis.y - this.netLastAxis.y) > 0.04;
    const held = { attack: this.input.isDown(0, 'attack') };
    const heldChanged = held.attack !== this.netLastHeld.attack;
    if (actions.length || heldChanged || (changed && this.netInputAccum >= 0.05)) {
      this.netInputAccum = 0;
      this.netLastAxis = axis;
      this.netLastHeld = held;
      this.lanSend?.({ type: 'input', axis, actions, held });
    }
    if (this.netSnapshot) {
      const snap = this.netSnapshot;
      this.time = snap.time ?? this.time;
      this.state = snap.state;
      this.countdown = snap.countdown;
      this.timer = snap.timer;
      this.round = snap.round;
      for (let i = 0; i < 2; i++) {
        const f = this.fighters[i];
        const d = snap.fighters?.[i];
        if (!d) continue;
        f.hp = d.hp;
        f.maxHp = d.maxHp;
        f.energy = d.energy;
        f.invuln = d.invuln;
        f.cooldowns = d.cooldowns || f.cooldowns;
        f.penguinShield = d.penguinShield || 0;
        f.penguinShieldStacks = d.penguinShieldStacks || 0;
        f.penguinConfusedUntil = d.penguinConfusedUntil || 0;
        f.penguinDeepUntil = d.penguinDeepUntil || 0;
        f.penguinStunUntil = d.penguinStunUntil || 0;
        f.slowUntil = d.slowUntil || 0;
        f.slowFactor = d.slowFactor || 1;
        this.updatePenguinShieldAura(f);
        f.state = d.state;
        f.stateTime = d.stateTime;
        f.currentAction = d.currentAction;
        f.current = d.current;
        f.facingAngle = d.facingAngle;
        f.spinAngle = d.spinAngle || 0;
        f.grounded = d.grounded;
        f.netTarget = { x: d.x, z: d.z, y: d.y };
        if (!f.netInit) {
          f.netInit = true;
          f.x = d.x; f.z = d.z; f.y = d.y;
        }
      }
      this.updateNetProjectiles(snap.projectiles || []);
      this.syncNetResult(snap);
    }
    for (const f of this.fighters) {
      if (!f.netTarget) continue;
      const k = Math.min(1, dt * 18);
      f.x += (f.netTarget.x - f.x) * k;
      f.z += (f.netTarget.z - f.z) * k;
      f.y += (f.netTarget.y - f.y) * k;
      f.animTime += dt;
      f.stickman.update(dt, f);
    }
    this.updateEffects(dt);
  }

  syncNetResult(snap) {
    if (snap.state !== 'matchOver' || this.netResultShown) return;
    const winner = this.fighters[snap.winner ?? (this.fighters[0].wins > this.fighters[1].wins ? 0 : 1)];
    this.netResultShown = true;
    this.showResult(winner);
  }

  updateNetProjectiles(list) {
    const seen = new Set();
    for (const p of list) {
      if (p.id == null) continue;
      seen.add(p.id);
      let entry = this.netProjectiles.get(p.id);
      if (!entry) {
        const color = new THREE.Color(p.color ?? 0xffffff);
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(p.radius ?? 0.25, 12, 10),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        this.scene.add(mesh);
        entry = { mesh };
        this.netProjectiles.set(p.id, entry);
      }
      entry.mesh.position.set(p.x, p.y ?? 1, p.z);
    }
    for (const [id, entry] of this.netProjectiles) {
      if (seen.has(id)) continue;
      this.scene.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.mesh.material.dispose();
      this.netProjectiles.delete(id);
    }
  }

  applyNetEvents(events) {
    if (!Array.isArray(events)) return;
    for (const e of events) {
      const f = this.fighters[e.player ?? 0];
      if (!f) continue;
      if (e.type === 'hit') {
        const pos = new THREE.Vector3(e.x, 1.15, e.z);
        this.particles.spawn(pos, e.color ?? 0xffffff, 14, 3.2, 0.4);
        this.damageTexts.push(new DamageText(this.scene, pos, `-${e.damage}`, e.textColor ?? '#ffd166'));
        this.flash = Math.max(this.flash, 0.25);
        this.audio.hit(e.kind ?? 'normal', e.damage ?? 10);
      } else if (e.type === 'melee') {
        const pos = new THREE.Vector3(e.x, 1, e.z);
        this.slashes.push(new Slash(this.scene, pos, e.angle ?? 0, e.color ?? 0xffffff, { duration: 0.3 }));
        this.rings.push(new Ring(this.scene, pos, e.color ?? 0xffffff, { maxScale: 2, duration: 0.4 }));
      } else if (e.type === 'projHit') {
        const pos = new THREE.Vector3(e.x, 1, e.z);
        this.rings.push(new Ring(this.scene, pos, e.color ?? 0xffffff, { maxScale: 2.6, duration: 0.4 }));
        this.particles.spawn(pos, e.color ?? 0xffffff, 18, 4, 0.4);
      } else if (e.type === 'dodge') {
        this.onDodge(f, e.dx ?? 0, e.dz ?? 0);
        this.audio.dodge();
      } else if (e.type === 'rush') {
        const pos = new THREE.Vector3(e.x, 0.7, e.z);
        this.rings.push(new Ring(this.scene, new THREE.Vector3(e.x, 0.08, e.z), 0xffd166, { maxScale: 2.4, duration: 0.3 }));
        this.particles.spawn(pos, 0xffd166, 16, 3.2, 0.3);
      } else if (e.type === 'skill') {
        const base = f.char.skills[e.key];
        if (base) this.onSkillStart(f, { ...base, ...(e.skill || {}) });
      } else if (e.type === 'ultimate') {
        this.flash = Math.max(this.flash, 0.6);
        this.rings.push(new Ring(this.scene, new THREE.Vector3(e.x ?? f.x, 0.08, e.z ?? f.z), e.skill?.color ?? 0xffd166, { maxScale: 4.0, duration: 0.7 }));
        this.particles.spawn(new THREE.Vector3(f.x, 1, f.z), e.skill?.color ?? 0xffd166, 30, 4.5, 0.6);
        this.audio.ultimate();
      }
    }
  }

  startMatch(p1Id = this.p1Id, p2Id = this.p2Id) {
    this.setCharacters(p1Id, p2Id);
    this.audio.stopPenguinSong();
    this.audio.stopPenguinUltimate(250);
    this.audio.startBattleBgm();
    this.fighters.forEach((f) => f.resetMatch());
    this.round = 1;
    this.ui.result.classList.remove('show');
    document.body.classList.remove('result-open');
    this.input.enabled = true;
    this.startRound();
  }

  startRound() {
    for (const p of this.projectiles) p.kill();
    this.projectiles = [];
    for (const r of this.rings) r.kill();
    this.rings = [];
    for (const s of this.slashes) s.kill();
    this.slashes = [];
    for (const p of this.pillars) p.kill();
    this.pillars = [];
    for (const t of this.damageTexts) t.kill();
    this.damageTexts = [];
    for (const c of this.charges) c.kill();
    this.charges = [];
    for (const r of this.rockBursts) r.kill();
    this.rockBursts = [];
    for (const w of this.windAuras) w.kill();
    this.windAuras = [];
    for (const f of this.footprints) f.kill();
    this.footprints = [];
    for (const s of this.stonePickups) s.kill();
    this.stonePickups = [];
    for (const o of this.penguinOrbs) o.kill();
    this.penguinOrbs = [];
    for (const a of this.groundAuras) a.kill();
    this.groundAuras = [];
    for (const n of this.notes) n.kill();
    this.notes = [];
    for (const q of this.questions) q.kill();
    this.questions = [];
    for (const s of this.shieldAuras) s.kill();
    this.shieldAuras = [];
    for (const f of this.feathers) f.kill();
    this.feathers = [];
    for (const a of this.slowAuras) a.kill();
    this.slowAuras = [];
    document.body.classList.remove('penguin-vignette');
    this.audio.stopRasenganCharge();
    this.fighters.forEach((f) => f.resetRound());
    this.timer = ROUND_TIME;
    this.countdown = 2.2;
    this.roundOverTimer = 0;
    this.flash = 0;
    this.state = 'countdown';
    this.input.clear();
    this.ai.reset();
    this.ui.roundLabel.textContent = `ROUND ${this.round}`;
    this.announce(`ROUND ${this.round}`, `${this.fighters[0].char.name}  VS  ${this.fighters[1].char.name}`, 1.5);
    this.updateHUD();
  }

  update(dt) {
    if (this.netMode === 'client') {
      this.updateLanClient(dt);
      this.arena.update(dt, this.time, this.fighters, this.localPlayer);
      this.updateHUD();
      return;
    }
    if (this.paused) {
      this.arena.update(dt, this.time, this.fighters, this.localPlayer);
      this.updateHUD();
      return;
    }
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt * 2.8);
    this.ui.flash.style.opacity = String(Math.min(0.75, this.flash * 0.55));

    if (this.state === 'menu') {
      for (const f of this.fighters) {
        f.animTime += dt;
        f.stickman.update(dt, f);
      }
    } else if (this.state === 'countdown') {
      this.countdown -= dt;
      for (const f of this.fighters) {
        f.animTime += dt;
        f.stickman.update(dt, f);
      }
      if (this.countdown <= 0) {
        this.state = 'fighting';
        this.announce('FIGHT!', '', 0.9);
        this.audio.skill();
      }
    } else if (this.state === 'fighting') {
      this.timer = Math.max(0, this.timer - dt);
      if (this.netMode !== 'host') this.ai.update(dt, this);
      for (const f of this.fighters) f.update(dt);
      this.separateFighters();
      this.updateProjectiles(dt);
      this.updateEffects(dt);
      if (this.state === 'fighting' && this.timer <= 0) {
        this.onTimeUp();
      }
    } else if (this.state === 'roundOver' || this.state === 'matchOver') {
      for (const f of this.fighters) f.update(dt);
      this.updateProjectiles(dt);
      this.updateEffects(dt);
      this.roundOverTimer -= dt;
      if (this.state === 'roundOver' && this.roundOverTimer <= 0) {
        this.nextRound();
      }
    }

    this.arena.update(dt, this.time, this.fighters, this.localPlayer);
    this.updateHUD();
    if (this.netMode === 'host') this.netHostTick(dt);
  }

  upgradeModels() {
    for (const f of this.fighters) f.upgradeModel();
  }

  separateFighters() {
    const [a, b] = this.fighters;
    if (a.isKo() || b.isKo()) return;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    const min = 0.78;
    if (d > 0.0001 && d < min) {
      const push = (min - d) / 2;
      a.x -= (dx / d) * push;
      a.z -= (dz / d) * push;
      b.x += (dx / d) * push;
      b.z += (dz / d) * push;
    }
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      p.update(dt, this);
      if (p.dead && p.style === 'stone' && !p.hitSomething) {
        this.spawnStonePickup(p.x, p.z);
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  updateEffects(dt) {
    this.particles.update(dt);
    for (const r of this.rings) r.update(dt);
    this.rings = this.rings.filter((r) => !r.dead);
    for (const s of this.slashes) s.update(dt);
    this.slashes = this.slashes.filter((s) => !s.dead);
    for (const p of this.pillars) p.update(dt);
    this.pillars = this.pillars.filter((p) => !p.dead);
    for (const t of this.damageTexts) t.update(dt);
    this.damageTexts = this.damageTexts.filter((t) => !t.dead);
    for (const c of this.charges) c.update(dt);
    this.charges = this.charges.filter((c) => {
      if (c.dead) return false;
      if (c.fighter.state !== 'charging') {
        c.kill();
        this.audio.stopRasenganCharge();
        return false;
      }
      return true;
    });
    for (const r of this.rockBursts) r.update(dt);
    this.rockBursts = this.rockBursts.filter((r) => !r.dead);
    for (const w of this.windAuras) w.update(dt);
    this.windAuras = this.windAuras.filter((w) => {
      if (w.dead) return false;
      if (w.fighter.current?.custom !== 'spin' || w.fighter.state !== 'skill') {
        w.kill();
        return false;
      }
      return true;
    });
    for (const f of this.footprints) f.update(dt);
    this.footprints = this.footprints.filter((f) => !f.dead);
    for (const o of this.penguinOrbs) o.update(dt);
    this.penguinOrbs = this.penguinOrbs.filter((o) => !o.dead);
    for (const a of this.groundAuras) a.update(dt);
    this.groundAuras = this.groundAuras.filter((a) => !a.dead);
    for (const n of this.notes) n.update(dt);
    this.notes = this.notes.filter((n) => !n.dead);
    for (const q of this.questions) q.update(dt);
    this.questions = this.questions.filter((q) => !q.dead);
    for (const s of this.shieldAuras) s.update(dt);
    this.shieldAuras = this.shieldAuras.filter((s) => !s.dead);
    for (const f of this.feathers) f.update(dt);
    this.feathers = this.feathers.filter((f) => !f.dead);
    for (const a of this.slowAuras) a.update(dt);
    this.slowAuras = this.slowAuras.filter((a) => !a.dead);
    for (const s of this.stonePickups) {
      s.update(dt);
      const collector = this.fighters.find((f) => f.char.id === 'penguin' && !f.isKo() &&
        Math.hypot(f.x - s.group.position.x, f.z - s.group.position.z) < 0.62);
      if (collector && !s.dead) {
        if (s.collecting) {
          s.flyTo(collector, dt);
          if (s.arrived) {
            collector.addPenguinShield(1);
            collector.addStoneRushCharge(1);
            this.particles.spawn(new THREE.Vector3(collector.x, 1.0, collector.z), 0xcfcfcf, 12, 2.0, 0.3);
            this.audio.penguinQuack('happy');
            s.kill();
          }
        } else {
          s.collecting = true;
          s.flyTo(collector, dt);
        }
      }
    }
    this.stonePickups = this.stonePickups.filter((s) => !s.dead);
  }

  startWindAura(fighter) {
    this.stopWindAura(fighter);
    const aura = new WindAura(this.scene, fighter);
    this.windAuras.push(aura);
    return aura;
  }

  stopWindAura(fighter) {
    for (const w of this.windAuras) {
      if (w.fighter === fighter) w.kill();
    }
    this.windAuras = this.windAuras.filter((w) => !w.dead);
  }

  spawnRockBurst(position, count = 14) {
    const burst = new RockBurst(this.scene, position, count);
    this.rockBursts.push(burst);
    return burst;
  }

  spawnFootprint(x, z, angle) {
    this.footprints.push(new Footprint(this.scene, x, z, angle));
    if (this.footprints.length > 24) this.footprints.shift().kill();
  }

  spawnStonePickup(x, z) {
    if (this.stonePickups.some((s) => Math.hypot(s.group.position.x - x, s.group.position.z - z) < 0.32)) return;
    this.stonePickups.push(new StonePickup(this.scene, x, z));
    if (this.stonePickups.length > 8) this.stonePickups.shift().kill();
  }

  dropPenguinStone(x, z) {
    if (this.stonePickups.length >= 4) return;
    this.spawnStonePickup(x + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.4);
  }

  spawnPenguinStones(fighter, skill) {
    const base = fighter.char.skills.skill2;
    const angles = [-0.44, -0.33, -0.22, -0.11, 0, 0.11, 0.22, 0.33, 0.44];
    for (const angle of angles) {
      const stone = {
        ...base,
        ...skill,
        style: 'stone',
        key: 'skill2',
        angleOffset: angle,
        damage: Math.max(14, Math.round(base.damage / 3)),
        speed: 11.0,
        radius: 0.22,
        life: 0.72,
        ignoreInvuln: true,
        color: 0x9b8b75,
        trail: 0xd8c49d,
        knockback: 0.8,
        hitstun: 0.12,
      };
      const projectile = new Projectile(this.scene, fighter, stone);
      projectile.netId = ++this.projectileSeq;
      this.projectiles.push(projectile);
    }
    this.audio.penguinQuack('stone');
  }

  startRasenganCharge(fighter, skill) {
    this.releaseRasenganCharge(fighter);
    const charge = new RasenganCharge(this.scene, fighter, skill);
    this.charges.push(charge);
    this.audio.startRasenganCharge();
    return charge;
  }

  releaseRasenganCharge(fighter) {
    for (const c of this.charges) {
      if (c.fighter === fighter) c.kill();
    }
    this.charges = this.charges.filter((c) => !c.dead);
    this.audio.stopRasenganCharge();
  }

  nextRound() {
    const champion = this.fighters.find((f) => f.wins >= WINS_NEEDED);
    if (champion) {
      this.state = 'matchOver';
      this.showResult(champion);
    } else {
      this.round += 1;
      this.startRound();
    }
  }

  onKO(loser, winner) {
    if (this.state !== 'fighting') return;
    winner.wins += 1;
    this.state = 'roundOver';
    this.roundOverTimer = 2.8;
    this.flash = 1.1;
    this.arena.shake = 24;
    this.audio.ko();
    this.announce('K.O.', `${winner.char.name} 获胜`, 2.2);
    this.updateHUD();
  }

  onTimeUp() {
    if (this.state !== 'fighting') return;
    const [a, b] = this.fighters;
    this.state = 'roundOver';
    this.roundOverTimer = 2.6;
    if (a.hp === b.hp) {
      this.announce('TIME UP', '平局', 2.2);
    } else {
      const winner = a.hp > b.hp ? a : b;
      winner.wins += 1;
      this.announce('TIME UP', `${winner.char.name} 获胜`, 2.2);
    }
    this.audio.ko();
    this.updateHUD();
  }

  returnToMenu() {
    this.audio.stopBattleBgm(450);
    this.audio.stopPenguinSong();
    this.audio.stopPenguinUltimate(250);
    this.netMode = null;
    this.lanSend = null;
    this.localPlayer = 0;
    this.paused = false;
    this.netResultShown = false;
    for (const [, entry] of this.netProjectiles) {
      this.scene.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.mesh.material.dispose();
    }
    this.netProjectiles.clear();
    this.startRound();
    this.round = 1;
    this.state = 'menu';
    this.countdown = 0;
    this.flash = 0;
    this.input.enabled = false;
    this.input.clear();
    this.ui.result.classList.remove('show');
    this.ui.announce.classList.remove('show');
    document.body.classList.remove('result-open', 'playing');
    this.updateHUD();
  }

  showResult(winner) {
    this.audio.stopBattleBgm(1200);
    this.audio.stopPenguinSong();
    this.audio.stopPenguinUltimate(400);
    this.ui.resultTitle.textContent = `${winner.char.name} 获胜`;
    this.ui.resultSub.textContent = `${winner.char.name}  ${winner.wins} : ${this.fighters[1 - winner.player].wins}  ${this.fighters[1 - winner.player].char.name}`;
    this.ui.result.classList.add('show');
    document.body.classList.add('result-open');
    this.input.enabled = false;
  }

  onHit(attacker, defender, damage, skill) {
    const pos = new THREE.Vector3(defender.x, 1.15, defender.z);
    this.particles.spawn(pos, skill.color ?? attacker.char.color, 16, 3.8, 0.45);
    this.damageTexts.push(new DamageText(this.scene, pos, `-${damage}`, colorHex(attacker.char.accent)));
    this.arena.shake = Math.min(20, 5 + damage * 0.035);
    this.flash = Math.max(this.flash, 0.32);
    this.arena.fovKick = Math.min(this.arena.fovKick, -1.8);
    const kind = skill.style === 'rasengan'
      ? 'rasengan'
      : skill.key === 'ultimate' || skill.channel
        ? 'ultimate'
        : skill.custom
          ? 'skill'
          : skill.key === 'attack'
            ? 'normal'
            : 'skill';
    this.audio.hit(kind, damage);
    this.emitNet('hit', {
      player: defender.player, x: defender.x, z: defender.z,
      color: skill.color ?? attacker.char.accent, damage, kind,
      textColor: colorHex(attacker.char.accent),
    });
  }

  skillFlourish(fighter, skill, color, power = 1) {
    const f = fighter.forward();
    const center = new THREE.Vector3(fighter.x + f.x * 0.35, 1.0, fighter.z + f.z * 0.35);
    const ground = new THREE.Vector3(fighter.x, 0.08, fighter.z);
    this.rings.push(new Ring(this.scene, ground, color, { maxScale: 2.4 + power * 1.8, duration: 0.5 }));
    this.rings.push(new Ring(this.scene, ground, 0xffffff, { maxScale: 1.1 + power * 0.8, duration: 0.3 }));
    this.pillars.push(new Pillar(this.scene, ground, color, { height: 1.2 + power * 2.1, duration: 0.42 }));
    const arcs = Math.max(1, Math.round(power * 3));
    for (let i = 0; i < arcs; i++) {
      const spread = (i - (arcs - 1) / 2) * 0.22;
      this.slashes.push(
        new Slash(this.scene, center, fighter.facingAngle + spread, color, {
          duration: 0.3 + i * 0.035,
          offset: new THREE.Vector3(0, i * 0.05, 0),
        })
      );
    }
    this.particles.spawn(center, color, Math.round(16 + power * 18), 3.2 + power * 2.2, 0.34 + power * 0.14);
    this.arena.shake = Math.max(this.arena.shake, 4 + power * 9);
    this.arena.fovKick = Math.min(this.arena.fovKick, -(1.2 + power * 2));
  }

  onMeleeHit(attacker, defender, skill, damage) {
    const f = attacker.forward();
    const color = skill.color ?? attacker.char.accent;
    const pos = new THREE.Vector3(
      defender.x - f.x * 0.3,
      1.0,
      defender.z - f.z * 0.3
    );
    this.slashes.push(new Slash(this.scene, pos, attacker.facingAngle, color, { duration: 0.34 }));
    this.slashes.push(
      new Slash(this.scene, pos, attacker.facingAngle + 0.34, color, {
        duration: 0.26,
        offset: new THREE.Vector3(0, 0.08, 0),
      })
    );
    this.rings.push(new Ring(this.scene, pos, color, { maxScale: 2.15, duration: 0.4 }));
    this.particles.spawn(pos, color, 18, 3.8, 0.36);
    this.rings.push(new Ring(this.scene, new THREE.Vector3(defender.x, 0.08, defender.z), color, { maxScale: 3.4, duration: 0.42 }));
    this.pillars.push(new Pillar(this.scene, new THREE.Vector3(defender.x, 0.08, defender.z), color, { height: 1.8, duration: 0.32 }));
    this.slashes.push(new Slash(this.scene, pos, attacker.facingAngle - 0.4, 0xffffff, { duration: 0.24 }));
    this.particles.spawn(pos, 0xffe3a3, 22, 4.6, 0.42);
    this.arena.fovKick = Math.min(this.arena.fovKick, -2.4);
    this.emitNet('melee', {
      player: attacker.player, x: pos.x, z: pos.z,
      angle: attacker.facingAngle, color: color,
    });
  }

  onProjectileHit(projectile, defender) {
    const color = projectile.skill.color;
    const pos = new THREE.Vector3(projectile.x, 1.0, projectile.z);
    if (projectile.style === 'stone' && projectile.owner.char.id === 'penguin') {
      projectile.owner.addPenguinShield(1);
      this.onPenguinStoneHit(projectile, defender);
    }
    if (projectile.style === 'rasengan') {
      this.flash = Math.max(this.flash, 0.55);
      this.rings.push(new Ring(this.scene, pos, 0x4fc3ff, { maxScale: 4.4, duration: 0.65 }));
      this.rings.push(new Ring(this.scene, pos, 0xbff7ff, { maxScale: 2.6, duration: 0.4 }));
      this.pillars.push(new Pillar(this.scene, pos, 0x4fc3ff, { height: 4.4, duration: 0.6 }));
      this.particles.spawn(pos, 0xbff7ff, 48, 6.0, 0.55);
    } else {
      this.rings.push(new Ring(this.scene, pos, color, { maxScale: 3.4, duration: 0.55 }));
      this.rings.push(new Ring(this.scene, pos, 0xffffff, { maxScale: 2.0, duration: 0.3 }));
      this.pillars.push(new Pillar(this.scene, pos, color, { height: 3.2, duration: 0.45 }));
      this.particles.spawn(pos, color, 30, 5.0, 0.45);
    }
    this.slashes.push(new Slash(this.scene, pos, projectile.owner.facingAngle, color, { duration: 0.3 }));
    this.arena.shake = Math.max(this.arena.shake, projectile.style === 'rasengan' ? 18 : 14);
    this.rings.push(new Ring(this.scene, new THREE.Vector3(pos.x, 0.08, pos.z), color, { maxScale: projectile.style === 'rasengan' ? 5.2 : 3.8, duration: 0.55 }));
    this.slashes.push(new Slash(this.scene, pos, projectile.owner.facingAngle - 0.55, 0xffffff, { duration: 0.26 }));
    this.arena.fovKick = Math.min(this.arena.fovKick, projectile.style === 'rasengan' ? -5 : -3);
    this.emitNet('projHit', {
      player: projectile.owner.player, x: pos.x, z: pos.z, color,
    });
  }

  onPenguinPeckStart(fighter, skill, stage) {
    const f = fighter.forward();
    const mouth = new THREE.Vector3(fighter.x + f.x * 0.48, 1.12, fighter.z + f.z * 0.48);
    if (stage === 0) {
      this.rings.push(new PeckStar(this.scene, mouth, f, 0xffd166));
    } else {
      this.particles.spawn(mouth, 0xaee8ff, 4, 2.2, 0.28);
      this.rings.push(new PeckStar(this.scene, mouth, f, 0xffb347));
    }
  }

  onPenguinPeckHit(fighter, target, skill, stage) {
    this.flash = Math.max(this.flash, 0.18);
    const pos = new THREE.Vector3(target.x, 0.85, target.z);
    if (stage === 0) {
      this.particles.spawn(pos, 0xffffff, 8, 2.0, 0.18);
      this.rings.push(new MiniRing(this.scene, pos, 0xffffff, 0.22, 0.16));
    } else {
      this.rings.push(new MiniRing(this.scene, pos, 0xffa640, 0.4, 0.2));
      this.particles.spawn(pos, 0xffb347, 12, 2.6, 0.22);
    }
  }

  onPenguinFlap(fighter, skill) {
    this.audio.penguinQuack('ga');
    this.particles.spawn(new THREE.Vector3(fighter.x, 0.12, fighter.z), 0x9b8467, 18, 1.2, 0.45);
  }

  onPenguinFlapWave(fighter, skill, index) {
    const f = fighter.forward();
    const pos = new THREE.Vector3(fighter.x + f.x * 0.35, 0.62, fighter.z + f.z * 0.35);
    this.slashes.push(new WindArc(this.scene, pos, fighter.facingAngle, 0x9ff2e8));
    this.particles.spawn(new THREE.Vector3(fighter.x, 0.1, fighter.z), 0x9b8467, 12, 1.1, 0.4);
    this.arena.shake = Math.max(this.arena.shake, 5);
  }

  onPenguinFlapHit(fighter, skill) {
    const pos = new THREE.Vector3(fighter.x, 0.8, fighter.z);
    this.rings.push(new Ring(this.scene, pos, 0xffd166, { maxScale: 2.4, duration: 0.32 }));
    this.particles.spawn(pos, 0x9ff2e8, 18, 4.0, 0.35);
  }

  onPenguinHeavyStart(fighter, skill) {
    this.audio.penguinQuack('heavy');
    this.penguinOrbs.push(new BeakOrb(this.scene, fighter));
    this.particles.spawn(new THREE.Vector3(fighter.x, 0.12, fighter.z), 0x9b8467, 10, 1.0, 0.3);
  }

  onPenguinHeavyDash(fighter, skill) {
    for (const o of this.penguinOrbs) o.kill();
    this.penguinOrbs = [];
    this.particles.spawn(new THREE.Vector3(fighter.x, 0.8, fighter.z), 0xffd166, 24, 3.8, 0.35);
  }

  onPenguinHeavyTrail(fighter, skill) {
    this.particles.spawn(new THREE.Vector3(fighter.x, 0.5, fighter.z), 0xffd166, 3, 1.4, 0.2);
  }

  onPenguinHeavyHit(fighter, skill) {
    const pos = new THREE.Vector3(fighter.x, 0.9, fighter.z);
    this.rings.push(new GoldCross(this.scene, pos));
    this.rings.push(new Ring(this.scene, pos, 0xffd166, { maxScale: 3.2, duration: 0.4 }));
    this.particles.spawn(pos, 0xffe08a, 34, 5.0, 0.4);
    this.flash = Math.max(this.flash, 0.3);
    this.arena.shake = Math.max(this.arena.shake, 14);
    this.arena.fovKick = Math.min(this.arena.fovKick, -4);
  }

  onPenguinHeavyEnd(fighter, skill) {
    fighter.penguinWhiffUntil = this.time + 0.55;
    this.spawnRockBurst(new THREE.Vector3(fighter.x, 0.05, fighter.z), 2);
    this.particles.spawn(new THREE.Vector3(fighter.x, 0.12, fighter.z), 0x9b8467, 8, 1.2, 0.35);
  }

  onPenguinSongStart(fighter, skill, boosted) {
    this.audio.penguinSong(boosted);
    document.body.classList.add('penguin-vignette');
    const pos = new THREE.Vector3(fighter.x, 1.0, fighter.z);
    this.groundAuras.push(new GroundAura(this.scene, fighter.x, fighter.z, boosted ? 4.5 : 3.0, 3.0));
    this.rings.push(new Ring(this.scene, new THREE.Vector3(fighter.x, 0.08, fighter.z), 0xffe08a, { maxScale: boosted ? 6.0 : 4.4, duration: 0.7 }));
    this.pillars.push(new Pillar(this.scene, new THREE.Vector3(fighter.x, 0.08, fighter.z), 0xffe08a, { height: 2.4, duration: 0.6 }));
    this.particles.spawn(pos, 0xffe08a, boosted ? 55 : 36, 4.2, 0.5);
    this.announce('咕咕嘎嘎', boosted ? '石壳共鸣 · 范围扩大' : '音波迷惑 · 3秒', 0.8);
    this.arena.shake = Math.max(this.arena.shake, boosted ? 10 : 7);
  }

  onPenguinSongWave(fighter, skill, index, radius) {
    this.rings.push(new Ring(this.scene, new THREE.Vector3(fighter.x, 0.08, fighter.z), 0xffe08a, { maxScale: radius, duration: 0.5 }));
    this.particles.spawn(new THREE.Vector3(fighter.x, 0.35, fighter.z), 0xffe08a, 18, 2.8, 0.35);
  }

  onPenguinSongNote(fighter) {
    this.notes.push(new MusicNote(this.scene, fighter.x + (Math.random() - 0.5) * 0.7, 1.7, fighter.z + (Math.random() - 0.5) * 0.5));
  }

  onPenguinSongHit(fighter, skill) {
    const target = this.fighters[1 - fighter.player];
    if (target) {
      this.questions.push(new QuestionMark(this.scene, target, 3.0));
      this.rings.push(new MiniRing(this.scene, new THREE.Vector3(target.x, 0.6, target.z), 0xffd166, 0.6, 0.3));
    }
    this.particles.spawn(new THREE.Vector3(fighter.x, 0.7, fighter.z), 0xffe08a, 22, 4.0, 0.4);
  }

  onPenguinSongEnd(fighter, skill) {
    this.audio.stopPenguinSong();
    this.audio.penguinQuack('short');
    document.body.classList.remove('penguin-vignette');
    this.particles.spawn(new THREE.Vector3(fighter.x, 0.8, fighter.z), 0xffe08a, 14, 1.6, 0.35);
  }

  onPenguinStones(fighter, skill) {
    this.particles.spawn(new THREE.Vector3(fighter.x, 0.12, fighter.z), 0x9b8467, 18, 1.4, 0.35);
    this.spawnPenguinStones(fighter, skill);
  }

  onPenguinStoneHit(projectile, target) {
    this.audio.penguinQuack('stoneHit');
    const pos = new THREE.Vector3(projectile.x, 0.8, projectile.z);
    this.rings.push(new MiniRing(this.scene, pos, 0xbfc3c5, 0.35, 0.18));
    this.particles.spawn(pos, 0x9b8467, 12, 3.0, 0.3);
    this.flash = Math.max(this.flash, 0.12);
  }

  updatePenguinShieldAura(fighter) {
    const existing = this.shieldAuras.find((a) => a.fighter === fighter);
    if ((fighter.penguinShieldStacks || 0) > 0) {
      if (!existing) this.shieldAuras.push(new ShieldAura(this.scene, fighter));
    } else if (existing) {
      existing.kill();
    }
  }

  onPenguinShieldBreak(fighter) {
    const pos = new THREE.Vector3(fighter.x, 0.7, fighter.z);
    this.particles.spawn(pos, 0xbfc3c5, 14, 3.2, 0.35);
    this.spawnRockBurst(new THREE.Vector3(fighter.x, 0.1, fighter.z), 4);
  }

  onPenguinFlutter(fighter) {
    for (let i = 0; i < 3; i++) {
      this.feathers.push(new Feather(this.scene, fighter.x + (Math.random() - 0.5) * 0.5, 1.1 + Math.random() * 0.5, fighter.z + (Math.random() - 0.5) * 0.5));
    }
    this.particles.spawn(new THREE.Vector3(fighter.x, 1.0, fighter.z), 0x2b2b2b, 8, 1.5, 0.4);
  }

  onPenguinAdminStart(fighter, skill) {
    this.audio.playPenguinUltimate();
    document.body.classList.add('penguin-vignette');
    this.flash = Math.max(this.flash, 0.9);
    this.arena.shake = 22;
    this.arena.fovKick = Math.min(this.arena.fovKick, -8);
    const pos = new THREE.Vector3(fighter.x, 1.0, fighter.z);
    this.rings.push(new Ring(this.scene, new THREE.Vector3(fighter.x, 0.08, fighter.z), 0xffd166, { maxScale: 6.5, duration: 0.8 }));
    this.pillars.push(new Pillar(this.scene, new THREE.Vector3(fighter.x, 0.08, fighter.z), 0xffd166, { height: 5.4, duration: 0.8 }));
    this.particles.spawn(pos, 0xffd166, 70, 5.5, 0.7);
    for (let i = 0; i < 5; i++) this.feathers.push(new Feather(this.scene, fighter.x + (Math.random() - 0.5) * 4, 3.2 + Math.random() * 2, fighter.z + (Math.random() - 0.5) * 4));
    this.announce('凑企鹅管理员登场', '咕咕嘎嘎 · 全屏音波', 1.2);
  }

  onPenguinAdminTick(fighter, skill) {
    const pos = new THREE.Vector3(fighter.x, 0.6, fighter.z);
    this.rings.push(new Ring(this.scene, pos, 0xffd166, { maxScale: 8.0, duration: 0.55 }));
    this.particles.spawn(pos, 0xffd166, 30, 5.2, 0.45);
    this.arena.shake = Math.max(this.arena.shake, 8);
    const target = this.fighters[1 - fighter.player];
    if (target) {
      if (!this.questions.some((q) => q.target === target)) this.questions.push(new QuestionMark(this.scene, target, 2.8));
      this.slowAuras.push(new SlowAura(this.scene, target));
      this.rings.push(new Ring(this.scene, new THREE.Vector3(target.x, 0.08, target.z), 0xffd166, { maxScale: 2.2, duration: 0.4 }));
    }
  }

  onPenguinAdminEnd(fighter, skill) {
    this.audio.stopPenguinUltimate(650);
    this.audio.stopPenguinSong();
    setTimeout(() => this.audio.penguinQuack('short'), 700);
    document.body.classList.remove('penguin-vignette');
    this.announce('咕', '企鹅管理员下班', 0.7);
    this.particles.spawn(new THREE.Vector3(fighter.x, 0.8, fighter.z), 0xffd166, 18, 2.2, 0.45);
    this.questions.push(new EllipsisMark(this.scene, fighter));
  }

  onStoneRushStart(fighter, skill) {
    this.emitNet('rush', { player: fighter.player, x: fighter.x, z: fighter.z, angle: fighter.facingAngle });
    const pos = new THREE.Vector3(fighter.x, 0.7, fighter.z);
    this.rings.push(new Ring(this.scene, new THREE.Vector3(fighter.x, 0.08, fighter.z), 0xffd166, { maxScale: 2.4, duration: 0.3 }));
    this.particles.spawn(pos, 0xffd166, 16, 3.2, 0.3);
  }

  onStoneRushHit(fighter, skill) {
    const pos = new THREE.Vector3(fighter.x, 0.9, fighter.z);
    this.rings.push(new GoldCross(this.scene, pos));
    this.particles.spawn(pos, 0xffe08a, 22, 4.4, 0.35);
    this.flash = Math.max(this.flash, 0.22);
    this.arena.shake = Math.max(this.arena.shake, 10);
  }

  onDodge(fighter, dx, dz) {
    this.emitNet('dodge', { player: fighter.player, x: fighter.x, z: fighter.z, dx, dz });
    const pos = new THREE.Vector3(fighter.x, 0.55, fighter.z);
    this.rings.push(new Ring(this.scene, new THREE.Vector3(fighter.x, 0.08, fighter.z), 0x9fe8ff, { maxScale: 2.2, duration: 0.32 }));
    this.particles.spawn(pos, 0x9fe8ff, 14, 3.2, 0.3);
    this.arena.fovKick = Math.min(this.arena.fovKick, -1.2);
  }

  onNaiwaSlamStart(fighter, skill) {
    this.audio.swing();
    this.skillFlourish(fighter, skill, skill.color, 1.45);
  }

  onNaiwaSlamImpact(fighter, skill) {
    const pos = new THREE.Vector3(fighter.x, 0.08, fighter.z);
    this.rings.push(new Ring(this.scene, pos, skill.color, { maxScale: 5.6, duration: 0.7 }));
    this.rings.push(new Ring(this.scene, pos, 0xffe0a3, { maxScale: 3.8, duration: 0.5 }));
    this.pillars.push(new Pillar(this.scene, pos, skill.color, { height: 4.0, duration: 0.55 }));
    this.spawnRockBurst(new THREE.Vector3(fighter.x, 0.05, fighter.z), 20);
    this.particles.spawn(new THREE.Vector3(fighter.x, 0.35, fighter.z), 0xb8a58b, 40, 5.2, 0.55);
    this.slashes.push(new Slash(this.scene, new THREE.Vector3(fighter.x, 0.7, fighter.z), fighter.facingAngle, skill.color, { duration: 0.35 }));
    this.arena.shake = Math.max(this.arena.shake, 22);
    this.arena.fovKick = Math.min(this.arena.fovKick, -6);
    this.flash = Math.max(this.flash, 0.35);
  }

  onNaiwaSpinStart(fighter, skill) {
    this.audio.swing();
    this.skillFlourish(fighter, skill, skill.color, 1.25);
  }

  onNaiwaSpinHit(fighter, skill) {
    const pos = new THREE.Vector3(fighter.x, 0.85, fighter.z);
    this.rings.push(new Ring(this.scene, new THREE.Vector3(fighter.x, 0.08, fighter.z), skill.color, { maxScale: 4.2, duration: 0.5 }));
    this.slashes.push(new Slash(this.scene, pos, fighter.facingAngle + 1.2, 0xe8ffff, { duration: 0.32 }));
    this.particles.spawn(pos, 0xbff7ff, 34, 4.8, 0.45);
    this.arena.shake = Math.max(this.arena.shake, 13);
    this.arena.fovKick = Math.min(this.arena.fovKick, -3);
  }

  onSkillStart(fighter, skill) {
    this.emitNet('skill', {
      player: fighter.player, key: skill.key,
      skill: { style: skill.style, type: skill.type, color: skill.color },
    });
    const f = fighter.forward();
    const color = skill.color ?? fighter.char.accent;
    const pos = new THREE.Vector3(fighter.x + f.x * 0.4, 1.05, fighter.z + f.z * 0.4);
    const power = skill.key === 'attack'
      ? 0.35
      : skill.style === 'rasengan'
        ? 1.5
        : skill.type === 'dash'
          ? 1.25
          : skill.type === 'projectile'
            ? 0.9
            : 1.1;
    this.skillFlourish(fighter, skill, color, power);
    this.rings.push(new Ring(this.scene, pos, color, { maxScale: 2.0, duration: 0.4 }));
    if (skill.type === 'dash') {
      for (let i = 1; i <= 3; i++) {
        this.slashes.push(
          new Slash(
            this.scene,
            new THREE.Vector3(fighter.x - f.x * (0.45 * i), 0.9, fighter.z - f.z * (0.45 * i)),
            fighter.facingAngle,
            color,
            { duration: 0.22 + i * 0.04, offset: new THREE.Vector3(0, i * 0.04, 0) }
          )
        );
      }
      this.particles.spawn(new THREE.Vector3(fighter.x - f.x * 0.5, 0.35, fighter.z - f.z * 0.5), color, 26, 4.0, 0.4);
    }
    if (skill.style === 'rasengan') {
      this.audio.skill();
      this.rings.push(new Ring(this.scene, pos, 0x4fc3ff, { maxScale: 2.8, duration: 0.45 }));
      this.pillars.push(new Pillar(this.scene, pos, 0x4fc3ff, { height: 2.4, duration: 0.4 }));
      this.particles.spawn(pos, 0xbff7ff, 30, 3.6, 0.3);
      this.announce('螺旋丸', fighter.char.name, 0.65);
    } else if (skill.type === 'projectile') {
      this.audio.projectile();
      this.particles.spawn(pos, color, 14, 2.8, 0.26);
    } else if (skill.type === 'dash') {
      this.audio.skill();
      this.slashes.push(new Slash(this.scene, pos, fighter.facingAngle, color, { duration: 0.35 }));
      this.pillars.push(new Pillar(this.scene, pos, color, { height: 2.6, duration: 0.35 }));
      this.particles.spawn(pos, color, 20, 3.4, 0.3);
    } else {
      if (skill.key === 'attack') this.audio.swing();
      else this.audio.skill();
      this.slashes.push(new Slash(this.scene, pos, fighter.facingAngle, color, { duration: 0.32 }));
      this.particles.spawn(pos, color, 16, 3.2, 0.3);
    }
  }

  updateNaiwaUltimateChannel(fighter, skill, dt) {
    if (!skill.channel) return;
    skill.pulseTimer = (skill.pulseTimer ?? 0) + dt;
    if (skill.pulseTimer < 0.32) return;
    skill.pulseTimer = 0;
    const color = skill.color;
    const pos = new THREE.Vector3(fighter.x, 0.9, fighter.z);
    this.rings.push(new Ring(this.scene, pos, color, { maxScale: 3.2, duration: 0.55 }));
    this.rings.push(new Ring(this.scene, pos, 0xffe3a3, { maxScale: 2.2, duration: 0.38 }));
    this.slashes.push(new Slash(this.scene, pos, fighter.facingAngle + Math.random() * 0.6 - 0.3, color, { duration: 0.42 }));
    this.pillars.push(new Pillar(this.scene, pos, color, { height: 3.4 + Math.random() * 0.8, duration: 0.5 }));
    this.particles.spawn(new THREE.Vector3(fighter.x, 1.0, fighter.z), 0xffd166, 16, 4.6, 0.5);
    this.arena.shake = Math.max(this.arena.shake, 9);
    this.arena.fovKick = Math.min(this.arena.fovKick, -1.4);
  }

  endNaiwaUltimate(fighter) {
    if (fighter.state !== 'skill' || !fighter.current?.channel) return;
    const color = fighter.current.color;
    const pos = new THREE.Vector3(fighter.x, 0.9, fighter.z);
    this.rings.push(new Ring(this.scene, pos, color, { maxScale: 4.6, duration: 0.7 }));
    this.pillars.push(new Pillar(this.scene, pos, color, { height: 5.2, duration: 0.7 }));
    this.particles.spawn(new THREE.Vector3(fighter.x, 1.1, fighter.z), color, 40, 6.0, 0.7);
    this.arena.shake = Math.max(this.arena.shake, 12);
    this.flash = Math.max(this.flash, 0.35);
    this.arena.fovKick = Math.min(this.arena.fovKick, -3);
    fighter.endNaiwaUltimateChannel();
  }

  onUltimateStart(fighter, skill) {
    this.emitNet('ultimate', {
      player: fighter.player,
      skill: { key: skill.key, type: skill.type, color: skill.color, name: skill.name },
    });
    if (fighter.char.id === 'naiwa') {
      this.audio.playNaiwaUltimate(() => this.endNaiwaUltimate(fighter));
    }
    this.flash = 0.95;
    this.arena.shake = 20;
    this.arena.fovKick = Math.min(this.arena.fovKick, -7);
    this.audio.ultimate();
    const color = skill.color;
    const pos = new THREE.Vector3(fighter.x, 0.1, fighter.z);
    this.rings.push(new Ring(this.scene, pos, color, { maxScale: 3.8, duration: 0.55 }));
    this.rings.push(new Ring(this.scene, pos, color, { maxScale: 5.5, duration: 0.8 }));
    this.rings.push(new Ring(this.scene, pos, 0xffffff, { maxScale: 7.2, duration: 1.05 }));
    this.pillars.push(new Pillar(this.scene, pos, color, { height: 6.0, duration: 0.95 }));
    for (let i = 0; i < 4; i++) {
      this.slashes.push(
        new Slash(this.scene, new THREE.Vector3(fighter.x, 0.9, fighter.z), fighter.facingAngle + i * Math.PI / 2, color, {
          duration: 0.55 + i * 0.05,
        })
      );
    }
    this.particles.spawn(new THREE.Vector3(fighter.x, 1.1, fighter.z), color, 64, 6.5, 0.8);
    this.announce(skill.name, fighter.char.name, 1.0);
  }

  spawnProjectile(owner, skill) {
    const p = new Projectile(this.scene, owner, skill);
    p.netId = ++this.projectileSeq;
    this.projectiles.push(p);
  }

  announce(title, sub = '', duration = 1.4) {
    clearTimeout(this._annTimer);
    this.ui.announce.innerHTML = `<strong>${title}</strong>${sub ? `<span>${sub}</span>` : ''}`;
    this.ui.announce.classList.add('show');
    this._annTimer = setTimeout(() => this.ui.announce.classList.remove('show'), Math.max(300, duration * 1000));
  }

  toast(text) {
    clearTimeout(this._toastTimer);
    this.ui.toast.textContent = text;
    this.ui.toast.classList.add('show');
    this._toastTimer = setTimeout(() => this.ui.toast.classList.remove('show'), 1100);
  }

  updateHUD() {
    for (let i = 0; i < 2; i++) {      const f = this.fighters[i];
      const hpPct = Math.max(0, (f.hp / f.maxHp) * 100);
      const enPct = Math.max(0, (f.energy / 100) * 100);
      if (i === 0) {
        this.ui.p1Hp.style.width = `${hpPct}%`;
        this.ui.p1HpText.textContent = String(Math.ceil(f.hp));
        this.ui.p1Energy.style.width = `${enPct}%`;
      } else {
        this.ui.p2Hp.style.width = `${hpPct}%`;
        this.ui.p2HpText.textContent = String(Math.ceil(f.hp));
        this.ui.p2Energy.style.width = `${enPct}%`;
      }
      const winsEl = i === 0 ? this.ui.p1Wins : this.ui.p2Wins;
      const wins = f.wins;
      let html = '';
      for (let w = 0; w < WINS_NEEDED; w++) html += `<i class="${w < wins ? 'on' : ''}"></i>`;
      winsEl.innerHTML = html;
    }
    this.ui.timer.textContent = String(Math.ceil(this.timer));
    this.ui.roundLabel.textContent = `ROUND ${this.round}`;

    for (const el of this.buttons) {
      const f = this.fighters[Number(el.dataset.player)];
      const action = el.dataset.action;
      const cdEl = el.querySelector('.cd');
      if (action === 'dodge') {
        const cd = f.cooldowns.dodge || 0;
        if (cdEl) cdEl.textContent = cd > 0.05 ? (cd < 1 ? cd.toFixed(1) : String(Math.ceil(cd))) : '';
        el.classList.remove('unavailable');
        el.classList.toggle('cooling', cd > 0.05);
        el.classList.toggle('ready', cd <= 0.05 && this.state === 'fighting');
        continue;
      }
      const skill = f.char.skills[action];
      if (!skill) continue;
      const cd = f.cooldowns[action] || 0;
      if (cdEl) cdEl.textContent = cd > 0.05 ? (cd < 1 ? cd.toFixed(1) : String(Math.ceil(cd))) : '';
      const noEnergy = f.energy < skill.cost;
      el.classList.toggle('unavailable', noEnergy);
      el.classList.toggle('cooling', cd > 0.05);
      if (action === 'ultimate') {
        el.classList.toggle('ready', f.energy >= skill.cost && cd <= 0 && this.state === 'fighting');
      }
    }
  }

  render() {
    this.arena.render();
  }
}
