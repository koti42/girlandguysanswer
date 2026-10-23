/*
 * KEŞİF render/props — İÇ MEKÂN PROP ÇİZİCİSİ (three; sim/props PropWorld'ünün `interior:true` tanımlarını çizer). Sözleşme §6, §17.
 *
 *   const ir = createInteriorPropRenderer({THREE, uniforms?, quality?, signAtlas?, createCanvas?, anisotropy?})
 *   ir.group                THREE.Group (sahneye eklenir)
 *   ir.setWorld(pw, {getLight?})    PropWorld bağlar (null = boşalt)
 *   ir.update(dt, camera)   kare başı: ≤10 Hz görünür chunk kümesi, kare başı en çok 1 chunk pişirme, durum/ışık/kapı animasyonu
 *   ir.invalidate() · ir.setQuality('low'|'medium'|'high') · ir.dispose()
 *   ir.stats                {chunks, shown, instances, tris, draws, holo, bakes, lastBakeMs, maxBakeMs, queue, memBytes, updateMs, warm}
 *
 * Tasarım: yüzlerce tanım InstancedMesh ile ≥100 çizim çağrısı üretirdi (bütçe ≤40). Bu çizici her chunk'ın iç mekân proplarını TEK köşe tamponuna
 * pişirir (propBake.js: baytlara paketli öznitelikler, şablon önbelleği) → yakın chunk sayısı kadar çağrı (≤18/12/8) + tüm holo yüzleri için 1 çağrı.
 * Kapı/dolap durumu yerinde bayt yazımıyla (aInst) güncellenir; kayan kapılar CPU'da yumuşatılan açıklıkla (aAnim.w) hareket eder.
 * Bütçe (kademe): yarıçap 44/34/24 blok · chunk 18/12/8 · üçgen 44k/28k/12k · holo 24/16/8 · kare başı ışık tazeleme 40/24/12.
 */
import { createMaterialUniforms } from '../materials.js';
import { createSignAtlas } from './signAtlas.js';
import { BAKED_FRAGMENT, BAKED_HOLO_FRAGMENT, BAKED_VERTEX } from './propShadersBaked.js';
import { getTemplate } from './propGeoInterior.js';
import {
  bakeChunk, bakeHolo, setLight, setOpen, setState,
} from './propBake.js';
import { INTERIOR_DEFS } from '../../sim/props/propDefsInterior.js';
import { SIGN_ENTRIES } from '../../sim/props/propSigns.js';
import { BOARD_ENTRIES, boardTypeOf, pickBoardForProp } from '../../sim/props/propSignsIndoor.js';
import { clueDigitsOf, indoorAtProp } from '../../sim/props/propIndoor.js';
import { hash32 } from '../../sim/rng.js';

export const INTERIOR_TIERS = Object.freeze({
  high: Object.freeze({
    radius: 44, maxChunks: 18, maxTris: 44000, maxHolo: 24, lightPerFrame: 40,
  }),
  medium: Object.freeze({
    radius: 34, maxChunks: 12, maxTris: 28000, maxHolo: 16, lightPerFrame: 24,
  }),
  low: Object.freeze({
    radius: 24, maxChunks: 8, maxTris: 12000, maxHolo: 8, lightPerFrame: 12,
  }),
});

