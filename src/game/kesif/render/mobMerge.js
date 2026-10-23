/*
 * KEŞİF render — yaratık parçalarını TEK deriye (SkinnedMesh) birleştirme: saf veri mantığı (three/DOM yok; node'da test edilir).
 *
 * Neden: her yaratık 7–31 düğüm × (ışıklı, ışımalı, ek) ayrı ağdan kuruluydu (≈ 7–40 çizim çağrısı/yaratık). 30 yaratıkta çağrı sayısı
 * 500–900'e çıkıyordu. Burada bir yaratığın bütün (kemiğe bağlı) parçaları, MALZEME BAŞINA tek geometride toplanır; her tepe noktası
 * kendi düğümünün kemik dizinine ağırlık 1 ile bağlanır. Düğümler kemik gibi sürülür (animasyon kodu değişmez) → yaratık başına ≈ 2–4 çağrı.
 *
 *   mergePieces(pieces) → Map<matName, {pos, nor, col, idx, skinIndex, skinWeight, vertexCount, triangleCount}>
 *       pieces[i] = {bone, mat, pos:number[], nor:number[], col:number[], idx:number[], m:ArrayLike<16> (kemiğin dinlenme matrisi, sütun-öncelikli)}
 *       Tepe/normaller dinlenme matrisiyle (bind pozu = rig kökü uzayı) dönüştürülür.
 *   restSignature(mats, order) → string           dinlenme matrislerinin parmak izi (aynı tür/varyant/dinlenme pozu → geometri paylaşılır)
 *   boneSupport(pos, skinIndex, invs) → {bones, pts}   kemik başına uç noktalar (animasyonlu pozda ucuz sınır kutusu)
 *   boundsOf(pos) → {cx,cy,cz,r, min:[3], max:[3]}  geometrinin sınır küresi/kutusu
 *   cullSphere(b, slack) → {cx,cy,cz,r}             animasyon payıyla şişirilmiş görünürlük küresi (SkinnedMesh sınır küresi elle verilir)
 *   normalizeKeep(keep) → [bool,bool,bool]          parça seçeneği `keep` (true | [slot,...] | undefined) → ayrı kalacak yuvalar
 *   lodLevelFor(dist, base, level, far, mid) → 0..2  uzaklığa göre ayrıntı kademesi (histerezisli; mobModels.updateLod ile aynı kurallar)
 *   mobDrawEstimate(parts, merged) → number          model başına tahmini çizim çağrısı (testler/bütçe)
 *   RIGID_SKIN / patchRigidSkinShader(shader)        tek kemikli (ağırlık 1) deri için hafif köşe gölgelendirici: köşe başına 16 yerine 4 doku okuması
 */

/** Slot sayısı: [ışıklı, ışıma, ek]. */
export const SLOTS = 3;

/** `keep` seçeneğini slot bayraklarına çevirir: true → hepsi ayrı kalır, [1] → yalnız ışıma yuvası ayrı kalır. */
export function normalizeKeep(keep) {
  const out = [false, false, false];
  if (keep === true) return [true, true, true];
  if (Array.isArray(keep)) {
    for (let i = 0; i < keep.length; i++) {
      const k = keep[i] | 0;
      if (k >= 0 && k < SLOTS) out[k] = true;
    }
  }
  return out;
}

