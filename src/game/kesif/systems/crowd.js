/*
 * KEŞİF — "crowd" sistemi (order 29): Neon Meridyen yayaları (Faz 4, paket crowd_ai). Sözleşme §10, §17, §20. gameSystems.js otomatik yükler.
 * Sırası: traffic (27) sonrası — trafik arabaları bu adımda yaya engeli/kancası olarak okunur; cityMissions (31) öncesi. Yayalar asla zarar görmez.
 *
 *   G.crowd                {kalabalık benzetimi, view, peds, stats, alive(), target, tierCount, pedBlocked, fillObstacles} — şehir dışında null
 *   getCrowd()             çizim/ses/harita için canlı görünüm: {count, idx[], x,y,z,yaw,speed,phase,rate,gesture,tier,fade,umb,id,lookYaw,sky,blk}
 *   getCrowdStats()        sayaçlar (doğma, silme, geçit, kaçınma, el sallama, kuyruk, sığınma …) + kademe sayıları + hedef
 *   getCrowdNear(x?, z?, r?) → [{id, x, z, state, type}]   yakındaki yayalar (hata ayıklama/test)
 *   Olaylar (G.emit): pedWave {id,x,y,z} · pedSpawnEnter {…yok}
 *   Çarpışma: yakın (≤ 18 m) yayalar world.colliders'a DİNAMİK küçük kutu olarak yazılır (kimlik = PED_COLLIDER_BASE + havuz indisi); G.isSoftCollider bunları yumuşak
 *   işaretler (araç durmaz/yumuşak itilir). Oyuncu kutuyla iç içeyse kutu o adım silinir (oyuncu sıkışmaz); yayalar oyuncudan önce kenara çekilir.
 *   Trafik: createTraffic hooks.pedBlocked → crowd.pedBlocked (zebrada yaya varken araç kavşağa girmez), engel listesi → crowd.fillObstacles.
 *   Kayıt: yayalar KAYDA GİRMEZ; boyuta girişte/yüklemede (tohum + dünya saati + oyuncu konumu) belirlenimli yeniden doldurulur.
 *   Hata ayıklama: yaya · yayasayi <n|auto> · yayayok
 */
import { pedNav } from '../sim/city/ped/pedNav.js';
import { worldProbe } from '../sim/city/ped/pedProbe.js';
import { createCrowd } from '../sim/city/ped/crowd.js';
import { POOL, TICK } from '../sim/city/ped/crowdCore.js';
import { TIER_CAPS } from '../sim/city/ped/pedData.js';
import { trafficNet } from '../sim/city/vehicle/junctions.js';
import { pedSignalInfo } from '../sim/city/vehicle/trafficLights.js';
import { clockPhase } from '../sim/daynight.js';
import { registerCommand } from './sessionCommands.js';

export const CROWD_ORDER = 29;
export const PED_COLLIDER_BASE = 0x7d000000;
const COLLIDER_RANGE = 18;
const MAX_VEH = 40;
const LIGHT_PER_TICK = 4;

const aabb = {
  minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0,
};
const vel = { x: 0, y: 0, z: 0 };

