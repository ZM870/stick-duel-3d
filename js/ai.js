import { ARENA } from './config.js';

const DIFFICULTY = {
  easy: {
    thinkMin: 0.34, thinkMax: 0.56, speed: 0.82,
    attack: 0.52, skill1: 0.30, skill2: 0.26, ult: 0.42, jump: 0.22,
    aggression: 0.72,
  },
  normal: {
    thinkMin: 0.16, thinkMax: 0.30, speed: 1.0,
    attack: 0.74, skill1: 0.62, skill2: 0.58, ult: 0.80, jump: 0.52,
    aggression: 1.0,
  },
  hard: {
    thinkMin: 0.08, thinkMax: 0.17, speed: 1.08,
    attack: 0.9, skill1: 0.82, skill2: 0.78, ult: 0.94, jump: 0.74,
    aggression: 1.22,
  },
};

// 每个角色有自己的战斗节奏，不再所有人都是“直冲 + 普攻”。
const PROFILES = {
  naihuang: {
    style: 'brawler', range: 1.55, orbit: 0.5, aggression: 1.08,
    retreat: 0.08, jump: 0.2, ranged: 0.18, combo: 0.9,
  },
  naigou: {
    style: 'hitrun', range: 2.45, orbit: 0.95, aggression: 0.82,
    retreat: 0.4, jump: 0.58, ranged: 0.42, combo: 0.5,
  },
  naiwa: {
    style: 'zoner', range: 4.55, orbit: 0.9, aggression: 0.48,
    retreat: 0.62, jump: 0.3, ranged: 1.0, combo: 0.28,
  },
  naishu: {
    style: 'trickster', range: 3.05, orbit: 1.0, aggression: 0.68,
    retreat: 0.28, jump: 0.68, ranged: 0.66, combo: 0.58,
  },
  naidan: {
    style: 'tank', range: 1.9, orbit: 0.28, aggression: 0.66,
    retreat: 0.14, jump: 0.16, ranged: 0.36, combo: 0.72,
  },
  penguin: {
    style: 'trickster', range: 2.55, orbit: 1.0, aggression: 0.72,
    retreat: 0.32, jump: 0.32, ranged: 0.7, combo: 0.62,
  },
};

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export class AIController {
  constructor(player = 1, difficulty = 'normal') {
    this.player = player;
    this.think = 0;
    this.strafe = Math.random() < 0.5 ? -1 : 1;
    this.intent = 'strafe';
    this.intentTime = 0;
    this.strafeTimer = 0;
    this.actionLock = 0;
    this.comboLeft = 0;
    this.comboTimer = 0;
    this.setDifficulty(difficulty);
  }

  setDifficulty(mode) {
    this.difficulty = DIFFICULTY[mode] ? mode : 'normal';
    this.cfg = DIFFICULTY[this.difficulty];
  }

  reset() {
    this.think = 0;
    this.strafe = Math.random() < 0.5 ? -1 : 1;
    this.intent = 'strafe';
    this.intentTime = 0;
    this.strafeTimer = 0;
    this.actionLock = 0;
    this.comboLeft = 0;
    this.comboTimer = 0;
  }

  profileFor(me) {
    return PROFILES[me.char.id] ?? {
      style: 'balanced', range: 2.2, orbit: 0.7, aggression: 0.85,
      retreat: 0.2, jump: 0.35, ranged: 0.45, combo: 0.5,
    };
  }

  chooseIntent(dist, profile, lowHp, foeCharging) {
    if (lowHp && Math.random() < 0.75) {
      this.intent = 'retreat';
      this.intentTime = 0.45 + Math.random() * 0.55;
      return;
    }
    if (foeCharging) {
      this.intent = 'approach';
      this.intentTime = 0.35 + Math.random() * 0.25;
      return;
    }
    if (dist > profile.range + 1.35) {
      this.intent = Math.random() < 0.68 ? 'approach' : 'bait';
      this.intentTime = 0.42 + Math.random() * 0.55;
    } else if (dist < profile.range - 0.95) {
      const r = Math.random();
      this.intent = r < 0.55 ? 'retreat' : r < 0.84 ? 'strafe' : 'bait';
      this.intentTime = 0.35 + Math.random() * 0.5;
    } else {
      const r = Math.random();
      if (r < 0.5) this.intent = 'strafe';
      else if (r < 0.68) this.intent = 'approach';
      else if (r < 0.84) this.intent = 'retreat';
      else this.intent = 'bait';
      this.intentTime = 0.45 + Math.random() * 0.7;
    }
  }

  update(dt, game) {
    const me = game.fighters[this.player];
    const foe = game.fighters[1 - this.player];
    if (!me || !foe || game.state !== 'fighting' || me.state === 'ko' || foe.state === 'ko') {
      game.input.setAI(this.player, { x: 0, y: 0 });
      return;
    }

    const profile = this.profileFor(me);
    const cfg = this.cfg;
    const dx = foe.x - me.x;
    const dz = foe.z - me.z;
    const dist = Math.max(0.001, Math.hypot(dx, dz));
    const nx = dx / dist;
    const nz = dz / dist;
    const lowHp = me.hp / me.maxHp < 0.32;
    const foeCharging = foe.state === 'charging';
    const desired = Math.max(
      1.15,
      profile.range + (this.intent === 'bait' ? 1.1 : 0) + (lowHp ? 0.9 : 0) - (foeCharging ? 1.6 : 0)
    );

    this.intentTime -= dt;
    this.actionLock = Math.max(0, this.actionLock - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafe *= -1;
      this.strafeTimer = 0.55 + Math.random() * 1.25;
    }
    if (this.intentTime <= 0) this.chooseIntent(dist, profile, lowHp, foeCharging);

    let radial = 0;
    let tangent = 0;
    if (this.intent === 'approach') {
      radial = dist > 1.1 ? 1 : 0;
      tangent = this.strafe * 0.18;
    } else if (this.intent === 'retreat') {
      radial = -1;
      tangent = this.strafe * 0.32;
    } else if (this.intent === 'bait') {
      radial = -0.85;
      tangent = this.strafe * 0.42;
    } else {
      radial = clamp((dist - desired) * 1.15, -0.8, 0.8);
      tangent = this.strafe * profile.orbit;
    }
    if (foeCharging) {
      radial = 1;
      tangent *= 0.35;
    }
    if (this.actionLock > 0) {
      radial = -0.8;
      tangent = this.strafe * 0.55;
    }

    let mx = nx * radial - nz * tangent;
    let mz = nz * radial + nx * tangent;

    // 不要把自己逼到场地边缘
    const r = Math.hypot(me.x, me.z);
    const edge = ARENA.fightRadius * 0.84;
    if (r > edge) {
      const push = (r - edge) / Math.max(0.1, ARENA.fightRadius - edge);
      mx -= (me.x / r) * (0.7 + push * 1.5);
      mz -= (me.z / r) * (0.7 + push * 1.5);
    }

    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    const speed = cfg.speed * (this.intent === 'retreat' ? 1.05 : 1);
    game.input.setAI(this.player, { x: mx * speed, y: mz * speed });

    this.think -= dt;
    if (this.think > 0) return;
    this.think = cfg.thinkMin + Math.random() * (cfg.thinkMax - cfg.thinkMin);
    if (!me.canAct()) return;

    const cd = me.cooldowns;
    const skill1 = me.char.skills.skill1;
    const skill2 = me.char.skills.skill2;
    const ult = me.char.skills.ultimate;
    const roll = Math.random();

    // 躲飞行道具：跳或后撤
    const danger = game.projectiles?.some((p) => {
      if (p.owner?.player === this.player) return false;
      return Math.hypot(p.x - me.x, p.z - me.z) < 2.7;
    });
    if (danger) {
      if (me.grounded && Math.random() < cfg.jump * (0.65 + profile.jump)) {
        game.input.pressAI(this.player, 'jump');
        this.actionLock = 0.35;
        return;
      }
      this.intent = 'retreat';
      this.intentTime = 0.35;
      return;
    }

    // 对手在蓄力时优先贴脸打断
    if (foeCharging && dist < 3.4) {
      if (cd.attack <= 0 && roll < 0.88) {
        game.input.pressAI(this.player, 'attack');
        this.actionLock = 0.2;
      } else if (cd.skill1 <= 0 && me.energy >= skill1.cost && roll < 0.7) {
        game.input.pressAI(this.player, 'skill1');
      }
      return;
    }

    // 大招：根据角色风格决定距离，不总是贴脸
    const ultRange = profile.style === 'zoner' ? 5.2 : 3.7;
    if (cd.ultimate <= 0 && me.energy >= ult.cost && dist < ultRange && roll < cfg.ult) {
      game.input.pressAI(this.player, 'ultimate');
      this.actionLock = 0.35;
      return;
    }

    // 远程角色更愿意放技2，近战角色更愿意贴脸
    const wantRanged = profile.ranged * cfg.skill2;
    if (cd.skill2 <= 0 && me.energy >= skill2.cost && dist > 2.9 && dist < 9.2 && roll < wantRanged) {
      game.input.pressAI(this.player, 'skill2');
      this.intent = profile.style === 'zoner' ? 'retreat' : 'strafe';
      this.intentTime = 0.5;
      return;
    }

    // 技1：冲刺型用于进场，近战型用于贴脸
    const s1Range = skill1.type === 'dash' ? [1.7, 4.7] : [0, 2.75];
    if (cd.skill1 <= 0 && me.energy >= skill1.cost &&
        dist >= s1Range[0] && dist <= s1Range[1] && roll < cfg.skill1 * (0.75 + profile.combo * 0.25)) {
      game.input.pressAI(this.player, 'skill1');
      this.actionLock = 0.3;
      return;
    }

    // 普攻：有自己的攻击距离和连段倾向
    const attackRange = profile.style === 'zoner' ? 1.75 : 2.15;
    if (cd.attack <= 0 && dist < attackRange && roll < cfg.attack * profile.aggression) {
      game.input.pressAI(this.player, 'attack');
      this.comboLeft = Math.random() < profile.combo ? 1 + Math.floor(Math.random() * 2) : 0;
      this.comboTimer = 0.45;
      if (profile.style === 'hitrun' || profile.style === 'trickster') {
        this.intent = 'retreat';
        this.intentTime = 0.32 + Math.random() * 0.28;
      } else if (profile.style === 'zoner') {
        this.intent = 'retreat';
        this.intentTime = 0.4;
      } else {
        this.intent = 'strafe';
        this.intentTime = 0.25 + Math.random() * 0.3;
      }
      return;
    }

    // 近身连段：已经贴脸时偶尔继续压一下
    if (this.comboLeft > 0 && this.comboTimer > 0 && dist < attackRange + 0.25 && cd.attack <= 0) {
      if (Math.random() < 0.55 + profile.combo * 0.25) {
        game.input.pressAI(this.player, 'attack');
        this.comboLeft -= 1;
        this.comboTimer = 0.42;
      }
    }
  }
}