/** FNV-1a: matris elemanları 1/4096 duyarlıkla kuantalanır. mats: dizi-of-ArrayLike(16). */
export function restSignature(mats) {
  let h = 0x811c9dc5;
  for (let i = 0; i < mats.length; i++) {
    const m = mats[i];
    for (let k = 0; k < 16; k++) {
      const v = Math.round(m[k] * 4096) | 0;
      h ^= v & 0xff; h = Math.imul(h, 0x01000193);
      h ^= (v >> 8) & 0xff; h = Math.imul(h, 0x01000193);
      h ^= (v >> 16) & 0xff; h = Math.imul(h, 0x01000193);
      h ^= (v >> 24) & 0xff; h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(36) + ':' + mats.length;
}

/** Sütun-öncelikli 4x4'ün sol-üst 3x3'ünün ters-devriği (normal matrisi), dizi(9) satır-öncelikli [r0c0, r0c1, ...] değil: n' = N·n. */
function normalMat(m) {
  // M3 (sütun-öncelikli): a=m0 d=m1 g=m2 | b=m4 e=m5 h=m6 | c=m8 f=m9 i=m10   → M = [[a,b,c],[d,e,f],[g,h,i]]
  const a = m[0]; const d = m[1]; const g = m[2];
  const b = m[4]; const e = m[5]; const h = m[6];
  const c = m[8]; const f = m[9]; const i = m[10];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const id = 1 / det;
  // ters(M)^T satırları = (cofactor matrisi)/det
  return [
    A * id, B * id, C * id,
    (-(b * i - c * h)) * id, (a * i - c * g) * id, (-(a * h - b * g)) * id,
    (b * f - c * e) * id, (-(a * f - c * d)) * id, (a * e - b * d) * id,
  ];
}

/**
 * Parçaları malzeme adına göre birleştirir. Dönüş: Map (ekleme sırası = ilk görülme sırası).
 * Tepe: p' = m·p ; normal: n' = normalize(N·n). Dizinler tepe ofsetiyle birleştirilir (65535 aşılırsa Uint32).
 */
export function mergePieces(pieces) {
  const acc = new Map();
  for (let pi = 0; pi < pieces.length; pi++) {
    const p = pieces[pi];
    const nv = p.pos.length / 3;
    if (nv <= 0) continue;
    let g = acc.get(p.mat);
    if (!g) {
      g = { pos: [], nor: [], col: [], idx: [], bone: [], vertexCount: 0 };
      acc.set(p.mat, g);
    }
    const m = p.m;
    const N = normalMat(m);
    const base = g.vertexCount;
    for (let v = 0; v < nv; v++) {
      const x = p.pos[v * 3]; const y = p.pos[v * 3 + 1]; const z = p.pos[v * 3 + 2];
      g.pos.push(
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
      );
      const nx = p.nor[v * 3]; const ny = p.nor[v * 3 + 1]; const nz = p.nor[v * 3 + 2];
      let ox = N[0] * nx + N[1] * ny + N[2] * nz;
      let oy = N[3] * nx + N[4] * ny + N[5] * nz;
      let oz = N[6] * nx + N[7] * ny + N[8] * nz;
      const l = Math.hypot(ox, oy, oz);
      if (l > 1e-9) { ox /= l; oy /= l; oz /= l; } else { ox = 0; oy = 1; oz = 0; }
      g.nor.push(ox, oy, oz);
      g.col.push(p.col[v * 3], p.col[v * 3 + 1], p.col[v * 3 + 2]);
      g.bone.push(p.bone);
    }
    for (let k = 0; k < p.idx.length; k++) g.idx.push(p.idx[k] + base);
    g.vertexCount += nv;
  }
  const out = new Map();
  acc.forEach((g, name) => {
    const n = g.vertexCount;
    const skinIndex = new Uint16Array(n * 4);
    const skinWeight = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) {
      skinIndex[v * 4] = g.bone[v];
      skinWeight[v * 4] = 1;
    }
    out.set(name, {
      pos: new Float32Array(g.pos),
      nor: new Float32Array(g.nor),
      col: new Float32Array(g.col),
      idx: n > 65535 ? new Uint32Array(g.idx) : new Uint16Array(g.idx),
      skinIndex,
      skinWeight,
      vertexCount: n,
      triangleCount: g.idx.length / 3,
    });
  });
  return out;
}

/** Konum dizisinden (düz sayı dizisi) kutu + sınır küresi (kutu merkezli, yarıçap = en uzak tepe). */
export function boundsOf(pos) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const n = pos.length / 3;
  if (n === 0) return { cx: 0, cy: 0, cz: 0, r: 0, min: [0, 0, 0], max: [0, 0, 0] };
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const v = pos[i * 3 + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const cz = (min[2] + max[2]) / 2;
  let r2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = pos[i * 3] - cx; const dy = pos[i * 3 + 1] - cy; const dz = pos[i * 3 + 2] - cz;
    const d = dx * dx + dy * dy + dz * dz;
    if (d > r2) r2 = d;
  }
  return { cx, cy, cz, r: Math.sqrt(r2), min, max };
}

/** 26 yön (-1,0,1)^3 \ {0}: kemik-yerel destek noktaları için. */
export const SUPPORT_DIRS = (() => {
  const d = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) d.push([x, y, z]);
  return d;
})();

/**
 * Kemik başına en uç tepe noktaları (kemik-yerel uzayda, 26 yönde destek noktası). Sınır kutusu, animasyonlu pozda bu noktaları
 * kemik matrisiyle dönüştürerek (tepe tepe deri hesabı yerine) ucuza bulunur.
 *   pos       birleşik geometrinin konumları (bind/dinlenme uzayı)   bone  tepe başına kemik dizini (skinIndex'in ilk bileşeni)
 *   invs      kemik başına dinlenme matrisinin TERSİ (sütun-öncelikli 16'lık diziler)
 * Dönüş: {bones: Uint16Array, pts: Float32Array} (nokta başına bir kemik dizini, üç sayı)
 */
