import * as THREE from '../vendor/three.module.js';

const UP = new THREE.Vector3(0, 1, 0);

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function makeMat(color, emissiveIntensity = 0.12) {
  const c = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    color: c,
    emissive: c.clone().multiplyScalar(0.45),
    emissiveIntensity,
    roughness: 0.48,
    metalness: 0.18,
  });
}

function limb(radius, length, mat, jointMat) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.05, length, 10), mat);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  g.add(mesh);
  const joint = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.35, 10, 8), jointMat);
  g.add(joint);
  return g;
}

export class Stickman {
  constructor(character) {
    this.character = character;
    this.root = new THREE.Group();
    this.root.name = `fighter-${character.id}`;
    this.materials = [];
    this.baseEmissive = 0.12;

    const color = character.color;
    const accent = character.accent;
    const mat = makeMat(color);
    const accentMat = makeMat(accent, 0.25);
    const jointMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.55),
      roughness: 0.6,
      metalness: 0.25,
    });
    this.materials.push(mat, accentMat, jointMat);

    this.hips = new THREE.Group();
    this.hips.position.y = 0.88;
    this.root.add(this.hips);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 0.72, 10), mat);
    torso.position.y = 0.36;
    torso.castShadow = true;
    this.hips.add(torso);
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), jointMat);
    pelvis.position.y = 0.02;
    pelvis.castShadow = true;
    this.hips.add(pelvis);

    this.chest = new THREE.Group();
    this.chest.position.y = 0.72;
    this.hips.add(this.chest);

    // 头 + 头带 + 眼睛
    this.head = new THREE.Group();
    this.head.position.y = 0.27;
    this.chest.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), mat);
    skull.castShadow = true;
    this.head.add(skull);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.025, 8, 28), accentMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.04;
    this.head.add(band);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const x of [-0.065, 0.065]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), eyeMat);
      eye.position.set(x, 0.015, 0.18);
      this.head.add(eye);
    }

    // 双臂
    this.shoulders = [];
    this.elbows = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.27, 0.11, 0);
      shoulder.userData.side = side;
      this.chest.add(shoulder);
      const upper = limb(0.064, 0.36, mat, jointMat);
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.36;
      shoulder.add(elbow);
      const fore = limb(0.058, 0.34, mat, jointMat);
      elbow.add(fore);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.092, 10, 8), accentMat);
      hand.position.y = -0.34;
      hand.castShadow = true;
      elbow.add(hand);
      this.shoulders.push(shoulder);
      this.elbows.push(elbow);
    }

    // 双腿
    this.hipsLegs = [];
    this.knees = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.16, 0, 0);
      this.hips.add(hip);
      const thigh = limb(0.08, 0.44, mat, jointMat);
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      hip.add(knee);
      const shin = limb(0.07, 0.42, mat, jointMat);
      knee.add(shin);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.28), accentMat);
      foot.position.set(0, -0.44, 0.07);
      foot.castShadow = true;
      knee.add(foot);
      this.hipsLegs.push(hip);
      this.knees.push(knee);
    }

    // 气场
    this.aura = new THREE.Group();
    this.aura.position.y = 1.05;
    const ringMat = new THREE.MeshBasicMaterial({
      color: character.glow,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.auraRing = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.018, 8, 64), ringMat);
    this.auraRing.rotation.x = Math.PI / 2;
    this.aura.add(this.auraRing);
    this.auraLight = new THREE.PointLight(character.glow, 0, 5, 2);
    this.auraLight.position.y = 0.1;
    this.aura.add(this.auraLight);
    this.root.add(this.aura);

    this.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this._flash = 0;
  }

  update(dt, fighter) {
    this.root.position.set(fighter.x, 0, fighter.z);
    this.root.rotation.y = lerpAngle(this.root.rotation.y, fighter.facingAngle, 1 - Math.exp(-dt * 16));

    const t = fighter.animTime;
    const speed = Math.hypot(fighter.vx, fighter.vz);
    const state = fighter.state;
    const action = fighter.currentAction;
    const sk = fighter.current;
    const skillT = sk ? Math.min(1, fighter.stateTime / Math.max(0.001, sk.startup + sk.active + sk.recovery)) : 0;
    const moving = speed > 0.35;

    let chestX = 0.02;
    let chestY = 0;
    let chestZ = 0;
    let shoulderLX = 0.16;
    let shoulderRX = -0.16;
    let shoulderLZ = -0.10;
    let shoulderRZ = 0.10;
    let elbowLX = -0.18;
    let elbowRX = -0.18;
    let hipLX = 0.14;
    let hipRX = -0.14;
    let kneeLX = 0.10;
    let kneeRX = 0.10;
    let rootY = 0;
    let rootTilt = 0;

    if (state === 'ko') {
      rootTilt = Math.min(1.28, fighter.koTime * 2.4);
      rootY = -Math.min(0.38, fighter.koTime * 0.24);
      shoulderLX = -0.8;
      shoulderRX = -0.4;
      hipLX = -0.3;
      hipRX = 0.3;
    } else if (state === 'hurt') {
      chestX = -0.34;
      chestY = Math.sin(t * 22) * 0.08;
      shoulderLX = -0.65;
      shoulderRX = -0.45;
      shoulderLZ = -0.5;
      shoulderRZ = 0.5;
      rootY = -0.03;
    } else if (state === 'skill' && sk) {
      const p = fingerCurve(skillT);
      if (action === 'attack') {
        chestX = 0.10;
        chestY = -0.22;
        shoulderRX = -1.45 * p;
        shoulderRZ = 0.35;
        elbowRX = -0.25 - 0.55 * p;
        shoulderLX = -0.35;
        shoulderLZ = -0.35;
        hipLX = -0.18;
        hipRX = 0.16;
      } else if (sk.type === 'projectile') {
        chestX = -0.16;
        shoulderLX = -1.15;
        shoulderRX = -1.15;
        elbowLX = -0.12;
        elbowRX = -0.12;
        shoulderLZ = -0.1;
        shoulderRZ = 0.1;
        hipLX = -0.12;
        hipRX = 0.14;
      } else if (sk.type === 'dash') {
        chestX = 0.34;
        shoulderRX = -1.5;
        elbowRX = -0.2;
        shoulderLX = 0.75;
        shoulderLZ = -0.25;
        hipLX = -0.55;
        hipRX = 0.45;
        kneeLX = 0.5;
        kneeRX = 0.35;
        rootY = -0.05;
      } else if (sk.type === 'ultimate') {
        chestX = -0.12;
        shoulderLX = -2.2;
        shoulderRX = -2.2;
        shoulderLZ = -0.55;
        shoulderRZ = 0.55;
        elbowLX = -0.2;
        elbowRX = -0.2;
        hipLX = -0.15;
        hipRX = 0.15;
        rootY = 0.03 + Math.sin(t * 20) * 0.02;
      }
    } else if (moving) {
      const phase = Math.sin(t * 12.5);
      const phase2 = Math.sin(t * 12.5 + Math.PI);
      chestX = 0.10;
      hipLX = phase * 0.55;
      hipRX = phase2 * 0.55;
      kneeLX = 0.18 + Math.max(0, -phase) * 0.55;
      kneeRX = 0.18 + Math.max(0, -phase2) * 0.55;
      shoulderLX = phase2 * 0.5;
      shoulderRX = phase * 0.5;
      shoulderLZ = -0.12;
      shoulderRZ = 0.12;
      rootY = Math.abs(Math.sin(t * 12.5)) * 0.035;
    } else {
      rootY = Math.sin(t * 2.2) * 0.012;
      chestX = 0.02 + Math.sin(t * 2.2) * 0.012;
      shoulderLZ = -0.12;
      shoulderRZ = 0.12;
      elbowLX = -0.16;
      elbowRX = -0.16;
    }

    const k = 1 - Math.exp(-dt * 18);
    this.hips.position.y = damp(this.hips.position.y, 0.88 + rootY, 18, dt);
    this.chest.rotation.x = damp(this.chest.rotation.x, chestX, 18, dt);
    this.chest.rotation.y = damp(this.chest.rotation.y, chestY, 18, dt);
    this.chest.rotation.z = damp(this.chest.rotation.z, chestZ, 18, dt);
    this.root.rotation.z = damp(this.root.rotation.z, rootTilt, 8, dt);

    this.shoulders[0].rotation.x = damp(this.shoulders[0].rotation.x, shoulderLX, 22, dt);
    this.shoulders[1].rotation.x = damp(this.shoulders[1].rotation.x, shoulderRX, 22, dt);
    this.shoulders[0].rotation.z = damp(this.shoulders[0].rotation.z, shoulderLZ, 18, dt);
    this.shoulders[1].rotation.z = damp(this.shoulders[1].rotation.z, shoulderRZ, 18, dt);
    this.elbows[0].rotation.x = damp(this.elbows[0].rotation.x, elbowLX, 22, dt);
    this.elbows[1].rotation.x = damp(this.elbows[1].rotation.x, elbowRX, 22, dt);

    this.hipsLegs[0].rotation.x = damp(this.hipsLegs[0].rotation.x, hipLX, 20, dt);
    this.hipsLegs[1].rotation.x = damp(this.hipsLegs[1].rotation.x, hipRX, 20, dt);
    this.knees[0].rotation.x = damp(this.knees[0].rotation.x, kneeLX, 20, dt);
    this.knees[1].rotation.x = damp(this.knees[1].rotation.x, kneeRX, 20, dt);

    // 受击闪白
    const flash = Math.max(0, Math.min(1, fighter.flash));
    if (Math.abs(flash - this._flash) > 0.02) {
      this._flash = flash;
      for (const m of this.materials) {
        if (m.emissiveIntensity !== undefined) {
          m.emissiveIntensity = this.baseEmissive + flash * 1.4;
        }
      }
    }

    // 满能量 / 大招气场
    const auraOn = fighter.energy >= 99.5 || state === 'skill' && sk?.type === 'ultimate';
    const auraOpacity = auraOn ? (0.34 + Math.sin(t * 6) * 0.12) : 0;
    this.auraRing.material.opacity = damp(this.auraRing.material.opacity, auraOpacity, 10, dt);
    this.aura.rotation.y += dt * (auraOn ? 2.2 : 0.4);
    const auraScale = 1 + Math.sin(t * 5) * 0.05;
    this.auraRing.scale.setScalar(auraScale);
    this.auraLight.intensity = damp(this.auraLight.intensity, auraOn ? 3.2 : 0, 8, dt);
  }
}

function fingerCurve(t) {
  // 0 -> 1 -> 0 的快速攻击曲线
  if (t < 0.25) return t / 0.25;
  if (t < 0.6) return 1;
  return Math.max(0, 1 - (t - 0.6) / 0.4);
}

export function createStickman(character) {
  return new Stickman(character);
}
