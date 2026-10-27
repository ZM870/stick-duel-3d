import * as THREE from '../vendor/three.module.js';
import { ARENA } from './config.js';

export class ParticleSystem {
  constructor(scene, count = 320) {
    this.count = count;
    this.cursor = 0;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.positions[i * 3 + 1] = -999;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.material = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.geo = geo;
    scene.add(this.points);
  }

  spawn(pos, color, count = 12, speed = 3.2, spread = 0.4) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.count;
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const sp = speed * (0.35 + Math.random() * 0.8);
      this.positions[i * 3] = pos.x + (Math.random() - 0.5) * spread;
      this.positions[i * 3 + 1] = pos.y + (Math.random() - 0.5) * spread;
      this.positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * spread;
      this.vel[i * 3] = Math.cos(a) * Math.cos(b) * sp;
      this.vel[i * 3 + 1] = Math.sin(b) * sp + 1.2;
      this.vel[i * 3 + 2] = Math.sin(a) * Math.cos(b) * sp;
      const tint = c.clone().offsetHSL((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.3) * 0.25);
      this.colors[i * 3] = tint.r;
      this.colors[i * 3 + 1] = tint.g;
      this.colors[i * 3 + 2] = tint.b;
      this.life[i] = 0.45 + Math.random() * 0.5;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.positions[i * 3 + 1] = -999;
        continue;
      }
      this.vel[i * 3 + 1] -= 7.5 * dt;
      this.positions[i * 3] += this.vel[i * 3] * dt;
      this.positions[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

export class Projectile {
  constructor(scene, owner, skill) {
    this.scene = scene;
    this.owner = owner;
    this.skill = skill;
    this.style = skill.style ?? 'orb';
    this.dead = false;
    this.life = skill.life ?? 2;
    this.radius = skill.radius ?? 0.3;
    this.speed = skill.speed ?? 10;
    const baseDir = owner.forward();
    const shotAngle = Math.atan2(baseDir.x, baseDir.z) + (skill.angleOffset ?? 0);
    this.dir = { x: Math.sin(shotAngle), z: Math.cos(shotAngle) };
    this.x = owner.x + this.dir.x * 0.72;
    this.z = owner.z + this.dir.z * 0.72;
    this.y = 1.12;
    this.vx = this.dir.x * this.speed;
    this.vz = this.dir.z * this.speed;
    this.trailAcc = 0;
    this.hitSomething = false;

    const color = new THREE.Color(skill.color ?? 0xff7a45);
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      this.style === 'stone'
        ? new THREE.DodecahedronGeometry(this.radius * 1.15, 0)
        : new THREE.SphereGeometry(this.radius, 16, 12),
      new THREE.MeshBasicMaterial({
        color: this.style === 'stone' ? 0x9b8b75 : this.style === 'rasengan' ? 0xe8fbff : 0xffffff,
      })
    );
    core.scale.setScalar(0.55);
    group.add(core);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius * 1.45, 16, 12),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    group.add(glow);
    const orbit = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(this.radius * (1.28 + i * 0.22), 0.014, 6, 28),
        new THREE.MeshBasicMaterial({
          color: i === 0 ? 0xffffff : color,
          transparent: true,
          opacity: i === 0 ? 0.85 : 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      torus.rotation.x = Math.PI / 2 + i * 0.7;
      torus.rotation.y = i * 0.8;
      orbit.add(torus);
    }
    if (this.style === 'rasengan') {
      for (let i = 0; i < 2; i++) {
        const knot = new THREE.Mesh(
          new THREE.TorusKnotGeometry(this.radius * (0.72 + i * 0.16), 0.012, 40, 5, 2, 3),
          new THREE.MeshBasicMaterial({
            color: i === 0 ? 0xbff4ff : color,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        knot.rotation.x = 0.5 + i;
        knot.rotation.z = 0.8 - i;
        orbit.add(knot);
      }
      group.scale.setScalar(1.28 * (1 + (skill.chargeRatio ?? 0) * 0.35));
    }
    group.add(orbit);
    const light = new THREE.PointLight(color, this.style === 'rasengan' ? 5.2 : 3.2, 5, 2);
    group.add(light);
    group.position.set(this.x, this.y, this.z);
    scene.add(group);
    this.group = group;
    this.core = core;
    this.glow = glow;
    this.orbit = orbit;
    this.light = light;
    this.trailColor = skill.trail ?? skill.color ?? 0xff7a45;
  }

  update(dt, game) {
    if (this.dead) return;
    this.life -= dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y += dt * 8;
    this.orbit.rotation.x += dt * 7;
    this.orbit.rotation.z += dt * 5;
    this.core.scale.setScalar(0.55 + Math.sin(this.life * 24) * 0.12);
    this.trailAcc += dt;
    if (this.trailAcc > 0.02) {
      this.trailAcc = 0;
      game.particles.spawn(new THREE.Vector3(this.x, this.y, this.z), this.trailColor, 3, 1.4, 0.16);
    }
    const target = game.fighters[1 - this.owner.player];
    if (target && !target.isKo()) {
      const d = Math.hypot(target.x - this.x, target.z - this.z);
      if (d < this.radius + 0.5) {
        const hit = target.takeHit(this.owner, this.skill, this.skill.damage);
        if (hit) {
          this.hitSomething = true;
          game.onProjectileHit(this, target);
        }
        this.kill();
        return;
      }
    }
    if (this.life <= 0 || Math.hypot(this.x, this.z) > ARENA.fightRadius + 3.0) {
      this.kill();
    }
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      }
    });
  }
}

