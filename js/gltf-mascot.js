import * as THREE from '../vendor/three.module.js';
import { clone as cloneSkeleton } from '../vendor/three/addons/utils/SkeletonUtils.js';

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function paintMascot(geometry, character, rigged = false) {
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const body = new THREE.Color(character.bodyColor ?? 0xffd45c);
  const belly = new THREE.Color(character.bellyColor ?? 0xfff4df);
  const ear = new THREE.Color(character.accentColor ?? 0x8b7753);
  const dark = new THREE.Color(character.accentColor ?? 0x6b5b4a);
  const gray = new THREE.Color(0x8d939d);
  const eyeDark = new THREE.Color(0x1e232a);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    c.copy(body);

    if (character.id === 'naiwa') {
      // 奶娃：奶白肚皮 + 深色手脚
      const bd =
        (x / 0.33) ** 2 +
        ((y - 0.56) / 0.35) ** 2 +
        ((z - 0.3) / 0.3) ** 2;
      c.lerp(belly, (1 - smoothstep(0.62, 1.02, bd)) * 0.92);
      const hands = Math.abs(x) > 0.5 && y > 0.45 && y < 1.0;
      if (y < 0.14 || hands) c.lerp(dark, 0.94);
    } else if (character.id === 'naishu') {
      // 奶鼠：奶白肚皮、粉色耳内、深色手脚
      const bd =
        (x / 0.34) ** 2 +
        ((y - 0.55) / 0.33) ** 2 +
        ((z - 0.32) / 0.28) ** 2;
      c.lerp(belly, (1 - smoothstep(0.62, 1.02, bd)) * 0.92);
      const ax = Math.abs(x);
      const earMask = Math.max(
        1 - smoothstep(0.55, 1.0, ((ax - 0.43) / 0.24) ** 2 + ((y - 1.28) / 0.3) ** 2 + ((z - 0.16) / 0.28) ** 2),
        0
      );
      c.lerp(ear, earMask * 0.9);
      if (y < 0.12 || (ax > 0.58 && y > 0.45 && y < 0.95)) c.lerp(dark, 0.9);
    } else if (character.id === 'penguin') {
      // 企鹅：深色背羽、奶白肚皮、灰色头、橙色脚和喙
      const fz = z;
      const bd =
        (x / 0.3) ** 2 +
        ((y - 0.68) / 0.4) ** 2 +
        ((fz - 0.24) / 0.28) ** 2;
      c.lerp(belly, (1 - smoothstep(0.5, 1.0, bd)) * 0.92);
      if (y < 0.11) c.lerp(new THREE.Color(character.accentColor ?? 0xf0a24b), 0.96);
      if (y > 1.08) c.lerp(gray, 0.58);
      if (y > 1.12 && fz > 0.08) c.lerp(new THREE.Color(0xb8bcc4), 0.42);
      const eye1 = (x + 0.12) ** 2 + (y - 1.27) ** 2 + (fz - 0.28) ** 2;
      const eye2 = (x - 0.12) ** 2 + (y - 1.27) ** 2 + (fz - 0.28) ** 2;
      if (Math.min(eye1, eye2) < 0.0035) c.lerp(eyeDark, 0.9);
    } else {
      // 奶狗：奶白肚皮
      const bd =
        (x / 0.29) ** 2 +
        ((y - 0.48) / 0.3) ** 2 +
        ((z - 0.5) / 0.23) ** 2;
      c.lerp(belly, (1 - smoothstep(0.62, 1.02, bd)) * 0.92);

      // 棕色垂耳
      const ax = Math.abs(x);
      const ed =
        ((ax - 0.34) / 0.2) ** 2 +
        ((y - 1.24) / 0.29) ** 2 +
        ((z - 0.44) / 0.3) ** 2;
      c.lerp(ear, (1 - smoothstep(0.55, 1.0, ed)) * 0.96);
    }

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export class GltfMascot {
  constructor(character, template, animations = []) {
    this.character = character;
    this.root = new THREE.Group();
    this.root.name = `gltf-${character.id}`;
    this.model = cloneSkeleton(template);

    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry = o.geometry.clone();
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      const hasOriginalColor = character.id === 'penguin' && !!o.geometry.attributes.color;
      if (!hasOriginalColor) paintMascot(o.geometry, character, animations.length > 0);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.6,
        metalness: 0.02,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(character.bodyColor ?? 0xffd45c),
        emissiveIntensity: 0.03,
      });
      o.material = mat;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    });
    this.root.add(this.model);

    // 轻量接触阴影：手机端关闭实时阴影后，角色不会“飘”在地面上
    this.shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.blobShadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), this.shadowMat);
    this.blobShadow.rotation.x = -Math.PI / 2;
    this.blobShadow.position.y = 0.032;
    this.blobShadow.renderOrder = 2;
    this.root.add(this.blobShadow);
    // 奶娃 3MF 正面朝 +Z

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of animations) {
      const action = this.mixer.clipAction(clip);
      this.actions[clip.name.toLowerCase()] = action;
    }
    this.hasAnimations = Object.keys(this.actions).length > 0;
    this.activeAction = null;

    // GLB 正面朝 +Z；不要额外翻转

    this.aura = new THREE.Group();
    this.aura.position.y = 0.9;
    const ringMat = new THREE.MeshBasicMaterial({
      color: character.glow ?? 0xffd166,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.auraRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.018, 8, 64), ringMat);
    this.auraRing.rotation.x = Math.PI / 2;
    this.aura.add(this.auraRing);
    this.root.add(this.aura);
  }

  setAction(name, { loopOnce = false, fade = 0.14, timeScale = 1 } = {}) {
    const next = this.actions[name];
    if (!next) return;
    if (this.activeAction === next) {
      if (loopOnce && !next.isRunning()) {
        next.reset().play();
      }
      next.timeScale = timeScale;
      return;
    }
    next.reset();
    next.setLoop(loopOnce ? THREE.LoopOnce : THREE.LoopRepeat, loopOnce ? 1 : Infinity);
    next.clampWhenFinished = loopOnce;
    next.timeScale = timeScale;
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (this.activeAction) next.crossFadeFrom(this.activeAction, fade, false);
    else next.fadeIn(fade);
    this.activeAction = next;
  }

  update(dt, fighter) {
    this.root.position.set(fighter.x, fighter.y ?? 0, fighter.z);
    this.root.scale.setScalar(fighter.penguinScale ?? 1);
    if (this.blobShadow) {
      const h = fighter.y ?? 0;
      this.blobShadow.position.y = 0.032 - h;
      const s = Math.max(0.62, 1 - h * 0.12);
      this.blobShadow.scale.setScalar(s);
      this.shadowMat.opacity = Math.max(0.07, 0.2 - h * 0.035);
    }
    const visualYaw = fighter.player === 0 ? -0.8 : 0.8;
    const targetYaw = fighter.facingAngle + visualYaw + (this.character.modelYaw ?? 0) + (fighter.spinAngle || 0);
    this.root.rotation.y = fighter.spinAngle
      ? targetYaw
      : lerpAngle(this.root.rotation.y, targetYaw, 1 - Math.exp(-dt * 14));

    const t = fighter.animTime;
    const state = fighter.state;
    const moving = Math.hypot(fighter.vx, fighter.vz) > 0.35;
    let tilt = 0;
    let extraLean = 0;
    if (fighter.game && fighter.penguinWhiffUntil > fighter.game.time) tilt += 0.24;
    if (fighter.game && fighter.penguinConfusedUntil > fighter.game.time) tilt += Math.sin(t * 9) * 0.05;

    if (state === 'ko') {
      tilt = Math.min(1.2, fighter.koTime * 2.4);
    } else if (state === 'hurt') {
      extraLean = -0.14;
    }

    if (this.hasAnimations) {
      if (state === 'ko' || state === 'hurt') {
        this.setAction('idle', { fade: 0.1 });
        this.model.position.y = 0;
        this.model.rotation.x = damp(this.model.rotation.x, extraLean, 14, dt);
        this.model.scale.setScalar(1);
      } else if (state === 'dodge' || state === 'dodgeRecover') {
        this.setAction('idle', { fade: 0.06 });
        this.model.position.y = 0;
        this.model.rotation.x = damp(this.model.rotation.x, state === 'dodge' ? -0.3 : 0, 18, dt);
        this.model.scale.setScalar(1);
      } else if (state === 'stoneRush' && fighter.current) {
        this.setAction('attack', { loopOnce: true, fade: 0.05, timeScale: 1.35 });
        this.model.position.y = 0;
        this.model.rotation.x = damp(this.model.rotation.x, -0.18, 18, dt);
        this.model.scale.setScalar(1);
      } else if (state === 'skill' && fighter.current) {
        const isUlt = fighter.currentAction === 'ultimate' && this.actions.ultimate;
        const actionName = isUlt ? 'ultimate' : 'attack';
        const act = this.actions[actionName];
        const total = fighter.current.startup + fighter.current.active + fighter.current.recovery;
        const timeScale = act
          ? THREE.MathUtils.clamp(act.getClip().duration / Math.max(0.2, total), 0.8, 2.2)
          : 1;
        this.setAction(actionName, { loopOnce: !fighter.current.channel, fade: 0.08, timeScale });
        this.model.position.y = 0;
        this.model.rotation.x = 0;
        this.model.scale.setScalar(1);
      } else if (fighter.grounded === false) {
        const jumpAction = this.actions.jump;
        if (jumpAction) this.setAction('jump', { fade: 0.08 });
        else this.setAction('idle', { fade: 0.12 });
        this.model.position.y = 0;
        this.model.rotation.x = 0;
        this.model.scale.setScalar(1);
      } else if (moving) {
        this.setAction('walk', { fade: 0.12, timeScale: THREE.MathUtils.clamp(Math.hypot(fighter.vx, fighter.vz) / 4.2, 0.55, 1.45) });
        this.model.position.y = 0;
        this.model.rotation.x = 0;
        this.model.scale.setScalar(1);
      } else {
        this.setAction('idle', { fade: 0.18 });
        this.model.position.y = 0;
        this.model.rotation.x = 0;
        this.model.scale.setScalar(1);
      }
      this.mixer.update(dt);
      if (this.character.id === 'penguin' && moving && fighter.grounded) {
        this.model.position.y = Math.abs(Math.sin(t * 9.5)) * 0.035;
      }
    } else {
      // 无骨骼时的整体动作 fallback
      let bob = 0;
      let lean = 0;
      let stretch = 1;
      if (state === 'ko') {
        bob = -Math.min(0.18, fighter.koTime * 0.18);
        stretch = 0.96;
      } else if (state === 'hurt') {
        lean = -0.28;
        stretch = 0.96;
      } else if (state === 'skill' && fighter.current) {
        if (fighter.current.type === 'projectile') {
          lean = -0.16;
          bob = 0.02;
        } else if (fighter.current.type === 'dash') {
          lean = 0.3;
          bob = 0.03;
        } else if (fighter.current.type === 'ultimate') {
          stretch = 1 + Math.sin(t * 20) * 0.025;
        } else {
          lean = 0.16;
        }
      } else if (moving) {
        bob = Math.abs(Math.sin(t * 11)) * 0.05;
        lean = 0.1;
        stretch = 1 + Math.sin(t * 22) * 0.012;
      } else {
        bob = Math.sin(t * 2.2) * 0.012;
        stretch = 1 + Math.sin(t * 2.2) * 0.008;
      }
      this.model.position.y = damp(this.model.position.y, bob, 18, dt);
      this.model.rotation.x = damp(this.model.rotation.x, lean, 14, dt);
      this.model.scale.set(
        damp(this.model.scale.x, 1 / Math.sqrt(stretch), 14, dt),
        damp(this.model.scale.y, stretch, 14, dt),
        damp(this.model.scale.z, 1 / Math.sqrt(stretch), 14, dt)
      );
    }

    this.root.rotation.z = damp(this.root.rotation.z, tilt, 8, dt);

    const auraOn = fighter.energy >= 99.5 || (state === 'skill' && fighter.current?.type === 'ultimate');
    this.auraRing.material.opacity = damp(this.auraRing.material.opacity, auraOn ? 0.3 : 0, 10, dt);
    this.aura.rotation.y += dt * (auraOn ? 2.2 : 0.3);
    this.auraRing.scale.setScalar(1 + Math.sin(t * 5) * 0.05);
  }
}
