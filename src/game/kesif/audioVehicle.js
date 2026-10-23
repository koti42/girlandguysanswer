/*
 * KEŞİF ses — ARAÇ SESLERİ (Neon Meridyen Faz 3, paket vehicle_audio). Prosedürel WebAudio; dosya yok. audio.js `getLoopContext()` bağlamını kullanır
 * (ASLA kendi AudioContext'ini kurmaz → ilk kullanıcı jestinden önce hiçbir şey çalmaz). Sözleşme §9, §17; tasarım design_vehicles.md §6.
 *
 *   const va = createVehicleAudio({ getLoop, nodeCap })          getLoop: () => audio.getLoopContext() | null
 *   va.update(dt, st)        her karede. st = {
 *                              v: oyuncu aracı (vehiclePhysics durumu: cls rpm gear throttle aLong shiftT skid nitroOn steer u hazardT inWater def) | null,
 *                              wet: 0..1 (ıslak yol), listener: {x,y,z,yaw,vx?,vz?}, traffic: [{id,x,z,vx,vz}] , trafficN: sayı }
 *   va.event(type, data)     'bump' {impact,soft} 'scrape' {impact} 'land' {impact} 'shift' {from,to} 'hop' 'splash' 'horn' {variant}
 *                            'nitroStart' 'driftBoost' 'door' {open} 'trafficHonk' {id,x,z} (uzamsal korna)     (diğer türler yok sayılır)
 *   va.setNodeCap(n)        ses kaynağı düğümü tavanı (24/18/12; yüksek/orta/düşük kademe)
 *   va.halt()               tüm kaynakları anında bırak (sessiz / gizli sekme); update() yeniden kurar
 *   va.getStats()           {sources, peak, cap, running, player, trafficVoices, plan, shots}      va.dispose()
 *
 * Düğüm tavanı: kit.count (osilatör + tampon kaynağı) HİÇBİR ZAMAN cap'i aşmaz (audioNodeKit fırlatır). Oyuncu motoru (testere + kare + turbo +
 * beyaz + kahverengi gürültü ≤5), ≤3 trafik sesi × 2 osilatör, kalan tek atımlıklar (çarpma, korna, kapı, tık). Düşük tavanda özellikler kapanır.
 * Motor: rpm→frekans SIKI tekdüze (audioVehicleMath.engineFreq), yük arttıkça parlak/rasp, vites boşalmasında düşüş, kayma = bandgeçiren gürültü,
 * ıslak yolda tıslama, hıza göre rüzgâr, elektrikli (hover) sınıflarda sinüs vızıltısı. Trafik: havuzlu sesler, mesafe + Doppler + pan.
 */
import { createNodeKit } from './audioNodeKit.js';
import { listenerBasis } from './audioMix.js';
import {
  NODE_CAP_BY_TIER, TRAFFIC_MAX_DIST, bumpMix, createIndicator, dopplerRatio, doorSpec, engineLoad, engineMix, engineSpec, hornSpec, ignitionSpec,
  landMix, nitroLevel, panOf, pickNearest, scrapeMix, skidMix, tierPlan, trafficFreq, trafficGain, windMix, wetHiss,
} from './audioVehicleMath.js';

export { NODE_CAP_BY_TIER };

const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const PARAM_TC = 0.05;
const MAX_ENV = 0.0001;
const START_SEC = 0.7;
const PARAM_EVERY = 1 / 30;
const IDLE_DROP_SEC = 4;
const MAX_QUEUE = 8;
/** Kabin motor sesi düzeyi: ölçüm (OfflineAudioContext): motor ≈ −19 dBFS RMS, radyodan ~5 dB yüksek. */
const ENGINE_LEVEL = 1.7;
const WARM_VEHICLE = {
  cls: 'taksi', rpm: 0.3, throttle: 0.2, shiftT: 0, skid: 0, vx: 0, vz: -3, nitroOn: false, aLong: 0, inWater: false, def: { max: 28, hover: 0, accel: 10 },
};

function setT(param, v, t, tc) {
  if (!param) return;
  if (typeof param.setTargetAtTime === 'function') param.setTargetAtTime(v, t, tc === undefined ? PARAM_TC : tc);
  else param.value = v;
}

