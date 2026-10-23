/*
 * KEŞİF render/city — SOKAK NPC FİGÜRLERİ (npc_vendors). Kadrolu NPC'leri `createCharacter(look,{detail:'low'})` kahramanlarıyla çizer (≈5 bin üçgen, 4 çizim çağrısı);
 * kimlik başına avatar görünümü (sim/city/ped/npcData.npcLook), boşta nefes + hareketler (el sallama, düşünme, kol kavuşturma, dans, okuma, tamir), oyuncuya bakış,
 * konuşurken oyuncuya dönüş. Havuz: karakterler yeniden kullanılır (setConfig) — kare başına en çok 1 yeniden kurma (≈7 ms) → takılma yok.
 * İleride crowd_ai kalabalık modelleri gelirse aynı arayüz (sync/update/faceTarget) altında değiştirilebilir.
 *
 *   createNpcFigures({tier?, reducedMotion?}) → fig
 *   fig.group (sahneye eklenen kök) · fig.setTier('low'|'medium'|'high') · fig.setReducedMotion(bool)
 *   fig.sync(list, nowSec) list: [{id, look, x, y, z, yaw, dist, emotes[], h (kimlik karması)}]  → hangi kahramanlar görünür (bütçe: kademe başına en çok 4/3/2 ve çizim çağrısı 12/10/8)
 *   fig.update(dt, nowSec, env) env: {px, pz (oyuncu), light(x,y,z) → 0.1..1.6}
 *   fig.faceTarget(id, x, z) / fig.clearFace(id)   konuşma: gövde hedefe döner
 *   fig.has(id) · fig.get(id) → {x,y,z,yaw,eyeY,scale,visible} | null · fig.stats() → {heroes, draws, tris, builds}
 *   fig.dispose()
 * Kademe: yüksek 4 kahraman / 12 çizim, orta 3 / 10, düşük 2 / 8; 14 m'den uzakta parıltı ağı, 24 m'den uzakta parlak ağ gizlenir (çizim tasarrufu).
 */
import * as THREE from 'three';
import { createCharacter } from '../character.js';
import { dampK, wrapAngle } from '../characterPoses.js';

export const FIGURE_TIERS = Object.freeze({
  high: Object.freeze({ max: 4, draws: 12 }),
  medium: Object.freeze({ max: 3, draws: 10 }),
  low: Object.freeze({ max: 2, draws: 8 }),
});
export const NEAR_GLOW = 14;
export const NEAR_GLOSS = 24;
export const EMOTE_SEC = 3.2;
export const ATTENTION_R = 6;
const SCALE_IN = 0.35;
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/* Hareketler: rig'e eklemeli delta (ağırlık w 0..1). */
const EMOTE_FN = {
  el_salla(rig, t, w) {
    rig.armR.rotation.z += 2.3 * w;
    rig.armR.rotation.x += 0.2 * w;
    rig.foreArmR.rotation.x += (0.45 + 0.4 * Math.sin(t * 8)) * w;
    rig.head.rotation.z += 0.08 * w;
  },
  dusun(rig, t, w) {
    rig.armR.rotation.x += 0.95 * w;
    rig.foreArmR.rotation.x += 1.85 * w;
    rig.head.rotation.x += (0.12 + 0.03 * Math.sin(t * 1.5)) * w;
    rig.head.rotation.z += 0.1 * w;
  },
  kol_kavusturma(rig, t, w) {
    rig.armL.rotation.x += 0.75 * w;
    rig.armR.rotation.x += 0.75 * w;
    rig.armL.rotation.z += 0.35 * w;
    rig.armR.rotation.z -= 0.35 * w;
    rig.foreArmL.rotation.x += 1.7 * w;
    rig.foreArmR.rotation.x += 1.7 * w;
    rig.chest.rotation.x += 0.03 * w;
  },
  dans(rig, t, w) {
    const s = Math.sin(t * 3.2);
    rig.hips.rotation.z += s * 0.12 * w;
    rig.spine.rotation.z -= s * 0.1 * w;
    rig.armL.rotation.z -= (0.7 + 0.35 * s) * w;
    rig.armR.rotation.z += (0.7 - 0.35 * s) * w;
    rig.foreArmL.rotation.x += 0.5 * w;
    rig.foreArmR.rotation.x += 0.5 * w;
    rig.head.rotation.z += s * 0.08 * w;
    rig.hips.position.y += Math.abs(Math.sin(t * 3.2)) * 0.035 * w;
  },
  okuma(rig, t, w) {
    rig.armL.rotation.x += 0.85 * w;
    rig.armR.rotation.x += 0.85 * w;
    rig.foreArmL.rotation.x += 1.3 * w;
    rig.foreArmR.rotation.x += 1.3 * w;
    rig.head.rotation.x += 0.38 * w;
  },
  tamir(rig, t, w) {
    rig.spine.rotation.x += 0.22 * w;
    rig.chest.rotation.x += 0.12 * w;
    rig.armR.rotation.x += (0.85 + 0.12 * Math.sin(t * 6)) * w;
    rig.foreArmR.rotation.x += 1.0 * w;
    rig.armL.rotation.x += 0.5 * w;
    rig.foreArmL.rotation.x += 0.9 * w;
    rig.head.rotation.x += 0.2 * w;
  },
};
export const EMOTE_NAMES = Object.freeze(Object.keys(EMOTE_FN));

