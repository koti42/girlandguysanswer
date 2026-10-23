/*
 * KEŞİF ses motoru — tamamen prosedürel WebAudio (dosya yok).
 *
 *   const audio = createKesifAudio({ muted, musicEnabled });
 *   audio.unlock();                                   // ilk kullanıcı jestinde (kendi de dinler)
 *   audio.setListener({x,y,z}, yawOrForward, up);     // her karede kamera
 *   audio.setAmbient({ zone, biome, underground, underwater, night, weather, combat, water?, lava? });
 *   audio.play('step:çim', { x,y,z, vol, pitch });    // → { stop(), setPosition(x,y,z) } | null
 *   audio.update(dt);                                 // her karede (ortam olayları + müzik zamanlaması)
 *   audio.getLoopContext();                           // araç motoru/radyo (audioVehicle/audioRadio): {ctx,sfx,music,amb,white,brown,running,musicOn,holdMusic(b)} | null (bağlam yok)
 *
 * Ses adları: audioRecipes.listSoundNames(). Malzeme: taş, toprak, kum, ahşap, çim, kar, su, metal, yaprak, cam.
 * Yaw kuralı: 0 = −Z'ye bakar, + = sola (three.js); ya da ileri vektör {x,y,z} verilebilir.
 *
 * Mimari: sfx/ambiyans/müzik veri yolları → "dünya" alçak geçiren (su altı boğukluğu) → ana kazanç →
 * kompresör → çıkış; paylaşılan evrişim yankısı (üretilmiş dürtü) ortama göre karışır. Uzamsal sesler HRTF
 * PannerNode havuzundan (sınırlı sayıda) geçer, havuz doluysa StereoPanner + mesafe sönümü. Ses sınırlayıcı
 * eşzamanlı ses sayısını öncelik/mesafeye göre sınırlar. Mobilde düğüm tavanları düşer.
 *
 * Otomatik oynatma: AudioContext ilk jestte (pointerdown/keydown/touchend/click) açılır; sekme gizlenince
 * askıya alınır, dönünce sürer. Sessizde bağlam hiç kurulmaz.
 */
import {
  ambientMix,
  blendMix,
  createVoiceLimiter,
  distanceGain,
  fillNoise,
  generateImpulse,
  listenerBasis,
  nextEventDelay,
  panFor,
} from './audioMix.js';
import { createMusicComposer, pickMusicParams, stepSeconds } from './audioMusic.js';
import { makeSynth, resolveSound } from './audioRecipes.js';

export { listSoundNames } from './audioRecipes.js';

const MASTER = 0.6;
const MUSIC = 0.16;
const AMBIENT = 0.5;
const SCHEDULE_AHEAD = 0.25;
const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click', 'mousedown'];

export const canResume = (c) => Boolean(c) && (c.state === 'suspended' || c.state === 'interrupted');

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function detectLowPower() {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav) return false;
    return Boolean(nav.maxTouchPoints > 0 || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4));
  } catch {
    return false;
  }
}