/** Mood tonları → sRGB. 'renkli' örnek başına dönüşümlüdür. */
const MOOD_RGB = Object.freeze({
  mor: [0x8a, 0x5c, 0xff], camgobegi: [0x28, 0xf0, 0xff], mavi: [0x3b, 0x7b, 0xff], yesil: [0x3b, 0xd7, 0x7a], pembe: [0xff, 0x3f, 0xa8],
  kehribar: [0xff, 0xae, 0x2b], beyaz: [0xe8, 0xf4, 0xff], mint: [0x7f, 0xe3, 0xc1], turuncu: [0xff, 0x7a, 0x2b], sicak: [0xff, 0xc8, 0x74],
});
const RAINBOW = [[0xff, 0x3f, 0xa8], [0x28, 0xf0, 0xff], [0xc8, 0xff, 0x3a], [0x8a, 0x5c, 0xff], [0xff, 0xae, 0x2b]];
/** Sokak tabela tonları (SIGN_HUES sırası): camgöbeği, pembe, kehribar, limon. */
const SIGN_RGB = Object.freeze([[0x28, 0xf0, 0xff], [0xff, 0x3f, 0xa8], [0xff, 0xae, 0x2b], [0xc8, 0xff, 0x3a]]);
const SHARED_KEYS = [
  'uTime', 'uMotion', 'uSkyLight', 'uAmbientColor', 'uSunDir', 'uSunColor', 'uBlockLightColor', 'uMinLight', 'uEmission',
  'uFogColor', 'uFogNear', 'uFogFar', 'uSkyColor', 'uHorizonColor', 'uUnderwater',
];
const CADENCE = 0.1;
const MAX_KEEP_EXTRA = 8;
const DOOR_RATE = 3.6;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function moodRgb(hue, id) {
  if (hue === 'renkli') return RAINBOW[hash32(id | 0) % RAINBOW.length];
  return MOOD_RGB[hue] || MOOD_RGB.camgobegi;
}

function makeMaterial(THREE, shared, own, holo) {
  const u = {};
  SHARED_KEYS.forEach((k) => { u[k] = shared && shared[k] ? shared[k] : own.base[k]; });
  u.uWet = shared && shared.uWet ? shared.uWet : { value: 0 };
  u.uSignMap = own.signMap;
  u.uBoardMap = own.boardMap;
  u.uFadeStart = own.fadeStart;
  u.uFadeEnd = own.fadeEnd;
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: BAKED_VERTEX,
    fragmentShader: holo ? BAKED_HOLO_FRAGMENT : BAKED_FRAGMENT,
    side: holo ? THREE.DoubleSide : THREE.FrontSide,
    transparent: !!holo,
    depthWrite: !holo,
    blending: holo ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  m.name = holo ? 'kesif-ic-holo' : 'kesif-ic-prop';
  return m;
}

/** Tipli diziyi KOPYALAMADAN bağlar (Uint8BufferAttribute kopyalar → yerinde bayt yazımı GPU'ya yansımazdı). */
function attr(THREE, kind, array, size, normalized) {
  return new THREE.BufferAttribute(array, size, !!normalized);
}

function geometryOf(THREE, baked) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', attr(THREE, 'f32', baked.pos, 3));
  g.setAttribute('normal', attr(THREE, 'i8', baked.nor, 4, true));
  g.setAttribute('uv', attr(THREE, 'u16', baked.uv, 2, true));
  g.setAttribute('aCol', attr(THREE, 'u8', baked.col, 4, true));
  g.setAttribute('aMat', attr(THREE, 'u8', baked.mat, 4, false));
  g.setAttribute('aInst', attr(THREE, 'u8', baked.inst, 4, false));
  g.setAttribute('aTint', attr(THREE, 'u8', baked.tint, 4, true));
  g.setAttribute('aSign', attr(THREE, 'u16', baked.sign, 4, true));
  g.setAttribute('aLight', attr(THREE, 'u8', baked.light, 4, true));
  g.setAttribute('aAnim', attr(THREE, 'i8', baked.anim, 4, true));
  const mn = baked.bounds.min;
  const mx = baked.bounds.max;
  g.boundingBox = new THREE.Box3(new THREE.Vector3(mn[0], mn[1], mn[2]), new THREE.Vector3(mx[0], mx[1], mx[2]));
  g.boundingSphere = new THREE.Sphere();
  g.boundingBox.getBoundingSphere(g.boundingSphere);
  return g;
}

function markRange(a, start, count) {
  if (a.clearUpdateRanges) a.clearUpdateRanges();
  if (a.addUpdateRange) a.addUpdateRange(start * a.itemSize, count * a.itemSize);
  a.needsUpdate = true;
}