export function createSystem(G) {
  const st = {
    cr: null, nav: null, seed: -1, acc: 0, colBase: PED_COLLIDER_BASE, registered: new Set(), colWorld: null, forcedCap: -1, tn: null,
    cdEnv: 0, lightK: 0, hold: new Map(),
  };
  const veh = [];
  for (let i = 0; i < MAX_VEH; i++) {
    veh.push({
      x: 0, y: 64, z: 0, yaw: 0, hl: 1, hw: 1, vx: 0, vz: 0, kind: 0,
    });
  }
  const sys = { stats: { creates: 0, disposes: 0, steps: 0, colliderWrites: 0, holds: 0 } };
  const prevSoft = typeof G.isSoftCollider === 'function' ? G.isSoftCollider : null;

  /* ---------------------------------------------------------------- yardımcılar */
  function tierName() {
    const q = G.quality && G.quality.settings ? G.quality.settings.effTier : null;
    return TIER_CAPS[q] ? q : 'high';
  }

  function worldTime() {
    const c = G.clock;
    if (!c) return 0;
    return (c.day || 0) * c.dayLengthSec + c.time;
  }

  function pickColliderBase() {
    const p = G.props;
    let base = PED_COLLIDER_BASE;
    if (!p || typeof p.has !== 'function') return base;
    for (let tries = 0; tries < 8; tries++) {
      let clash = false;
      for (let i = 0; i < POOL; i++) if (p.has(base + i)) clash = true;
      if (!clash) return base;
      base += 128;
    }
    return base;
  }

  /* ---------------------------------------------------------------- kurulum / yıkım */
  function ensure() {
    const w = G.world;
    if (!w) return null;
    const seed = w.seed;
    if (st.cr && st.seed === seed) return st.cr;
    if (st.cr) teardown();
    st.nav = pedNav(seed);
    st.tn = trafficNet(seed);
    const cr = createCrowd(st.nav, { seed, quality: tierName(), probe: worldProbe(w, { roads: st.nav.plan.roads }) });
    cr.setSignals((jun, arm, t, out) => {
      const J = st.tn.junctions[jun];
      if (!J) return null;
      // trafikle AYNI saat: ışık fazı G.traffic.time'dan okunur (yaya ve araç aynı anda aynı faz)
      const tt = G.traffic && Number.isFinite(G.traffic.time) ? G.traffic.time : t;
      return pedSignalInfo(J.plan, arm, tt, out);
    });
    cr.setTime(worldTime());
    st.cr = cr;
    st.seed = seed;
    st.acc = 0;
    st.colBase = pickColliderBase();
    updateEnv();
    syncPlayer();
    gatherVehicles();
    cr.populate();
    G.crowd = cr;
    sys.stats.creates++;
    return cr;
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
    st.hold.clear();
    st.colWorld = null;
  }

  function teardown() {
    removeColliders();
    if (st.cr) {
      st.cr.reset();
      sys.stats.disposes++;
    }
    st.cr = null;
    st.nav = null;
    st.tn = null;
    st.seed = -1;
    st.acc = 0;
    G.crowd = null;
  }

  /* ---------------------------------------------------------------- ortam / oyuncu / araçlar */
  function updateEnv() {
    const cr = st.cr;
    if (!cr) return;
    const lk = G.cityLook && G.cityLook.state ? G.cityLook.state : null;
    const wet = G.materials && G.materials.uniforms && G.materials.uniforms.uWet ? G.materials.uniforms.uWet.value : 0;
    const rain = lk && Number.isFinite(lk.rain) ? lk.rain : Number.isFinite(wet) ? wet : 0;
    const ph = G.clock ? clockPhase(G.clock) : 0.25;
    cr.setEnv({ phase: ph, rain, night: ph >= 0.52 || ph < 0.03 });
    cr.setReduced(!!(G.reducedMotion || G.accessibility));
    const q = tierName();
    cr.setQuality(q);
    cr.setCap(st.forcedCap >= 0 ? st.forcedCap : TIER_CAPS[q].total);
  }

  function syncPlayer() {
    const cr = st.cr;
    const b = G.body;
    if (!cr || !b) return;
    const drv = G.vehicles && G.vehicles.driven ? G.vehicles.driven : null;
    const yaw = G.player ? G.player.yaw : 0;
    if (drv && drv.v) cr.setPlayer(drv.v.x, drv.v.y, drv.v.z, yaw, drv.v.vx || 0, drv.v.vz || 0, true);
    else cr.setPlayer(b.x, b.y, b.z, yaw, b.vx || 0, b.vz || 0, false);
  }

  function gatherVehicles() {
    const cr = st.cr;
    if (!cr) return;
    let n = 0;
    const b = G.body;
    const mgr = G.vehicles && G.vehicles.entries ? G.vehicles : null;
    const driven = mgr ? mgr.driven : null;
    if (mgr) {
      mgr.entries.forEach((e) => {
        if (n >= MAX_VEH - 1 || !e.v || e.stashed || e.installed === false) return;
        const v = e.v;
        const dx = v.x - b.x;
        const dz = v.z - b.z;
        if (dx * dx + dz * dz > 130 * 130) return;
        const o = veh[n++];
        o.x = v.x; o.y = v.y; o.z = v.z; o.yaw = v.yaw; o.hl = v.def.length * 0.5; o.hw = v.def.width * 0.5; o.vx = v.vx || 0; o.vz = v.vz || 0;
        o.kind = driven === e ? 1 : 2;
      });
    }
    const tr = G.traffic;
    if (tr && tr.cars) {
      const cars = tr.cars;
      for (let i = 0; i < cars.length && n < MAX_VEH; i++) {
        const c = cars[i];
        if (!c.alive || c.state !== 1 || c.fade < 0.3) continue;
        const dx = c.x - b.x;
        const dz = c.z - b.z;
        if (dx * dx + dz * dz > 110 * 110) continue;
        const o = veh[n++];
        o.x = c.x; o.y = c.y; o.z = c.z; o.yaw = c.yaw; o.hl = c.halfLen; o.hw = c.halfWid;
        o.vx = -Math.sin(c.yaw) * c.v; o.vz = -Math.cos(c.yaw) * c.v; o.kind = 5;
      }
    }
    cr.setVehicles(veh, n);
  }

  /* ---------------------------------------------------------------- çarpışma kutuları */
  function updateColliders() {
    const cr = st.cr;
    const w = G.world;
    const cc = w ? w.colliders : null;
    if (!cr || !cc) {
      if (st.registered.size > 0) removeColliders();
      return;
    }
    if (st.colWorld && st.colWorld !== cc) removeColliders();
    st.colWorld = cc;
    const b = G.body;
    const peds = cr.peds;
    for (let i = 0; i < peds.length; i++) {
      const p = peds[i];
      const id = st.colBase + i;
      let want = false;
      if (p.alive && p.fade > 0.5 && p.tier === 0 && p.state !== 9) {
        const dx = p.x - b.x;
        const dz = p.z - b.z;
        want = dx * dx + dz * dz < COLLIDER_RANGE * COLLIDER_RANGE;
        // oyuncuyla iç içe: kutu yok (oyuncu sıkışmaz)
        if (want && dx * dx + dz * dz < 0.62 * 0.62) want = false;
      }
      if (!want) {
        if (st.registered.has(id)) {
          cc.remove(id);
          st.registered.delete(id);
        }
        continue;
      }
      aabb.minX = p.x - 0.22; aabb.maxX = p.x + 0.22; aabb.minZ = p.z - 0.22; aabb.maxZ = p.z + 0.22;
      aabb.minY = p.y; aabb.maxY = p.y + 1.72 * p.look.h;
      vel.x = -Math.sin(p.yaw) * p.speed; vel.y = 0; vel.z = -Math.cos(p.yaw) * p.speed;
      cc.setDynamic(id, aabb, vel);
      st.registered.add(id);
      sys.stats.colliderWrites++;
    }
  }

  /* ---------------------------------------------------------------- ışık örnekleme (çizim için gökyüzü/blok ışığı) */
  function sampleLight() {
    const cr = st.cr;
    const w = G.world;
    if (!cr || !w || typeof w.getLight !== 'function') return;
    const peds = cr.peds;
    for (let k = 0; k < LIGHT_PER_TICK; k++) {
      const i = (st.lightK + k) % peds.length;
      const p = peds[i];
      if (!p.alive) continue;
      const l = w.getLight(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z));
      if (Number.isFinite(l)) {
        p.sky = (l >> 4) / 15;
        p.blk = (l & 15) / 15;
      }
    }
    st.lightK = (st.lightK + LIGHT_PER_TICK) % peds.length;
  }

  /* ---------------------------------------------------------------- hata ayıklama komutları */
  registerCommand('yaya', 'yaya', (g) => {
    const cr = g.crowd;
    if (!cr) return { ok: true, message: 'Yaya yok (şehir dışı).', data: null };
    return {
      ok: true,
      message: 'Yaya: ' + cr.alive() + ' (hedef ' + cr.target + ').',
      data: { alive: cr.alive(), target: cr.target, tiers: Array.from(cr.tierCount), stats: cr.stats, sys: sys.stats },
    };
  });
  registerCommand('yayasayi', 'yayasayi <n|auto>', (g, a) => {
    const n = a && a[0] === 'auto' ? -1 : Math.floor(Number(a && a[0]));
    if (a && a[0] !== 'auto' && !(n >= 0)) return { ok: false, message: 'yayasayi <n|auto>' };
    st.forcedCap = n;
    updateEnv();
    return { ok: true, message: 'Yaya tavanı: ' + (n < 0 ? 'otomatik' : n), data: { cap: n } };
  });
  registerCommand('yayayok', 'yayayok', () => {
    st.forcedCap = 0;
    updateEnv();
    return { ok: true, message: 'Yayalar kapatıldı.', data: null };
  });

  /* ---------------------------------------------------------------- sistem */
  return {
    name: 'crowd',
    order: CROWD_ORDER,
    sys,
    state: st,

    init() {
      G.isSoftCollider = (id) => (id >= st.colBase && id < st.colBase + POOL) || (prevSoft ? prevSoft(id) : false);
    },

    fixedUpdate(_G, dt) {
      const active = G.dim === 'neon' && G.world && !G.transitionActive;
      if (!active) {
        if (st.cr) teardown();
        return;
      }
      const cr = ensure();
      if (!cr) return;
      st.cdEnv -= dt;
      if (st.cdEnv <= 0) {
        st.cdEnv = 0.5;
        updateEnv();
        const wt = worldTime();
        // kayıt yükleme / uyku / saat komutu sonrası eşitle; saat DONUKKEN eşitleme yok (yaya saati geri sarılıp yakın-kenar yenilemesini kilitlerdi: QA4-003)
        if (Math.abs(wt - cr.time) > 2.5 && !(G.clock && G.clock.frozen)) cr.setTime(wt);
      }
      syncPlayer();
      gatherVehicles();
      st.acc += dt;
      let guard = 0;
      while (st.acc >= TICK - 1e-9 && guard < 4) {
        cr.step(TICK);
        st.acc -= TICK;
        guard++;
        sys.stats.steps++;
      }
      if (st.acc > TICK * 2) st.acc = 0;
      updateColliders();
      sampleLight();
    },

    beforeDimension() {
      removeColliders();
    },

    onDimension(_G, _from, to) {
      teardown();
      // yaya ağı (≈ 60 ms) yükleme ekranı sürerken ısıtılır → ilk oyun karesinde takılma olmaz
      const w = to && to.id === 'neon' && to.world ? to.world : null;
      if (w) {
        try {
          pedNav(w.seed);
        } catch { /* ısınma başarısız olsa da ensure() kurar */ }
      }
    },

    api() {
      const empty = {
        count: 0, idx: new Int32Array(0), x: new Float32Array(0), y: new Float32Array(0), z: new Float32Array(0), yaw: new Float32Array(0), speed: new Float32Array(0),
        phase: new Float32Array(0), rate: new Float32Array(0), gesture: new Uint8Array(0), tier: new Uint8Array(0), fade: new Float32Array(0), umb: new Float32Array(0),
        id: new Uint32Array(0), lookYaw: new Float32Array(0), sky: new Float32Array(0), blk: new Float32Array(0), reduced: false, version: 0,
      };
      return {
        getCrowd() {
          return st.cr ? st.cr.view : empty;
        },
        getCrowdStats() {
          const cr = st.cr;
          if (!cr) return { active: false };
          return Object.assign({
            active: true, alive: cr.alive(), target: cr.target, tiers: Array.from(cr.tierCount), raining: cr.raining, quality: cr.quality, sys: sys.stats,
          }, cr.stats);
        },
        getCrowdNear(x, z, r) {
          const cr = st.cr;
          if (!cr) return [];
          const b = G.body;
          const px = Number.isFinite(x) ? x : b.x;
          const pz = Number.isFinite(z) ? z : b.z;
          const rr = Number.isFinite(r) ? r : 12;
          const out = [];
          for (let i = 0; i < cr.peds.length; i++) {
            const p = cr.peds[i];
            if (!p.alive) continue;
            const dx = p.x - px;
            const dz = p.z - pz;
            if (dx * dx + dz * dz <= rr * rr) out.push({ id: p.id, x: p.x, z: p.z, state: p.state, type: p.type, gesture: p.gesture });
          }
          return out;
        },
      };
    },

    dispose() {
      teardown();
    },
  };
}

export default createSystem;
