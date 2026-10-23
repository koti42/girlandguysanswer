/*
 * KEŞİF render — yaratık ve boss modelleri (çekirdek).
 *
 *   createMobModel(THREE, type, {quality, seed, variant, reducedMotion, onCue}) →
 *     {root, type, def, hitbox, update(dt, state), setState(patch), hitFlash(), deathDissolve(t), reset(),
 *      setDetail(q), updateLod(dist), stats(), dispose(), bounds, deathProgress, deathDone, ...}
 *
 * Model önü -Z'dir; çağıran root.position/root.rotation.y'yi (entity x,y,z,yaw) sürer, root.scale'e dokunulmaz.
 * Gövde ölçüleri sim/mobTypes.js hitbox'ına uyar (ayak noktası y=0, merkez x=z=0).
 *
 * update(dt, state) / setState(patch) durum alanları (hepsi isteğe bağlı):
 *   speed      yatay hız (blok/sn) → yürüyüş fazı (ayak kayması yok)
 *   attacking  true | saldırı adı ('ezme','sarmaşık','şok','mızrak','zıplama','tipi','ışın','çağır','ışınlan' …)
 *   attackKind saldırı adı (attacking=true iken)
 *   hurt       true olunca vuruş parlaması (yükselen kenar); hitFlash() ile aynı
 *   dead       true → küçül + yayılan parıltıyla çözül (kan yok); ~1,1 sn sonra root.visible=false, deathDone=true
 *   phase      boss aşaması 0..2 (yumuşak geçiş)
 *   aim        gövdeye göre bakış/nişan: {yaw, pitch} (rad) | {x,y,z} yerel yön (ön -Z) | sayı (yalnız yaw) | null
 *
 * onCue(name, info): 'step' (ağır adım), 'slam' (yer darbesi), 'vine' (sarmaşık kamçısı), 'spear' (buz mızrağı), 'beam' (ışın),
 *   'shoot' (ok bırakıldı), 'teleport', 'roar' (kükreme/çağrı), 'death' (çözülme başladı).
 *   info: {x,y,z (dünya), type, scale, color (parıltı rengi, hex)} — yeniden kullanılan nesne; saklama.
 */
import { MOB_TYPES, ROBOT_TYPES, normalizeMobKey } from '../sim/mobTypes.js';
import {
  clamp, damp, detailLevel, easeIn, easeOut, getKit, hash1, seedOf, smoothstep,
} from './mobGeo.js';
import { PASSIVE_BUILDERS } from './mobPassive.js';
import { PASSIVE_BIOME_BUILDERS } from './mobPassiveBiome.js';
import { HOSTILE_BUILDERS } from './mobHostile.js';
import { BOSS_BUILDERS_A } from './mobBossA.js';
import { BOSS_BUILDERS_B } from './mobBossB.js';
import { ROBOT_BUILDERS } from './robotModels.js';

export { MOB_TYPES };

/** Tür anahtarı → model kurucu (rig, def) → anim(s, dt). */
export const MODEL_BUILDERS = Object.freeze({
  ...PASSIVE_BUILDERS,
  ...PASSIVE_BIOME_BUILDERS,
  ...HOSTILE_BUILDERS,
  ...BOSS_BUILDERS_A,
  ...BOSS_BUILDERS_B,
});

/** Tür başına renk/boyut varyantı sayısı (tohumdan seçilir). */
export const MOB_VARIANTS = Object.freeze({
  tavuk: 3, koyun: 3, ormankedisi: 3, ceylan: 2, balik: 4, kelebek: 4, tilki: 3, kurbaga: 3, papagan: 3,
});

/** Birleşik deri varsayılanı (test/karşılaştırma anahtarı: setMobMergeDefault(false) → eski ayrı ağ yolu). */
let mergeDefault = true;
export function setMobMergeDefault(on) {
  mergeDefault = !!on;
}

const DEATH_DUR = 1.1;
const ROBOT_DEATH_DUR = 0.6; // Neon Meridyen robotları 0,6 sn'de parçalarına dağılır (sözleşme §2)
const FLASH_DECAY = 4.2;
const TAU = Math.PI * 2;