export class Ring {
  constructor(scene, position, color, options = {}) {
    this.scene = scene;
    this.life = options.duration ?? 0.55;
    this.maxLife = this.life;
    this.maxScale = options.maxScale ?? 3.4;
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 8, 64), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(position.x, 0.08, position.z);
    this.mesh.scale.setScalar(0.5);
    scene.add(this.mesh);
    this.dead = false;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) {
      this.kill();
      return;
    }
    const p = 1 - this.life / this.maxLife;
    this.mesh.scale.setScalar(0.5 + p * this.maxScale);
    this.mesh.material.opacity = 0.85 * (1 - p);
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export class Slash {
  constructor(scene, position, angle, color, options = {}) {
    this.scene = scene;
    this.life = options.duration ?? 0.32;
    this.maxLife = this.life;
    this.group = new THREE.Group();
    const c = new THREE.Color(color);
    const mainMat = new THREE.MeshBasicMaterial({
      color: c,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const main = new THREE.Mesh(new THREE.RingGeometry(0.62, 1.72, 40, 1, -1.0, 2.0), mainMat);
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.3, 32, 1, -0.85, 1.7), innerMat);
    main.rotation.x = -Math.PI / 2;
    inner.rotation.x = -Math.PI / 2;
    main.rotation.z = -angle + Math.PI / 2;
    inner.rotation.z = -angle + Math.PI / 2 + 0.1;
    this.group.add(main, inner);
    this.group.position.set(position.x, position.y ?? 0.9, position.z);
    if (options.offset) this.group.position.add(options.offset);
    scene.add(this.group);
    this.main = main;
    this.inner = inner;
    this.dead = false;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) {
      this.kill();
      return;
    }
    const p = 1 - this.life / this.maxLife;
    this.group.scale.setScalar(0.72 + p * 0.9);
    this.group.rotation.y += dt * 1.8;
    this.main.material.opacity = 0.92 * (1 - p);
    this.inner.material.opacity = 0.75 * (1 - p) ** 1.4;
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
  }
}

export class Pillar {
  constructor(scene, position, color, options = {}) {
    this.scene = scene;
    this.life = options.duration ?? 0.7;
    this.maxLife = this.life;
    this.height = options.height ?? 5.2;
    const c = new THREE.Color(color);
    const geo = new THREE.CylinderGeometry(0.26, 0.7, this.height, 24, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: c,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const coreGeo = new THREE.CylinderGeometry(0.1, 0.26, this.height, 16, 1, true);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xfff1d0,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.group = new THREE.Group();
    this.mesh = new THREE.Mesh(geo, mat);
    this.core = new THREE.Mesh(coreGeo, coreMat);
    this.group.add(this.mesh, this.core);
    this.group.position.set(position.x, this.height / 2, position.z);
    this.group.scale.setScalar(0.7);
    scene.add(this.group);
    this.dead = false;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) {
      this.kill();
      return;
    }
    const p = 1 - this.life / this.maxLife;
    const expand = 0.7 + p * 1.2;
    this.group.scale.set(expand, 1, expand);
    this.group.rotation.y += dt * 2.4;
    this.mesh.material.opacity = 0.34 * (1 - p);
    this.core.material.opacity = 0.4 * (1 - p) ** 1.4;
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
  }
}

const textCache = new Map();

