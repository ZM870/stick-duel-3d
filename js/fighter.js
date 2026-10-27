import { ARENA, ENERGY_MAX, ENERGY_REGEN, START_ENERGY } from './config.js';
import { Stickman } from './stickman.js';
import { Mascot } from './mascot.js';
import { GltfMascot } from './gltf-mascot.js';

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Fighter {
  constructor(game, player, character) {
    this.game = game;
    this.player = player;
    this.char = character;
    this.maxHp = character.maxHp;
    this.hp = this.maxHp;
    this.energy = START_ENERGY;
    this.x = player === 0 ? -ARENA.startX : ARENA.startX;
    this.z = player === 0 ? 0 : 0;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.landTimer = 0;
    this.vx = 0;
    this.vz = 0;
    this.facingAngle = player === 0 ? Math.PI / 2 : -Math.PI / 2;
    this.state = 'idle';
    this.stateTime = 0;
    this.animTime = Math.random() * 10;
    this.current = null;
    this.currentAction = null;
    this.currentDamage = 0;
    this.hitDone = false;
    this.spawned = false;
    this.cooldowns = { attack: 0, skill1: 0, skill2: 0, ultimate: 0, dodge: 0 };
    this.invuln = 0;
    this.flash = 0;
    this.hurtTime = 0;
    this.koTime = 0;
    this.comboStep = -1;
    this.comboTimer = 0;
    this.slowUntil = 0;
    this.slowFactor = 1;
    this.wins = 0;
    this.chargeTime = 0;
    this.chargeRatio = 0;
    this.spinAngle = 0;
    this.spinRate = 0;
    this.penguinShield = 0;
    this.penguinShieldStacks = 0;
    this.penguinConfusedUntil = 0;
    this.penguinDeepUntil = 0;
    this.penguinStunUntil = 0;
    this.penguinWhiffUntil = 0;
    this.penguinHeavyHeld = false;
    this.penguinAdmin = false;
    this.penguinScale = 1;
    this.penguinTick = 0;
    this.penguinStepTimer = 0;
    this.stoneRushQueue = 0;
    this.stoneRushCooldown = 0;

    const asset = game.loadedModels?.[character.id];
    const template = asset?.scene ?? asset;
    this.stickman = template
      ? new GltfMascot(character, template, asset?.animations ?? [])
      : character.kind
        ? new Mascot(character)
        : new Stickman(character);
    this.stickman.root.position.set(this.x, 0, this.z);
    game.arena.scene.add(this.stickman.root);
  }

  get opponent() {
    return this.game.fighters[1 - this.player];
  }

  upgradeModel() {
    const asset = this.game.loadedModels?.[this.char.id];
    if (!asset || this.stickman instanceof GltfMascot) return false;
    const old = this.stickman;
    let next = null;
    try {
      next = new GltfMascot(this.char, asset.scene, asset.animations ?? []);
      next.root.position.set(this.x, 0, this.z);
      next.root.rotation.set(0, this.facingAngle, 0);
      this.stickman = next;
      this.game.arena.scene.add(next.root);
      try { this.game.arena.scene.remove(old.root); } catch { /* ignore */ }
      return true;
    } catch (err) {
      console.warn(`${this.char.id} 高清模型替换失败，保留备用模型`, err);
      if (next) {
        try { this.game.arena.scene.remove(next.root); } catch { /* ignore */ }
      }
      this.stickman = old;
      if (!old.root.parent) this.game.arena.scene.add(old.root);
      return false;
    }
  }

  forward() {
    return { x: Math.sin(this.facingAngle), z: Math.cos(this.facingAngle) };
  }

  moveAxis() {
    const a = this.game.input.axis(this.player);
    if (this.player !== 0) return a;
    const f = this.game.arena.getCameraForward?.() ?? { x: 0, z: -1 };
    return {
      x: (-f.z) * a.x + f.x * (-a.y),
      y: f.x * a.x + f.z * (-a.y),
    };
  }

  inputDirection() {
    const a = this.moveAxis();
    const len = Math.hypot(a.x, a.y);
    if (len < 0.12) return null;
    return { x: a.x / len, z: a.y / len };
  }

  distanceTo(other) {
    return Math.hypot(this.x - other.x, this.z - other.z);
  }

  isKo() {
    return this.state === 'ko';
  }

  canAct() {
    return (this.state === 'idle' || this.state === 'run') && this.game.state === 'fighting';
  }

  resetRound() {
    this.hp = this.maxHp;
    this.energy = START_ENERGY;
    this.x = this.player === 0 ? -ARENA.startX : ARENA.startX;
    this.z = 0;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.landTimer = 0;
    this.vx = 0;
    this.vz = 0;
    this.facingAngle = this.player === 0 ? Math.PI / 2 : -Math.PI / 2;
    this.state = 'idle';
    this.stateTime = 0;
    this.current = null;
    this.currentAction = null;
    this.hitDone = false;
    this.spawned = false;
    this.chargeTime = 0;
    this.chargeRatio = 0;
    this.spinAngle = 0;
    this.spinRate = 0;
    this.penguinShield = 0;
    this.penguinShieldStacks = 0;
    this.penguinConfusedUntil = 0;
    this.penguinDeepUntil = 0;
    this.penguinStunUntil = 0;
    this.penguinWhiffUntil = 0;
    this.penguinHeavyHeld = false;
    this.penguinAdmin = false;
    this.penguinScale = 1;
    this.penguinTick = 0;
    this.penguinStepTimer = 0;
    this.stoneRushQueue = 0;
    this.stoneRushCooldown = 0;
    this.cooldowns = { attack: 0, skill1: 0, skill2: 0, ultimate: 0, dodge: 0 };
    this.invuln = 0;
    this.flash = 0;
    this.hurtTime = 0;
    this.koTime = 0;
    this.comboStep = -1;
    this.comboTimer = 0;
    this.slowUntil = 0;
    this.slowFactor = 1;
    this.stickman.root.position.set(this.x, 0, this.z);
    this.stickman.root.rotation.set(0, this.facingAngle, 0);
  }

  resetMatch() {
    this.wins = 0;
    this.resetRound();
  }

  update(dt) {
    this.animTime += dt;
    this.stateTime += dt;
    for (const k of Object.keys(this.cooldowns)) {
      this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.flash = Math.max(0, this.flash - dt * 4.5);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    this.landTimer = Math.max(0, this.landTimer - dt);
    if (!this.grounded) {
      this.vy -= 18.5 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
        this.landTimer = this.char.id === 'penguin' ? 0 : 0.14;
        if (this.char.id === 'penguin') {
        this.game.audio.thump(88, 38, 0.1, 0.045);
        this.game.audio.penguinQuack('land');
        this.game.dropPenguinStone(this.x, this.z);
      }
      }
    }
    if (this.state !== 'ko') {
      this.energy = Math.min(ENERGY_MAX, this.energy + ENERGY_REGEN * dt);
    }

    if (this.state === 'ko') {
      this.koTime += dt;
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      this.vx *= Math.pow(0.02, dt);
      this.vz *= Math.pow(0.02, dt);
      this.clampArena();
      this.stickman.update(dt, this);
      return;
    }

    if (this.state === 'hurt') {
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      const fr = Math.pow(0.008, dt);
      this.vx *= fr;
      this.vz *= fr;
      this.clampArena();
      if (this.stateTime >= this.hurtTime) {
        this.state = 'idle';
        this.stateTime = 0;
      }
      this.stickman.update(dt, this);
      return;
    }

    if (this.state === 'dodge') {
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      const fr = Math.pow(0.35, dt);
      this.vx *= fr;
      this.vz *= fr;
      this.clampArena();
      for (const action of ['attack', 'skill1', 'skill2', 'ultimate', 'jump', 'dodge']) {
        this.game.input.consume(this.player, action);
      }
      if (this.stateTime >= 0.4) {
        this.state = 'dodgeRecover';
        this.stateTime = 0;
        this.vx *= 0.25;
        this.vz *= 0.25;
      }
      this.stickman.update(dt, this);
      return;
    }

    if (this.state === 'dodgeRecover') {
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      this.vx *= Math.pow(0.02, dt);
      this.vz *= Math.pow(0.02, dt);
      this.clampArena();
      if (this.stateTime >= 0.14) {
        this.state = 'idle';
        this.stateTime = 0;
      }
      this.stickman.update(dt, this);
      return;
    }

    if (this.state === 'stoneRush' && this.current) {
      this.updateStoneRush(dt, this.current);
      this.stickman.update(dt, this);
      return;
    }

    if (this.char.id === 'penguin' && this.stoneRushQueue > 0 && this.canAct() &&
        this.game.input.isDown(this.player, 'attack') &&
        this.game.input.heldFor(this.player, 'attack') > 0.2) {
      this.startStoneRush();
      this.stickman.update(dt, this);
      return;
    }

    if (this.state === 'charging') {
      this.chargeTime = Math.min(4.0, this.chargeTime + dt);
      this.chargeRatio = this.chargeTime / 4.0;
      const targetAngle = Math.atan2(this.opponent.x - this.x, this.opponent.z - this.z);
      this.facingAngle = angleLerp(this.facingAngle, targetAngle, 1 - Math.exp(-dt * 10));
      const fr = Math.pow(0.02, dt);
      const axis = this.moveAxis();
      const slow = this.slowUntil > this.game.time ? this.slowFactor : 1;
      const speed = this.char.speed * 0.58 * slow;
      const tx = axis.x * speed;
      const tz = axis.y * speed;
      const accel = Math.min(1, dt * 11);
      this.vx += (tx - this.vx) * accel;
      this.vz += (tz - this.vz) * accel;
      if (Math.hypot(axis.x, axis.y) < 0.05) {
        this.vx *= fr;
        this.vz *= fr;
      }
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      this.clampArena();
      this.stickman.update(dt, this);
      const held = this.game.input.isDown(this.player, 'skill2');
      if (!held || this.chargeTime >= 4.0 || this.game.state !== 'fighting') {
        this.releaseRasengan();
      }
      return;
    }

    if (this.state === 'skill' && this.current) {
      this.updateSkill(dt);
      this.clampArena();
      this.stickman.update(dt, this);
      return;
    }

    // 面向对手
    const targetAngle = Math.atan2(this.opponent.x - this.x, this.opponent.z - this.z);
    this.facingAngle = angleLerp(this.facingAngle, targetAngle, 1 - Math.exp(-dt * 10));

    // 移动
    const axis = this.penguinStunUntil > this.game.time ? { x: 0, y: 0 } : this.moveAxis();
    const slow = this.slowUntil > this.game.time ? this.slowFactor : 1;
    const speed = this.char.speed * slow;
    const tx = axis.x * speed;
    const tz = axis.y * speed;
    const accel = Math.min(1, dt * 14);
    this.vx += (tx - this.vx) * accel;
    this.vz += (tz - this.vz) * accel;
    if (Math.hypot(axis.x, axis.y) < 0.05) {
      const fr = Math.pow(0.0004, dt);
      this.vx *= fr;
      this.vz *= fr;
    }
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.clampArena();

    this.state = Math.hypot(this.vx, this.vz) > 0.35 ? 'run' : 'idle';
    this.stateTime = 0;
    if (this.char.id === 'penguin' && this.grounded && this.state === 'run') {
      this.penguinStepTimer += dt;
      if (this.penguinStepTimer > 0.24) {
        this.penguinStepTimer = 0;
        this.game.spawnFootprint(this.x, this.z, this.facingAngle);
      }
    }

    if (this.game.state === 'fighting') {
      for (const action of ['jump', 'attack', 'skill1', 'skill2', 'ultimate', 'dodge']) {
        if (action === 'dodge') {
          if (this.game.input.consume(this.player, 'dodge')) this.tryDodge();
          continue;
        }
        if (action === 'skill2' && this.char.id === 'naiwa' && this.player === 0) {
          if (this.game.input.consume(this.player, action)) {
            this.beginRasenganCharge();
            break;
          }
          continue;
        }
        if (this.game.input.consume(this.player, action)) {
          if (action === 'jump') {
            this.jump();
            break;
          }
          if (this.startSkill(action)) break;
        }
      }
      if (this.char.id === 'penguin') {
        const held = this.game.input.isDown(this.player, 'attack');
        if (!held) this.penguinHeavyHeld = false;
        if (this.state === 'idle' && held && !this.penguinHeavyHeld &&
            this.comboStep >= 2 && this.game.input.heldFor(this.player, 'attack') > 0.42 &&
            this.cooldowns.attack <= 0) {
          this.penguinHeavyHeld = true;
          this.startPenguinHeavy(this.char.skills.attack, 3);
        }
      }
    }

    this.stickman.update(dt, this);
  }

  clampArena() {
    const r = Math.hypot(this.x, this.z);
    if (r > ARENA.fightRadius) {
      this.x = (this.x / r) * ARENA.fightRadius;
      this.z = (this.z / r) * ARENA.fightRadius;
    }
  }

  jump() {
    if (this.game.state !== 'fighting') return false;
    if (!this.grounded) return false;
    if (this.state !== 'idle' && this.state !== 'run') return false;
    this.vy = 6.4;
    this.y = 0.02;
    this.grounded = false;
    this.game.audio.jump?.();
    return true;
  }

  beginRasenganCharge() {
    if (this.char.id !== 'naiwa' || this.player !== 0) return false;
    if (!this.canAct()) return false;
    const base = this.char.skills.skill2;
    if (!base) return false;
    if (this.cooldowns.skill2 > 0) return false;
    if (this.energy < base.cost) {
      this.game.toast(`${this.char.name}：能量不足`);
      return false;
    }
    this.state = 'charging';
    this.stateTime = 0;
    this.chargeTime = 0;
    this.chargeRatio = 0;
    this.current = null;
    this.currentAction = 'skill2';
    this.vx = 0;
    this.vz = 0;
    this.game.startRasenganCharge(this, base);
    this.game.audio.skill?.();
    return true;
  }

  releaseRasengan() {
    if (this.state !== 'charging') return;
    const base = this.char.skills.skill2;
    const ratio = Math.max(0, Math.min(1, this.chargeTime / 4.0));
    this.game.releaseRasenganCharge(this);
    this.state = 'idle';
    this.stateTime = 0;
    if (!base || this.game.state !== 'fighting') {
      this.chargeTime = 0;
      this.chargeRatio = 0;
      this.currentAction = null;
      return;
    }
    if (this.cooldowns.skill2 > 0 || this.energy < base.cost) {
      this.chargeTime = 0;
      this.chargeRatio = 0;
      this.currentAction = null;
      return;
    }

    const power = 1 + ratio * 0.9;
    const skill = {
      ...base,
      damage: Math.round(base.damage * power),
      radius: base.radius * (1 + ratio * 0.65),
      speed: base.speed * (1 + ratio * 0.35),
      style: 'rasengan',
      chargeRatio: ratio,
    };
    this.current = skill;
    this.currentAction = 'skill2';
    this.currentDamage = skill.damage;
    this.energy = Math.max(0, this.energy - base.cost);
    this.cooldowns.skill2 = base.cooldown;
    this.state = 'skill';
    this.stateTime = 0;
    this.hitDone = false;
    this.spawned = false;
    this.vx = 0;
    this.vz = 0;
    this.facingAngle = Math.atan2(this.opponent.x - this.x, this.opponent.z - this.z);
    this.chargeTime = 0;
    this.chargeRatio = 0;
    this.game.onSkillStart(this, skill);
  }

  startNaiwaSlam(base, stage) {
    const f = this.forward();
    const skill = {
      ...base,
      key: 'attack',
      name: '奶娃下砸',
      custom: 'slam',
      damage: Math.round(base.damage * 1.7),
      startup: 0.18,
      active: 0.95,
      recovery: 0.3,
      range: 3.1,
      arc: 2.2,
      knockback: 4.8,
      hitstun: 0.36,
    };
    this.current = skill;
    this.currentAction = 'attack';
    this.currentDamage = skill.damage;
    this.state = 'skill';
    this.stateTime = 0;
    this.hitDone = false;
    this.spawned = false;
    this.comboStep = stage;
    this.comboTimer = 1.75;
    this.cooldowns.attack = 0.3;
    const slamDir = this.inputDirection();
    this.facingAngle = slamDir
      ? Math.atan2(slamDir.x, slamDir.z)
      : Math.atan2(this.opponent.x - this.x, this.opponent.z - this.z);
    this.slamDirX = slamDir ? slamDir.x : this.forward().x;
    this.slamDirZ = slamDir ? slamDir.z : this.forward().z;
    this.slamDive = false;
    this.vx = this.slamDirX * 2.8;
    this.vz = this.slamDirZ * 2.8;
    this.vy = 9.4;
    this.y = 0.02;
    this.grounded = false;
    this.game.onNaiwaSlamStart(this, skill);
    return true;
  }

  startNaiwaSpin(base, stage) {
    const skill = {
      ...base,
      key: 'attack',
      name: '奶娃旋风',
      custom: 'spin',
      damage: Math.round(base.damage * 1.3),
      startup: 0.06,
      active: 0.72,
      recovery: 0.22,
      range: 2.45,
      arc: Math.PI * 2,
      knockback: 3.2,
      hitstun: 0.28,
    };
    this.current = skill;
    this.currentAction = 'attack';
    this.currentDamage = skill.damage;
    this.state = 'skill';
    this.stateTime = 0;
    this.hitDone = false;
    this.spawned = false;
    this.comboStep = stage;
    this.comboTimer = 1.45;
    this.cooldowns.attack = 0.24;
    this.facingAngle = Math.atan2(this.opponent.x - this.x, this.opponent.z - this.z);
    this.vx = 0;
    this.vz = 0;
    this.spinAngle = 0;
    this.spinRate = 27;
    this.game.startWindAura(this);
    this.game.onNaiwaSpinStart(this, skill);
    return true;
  }

  finishNaiwaSpecial() {
    this.game.stopWindAura(this);
    this.spinAngle = 0;
    this.spinRate = 0;
    this.current = null;
    this.currentAction = null;
    this.state = 'idle';
    this.stateTime = 0;
    this.vx *= 0.25;
    this.vz *= 0.25;
  }

  updateNaiwaSlam(dt, skill) {
    const t = this.stateTime;
    const steer = this.inputDirection();
    if (steer) {
      this.slamDirX = steer.x;
      this.slamDirZ = steer.z;
      this.facingAngle = angleLerp(this.facingAngle, Math.atan2(steer.x, steer.z), 1 - Math.exp(-dt * 18));
      this.vx = steer.x * (this.slamDive ? 7.2 : 2.8);
      this.vz = steer.z * (this.slamDive ? 7.2 : 2.8);
    }
    // 到最高点后改为斜向前下方俯冲，而不是直上直下
    if (!this.slamDive && this.vy <= 0) {
      this.slamDive = true;
      this.vx = this.slamDirX * 7.2;
      this.vz = this.slamDirZ * 7.2;
    }
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.clampArena();
    if (!this.hitDone && this.grounded && t > 0.12) {
      this.hitDone = true;
      this.vx = 0;
      this.vz = 0;
      this.game.onNaiwaSlamImpact(this, skill);
      const target = this.opponent;
      if (target && !target.isKo() && this.distanceTo(target) < skill.range) {
        const hit = target.takeHit(this, skill, this.currentDamage);
        if (hit) {
          // takeHit 已经触发 onHit 的伤害数字和音效
        }
      }
    }
    const total = skill.startup + skill.active + skill.recovery;
    if (t >= total) this.finishNaiwaSpecial();
  }

  updateNaiwaSpin(dt, skill) {
    const t = this.stateTime;
    const axis = this.moveAxis();
    let ax = axis.x;
    let az = axis.y;
    if (Math.hypot(ax, az) < 0.1) {
      const f = this.forward();
      ax = f.x;
      az = f.z;
    }
    const len = Math.hypot(ax, az) || 1;
    const speed = 3.6;
    this.vx = (ax / len) * speed;
    this.vz = (az / len) * speed;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.clampArena();
    this.spinAngle += this.spinRate * dt;

    if (!this.hitDone && t > 0.1) {
      const target = this.opponent;
      if (target && !target.isKo() && this.distanceTo(target) < skill.range) {
        this.hitDone = true;
        const hit = target.takeHit(this, skill, this.currentDamage);
        if (hit) {
          this.game.onNaiwaSpinHit(this, skill);
        }
      }
    }
    const total = skill.startup + skill.active + skill.recovery;
    if (t >= total) this.finishNaiwaSpecial();
  }

  addPenguinShield(stacks = 1) {
    if (this.char.id !== 'penguin') return;
    this.penguinShield = Math.min(210, this.penguinShield + stacks * 70);
    this.penguinShieldStacks = Math.min(3, Math.ceil(this.penguinShield / 70));
    this.game.toast(`企鹅石壳 ${this.penguinShieldStacks}/3`);
    this.game.updatePenguinShieldAura(this);
  }

  startPenguinFlap(base, stage) {
    const skill = {
      ...base, key: 'attack', name: '企鹅扇风', custom: 'flap',
      damage: Math.round(base.damage * 1.12),
      startup: 0.0, active: 0.4, recovery: 0.1,
      range: 2.75, arc: Math.PI * 2, knockback: 2.6, hitstun: 0.24,
    };
    this.current = skill;
    this.currentAction = 'attack';
    this.currentDamage = skill.damage;
    this.state = 'skill';
    this.stateTime = 0;
    this.hitDone = false;
    this.spawned = false;
    this.flapWave1 = false;
    this.flapWave2 = false;
    this.comboStep = stage;
    this.comboTimer = 1.25;
    this.cooldowns.attack = 0.3;
    this.vx = 0;
    this.vz = 0;
    this.facingAngle = Math.atan2(this.opponent.x - this.x, this.opponent.z - this.z);
    this.game.onPenguinFlap(this, skill);
    return true;
  }

  startPenguinHeavy(base, stage) {
    const dir = this.inputDirection();
    const f = dir ?? this.forward();
    const skill = {
      ...base, key: 'attack', name: '企鹅冲啄', custom: 'heavy',
      damage: Math.round(base.damage * 1.45),
      startup: 0.3, active: 0.2, recovery: 0.3,
      range: 2.7, arc: 1.3, knockback: 6.0, hitstun: 0.34,
    };
    this.current = skill;
    this.currentAction = 'attack';
    this.currentDamage = skill.damage;
    this.state = 'skill';
    this.stateTime = 0;
    this.hitDone = false;
    this.spawned = false;
    this.comboStep = stage;
    this.comboTimer = 1.05;
    this.cooldowns.attack = 0.5;
    this.penguinHeavyHeld = true;
    this.heavyDashed = false;
    this.heavyEnded = false;
    this.heavyTrail = 0;
    this.facingAngle = Math.atan2(f.x, f.z);
    this.vx = 0;
    this.vz = 0;
    this.game.onPenguinHeavyStart(this, skill);
    return true;
  }

  startPenguinSong(base) {
    const boosted = this.penguinShield > 0;
    const skill = {
      ...base, key: 'skill1', name: '咕咕嘎嘎', custom: 'song',
      damage: Math.round(base.damage * 0.8),
      startup: 0.25, active: 2.6, recovery: 0.2,
      cooldown: 8, range: boosted ? 4.5 : 3.0, arc: Math.PI * 2,
      knockback: 1.2, hitstun: 0.2,
    };
    this.current = skill;
    this.currentAction = 'skill1';
    this.currentDamage = skill.damage;
    this.state = 'skill';
    this.stateTime = 0;
    this.hitDone = false;
    this.spawned = false;
    this.songWaveCount = 0;
    this.songNoteTimer = 0;
    this.comboStep = -1;
    this.cooldowns.skill1 = 8;
    this.energy = Math.max(0, this.energy - base.cost);
    this.vx = 0;
    this.vz = 0;
    this.facingAngle = Math.atan2(this.opponent.x - this.x, this.opponent.z - this.z);
    this.game.onPenguinSongStart(this, skill, boosted);
    return true;
  }

  startPenguinStones(base) {
    const skill = {
      ...base, key: 'skill2', name: '小石头囤积', custom: 'stones',
      startup: 0.3, active: 0.05, recovery: 0.2,
      cooldown: 10,
    };
    this.current = skill;
    this.currentAction = 'skill2';
    this.state = 'skill';
    this.stateTime = 0;
    this.hitDone = false;
    this.spawned = false;
    this.stonesThrown = false;
    this.comboStep = -1;
    this.cooldowns.skill2 = 10;
    this.energy = Math.max(0, this.energy - base.cost);
    this.vx = 0;
    this.vz = 0;
    this.facingAngle = Math.atan2(this.opponent.x - this.x, this.opponent.z - this.z);
    return true;
  }

  startPenguinAdmin(base) {
    const skill = {
      ...base, key: 'ultimate', name: '凑企鹅管理员登场', custom: 'admin',
      damage: Math.round(base.damage / 8),
      startup: 0.8, active: 4.0, recovery: 1.2,
      cooldown: base.cooldown, range: 8.0, arc: Math.PI * 2,
      knockback: 0, hitstun: 0.18,
    };
    this.current = skill;
    this.currentAction = 'ultimate';
    this.currentDamage = skill.damage;
    this.state = 'skill';
    this.stateTime = 0;
    this.hitDone = false;
    this.spawned = false;
    this.comboStep = -1;
    this.penguinTick = 0.5;
    this.penguinAdmin = true;
    this.penguinScale = 1.5;
    this.penguinShield = 210;
    this.penguinShieldStacks = 3;
    this.game.updatePenguinShieldAura(this);
    this.cooldowns.ultimate = base.cooldown;
    this.energy = Math.max(0, this.energy - base.cost);
    this.vx = 0;
    this.vz = 0;
    this.facingAngle = Math.atan2(this.opponent.x - this.x, this.opponent.z - this.z);
    this.game.onPenguinAdminStart(this, skill);
    return true;
  }

  finishPenguinSpecial() {
    this.penguinAdmin = false;
    this.penguinScale = 1;
    this.current = null;
    this.currentAction = null;
    this.state = 'idle';
    this.stateTime = 0;
    this.vx *= 0.25;
    this.vz *= 0.25;
    if (!this.hitDone) this.penguinWhiffUntil = this.game.time + 0.8;
  }

  updatePenguinFlap(dt, skill) {
    const t = this.stateTime;
    if (!this.flapWave1 && t >= 0) {
      this.flapWave1 = true;
      this.game.onPenguinFlapWave(this, skill, 0);
    }
    if (!this.flapWave2 && t >= 0.2) {
      this.flapWave2 = true;
      this.game.onPenguinFlapWave(this, skill, 1);
    }
    if (!this.hitDone && t > 0.1) {
      this.hitDone = true;
      const target = this.opponent;
      if (target && !target.isKo() && this.distanceTo(target) < skill.range) {
        const hit = target.takeHit(this, skill, this.currentDamage);
        if (hit) this.game.onPenguinFlapHit(this, skill);
      }
    }
    if (t >= skill.startup + skill.active + skill.recovery) this.finishPenguinSpecial();
  }

  updatePenguinHeavy(dt, skill) {
    const t = this.stateTime;
    if (t < 0.3) {
      this.vx = 0;
      this.vz = 0;
    } else {
      if (!this.heavyDashed) {
        this.heavyDashed = true;
        const f = this.forward();
        this.vx = f.x * 9.0;
        this.vz = f.z * 9.0;
        this.game.onPenguinHeavyDash(this, skill);
      }
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      this.vx *= Math.pow(0.16, dt);
      this.vz *= Math.pow(0.16, dt);
      this.clampArena();
      this.heavyTrail = (this.heavyTrail || 0) + dt;
      if (this.heavyTrail > 0.055) {
        this.heavyTrail = 0;
        this.game.onPenguinHeavyTrail(this, skill);
      }
    }
    if (!this.hitDone && t > 0.32 && this.distanceTo(this.opponent) < skill.range) {
      this.hitDone = true;
      const hit = this.opponent.takeHit(this, skill, this.currentDamage);
      if (hit) this.game.onPenguinHeavyHit(this, skill);
    }
    if (!this.heavyEnded && t >= 0.55) {
      this.heavyEnded = true;
      this.game.onPenguinHeavyEnd(this, skill);
    }
    if (t >= skill.startup + skill.active + skill.recovery) this.finishPenguinSpecial();
  }

  updatePenguinSong(dt, skill) {
    const t = this.stateTime;
    this.vx = 0;
    this.vz = 0;
    if (!this.hitDone && t > 0.3) {
      this.hitDone = true;
      const target = this.opponent;
      if (target && !target.isKo() && this.distanceTo(target) < skill.range) {
        const hit = target.takeHit(this, skill, this.currentDamage);
        if (hit) {
          target.penguinConfusedUntil = this.game.time + 3;
          this.game.onPenguinSongHit(this, skill);
        }
      }
    }
    if (this.songWaveCount < 6 && t >= 0.5 + this.songWaveCount * 0.5) {
      this.songWaveCount++;
      this.game.onPenguinSongWave(this, skill, this.songWaveCount, skill.range);
    }
    this.songNoteTimer += dt;
    if (this.songNoteTimer > 0.28) {
      this.songNoteTimer = 0;
      this.game.onPenguinSongNote(this);
    }
    if (t >= skill.startup + skill.active + skill.recovery) {
      this.game.onPenguinSongEnd(this, skill);
      this.finishPenguinSpecial();
    }
  }

  updatePenguinStones(dt, skill) {
    if (!this.stonesThrown && this.stateTime >= 0.3) {
      this.stonesThrown = true;
      this.game.onPenguinStones(this, skill);
    }
    if (this.stateTime >= skill.startup + skill.active + skill.recovery) this.finishPenguinSpecial();
  }

  updatePenguinAdmin(dt, skill) {
    const t = this.stateTime;
    this.vx = 0;
    this.vz = 0;
    if (t >= 0.8 && t < 4.8) {
      this.penguinTick += dt;
      if (this.penguinTick >= 0.5) {
        this.penguinTick -= 0.5;
        const target = this.opponent;
        if (target && !target.isKo() && this.distanceTo(target) < skill.range) {
          target.penguinDeepUntil = this.game.time + 2.8;
          target.slowUntil = this.game.time + 1.2;
          target.slowFactor = 0.55;
          target.takeHit(this, skill, this.currentDamage);
        }
        this.game.onPenguinAdminTick(this, skill);
      }
    }
    if (t >= skill.startup + skill.active + skill.recovery) {
      this.game.onPenguinAdminEnd(this, skill);
      this.finishPenguinSpecial();
    }
  }

  addStoneRushCharge(count = 1) {
    if (this.char.id !== 'penguin') return;
    this.stoneRushQueue = Math.min(9, this.stoneRushQueue + count);
    this.game.toast(`石壳突刺 ×${this.stoneRushQueue}`);
  }

  startStoneRush() {
    if (this.stoneRushQueue <= 0 || !this.canAct()) return false;
    const dir = this.inputDirection();
    const f = dir ?? this.forward();
    this.stoneRushQueue -= 1;
    this.current = {
      ...this.char.skills.attack,
      key: 'attack',
      name: '石壳突刺',
      custom: 'stoneRush',
      damage: 38,
      startup: 0.06,
      active: 0.2,
      recovery: 0.1,
      range: 2.4,
      arc: 1.4,
      knockback: 4.5,
      hitstun: 0.24,
    };
    this.currentAction = 'attack';
    this.currentDamage = 38;
    this.state = 'stoneRush';
    this.stateTime = 0;
    this.hitDone = false;
    this.comboStep = -1;
    this.facingAngle = Math.atan2(f.x, f.z);
    this.vx = f.x * 17.0;
    this.vz = f.z * 17.0;
    this.game.onStoneRushStart(this, this.current);
    return true;
  }

  updateStoneRush(dt, skill) {
    const t = this.stateTime;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.vx *= Math.pow(0.3, dt);
    this.vz *= Math.pow(0.3, dt);
    this.clampArena();
    if (!this.hitDone && t >= 0.05 && this.distanceTo(this.opponent) < skill.range) {
      this.hitDone = true;
      const hit = this.opponent.takeHit(this, skill, this.currentDamage);
      if (hit) this.game.onStoneRushHit(this, skill);
    }
    if (t >= skill.startup + skill.active + skill.recovery) {
      this.current = null;
      this.currentAction = null;
      this.state = 'idle';
      this.stateTime = 0;
      if (this.stoneRushQueue > 0 && this.game.input.isDown(this.player, 'attack')) {
        this.startStoneRush();
      }
    }
  }

  tryDodge() {
    if (!this.canAct()) return false;
    if (this.state === 'hurt' || !this.grounded || this.y > 0.04 ||
        this.penguinStunUntil > this.game.time) return false;
    if (this.cooldowns.dodge > 0) {
      this.game.audio.dodgeFail();
      this.game.toast('闪避冷却中');
      return false;
    }
    let axis = this.moveAxis();
    let dx = axis.x;
    let dz = axis.y;
    if (Math.hypot(dx, dz) < 0.1) {
      dx = this.x - this.opponent.x;
      dz = this.z - this.opponent.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
    }
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    this.current = null;
    this.currentAction = null;
    this.state = 'dodge';
    this.stateTime = 0;
    this.vx = dx * 14.5;
    this.vz = dz * 14.5;
    this.facingAngle = Math.atan2(dx, dz);
    this.cooldowns.dodge = 3;
    this.invuln = Math.max(this.invuln, 0.25);
    this.game.onDodge(this, dx, dz);
    this.game.audio.dodge();
    return true;
  }

  startSkill(action) {
    if (!this.canAct()) return false;
    const base = this.char.skills[action];
    if (!base) return false;
    if (this.cooldowns[action] > 0) return false;
    if (this.energy < base.cost) {
      this.game.toast(`${this.char.name}：能量不足`);
      return false;
    }

    if (this.char.id === 'penguin') {
      const now = this.game.time;
      if (this.penguinStunUntil > now) return false;
      if (this.penguinDeepUntil > now && Math.random() < 0.32) {
        this.penguinStunUntil = now + 1;
        this.game.toast('深度迷惑：僵直 1 秒');
        return false;
      }
      if (this.penguinConfusedUntil > now && Math.random() < 0.4) {
        this.penguinWhiffUntil = now + 0.8;
        this.game.toast('嘎嘎迷惑：攻击落空');
        this.game.audio.penguinQuack('miss');
        return false;
      }
      if (action === 'skill1') return this.startPenguinSong(base);
      if (action === 'skill2') return this.startPenguinStones(base);
      if (action === 'ultimate') return this.startPenguinAdmin(base);
      if (action === 'attack') {
        const nextStage = this.comboTimer > 0 ? (this.comboStep + 1) % 4 : 0;
        if (nextStage === 2) return this.startPenguinFlap(base, 2);
        if (nextStage === 3) return this.startPenguinHeavy(base, 3);
      }
    }

    if (action === 'attack' && this.char.id === 'naiwa') {
      const nextStage = this.comboTimer > 0 ? (this.comboStep + 1) % 4 : 0;
      if (nextStage === 2) return this.startNaiwaSlam(base, 2);
      if (nextStage === 3) return this.startNaiwaSpin(base, 3);
    }

    if (action === 'attack') {
      if (this.comboTimer > 0 && this.comboStep < 2) this.comboStep += 1;
      else this.comboStep = 0;
      this.comboTimer = 0.55;
    } else {
      this.comboStep = -1;
    }

    const isNaiwaUltimate = action === 'ultimate' && this.char.id === 'naiwa';
    const isNaiwaLunge = action === 'attack' && this.char.id === 'naiwa' && this.comboStep >= 0 && this.comboStep <= 1;
    const isPenguinLunge = action === 'attack' && this.char.id === 'penguin' && this.comboStep === 0;
    const lungeDir = isNaiwaLunge || isPenguinLunge ? this.inputDirection() : null;
    this.current = isNaiwaUltimate
      ? { ...base, channel: true, duration: 6.0, pulseTimer: 0 }
      : isNaiwaLunge
        ? { ...base, lunge: true, lungeSpeed: this.comboStep >= 1 ? 5.2 : 4.6 }
        : isPenguinLunge
          ? { ...base, lunge: true, lungeSpeed: this.comboStep >= 1 ? 2.7 : 2.3 }
          : base;
    this.currentAction = action;
    const mult = action === 'attack' ? [1, 1.15, 1.35][Math.max(0, this.comboStep)] : 1;
    this.currentDamage = Math.round(base.damage * mult);
    if (this.char.id === 'penguin' && action === 'attack') {
      this.current.peckStage = this.comboStep;
      if (this.comboStep === 0) {
        this.current.startup = 0.1;
        this.current.active = 0.05;
        this.current.recovery = 0.05;
      } else if (this.comboStep === 1) {
        this.current.startup = 0.28;
        this.current.active = 0.05;
        this.current.recovery = 0.1;
      }
      this.game.onPenguinPeckStart(this, this.current, this.comboStep);
    }
    this.energy = Math.max(0, this.energy - base.cost);
    this.cooldowns[action] = base.cooldown;
    this.state = 'skill';
    this.stateTime = 0;
    this.hitDone = false;
    this.spawned = false;
    this.facingAngle = lungeDir
      ? Math.atan2(lungeDir.x, lungeDir.z)
      : Math.atan2(this.opponent.x - this.x, this.opponent.z - this.z);
    if (this.char.id === 'penguin' && this.penguinConfusedUntil > this.game.time) {
      this.facingAngle += (Math.random() * 2 - 1) * 0.85;
    }
    this.vx = 0;
    this.vz = 0;
    if (base.type === 'dash') {
      const f = this.forward();
      this.vx = f.x * base.dashSpeed;
      this.vz = f.z * base.dashSpeed;
    } else if (isNaiwaLunge || isPenguinLunge) {
      const f = this.forward();
      this.vx = f.x * this.current.lungeSpeed;
      this.vz = f.z * this.current.lungeSpeed;
    }
    if (this.char.id === 'penguin' && action === 'attack') {
      this.game.audio.penguinQuack('short');
      this.game.spawnFootprint(this.x, this.z, this.facingAngle);
    }
    if (base.type === 'ultimate') {
      this.game.onUltimateStart(this, this.current);
    } else {
      this.game.onSkillStart(this, base);
    }
    return true;
  }

  endNaiwaUltimateChannel() {
    if (!this.current?.channel) return;
    this.current = null;
    this.currentAction = null;
    this.state = 'idle';
    this.stateTime = 0;
    this.vx = 0;
    this.vz = 0;
  }

  updateSkill(dt) {
    const s = this.current;
    if (!s) {
      this.state = 'idle';
      return;
    }
    const t = this.stateTime;

    if (s.custom === 'flap') {
      this.updatePenguinFlap(dt, s);
      return;
    }
    if (s.custom === 'heavy') {
      this.updatePenguinHeavy(dt, s);
      return;
    }
    if (s.custom === 'song') {
      this.updatePenguinSong(dt, s);
      return;
    }
    if (s.custom === 'stones') {
      this.updatePenguinStones(dt, s);
      return;
    }
    if (s.custom === 'admin') {
      this.updatePenguinAdmin(dt, s);
      return;
    }

    if (s.custom === 'slam') {
      this.updateNaiwaSlam(dt, s);
      return;
    }
    if (s.custom === 'spin') {
      this.updateNaiwaSpin(dt, s);
      return;
    }

    if (s.channel) {
      this.game.updateNaiwaUltimateChannel(this, s, dt);
      if (!this.hitDone && t >= s.startup) {
        const target = this.opponent;
        if (target && !target.isKo() && this.inCone(target, s.range, s.arc)) {
          this.hitDone = true;
          const hit = target.takeHit(this, s, this.currentDamage);
          if (hit) this.game.onMeleeHit(this, target, s, this.currentDamage);
        }
      }
      if (t >= s.duration) this.endNaiwaUltimateChannel();
      return;
    }

    if (s.type === 'dash') {
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      const fr = Math.pow(0.03, dt);
      this.vx *= fr;
      this.vz *= fr;
    }

    if (s.lunge) {
      const dir = this.inputDirection();
      if (dir) {
        this.facingAngle = angleLerp(this.facingAngle, Math.atan2(dir.x, dir.z), 1 - Math.exp(-dt * 18));
        this.vx += (dir.x * s.lungeSpeed - this.vx) * Math.min(1, dt * 16);
        this.vz += (dir.z * s.lungeSpeed - this.vz) * Math.min(1, dt * 16);
      } else {
        const fr = Math.pow(0.16, dt);
        this.vx *= fr;
        this.vz *= fr;
      }
      this.x += this.vx * dt;
      this.z += this.vz * dt;
    }

    if (s.type === 'projectile' && !this.spawned && t >= s.startup) {
      this.spawned = true;
      this.game.spawnProjectile(this, s);
    }

    if (s.type !== 'projectile' && !this.hitDone && t >= s.startup && t <= s.startup + s.active) {
      const target = this.opponent;
      if (target && !target.isKo() && this.inCone(target, s.range, s.arc)) {
        this.hitDone = true;
        const hit = target.takeHit(this, s, this.currentDamage);
        if (hit) {
          this.game.onMeleeHit(this, target, s, this.currentDamage);
          if (this.char.id === 'penguin' && s.peckStage !== undefined) {
            this.game.onPenguinPeckHit(this, target, s, s.peckStage);
          }
        }
      }
    }

    const total = s.startup + s.active + s.recovery;
    if (t >= total) {
      if (this.char.id === 'penguin' && s.key === 'attack' && !this.hitDone) {
        this.penguinWhiffUntil = this.game.time + 0.8;
      }
      this.current = null;
      this.currentAction = null;
      this.state = 'idle';
      this.stateTime = 0;
      this.vx *= 0.4;
      this.vz *= 0.4;
    }
  }

  inCone(target, range, arc) {
    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range + 0.45) return false;
    if (dist < 0.01) return true;
    const f = this.forward();
    const dot = (dx / dist) * f.x + (dz / dist) * f.z;
    return dot >= Math.cos(arc / 2);
  }

  takeHit(attacker, skill, damage) {
    if (this.state === 'ko') return false;
    if (this.state === 'dodge' && this.invuln > 0) return false;
    if (this.invuln > 0 && !skill.ignoreInvuln) return false;
    const wasPenguinChannel = this.char.id === 'penguin' &&
      (this.current?.custom === 'song' || this.current?.custom === 'admin');
    let finalDamage = damage;
    const oldShieldStacks = this.penguinShieldStacks;
    const songGuard = this.char.id === 'penguin' && this.current?.custom === 'song';
    const adminGuard = this.char.id === 'penguin' && this.current?.custom === 'admin';
    if (this.char.id === 'penguin' && this.penguinShield > 0) {
      const absorbed = Math.min(this.penguinShield, finalDamage * 0.55);
      this.penguinShield -= absorbed;
      finalDamage -= absorbed;
      this.penguinShieldStacks = Math.ceil(this.penguinShield / 70);
      if (this.penguinShieldStacks < oldShieldStacks) this.game.onPenguinShieldBreak(this);
      this.game.updatePenguinShieldAura(this);
    }
    if (songGuard) finalDamage *= 0.85;
    if (adminGuard) finalDamage *= 0.65;
    finalDamage = Math.max(1, Math.round(finalDamage));
    this.hp = Math.max(0, this.hp - finalDamage);
    this.energy = Math.min(ENERGY_MAX, this.energy + 6);
    attacker.energy = Math.min(ENERGY_MAX, attacker.energy + (skill.energyGain ?? 7));
    this.state = 'hurt';
    this.stateTime = 0;
    this.hurtTime = skill.hitstun ?? 0.25;
    this.current = null;
    this.currentAction = null;
    this.spinAngle = 0;
    this.spinRate = 0;
    this.penguinAdmin = false;
    this.penguinScale = 1;
    if (wasPenguinChannel) {
      this.game.audio.stopPenguinSong();
      this.game.audio.stopPenguinUltimate(350);
    }
    this.game.stopWindAura(this);
    const f = attacker.forward();
    let kb = skill.knockback ?? 3;
    if (this.char.id === 'penguin' && this.penguinShield > 0) kb *= 0.15;
    if (adminGuard) kb = 0;
    this.vx = f.x * kb;
    this.vz = f.z * kb;
    if (this.char.id === 'penguin' && kb >= 4.5) {
      this.grounded = false;
      this.y = Math.max(this.y, 0.16);
      this.vy = 4.4;
      this.game.onPenguinFlutter(this);
    }
    this.facingAngle = Math.atan2(attacker.x - this.x, attacker.z - this.z);
    this.invuln = 0.2;
    this.flash = 1;
    if (skill.slowMs) {
      this.slowUntil = this.game.time + skill.slowMs / 1000;
      this.slowFactor = skill.slowFactor ?? 0.6;
    }
    this.game.onHit(attacker, this, finalDamage, skill);
    if (this.hp <= 0) {
      this.state = 'ko';
      this.koTime = 0;
      this.vx = f.x * 7.5;
      this.vz = f.z * 7.5;
      this.game.onKO(this, attacker);
    }
    return true;
  }
}