/** Oyuncu motoru için gereken kaynak sayısı (testere + beyaz [+ kare] [+ kahverengi] [+ turbo]). */
export function playerSourceCount(cls, plan) {
  const s = engineSpec(cls);
  return 2 + (plan.player.sq ? 1 : 0) + (plan.player.brown ? 1 : 0) + (plan.player.turbo && s.turbo ? 1 : 0);
}

export function createVehicleAudio({ getLoop, nodeCap = NODE_CAP_BY_TIER.high } = {}) {
  const kit = createNodeKit({ cap: nodeCap });
  let plan = tierPlan(nodeCap);
  let loop = null;
  let ctx = null;
  let running = false;
  let disposed = false;

  let drivenV = null; // oyuncu aracı (kimlik karşılaştırma)
  let player = null; // kurulu motor sesi
  let playerRetry = 0;
  let paramAcc = 0;
  const mix = {};
  const skid = {};
  const hiss = {};
  const wind = {};
  const indicator = createIndicator();
  let tickFlip = false;
  const lastShot = Object.create(null);
  const basis = listenerBasis(0, null);
  const stats = { shots: 0, shotsDropped: 0, rebuilds: 0 };

  let quiet = false; // ısınma geçişi: sesler sıfır düzeyde kurulur
  let warmStep = 0;
  const queue = []; // ertelenmiş tek atımlıklar (kare başına en çok 1 kurulum)
  let listenerSeen = false;
  const lastListener = { x: 0, z: 0 };
  const tv = {
    voices: [], pick: [], prevIds: [], active: 0, idleT: 0,
  };

  /* ----------------------------------------------------------------------------------------------
   * Oyuncu motoru
   * -------------------------------------------------------------------------------------------- */
  function buildPlayer(v) {
    const cls = v.cls;
    const spec = engineSpec(cls);
    const need = playerSourceCount(cls, plan);
    if (!kit.canTake(need)) return null;
    const g = kit.group('player');
    try {
      const out = g.gain(0);
      out.connect(loop.sfx);
      g.out = out;
      const eng = g.gain(1);
      eng.connect(out);
      const lp = g.filter('lowpass', 900, 0.6);
      lp.connect(eng);
      const sawG = g.gain(0);
      sawG.connect(lp);
      const saw = g.osc(spec.electric ? 'sine' : 'sawtooth', spec.lo);
      saw.connect(sawG);
      let sq = null;
      let sqG = null;
      if (plan.player.sq) {
        sqG = g.gain(0);
        sqG.connect(lp);
        sq = g.osc(spec.electric ? 'triangle' : 'square', spec.lo * 2);
        sq.connect(sqG);
      }
      const white = g.noise(loop.white);
      const ifl = g.filter('lowpass', 700, 0.5);
      const ig = g.gain(0);
      white.connect(ifl);
      ifl.connect(ig);
      ig.connect(eng);
      const sf = g.filter('bandpass', 1900, 6);
      const sg = g.gain(0);
      white.connect(sf);
      sf.connect(sg);
      sg.connect(out);
      const hf = g.filter('highpass', 3000, 0.7);
      const hg = g.gain(0);
      white.connect(hf);
      hf.connect(hg);
      hg.connect(out);
      const nf = g.filter('bandpass', 900, 1.2);
      const ng = g.gain(0);
      white.connect(nf);
      nf.connect(ng);
      ng.connect(out);
      const wf = g.filter('lowpass', 500, 0.5);
      const wg = g.gain(0);
      if (plan.player.brown) {
        const brown = g.noise(loop.brown);
        brown.connect(wf);
      } else {
        white.connect(wf);
      }
      wf.connect(wg);
      wg.connect(out);
      let tosc = null;
      let tg = null;
      if (plan.player.turbo && spec.turbo) {
        tg = g.gain(0);
        tg.connect(out);
        tosc = g.osc('sine', spec.lo * 8);
        tosc.connect(tg);
      }
      const t = ctx.currentTime;
      setT(out.gain, ENGINE_LEVEL, t, 0.08);
      return {
        g, v, cls, startT: 0, spec, nodes: { out, lp, saw, sawG, sq, sqG, ig, sf, sg, hf, hg, nf, ng, wf, wg, tosc, tg },
      };
    } catch {
      g.destroy();
      return null;
    }
  }

  function applyPlayer(p, v, wet) {
    const t = ctx.currentTime;
    const n = p.nodes;
    const d = v.def || null;
    const sp = Math.sqrt(num(v.vx, 0) * num(v.vx, 0) + num(v.vz, 0) * num(v.vz, 0));
    const e = clamp(p.startT / START_SEC, 0, 1);
    const ease = e * e * (3 - 2 * e);
    const rpm = num(v.rpm, 0.2) * ease;
    const load = engineLoad(v);
    engineMix(p.cls, rpm, v.throttle, load, v.shiftT, mix);
    const water = v.inWater ? 0.35 : 1;
    setT(n.saw.frequency, mix.humF, t);
    setT(n.sawG.gain, (mix.electric ? mix.humG : mix.sawG) * ease, t);
    if (n.sq) {
      setT(n.sq.frequency, mix.f * 2, t);
      setT(n.sqG.gain, mix.sqG * ease, t);
    }
    setT(n.lp.frequency, mix.lpHz * water, t);
    setT(n.ig.gain, mix.noiseG * ease, t);
    if (n.tosc) {
      setT(n.tosc.frequency, mix.turboF, t);
      setT(n.tg.gain, mix.turboG, t);
    }
    const max = d ? d.max : 30;
    skidMix(v.skid, sp, p.cls, skid);
    setT(n.sg.gain, skid.gain, t);
    setT(n.sf.frequency, skid.freq, t, 0.08);
    n.sf.Q.value = skid.q;
    wetHiss(wet, sp, max, hiss);
    setT(n.hg.gain, hiss.gain, t);
    setT(n.hf.frequency, hiss.hpHz, t, 0.2);
    windMix(sp, max, d ? d.hover > 0 : false, wind);
    setT(n.wg.gain, plan.player.brown ? wind.gain : wind.gain * 0.7, t);
    setT(n.wf.frequency, wind.lpHz, t, 0.1);
    setT(n.ng.gain, nitroLevel(v.nitroOn, sp, max), t, 0.06);
    setT(n.nf.frequency, 700 + 1800 * clamp(sp / Math.max(1, max), 0, 1), t, 0.1);
  }

  function stopPlayer(fade) {
    if (player) {
      player.g.dispose(fade === undefined ? 0.25 : fade);
      player = null;
    }
  }

  /* ----------------------------------------------------------------------------------------------
   * Tek atımlık sesler
   * -------------------------------------------------------------------------------------------- */
  function persistentPlanned() {
    let n = 0;
    if (drivenV) n += playerSourceCount(drivenV.cls, plan);
    n += tv.active * 2;
    return n;
  }

  function persistentLive() {
    let n = player ? playerSourceCount(player.cls, plan) : 0;
    n += tv.voices.length * 2;
    return n;
  }

  /** n kaynaklık tek atımlık için yer var mı: kalıcı seslerin ayrılmış payı korunur. */
  function shotRoom(n) {
    const missing = Math.max(0, persistentPlanned() - persistentLive());
    return kit.count + n + missing <= kit.cap;
  }

  function gap(kind, sec) {
    const t = ctx.currentTime;
    const last = lastShot[kind];
    if (last !== undefined && t - last < sec) return false;
    lastShot[kind] = t;
    return true;
  }

  function env(g, gain, t0, att, dur) {
    g.gain.setValueAtTime(MAX_ENV, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(MAX_ENV * 2, quiet ? 0 : gain), t0 + att);
    g.gain.exponentialRampToValueAtTime(MAX_ENV, t0 + dur);
  }

  /** Düşen/yükselen sinüs vuruşu (1 kaynak). */
  function thump(f0, f1, gain, dur, delay, type) {
    if (!shotRoom(1)) return false;
    const t0 = ctx.currentTime + delay;
    const g = kit.group('thump');
    try {
      const out = g.gain(MAX_ENV);
      out.connect(loop.sfx);
      const o = g.osc(type || 'sine', f0, t0);
      o.connect(out);
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      env(out, gain, t0, 0.006, dur);
      g.finish(t0 + dur + 0.03);
      return true;
    } catch {
      g.destroy();
      return false;
    }
  }

  /** Süzülmüş gürültü patlaması (1 kaynak): lowpass/bandpass, isteğe bağlı frekans süpürmesi. */
  function burst(filterType, f0, f1, q, gain, dur, delay) {
    if (!shotRoom(1)) return false;
    const t0 = ctx.currentTime + delay;
    const g = kit.group('burst');
    try {
      const out = g.gain(MAX_ENV);
      out.connect(loop.sfx);
      const f = g.filter(filterType, f0, q);
      f.connect(out);
      const n = g.noise(loop.white, t0);
      n.connect(f);
      f.frequency.setValueAtTime(f0, t0);
      f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      env(out, gain, t0, 0.01, dur);
      g.finish(t0 + dur + 0.03);
      return true;
    } catch {
      g.destroy();
      return false;
    }
  }

  /** Kısa nota/tık (1 kaynak). */
  function beep(type, f, gain, dur, delay) {
    if (!shotRoom(1)) return false;
    const t0 = ctx.currentTime + delay;
    const g = kit.group('beep');
    try {
      const out = g.gain(MAX_ENV);
      out.connect(loop.sfx);
      const o = g.osc(type, f, t0);
      o.connect(out);
      env(out, gain, t0, 0.004, dur);
      g.finish(t0 + dur + 0.03);
      return true;
    } catch {
      g.destroy();
      return false;
    }
  }

  /** Korna: iki yumuşak ton (2 kaynak), garaj `horn` 0..3. */
  /** mul: düzey çarpanı (uzak korna), pan: yoksa kabin (merkez), varsa −1..1 (trafik kornası). */
  function horn(variant, mul, pan, key) {
    if (!shotRoom(2) || !gap(key || 'horn', 0.14)) return false;
    const h = hornSpec(variant);
    const m = mul === undefined ? 1 : mul;
    const t0 = ctx.currentTime;
    const g = kit.group('horn');
    try {
      const out = g.gain(MAX_ENV);
      const sp = pan === undefined ? null : g.stereo();
      if (sp) {
        sp.pan.value = pan;
        out.connect(sp);
        sp.connect(loop.sfx);
      } else out.connect(loop.sfx);
      const lp = g.filter('lowpass', 2400, 0.5);
      lp.connect(out);
      const a = g.osc(h.type, h.a, t0);
      const b = g.osc(h.type, h.b, t0);
      a.connect(lp);
      b.connect(lp);
      const step = h.dur + h.gap;
      out.gain.setValueAtTime(MAX_ENV, t0);
      for (let i = 0; i < h.count; i++) {
        const s = t0 + i * step;
        out.gain.setValueAtTime(MAX_ENV, s);
        const pk = Math.max(MAX_ENV * 2, quiet ? 0 : h.gain * m);
        out.gain.exponentialRampToValueAtTime(pk, s + 0.012);
        out.gain.setValueAtTime(pk, s + h.dur * (h.bell ? 0.2 : 0.8));
        out.gain.exponentialRampToValueAtTime(MAX_ENV, s + h.dur);
        if (h.riseB && i > 0) b.frequency.setValueAtTime(h.b * h.riseB, s);
      }
      g.finish(t0 + h.count * step + 0.05);
      return true;
    } catch {
      g.destroy();
      return false;
    }
  }

  /** Trafik kornası (uzamsal): mesafe sönümü + pan; yumuşak çift ton (araç kimliğine göre 4 varyant). */
  function honkAt(x, z, id) {
    const L = lastListener;
    if (!listenerSeen) return false;
    const dist = Math.sqrt((num(x, 0) - L.x) * (num(x, 0) - L.x) + (num(z, 0) - L.z) * (num(z, 0) - L.z));
    const mul = trafficGain(dist);
    if (!(mul > 0.02)) return false;
    return horn(((num(id, 0) | 0) >>> 0) % 4, Math.min(1.2, mul * 0.9), panOf(basis, L.x, L.z, num(x, 0), num(z, 0)), 'honkAt');
  }

  function bump(impact, soft) {
    if (!gap('bump', 0.09)) return false;
    const m = bumpMix(impact, soft);
    const a = thump(m.thumpF0, m.thumpF1, m.thumpG, m.dur, 0);
    const b = burst('lowpass', m.lpHz, 220, 0.7, m.noiseG, m.dur * 0.8, 0);
    return a || b;
  }

  function scrape(impact) {
    if (!gap('scrape', 0.2)) return false;
    const m = scrapeMix(impact);
    return burst('bandpass', m.f0, m.f1, m.q, m.gain, m.dur, 0);
  }

  function land(impact) {
    if (!gap('land', 0.15)) return false;
    const m = landMix(impact);
    return thump(m.f0, m.f1, m.gain, m.dur, 0);
  }

  function door(open, delay) {
    const d = doorSpec(open);
    const a = thump(d.f0, d.f1, d.g, d.dur, delay);
    const b = beep('square', d.clickF, d.clickG, 0.025, delay + 0.005);
    return a || b;
  }

  function ignition(cls, delay) {
    const sp = ignitionSpec(cls);
    if (sp.kind === 'power') return thump(sp.f0, sp.f1, sp.gain, sp.dur, delay, 'triangle');
    if (!shotRoom(1)) return false;
    const t0 = ctx.currentTime + delay;
    const g = kit.group('crank');
    try {
      const out = g.gain(MAX_ENV);
      out.connect(loop.sfx);
      const lp = g.filter('lowpass', 520, 0.8);
      lp.connect(out);
      const o = g.osc('sawtooth', sp.f0, t0);
      o.connect(lp);
      o.frequency.setValueAtTime(sp.f0, t0);
      o.frequency.linearRampToValueAtTime(sp.f1, t0 + sp.dur);
      env(out, sp.gain, t0, 0.05, sp.dur);
      g.finish(t0 + sp.dur + 0.03);
      return true;
    } catch {
      g.destroy();
      return false;
    }
  }

  function tick() {
    tickFlip = !tickFlip;
    return beep('square', tickFlip ? 1250 : 980, 0.05, 0.022, 0);
  }

  /* ----------------------------------------------------------------------------------------------
   * Trafik (havuzlu, uzamsal)
   * -------------------------------------------------------------------------------------------- */
  function buildTrafficVoice() {
    if (!kit.canTake(2) || !shotRoomForTraffic()) return null;
    const g = kit.group('traffic');
    try {
      const out = g.gain(0);
      const pan = g.stereo();
      if (pan) {
        out.connect(pan);
        pan.connect(loop.sfx);
      } else out.connect(loop.sfx);
      const lp = g.filter('lowpass', 900, 0.6);
      lp.connect(out);
      const a = g.osc('sawtooth', 70);
      const b = g.osc('square', 140);
      const bg = g.gain(0.35);
      a.connect(lp);
      b.connect(bg);
      bg.connect(lp);
      return {
        g, out, pan, lp, a, b, id: -1, gain: 0,
      };
    } catch {
      g.destroy();
      return null;
    }
  }

  function shotRoomForTraffic() {
    return kit.count + 2 <= kit.cap;
  }

  function applyTraffic(dt, st) {
    const want = clamp(plan.traffic, 0, 6);
    tv.active = want;
    const list = st && st.traffic ? st.traffic : null;
    const n = st && list ? Math.min(list.length, num(st.trafficN, list.length)) : 0;
    const L = st && st.listener ? st.listener : null;
    if (!list || n <= 0 || want <= 0 || !L) {
      // trafik yok: sesler sönük; 4 sn sonra havuz tamamen bırakılır (boşta osilatör yok)
      tv.idleT += dt;
      if (tv.idleT > IDLE_DROP_SEC && tv.voices.length > 0) {
        dropTraffic();
        return;
      }
      for (let i = 0; i < tv.voices.length; i++) {
        const vo = tv.voices[i];
        setT(vo.out.gain, 0, ctx.currentTime, 0.1);
        vo.id = -1;
      }
      tv.prevIds.length = 0;
      return;
    }
    const k = pickNearest(list, n, want, num(L.x, 0), num(L.z, 0), TRAFFIC_MAX_DIST, tv.prevIds, tv.pick);
    tv.idleT = k > 0 ? 0 : tv.idleT + dt;
    if (k === 0 && tv.idleT > IDLE_DROP_SEC && tv.voices.length > 0) {
      dropTraffic();
      return;
    }
    while (tv.voices.length < Math.min(want, k)) {
      const vo = buildTrafficVoice();
      if (!vo) break;
      tv.voices.push(vo);
    }
    const t = ctx.currentTime;
    tv.prevIds.length = 0;
    for (let i = 0; i < tv.voices.length; i++) {
      const vo = tv.voices[i];
      if (i >= k) {
        setT(vo.out.gain, 0, t, 0.1);
        vo.id = -1;
        continue;
      }
      const c = list[tv.pick[i]];
      const dx = num(c.x, 0) - num(L.x, 0);
      const dz = num(c.z, 0) - num(L.z, 0);
      const dist = Math.sqrt(dx * dx + dz * dz);
      const vx = num(c.vx, 0);
      const vz = num(c.vz, 0);
      const speed = Math.sqrt(vx * vx + vz * vz);
      // yaklaşma hızı: göreli konum · göreli hız (dinleyici hızı dahil)
      const rvx = vx - num(L.vx, 0);
      const rvz = vz - num(L.vz, 0);
      const closing = dist > 0.5 ? -(dx * rvx + dz * rvz) / dist : 0;
      const f = trafficFreq(c.id, speed) * dopplerRatio(closing);
      const g = trafficGain(dist) * 0.1 * (0.45 + 0.55 * clamp(speed / 12, 0, 1));
      setT(vo.a.frequency, f, t, 0.08);
      setT(vo.b.frequency, f * 2, t, 0.08);
      setT(vo.lp.frequency, 450 + 30 * speed, t, 0.1);
      setT(vo.out.gain, g, t, 0.1);
      if (vo.pan) setT(vo.pan.pan, panOf(basis, num(L.x, 0), num(L.z, 0), num(c.x, 0), num(c.z, 0)), t, 0.06);
      vo.id = c.id;
      tv.prevIds.push(c.id);
    }
  }

  function dropTraffic() {
    for (let i = 0; i < tv.voices.length; i++) tv.voices[i].g.destroy();
    tv.voices.length = 0;
    tv.prevIds.length = 0;
  }

  /* ----------------------------------------------------------------------------------------------
   * Döngü
   * -------------------------------------------------------------------------------------------- */
  function defer(now, delay, f) {
    if (queue.length < MAX_QUEUE) queue.push({ at: now + delay, f });
  }

  /** Hazır olanlardan kare başına yalnız BİRİNİ kurar (enter anındaki kurulum yükü kareye yayılır). */
  function runQueue(now) {
    if (queue.length === 0) return;
    while (queue.length > 0 && queue[0].at < now - 0.4) queue.shift(); // bayatlayanlar atılır
    let k = -1;
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].at - now < 0.08) {
        k = i;
        break;
      }
    }
    if (k < 0) return;
    const e = queue.splice(k, 1)[0];
    e.f(Math.max(0, e.at - now));
  }

  /**
   * Isınma: bağlam ilk çalıştığında (şehre girişte/jestte, araca binmeden önce) sessiz bir motor + tek atımlıklar + trafik sesi kurup bırakır;
   * ilk gerçek binişteki ~10–15 ms takılma (soğuk JIT + ilk düğüm kurulumu) kalmaz. İki karaya yayılır; sıfır düzeyde, duyulmaz.
   */
  function warm() {
    quiet = true;
    try {
      if (warmStep === 0) {
        const p = buildPlayer(WARM_VEHICLE);
        if (p) {
          p.startT = 1;
          applyPlayer(p, WARM_VEHICLE, 0);
          p.g.destroy();
        }
        warmStep = 1;
      } else {
        door(true, 0);
        ignition('taksi', 0.02);
        tick();
        horn(0, 1, undefined, 'warm');
        bump(8, false);
        const tvo = buildTrafficVoice();
        if (tvo) tvo.g.destroy();
        warmStep = 2;
      }
    } finally {
      quiet = false;
    }
  }

  function halt() {
    queue.length = 0;
    kit.destroyAll();
    player = null;
    tv.voices.length = 0;
    tv.prevIds.length = 0;
    indicator.reset();
  }

  function rebuildForPlan() {
    stopPlayer(0.05);
    dropTraffic();
    stats.rebuilds++;
    playerRetry = 0;
  }

  const api = {
    update(dt0, st) {
      if (disposed) return;
      const dt = clamp(num(dt0, 0.016), 0, 0.25);
      loop = typeof getLoop === 'function' ? getLoop() : null;
      if (!loop || !loop.ctx || !loop.running) {
        if (running || kit.count > 0 || kit.groups > 0) halt();
        running = false;
        ctx = null;
        return;
      }
      if (kit.ctx !== loop.ctx) {
        kit.setContext(loop.ctx);
        player = null;
        tv.voices.length = 0;
        warmStep = 0;
        queue.length = 0;
      }
      ctx = loop.ctx;
      running = true;
      const now = ctx.currentTime;
      kit.sweep(now);
      runQueue(now);
      if (warmStep < 2 && !(st && st.v)) warm();

      const v = st && st.v ? st.v : null;
      // enter / exit geçişleri
      if (v !== drivenV) {
        const had = drivenV;
        drivenV = v;
        if (v) {
          stopPlayer(0.05);
          playerRetry = 0;
          defer(now, 0, (d) => door(true, d));
          defer(now, 0.28, (d) => door(false, d));
          defer(now, 0.42, (d) => ignition(v.cls, d));
          indicator.reset();
        } else if (had) {
          stopPlayer(0.3);
          defer(now, 0.05, (d) => door(true, d));
          defer(now, 0.42, (d) => door(false, d));
          indicator.reset();
        }
      }
      if (st && st.listener) {
        listenerBasis(num(st.listener.yaw, 0), null, basis);
        lastListener.x = num(st.listener.x, 0);
        lastListener.z = num(st.listener.z, 0);
        listenerSeen = true;
      }

      if (drivenV) {
        if (!player) {
          playerRetry -= dt;
          if (playerRetry <= 0) {
            player = buildPlayer(drivenV);
            playerRetry = player ? 0 : 0.25;
          }
        } else if (player.cls !== drivenV.cls) {
          stopPlayer(0.05);
        }
        if (player) {
          player.startT += dt;
          paramAcc += dt;
          if (paramAcc >= PARAM_EVERY) {
            paramAcc = 0;
            applyPlayer(player, drivenV, num(st && st.wet, 0));
          }
        }
        // sinyal / dörtlü tıkı (yalnız tekerlekli araçlar)
        const d = drivenV.def;
        if (d && (d.kind === 'araba' || d.kind === 'motor')) {
          const ind = indicator.update(dt, drivenV.steer, drivenV.u, num(drivenV.hazardT, 0) > 0);
          if (ind.tick) tick();
        }
      } else if (player) {
        stopPlayer(0.2);
      }
      applyTraffic(dt, st);
    },

    event(type, d) {
      if (disposed || !ctx || !running || !loop || !loop.running) return false;
      const e = d || {};
      switch (type) {
        case 'bump': stats.shots++; return bump(num(e.impact, 8), Boolean(e.soft));
        case 'scrape': stats.shots++; return scrape(num(e.impact, 4));
        case 'land': stats.shots++; return land(num(e.impact, 6));
        case 'horn': stats.shots++; return horn(e.variant);
        case 'door': stats.shots++; return door(e.open !== false, 0);
        case 'trafficHonk': stats.shots++; return honkAt(e.x, e.z, e.id);
        case 'shift':
          if (drivenV && engineSpec(drivenV.cls).turbo && num(e.to, 0) > num(e.from, 0) && gap('psh', 0.4)) {
            stats.shots++;
            return burst('bandpass', 2600, 1400, 1.5, 0.045, 0.09, 0.02);
          }
          return false;
        case 'hop': stats.shots++; return burst('bandpass', 500, 1700, 1.2, 0.07, 0.2, 0);
        case 'splash': stats.shots++; return burst('lowpass', 1500, 400, 0.6, 0.14, 0.35, 0);
        case 'nitroStart': stats.shots++; return thump(70, 150, 0.16, 0.28, 0, 'triangle');
        case 'driftBoost': stats.shots++; return beep('sine', 880, 0.06, 0.18, 0);
        default: return false;
      }
    },

    setNodeCap(n) {
      const c = Math.max(0, Math.floor(num(n, kit.cap)));
      if (c === kit.cap) return;
      const next = tierPlan(c);
      const same = next.player.sq === plan.player.sq && next.player.turbo === plan.player.turbo
        && next.player.brown === plan.player.brown && next.traffic === plan.traffic;
      kit.setCap(c);
      plan = next;
      if (!same) {
        if (ctx) rebuildForPlan();
      } else if (kit.count > c) {
        // yalnız tek atımlıklar fazla: bitene kadar bekle (kısa ömürlü)
      }
    },

    halt() {
      halt();
      running = false;
    },

    getStats() {
      const t = kit.stats();
      return {
        sources: t.count,
        peak: t.peak,
        cap: t.cap,
        running,
        player: Boolean(player),
        trafficVoices: tv.voices.length,
        plan: { traffic: plan.traffic, playerSources: plan.playerSources, oneShot: plan.oneShot },
        shots: stats.shots,
        created: t.created,
        released: t.released,
        groups: t.groups,
      };
    },

    /** Dışarıdan yoklama (test/senaryo): oyuncu motoru düğümleri ve trafik sesleri. */
    probe() {
      return { kit, player: player ? player.nodes : null, traffic: tv.voices };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      kit.destroyAll();
      player = null;
      tv.voices.length = 0;
      drivenV = null;
    },
  };
  return api;
}