function textTexture(text, color) {
  const key = `${text}|${color}`;
  if (textCache.has(key)) return textCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 96);
  ctx.font = '900 58px system-ui, "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 9;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(text, 128, 50);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 50);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  textCache.set(key, tex);
  return tex;
}

export class DamageText {
  constructor(scene, position, text, color = '#ffd166') {
    this.scene = scene;
    this.life = 0.9;
    this.maxLife = this.life;
    const mat = new THREE.SpriteMaterial({
      map: textTexture(text, color),
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.scale.set(1.6, 0.6, 1);
    this.sprite.position.copy(position);
    this.sprite.position.y += 0.6;
    this.sprite.renderOrder = 20;
    scene.add(this.sprite);
    this.dead = false;
    this.vy = 1.4;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) {
      this.kill();
      return;
    }
    const p = 1 - this.life / this.maxLife;
    this.sprite.position.y += this.vy * dt;
    this.vy *= 0.96;
    this.sprite.material.opacity = 1 - p;
    this.sprite.scale.setScalar(1 + p * 0.2);
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.sprite);
    this.sprite.material.dispose();
  }
}

export class RasenganCharge {
  constructor(scene, fighter, skill) {
    this.scene = scene;
    this.fighter = fighter;
    this.skill = skill;
    this.dead = false;
    this.time = 0;
    this.group = new THREE.Group();
    const color = 0x4fc3ff;

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.23, 18, 14),
      new THREE.MeshBasicMaterial({ color: 0xf4fdff })
    );
    this.group.add(core);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 18, 14),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.group.add(glow);

    this.orbit = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.30 + i * 0.07, 0.012, 5, 28),
        new THREE.MeshBasicMaterial({
          color: i === 0 ? 0xffffff : color,
          transparent: true,
          opacity: 0.85 - i * 0.16,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      ring.rotation.x = i * 0.9;
      ring.rotation.y = i * 0.7;
      this.orbit.add(ring);
    }
    for (let i = 0; i < 2; i++) {
      const knot = new THREE.Mesh(
        new THREE.TorusKnotGeometry(0.22 + i * 0.08, 0.01, 36, 5, 2, 3),
        new THREE.MeshBasicMaterial({
          color: 0xbff7ff,
          transparent: true,
          opacity: 0.72,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      knot.rotation.x = 0.4 + i;
      this.orbit.add(knot);
    }
    this.group.add(this.orbit);

    this.light = new THREE.PointLight(color, 3.5, 3.5, 2);
    this.group.add(this.light);
    scene.add(this.group);
    this.core = core;
    this.glow = glow;
  }

  update(dt) {
    if (this.dead) return;
    this.time += dt;
    const f = this.fighter;
    const ratio = Math.max(0, Math.min(1, f.chargeRatio || 0));
    const dir = f.forward();
    const dist = 0.58 + ratio * 0.08;
    this.group.position.set(f.x + dir.x * dist, 1.02 + ratio * 0.16, f.z + dir.z * dist);
    this.group.rotation.y += dt * (3.5 + ratio * 9);
    this.orbit.rotation.x += dt * (5 + ratio * 8);
    this.orbit.rotation.z += dt * (3 + ratio * 7);
    const scale = 0.72 + ratio * 0.62;
    this.group.scale.setScalar(scale);
    this.core.scale.setScalar(0.82 + Math.sin(this.time * 24) * 0.12 + ratio * 0.25);
    this.glow.material.opacity = 0.48 + ratio * 0.28;
    this.light.intensity = 2.8 + ratio * 4.5;
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
  }
}

export class RockBurst {
  constructor(scene, position, count = 14) {
    this.scene = scene;
    this.items = [];
    this.dead = false;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.TetrahedronGeometry(0.07 + Math.random() * 0.11, 0);
      const mat = new THREE.MeshStandardMaterial({
        color: i % 3 === 0 ? 0x9c8b72 : i % 3 === 1 ? 0x75634f : 0xb2a185,
        roughness: 0.95,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.55;
      mesh.position.set(position.x + Math.cos(a) * r, 0.06 + Math.random() * 0.12, position.z + Math.sin(a) * r);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      mesh.castShadow = true;
      scene.add(mesh);
      this.items.push({
        mesh,
        vx: Math.cos(a) * (1.2 + Math.random() * 3.4),
        vy: 2.3 + Math.random() * 4.2,
        vz: Math.sin(a) * (1.2 + Math.random() * 3.4),
        rx: (Math.random() - 0.5) * 14,
        rz: (Math.random() - 0.5) * 14,
        life: 0.6 + Math.random() * 0.45,
      });
    }
  }

  update(dt) {
    if (this.dead) return;
    let alive = false;
    for (const p of this.items) {
      if (p.life <= 0) continue;
      alive = true;
      p.life -= dt;
      p.vy -= 18 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += p.rx * dt;
      p.mesh.rotation.z += p.rz * dt;
      if (p.mesh.position.y < 0.03) {
        p.mesh.position.y = 0.03;
        p.vy *= -0.28;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      p.mesh.material.opacity = Math.min(1, p.life * 3);
      p.mesh.material.transparent = p.life < 0.25;
    }
    if (!alive) this.kill();
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    for (const p of this.items) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
  }
}

export class WindAura {
  constructor(scene, fighter) {
    this.scene = scene;
    this.fighter = fighter;
    this.dead = false;
    this.group = new THREE.Group();
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i === 0 ? 0xe8ffff : 0x9fe8ff,
        transparent: true,
        opacity: 0.32 - i * 0.06,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55 + i * 0.12, 0.018, 6, 40, Math.PI * 1.55), mat);
      ring.rotation.x = Math.PI / 2;
      ring.rotation.z = i * 1.9;
      this.group.add(ring);
      this.rings.push(ring);
    }
    scene.add(this.group);
  }

  update(dt) {
    if (this.dead) return;
    const f = this.fighter;
    this.group.position.set(f.x, (f.y ?? 0) + 0.7, f.z);
    this.group.rotation.y += dt * 24;
    for (let i = 0; i < this.rings.length; i++) {
      this.rings[i].rotation.z += dt * (6 + i * 2);
      this.rings[i].material.opacity = 0.26 + Math.sin(performance.now() * 0.02 + i) * 0.1;
    }
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.group);
    for (const ring of this.rings) {
      ring.geometry.dispose();
      ring.material.dispose();
    }
  }
}