export function createInteriorPropRenderer(o) {
  const THREE = o.THREE;
  let tierKey = INTERIOR_TIERS[o.quality] ? o.quality : 'high';
  let tier = INTERIOR_TIERS[tierKey];
  const ownMain = !o.signAtlas;
  const mainAtlas = o.signAtlas || createSignAtlas({ THREE, createCanvas: o.createCanvas, anisotropy: o.anisotropy });
  let boardAtlas = null;
  const group = new THREE.Group();
  group.name = 'kesif-ic-proplar';
  const base = createMaterialUniforms(THREE);
  const signMap = { value: mainAtlas.texture };
  const boardMap = { value: null };
  const fadeStart = { value: tier.radius - 10 };
  const fadeEnd = { value: tier.radius };
  const bodyMat = makeMaterial(THREE, o.uniforms, { base, signMap, boardMap, fadeStart, fadeEnd }, false);
  const holoMat = makeMaterial(THREE, o.uniforms, { base, signMap, boardMap, fadeStart, fadeEnd }, true);

  const entries = new Map();
  const queue = [];
  const stats = {
    chunks: 0, shown: 0, instances: 0, tris: 0, draws: 0, holo: 0, bakes: 0, lastBakeMs: 0, maxBakeMs: 0, queue: 0, memBytes: 0, updateMs: 0, warm: 0,
  };
  let pw = null;
  let getLight = null;
  let seed = 0;
  let disposed = false;
  let accum = CADENCE;
  let stateAccum = 0;
  let forced = true;
  let verSeen = -1;
  let holoDirty = true;
  let holoMesh = null;
  let lightRound = 0;
  let warmIdx = 0;
  const moodCache = new Map();
  const wanted = [];
  const camPos = { x: 0, y: 64, z: 0 };

  function ensureBoardAtlas() {
    if (boardAtlas) return boardAtlas;
    boardAtlas = createSignAtlas({
      THREE, createCanvas: o.createCanvas, anisotropy: o.anisotropy, entries: BOARD_ENTRIES, size: 1024,
    });
    boardMap.value = boardAtlas.texture;
    return boardAtlas;
  }

  function moodOf(p) {
    const k = ((p.x / 4) | 0) + ',' + ((p.z / 4) | 0);
    let m = moodCache.get(k);
    if (m === undefined) {
      const c = indoorAtProp(seed, p);
      m = c ? { kind: c.kind, hue: (c.it.mood && c.it.mood.hue) || (c.owner && c.owner.mood.hue) || null } : { kind: null, hue: null };
      if (moodCache.size > 400) moodCache.clear();
      moodCache.set(k, m);
    }
    return m;
  }

  function lightOf(p, def) {
    if (!getLight) return [217, 0];
    const l = getLight(Math.floor(p.x), Math.floor(p.y + Math.min(1.5, def.size[1] * 0.5)), Math.floor(p.z));
    if (typeof l !== 'number') return [217, 0];
    return [Math.round(((l >> 4) & 15) / 15 * 255), Math.round((l & 15) / 15 * 255)];
  }

  function itemOf(e) {
    const p = e.prop;
    const d = e.def;
    const h = hash32(p.id);
    const mood = moodOf(p);
    let tint = moodRgb(d.light ? d.light.hue : mood.hue, p.id);
    let mode = 0;
    let sign = null;
    let extra = null;
    if (d.key === 'neon_tabela_ic') {
      const en = SIGN_ENTRIES[p.flags & 0xffff] || SIGN_ENTRIES[0];
      tint = SIGN_RGB[en.hue & 3];
      mode = en.mode;
      sign = mainAtlas.rectOf(en.i);
    } else if (boardTypeOf(d.key)) {
      const b = pickBoardForProp(d, p, mood.kind);
      if (b) {
        tint = SIGN_RGB[b.hue & 3];
        sign = ensureBoardAtlas().rectOf(b.i);
      }
    }
    if (d.mode === 'clue' || d.key === 'ilan_panosu') {
      const dg = clueDigitsOf(seed, p);
      if (dg) extra = { digits: dg };
    }
    return {
      id: p.id,
      tmpl: getTemplate(d, p.variant, extra),
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      state: e.state & 255,
      phase: (h >>> 8) & 255,
      dev: (h >>> 16) & 255,
      mode,
      tint,
      sign,
      light: lightOf(p, d),
      stateful: d.states > 1,
    };
  }

  function scan(cx, cz, ids) {
    const list = [];
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < ids.length; i++) {
      const e = pw.entry(ids[i]);
      if (!e || !e.def.interior) continue;
      list.push(ids[i]);
      if (e.prop.y < minY) minY = e.prop.y;
      if (e.prop.y + e.def.size[1] > maxY) maxY = e.prop.y + e.def.size[1];
    }
    return {
      cx, cz, ids, list, minY, maxY, baked: null, geometry: null, mesh: null, ranges: null, doors: null, lastSeen: 0, shown: false, dist: 0,
    };
  }

  function disposeEntry(en) {
    if (en.mesh) {
      group.remove(en.mesh);
      en.mesh = null;
    }
    if (en.geometry) {
      en.geometry.dispose();
      en.geometry = null;
    }
    en.baked = null;
    en.ranges = null;
    en.doors = null;
    en.shown = false;
  }

  function bake(en) {
    const t0 = now();
    const items = [];
    for (let i = 0; i < en.list.length; i++) {
      const e = pw.entry(en.list[i]);
      if (e && e.def.interior) items.push(itemOf(e));
    }
    const baked = bakeChunk(items, en.cx * 16, en.cz * 16);
    en.baked = baked;
    en.geometry = geometryOf(THREE, baked);
    const mesh = new THREE.Mesh(en.geometry, bodyMat);
    mesh.name = 'ic-' + en.cx + ',' + en.cz;
    mesh.position.set(en.cx * 16, 0, en.cz * 16);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.frustumCulled = true;
    mesh.visible = false;
    group.add(mesh);
    en.mesh = mesh;
    en.ranges = [];
    en.doors = [];
    for (let i = 0; i < baked.ranges.length; i++) {
      const r = baked.ranges[i];
      if (!r.stateful) continue;
      const s = items[i].state;
      const rec = {
        r, state: s, open: s === 1 ? 1 : 0, target: s === 1 ? 1 : 0,
      };
      en.ranges.push(rec);
      if (r.slide) {
        en.doors.push(rec);
        setOpen(baked, r, rec.open);
      }
    }
    const ms = now() - t0;
    stats.bakes++;
    stats.lastBakeMs = ms;
    if (ms > stats.maxBakeMs) stats.maxBakeMs = ms;
    holoDirty = true;
  }

  function refreshSet(cam) {
    wanted.length = 0;
    const R = tier.radius;
    const seen = new Set();
    pw.forEachChunk((cx, cz, ids) => {
      const key = cx * 4096 + cz;
      seen.add(key);
      let en = entries.get(key);
      if (!en || en.ids !== ids) {
        if (en) disposeEntry(en);
        en = scan(cx, cz, ids);
        entries.set(key, en);
      }
      if (en.list.length === 0) return;
      const dx = cam.x < cx * 16 ? cx * 16 - cam.x : cam.x > cx * 16 + 16 ? cam.x - cx * 16 - 16 : 0;
      const dz = cam.z < cz * 16 ? cz * 16 - cam.z : cam.z > cz * 16 + 16 ? cam.z - cz * 16 - 16 : 0;
      const dy = cam.y < en.minY ? en.minY - cam.y : cam.y > en.maxY ? cam.y - en.maxY : 0;
      const d = Math.sqrt(dx * dx + dz * dz + dy * dy * 2.2);
      en.dist = d;
      if (d <= R) wanted.push(en);
    });
    entries.forEach((en, key) => {
      if (!seen.has(key)) {
        disposeEntry(en);
        entries.delete(key);
      }
    });
    wanted.sort((a, b) => a.dist - b.dist);
    if (wanted.length > tier.maxChunks) wanted.length = tier.maxChunks;
    // kuyruk: pişmemiş istenenler, yakından uzağa
    queue.length = 0;
    let tris = 0;
    for (let i = 0; i < wanted.length; i++) {
      const en = wanted[i];
      if (!en.baked) queue.push(en);
      else {
        tris += en.baked.tris;
        if (tris > tier.maxTris) { wanted.length = i; break; }
      }
    }
    // görünürlük
    const keep = new Set(wanted);
    let draws = 0;
    let inst = 0;
    let totalTris = 0;
    let mem = 0;
    let baked = 0;
    entries.forEach((en) => {
      if (!en.baked) return;
      baked++;
      mem += en.baked.bytes;
      const on = keep.has(en);
      en.shown = on;
      en.mesh.visible = on;
      if (on) {
        draws++;
        inst += en.baked.ranges.length;
        totalTris += en.baked.tris;
        en.lastSeen = 0;
      } else en.lastSeen += 1;
    });
    // eskiyen pişmiş chunk'lar atılır (bellek sınırı)
    if (baked > tier.maxChunks + MAX_KEEP_EXTRA) {
      const old = [];
      entries.forEach((en) => { if (en.baked && !en.shown) old.push(en); });
      old.sort((a, b) => b.lastSeen - a.lastSeen);
      for (let i = 0; i < old.length && baked > tier.maxChunks + MAX_KEEP_EXTRA; i++, baked--) disposeEntry(old[i]);
    }
    stats.chunks = baked;
    stats.shown = draws;
    stats.instances = inst;
    stats.tris = totalTris;
    stats.draws = draws + (holoMesh && holoMesh.visible ? 1 : 0);
    stats.memBytes = mem;
    stats.queue = queue.length;
    holoDirty = true;
  }

  function syncStates() {
    let any = false;
    entries.forEach((en) => {
      if (!en.baked || !en.shown) return;
      for (let i = 0; i < en.ranges.length; i++) {
        const rec = en.ranges[i];
        const st = pw.state(rec.r.id);
        if (st !== rec.state) {
          rec.state = st;
          rec.target = st === 1 ? 1 : 0;
          if (setState(en.baked, rec.r, st)) markRange(en.geometry.getAttribute('aInst'), rec.r.v0, rec.r.n);
          any = true;
        }
      }
    });
    if (any) holoDirty = true;
  }

  function animateDoors(dt) {
    entries.forEach((en) => {
      if (!en.baked || !en.shown || !en.doors) return;
      for (let i = 0; i < en.doors.length; i++) {
        const d = en.doors[i];
        if (d.open === d.target) continue;
        const step = DOOR_RATE * dt;
        d.open = d.target > d.open ? Math.min(d.target, d.open + step) : Math.max(d.target, d.open - step);
        // easeInOut için gölgelendiriciye doğrusal açıklık değil yumuşatılmış değer
        const e = d.open * d.open * (3 - 2 * d.open);
        if (setOpen(en.baked, d.r, o.reducedMotion ? d.target : e)) markRange(en.geometry.getAttribute('aAnim'), d.r.v0, d.r.n);
      }
    });
  }

  function refreshLight() {
    if (!getLight) return;
    let budget = tier.lightPerFrame;
    const list = [];
    entries.forEach((en) => { if (en.baked && en.shown) list.push(en); });
    if (list.length === 0) return;
    let guard = list.length * 2;
    while (budget > 0 && guard-- > 0) {
      const en = list[lightRound % list.length];
      const idx = en.lightIdx || 0;
      if (idx >= en.baked.ranges.length) {
        en.lightIdx = 0;
        lightRound++;
        continue;
      }
      en.lightIdx = idx + 1;
      budget--;
      const r = en.baked.ranges[idx];
      const e = pw.entry(r.id);
      if (!e) continue;
      const l = lightOf(e.prop, e.def);
      if (setLight(en.baked, r, l[0], l[1])) markRange(en.geometry.getAttribute('aLight'), r.v0, r.n);
    }
  }

  function rebuildHolo() {
    holoDirty = false;
    const list = [];
    entries.forEach((en) => {
      if (!en.baked || !en.shown) return;
      for (let i = 0; i < en.baked.holo.length; i++) {
        const h = en.baked.holo[i];
        const dx = h.x - camPos.x;
        const dz = h.z - camPos.z;
        list.push({
          tmpl: h.tmpl, x: h.x, y: h.y, z: h.z, yaw: h.yaw, state: pw.state(h.id), tint: h.tint, phase: (hash32(h.id) >>> 8) & 255, d: dx * dx + dz * dz,
        });
      }
    });
    list.sort((a, b) => a.d - b.d);
    if (list.length > tier.maxHolo) list.length = tier.maxHolo;
    if (holoMesh) {
      group.remove(holoMesh);
      holoMesh.geometry.dispose();
      holoMesh = null;
    }
    stats.holo = list.length;
    if (list.length === 0) return;
    const h = bakeHolo(list, 0, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', attr(THREE, 'f32', h.pos, 3));
    g.setAttribute('normal', attr(THREE, 'i8', h.nor, 4, true));
    g.setAttribute('uv', attr(THREE, 'u16', h.uv, 2, true));
    g.setAttribute('aCol', attr(THREE, 'u8', h.col, 4, true));
    g.setAttribute('aMat', attr(THREE, 'u8', h.mat, 4, false));
    g.setAttribute('aInst', attr(THREE, 'u8', h.inst, 4, false));
    g.setAttribute('aTint', attr(THREE, 'u8', h.tint, 4, true));
    g.setAttribute('aSign', attr(THREE, 'u16', new Uint16Array(h.n * 4), 4, true));
    g.setAttribute('aLight', attr(THREE, 'u8', new Uint8Array(h.n * 4), 4, true));
    g.setAttribute('aAnim', attr(THREE, 'i8', new Int8Array(h.n * 4), 4, true));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    holoMesh = new THREE.Mesh(g, holoMat);
    holoMesh.name = 'ic-holo';
    holoMesh.frustumCulled = true;
    holoMesh.renderOrder = 5;
    group.add(holoMesh);
    stats.draws = stats.shown + 1;
  }

  const api = {
    group,
    stats,
    get quality() { return tierKey; },
    get tier() { return tier; },
    get entries() { return entries; },
    get boardAtlas() { return boardAtlas; },

    setWorld(world, opts) {
      pw = world || null;
      getLight = opts && typeof opts.getLight === 'function' ? opts.getLight : null;
      seed = pw ? pw.citySeed | 0 : 0;
      entries.forEach((en) => disposeEntry(en));
      entries.clear();
      queue.length = 0;
      moodCache.clear();
      forced = true;
      verSeen = -1;
      holoDirty = true;
      warmIdx = 0;
      stats.chunks = 0; stats.shown = 0; stats.instances = 0; stats.tris = 0; stats.draws = 0; stats.holo = 0; stats.memBytes = 0; stats.queue = 0;
      if (holoMesh) {
        group.remove(holoMesh);
        holoMesh.geometry.dispose();
        holoMesh = null;
      }
    },

    invalidate() {
      forced = true;
    },

    /**
     * Shader ısınması (qa_p2): gövde ve holo programları ilk iç mekân chunk'ı çıkana kadar derlenmez (mesh'ler tembel ve gizli) → ilk girişte ~100 ms takılma.
     * warmBegin() iki küçük örnek mesh'i görünür kılar (ve görünmeyen üst grupları geçici açar); renderer.compile çağrısından sonra dönen fonksiyon her şeyi geri alır.
     */
    warmBegin() {
      if (disposed) return null;
      const g = new THREE.BufferGeometry();
      const n = 3;
      g.setAttribute('position', attr(THREE, 'f32', new Float32Array(n * 3), 3));
      g.setAttribute('normal', attr(THREE, 'i8', new Int8Array(n * 4), 4, true));
      g.setAttribute('uv', attr(THREE, 'u16', new Uint16Array(n * 2), 2, true));
      g.setAttribute('aCol', attr(THREE, 'u8', new Uint8Array(n * 4), 4, true));
      g.setAttribute('aMat', attr(THREE, 'u8', new Uint8Array(n * 4), 4, false));
      g.setAttribute('aInst', attr(THREE, 'u8', new Uint8Array(n * 4), 4, false));
      g.setAttribute('aTint', attr(THREE, 'u8', new Uint8Array(n * 4), 4, true));
      g.setAttribute('aSign', attr(THREE, 'u16', new Uint16Array(n * 4), 4, true));
      g.setAttribute('aLight', attr(THREE, 'u8', new Uint8Array(n * 4), 4, true));
      g.setAttribute('aAnim', attr(THREE, 'i8', new Int8Array(n * 4), 4, true));
      const meshes = [new THREE.Mesh(g, bodyMat), new THREE.Mesh(g, holoMat)];
      meshes.forEach((m) => { m.name = 'ic-warm'; m.frustumCulled = false; group.add(m); });
      const chain = [];
      for (let p = group; p && p.type !== 'Scene'; p = p.parent) { chain.push([p, p.visible]); p.visible = true; }
      return function warmEnd() {
        chain.forEach((c) => { c[0].visible = c[1]; });
        meshes.forEach((m) => group.remove(m));
        g.dispose();
      };
    },

    setQuality(q) {
      if (!INTERIOR_TIERS[q] || q === tierKey) return;
      tierKey = q;
      tier = INTERIOR_TIERS[q];
      fadeStart.value = tier.radius - 10;
      fadeEnd.value = tier.radius;
      forced = true;
    },

    update(dt, camera) {
      if (disposed || !pw) return;
      const t0 = now();
      const d = dt > 0 ? dt : 0;
      accum += d;
      stateAccum += d;
      camPos.x = camera ? camera.position.x : 0;
      camPos.y = camera ? camera.position.y : 64;
      camPos.z = camera ? camera.position.z : 0;
      // şablon ısınması: ilk saniyelerde kare başı 2 tanım (varyant 0)
      if (warmIdx < INTERIOR_DEFS.length) {
        for (let k = 0; k < 2 && warmIdx < INTERIOR_DEFS.length; k++) getTemplate(INTERIOR_DEFS[warmIdx++], 0, null);
        stats.warm = warmIdx;
      }
      if (forced || pw.version !== verSeen || accum >= CADENCE) {
        accum = 0;
        refreshSet(camPos);
        verSeen = pw.version;
        forced = false;
      }
      if (queue.length > 0) {
        const en = queue.shift();
        if (!en.baked && entries.get(en.cx * 4096 + en.cz) === en) {
          bake(en);
          refreshSet(camPos);
        }
      }
      if (stateAccum >= CADENCE) {
        stateAccum = 0;
        syncStates();
      }
      animateDoors(d);
      refreshLight();
      if (holoDirty && stateAccum < CADENCE * 0.5) rebuildHolo();
      stats.updateMs = now() - t0;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      entries.forEach((en) => disposeEntry(en));
      entries.clear();
      if (holoMesh) {
        group.remove(holoMesh);
        holoMesh.geometry.dispose();
        holoMesh = null;
      }
      bodyMat.dispose();
      holoMat.dispose();
      if (boardAtlas) boardAtlas.dispose();
      if (ownMain) mainAtlas.dispose();
      pw = null;
    },
  };
  return api;
}
