import * as THREE from '../vendor/three.module.js';

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function standard(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.58,
    metalness: 0.04,
    ...opts,
  });
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// 用顶点色把米白肚皮“画”在身体表面，避免额外白球/接缝
function paintBelly(geometry, bodyColor, bellyColor, { yMin, yMax, frontMin = 0.25, feather = 0.1 }) {
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const body = new THREE.Color(bodyColor);
  const belly = new THREE.Color(bellyColor);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const len = Math.hypot(x, z) || 1;
    const front = z / len;
    const yf = smoothstep(yMin, yMin + feather, y) * (1 - smoothstep(yMax, yMax + feather, y));
    const af = smoothstep(frontMin, frontMin + feather, front);
    c.copy(body).lerp(belly, Math.max(0, Math.min(1, yf * af)));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function lathe(profile, material, segments = 36) {
  const points = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(points, segments), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function sphere(r, material, segments = 20) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, segments, Math.max(10, segments - 6)), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function capsule(radius, length, material) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), material);
  m.castShadow = true;
  return m;
}

function tube(points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 8, false), material);
  m.castShadow = true;
  return m;
}

export class Mascot {
  constructor(character) {
    this.character = character;
    this.kind = character.kind || 'blob';
    this.root = new THREE.Group();
    this.root.name = `mascot-${character.id}`;
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    this.blobShadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), this.shadowMat);
    this.blobShadow.rotation.x = -Math.PI / 2;
    this.blobShadow.position.y = 0.032;
    this.blobShadow.renderOrder = 2;
    this.root.add(this.blobShadow);
    this.materials = [];
    this.eyes = [];
    this.arms = [];
    this.legs = [];
    this.ears = [];
    this.tail = null;
    this.tailBaseY = 0;
    this._flash = 0;

    this.matBody = standard(character.bodyColor ?? 0xffd45c);
    this.matBody.emissive = new THREE.Color(character.glow ?? 0xffd166);
    this.matBody.emissiveIntensity = 0.02;
    this.matBodyColored = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.58,
      metalness: 0.04,
      emissive: new THREE.Color(character.glow ?? 0xffd166),
      emissiveIntensity: 0.02,
    });
    this.matBelly = standard(character.bellyColor ?? 0xfff4df);
    this.matAccent = standard(character.accentColor ?? 0x8b7753);
    this.matPaw = standard(character.pawColor ?? 0x6b5b4a);
    this.matMouth = standard(character.mouthColor ?? 0x4a2b24, { roughness: 0.7 });
    this.matTeeth = standard(0xffffff, { roughness: 0.35 });
    this.matIris = standard(character.eyeColor ?? 0x8fae72, { roughness: 0.42 });
    this.matPupil = standard(0x111111, { roughness: 0.3 });
    this.matWhite = standard(0xfff8e6, { roughness: 0.35 });
    this.materials.push(this.matBody, this.matBodyColored, this.matBelly, this.matAccent, this.matPaw, this.matMouth, this.matIris, this.matPupil);

    this.baseY = this.kind === 'dog' ? 0 : 0.18;
    this.bodyGroup = new THREE.Group();
    this.bodyGroup.position.y = this.baseY;
    this.root.add(this.bodyGroup);

    if (this.kind === 'dog') this.buildDog();
    else if (this.kind === 'mouse') this.buildMouse();
    else if (this.kind === 'egg') this.buildEgg();
    else this.buildBlob();

    this.buildAura();
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  addMesh(parent, mesh, pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0]) {
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(mesh);
    return mesh;
  }

  addEye(x, y, z, scale = 1) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    this.addMesh(g, sphere(0.155 * scale, this.matWhite, 18), [0, 0, 0], [1, 0.95, 0.35]);
    const front = 0.155 * scale * 0.35 + 0.004;
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.108 * scale, 24), this.matIris);
    iris.position.z = front;
    g.add(iris);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.06 * scale, 20), this.matPupil);
    pupil.position.z = front + 0.003;
    g.add(pupil);
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const glint = new THREE.Mesh(new THREE.CircleGeometry(0.018 * scale, 10), glintMat);
    glint.position.set(-0.035 * scale, 0.04 * scale, front + 0.006);
    g.add(glint);
    this.bodyGroup.add(g);
    this.eyes.push(g);
    return g;
  }

  addSmile(y, z, width = 0.13, parent = this.bodyGroup) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-width, 0.025, 0),
      new THREE.Vector3(0, -0.045, 0),
      new THREE.Vector3(width, 0.025, 0),
    ]);
    const geo = new THREE.TubeGeometry(curve, 12, 0.012, 6, false);
    const m = new THREE.Mesh(geo, this.matMouth);
    m.position.set(0, y, z);
    parent.add(m);
    return m;
  }

  addArm(side, x, y, z, length, radius, opts = {}) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const limb = capsule(radius, length, opts.material ?? this.matBody);
    limb.position.y = -length / 2;
    g.add(limb);
    const hand = sphere(opts.handRadius ?? radius * 1.15, opts.handMaterial ?? this.matPaw, 14);
    hand.position.y = -length;
    g.add(hand);
    if (opts.fingers) {
      for (let i = -1; i <= 1; i++) {
        const finger = capsule(radius * 0.32, radius * 1.7, opts.material ?? this.matBody);
        finger.position.set(i * radius * 0.62, -length - radius * 0.7, 0);
        finger.rotation.x = 0.4;
        g.add(finger);
      }
    }
    g.rotation.z = side * (opts.out ?? 0.25);
    this.bodyGroup.add(g);
    this.arms.push(g);
    return g;
  }

  addLeg(side, x, z, length, radius, footMaterial = this.matPaw, baseY = this.baseY) {
    const g = new THREE.Group();
    g.position.set(x, baseY, z);
    const limb = capsule(radius, length, this.matBody);
    limb.position.y = -length / 2;
    g.add(limb);
    const foot = sphere(radius * 1.35, footMaterial, 14);
    foot.position.set(0, -length - radius * 0.1, radius * 0.35);
    foot.scale.set(1.15, 0.65, 1.5);
    g.add(foot);
    this.root.add(g);
    this.legs.push(g);
    return g;
  }

  addMouseEar(side) {
    const g = new THREE.Group();
    g.position.set(side * 0.5, 1.42, 0);
    const outer = sphere(0.3, this.matBody, 20);
    outer.scale.set(1, 1, 0.22);
    g.add(outer);
    const inner = sphere(0.21, this.matAccent, 18);
    inner.scale.set(1, 1, 0.06);
    inner.position.z = 0.075;
    g.add(inner);
    g.rotation.z = side * 0.05;
    this.bodyGroup.add(g);
    this.ears.push(g);
    return g;
  }

  addDogEar(side) {
    const g = new THREE.Group();
    g.position.set(side * 0.38, 1.34, 0.22);
    const ear = sphere(0.22, this.matAccent, 18);
    ear.scale.set(1.05, 1.25, 0.22);
    ear.rotation.z = side * 0.62;
    g.add(ear);
    this.bodyGroup.add(g);
    this.ears.push(g);
    return g;
  }

  buildBlob() {
    const profile = [
      [0.02, 0], [0.4, 0.02], [0.62, 0.14], [0.77, 0.45],
      [0.76, 0.78], [0.66, 1.05], [0.46, 1.24], [0.22, 1.35], [0.02, 1.37],
    ];
    const body = lathe(profile, this.matBodyColored);
    paintBelly(body.geometry, this.character.bodyColor, this.character.bellyColor, {
      yMin: 0.12, yMax: 0.72, frontMin: 0.2, feather: 0.12,
    });
    this.bodyGroup.add(body);
    this.addEye(-0.24, 1.04, 0.64, 1.08);
    this.addEye(0.24, 1.04, 0.64, 1.08);
    this.addSmile(0.8, 0.78, 0.15);
    this.addArm(-1, -0.8, 0.86, 0.2, 0.34, 0.09, { handMaterial: this.matPaw });
    this.addArm(1, 0.8, 0.86, 0.2, 0.34, 0.09, { handMaterial: this.matPaw });
    this.addLeg(-1, -0.36, 0.1, 0.2, 0.1, this.matPaw);
    this.addLeg(1, 0.36, 0.1, 0.2, 0.1, this.matPaw);
  }

  buildEgg() {
    const profile = [
      [0.02, 0], [0.38, 0.02], [0.56, 0.14], [0.65, 0.42],
      [0.63, 0.72], [0.5, 0.98], [0.3, 1.13], [0.02, 1.16],
    ];
    this.bodyGroup.add(lathe(profile, this.matBody));
    this.addEye(-0.18, 0.87, 0.66, 1.05);
    this.addEye(0.18, 0.87, 0.66, 1.05);
    this.addSmile(0.68, 0.7, 0.13);
    this.addArm(-1, -0.64, 0.68, 0.1, 0.22, 0.072, { out: 0.55 });
    this.addArm(1, 0.64, 0.68, 0.1, 0.22, 0.072, { out: 0.55 });
    this.addLeg(-1, -0.3, 0.06, 0.19, 0.09, this.matBody);
    this.addLeg(1, 0.3, 0.06, 0.19, 0.09, this.matBody);
    this.addMesh(this.bodyGroup, sphere(0.12, this.matBody, 14), [0, 0.5, -0.55], [1, 1, 0.8]);
  }

  buildMouse() {
    const profile = [
      [0.02, 0], [0.38, 0.02], [0.58, 0.14], [0.72, 0.45],
      [0.7, 0.8], [0.58, 1.08], [0.4, 1.26], [0.18, 1.36], [0.02, 1.38],
    ];
    this.bodyGroup.add(lathe(profile, this.matBody));
    this.addMouseEar(-1);
    this.addMouseEar(1);
    this.addEye(-0.22, 0.98, 0.62, 1.08);
    this.addEye(0.22, 0.98, 0.62, 1.08);
    this.addSmile(0.8, 0.68, 0.13);
    this.addArm(-1, -0.72, 0.82, 0.14, 0.34, 0.08, { fingers: true, handMaterial: this.matBody });
    this.addArm(1, 0.72, 0.82, 0.14, 0.34, 0.08, { fingers: true, handMaterial: this.matBody });
    this.addLeg(-1, -0.36, 0.06, 0.22, 0.1, this.matBody);
    this.addLeg(1, 0.36, 0.06, 0.22, 0.1, this.matBody);
    const tailGroup = new THREE.Group();
    const tail = tube([
      [0.28, 0.4, -0.4], [0.65, 0.3, -0.55], [0.95, 0.32, -0.45], [1.12, 0.45, -0.25],
    ], 0.04, this.matBody);
    tailGroup.add(tail);
    this.bodyGroup.add(tailGroup);
    this.tail = tailGroup;
    this.tailBaseY = 0;
  }

  buildDog() {
    const bodyGeo = new THREE.SphereGeometry(0.5, 32, 24);
    paintBelly(bodyGeo, this.character.bodyColor, this.character.bellyColor, {
      yMin: -0.32, yMax: 0.12, frontMin: 0.12, feather: 0.13,
    });
    const body = new THREE.Mesh(bodyGeo, this.matBodyColored);
    this.addMesh(this.bodyGroup, body, [0, 0.68, -0.05], [1.0, 0.82, 1.18]);
    const head = sphere(0.45, this.matBody, 24);
    this.addMesh(this.bodyGroup, head, [0, 1.18, 0.44], [1, 0.95, 0.95]);
    const muzzle = sphere(0.26, this.matBody, 20);
    this.addMesh(this.bodyGroup, muzzle, [0, 0.98, 0.78], [1.05, 0.72, 0.85]);
    this.addMesh(this.bodyGroup, sphere(0.085, this.matMouth, 12), [0, 1.08, 1.0], [1.2, 0.85, 0.8]);
    // 张开的笑嘴：横向深色口腔 + 粉色舌头 + 两颗小牙
    const mouth = sphere(0.18, this.matMouth, 18);
    this.addMesh(this.bodyGroup, mouth, [0, 0.9, 0.97], [1.45, 0.55, 0.35]);
    const tongue = sphere(0.11, standard(0xff9a9a), 14);
    this.addMesh(this.bodyGroup, tongue, [0, 0.85, 1.0], [1.2, 0.45, 0.5]);
    for (const x of [-0.1, 0.1]) {
      const tooth = sphere(0.032, this.matTeeth, 10);
      this.addMesh(this.bodyGroup, tooth, [x, 0.95, 1.01], [0.9, 0.6, 0.5]);
    }
    // 眯眯眼：两条向上弯的黑色弧线
    for (const x of [-0.17, 0.17]) {
      const eyeCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.075, 0.005, 0),
        new THREE.Vector3(0, 0.045, 0),
        new THREE.Vector3(0.075, 0.005, 0),
      ]);
      const eye = new THREE.Mesh(new THREE.TubeGeometry(eyeCurve, 8, 0.012, 6, false), this.matMouth);
      eye.position.set(x, 1.3, 0.9);
      eye.rotation.z = x < 0 ? 0.12 : -0.12;
      this.bodyGroup.add(eye);
    }
    this.addDogEar(-1);
    this.addDogEar(1);
    // 四条腿
    for (const [x, z] of [[-0.3, 0.42], [0.3, 0.42], [-0.3, -0.42], [0.3, -0.42]]) {
      const g = new THREE.Group();
      g.position.set(x, 0.55, z);
      const upper = capsule(0.1, 0.42, this.matBody);
      upper.position.y = -0.21;
      g.add(upper);
      const paw = sphere(0.14, this.matAccent, 14);
      paw.position.set(0, -0.48, 0.05);
      paw.scale.set(1.2, 0.6, 1.5);
      g.add(paw);
      for (const ox of [-0.055, 0, 0.055]) {
        const toe = sphere(0.035, this.matAccent, 8);
        toe.position.set(ox, -0.55, 0.18);
        g.add(toe);
      }
      this.root.add(g);
      this.legs.push(g);
    }
    const tailGroup = new THREE.Group();
    const tail = tube([[0, 0.9, -0.55], [0, 1.15, -0.85], [0, 1.35, -0.72], [0, 1.42, -0.55]], 0.055, this.matBody);
    tailGroup.add(tail);
    this.bodyGroup.add(tailGroup);
    this.tail = tailGroup;
  }

  buildAura() {
    this.aura = new THREE.Group();
    this.aura.position.y = 1.05;
    const ringMat = new THREE.MeshBasicMaterial({
      color: this.character.glow ?? 0xffd166,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.auraRing = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.02, 8, 64), ringMat);
    this.auraRing.rotation.x = Math.PI / 2;
    this.aura.add(this.auraRing);
    this.auraLight = new THREE.PointLight(this.character.glow ?? 0xffd166, 0, 5, 2);
    this.aura.add(this.auraLight);
    this.root.add(this.aura);
  }

  update(dt, fighter) {
    this.root.position.set(fighter.x, fighter.y ?? 0, fighter.z);
    if (this.blobShadow) {
      const h = fighter.y ?? 0;
      this.blobShadow.position.y = 0.032 - h;
      this.blobShadow.scale.setScalar(Math.max(0.62, 1 - h * 0.12));
      this.shadowMat.opacity = Math.max(0.07, 0.2 - h * 0.035);
    }
    // 3/4 朝向镜头，保留一点侧身战斗感，让脸和眼睛可见
    const visualYaw = fighter.player === 0 ? -0.78 : 0.78;
    this.root.rotation.y = lerpAngle(
      this.root.rotation.y,
      fighter.facingAngle + visualYaw,
      1 - Math.exp(-dt * 16)
    );

    const t = fighter.animTime;
    const state = fighter.state;
    const action = fighter.currentAction;
    const sk = fighter.current;
    const total = sk ? sk.startup + sk.active + sk.recovery : 1;
    const p = sk ? clamp(fighter.stateTime / total, 0, 1) : 0;
    const speed = Math.hypot(fighter.vx, fighter.vz);
    const moving = speed > 0.35;

    let bob = 0;
    let lean = 0;
    let squash = 1;
    let tilt = 0;
    let armL = 0;
    let armR = 0;
    let legSwing = 0;

    if (state === 'ko') {
      tilt = Math.min(1.25, fighter.koTime * 2.4);
      bob = -Math.min(0.22, fighter.koTime * 0.2);
      armL = -0.8;
      armR = -0.8;
      squash = 0.9;
    } else if (state === 'hurt') {
      lean = -0.35;
      squash = 0.88;
      armL = -0.6;
      armR = -0.4;
    } else if (state === 'skill' && sk) {
      const punch = p < 0.25 ? p / 0.25 : p < 0.65 ? 1 : Math.max(0, 1 - (p - 0.65) / 0.35);
      if (action === 'attack') {
        lean = 0.18;
        armR = -1.45 * punch;
        armL = -0.35;
        squash = 1 + punch * 0.04;
        legSwing = -0.2;
      } else if (sk.type === 'projectile') {
        lean = -0.18;
        armL = -1.2;
        armR = -1.2;
        squash = 1.04;
      } else if (sk.type === 'dash') {
        lean = 0.38;
        armL = -0.7;
        armR = -0.7;
        legSwing = 0.7;
        squash = 1.08;
      } else if (sk.type === 'ultimate') {
        lean = -0.08;
        armL = -2.1;
        armR = -2.1;
        squash = 1 + Math.sin(t * 20) * 0.03;
      }
    } else if (fighter.grounded === false) {
      const rise = clamp(fighter.vy / 6.4, 0, 1);
      lean = 0.12 + rise * 0.1;
      armL = -1.25;
      armR = -1.25;
      legSwing = -0.55;
      squash = 1 + rise * 0.07;
    } else if (moving) {
      const phase = Math.sin(t * 12);
      bob = Math.abs(Math.sin(t * 12)) * 0.055;
      lean = 0.12;
      legSwing = phase * 0.55;
      armL = -phase * 0.4;
      armR = phase * 0.4;
      squash = 1 + Math.sin(t * 24) * 0.015;
    } else {
      bob = Math.sin(t * 2.2) * 0.014;
      squash = 1 + Math.sin(t * 2.2) * 0.01;
    }
    if (fighter.landTimer > 0) squash = Math.min(squash, 0.9);

    const k = 1 - Math.exp(-dt * 18);
    this.bodyGroup.position.y = damp(this.bodyGroup.position.y, this.baseY + bob, 18, dt);
    this.bodyGroup.rotation.x = damp(this.bodyGroup.rotation.x, lean, 16, dt);
    this.bodyGroup.scale.set(
      damp(this.bodyGroup.scale.x, 1 / Math.sqrt(squash), 16, dt),
      damp(this.bodyGroup.scale.y, squash, 16, dt),
      damp(this.bodyGroup.scale.z, 1 / Math.sqrt(squash), 16, dt)
    );
    this.root.rotation.z = damp(this.root.rotation.z, tilt, 8, dt);

    if (this.arms[0]) this.arms[0].rotation.x = damp(this.arms[0].rotation.x, armL, 18, dt);
    if (this.arms[1]) this.arms[1].rotation.x = damp(this.arms[1].rotation.x, armR, 18, dt);
    for (let i = 0; i < this.legs.length; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      this.legs[i].rotation.x = damp(this.legs[i].rotation.x, legSwing * dir, 18, dt);
    }
    for (let i = 0; i < this.ears.length; i++) {
      const s = i === 0 ? -1 : 1;
      this.ears[i].rotation.z = damp(
        this.ears[i].rotation.z,
        s * 0.08 + Math.sin(t * 5 + i) * (moving ? 0.08 : 0.035) + (state === 'ko' ? 0.2 : 0),
        8,
        dt
      );
    }
    if (this.tail) this.tail.rotation.y = this.tailBaseY + Math.sin(t * 4.5) * 0.28 + (moving ? 0.15 : 0);

    // 眨眼
    const blink = Math.sin(t * 1.7 + this.character.id.length) > 0.985 ? 0.12 : 1;
    for (const eye of this.eyes) {
      eye.scale.y = damp(eye.scale.y, blink, 24, dt);
      // 眼球轻微转向镜头，3/4 视角下仍能看到瞳孔
      eye.rotation.y = damp(eye.rotation.y, -this.root.rotation.y, 18, dt);
    }

    const flash = Math.max(0, Math.min(1, fighter.flash));
    if (Math.abs(flash - this._flash) > 0.02) {
      this._flash = flash;
      for (const m of this.materials) {
        if (m.emissiveIntensity !== undefined) {
          m.emissiveIntensity = 0.06 + flash * 1.2;
        }
      }
    }

    const auraOn = fighter.energy >= 99.5 || state === 'skill' && sk?.type === 'ultimate';
    const auraOpacity = auraOn ? 0.35 + Math.sin(t * 6) * 0.12 : 0;
    this.auraRing.material.opacity = damp(this.auraRing.material.opacity, auraOpacity, 10, dt);
    this.aura.rotation.y += dt * (auraOn ? 2.4 : 0.4);
    this.auraRing.scale.setScalar(1 + Math.sin(t * 5) * 0.06);
    this.auraLight.intensity = damp(this.auraLight.intensity, auraOn ? 3.4 : 0, 8, dt);
  }
}
