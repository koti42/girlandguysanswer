/*
 * KEŞİF — "traffic" sistemi (order 27): Neon Meridyen canlı trafiği (Faz 3, paket traffic_ai). Sözleşme §9, §20. gameSystems.js otomatik yükler.
 * Sırası: vehicles (26) sonrası — oyuncu aracının bu adımdaki konumu yapay zekâ araçlarına engel olarak verilir; crowd (29) öncesi.
 *
 *   G.traffic              {view, stats, tn, cars, alive(), carById(id), time, cap} — şehir dışında null
 *   getTraffic()           render/ses/harita için canlı görünüm (api): {count, cap, x,y,z,yaw,pitch,speed,cls,color,accent,flags,fade,id,steer,version}
 *                          flags bitleri trafficCars.CAR_FLAG (fren, geri, far, uyarı, sinyal, taksi levhası); dizi indisleri 0..count−1, kare başına doldurulur
 *   getTrafficStats()      sayaçlar (doğma, silme, rezervasyon, ihlal=0…)
 *   getTrafficLight(x?, z?) → {kind:'trafik', dist, state, left, text, glyph, shape, pos, name}|null    en yakın ışık ipucu (≤ 40 blok; renk + konum + şekil + metin)
 *   Olaylar (G.emit): trafficHonk {id,x,y,z} · trafficBump {id,x,y,z} · trafficSpawn yok (gürültü)
 *   Dinler: vehiclePhys (bump → çarpılan araç 1,5 sn durur) · dimensionChanged (onDimension).
 *   Oyuncu çarpışması: etkin araçlar world.colliders'a DİNAMİK kutu olarak yazılır (id = TRAFFIC_COLLIDER_BASE + havuz indisi); vehiclePhysics onları sert engel sayar
 *   (itme + sarsıntı, hasar yok); yapay zekâ araç 1,5 sn durur ve toparlanır.
 *   Kayıt: trafik KAYDA GİRMEZ; boyuta girişte/yüklemede (tohum + dünya saati + oyuncu konumu) belirlenimli yeniden doldurulur.
 *   Hata ayıklama: trafik · trafiksayi <n> · trafikyok
 */
import { createTraffic, TICK } from '../sim/city/vehicle/trafficAI.js';
import { trafficNet } from '../sim/city/vehicle/junctions.js';
import { TCLASS } from '../sim/city/vehicle/trafficCars.js';
import { armSignal, armSignalLeft, lampInfo } from '../sim/city/vehicle/trafficLights.js';
import { clockPhase } from '../sim/daynight.js';
import { registerCommand } from './sessionCommands.js';
import { createLampSync, lampList } from './trafficLamps.js';
import { bumpPolicy } from '../sim/city/vehicle/trafficFollow.js';

export const TRAFFIC_ORDER = 27;
export const TRAFFIC_COLLIDER_BASE = 0x7e000000;
export const TIER_CAP = Object.freeze({ low: 10, medium: 18, high: 30 });
const COLLIDER_RANGE = 70;
const LOW_DT = 1 / 15;
const MAX_OBS = 40;
const HINT_RANGE = 40;

const aabb = {
  minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0,
};
const vel = { x: 0, y: 0, z: 0 };