/** Bilinmeyen tür için güvenli yedek: küçük ışıldayan küre. */
function buildUnknown(rig) {
  rig.part('orb', null, [0, 0.4, 0], (b, g) => {
    b.ellipsoid(0.22, 0.22, 0.22, { c: 0x6a5acd, c2: 0x3a2f8a });
    g.ellipsoid(0.1, 0.1, 0.1, { c: 0xffffff, i: 2 });
  });
  rig.attackDur = 0.6;
  return (s) => {
    rig.n.orb.position.y = 0.4 + Math.sin(s.t * 2) * 0.06;
  };
}

/**
 * Görünür ağların hassas sınır kutusu (görünmez düğümler ve halo sprite'ları sayılmaz).
 * Dinlenme pozunda çağrılır; hitbox karşılaştırması için.
 */
export function measureBounds(THREE, root) {
  const box = new THREE.Box3();
  const pt = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  const walk = (o) => {
    if (!o.visible || o.isSprite) return;
    if (o.isSkinnedMesh && o.geometry && o.geometry.userData && o.geometry.userData.support) {
      // birleşik deri: kemik başına uç noktalar (önbellekte) güncel kemik matrisiyle dönüştürülür (tepe tepe deri hesabı yerine)
      const sp = o.geometry.userData.support;
      const bones = o.skeleton.bones;
      for (let i = 0; i < sp.bones.length; i++) {
        pt.set(sp.pts[i * 3], sp.pts[i * 3 + 1], sp.pts[i * 3 + 2]).applyMatrix4(bones[sp.bones[i]].matrixWorld);
        box.expandByPoint(pt);
      }
    } else if (o.isMesh && o.geometry) box.expandByObject(o, true);
    for (let i = 0; i < o.children.length; i++) walk(o.children[i]);
  };
  walk(root);
  return box;
}

/**
 * Yaratık modeli kurar. quality: 'low'|'medium'|'high' (ya da 0..2).
 * Aynı tür/varyant/detaydaki modeller geometriyi paylaşır; dispose() sayaçları düşürür.
 */