export function boneSupport(pos, skinIndex, invs) {
  const n = pos.length / 3;
  const nb = invs.length;
  const nd = SUPPORT_DIRS.length;
  const best = new Float32Array(nb * nd).fill(-Infinity);
  const pts = new Float32Array(nb * nd * 3);
  for (let v = 0; v < n; v++) {
    const b = skinIndex[v * 4];
    const m = invs[b];
    const x = pos[v * 3]; const y = pos[v * 3 + 1]; const z = pos[v * 3 + 2];
    const lx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const ly = m[1] * x + m[5] * y + m[9] * z + m[13];
    const lz = m[2] * x + m[6] * y + m[10] * z + m[14];
    const o = b * nd;
    for (let d = 0; d < nd; d++) {
      const dir = SUPPORT_DIRS[d];
      const s = dir[0] * lx + dir[1] * ly + dir[2] * lz;
      if (s > best[o + d]) {
        best[o + d] = s;
        const k = (o + d) * 3;
        pts[k] = lx; pts[k + 1] = ly; pts[k + 2] = lz;
      }
    }
  }
  const bones = [];
  const out = [];
  for (let i = 0; i < nb * nd; i++) {
    if (best[i] === -Infinity) continue;
    bones.push((i / nd) | 0);
    out.push(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
  }
  return { bones: new Uint16Array(bones), pts: new Float32Array(out) };
}

/** Animasyon payı: uzuvlar dinlenme sınırının dışına savrulabilir → yarıçap şişirilir. */
export function cullSphere(b, slack) {
  const s = slack > 0 ? slack : 0.5;
  return { cx: b.cx, cy: b.cy, cz: b.cz, r: b.r * (1 + s) + 0.25 };
}

/**
 * Uzaklığa göre ayrıntı kademesi (mobModels.updateLod ile aynı histerez). dist: kameraya blok; base: kalite tavanı kademesi;
 * level: şimdiki kademe; far/mid: eşikler. Dönüş 0..base.
 */
export function lodLevelFor(dist, base, level, far, mid) {
  const f = level === 0 ? far - 4 : far + 4;
  const m = level <= 1 && base > 1 ? mid - 3 : mid + 3;
  if (dist > f) return 0;
  if (dist > m) return Math.min(base, 1);
  return base;
}

/**
 * Model başına tahmini çizim çağrısı: birleşik modda benzersiz (malzeme) sayısı + ayrı kalan ağlar + dinamik tüp/sprite;
 * birleşik değilse her ağ 1 çağrı. parts: [{mats:[a,b,c], has:[bool,bool,bool], keep:[bool,bool,bool]}]
 */
export function mobDrawEstimate(parts, merged, extra) {
  let n = extra > 0 ? extra : 0;
  const groups = new Set();
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    for (let s = 0; s < SLOTS; s++) {
      if (!p.has[s]) continue;
      if (merged && !(p.keep && p.keep[s])) groups.add(p.mats[s]);
      else n++;
    }
  }
  return n + groups.size;
}

/**
 * Birleşik yaratık derisinde her köşe TEK kemiğe ağırlık 1 ile bağlıdır. three'nin varsayılan deri gölgelendiricisi köşe başına 4 kemik matrisi
 * (16 texelFetch) okuyup harmanlar; burada yalnız ilk kemik okunur (4 okuma, tek matris-vektör çarpımı). Rig ayrık bağlamayı (bindMatrix = bindMatrixInverse =
 * birim) kullanır, bu yüzden bind matrisi çarpımları atlanır: sonuç matematiksel olarak aynıdır (bkz. mobRig.js _updateBones).
 * Parça adları three r186 ShaderChunk'ıdır (skinbase_vertex, skinnormal_vertex, skinning_vertex).
 */
export const RIGID_SKIN = Object.freeze({
  base: `#ifdef USE_SKINNING
	mat4 rigidSkin = getBoneMatrix( skinIndex.x );
#endif`,
  /** Ortak kemik atlası (mobBones.js): her yaratığın dilimi `uBoneBase` ile seçilir. */
  baseAtlas: `#ifdef USE_SKINNING
	mat4 rigidSkin = getBoneMatrix( skinIndex.x + uBoneBase );
#endif`,
  normal: `#ifdef USE_SKINNING
	objectNormal = vec4( rigidSkin * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( rigidSkin * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,
  vertex: `#ifdef USE_SKINNING
	transformed = ( rigidSkin * vec4( transformed, 1.0 ) ).xyz;
#endif`,
});

/**
 * material.onBeforeCompile olarak kullanılır (customProgramCacheKey ile birlikte). Parça yoksa dokunmaz.
 * uBase verilirse ({value}): yaratığın kemik dilimi tabanı uniform olarak eklenir (ortak kemik atlası).
 */
export function patchRigidSkinShader(shader, uBase) {
  if (!shader || typeof shader.vertexShader !== 'string') return;
  const v = shader.vertexShader;
  if (v.indexOf('#include <skinbase_vertex>') < 0 || v.indexOf('#include <skinning_vertex>') < 0) return;
  if (uBase && shader.uniforms) shader.uniforms.uBoneBase = uBase;
  shader.vertexShader = (uBase ? 'uniform float uBoneBase;\n' : '') + v
    .replace('#include <skinbase_vertex>', uBase ? RIGID_SKIN.baseAtlas : RIGID_SKIN.base)
    .replace('#include <skinnormal_vertex>', RIGID_SKIN.normal)
    .replace('#include <skinning_vertex>', RIGID_SKIN.vertex);
}
