/*
 * KEŞİF mobs sistemi — yaratık/boss model görünümleri (havuzlu, enterpolasyonlu, LOD'lu).
 *
 *   createMobViews(G, opts) → { afterStep(), update(dt, alpha, cam), dispose(), stats, viewOf(id), count }
 *
 *  - Her em.mobs varlığı için yakındaysa (≈62 blok, boss ≈120) render/mobModels.createMobModel modeli kurulur; uzaklaşınca / varlık
 *    kalkınca tür başına en çok POOL_PER_TYPE modelden oluşan havuza döner (geometri paylaşımlı; yeniden kullanımda model.reset()).
 *  - afterStep(): her sabit adımdan sonra önceki/şimdiki konum anlık görüntüsü; update(): alpha ile enterpolasyon.
 *  - Görünürlük: yüklenmemiş chunk, kameranın arkası, gömülmüş (hidden) yaratıklar ve kalite kademesinin sınırını aşan uzak olanlar
 *    (en yakın 12/20/32 model çizilir; boss hariç) çizilmez/animasyonlanmaz; uzaktakilerin animasyonu
 *    2–3 karede bir (dt birikir). model.updateLod(dist) ile ayrıntı kademesi düşer. Kare başına en çok 2 model kurulur.
 *  - Ses: saldırı başlangıcı (mob:<tür>:attack), rastgele ara ses (idle), yakın yaratıkların düşük hızlı adım sesleri.
 *  - Mağarada gövde kararır (litMats rengi ← dünya ışığı).
 */
import { createMobModel } from '../render/mobModels.js';
import { createBoneAtlas } from '../render/mobBones.js';
import { toModelState } from '../sim/entities.js';
import { BLOCKS } from '../sim/blocks.js';
import { capDistance, litFactor, modelCapFor } from './mobsLogic.js';

const MAX_VIEWS = 64;
const POOL_PER_TYPE = 5;
const CREATE_PER_FRAME = 2;
const NEAR = 62;
const NEAR_BOSS = 120;
const HYST = 8;
const MAX_SOUNDS_PER_FRAME = 4;
const TAU = Math.PI * 2;

function wrapPi(a) {
  let r = a % TAU;
  if (r > Math.PI) r -= TAU;
  else if (r < -Math.PI) r += TAU;
  return r;
}