export function createKesifAudio({ muted = false, musicEnabled: musicIn = true, rand = Math.random, lowPower } = {}) {
  const low = typeof lowPower === 'boolean' ? lowPower : detectLowPower();
  const LIMITS = low
    ? { voices: 14, hrtf: 3, nodes: 10, music: 22, impulse: 1.2 }
    : { voices: 24, hrtf: 6, nodes: 14, music: 40, impulse: 2.0 };

  let ctx = null;
  let closed = false;
  let isMuted = Boolean(muted);
  let musicEnabled = Boolean(musicIn);
  let userSuspended = false;
  let hiddenSuspended = false;
  let silentUnlocked = false;
  let musicHold = false; // radyo çalarken ortam müziği zamanlayıcısı bekler (getLoopContext().holdMusic)

  // Veri yolu düğümleri
  let master = null;
  let worldFilter = null;
  let sfxBus = null;
  let ambBus = null;
  let musicBus = null;
  let musicFilter = null;
  let calmBus = null;
  let tenseBus = null;
  let reverbIn = null;
  let reverbSend = null;
  let bufs = null;
  const beds = { wind: null, rain: null, water: null, sources: [] };
  const slots = [];
  const volumes = { master: 1, sfx: 1, music: 1, ambient: 1 };

  const limiter = createVoiceLimiter({ max: LIMITS.voices });
  let dying = [];
  const lastPlayed = new Map();

  // Dinleyici
  const L = { x: 0, y: 0, z: 0 };
  const basis = listenerBasis(0, null);
  let listenerDirty = true;

  // Ortam
  let mixTarget = ambientMix({});
  const mixCur = { ...mixTarget };
  let applyAcc = 1;
  const timers = { drip: Infinity, bird: Infinity, cricket: Infinity, frog: Infinity, lavaBubble: Infinity };

  // Müzik
  const composer = createMusicComposer({ rand });
  const mus = { params: pickMusicParams({}), pending: null, step: 0, next: 0, nodes: 0, tenseOn: false };
  const loop = {
    ctx: null, sfx: null, music: null, amb: null, white: null, brown: null, running: false, musicOn: true, lowPower: low,
    holdMusic(b) {
      const h = Boolean(b);
      if (h === musicHold) return;
      musicHold = h;
      mus.next = 0;
    },
  };

  /* ==============================================================================================
   * Bağlam ve veri yolu
   * ============================================================================================ */
  function ensure() {
    if (closed) return null;
    if (ctx) return ctx;
    const host = typeof window !== 'undefined' ? window : globalThis;
    const AC = host.AudioContext || host.webkitAudioContext;
    if (!AC) return null;
    try {
      try {
        ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        ctx = new AC();
      }
    } catch {
      ctx = null;
      return null;
    }
    try {
      build();
    } catch {
      try {
        ctx.close();
      } catch {
        // yut
      }
      ctx = null;
      closed = true;
      return null;
    }
    return ctx;
  }

  function gainNode(v) {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  }

  function noiseBuffer(kind, seconds, seed) {
    const len = Math.max(2, Math.floor(ctx.sampleRate * seconds));
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    fillNoise(b.getChannelData(0), kind, seed);
    return b;
  }

  function build() {
    master = gainNode(isMuted ? 0 : MASTER * volumes.master);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    master.connect(comp);
    comp.connect(ctx.destination);

    worldFilter = ctx.createBiquadFilter();
    worldFilter.type = 'lowpass';
    worldFilter.frequency.value = 20000;
    worldFilter.Q.value = 0.5;
    worldFilter.connect(master);

    sfxBus = gainNode(volumes.sfx);
    sfxBus.connect(worldFilter);
    ambBus = gainNode(AMBIENT * volumes.ambient);
    ambBus.connect(worldFilter);

    // Müzik: calm/tense → musicFilter → (kuru + yankı) → musicBus
    calmBus = gainNode(1);
    tenseBus = gainNode(0);
    musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 5000;
    musicFilter.Q.value = 0.4;
    musicBus = gainNode(musicEnabled ? MUSIC * volumes.music : 0);
    calmBus.connect(musicFilter);
    tenseBus.connect(musicFilter);
    musicFilter.connect(musicBus);
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.375;
    const echoSend = gainNode(0.32);
    const echoTone = ctx.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 2400;
    const feedback = gainNode(0.38);
    musicFilter.connect(echoSend);
    echoSend.connect(delay);
    delay.connect(echoTone);
    echoTone.connect(musicBus);
    echoTone.connect(feedback);
    feedback.connect(delay);
    musicBus.connect(worldFilter);

    // Yankı
    const conv = ctx.createConvolver();
    const imp = generateImpulse(ctx.sampleRate, LIMITS.impulse, 3.2);
    const ib = ctx.createBuffer(2, imp[0].length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      if (typeof ib.copyToChannel === 'function') ib.copyToChannel(imp[c], c);
      else ib.getChannelData(c).set(imp[c]);
    }
    conv.buffer = ib;
    reverbIn = gainNode(1);
    reverbIn.connect(conv);
    const reverbOut = gainNode(0.9);
    conv.connect(reverbOut);
    reverbOut.connect(worldFilter);
    reverbSend = gainNode(mixCur.reverb * 0.7);
    sfxBus.connect(reverbSend);
    reverbSend.connect(reverbIn);
    const ambSend = gainNode(0.25);
    ambBus.connect(ambSend);
    ambSend.connect(reverbIn);

    bufs = { white: noiseBuffer('white', 1.6, 98765), brown: noiseBuffer('brown', 2.4, 13579) };
    buildBeds();
    listenerDirty = true;
    applyListener();
  }

  function loopSource(buf) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start(0, rand() * buf.duration * 0.5 || 0);
    beds.sources.push(src);
    return src;
  }

  function lfo(hz, depth, param) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = hz;
    const g = gainNode(depth);
    o.connect(g);
    g.connect(param);
    o.start(0);
    beds.sources.push(o);
  }

  function buildBeds() {
    // Rüzgâr: kahverengi gürültü, süpürülen bant geçiren
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 520;
    wf.Q.value = 0.7;
    beds.wind = gainNode(0);
    loopSource(bufs.brown).connect(wf);
    wf.connect(beds.wind);
    beds.wind.connect(ambBus);
    lfo(0.11, 230, wf.frequency);
    // Yağmur: beyaz gürültü, parlak
    const rh = ctx.createBiquadFilter();
    rh.type = 'highpass';
    rh.frequency.value = 1300;
    const rl = ctx.createBiquadFilter();
    rl.type = 'lowpass';
    rl.frequency.value = 9000;
    beds.rain = gainNode(0);
    loopSource(bufs.white).connect(rh);
    rh.connect(rl);
    rl.connect(beds.rain);
    beds.rain.connect(ambBus);
    // Akan su
    const bw = ctx.createBiquadFilter();
    bw.type = 'bandpass';
    bw.frequency.value = 650;
    bw.Q.value = 0.9;
    beds.water = gainNode(0);
    loopSource(bufs.white).connect(bw);
    bw.connect(beds.water);
    beds.water.connect(ambBus);
    lfo(0.4, 140, bw.frequency);
  }

  const ready = () => Boolean(ctx) && !isMuted && !closed && ctx.state === 'running';

  /* ==============================================================================================
   * Dinleyici
   * ============================================================================================ */
  function setParam(p, v, t, tc = 0.015) {
    if (!p) return;
    if (typeof p.setTargetAtTime === 'function') p.setTargetAtTime(v, t, tc);
    else p.value = v;
  }

  function applyListener() {
    if (!ctx || !listenerDirty) return;
    listenerDirty = false;
    const l = ctx.listener;
    if (!l) return;
    const t = ctx.currentTime;
    try {
      if (l.positionX) {
        setParam(l.positionX, L.x, t);
        setParam(l.positionY, L.y, t);
        setParam(l.positionZ, L.z, t);
        setParam(l.forwardX, basis.fx, t);
        setParam(l.forwardY, basis.fy, t);
        setParam(l.forwardZ, basis.fz, t);
        setParam(l.upX, basis.ux, t);
        setParam(l.upY, basis.uy, t);
        setParam(l.upZ, basis.uz, t);
      } else {
        if (l.setPosition) l.setPosition(L.x, L.y, L.z);
        if (l.setOrientation) l.setOrientation(basis.fx, basis.fy, basis.fz, basis.ux, basis.uy, basis.uz);
      }
    } catch {
      // Eski tarayıcıda dinleyici ayarı başarısız olabilir; ses yine çalar.
    }
  }

  /* ==============================================================================================
   * Ses çalma
   * ============================================================================================ */
  function setPannerPos(p, x, y, z) {
    if (p.positionX) {
      p.positionX.value = x;
      p.positionY.value = y;
      p.positionZ.value = z;
    } else if (p.setPosition) {
      p.setPosition(x, y, z);
    }
  }

  function acquireSlot() {
    for (let i = 0; i < slots.length; i++) if (!slots[i].busy) return slots[i];
    if (slots.length >= LIMITS.hrtf || typeof ctx.createPanner !== 'function') return null;
    const node = ctx.createPanner();
    node.panningModel = 'HRTF';
    node.distanceModel = 'inverse';
    node.refDistance = 2;
    node.maxDistance = 100;
    node.rolloffFactor = 1.1;
    node.coneInnerAngle = 360;
    node.connect(sfxBus);
    const slot = { node, busy: false };
    slots.push(slot);
    return slot;
  }

  function releaseVoice(v) {
    try {
      v.gain.disconnect();
    } catch {
      // zaten bağlı değil
    }
    if (v.wet) {
      try {
        v.wet.disconnect();
      } catch {
        // yut
      }
    }
    if (v.st) {
      try {
        v.st.disconnect();
      } catch {
        // yut
      }
    }
    if (v.slot) v.slot.busy = false;
  }

  function fadeOut(v, t) {
    try {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setTargetAtTime(0, t, 0.012);
    } catch {
      // yut
    }
  }

  function sweepVoices(t) {
    const ended = limiter.sweep(t);
    for (let i = 0; i < ended.length; i++) releaseVoice(ended[i]);
    if (dying.length) {
      const keep = [];
      for (let i = 0; i < dying.length; i++) {
        if (dying[i].at <= t) releaseVoice(dying[i].v);
        else keep.push(dying[i]);
      }
      dying = keep;
    }
  }

  function killVoice(v, t) {
    limiter.remove(v);
    fadeOut(v, t);
    dying.push({ v, at: t + 0.08 });
  }

  function play(name, opts) {
    if (!ready()) return null;
    const o = opts || {};
    const r = resolveSound(name, o);
    if (!r) return null;
    const def = r.def;
    const t = ctx.currentTime;
    const last = lastPlayed.get(r.id);
    if (def.gap && last !== undefined && t - last < def.gap) return null;

    const spatial = Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.z);
    const dist = spatial ? Math.hypot(o.x - L.x, o.y - L.y, o.z - L.z) : 0;
    if (spatial && dist > def.r) return null;

    sweepVoices(t);
    const adm = limiter.admit({ priority: def.p, dist });
    if (!adm.ok) return null;
    if (adm.steal) killVoice(adm.steal, t);

    const jitter = def.r === Infinity ? 0.02 : 0.12;
    let pitch = (Number.isFinite(o.pitch) && o.pitch > 0 ? o.pitch : 1) * (1 + (rand() - 0.5) * jitter);
    if (o.foot !== undefined) pitch *= o.foot ? 1.04 : 0.96;
    const vol = clamp(Number.isFinite(o.vol) ? o.vol : 1, 0, 2) * (1 + (rand() - 0.5) * (jitter > 0.05 ? 0.2 : 0));

    const gain = gainNode(1);
    const voice = { id: r.id, priority: def.p, dist, startedAt: t, endAt: t + 0.1, gain, wet: null, slot: null, st: null };
    let amp = vol;
    let outNode = sfxBus;
    if (spatial) {
      const slot = acquireSlot();
      if (slot) {
        slot.busy = true;
        voice.slot = slot;
        setPannerPos(slot.node, o.x, o.y, o.z);
        outNode = slot.node;
      } else {
        amp *= distanceGain(dist, 2, 1.1, def.r);
        if (typeof ctx.createStereoPanner === 'function') {
          const st = ctx.createStereoPanner();
          st.pan.value = panFor(basis, L.x, L.y, L.z, o.x, o.y, o.z);
          st.connect(sfxBus);
          voice.st = st;
          outNode = st;
        }
      }
    }
    gain.gain.value = amp;
    gain.connect(outNode);
    if (def.wet > 0 && reverbIn) {
      const w = gainNode(def.wet);
      gain.connect(w);
      w.connect(reverbIn);
      voice.wet = w;
    }

    const synth = makeSynth(ctx, gain, bufs, { t0: t + 0.005, pitch, rand, maxNodes: LIMITS.nodes });
    try {
      r.fn(synth);
    } catch {
      // Ses hatası oyunu durdurmamalı.
    }
    if (synth.nodes === 0) {
      releaseVoice(voice);
      return null;
    }
    voice.endAt = synth.endAt + 0.05;
    limiter.add(voice);
    lastPlayed.set(r.id, t);
    if (lastPlayed.size > 200) lastPlayed.clear();
    return {
      stop() {
        const now = ctx ? ctx.currentTime : 0;
        fadeOut(voice, now);
        voice.endAt = Math.min(voice.endAt, now + 0.08);
      },
      setPosition(x, y, z) {
        if (voice.slot && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) setPannerPos(voice.slot.node, x, y, z);
      },
    };
  }

  /* ==============================================================================================
   * Ortam
   * ============================================================================================ */
  function applyMix() {
    const t = ctx.currentTime;
    setParam(beds.wind.gain, mixCur.wind * 0.5, t, 0.5);
    setParam(beds.rain.gain, mixCur.rain * 0.45, t, 0.5);
    setParam(beds.water.gain, mixCur.water * 0.4, t, 0.5);
    setParam(worldFilter.frequency, mixCur.lowpass, t, 0.25);
    setParam(reverbSend.gain, mixCur.reverb * 0.7, t, 0.4);
    const tense = clamp(mixCur.combat, 0, 1);
    setParam(tenseBus.gain, tense, t, 0.3);
    setParam(calmBus.gain, 1 - 0.5 * tense, t, 0.3);
  }

  function ambientShot(name, rMin, rMax, vol, yOff) {
    const a = rand() * Math.PI * 2;
    const rr = rMin + rand() * (rMax - rMin);
    play(name, { x: L.x + Math.cos(a) * rr, y: L.y + yOff, z: L.z + Math.sin(a) * rr, vol, pitch: 0.9 + rand() * 0.3 });
  }

  const SHOTS = {
    drip: () => ambientShot('drip', 3, 14, 0.8, -1),
    bird: () => ambientShot('bird', 8, 26, 0.7, 5),
    cricket: () => ambientShot('cricket', 4, 14, 0.8, -1),
    frog: () => ambientShot('frog', 4, 16, 0.8, -1),
    lavaBubble: () => ambientShot('lava', 2, 9, 0.8, -0.5),
  };

  function tickAmbientEvents(dt) {
    const keys = Object.keys(SHOTS);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const rate = mixCur[k];
      if (!(rate > 0.001)) {
        timers[k] = Infinity;
        continue;
      }
      if (!Number.isFinite(timers[k])) timers[k] = nextEventDelay(rate, rand);
      timers[k] -= dt;
      if (timers[k] <= 0) {
        SHOTS[k]();
        timers[k] = nextEventDelay(rate, rand);
      }
    }
  }

  /* ==============================================================================================
   * Müzik
   * ============================================================================================ */
  function track(osc) {
    mus.nodes++;
    osc.onended = () => {
      mus.nodes--;
    };
  }

  function note(type, f, t, attack, hold, release, vol, bus, extra) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (extra && extra.detune) o.detune.value = extra.detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    if (hold > 0) g.gain.setValueAtTime(Math.max(0.0002, vol), t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    let tail = o;
    if (extra && extra.lowpass) {
      const f2 = ctx.createBiquadFilter();
      f2.type = 'lowpass';
      f2.frequency.value = extra.lowpass;
      o.connect(f2);
      tail = f2;
    }
    tail.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + attack + hold + release + 0.05);
    track(o);
  }

  function playNote(ev, t, beat) {
    if (mus.nodes >= LIMITS.music) return;
    const dur = ev.beats * beat;
    switch (ev.kind) {
      case 'pad':
        note('triangle', ev.freq, t, 1.4, Math.max(0, dur - 2.4), 1.8, ev.vel * 0.1, calmBus);
        note('sine', ev.freq, t, 1.6, Math.max(0, dur - 2.6), 1.8, ev.vel * 0.07, calmBus, { detune: 7 });
        break;
      case 'bass':
        note('sine', ev.freq, t, 0.03, 0, Math.max(0.6, dur), ev.vel * 0.22, calmBus);
        note('triangle', ev.freq * 2, t, 0.03, 0, Math.max(0.4, dur * 0.6), ev.vel * 0.05, calmBus);
        break;
      case 'arp':
        note('triangle', ev.freq, t, 0.006, 0, Math.max(0.5, dur * 1.2), ev.vel * 0.2, calmBus);
        note('sine', ev.freq * 2, t, 0.006, 0, Math.max(0.3, dur * 0.7), ev.vel * 0.06, calmBus);
        break;
      case 'bell':
        note('sine', ev.freq, t, 0.004, 0, 2.6, ev.vel * 0.18, calmBus);
        note('sine', ev.freq * 2.76, t, 0.004, 0, 1.4, ev.vel * 0.06, calmBus);
        break;
      case 'tensePulse':
        note('sawtooth', ev.freq, t, 0.008, 0, 0.28, ev.vel * 0.2, tenseBus, { lowpass: 520 });
        note('sine', ev.freq, t, 0.008, 0, 0.35, ev.vel * 0.22, tenseBus);
        break;
      case 'tenseDrone':
        note('sawtooth', ev.freq, t, 0.9, Math.max(0, dur - 1.8), 0.9, ev.vel * 0.14, tenseBus, { lowpass: 240 });
        break;
      case 'tenseSting':
        note('sine', ev.freq, t, 0.01, 0, 1.6, ev.vel * 0.16, tenseBus);
        break;
      default:
        break;
    }
  }

  function adoptMusicParams() {
    if (!mus.pending) return;
    mus.params = mus.pending;
    mus.pending = null;
    if (musicFilter) setParam(musicFilter.frequency, 1800 + 6000 * mus.params.brightness, ctx.currentTime, 0.8);
  }

  function scheduleMusic() {
    const now = ctx.currentTime;
    if (mus.next === 0 || mus.next < now - 0.1) {
      mus.next = now + 0.06;
      mus.step = Math.ceil(mus.step / 8) * 8;
    }
    const tenseWanted = mixTarget.combat > 0.02 || mixCur.combat > 0.03;
    const ahead = now + SCHEDULE_AHEAD;
    let guard = 0;
    while (mus.next < ahead && guard++ < 16) {
      if (mus.step % 8 === 0) adoptMusicParams();
      mus.params.tense = tenseWanted;
      const beat = 60 / mus.params.bpm;
      const evs = composer.next(mus.step, mus.params);
      for (let i = 0; i < evs.length; i++) {
        const ev = evs[i];
        if (ev.kind.indexOf('tense') === 0 && mixCur.combat < 0.03) continue;
        playNote(ev, mus.next + ev.delay, beat);
      }
      mus.next += stepSeconds(mus.params.bpm);
      mus.step++;
    }
  }

  function musicTargetFor(mix) {
    return pickMusicParams({
      zone: mix.zone, night: mix.night, underground: mix.underground, combat: mix.combat, biome: mix.biome,
    });
  }

  function sameMusic(a, b) {
    return a.root === b.root && a.scaleName === b.scaleName && Math.abs(a.bpm - b.bpm) < 0.5 && Math.abs(a.density - b.density) < 0.01;
  }

  /* ==============================================================================================
   * Bağlam yaşam döngüsü
   * ============================================================================================ */
  function silentUnlock() {
    if (silentUnlocked || !ctx) return;
    silentUnlocked = true;
    try {
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch {
      // yut
    }
  }

  function resumeCtx() {
    if (!ctx || isMuted || closed) return;
    if (canResume(ctx)) {
      try {
        const p = ctx.resume();
        if (p && typeof p.then === 'function') p.then(checkRunning, () => {});
        else checkRunning();
      } catch {
        // yut
      }
    } else {
      checkRunning();
    }
  }

  function suspendCtx() {
    if (ctx && ctx.state === 'running') {
      try {
        const p = ctx.suspend();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        // yut
      }
    }
  }

  const doc = typeof document !== 'undefined' ? document : null;
  let gestureHooked = false;

  function onGesture() {
    if (closed) return;
    if (isMuted) return;
    unlock();
  }

  function checkRunning() {
    if (ctx && ctx.state === 'running') unhookGestures();
  }

  function hookGestures() {
    if (!doc || gestureHooked) return;
    gestureHooked = true;
    GESTURE_EVENTS.forEach((n) => doc.addEventListener(n, onGesture, { capture: true, passive: true }));
  }

  function unhookGestures() {
    if (!doc || !gestureHooked) return;
    gestureHooked = false;
    GESTURE_EVENTS.forEach((n) => doc.removeEventListener(n, onGesture, { capture: true }));
  }

  function onVisibility() {
    if (!doc) return;
    if (doc.hidden) {
      hiddenSuspended = true;
      suspendCtx();
    } else {
      hiddenSuspended = false;
      if (!userSuspended) resumeCtx();
    }
  }

  function unlock() {
    if (isMuted || closed) return;
    const c = ensure();
    if (!c) return;
    if (userSuspended || hiddenSuspended) return;
    silentUnlock();
    resumeCtx();
  }

  if (doc) {
    hookGestures();
    doc.addEventListener('visibilitychange', onVisibility);
  }

  /* ==============================================================================================
   * Genel API
   * ============================================================================================ */
  return {
    unlock,
    play,

    /** Bağlamı askıya alır (duraklatma menüsü); resume() ile sürer. */
    suspend() {
      userSuspended = true;
      suspendCtx();
    },
    resume() {
      userSuspended = false;
      if (!hiddenSuspended) resumeCtx();
    },

    setMuted(m) {
      isMuted = Boolean(m);
      if (isMuted) {
        if (master) setParam(master.gain, 0, ctx.currentTime, 0.02);
        suspendCtx();
      } else {
        const c = ensure();
        if (c) {
          setParam(master.gain, MASTER * volumes.master, c.currentTime, 0.03);
          if (!userSuspended && !hiddenSuspended) resumeCtx();
          mus.next = 0;
        }
      }
    },

    setMusicEnabled(on) {
      const next = Boolean(on);
      if (next === musicEnabled) return;
      musicEnabled = next;
      if (musicBus) setParam(musicBus.gain, next ? MUSIC * volumes.music : 0, ctx.currentTime, 0.4);
      mus.next = 0;
    },
    isMusicEnabled: () => musicEnabled,
    isMuted: () => isMuted,

    /** { master, sfx, music, ambient } 0..1 */
    setVolumes(v) {
      const x = v || {};
      ['master', 'sfx', 'music', 'ambient'].forEach((k) => {
        if (Number.isFinite(x[k])) volumes[k] = clamp(x[k], 0, 1);
      });
      if (!ctx) return;
      const t = ctx.currentTime;
      if (!isMuted) setParam(master.gain, MASTER * volumes.master, t, 0.05);
      setParam(sfxBus.gain, volumes.sfx, t, 0.05);
      setParam(ambBus.gain, AMBIENT * volumes.ambient, t, 0.05);
      if (musicEnabled) setParam(musicBus.gain, MUSIC * volumes.music, t, 0.05);
    },

    /** pos {x,y,z}; ikinci argüman yaw (sayı) ya da ileri vektör; üçüncü yukarı vektörü (isteğe bağlı). */
    setListener(pos, yawOrForward, up) {
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)) {
        if (Math.abs(pos.x - L.x) + Math.abs(pos.y - L.y) + Math.abs(pos.z - L.z) > 1e-4) listenerDirty = true;
        L.x = pos.x;
        L.y = pos.y;
        L.z = pos.z;
      }
      if (yawOrForward !== undefined) {
        const px = basis.fx;
        const pz = basis.fz;
        const py = basis.fy;
        listenerBasis(yawOrForward, up, basis);
        if (Math.abs(basis.fx - px) + Math.abs(basis.fy - py) + Math.abs(basis.fz - pz) > 1e-4) listenerDirty = true;
      }
      applyListener();
    },

    setAmbient(amb) {
      mixTarget = ambientMix(amb);
      const mp = musicTargetFor(mixTarget);
      const cmp = mus.pending || mus.params;
      if (!sameMusic(cmp, mp)) mus.pending = mp;
      const wasTense = mus.tenseOn;
      mus.tenseOn = mixTarget.combat > 0.02;
      if (mus.tenseOn && !wasTense && ready() && musicEnabled) {
        // Savaş başladığında bir sonraki ölçüyü bekleme: hemen alçak vuruş + çınlama.
        const t = ctx.currentTime + 0.05;
        const beat = 60 / mus.params.bpm;
        playNote({ kind: 'tenseDrone', freq: 55, beats: 8, vel: 0.5 }, t, beat);
        playNote({ kind: 'tensePulse', freq: 55, beats: 0.5, vel: 0.7 }, t, beat);
        playNote({ kind: 'tenseSting', freq: 523.25 * 1.0595, beats: 3, vel: 0.3 }, t, beat);
      }
      applyAcc = 1;
    },

    /** Her karede çağır: bitmiş sesleri temizler, ortam olaylarını ve müziği zamanlar. */
    update(dt) {
      if (!ctx || closed) return;
      const step = Number.isFinite(dt) ? clamp(dt, 0, 0.25) : 0.016;
      sweepVoices(ctx.currentTime);
      if (!ready()) return;
      blendMix(mixCur, mixTarget, 1 - Math.exp(-step / 0.9));
      applyAcc += step;
      if (applyAcc >= 0.2) {
        applyAcc = 0;
        applyMix();
      }
      tickAmbientEvents(step);
      if (musicEnabled && !musicHold) {
        try {
          scheduleMusic();
        } catch {
          // Müzik hatası oyunu durdurmamalı.
        }
      }
    },

    getStats() {
      return { state: ctx ? ctx.state : 'none', voices: limiter.count, musicNodes: mus.nodes, hrtfSlots: slots.length, lowPower: low, musicHold };
    },

    /**
     * Döngü/akış sesleri (araç motoru, radyo) için ortak bağlam. Bağlam henüz yoksa (ilk kullanıcı jestinden önce) null; ASLA bağlam
     * kurmaz (otomatik oynatma yok). Dönen nesne kararlıdır, her çağrıda alanları tazelenir:
     * {ctx, sfx, music, amb, white, brown, running, musicOn, lowPower, holdMusic(b)}. running=false (sessiz/gizli sekme/askıda) iken
     * çağıran tüm kaynaklarını bırakmalıdır.
     */
    getLoopContext() {
      if (!ctx || closed || !bufs) return null;
      loop.ctx = ctx;
      loop.sfx = sfxBus;
      loop.music = musicBus;
      loop.amb = ambBus;
      loop.white = bufs.white;
      loop.brown = bufs.brown;
      loop.running = !isMuted && !userSuspended && !hiddenSuspended && ctx.state === 'running';
      loop.musicOn = musicEnabled;
      loop.lowPower = low;
      return loop;
    },

    dispose() {
      if (closed) return;
      closed = true;
      unhookGestures();
      if (doc) doc.removeEventListener('visibilitychange', onVisibility);
      limiter.clear();
      dying = [];
      beds.sources.forEach((s) => {
        try {
          s.stop();
        } catch {
          // yut
        }
      });
      beds.sources.length = 0;
      slots.length = 0;
      if (ctx) {
        const c = ctx;
        ctx = null;
        try {
          const p = c.close();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch {
          // yut
        }
      }
    },
  };
}