export class Footprint {
  constructor(scene, x, z, angle) {
    this.scene = scene;
    this.life = 1.6;
    this.maxLife = this.life;
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf2a24b,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(0.11, 12), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.rotation.z = angle;
    this.mesh.position.set(x + (Math.random() - 0.5) * 0.16, 0.035, z + (Math.random() - 0.5) * 0.16);
    scene.add(this.mesh);
    this.dead = false;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) {
      this.kill();
      return;
    }
    this.mesh.material.opacity = 0.32 * (this.life / this.maxLife);
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export class StonePickup {
  constructor(scene, x, z) {
    this.scene = scene;
    this.life = 5;
    this.dead = false;
    const group = new THREE.Group();
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.16, 0),
      new THREE.MeshStandardMaterial({ color: 0x8e806e, roughness: 0.9 })
    );
    rock.rotation.set(0.4, 0.7, 0.2);
    group.add(rock);
    const glow = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.31, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
    );
    glow.rotation.x = -Math.PI / 2;
    group.add(glow);
    group.position.set(x, 0.16, z);
    scene.add(group);
    this.group = group;
    this.rock = rock;
    this.collecting = false;
    this.arrived = false;
  }

  flyTo(target, dt) {
    const dx = target.x - this.group.position.x;
    const dz = target.z - this.group.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.28) { this.arrived = true; return; }
    const sp = 5.5;
    this.group.position.x += (dx / d) * sp * dt;
    this.group.position.z += (dz / d) * sp * dt;
    this.group.position.y += (1.0 - this.group.position.y) * Math.min(1, dt * 10);
    this.rock.rotation.y += dt * 10;
  }

  update(dt) {
    if (this.dead) return;
    this.life -= dt;
    if (!this.collecting) this.group.position.y = 0.16 + Math.sin(performance.now() * 0.004 + this.group.position.x) * 0.05;
    this.rock.rotation.y += dt * 1.1;
    if (this.life <= 0) this.kill();
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      o.material.dispose();
    });
  }
}

