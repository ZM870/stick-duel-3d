// 键盘 + 双虚拟摇杆 + 触屏技能键
const KEY_ACTIONS = {
  KeyA: [0, 'left'],
  KeyD: [0, 'right'],
  KeyW: [0, 'up'],
  KeyS: [0, 'down'],
  KeyJ: [0, 'attack'],
  KeyK: [0, 'skill1'],
  KeyL: [0, 'skill2'],
  KeyI: [0, 'ultimate'],
  ShiftLeft: [0, 'dodge'],
  ShiftRight: [0, 'dodge'],
  Space: [0, 'jump'],
};

const PREVENT = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.downAt = new Map();
    this.buttons = [];
    this.joy = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    this.joyPointer = [null, null];
    this.joyEls = [];
    // 人机通道：AI 不碰 DOM / 键盘，只写这里
    this.aiAxis = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    this.aiPressed = [new Set(), new Set()];
    this.aiHeld = [new Set(), new Set()];
    this.aiHeldAt = [new Map(), new Map()];
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      const m = KEY_ACTIONS[e.code];
      if (!m) return;
      const key = `${m[0]}:${m[1]}`;
      if (!this.keys.has(key)) {
        this.keys.add(key);
        this.pressed.add(key);
        this.downAt.set(key, performance.now());
      }
    });
    window.addEventListener('keyup', (e) => {
      const m = KEY_ACTIONS[e.code];
      if (!m) return;
      this.keys.delete(`${m[0]}:${m[1]}`);
      this.downAt.delete(`${m[0]}:${m[1]}`);
    });
    window.addEventListener('blur', () => this.clear());
  }

  bind(root = document) {
    // 摇杆
    this.joyEls = [...root.querySelectorAll('[data-joystick]')];
    const zone = root.querySelector('[data-joystick-zone="0"]');
    if (zone) this.bindJoystickZone(zone, 0);
    for (const el of this.joyEls) {
      const player = Number(el.dataset.joystick);
      if (player === 0 && zone) continue;
      const knob = el.querySelector('.joy-knob');
      const onDown = (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        if (this.joyPointer[player] !== null) return;
        this.joyPointer[player] = e.pointerId;
        el.classList.add('active');
        el.setPointerCapture?.(e.pointerId);
        this.updateJoyFromEvent(player, el, knob, e);
      };
      const onMove = (e) => {
        if (this.joyPointer[player] !== e.pointerId) return;
        e.preventDefault();
        this.updateJoyFromEvent(player, el, knob, e);
      };
      const onUp = (e) => {
        if (this.joyPointer[player] !== e.pointerId) return;
        e.preventDefault();
        this.joyPointer[player] = null;
        this.joy[player].x = 0;
        this.joy[player].y = 0;
        el.classList.remove('active');
        if (knob) knob.style.transform = 'translate(-50%, -50%)';
      };
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
      el.addEventListener('lostpointercapture', onUp);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // 技能键
    this.buttons = [...root.querySelectorAll('[data-player][data-action]')];
    for (const el of this.buttons) {
      const player = Number(el.dataset.player);
      const action = el.dataset.action;
      const key = `${player}:${action}`;
      const down = (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        el.setPointerCapture?.(e.pointerId);
        if (!this.keys.has(key)) {
          this.keys.add(key);
          this.pressed.add(key);
          this.downAt.set(key, performance.now());
        }
        el.classList.add('pressed');
      };
      const up = (e) => {
        e.preventDefault();
        this.keys.delete(key);
        this.downAt.delete(key);
        el.classList.remove('pressed');
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  bindJoystickZone(zone, player) {
    const el = zone.querySelector(`[data-joystick="${player}"]`) ||
      document.querySelector(`[data-joystick="${player}"]`);
    if (!el) return;
    const knob = el.querySelector('.joy-knob');
    const onDown = (e) => {
      if (!this.enabled) return;
      if (e.target.closest?.('[data-player][data-action]')) return;
      const forced = document.body.classList.contains('forced-landscape');
      // 强制横屏是旋转后的坐标系，动态定位会偏；这时保留固定摇杆区域
      if (forced) {
        const jr = el.getBoundingClientRect();
        const pad = 18;
        if (e.clientX < jr.left - pad || e.clientX > jr.right + pad ||
            e.clientY < jr.top - pad || e.clientY > jr.bottom + pad) return;
      }
      e.preventDefault();
      if (this.joyPointer[player] !== null) return;
      this.joyPointer[player] = e.pointerId;
      if (!forced) {
        const size = el.getBoundingClientRect().width || 132;
        const x = Math.max(0, Math.min(window.innerWidth - size, e.clientX - size / 2));
        const y = Math.max(0, Math.min(window.innerHeight - size, e.clientY - size / 2));
        el.classList.add('floating');
        el.style.position = 'fixed';
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.bottom = 'auto';
      }
      el.classList.add('active');
      zone.setPointerCapture?.(e.pointerId);
      this.updateJoyFromEvent(player, el, knob, e);
    };
    const onMove = (e) => {
      if (this.joyPointer[player] !== e.pointerId) return;
      e.preventDefault();
      this.updateJoyFromEvent(player, el, knob, e);
    };
    const onUp = (e) => {
      if (this.joyPointer[player] !== e.pointerId) return;
      e.preventDefault();
      this.joyPointer[player] = null;
      this.joy[player].x = 0;
      this.joy[player].y = 0;
      el.classList.remove('active', 'floating');
      el.style.position = '';
      el.style.left = '';
      el.style.top = '';
      el.style.bottom = '';
      if (knob) knob.style.transform = 'translate(-50%, -50%)';
    };
    zone.addEventListener('pointerdown', onDown);
    zone.addEventListener('pointermove', onMove);
    zone.addEventListener('pointerup', onUp);
    zone.addEventListener('pointercancel', onUp);
    zone.addEventListener('lostpointercapture', onUp);
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  updateJoyFromEvent(player, el, knob, e) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const max = Math.max(1, r.width * 0.42);
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    let nx = dx / max;
    let ny = dy / max;
    const mag = Math.hypot(nx, ny);
    if (mag < 0.12) {
      nx = 0;
      ny = 0;
    } else {
      // 死区外重新归一化，保证轻推也能移动
      nx = (nx / mag) * Math.min(1, (mag - 0.12) / 0.88);
      ny = (ny / mag) * Math.min(1, (mag - 0.12) / 0.88);
      if (Math.hypot(nx, ny) > 1) {
        const l = Math.hypot(nx, ny);
        nx /= l;
        ny /= l;
      }
    }
    this.joy[player].x = nx;
    this.joy[player].y = ny;
    if (knob) knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  axis(player) {
    let x = this.joy[player].x + this.aiAxis[player].x;
    let y = this.joy[player].y + this.aiAxis[player].y;
    const p = player;
    const k = (a) => this.keys.has(`${p}:${a}`);
    if (k('left')) x -= 1;
    if (k('right')) x += 1;
    if (k('up')) y -= 1;
    if (k('down')) y += 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  setAI(player, axis) {
    this.aiAxis[player].x = axis?.x ?? 0;
    this.aiAxis[player].y = axis?.y ?? 0;
  }

  pressAI(player, action) {
    this.aiPressed[player].add(action);
  }

  setAIHeld(player, action, down) {
    const set = this.aiHeld[player];
    const at = this.aiHeldAt[player];
    if (down) {
      if (!set.has(action)) {
        set.add(action);
        at.set(action, performance.now());
      }
    } else {
      set.delete(action);
      at.delete(action);
    }
  }

  isDown(player, action) {
    return this.keys.has(`${player}:${action}`) ||
      this.aiHeld[player]?.has(action) === true;
  }

  heldFor(player, action) {
    if (this.aiHeld[player]?.has(action)) {
      const t = this.aiHeldAt[player].get(action);
      return t === undefined ? 0 : (performance.now() - t) / 1000;
    }
    const t = this.downAt.get(`${player}:${action}`);
    return t === undefined ? 0 : (performance.now() - t) / 1000;
  }

  consume(player, action) {
    const key = `${player}:${action}`;
    if (this.pressed.has(key)) {
      this.pressed.delete(key);
      return true;
    }
    if (this.aiPressed[player]?.has(action)) {
      this.aiPressed[player].delete(action);
      return true;
    }
    return false;
  }

  clear() {
    this.keys.clear();
    this.pressed.clear();
    this.downAt.clear();
    this.aiHeld[0].clear();
    this.aiHeld[1].clear();
    this.aiHeldAt[0].clear();
    this.aiHeldAt[1].clear();
    for (let i = 0; i < 2; i++) {
      this.joy[i].x = 0;
      this.joy[i].y = 0;
      this.joyPointer[i] = null;
      this.aiAxis[i].x = 0;
      this.aiAxis[i].y = 0;
      this.aiPressed[i].clear();
    }
    for (const el of this.joyEls) {
      el.classList.remove('active', 'floating');
      el.style.position = '';
      el.style.left = '';
      el.style.top = '';
      el.style.bottom = '';
      const knob = el.querySelector('.joy-knob');
      if (knob) knob.style.transform = 'translate(-50%, -50%)';
    }
    for (const el of this.buttons) el.classList.remove('pressed');
  }
}