/** Hızlı belirlenimci [0,1) (görsel zamanlayıcılar için). */
export function vis01(a, b) {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Güncelleme sıklığı: yakın her kare, orta 2'de bir, uzak 3'te bir. */
export function updateEvery(dist) {
  return dist < 30 ? 1 : dist < 52 ? 2 : 3;
}

export function qualityName(G) {
  const s = G.quality && G.quality.settings ? G.quality.settings : null;
  const t = s ? (s.effTier || s.tier) : 'medium';
  return t === 'low' || t === 'high' ? t : 'medium';
}

export function createMobViews(G, opts) {
  const o = opts || {};
  const THREE = G.THREE;
  const em = G.em;
  const world = G.world;
  const root = G.entityRoot;
  const views = new Map();
  const pool = new Map();
  const boneAtlas = createBoneAtlas(THREE); // birleşik yaratıkların kemik matrisleri: kare başına tek doku yüklemesi
  const stats = {
    views: 0, visible: 0, created: 0, reused: 0, pooled: 0, frameMs: 0, cap: 0,
  };
  const spos = { x: 0, y: 0, z: 0 };
  const modelState = {};
  const camV = { x: 0, y: 0, z: 0, fx: 0, fz: -1 };
  let quality = qualityName(G);
  let qualityT = 1;
  let frameId = 0;
  let created = 0;
  let sounds = 0;
  let dtNow = 0;
  let alphaNow = 1;
  let disposed = false;
  const gone = [];
  const distBuf = new Float32Array(MAX_VIEWS + 8);
  const sortBuf = new Float32Array(MAX_VIEWS + 8);
  let nDist = 0;
  let capDist = Infinity;
  let cap = modelCapFor(qualityName(G), G.settings && G.settings.maxMobModels);
  const reducedMotion = () => !!(G.reducedMotion || G.accessibility);

  function sound(name, e, vol, pitch) {
    if (sounds >= MAX_SOUNDS_PER_FRAME) return;
    sounds++;
    spos.x = e.x; spos.y = e.y + e.h * 0.5; spos.z = e.z;
    G.sound(name, spos, { vol, pitch });
  }

  function takeModel(e) {
    const list = pool.get(e.key);
    let model = null;
    if (list && list.length > 0) {
      model = list.pop();
      model.reset();
      model.setQuality(quality);
      stats.reused++;
    } else {
      model = createMobModel(THREE, e.key, {
        quality,
        seed: e.id,
        reducedMotion: reducedMotion(),
        boneAtlas,
        onCue: e.def.boss && o.onBossCue ? (name, info) => o.onBossCue(name, info, e) : undefined,
      });
      stats.created++;
    }
    model.root.visible = false;
    if (model.root.parent !== root) root.add(model.root);
    return model;
  }

  function giveBack(model, key) {
    model.root.visible = false;
    let list = pool.get(key);
    if (!list) {
      list = [];
      pool.set(key, list);
    }
    if (list.length < POOL_PER_TYPE) {
      list.push(model);
    } else {
      model.dispose();
    }
  }

  function openView(e) {
    const model = takeModel(e);
    const v = {
      id: e.id,
      ent: e,
      key: e.key,
      model,
      px: e.x, py: e.y, pz: e.z, pyaw: e.yaw,
      cx: e.x, cy: e.y, cz: e.z, cyaw: e.yaw,
      seen: frameId,
      shown: false,
      updAcc: 0,
      updN: 0,
      attackPrev: false,
      idleT: 2 + vis01(e.id, 7) * 8,
      stepAcc: 0,
      lightT: 0,
      lightF: 1,
      lastX: e.x, lastZ: e.z,
    };
    views.set(e.id, v);
    return v;
  }

  function closeView(v) {
    giveBack(v.model, v.key);
    views.delete(v.id);
  }

  function applyLight(v, e) {
    const x = Math.floor(e.x);
    const y = Math.floor(e.y + e.h * 0.5);
    const z = Math.floor(e.z);
    const l = world.getLight(x, y, z);
    const f = litFactor(l >> 4, l & 15);
    if (Math.abs(f - v.lightF) < 0.04) return;
    v.lightF = f;
    const mats = v.model.rig.litMats;
    for (let i = 0; i < mats.length; i++) mats[i].color.setScalar(f);
  }

  function stepSound(v, e, dist) {
    if (dist > 14 || !e.onGround || e.def.boss || e.def.movement === 'uç' || e.def.movement === 'yüz' || e.dead) return;
    const dx = e.x - v.lastX;
    const dz = e.z - v.lastZ;
    v.lastX = e.x;
    v.lastZ = e.z;
    const moved = Math.sqrt(dx * dx + dz * dz);
    if (moved > 1 || moved < 0.001) return;
    v.stepAcc += moved;
    const stride = 0.9 + e.w * 0.9;
    if (v.stepAcc < stride) return;
    v.stepAcc = 0;
    const id = world.getBlock(Math.floor(e.x), Math.floor(e.y - 0.1), Math.floor(e.z));
    const b = id ? BLOCKS[id] : null;
    const mat = b && b.sound ? b.sound : 'çim';
    if (sounds >= MAX_SOUNDS_PER_FRAME) return;
    sounds++;
    spos.x = e.x; spos.y = e.y; spos.z = e.z;
    G.sound('step:' + mat, spos, { vol: Math.min(0.42, 0.14 + e.w * 0.14) * (1 - dist / 16), pitch: 0.85 + vis01(e.id, G.time.tick) * 0.3 });
  }

  function drive(v, e, dist, visible) {
    const m = v.model;
    // saldırı başlangıcı sesi
    const atk = !!e.attacking && !e.dead;
    if (atk && !v.attackPrev && dist < 50) sound('mob:' + e.key + ':attack', e, e.def.boss ? 1 : 0.85, e.def.boss ? 0.92 : 1);
    v.attackPrev = atk;
    // ara ses
    v.idleT -= dtNow;
    if (v.idleT <= 0) {
      v.idleT = e.def.boss ? 9 + vis01(e.id, G.time.frame) * 8 : 7 + vis01(e.id, G.time.frame) * 12;
      if (dist < 26 && !e.dead && !e.hidden && !(e.def.hostile && !e.target && G.player.dead)) sound('mob:' + e.key + ':idle', e, e.def.boss ? 0.9 : 0.6, 1);
    }
    stepSound(v, e, dist);
    if (!visible) {
      v.updAcc += dtNow;
      return;
    }
    // ışık (≈4 Hz, kademeli)
    v.lightT -= dtNow;
    if (v.lightT <= 0) {
      v.lightT = 0.25 + vis01(e.id, 3) * 0.1;
      applyLight(v, e);
    }
    // animasyon (uzakta seyrek)
    v.updAcc += dtNow;
    v.updN++;
    const every = updateEvery(dist);
    if (e.dead || v.updN >= every || e.hurt) {
      v.updN = 0;
      toModelState(e, modelState);
      m.update(v.updAcc, modelState);
      v.updAcc = 0;
    }
    m.updateLod(dist);
  }

  function visit(e) {
    if (e.removed) return;
    const dx = e.x - camV.x;
    const dz = e.z - camV.z;
    const d2 = dx * dx + dz * dz;
    const lim = e.def.boss ? NEAR_BOSS : NEAR;
    let v = views.get(e.id);
    if (!v) {
      if (d2 > lim * lim || views.size >= MAX_VIEWS || created >= CREATE_PER_FRAME) return;
      if (!world.hasChunk(Math.floor(e.x) >> 4, Math.floor(e.z) >> 4)) return;
      v = openView(e);
      created++;
    } else if (d2 > (lim + HYST) * (lim + HYST)) {
      return; // görülmedi sayılır → aşağıda kapanır
    }
    v.seen = frameId;
    const dist = Math.sqrt(d2);
    // konum enterpolasyonu
    const a = alphaNow;
    const x = v.px + (v.cx - v.px) * a;
    const y = v.py + (v.cy - v.py) * a;
    const z = v.pz + (v.cz - v.pz) * a;
    const yaw = v.pyaw + wrapPi(v.cyaw - v.pyaw) * a;
    const mr = v.model.root;
    mr.position.set(x, y, z);
    mr.rotation.y = yaw;
    // görünürlük
    let visible = !e.hidden;
    if (visible && !world.hasChunk(Math.floor(x) >> 4, Math.floor(z) >> 4)) visible = false;
    if (visible && dist > 3) {
      const reach = Math.max(e.w, e.h) + 2.5;
      if (dx * camV.fx + dz * camV.fz < -reach) visible = false; // kameranın arkasında
    }
    // çizim bütçesi: boss dışında en yakın `cap` model çizilir (çizim çağrısı ≲ 250)
    if (visible && !e.def.boss) {
      if (nDist < distBuf.length) distBuf[nDist++] = dist;
      if (dist > capDist && dist > 9) visible = false;
    }
    if (mr.visible !== visible) mr.visible = visible;
    if (visible) stats.visible++;
    drive(v, e, dist, visible);
  }

  const visitCb = (e) => visit(e);
  const goneCb = (v) => {
    if (v.seen !== frameId) gone.push(v);
  };

  return {
    stats,
    boneAtlas,
    get count() { return views.size; },
    viewOf(id) { return views.get(id) || null; },
    /** Isınma modelini havuza ekler (tür başına en çok POOL_PER_TYPE; fazlası atılır). */
    adopt(model) {
      if (disposed) {
        model.dispose();
        return;
      }
      model.root.visible = false;
      giveBack(model, model.type);
    },
    /** Sabit adım sonu: konum anlık görüntüsü (enterpolasyon için). */
    afterStep() {
      views.forEach((v) => {
        const e = v.ent;
        v.px = v.cx; v.py = v.cy; v.pz = v.cz; v.pyaw = v.cyaw;
        if (e.removed) return;
        v.cx = e.x; v.cy = e.y; v.cz = e.z; v.cyaw = e.yaw;
      });
    },
    update(dt, alpha, cam, look) {
      if (disposed) return;
      frameId++;
      created = 0;
      sounds = 0;
      dtNow = dt > 0.1 ? 0.1 : dt;
      alphaNow = alpha;
      stats.visible = 0;
      nDist = 0;
      camV.x = cam.x; camV.y = cam.y; camV.z = cam.z;
      const fl = Math.sqrt(look.x * look.x + look.z * look.z);
      if (fl > 0.05) {
        camV.fx = look.x / fl;
        camV.fz = look.z / fl;
      }
      qualityT -= dtNow;
      if (qualityT <= 0) {
        qualityT = 1;
        const q = qualityName(G);
        if (q !== quality) {
          quality = q;
          views.forEach((v) => v.model.setQuality(q));
        }
        cap = modelCapFor(q, G.settings && G.settings.maxMobModels);
      }
      em.mobs.forEach(visitCb);
      capDist = capDistance(distBuf, nDist, cap, sortBuf);
      stats.cap = cap;
      // kemik matrisleri: görünür yaratıkların dilimleri ortak dokuya yazılır (tek yükleme); kapasite dolarsa fazlası çizilmez
      boneAtlas.begin();
      views.forEach((v) => {
        const rig = v.model.rig;
        if (rig.atlas && v.model.root.visible && boneAtlas.add(rig) < 0) v.model.root.visible = false;
      });
      boneAtlas.end();
      gone.length = 0;
      views.forEach(goneCb);
      for (let i = 0; i < gone.length; i++) closeView(gone[i]);
      gone.length = 0;
      stats.views = views.size;
      let pooled = 0;
      pool.forEach((l) => { pooled += l.length; });
      stats.pooled = pooled;
    },
    clear() {
      views.forEach((v) => giveBack(v.model, v.key));
      views.clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      boneAtlas.dispose();
      views.forEach((v) => v.model.dispose());
      views.clear();
      pool.forEach((l) => { for (let i = 0; i < l.length; i++) l[i].dispose(); l.length = 0; });
      pool.clear();
    },
  };
}