export function createMobModel(THREE, type, opts = {}) {
  const kit = getKit(THREE);
  const key = normalizeMobKey(type);
  const def = key ? (MOB_TYPES[key] || ROBOT_TYPES[key]) : null;
  const deathDur = def && def.robot ? ROBOT_DEATH_DUR : DEATH_DUR;
  let baseLevel = detailLevel(opts.quality);
  const seed = opts.seed === undefined ? seedOf(String(key || type)) : (opts.seed | 0);
  const nv = (key && MOB_VARIANTS[key]) || 1;
  const variant = opts.variant !== undefined ? ((opts.variant % nv) + nv) % nv : Math.floor(hash1(seed * 0.37) * nv) % nv;
  const reduced = !!opts.reducedMotion;
  // Boss dışındaki yaratıkların parçaları malzeme başına tek deriye birleşir (çizim çağrısı ≈ 3/yaratık); opts.merge ile zorlanır
  const merge = opts.merge !== undefined ? !!opts.merge : mergeDefault && !(def && def.boss);
  const rig = new kit.Rig({
    key: key || 'bilinmeyen', level: baseLevel, variant, seed, reducedMotion: reduced, merge, boneAtlas: opts.boneAtlas,
  });
  const builder = key ? (MODEL_BUILDERS[key] || ROBOT_BUILDERS[key]) : buildUnknown;
  const animate = builder(rig, def);
  rig.finish(); // birleşik mod: dinlenme pozu kaydı + iskelet (animasyon ilk karesinden ÖNCE)

  const root = new THREE.Group();
  root.name = 'mob:' + (key || 'bilinmeyen');
  const holder = new THREE.Group();
  holder.name = 'holder';
  holder.add(rig.root);
  root.add(holder);
  const modelScale = def ? def.modelScale : 1;
  holder.scale.setScalar(modelScale);
  const hitbox = def ? def.hitbox : { w: 0.5, h: 0.8 };
  const bodyH = hitbox.h;
  const lodFar = def && def.boss ? 90 : 36;
  const lodMid = def && def.boss ? 55 : 20;

  /* ---- durum ---- */
  const st = {
    speed: 0, attacking: false, attackKind: null, hurt: false, dead: false, phase: 0, aimYaw: 0, aimPitch: 0, hasAim: false,
  };
  const r0 = hash1(seed * 1.7);
  const s = {
    t: r0 * 30, dt: 0, rig,
    speed: 0, moving: 0, walk: r0 * TAU,
    attack: 0, attacking: false, attackKind: null, attackN: 0, wind: 0, hit: 0,
    hurt: 0, phase: 0, pf: 0, aimYaw: 0, aimPitch: 0, hasAim: false,
    headYaw: 0, headPitch: 0, lookYaw: 0, lookPitch: 0, lookT: 1 + r0 * 2,
    blink: 0, blinkT: 1 + r0 * 3, blinkClock: 0,
    reduced, level: baseLevel, variant, def, scale: modelScale, dead: 0,
  };
  let atkT = 0;
  let atkActive = false;
  let prevHurt = false;
  let prevDead = false;
  let deathT = 0;
  let deathForced = -1;
  let forcedTransparent = false;
  let level = baseLevel;
  let disposed = false;

  const info = { x: 0, y: 0, z: 0, type: key, scale: modelScale, color: rig.deathColor, model: null };
  const _v = new THREE.Vector3();
  rig.onCue = (name, x, y, z) => {
    if (!opts.onCue) return;
    root.updateWorldMatrix(true, false);
    _v.set(x, y, z).applyMatrix4(holder.matrixWorld);
    info.x = _v.x; info.y = _v.y; info.z = _v.z;
    info.color = name === 'death' ? rig.deathColor : rig.glowColor;
        opts.onCue(name, info);
  };

  function setState(p) {
    if (!p) return;
    if (p.speed !== undefined) st.speed = p.speed > 0 ? p.speed : 0;
    if (p.attacking !== undefined) {
      if (typeof p.attacking === 'string') { st.attacking = true; st.attackKind = p.attacking; } else st.attacking = !!p.attacking;
    }
    if (p.attackKind !== undefined) st.attackKind = p.attackKind;
    if (p.hurt !== undefined) st.hurt = !!p.hurt;
    if (p.dead !== undefined) st.dead = !!p.dead;
    if (p.phase !== undefined) st.phase = clamp(p.phase, 0, 2);
    if (p.aim !== undefined) {
      const a = p.aim;
      if (typeof a === 'number' && Number.isFinite(a)) { st.aimYaw = a; st.aimPitch = 0; st.hasAim = true; } else if (a && typeof a === 'object') {
        if (a.yaw !== undefined || a.pitch !== undefined) { st.aimYaw = a.yaw || 0; st.aimPitch = a.pitch || 0; st.hasAim = true; } else if (a.x !== undefined && a.z !== undefined) {
          st.aimYaw = Math.atan2(-a.x, -a.z);
          st.aimPitch = Math.atan2(a.y || 0, Math.hypot(a.x, a.z) || 1e-6);
          st.hasAim = true;
        } else st.hasAim = false;
      } else st.hasAim = false;
    }
  }

  function hitFlash(strength = 1) {
    s.hurt = Math.max(s.hurt, clamp(strength, 0, 1));
  }

  /* ---- malzeme uygulaması ---- */
  const lit = rig.litMats;
  const glow = rig.glowMats;
  function applyMaterials(d) {
    const flash = s.hurt * (reduced ? 0.55 : 0.9);
    const dg = d > 0 ? smoothstep(0, 0.55, d) * (1 - smoothstep(0.7, 1, d)) * 1.4 : 0;
    const dcol = rig.deathColor;
    const dr = ((dcol >> 16) & 255) / 255;
    const dgc = ((dcol >> 8) & 255) / 255;
    const db = (dcol & 255) / 255;
    const alpha = d > 0 ? 1 - smoothstep(0.35, 1, d) : 1;
    for (let i = 0; i < lit.length; i++) {
      const m = lit[i];
      const be = m.userData.baseEmissive;
      m.emissive.setRGB(
        be.r + flash * 1.0 + dg * dr,
        be.g + flash * 0.78 + dg * dgc,
        be.b + flash * 0.6 + dg * db,
      );
      if (d > 0) {
        if (!m.transparent) { m.transparent = true; m.needsUpdate = true; forcedTransparent = true; }
        m.opacity = m.userData.baseOpacity * alpha;
      }
    }
    for (let i = 0; i < glow.length; i++) {
      const m = glow[i];
      const k = m.userData.k;
      if (d > 0) {
        if (!m.transparent) { m.transparent = true; m.needsUpdate = true; forcedTransparent = true; }
        m.opacity = m.userData.baseOpacity * alpha;
        m.color.copy(m.userData.baseColor).multiplyScalar(k * (1 + dg * 0.6));
      } else {
        m.color.copy(m.userData.baseColor).multiplyScalar(k * (1 + flash * 0.25));
      }
    }
  }

  function restoreMaterials() {
    if (!forcedTransparent) return;
    for (let i = 0; i < lit.length; i++) {
      lit[i].transparent = lit[i].userData.baseTransparent;
      lit[i].opacity = lit[i].userData.baseOpacity;
      lit[i].needsUpdate = true;
    }
    for (let i = 0; i < glow.length; i++) {
      glow[i].transparent = glow[i].userData.baseTransparent;
      glow[i].opacity = glow[i].userData.baseOpacity;
      glow[i].needsUpdate = true;
    }
    forcedTransparent = false;
  }

  /** Çözülme ilerlemesini doğrudan ayarlar: 0 = sağlam, 1 = yok. */
  function deathDissolve(t) {
    const d = clamp(t, 0, 1);
    deathForced = d;
    applyDeath(d);
  }

  function applyDeath(d) {
    s.dead = d;
    if (d <= 0) {
      holder.scale.setScalar(modelScale);
      holder.position.set(0, 0, 0);
      holder.rotation.y = 0;
      root.visible = true;
      restoreMaterials();
      applyMaterials(0);
      return;
    }
    const sc = modelScale * (1 - 0.93 * easeIn(d));
    holder.scale.setScalar(Math.max(0.001, sc));
    holder.position.y = (modelScale - sc) * bodyH * 0.5 + d * 0.35;
    holder.rotation.y = reduced ? 0 : d * d * 2.4;
    applyMaterials(d);
    root.visible = d < 0.999;
  }

  /* ---- ana güncelleme ---- */
  function update(dt, state) {
    if (disposed) return;
    if (state) setState(state);
    const h = clamp(dt || 0, 0, 0.1);
    s.dt = h;
    s.t += h;

    // vuruş (yükselen kenar) + sönüm
    if (st.hurt && !prevHurt) hitFlash(1);
    prevHurt = st.hurt;
    s.hurt = Math.max(0, s.hurt - h * FLASH_DECAY);

    // ölüm
    if (st.dead && !prevDead) {
      deathT = 0;
      deathForced = -1;
      rig.cue('death', 0, bodyH * 0.5 / modelScale, 0);
    }
    if (!st.dead && prevDead) { deathT = 0; deathForced = -1; applyDeath(0); }
    prevDead = st.dead;
    if (st.dead || deathForced >= 0) {
      if (deathForced < 0) deathT = Math.min(1, deathT + h / deathDur);
      const d = deathForced >= 0 ? deathForced : deathT;
      applyDeath(d);
      return;
    }

    // hareket
    s.speed = st.speed;
    s.moving = damp(s.moving, clamp(st.speed / Math.max(0.1, def ? def.speed * 0.8 : 3), 0, 1.4), 9, h);
    s.walk += h * st.speed * rig.stride;
    if (s.walk > 1e5) s.walk -= 1e5 - (1e5 % TAU);

    // saldırı
    s.attacking = st.attacking;
    if (st.attacking && !atkActive) {
      atkActive = true; atkT = 0; s.attackN++;
      s.attackKind = st.attackKind || (rig.attackKinds ? rig.attackKinds[s.attackN % rig.attackKinds.length] : null);
    }
    if (atkActive) {
      const dur = (rig.attackDurs && s.attackKind && rig.attackDurs[s.attackKind]) || rig.attackDur;
      atkT += h;
      if (atkT >= dur) {
        if (st.attacking) {
          atkT -= dur; s.attackN++;
          s.attackKind = st.attackKind || (rig.attackKinds ? rig.attackKinds[s.attackN % rig.attackKinds.length] : null);
        } else { atkActive = false; atkT = 0; }
      }
      s.attack = atkActive ? atkT / dur : 0;
    } else s.attack = 0;
    const a = s.attack;
    s.wind = a <= 0 ? 0 : a < 0.4 ? easeOut(a / 0.4) : 1 - smoothstep(0.4, 0.55, a);
    s.hit = a < 0.4 ? 0 : a < 0.55 ? (a - 0.4) / 0.15 : 1 - smoothstep(0.55, 1, a);

    // boss aşaması
    s.phase = st.phase;
    s.pf = damp(s.pf, st.phase, 1.6, h);

    // göz kırpma
    s.blinkClock += h;
    s.blinkT -= h;
    if (s.blinkT <= 0) { s.blinkT = 2 + hash1(s.t * 3.1) * 4; s.blinkClock = 0; }
    s.blink = s.blinkClock < 0.15 ? Math.sin((s.blinkClock / 0.15) * Math.PI) : 0;

    // bakış: nişan varsa o, yoksa yavaş gezinen bakış
    s.lookT -= h;
    if (s.lookT <= 0) {
      s.lookT = 1.4 + hash1(s.t * 1.3 + 4) * 3;
      s.lookYaw = (hash1(s.t * 2.9) - 0.5) * 1.2;
      s.lookPitch = (hash1(s.t * 5.3) - 0.5) * 0.45;
    }
    if (st.hasAim) {
      s.aimYaw = damp(s.aimYaw, st.aimYaw, 10, h);
      s.aimPitch = damp(s.aimPitch, st.aimPitch, 10, h);
    }
    s.hasAim = st.hasAim;
    const glance = reduced ? 0.3 : 1;
    const ty = st.hasAim ? st.aimYaw : s.lookYaw * glance * (1 - clamp(s.moving, 0, 1) * 0.6);
    const tp = st.hasAim ? st.aimPitch : s.lookPitch * glance * (1 - clamp(s.moving, 0, 1) * 0.6);
    s.headYaw = damp(s.headYaw, clamp(ty, -1.1, 1.1), 6, h);
    s.headPitch = damp(s.headPitch, clamp(tp, -0.6, 0.6), 6, h);

    animate(s, h);
    rig.touch(); // birleşik deri: kemik matrisleri yeniden hesaplansın/yüklensin

    // vuruşta çok hafif sarsıntı (kısıtlı harekette yok)
    if (!reduced && s.hurt > 0.02) {
      holder.position.x = Math.sin(s.t * 58) * 0.04 * s.hurt;
      holder.position.z = Math.cos(s.t * 47) * 0.04 * s.hurt;
    } else { holder.position.x = 0; holder.position.z = 0; }
    holder.position.y = 0;
    applyMaterials(0);
  }

  /** Uzaklığa göre detay kademesi (histerezisli). */
  function updateLod(dist) {
    let want = baseLevel;
    const far = level === 0 ? lodFar - 4 : lodFar + 4;
    const mid = level <= 1 && baseLevel > 1 ? lodMid - 3 : lodMid + 3;
    if (dist > far) want = 0;
    else if (dist > mid) want = Math.min(baseLevel, 1);
    if (want !== level) { level = want; rig.setLevel(level); s.level = level; }
    return level;
  }

  /** Şu anki ayrıntı kademesini elle ayarlar (LOD'u elle sürmek için; kalite tavanı değişmez). */
  function setDetail(q) {
    const l = detailLevel(q);
    level = l;
    rig.setLevel(l);
    s.level = l;
  }

  /** Kalite tavanını değiştirir ('low'|'medium'|'high'); uzaklık LOD'u bunun altına iner. */
  function setQuality(q) {
    baseLevel = detailLevel(q);
    setDetail(baseLevel);
  }

  function reset() {
    deathT = 0; deathForced = -1; atkActive = false; atkT = 0;
    prevDead = false; prevHurt = false;
    st.speed = 0; st.attacking = false; st.attackKind = null; st.hurt = false; st.dead = false; st.phase = 0; st.hasAim = false;
    s.hurt = 0; s.attack = 0; s.pf = 0; s.dead = 0;
    applyDeath(0);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    root.removeFromParent();
    rig.dispose();
  }

  // ilk poz (dinamik parçalar geçerli olsun) + dinlenme sınırı
  animate(s, 0);
  applyMaterials(0);
  const bounds = measureBounds(THREE, root);
  const stats0 = rig.stats();

  const model = {
    root,
    type: key,
    def,
    hitbox,
    bounds,
    rig,
    update,
    setState,
    hitFlash,
    deathDissolve,
    reset,
    dispose,
    setDetail,
    setQuality,
    updateLod,
    stats: () => rig.stats(),
    /** İlk kurulumdaki çizim çağrısı / üçgen sayısı. */
    initialStats: stats0,
    get level() { return level; },
    get deathProgress() { return s.dead; },
    get deathDone() { return s.dead >= 0.999; },
    get glowColor() { return rig.glowColor; },
    get deathColor() { return rig.deathColor; },
    get state() { return s; },
  };
  info.model = model;
  return model;
}
