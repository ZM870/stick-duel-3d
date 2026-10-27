import * as THREE from '../vendor/three.module.js';
import { clone as cloneSkeleton } from '../vendor/three/addons/utils/SkeletonUtils.js';
import { ARENA } from './config.js';

function canvasLabel(text, color = '#1b2a3a') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.font = '900 64px "Microsoft YaHei", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeStyle = 'rgba(38,58,82,0.28)';
  ctx.lineWidth = 10;
  ctx.strokeText(text, 256, 80);
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 80);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true }));
}

export class Arena {
  constructor(canvas) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd8f4);
    this.scene.fog = new THREE.FogExp2(0xd7edf8, 0.0048);

    this.camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 200);
    this.camera.position.set(0, 7.6, 16.2);
    this.camera.lookAt(0, 1.2, 0);

    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !coarse,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.4 : 2));
    this.renderer.shadowMap.enabled = !coarse;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.shake = 0;
    this.baseCam = new THREE.Vector3(0, 7.6, 16.2);
    this.camLook = new THREE.Vector3(0, 1.15, 0);
    this.baseFov = 50;
    this.fovKick = 0;
    this.clouds = [];
    this.flag = null;

    this.buildLights();
    this.buildSky();
    this.buildGround();
    this.buildCourt();
    this.buildSchool();
    this.buildPlayground();
    this.buildFence();
    this.buildTrees();
    this.resize();
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0xd8efff, 0x5b7e48, 1.55);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff1d2, 2.65);
    key.position.set(14, 22, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 70;
    key.shadow.camera.left = -22;
    key.shadow.camera.right = 22;
    key.shadow.camera.top = 22;
    key.shadow.camera.bottom = -22;
    key.shadow.bias = -0.0005;
    this.scene.add(key);
    this.keyLight = key;

    const fill = new THREE.DirectionalLight(0xb9dcff, 0.55);
    fill.position.set(-12, 9, -16);
    this.scene.add(fill);
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(90, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x4b9ee8) },
        mid: { value: new THREE.Color(0x9dd6f6) },
        bottom: { value: new THREE.Color(0xeaf8ff) },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vWorld;
        uniform vec3 top;
        uniform vec3 mid;
        uniform vec3 bottom;
        void main() {
          float h = clamp(normalize(vWorld).y * 0.5 + 0.5, 0.0, 1.0);
          vec3 c = h < 0.5 ? mix(bottom, mid, smoothstep(0.22, 0.5, h)) : mix(mid, top, smoothstep(0.5, 0.9, h));
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    this.scene.add(new THREE.Mesh(geo, mat));

    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff3c4 })
    );
    sun.position.set(-28, 28, -52);
    this.scene.add(sun);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(5.2, 24, 16),
      new THREE.MeshBasicMaterial({
        color: 0xfff0b0,
        transparent: true,
        opacity: 0.13,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.position.copy(sun.position);
    this.scene.add(halo);

    for (let i = 0; i < 9; i++) {
      const cloud = new THREE.Group();
      const n = 3 + Math.floor(Math.random() * 4);
      for (let j = 0; j < n; j++) {
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(1.2 + Math.random() * 1.4, 12, 8),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.82 })
        );
        puff.position.set((j - n / 2) * 1.5, Math.random() * 0.7, Math.random() * 0.8);
        cloud.add(puff);
      }
      cloud.position.set(-38 + i * 10, 17 + Math.random() * 7, -38 - Math.random() * 16);
      this.scene.add(cloud);
      this.clouds.push({ mesh: cloud, speed: 0.12 + Math.random() * 0.18 });
    }
  }

  buildGround() {
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(230, 230),
      new THREE.MeshStandardMaterial({ color: 0x6ca45a, roughness: 0.95 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.4;
    grass.receiveShadow = true;
    this.scene.add(grass);

    const track = new THREE.Mesh(
      new THREE.RingGeometry(13.9, 21.8, 96),
      new THREE.MeshStandardMaterial({ color: 0xb64b3e, roughness: 0.9 })
    );
    track.rotation.x = -Math.PI / 2;
    track.position.y = -0.34;
    track.receiveShadow = true;
    this.scene.add(track);

    const infield = new THREE.Mesh(
      new THREE.CircleGeometry(13.9, 72),
      new THREE.MeshStandardMaterial({ color: 0x5b9e51, roughness: 0.95 })
    );
    infield.rotation.x = -Math.PI / 2;
    infield.position.y = -0.33;
    infield.receiveShadow = true;
    this.scene.add(infield);

    const laneMat = new THREE.MeshBasicMaterial({ color: 0xf7f4ea, transparent: true, opacity: 0.75 });
    for (const r of [14.2, 15.5, 16.8, 18.1, 19.4, 20.7, 21.6]) {
      const lane = new THREE.Mesh(new THREE.RingGeometry(r - 0.025, r + 0.025, 96), laneMat);
      lane.rotation.x = -Math.PI / 2;
      lane.position.y = -0.325;
      this.scene.add(lane);
    }

    // 100 米起跑线
    const start = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 6.8), laneMat);
    start.position.set(-18.6, -0.32, 0);
    this.scene.add(start);
  }

  buildCourt() {
    const courtRadius = ARENA.radius + 2.0;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(courtRadius, courtRadius + 0.22, 0.38, 72),
      new THREE.MeshStandardMaterial({ color: 0x6f7f82, roughness: 0.9 })
    );
    base.position.y = -0.19;
    base.receiveShadow = true;
    this.scene.add(base);

    const court = new THREE.Mesh(
      new THREE.CylinderGeometry(courtRadius - 0.08, courtRadius - 0.08, 0.05, 72),
      new THREE.MeshStandardMaterial({ color: 0x477fb0, roughness: 0.78 })
    );
    court.position.y = 0.005;
    court.receiveShadow = true;
    this.scene.add(court);

    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf8f6ec, transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(courtRadius - 0.35, courtRadius - 0.22, 96), lineMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    this.scene.add(ring);

    const fightRing = new THREE.Mesh(
      new THREE.RingGeometry(ARENA.fightRadius - 0.035, ARENA.fightRadius + 0.035, 96),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
    );
    fightRing.rotation.x = -Math.PI / 2;
    fightRing.position.y = 0.043;
    this.scene.add(fightRing);

    const center = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.14, 64), lineMat);
    center.rotation.x = -Math.PI / 2;
    center.position.y = 0.041;
    this.scene.add(center);

    const centerDot = new THREE.Mesh(new THREE.CircleGeometry(0.18, 24), lineMat);
    centerDot.rotation.x = -Math.PI / 2;
    centerDot.position.y = 0.042;
    this.scene.add(centerDot);

    const mid = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, courtRadius * 1.9), lineMat);
    mid.position.y = 0.041;
    this.scene.add(mid);
  }

  buildSchool() {
    const cream = new THREE.MeshStandardMaterial({ color: 0xf1e7d0, roughness: 0.82 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xd7c8ad, roughness: 0.8 });
    const roof = new THREE.MeshStandardMaterial({ color: 0x8e3b32, roughness: 0.78 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.2, metalness: 0.15 });

    const school = new THREE.Group();
    school.position.set(0, 0, -44);

    const body = new THREE.Mesh(new THREE.BoxGeometry(44, 14, 12), cream);
    body.position.y = 7;
    body.castShadow = true;
    body.receiveShadow = true;
    school.add(body);

    const topTrim = new THREE.Mesh(new THREE.BoxGeometry(45.2, 0.6, 12.8), trim);
    topTrim.position.y = 14.2;
    school.add(topTrim);

    const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(45.2, 1.3, 13.2), roof);
    roofMesh.position.y = 15.0;
    roofMesh.castShadow = true;
    school.add(roofMesh);

    const door = new THREE.Mesh(new THREE.BoxGeometry(3.8, 5.0, 0.3), new THREE.MeshStandardMaterial({ color: 0x6f4b35, roughness: 0.7 }));
    door.position.set(0, 2.5, 6.1);
    school.add(door);

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 13; col++) {
        if (col === 5 || col === 6 || col === 7) continue;
        const win = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 0.14), glass);
        win.position.set(-18 + col * 3.0, 3.8 + row * 3.2, 6.08);
        school.add(win);
      }
    }

    const clock = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 32),
      new THREE.MeshBasicMaterial({ color: 0xfaf7ee })
    );
    clock.position.set(0, 12.0, 6.13);
    school.add(clock);

    const sign = canvasLabel('阳光小学', '#27405a');
    sign.position.set(0, 13.1, 6.45);
    sign.scale.set(10.5, 2.9, 1);
    school.add(sign);

    for (let i = 0; i < 3; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(8.0 - i * 0.4, 0.22, 0.9 + i * 0.4), trim);
      step.position.set(0, 0.11 + i * 0.22, 6.45 + i * 0.4);
      school.add(step);
    }

    this.scene.add(school);
  }

  buildPlayground() {
    // 篮球架
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x344d63, roughness: 0.65, metalness: 0.3 });
    const hoop = new THREE.Group();
    hoop.position.set(18, 0, -9);
    for (const x of [-0.26, 0.26]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.4, 10), poleMat);
      pole.position.set(x, 2.2, 0);
      pole.castShadow = true;
      hoop.add(pole);
    }
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.0, 0.12), new THREE.MeshStandardMaterial({ color: 0xf7f7f2, roughness: 0.7 }));
    board.position.set(0, 4.1, 0);
    hoop.add(board);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.035, 8, 32), new THREE.MeshStandardMaterial({ color: 0xe8622f, roughness: 0.45 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 3.15, 0.7);
    hoop.add(rim);
    hoop.rotation.y = -Math.PI / 2;
    this.scene.add(hoop);

    // 足球门
    const goalMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e7, roughness: 0.6, metalness: 0.2 });
    const goal = new THREE.Group();
    goal.position.set(-18, 0, 4);
    for (const x of [-2.2, 2.2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 10), goalMat);
      post.position.set(x, 1.2, 0);
      goal.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.4, 10), goalMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 2.4, 0);
    goal.add(bar);
    goal.rotation.y = Math.PI / 2;
    this.scene.add(goal);

    // 长椅
    for (const [x, z, ry] of [[-15, 11, 0.2], [15, 11, -0.2]]) {
      const bench = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 0.6), new THREE.MeshStandardMaterial({ color: 0xb0794f, roughness: 0.8 }));
      seat.position.y = 0.55;
      bench.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 0.12), new THREE.MeshStandardMaterial({ color: 0xb0794f, roughness: 0.8 }));
      back.position.set(0, 0.85, -0.25);
      bench.add(back);
      for (const sx of [-0.9, 0.9]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.5), poleMat);
        leg.position.set(sx, 0.28, 0);
        bench.add(leg);
      }
      bench.position.set(x, 0, z);
      bench.rotation.y = ry;
      this.scene.add(bench);
    }

    // 旗杆
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 7.5, 10), goalMat);
    flagPole.position.set(-9, 3.75, -19);
    flagPole.castShadow = true;
    this.scene.add(flagPole);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 1.3, 8, 4),
      new THREE.MeshStandardMaterial({ color: 0xd83a3a, side: THREE.DoubleSide, roughness: 0.8 })
    );
    flag.position.set(-7.9, 6.5, -19);
    this.scene.add(flag);
    this.flag = flag;
  }

  buildFence() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x78909c, roughness: 0.65, metalness: 0.35 });
    const posts = [];
    for (let i = 0; i <= 29; i++) {
      const x = -32 + i * 2.2;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.0, 0.12), mat);
      post.position.set(x, 1.0, -30);
      this.scene.add(post);
      posts.push(post);
    }
    for (let i = 0; i <= 21; i++) {
      const z = -30 + i * 2.2;
      for (const x of [-32, 32]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.0, 0.12), mat);
        post.position.set(x, 1.0, z);
        this.scene.add(post);
      }
    }
    for (const y of [0.6, 1.4]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(64, 0.08, 0.08), mat);
      rail.position.set(0, y, -30);
      this.scene.add(rail);
    }
  }

  buildTrees() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5437, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4c8f43, roughness: 0.9 });
    const spots = [
      [-27, -19], [-23, -23], [23, -23], [27, -19],
      [-28, 7], [28, 7], [-26, 16], [26, 16],
    ];
    for (const [x, z] of spots) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 2.4, 8), trunkMat);
      trunk.position.y = 1.2;
      trunk.castShadow = true;
      tree.add(trunk);
      for (let i = 0; i < 3; i++) {
        const crown = new THREE.Mesh(new THREE.SphereGeometry(1.0 - i * 0.16, 10, 8), leafMat);
        crown.position.set((i - 1) * 0.35, 2.35 + i * 0.45, (i % 2) * 0.25);
        crown.castShadow = true;
        tree.add(crown);
      }
      tree.position.set(x, 0, z);
      this.scene.add(tree);
    }
  }

  addBambuModels(loadedModels = {}) {
    this._bambuIds ??= new Set();
    const entries = [
      ['naigou', -11.2, -15.5],
      ['naiwa', -3.8, -17.2],
      ['penguin', 3.8, -17.2],
      ['naishu', 11.2, -15.5],
    ];
    const names = { naigou: '奶狗', naiwa: '奶娃', naishu: '奶鼠', penguin: '企鹅' };
    for (const [id, x, z] of entries) {
      if (this._bambuIds.has(id)) continue;
      const asset = loadedModels[id];
      if (!asset?.scene) continue;
      this._bambuIds.add(id);
      const model = cloneSkeleton(asset.scene);
      model.scale.setScalar(0.82);
      model.rotation.y = Math.atan2(-x, -z);
      model.position.y = 0.45;
      const statueColor = id === 'penguin' ? 0x9fe8ff : id === 'naigou' ? 0xffd45c : id === 'naiwa' ? 0xffd166 : 0xffd45c;
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.material = new THREE.MeshStandardMaterial({
          color: statueColor,
          roughness: 0.62,
          metalness: 0.02,
        });
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      });

      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.78, 0.92, 0.45, 32),
        new THREE.MeshStandardMaterial({ color: 0xdad4c4, roughness: 0.75 })
      );
      pedestal.position.set(x, 0.22, z);
      pedestal.receiveShadow = true;
      this.scene.add(pedestal);

      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.add(model);
      this.scene.add(group);

      const label = canvasLabel(names[id] ?? id, '#2b4258');
      label.position.set(x, 2.25, z);
      label.scale.set(2.2, 0.7, 1);
      this.scene.add(label);
    }
  }

  resize() {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.baseFov = this.camera.aspect < 1.25 ? 56 : 50;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.baseCam.y = this.camera.aspect < 1.25 ? 8.8 : 7.6;
    this.baseCam.z = this.camera.aspect < 1.25 ? 20.8 : 16.2;
    this.camera.position.copy(this.baseCam);
  }

  getCameraForward() {
    const dx = this.camLook.x - this.camera.position.x;
    const dz = this.camLook.z - this.camera.position.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.0001) return { x: 0, z: -1 };
    return { x: dx / len, z: dz / len };
  }

  update(dt, time, fighters, localPlayer = 0) {
    const p1 = fighters[localPlayer] ?? fighters[0];
    const p2 = fighters[1 - localPlayer] ?? fighters[1];
    let dx = p2.x - p1.x;
    let dz = p2.z - p1.z;
    let separation = Math.hypot(dx, dz);
    if (separation < 0.001) {
      dx = Math.sin(p1.facingAngle);
      dz = Math.cos(p1.facingAngle);
      separation = 1;
    }
    const fx = dx / separation;
    const fz = dz / separation;
    const rx = -fz;
    const rz = fx;

    // 第三人称越肩镜头：镜头在玩家身后，朝对手方向看
    const distance = 5.8 + Math.min(10.2, separation * 0.5);
    const height = 2.9 + Math.min(2.6, separation * 0.085);
    const shoulder = 1.25;
    const targetX = p1.x - fx * distance + rx * shoulder;
    const targetZ = p1.z - fz * distance + rz * shoulder;
    const targetY = height;
    const k = 1 - Math.exp(-dt * 5.4);
    this.camera.position.x += (targetX - this.camera.position.x) * k;
    this.camera.position.y += (targetY - this.camera.position.y) * k;
    this.camera.position.z += (targetZ - this.camera.position.z) * k;

    const lookX = p1.x + fx * Math.min(separation * 0.52, 6.2);
    const lookZ = p1.z + fz * Math.min(separation * 0.52, 6.2);
    const lookK = 1 - Math.exp(-dt * 7);
    this.camLook.x += (lookX - this.camLook.x) * lookK;
    this.camLook.y += (1.12 - this.camLook.y) * lookK;
    this.camLook.z += (lookZ - this.camLook.z) * lookK;

    const sh = this.shake;
    this.camera.position.x += (Math.random() - 0.5) * sh * 0.05;
    this.camera.position.y += (Math.random() - 0.5) * sh * 0.04;
    this.shake = Math.max(0, this.shake - dt * 26);

    this.camera.lookAt(this.camLook.x, this.camLook.y, this.camLook.z);

    this.fovKick *= Math.exp(-dt * 8);
    if (Math.abs(this.camera.fov - (this.baseFov + this.fovKick)) > 0.02) {
      this.camera.fov = this.baseFov + this.fovKick;
      this.camera.updateProjectionMatrix();
    }

    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 52) c.mesh.position.x = -52;
    }
    if (this.flag) this.flag.rotation.z = Math.sin(time * 1.4) * 0.04;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
