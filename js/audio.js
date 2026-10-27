// 极简 WebAudio 音效：无外部资源，首次点击后启用
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.noiseBuffer = null;
    this.rasenganAudio = null;
    this.rasenganToken = 0;
    this.naiwaUltimateAudio = null;
    this.ultimateEndHandler = null;
    this.battleBgm = null;
    this.bgmActive = false;
    this.bgmBase = 0.1;
    this.bgmDuckUntil = 0;
    this.bgmToken = 0;
    this.bgmTimer = null;
    this.penguinSongTimer = null;
    this.penguinSongTimeouts = [];
    this.penguinSongActive = false;
    this.penguinVoiceBoost = 1;
    this.penguinAdminTimer = null;
    this.penguinUltimateAudio = null;
    this.penguinUltimateToken = 0;
  }

  resume() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx?.state === 'suspended') this.ctx.resume();
      if (this.bgmActive && this.battleBgm?.paused) {
        const r = this.battleBgm.play();
        if (r?.catch) r.catch(() => {});
      }
      if (this.ctx && !this.master) {
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 22;
        comp.ratio.value = 5;
        comp.attack.value = 0.003;
        comp.release.value = 0.22;
        comp.connect(this.ctx.destination);
        this.master = comp;
      }
    } catch {
      // 静默失败：没有音频也能玩
    }
  }

  tone(freq, dur, type = 'sine', vol = 0.05, slide = 0) {
    if (!this.enabled || !this.ctx) return;
    this.bgmDuckUntil = performance.now() + 220;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freq), t);
      if (slide) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
      }
      gain.gain.setValueAtTime(Math.max(0.0001, vol), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(this.master || this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
    } catch {
      // ignore
    }
  }

  getNoiseBuffer() {
    if (!this.ctx) return null;
    if (this.noiseBuffer) return this.noiseBuffer;
    const len = Math.floor(this.ctx.sampleRate * 0.7);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
    return buf;
  }

  noiseBurst({ duration = 0.09, vol = 0.06, freq = 1400, toFreq = 0, q = 0.8 } = {}) {
    if (!this.enabled || !this.ctx) return;
    this.bgmDuckUntil = performance.now() + 220;
    const buf = this.getNoiseBuffer();
    if (!buf) return;
    try {
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(Math.max(80, freq), t);
      if (toFreq > 0) filter.frequency.exponentialRampToValueAtTime(Math.max(80, toFreq), t + duration);
      filter.Q.value = q;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(Math.max(0.0001, vol), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master || this.ctx.destination);
      src.start(t);
      src.stop(t + duration);
    } catch {
      // ignore
    }
  }

  thump(freqStart = 120, freqEnd = 48, duration = 0.12, vol = 0.08) {
    if (!this.enabled || !this.ctx) return;
    this.bgmDuckUntil = performance.now() + 220;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(Math.max(20, freqStart), t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + duration);
      gain.gain.setValueAtTime(Math.max(0.0001, vol), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain);
      gain.connect(this.master || this.ctx.destination);
      osc.start(t);
      osc.stop(t + duration);
    } catch {
      // ignore
    }
  }

  hit(kind = 'normal', damage = 50) {
    if (!this.enabled || !this.ctx) return;
    const heavy = kind === 'ultimate' || kind === 'rasengan' || damage >= 100;
    const p = Math.max(0.55, Math.min(1.7, damage / 70));
    const jitter = 0.94 + Math.random() * 0.12;
    this.thump((heavy ? 96 : 132) * jitter, heavy ? 34 : 52, heavy ? 0.2 : 0.105, (heavy ? 0.14 : 0.085) * p);
    this.noiseBurst({
      duration: heavy ? 0.17 : 0.075,
      vol: (heavy ? 0.1 : 0.06) * p,
      freq: (heavy ? 620 : 1400) * jitter,
      toFreq: heavy ? 180 : 520,
      q: heavy ? 0.55 : 0.9,
    });
    this.tone((heavy ? 210 : 260) * jitter, 0.035, 'square', (heavy ? 0.045 : 0.03) * p, -90);
    if (heavy) this.thump(52, 26, 0.26, 0.09 * p);
  }

  swing() {
    if (!this.enabled || !this.ctx) return;
    this.noiseBurst({ duration: 0.16, vol: 0.035, freq: 380, toFreq: 1800, q: 0.55 });
    this.tone(170, 0.06, 'triangle', 0.018, -70);
  }

  dodge() {
    if (!this.enabled || !this.ctx) return;
    this.noiseBurst({ duration: 0.18, vol: 0.038, freq: 700, toFreq: 240, q: 0.6 });
    this.tone(230, 0.12, 'triangle', 0.018, -110);
  }

  dodgeFail() {
    if (!this.enabled || !this.ctx) return;
    this.tone(150, 0.09, 'square', 0.028, -45);
  }

  formantVoice(pitch, endPitch, duration, vol, formants, noise = 0.008) {
    if (!this.enabled || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const out = this.ctx.createGain();
      const input = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(pitch, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endPitch), t + duration);
      input.gain.value = 0.42;
      osc.connect(input);
      const qs = [7, 9, 11];
      for (let i = 0; i < formants.length; i++) {
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = formants[i];
        f.Q.value = qs[i] ?? 9;
        const g = this.ctx.createGain();
        g.gain.value = i === 0 ? 0.8 : i === 1 ? 0.55 : 0.3;
        input.connect(f);
        f.connect(g);
        g.connect(out);
      }
      if (noise > 0) {
        const buf = this.getNoiseBuffer();
        if (buf) {
          const src = this.ctx.createBufferSource();
          src.buffer = buf;
          const hp = this.ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 900;
          const ng = this.ctx.createGain();
          ng.gain.value = noise;
          src.connect(hp); hp.connect(ng); ng.connect(out);
          src.start(t); src.stop(t + duration);
        }
      }
      const v = Math.max(0.0001, vol * this.penguinVoiceBoost);
      out.gain.setValueAtTime(0.0001, t);
      out.gain.linearRampToValueAtTime(v, t + 0.008);
      out.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      out.connect(this.master || this.ctx.destination);
      osc.start(t);
      osc.stop(t + duration + 0.02);
      this.bgmDuckUntil = performance.now() + Math.max(220, duration * 1000);
    } catch {
      // ignore
    }
  }

  penguinQuack(kind = 'short') {
    if (!this.enabled || !this.ctx) return;
    switch (kind) {
      case 'ga':
        this.formantVoice(310, 145, 0.19, 0.095, [700, 1200, 2600], 0.012);
        break;
      case 'heavy':
        this.formantVoice(190, 82, 0.3, 0.13, [320, 700, 1800], 0.02);
        this.thump(95, 40, 0.16, 0.08);
        break;
      case 'stone':
        this.formantVoice(540, 370, 0.11, 0.055, [820, 1650, 2800], 0.026);
        setTimeout(() => this.formantVoice(500, 340, 0.1, 0.045, [780, 1500, 2600], 0.02), 105);
        break;
      case 'stoneHit':
        this.noiseBurst({ duration: 0.05, vol: 0.07, freq: 1800, toFreq: 600, q: 0.8 });
        this.thump(150, 60, 0.07, 0.055);
        break;
      case 'happy':
        this.formantVoice(480, 700, 0.1, 0.055, [620, 1450, 2600], 0.004);
        setTimeout(() => this.formantVoice(560, 820, 0.11, 0.05, [680, 1550, 2700], 0.004), 115);
        break;
      case 'miss':
        this.formantVoice(370, 165, 0.24, 0.065, [500, 1000, 2200], 0.01);
        break;
      case 'land':
        this.thump(86, 38, 0.12, 0.07);
        this.noiseBurst({ duration: 0.05, vol: 0.025, freq: 600, toFreq: 250, q: 0.7 });
        break;
      case 'gu2':
        this.formantVoice(242, 172, 0.12, 0.08, [430, 950, 2350], 0.008);
        break;
      default:
        this.formantVoice(225, 155, 0.125, 0.085, [410, 900, 2350], 0.008);
    }
  }

  penguinSong(boosted = false) {
    this.stopPenguinSong();
    if (!this.enabled) return;
    this.penguinSongActive = true;
    this.penguinVoiceBoost = boosted ? 1.35 : 1;
    const seq = [
      [0, 'gu'], [0.18, 'gu'], [0.36, 'ga'], [0.56, 'gu'],
      [0.74, 'ga'], [0.96, 'gu'], [1.18, 'ga'], [1.42, 'gu'],
      [1.68, 'ga'], [1.96, 'gu'], [2.24, 'ga'], [2.52, 'ga'],
    ];
    for (const [delay, kind] of seq) {
      const id = setTimeout(() => {
        if (!this.penguinSongActive) return;
        this.penguinQuack(kind);
      }, delay * 1000);
      this.penguinSongTimeouts.push(id);
    }
  }

  stopPenguinSong() {
    this.penguinSongActive = false;
    for (const id of this.penguinSongTimeouts) clearTimeout(id);
    this.penguinSongTimeouts = [];
    this.penguinVoiceBoost = 1;
    if (this.penguinSongTimer) {
      clearInterval(this.penguinSongTimer);
      this.penguinSongTimer = null;
    }
    if (this.penguinAdminTimer) {
      clearInterval(this.penguinAdminTimer);
      this.penguinAdminTimer = null;
    }
  }

  penguinAdmin() {
    this.stopPenguinSong();
    if (!this.enabled || !this.ctx) return;
    this.penguinQuack('heavy');
    this.thump(90, 38, 0.5, 0.12);
    this.penguinAdminTimer = setInterval(() => this.penguinQuack('ga'), 420);
  }

  playPenguinUltimate() {
    if (!this.enabled) return;
    try {
      if (!this.penguinUltimateAudio) {
        const a = new Audio('./assets/audio/penguin_ultimate.mp3');
        a.loop = false;
        a.preload = 'auto';
        this.penguinUltimateAudio = a;
      }
      const a = this.penguinUltimateAudio;
      this.penguinUltimateToken += 1;
      a.pause();
      a.currentTime = 0;
      a.volume = 0.7;
      const r = a.play();
      if (r?.catch) r.catch(() => {});
      this.bgmDuckUntil = performance.now() + 6500;
    } catch {
      // 自动播放被拦截时静默失败
    }
  }

  stopPenguinUltimate(fadeMs = 650) {
    const a = this.penguinUltimateAudio;
    if (!a) return;
    this.penguinUltimateToken += 1;
    const token = this.penguinUltimateToken;
    const from = a.volume;
    const started = performance.now();
    const fade = () => {
      if (token !== this.penguinUltimateToken) return;
      const p = Math.min(1, (performance.now() - started) / Math.max(1, fadeMs));
      a.volume = Math.max(0, from * (1 - p));
      if (p < 1) {
        requestAnimationFrame(fade);
      } else {
        a.pause();
        a.currentTime = 0;
        a.volume = 0;
      }
    };
    requestAnimationFrame(fade);
  }

  skill() {
    this.tone(320, 0.12, 'triangle', 0.045, 220);
  }

  projectile() {
    this.tone(520, 0.16, 'sawtooth', 0.035, 180);
  }

  ultimate() {
    this.tone(90, 0.5, 'sawtooth', 0.06, 260);
    this.tone(180, 0.42, 'triangle', 0.04, 420);
  }

  ko() {
    this.tone(80, 0.55, 'sawtooth', 0.07, -40);
  }

  ensureRasenganAudio() {
    if (!this.rasenganAudio) {
      try {
        const a = new Audio('./assets/audio/rasengan_charge.mp3');
        a.loop = true;
        a.preload = 'auto';
        a.volume = 0.58;
        this.rasenganAudio = a;
      } catch {
        this.rasenganAudio = null;
      }
    }
    return this.rasenganAudio;
  }

  startRasenganCharge() {
    if (!this.enabled) return;
    const a = this.ensureRasenganAudio();
    if (!a) return;
    this.rasenganToken += 1;
    try {
      a.pause();
      a.currentTime = 0;
      a.volume = 0.58;
      const r = a.play();
      if (r?.catch) r.catch(() => {});
    } catch {
      // 自动播放被拦截时静默失败
    }
  }

  stopRasenganCharge() {
    const a = this.rasenganAudio;
    if (!a) return;
    this.rasenganToken += 1;
    const token = this.rasenganToken;
    const from = a.volume;
    const started = performance.now();
    const fade = () => {
      if (this.rasenganToken !== token) return;
      const p = Math.min(1, (performance.now() - started) / 90);
      a.volume = Math.max(0, from * (1 - p));
      if (p < 1) {
        requestAnimationFrame(fade);
      } else {
        a.pause();
        a.currentTime = 0;
        a.volume = 0.58;
      }
    };
    requestAnimationFrame(fade);
  }

  ensureNaiwaUltimateAudio() {
    if (!this.naiwaUltimateAudio) {
      try {
        const a = new Audio('./assets/audio/naiwa_ultimate.mp3');
        a.loop = false;
        a.preload = 'auto';
        a.volume = 0.72;
        this.naiwaUltimateAudio = a;
      } catch {
        this.naiwaUltimateAudio = null;
      }
    }
    return this.naiwaUltimateAudio;
  }

  playNaiwaUltimate(onEnded) {
    if (!this.enabled) return;
    const a = this.ensureNaiwaUltimateAudio();
    if (!a) return;
    if (this.ultimateEndHandler) {
      a.removeEventListener('ended', this.ultimateEndHandler);
      this.ultimateEndHandler = null;
    }
    if (onEnded) {
      this.ultimateEndHandler = () => {
        this.ultimateEndHandler = null;
        onEnded();
      };
      a.addEventListener('ended', this.ultimateEndHandler, { once: true });
    }
    try {
      a.pause();
      a.currentTime = 0;
      a.volume = 0.72;
      const r = a.play();
      if (r?.catch) r.catch(() => {});
    } catch {
      // 自动播放被拦截时静默失败
    }
  }

  stopNaiwaUltimate() {
    const a = this.naiwaUltimateAudio;
    if (!a) return;
    if (this.ultimateEndHandler) {
      a.removeEventListener('ended', this.ultimateEndHandler);
      this.ultimateEndHandler = null;
    }
    a.pause();
    a.currentTime = 0;
  }

  ensureBattleBgm() {
    if (!this.battleBgm) {
      try {
        const a = new Audio('./assets/audio/battle_bgm.mp3');
        a.loop = false;
        a.preload = 'auto';
        a.volume = 0;
        a.addEventListener('ended', () => {
          if (!this.bgmActive) return;
          a.currentTime = 0;
          a.volume = 0;
          setTimeout(() => {
            if (!this.bgmActive) return;
            const r = a.play();
            if (r?.catch) r.catch(() => {});
          }, 180);
        });
        this.battleBgm = a;
      } catch {
        this.battleBgm = null;
      }
    }
    return this.battleBgm;
  }

  tickBattleBgm() {
    if (!this.bgmActive) return;
    const a = this.battleBgm;
    if (!a) return;
    const dur = Number.isFinite(a.duration) ? a.duration : 0;
    const t = a.currentTime || 0;
    const fadeIn = 2.6;
    const fadeOut = 3.2;
    let vol = this.bgmBase;
    if (t < fadeIn) {
      vol *= Math.max(0, t / fadeIn);
    } else if (dur > 0 && t > dur - fadeOut) {
      vol *= Math.max(0, (dur - t) / fadeOut);
    }
    if (performance.now() < this.bgmDuckUntil) vol *= 0.38;
    a.volume = Math.max(0, Math.min(this.bgmBase, vol));
  }

  startBattleBgm() {
    if (!this.enabled) return;
    const a = this.ensureBattleBgm();
    if (!a) return;
    if (this.bgmActive) return;
    this.bgmActive = true;
    this.bgmToken += 1;
    a.pause();
    a.currentTime = 0;
    a.volume = 0;
    try {
      const r = a.play();
      if (r?.catch) r.catch(() => {});
    } catch {
      // 自动播放被拦截时静默失败
    }
    if (!this.bgmTimer) {
      this.bgmTimer = setInterval(() => this.tickBattleBgm(), 60);
      this.tickBattleBgm();
    }
  }

  stopBattleBgm(fadeMs = 900) {
    if (!this.bgmActive) return;
    this.bgmActive = false;
    this.bgmToken += 1;
    const token = this.bgmToken;
    const a = this.battleBgm;
    if (!a) return;
    const from = a.volume;
    const started = performance.now();
    const fade = () => {
      if (this.bgmToken !== token) return;
      const p = Math.min(1, (performance.now() - started) / Math.max(1, fadeMs));
      a.volume = Math.max(0, from * (1 - p));
      if (p < 1) {
        requestAnimationFrame(fade);
      } else {
        a.pause();
        a.currentTime = 0;
        a.volume = 0;
      }
    };
    requestAnimationFrame(fade);
  }
}