export class PeckStar {
  constructor(scene, position, dir, color = 0xffd166) {
    this.scene = scene;
    this.life = 0.3;
    this.maxLife = this.life;
    this.dir = { x: dir.x, z: dir.z };
    const shape = new THREE.Shape();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 0.1 : 0.042;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
    this.mesh.position.set(position.x, position.y, position.z);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.rotation.z = -Math.atan2(dir.z, dir.x);
    this.mesh.scale.setScalar(1);
    scene.add(this.mesh);
    this.dead = false;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.kill(); return; }
    const p = 1 - this.life / this.maxLife;
    this.mesh.position.x += this.dir.x * dt * 1.1;
    this.mesh.position.z += this.dir.z * dt * 1.1;
    this.mesh.position.y += dt * 0.12;
    this.mesh.material.opacity = 0.95 * (1 - p);
    this.mesh.scale.setScalar(1 + p * 0.8);
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export class MiniRing {
  constructor(scene, position, color = 0xffa640, diameter = 0.4, duration = 0.2) {
    this.scene = scene;
    this.life = duration;
    this.maxLife = duration;
    this.maxScale = diameter;
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 28), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(position.x, 0.55, position.z);
    this.mesh.scale.setScalar(0.12);
    scene.add(this.mesh);
    this.dead = false;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.kill(); return; }
    const p = 1 - this.life / this.maxLife;
    this.mesh.scale.setScalar(0.12 + p * this.maxScale);
    this.mat.opacity = 0.9 * (1 - p);
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

export class WindArc {
  constructor(scene, position, angle, color = 0x8fe8d8) {
    this.scene = scene;
    this.life = 0.28;
    this.maxLife = this.life;
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.055, 6, 30, Math.PI * 0.95), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.rotation.z = -angle + 0.15;
    this.mesh.position.set(position.x, 0.6, position.z);
    this.mesh.scale.setScalar(0.55);
    scene.add(this.mesh);
    this.dead = false;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.kill(); return; }
    const p = 1 - this.life / this.maxLife;
    this.mesh.scale.setScalar(0.55 + p * 1.15);
    this.mesh.position.y = 0.6 + p * 0.25;
    this.mat.opacity = 0.55 * (1 - p);
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

export class GoldCross {
  constructor(scene, position) {
    this.scene = scene;
    this.life = 0.22;
    this.maxLife = this.life;
    this.group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const a = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.8), mat);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.15), mat);
    this.group.add(a, b);
    this.group.position.set(position.x, 0.8, position.z);
    this.group.scale.setScalar(0.7);
    scene.add(this.group);
    this.dead = false;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.kill(); return; }
    const p = 1 - this.life / this.maxLife;
    this.group.scale.setScalar(0.7 + p * 0.9);
    this.group.rotation.z += dt * 4;
    this.group.children[0].material.opacity = 1 - p;
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
}

export class BeakOrb {
  constructor(scene, fighter) {
    this.scene = scene;
    this.fighter = fighter;
    this.life = 0.32;
    this.maxLife = this.life;
    this.dead = false;
    this.group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), mat);
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.group.add(this.core, this.glow);
    scene.add(this.group);
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.kill(); return; }
    const p = 1 - this.life / this.maxLife;
    const f = this.fighter.forward();
    this.group.position.set(this.fighter.x + f.x * 0.42, 1.12, this.fighter.z + f.z * 0.42);
    const s = 0.55 + p * 3.4;
    this.group.scale.setScalar(s);
    this.core.material.opacity = 0.55 + p * 0.4;
    this.glow.material.opacity = 0.2 + p * 0.3;
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
}

export class GroundAura {
  constructor(scene, x, z, radius = 3, duration = 3) {
    this.scene = scene;
    this.life = duration;
    this.maxLife = duration;
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(x, 0.025, z);
    scene.add(this.mesh);
    this.rimMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035, 6, 80), this.rimMat);
    this.rim.rotation.x = -Math.PI / 2;
    this.rim.position.set(x, 0.04, z);
    scene.add(this.rim);
    this.dead = false;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.kill(); return; }
    const p = 1 - this.life / this.maxLife;
    this.mat.opacity = 0.14 * (1 - p);
    this.rimMat.opacity = 0.6 * (1 - p);
    this.rim.scale.setScalar(1 + Math.sin(p * Math.PI) * 0.025);
  }
  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.mesh, this.rim);
    this.mesh.geometry.dispose(); this.mat.dispose();
    this.rim.geometry.dispose(); this.rimMat.dispose();
  }
}