/** Zaman + kimlik karmasından etkin hareket: {name, w} | null. Hareket yok → null. */
export function emoteAt(emotes, h, nowSec) {
  if (!emotes || emotes.length === 0) return null;
  const period = 9 + ((h >>> 3) % 7);
  const off = (h % 1000) / 1000 * period;
  const u = nowSec + off;
  const k = Math.floor(u / period);
  const name = emotes[((k % emotes.length) + emotes.length) % emotes.length];
  if (!EMOTE_FN[name]) return null;
  const f = u - k * period;
  const start = period - EMOTE_SEC;
  if (f < start) return null;
  const x = f - start;
  const w = Math.min(smooth(x / 0.55), smooth((EMOTE_SEC - x) / 0.55));
  return w > 0 ? { name, w, t: x } : null;
}

export function createNpcFigures(opts) {
  const o = opts || {};
  let tier = FIGURE_TIERS[o.tier] ? o.tier : 'high';
  let reduced = !!o.reducedMotion;
  const group = new THREE.Group();
  group.name = 'kesif-npc-figurleri';
  const pool = [];
  const figs = new Map();
  const st = { builds: 0, heroes: 0, draws: 0, tris: 0 };
  let buildBudget = 1;

  function lookKey(l) {
    return JSON.stringify([l.body, l.skin, l.hair, l.top, l.bottom, l.shoes, l.acc]);
  }

  function slotFor(look) {
    const key = lookKey(look);
    let free = pool.find((s) => !s.fig && s.key === key);
    if (free) return free;
    free = pool.find((s) => !s.fig);
    if (!free) {
      if (buildBudget <= 0) return null;
      buildBudget--;
      st.builds++;
      const c = createCharacter(look, { detail: 'low' });
      c.root.visible = false;
      group.add(c.root);
      free = { char: c, fig: null, key };
      pool.push(free);
      return free;
    }
    if (buildBudget <= 0) return null;
    buildBudget--;
    st.builds++;
    free.char.setConfig(look);
    free.key = key;
    return free;
  }

  function release(f) {
    const s = f.slot;
    s.fig = null;
    s.char.root.visible = false;
    figs.delete(f.id);
  }

  function sync(list, nowSec) {
    buildBudget = 1;
    const cfg = FIGURE_TIERS[tier];
    const want = new Map();
    let draws = 0;
    let n = 0;
    const sorted = list.slice().sort((a, b) => a.dist - b.dist || (a.id < b.id ? -1 : 1));
    for (let i = 0; i < sorted.length && n < cfg.max; i++) {
      const d = sorted[i];
      const cost = d.dist < NEAR_GLOW ? 4 : d.dist < NEAR_GLOSS ? 3 : 2;
      if (draws + cost > cfg.draws) continue;
      draws += cost;
      n++;
      want.set(d.id, d);
    }
    // ayrılanlar küçülerek çıkar
    figs.forEach((f) => {
      if (!want.has(f.id)) f.leaving = true;
      else {
        f.leaving = false;
        const d = want.get(f.id);
        f.target.x = d.x; f.target.y = d.y; f.target.z = d.z;
      }
    });
    // yeniler
    want.forEach((d, id) => {
      if (figs.has(id)) return;
      const slot = slotFor(d.look);
      if (!slot) return;
      const f = {
        id,
        slot,
        look: d.look,
        x: d.x,
        y: d.y,
        z: d.z,
        target: { x: d.x, y: d.y, z: d.z },
        yaw: d.yaw,
        faceYaw: null,
        baseYaw: d.yaw,
        s: o.reducedMotion || reduced ? 1 : 0,
        leaving: false,
        emotes: d.emotes || [],
        h: d.h >>> 0,
        scale: d.look.scale || 1,
        phase: nowSec,
        light: 1,
        lightAt: -9,
      };
      slot.fig = f;
      slot.char.root.visible = true;
      slot.char.root.position.set(f.x, f.y, f.z);
      slot.char.root.rotation.y = f.yaw;
      figs.set(id, f);
    });
  }

  function update(dt, nowSec, env) {
    const e = env || {};
    let draws = 0;
    let tris = 0;
    let heroes = 0;
    const leave = [];
    figs.forEach((f) => {
      const c = f.slot.char;
      // ölçek giriş/çıkış
      if (reduced) f.s = f.leaving ? 0 : 1;
      else f.s += ((f.leaving ? -1 : 1) * dt) / SCALE_IN;
      f.s = f.s < 0 ? 0 : f.s > 1 ? 1 : f.s;
      if (f.leaving && f.s <= 0) { leave.push(f); return; }
      f.x = f.target.x; f.y = f.target.y; f.z = f.target.z;
      const dx = (e.px === undefined ? f.x : e.px) - f.x;
      const dz = (e.pz === undefined ? f.z : e.pz) - f.z;
      const dist = Math.hypot(dx, dz);
      // gövde yönü
      // dikkat: oyuncu yakındaysa (≤ 6 m) gövde yavaşça ona döner; uzaklaşınca duruşuna geri döner
      let want = f.faceYaw !== null ? f.faceYaw : f.baseYaw;
      if (f.faceYaw === null && !reduced && dist < ATTENTION_R && dist > 0.4) want = Math.atan2(-dx, -dz);
      f.yaw = reduced ? want : wrapAngle(f.yaw + wrapAngle(want - f.yaw) * dampK(dt, f.faceYaw !== null ? 7 : 3));
      const root = c.root;
      root.position.set(f.x, f.y, f.z);
      root.rotation.y = f.yaw;
      root.scale.setScalar(Math.max(0.001, smooth(f.s)) * f.scale);
      // poz
      const t = nowSec - f.phase;
      c.pose('idle', t);
      const rig = c.rig;
      if (f.faceYaw === null && !reduced) {
        const em = emoteAt(f.emotes, f.h, nowSec);
        if (em) EMOTE_FN[em.name](rig, nowSec, em.w);
      }
      // oyuncuya bakış (başı çevir): gövde yönüne göre bağıl açı
      if (dist < 9) {
        const toPlayer = Math.atan2(-dx, -dz);
        const rel = wrapAngle(toPlayer - f.yaw);
        const k = dist < 9 ? 1 - dist / 9 : 0;
        const look = Math.max(-0.85, Math.min(0.85, rel * 0.6)) * (0.35 + 0.65 * k);
        rig.head.rotation.y += look;
        rig.neck.rotation.y += look * 0.4;
      }
      // ışık
      if (e.light && nowSec - f.lightAt > 0.25) {
        f.lightAt = nowSec;
        const lv = e.light(f.x, f.y + 1, f.z);
        if (Number.isFinite(lv)) f.light += (lv - f.light) * 0.6;
        c.setLight(f.light);
      }
      // LOD: çizim çağrısı bütçesi
      const meshes = c.meshes;
      let dc = 0;
      for (let i = 0; i < meshes.length; i++) {
        const m = meshes[i];
        let vis = true;
        if (m.name === 'character_glow') vis = dist < NEAR_GLOW;
        else if (m.name === 'character_gloss') vis = dist < NEAR_GLOSS;
        m.visible = vis;
        if (vis) dc++;
      }
      draws += dc;
      tris += c.triangles;
      heroes++;
    });
    leave.forEach(release);
    st.heroes = heroes;
    st.draws = draws;
    st.tris = tris;
  }

  return {
    group,
    sync,
    update,
    setTier(t) { if (FIGURE_TIERS[t]) tier = t; },
    get tier() { return tier; },
    setReducedMotion(v) { reduced = !!v; },
    faceTarget(id, x, z) {
      const f = figs.get(id);
      if (!f) return false;
      const dx = x - f.x;
      const dz = z - f.z;
      if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return false;
      f.faceYaw = Math.atan2(-dx, -dz);
      return true;
    },
    clearFace(id) {
      const f = figs.get(id);
      if (f) f.faceYaw = null;
    },
    has: (id) => figs.has(id),
    get(id) {
      const f = figs.get(id);
      if (!f) return null;
      return {
        x: f.x, y: f.y, z: f.z, yaw: f.yaw, eyeY: f.y + 1.62 * f.scale, scale: f.scale, visible: f.s > 0.05 && !f.leaving,
      };
    },
    stats: () => ({
      heroes: st.heroes, draws: st.draws, tris: st.tris, builds: st.builds, pool: pool.length,
    }),
    dispose() {
      figs.clear();
      pool.forEach((s) => {
        group.remove(s.char.root);
        s.char.dispose();
      });
      pool.length = 0;
    },
  };
}
