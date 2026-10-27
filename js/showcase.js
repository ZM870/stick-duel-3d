import * as THREE from '../vendor/three.module.js';
import { CHARACTERS, CHARACTER_ORDER } from './config.js';
import { Mascot } from './mascot.js';
import { GltfMascot } from './gltf-mascot.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050713);
scene.fog = new THREE.FogExp2(0x070b18, 0.026);

const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100);
camera.position.set(0, 2.25, 7.4);
camera.lookAt(0, 1.0, 0);

scene.add(new THREE.HemisphereLight(0xaac4ff, 0x1c1120, 1.35));
const key = new THREE.DirectionalLight(0xffd9b0, 2.5);
key.position.set(5, 9, 6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 30;
key.shadow.camera.left = -9;
key.shadow.camera.right = 9;
key.shadow.camera.top = 9;
key.shadow.camera.bottom = -9;
key.shadow.bias = -0.0005;
scene.add(key);
const rim = new THREE.DirectionalLight(0x5fc8ff, 1.0);
rim.position.set(-6, 5, -4);
scene.add(rim);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(12, 72),
  new THREE.MeshStandardMaterial({ color: 0x0b1020, roughness: 1 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.03;
floor.receiveShadow = true;
scene.add(floor);

for (let i = 0; i < 5; i++) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4.4 + i * 0.55, 4.46 + i * 0.55, 96),
    new THREE.MeshBasicMaterial({
      color: i % 2 ? 0x2d6a9f : 0x1f3f66,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.005;
  scene.add(ring);
}

const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(180 * 3);
for (let i = 0; i < 180; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 18 + Math.random() * 18;
  starPos[i * 3] = Math.cos(a) * r;
  starPos[i * 3 + 1] = 4 + Math.random() * 16;
  starPos[i * 3 + 2] = Math.sin(a) * r - 8;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(
  starGeo,
  new THREE.PointsMaterial({
    color: 0xcfe4ff,
    size: 0.08,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
));

function makeLabel(name, title) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 66px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.fillText(name, 256, 78);
  ctx.fillStyle = '#ffd166';
  ctx.font = '700 26px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.fillText(title, 256, 122);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.0, 0.63, 1);
  return sprite;
}

const assets = {};
async function loadPair(id, riggedUrl, staticUrl) {
  try {
    const gltf = await new GLTFLoader().loadAsync(riggedUrl);
    assets[id] = { scene: gltf.scene, animations: gltf.animations };
    return;
  } catch (err) {
    console.warn(`${id} 骨骼 GLB 加载失败`, err);
  }
  try {
    const gltf = await new GLTFLoader().loadAsync(staticUrl);
    assets[id] = { scene: gltf.scene, animations: [] };
  } catch (err) {
    console.warn(`${id} 静态 GLB 加载失败`, err);
  }
}

await loadPair('naigou', './assets/models/naigou_rigged.glb', './assets/models/naigou_bambu.glb');
await loadPair('naiwa', './assets/models/naiwa_rigged.glb?v=13', './assets/models/naiwa_bambu.glb');
await loadPair('naishu', './assets/models/naishu_rigged.glb', './assets/models/naishu_bambu.glb');
await loadPair('penguin', './assets/models/penguin_rigged.glb?v=3', './assets/models/penguin_bambu.glb?v=3');

const models = CHARACTER_ORDER.map((id, i) => {
  const character = CHARACTERS[id];
  const asset = assets[id];
  const mascot = asset
    ? new GltfMascot(character, asset.scene, asset.animations)
    : new Mascot(character);
  const spacing = CHARACTER_ORDER.length >= 6 ? 1.55 : CHARACTER_ORDER.length >= 5 ? 1.9 : 2.2;
  const x = (i - (CHARACTER_ORDER.length - 1) / 2) * spacing;
  mascot.root.position.set(x, 0, 0);
  scene.add(mascot.root);

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.78, 0.9, 0.14, 32),
    new THREE.MeshStandardMaterial({ color: 0x1b2440, roughness: 0.75, metalness: 0.2 })
  );
  pedestal.position.set(x, -0.07, 0);
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  const label = makeLabel(character.name, character.title);
  label.position.set(x, 2.0, 0.1);
  scene.add(label);

  return { mascot, x, phase: i * 1.4, label };
});

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  if (camera.aspect < 1.1) {
    camera.position.set(0, 2.6, 12.5);
  } else {
    camera.position.set(0, 2.25, 8.8);
  }
  camera.lookAt(0, 1.0, 0);
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
let t = 0;
const fake = {
  x: 0, z: 0, facingAngle: 0, player: 0, animTime: 0,
  state: 'idle', currentAction: null, current: null,
  vx: 0, vz: 0, energy: 35, flash: 0,
};

function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  t += dt;
  for (const m of models) {
    fake.x = m.x;
    fake.player = m.label.position.x < 0 ? 0 : 1;
    fake.facingAngle = Math.sin(t * 0.42 + m.phase) * 0.5;
    fake.animTime = t + m.phase;
    m.mascot.update(dt, fake);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