function textSprite(text, color = '#ffd166', size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = `900 ${size}px "Microsoft YaHei", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
}

export class MusicNote {
  constructor(scene, x, y, z) {
    this.scene = scene;
    this.life = 1.2;
    this.maxLife = this.life;
    this.sprite = new THREE.Sprite(textSprite(Math.random() < 0.5 ? '♪' : '♫', '#ffe08a', 78));
    this.sprite.position.set(x, y, z);
    this.sprite.scale.setScalar(0.4);
    this.vy = 0.6;
    this.phase = Math.random() * Math.PI * 2;
    scene.add(this.sprite);
    this.dead = false;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.kill(); return; }
    const p = 1 - this.life / this.maxLife;
    this.sprite.position.y += this.vy * dt;
    this.sprite.position.x += Math.sin(p * 12 + this.phase) * dt * 0.25;
    this.sprite.material.opacity = 1 - p;
    this.sprite.scale.setScalar(0.4 + p * 0.3);
  }
  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.sprite);
    this.sprite.material.map.dispose();
    this.sprite.material.dispose();
  }
}

export class QuestionMark {
  constructor(scene, target, duration = 3) {
    this.scene = scene;
    this.target = target;
    this.life = duration;
    this.maxLife = duration;
    this.sprite = new THREE.Sprite(textSprite('?', '#ffd166', 96));
    this.sprite.scale.setScalar(0.7);
    scene.add(this.sprite);
    this.dead = false;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.kill(); return; }
    const f = this.target;
    this.sprite.position.set(f.x, (f.y ?? 0) + 2.15 + Math.sin(performance.now() * 0.006) * 0.08, f.z);
    this.sprite.material.rotation += dt * 2.2;
    this.sprite.material.opacity = Math.min(1, this.life * 2);
  }
  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.sprite);
    this.sprite.material.map.dispose();
    this.sprite.material.dispose();
  }
}

export class ShieldAura {
  constructor(scene, fighter) {
    this.scene = scene;
    this.fighter = fighter;
    this.dead = false;
    this.group = new THREE.Group();
    this.layers = [];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: i === 2 ? 0xffffff : 0xbfc3c5, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.48 + i * 0.06, 0.025, 6, 32), mat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = 0.28 + i * 0.32;
      this.group.add(mesh);
      this.layers.push(mesh);
    }
    scene.add(this.group);
  }
  update(dt) {
    if (this.dead) return;
    const f = this.fighter;
    this.group.position.set(f.x, f.y ?? 0, f.z);
    this.group.rotation.y += dt * 0.8;
    const stacks = Math.max(0, Math.min(3, f.penguinShieldStacks || 0));
    for (let i = 0; i < 3; i++) {
      const on = i < stacks;
      this.layers[i].visible = on;
      this.layers[i].material.opacity = on ? 0.2 + i * 0.08 : 0;
      this.layers[i].rotation.z += dt * (0.4 + i * 0.2);
    }
    if (stacks <= 0) this.kill();
  }
  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
}

export class SlowAura {
  constructor(scene, target) {
    this.scene = scene;
    this.target = target;
    this.life = 2.8;
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 30), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    scene.add(this.mesh);
    this.dead = false;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.kill(); return; }
    this.mesh.position.set(this.target.x, 0.045, this.target.z);
    this.mesh.rotation.z += dt * 1.5;
    this.mat.opacity = 0.35 * Math.min(1, this.life);
  }
  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose(); this.mat.dispose();
  }
}

export class Feather {
  constructor(scene, x, y, z) {
    this.scene = scene;
    this.life = 1.4;
    this.maxLife = this.life;
    this.mat = new THREE.MeshBasicMaterial({ color: 0x2b2b2b, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.22), this.mat);
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    this.vy = -0.35 - Math.random() * 0.3;
    this.phase = Math.random() * 6;
    scene.add(this.mesh);
    this.dead = false;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.kill(); return; }
    this.mesh.position.y += this.vy * dt;
    this.mesh.position.x += Math.sin(performance.now() * 0.005 + this.phase) * dt * 0.3;
    this.mesh.rotation.z += dt * 1.7;
    this.mesh.rotation.x += dt * 0.9;
    this.mat.opacity = this.life / this.maxLife;
  }
  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose(); this.mat.dispose();
  }
}

export class EllipsisMark {
  constructor(scene, fighter) {
    this.scene = scene;
    this.fighter = fighter;
    this.life = 1.2;
    this.maxLife = this.life;
    this.sprite = new THREE.Sprite(textSprite('…', '#ffd166', 90));
    this.sprite.scale.setScalar(0.7);
    scene.add(this.sprite);
    this.dead = false;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.kill(); return; }
    const f = this.fighter;
    this.sprite.position.set(f.x, (f.y ?? 0) + 1.95, f.z);
    this.sprite.material.opacity = Math.min(1, this.life * 2);
  }
  kill() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.sprite);
    this.sprite.material.map.dispose();
    this.sprite.material.dispose();
  }
}