export function createSystem(G) {
  const st = {
    tr: null, tn: null, seed: -1, acc: 0, tickDt: TICK, cdTier: 0, cdEnv: 0, rain: false, colBase: TRAFFIC_COLLIDER_BASE, registered: new Set(), colWorld: null, forcedCap: -1,
    hintBuf: { kind: 'trafik' }, sinceSync: 0, bumpHist: new Map(),
  };
  const obs = [];
  for (let i = 0; i < MAX_OBS; i++) {
    obs.push({
      x: 0, y: 0, z: 0, yaw: 0, hl: 1, hw: 1, vx: 0, vz: 0, kind: 0,
    });
  }
  const lamps = createLampSync();
  const sys = { stats: { creates: 0, disposes: 0, steps: 0, bumps: 0, colliderWrites: 0 } };

  /* ---------------------------------------------------------------- yardımcılar */
  function tierCap() {
    if (st.forcedCap >= 0) return st.forcedCap;
    const q = G.quality && G.quality.settings ? G.quality.settings.effTier : null;
    return TIER_CAP[q] || TIER_CAP.high;
  }

  function tierDt() {
    const q = G.quality && G.quality.settings ? G.quality.settings.effTier : null;
    return q === 'low' ? LOW_DT : TICK;
  }

  function worldTime() {
    const c = G.clock;
    if (!c) return 0;
    return (c.day || 0) * c.dayLengthSec + c.time;
  }

  function wetNow() {
    const u = G.materials && G.materials.uniforms && G.materials.uniforms.uWet ? G.materials.uniforms.uWet.value : 0;
    return Number.isFinite(u) ? u : 0;
  }

  function pickColliderBase() {
    const p = G.props;
    let base = TRAFFIC_COLLIDER_BASE;
    if (!p || typeof p.has !== 'function') return base;
    for (let tries = 0; tries < 8; tries++) {
      let clash = false;
      for (let i = 0; i < 64; i++) if (p.has(base + i)) clash = true;
      if (!clash) return base;
      base += 64;
    }
    return base;
  }

  /* ---------------------------------------------------------------- kurulum / yıkım */
  function ensure() {
    const w = G.world;
    if (!w) return null;
    const seed = w.seed;
    if (st.tr && st.seed === seed) return st.tr;
    if (st.tr) teardown();
    st.tn = trafficNet(seed);
    const tr = createTraffic(st.tn, { seed, cap: tierCap(), hooks: { pedBlocked: (j, a) => (G.crowd && G.crowd.pedBlocked ? G.crowd.pedBlocked(j, a) : false) } }); // Faz 4: zebrada yaya varken araç kavşağa girmez
    st.tr = tr;
    st.seed = seed;
    st.acc = 0;
    st.tickDt = tierDt();
    st.colBase = pickColliderBase();
    lamps.reset();
    tr.setTime(worldTime());
    updateEnv(true);
    const b = G.body;
    tr.setPlayer(b.x, b.y, b.z, G.player.yaw);
    gatherObstacles();
    tr.populate();
    G.traffic = tr;
    sys.stats.creates++;
    return tr;
  }

  function removeColliders() {
    const cc = st.colWorld;
    if (cc && st.registered.size > 0) {
      st.registered.forEach((id) => {
        try {
          cc.remove(id);
        } catch { /* yut */ }
      });
    }
    st.registered.clear();
    st.colWorld = null;
  }

  function teardown() {
    removeColliders();
    if (st.tr) {
      st.tr.reset();
      sys.stats.disposes++;
    }
    st.tr = null;
    st.tn = null;
    st.seed = -1;
    st.acc = 0;
    st.bumpHist.clear();
    G.traffic = null;
    lamps.reset();
  }

  /* ---------------------------------------------------------------- ortam / engeller */
  function updateEnv(force) {
    const tr = st.tr;
    if (!tr) return;
    const wet = wetNow();
    if (wet > 0.45) st.rain = true;
    else if (wet < 0.2) st.rain = false;
    const ph = G.clock ? clockPhase(G.clock) : 0.25;
    const night = ph >= 0.52 || ph < 0.03;
    tr.setEnv({ phase: ph, rain: st.rain, night: night || (st.rain && ph > 0.4) });
    if (force) tr.setCap(tierCap());
  }

  function gatherObstacles() {
    const tr = st.tr;
    if (!tr) return;
    let n = 0;
    const b = G.body;
    const mgr = G.vehicles && G.vehicles.entries ? G.vehicles : null;
    const driven = mgr ? mgr.driven : null;
    if (mgr) {
      mgr.entries.forEach((e) => {
        if (n >= MAX_OBS - 1) return;
        const v = e.v;
        if (!v || (e.installed === false)) return;
        const dx = v.x - b.x;
        const dz = v.z - b.z;
        if (dx * dx + dz * dz > 170 * 170) return;
        const o = obs[n++];
        o.x = v.x; o.y = v.y; o.z = v.z; o.yaw = v.yaw;
        o.hl = v.def.length * 0.5; o.hw = v.def.width * 0.5;
        o.vx = v.vx; o.vz = v.vz;
        o.kind = driven === e ? 1 : 2;
      });
    }
    if (!driven && b && n < MAX_OBS) {
      const o = obs[n++];
      o.x = b.x; o.y = b.y; o.z = b.z; o.yaw = G.player ? G.player.yaw : 0;
      o.hl = 0.42; o.hw = 0.42; o.vx = b.vx || 0; o.vz = b.vz || 0; o.kind = 3;
    }
    if (G.crowd && G.crowd.fillObstacles && n < MAX_OBS) n = G.crowd.fillObstacles(obs, n, MAX_OBS); // Faz 4: zebradaki yayalar engel (araç yavaşlar)
    tr.setObstacles(obs, n);
  }

  /* ---------------------------------------------------------------- çarpışma kutuları */
  function updateColliders() {
    const tr = st.tr;
    const w = G.world;
    const cc = w ? w.colliders : null;
    if (!tr || !cc) {
      if (st.registered.size > 0) removeColliders();
      return;
    }
    if (st.colWorld && st.colWorld !== cc) {
      removeColliders();
    }
    st.colWorld = cc;
    const b = G.body;
    const ex = st.acc; // son 20 Hz adımından beri geçen süre: konumu hıza göre ileri taşı
    const cars = tr.cars;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      const id = st.colBase + i;
      let want = false;
      if (c.alive && c.state === 1 && c.fade > 0.5) {
        const dx = c.x - b.x;
        const dz = c.z - b.z;
        want = dx * dx + dz * dz < COLLIDER_RANGE * COLLIDER_RANGE;
      }
      if (!want) {
        if (st.registered.has(id)) {
          cc.remove(id);
          st.registered.delete(id);
        }
        continue;
      }
      const sy = Math.sin(c.yaw);
      const cy = Math.cos(c.yaw);
      const fx = -sy;
      const fz = -cy;
      const px = c.x + fx * c.v * ex;
      const pz = c.z + fz * c.v * ex;
      const hx = c.halfLen * Math.abs(sy) + c.halfWid * Math.abs(cy);
      const hz = c.halfLen * Math.abs(cy) + c.halfWid * Math.abs(sy);
      aabb.minX = px - hx; aabb.maxX = px + hx; aabb.minZ = pz - hz; aabb.maxZ = pz + hz;
      aabb.minY = c.y; aabb.maxY = c.y + TCLASS[c.cls].height;
      vel.x = fx * c.v; vel.y = 0; vel.z = fz * c.v;
      cc.setDynamic(id, aabb, vel);
      st.registered.add(id);
      sys.stats.colliderWrites++;
    }
  }

  /* ---------------------------------------------------------------- ışık ipucu */
  function lightHint(x, z) {
    const tn = st.tn;
    const tr = st.tr;
    if (!tn || !tr) return null;
    const list = lampList(tn);
    let best = null;
    let bd = HINT_RANGE * HINT_RANGE;
    for (let i = 0; i < list.length; i++) {
      const L = list[i];
      const dx = L.x - x;
      const dz = L.z - z;
      const d = dx * dx + dz * dz;
      if (d < bd) {
        bd = d;
        best = L;
      }
    }
    if (!best) return null;
    const J = tn.junctions[best.jid];
    const state = armSignal(J.plan, best.dir, tr.time);
    const info = lampInfo(state);
    const h = st.hintBuf;
    h.dist = Math.sqrt(bd);
    h.state = state;
    h.left = armSignalLeft(J.plan, best.dir, tr.time);
    h.name = info.name;
    h.text = info.name === 'ışıksız' ? info.text : 'Trafik ışığı ' + info.name + ': ' + info.text;
    h.glyph = info.glyph;
    h.shape = info.shape;
    h.pos = info.pos;
    h.junction = best.jid;
    h.arm = best.dir;
    return h;
  }

  /* ---------------------------------------------------------------- hata ayıklama komutları */
  registerCommand('trafik', 'trafik', (g) => {
    const tr = g.traffic;
    if (!tr) return { ok: true, message: 'Trafik yok (şehir dışı).', data: null };
    return {
      ok: true,
      message: 'Trafik: ' + tr.alive() + ' araç.',
      data: { alive: tr.alive(), cap: tr.getCap(), stats: tr.stats, sys: sys.stats, lamps: lamps.stats },
    };
  });
  registerCommand('trafiksayi', 'trafiksayi <n|auto>', (g, a) => {
    const n = a && a[0] === 'auto' ? -1 : Math.floor(Number(a && a[0]));
    if (a && a[0] !== 'auto' && !(n >= 0)) return { ok: false, message: 'trafiksayi <n|auto>' };
    st.forcedCap = n;
    if (st.tr) st.tr.setCap(tierCap());
    return { ok: true, message: 'Trafik tavanı: ' + (n < 0 ? 'otomatik' : n), data: { cap: tierCap() } };
  });
  registerCommand('trafikyok', 'trafikyok', () => {
    st.forcedCap = 0;
    if (st.tr) {
      st.tr.setCap(0);
      st.tr.populate();
    }
    return { ok: true, message: 'Trafik kapatıldı.', data: null };
  });

  /* ---------------------------------------------------------------- sistem */
  return {
    name: 'traffic',
    order: TRAFFIC_ORDER,
    sys,
    state: st,

    fixedUpdate(_G, dt) {
      const active = G.dim === 'neon' && G.world && !G.transitionActive;
      if (!active) {
        if (st.tr) teardown();
        return;
      }
      const tr = ensure();
      if (!tr) return;
      st.cdTier -= dt;
      if (st.cdTier <= 0) {
        st.cdTier = 1;
        tr.setCap(tierCap());
        st.tickDt = tierDt();
      }
      st.cdEnv -= dt;
      if (st.cdEnv <= 0) {
        st.cdEnv = 0.5;
        updateEnv(false);
      }
      const b = G.body;
      tr.setPlayer(b.x, b.y, b.z, G.player.yaw);
      gatherObstacles();
      st.acc += dt;
      let guard = 0;
      while (st.acc >= st.tickDt - 1e-9 && guard < 4) {
        tr.step(st.tickDt);
        st.acc -= st.tickDt;
        guard++;
        sys.stats.steps++;
      }
      if (st.acc > st.tickDt * 2) st.acc = 0;
      updateColliders();
      const evs = tr.events;
      if (evs.length > 0) {
        for (let i = 0; i < evs.length; i++) {
          const e = evs[i];
          if (e.type === 'honk') G.emit({ type: 'trafficHonk', id: e.id, x: e.x, y: e.y, z: e.z });
        }
        evs.length = 0;
      }
    },

    frameUpdate(_G, dt) {
      const tr = st.tr;
      if (!tr || G.dim !== 'neon') return;
      tr.frameAlpha = Math.max(0, Math.min(1, st.acc / st.tickDt));
      tr.fillView(tr.frameAlpha);
      const b = G.body;
      lamps.update(G.props, st.tn, tr.time, b.x, b.z, dt);
    },

    beforeDimension() {
      removeColliders();
    },

    onDimension(_G, _from, to) {
      teardown();
      // trafik ağı (hareketler, çatışma tabloları: ≈ 40 ms) yükleme ekranı sürerken ısıtılır → ilk oyun karesinde takılma olmaz
      const w = to && to.id === 'neon' && to.world ? to.world : null;
      if (w) {
        try {
          lampList(trafficNet(w.seed));
        } catch { /* ısınma başarısız olsa da ensure() kurar */ }
      }
    },

    onEvent(_G, e) {
      if (!e || !st.tr) return;
      if (e.type === 'vehiclePhys' && e.ev && e.ev.type === 'bump') {
        const cid = e.ev.id;
        if (typeof cid !== 'number') return;
        const idx = cid - st.colBase;
        if (idx < 0 || idx >= st.tr.cars.length) return;
        const c = st.tr.cars[idx];
        if (!c || !c.alive) return;
        // QA3-001: arkadan çarpılan araç durmaz; aynı araca 10 sn içinde 4. çarpma → araç silinir (kavşak kutusunu tıkamasın)
        const dv = G.vehicles && G.vehicles.driven ? G.vehicles.driven.v : null;
        const pol = bumpPolicy(c, dv ? dv.x : NaN, dv ? dv.z : NaN, st.bumpHist, st.tr.time);
        if (pol.vanish) c.state = 2; // solarak silinir (FADE_OUT), serbest şeritte yeniden doğar
        if (pol.hold <= 0 || pol.vanish || st.tr.bump(c.id, pol.hold)) {
          sys.stats.bumps++;
          G.emit({
            type: 'trafficBump', id: c.id, x: c.x, y: c.y, z: c.z,
          });
        }
      }
    },

    api() {
      const empty = {
        count: 0, cap: 0, x: new Float32Array(0), y: new Float32Array(0), z: new Float32Array(0), yaw: new Float32Array(0), pitch: new Float32Array(0), speed: new Float32Array(0),
        cls: new Uint8Array(0), color: new Uint8Array(0), accent: new Uint8Array(0), flags: new Uint8Array(0), fade: new Float32Array(0), id: new Uint32Array(0), steer: new Float32Array(0), version: 0,
      };
      return {
        getTraffic() {
          return st.tr ? st.tr.view : empty;
        },
        getTrafficStats() {
          const tr = st.tr;
          if (!tr) return { active: false };
          return Object.assign({ active: true, alive: tr.alive(), cap: tr.getCap(), sys: sys.stats, lamps: lamps.stats }, tr.stats);
        },
        getTrafficLight(x, z) {
          const b = G.body;
          return lightHint(Number.isFinite(x) ? x : b.x, Number.isFinite(z) ? z : b.z);
        },
      };
    },

    dispose() {
      teardown();
    },
  };
}

export default createSystem;
