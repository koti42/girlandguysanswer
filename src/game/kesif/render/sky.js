/*
 * KEŞİF render — gökyüzü: gradyan kubbe + ufuk parıltısı, güneş/ay (evre) diskleri, yıldız alanı (titreşim), prosedürel
 * fbm bulut katmanı (rüzgârla kayar, güneş açısına göre gölgeli), Donmuş Zirveler'de aurora; sis parametresi yardımcısı.
 *
 *   createSky(THREE, {quality, reducedMotion, cloudY}) → {object3D, update(dt, skyState, camera), setQuality(q),
 *                                                        setReducedMotion(b), dispose()}
 *   getFogParams(skyState, viewDist, opts?, out?) → updateMaterialsFrame'e verilebilir durum (sis + ışık + renkler, doğrusal)
 *   srgbToLinear(c)
 *
 * skyState (sim/daynight.js computeSky çıktısı + ek alanlar; hepsi isteğe bağlı olmayanlar işaretli):
 *   skyTop, skyHorizon, fog, sun, ambient   [r,g,b] 0..1 sRGB (computeSky)          dayFactor (*)  skyLight  sunIntensity
 *   ambientIntensity  starAlpha  cloudCover  cloudDark  fogDensity                   (computeSky alanları)
 *   sunDir (*) / moonDir (*)  {x,y,z} birim vektör (sunDirection/moonDirection)       phase  0..1 (yıldız dönüşü)
 *   moonPhase 0..7 (moonPhase(day))  zoneTint kesirli bölge indeksi (zoneTintIndex) ya da {index}
 *   weather  {cloudCover, intensity, wind:{x,z}}  (createWeather nesnesi)  — renk alanları `colors` altında da verilebilir.
 *
 * Bulut yüksekliği dünya Y'sinde sabittir (varsayılan 176); kamera ondan yüksekteyse bulut çizilmez.
 * Çizim sırası: kubbe opak listenin sonunda (renderOrder 5), yıldızlar şeffaf (renderOrder 40); su (100+) ve hava (200) sonra.
 */
import { SKY_VERTEX, SKY_FRAGMENT, STAR_VERTEX, STAR_FRAGMENT } from './skyShaders.js';
import { QUALITY } from './quality.js';

const TAU = Math.PI * 2;
/** Gece soğuk ay ışığı: ortam eki ve yön ışığı rengi (doğrusal). */
const MOON_AMBIENT = [0.090, 0.125, 0.230];
const MOON_LIGHT = [0.080, 0.110, 0.200];

/** sRGB 0..1 bileşen → doğrusal. */
export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function setLin(target, arr, mul) {
  const m = mul === undefined ? 1 : mul;
  target.set(srgbToLinear(arr[0]) * m, srgbToLinear(arr[1]) * m, srgbToLinear(arr[2]) * m);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function pick(s, key) {
  const c = s.colors;
  return (c && c[key]) || s[key];
}

/**
 * Sis + ışık parametreleri. out verilirse yeniden kullanılır (kare başına ayırma yok).
 * @param {object} s skyState
 * @param {number} viewDist görüş mesafesi (chunk)
 * @param {{sealDistance?:number, sealColor?:number[]}} [opts] sealDistance: üretilemeyen (mühürlü) chunk'a mesafe (blok)
 * @returns {{fogColor:number[], fogNear:number, fogFar:number, fadeStart:number, fadeEnd:number, skyColor:number[],
 *   horizonColor:number[], ambient:number[], sunColor:number[], sunDir:{x:number,y:number,z:number}, dayFactor:number,
 *   minLight:number, fogDensity:number}}
 * Gece yön ışığı AY olur (sönük soğuk renk, ay yönü); dayFactor = uSkyLight (gece 0,35 taban). sealDistance verilirse sis perdesi yaklaşır.
 */
export function getFogParams(s, viewDist, opts, out) {
  const o = opts || {};
  const r = out || {
    fogColor: [0, 0, 0], skyColor: [0, 0, 0], horizonColor: [0, 0, 0], ambient: [0, 0, 0], sunColor: [0, 0, 0],
    sunDir: { x: 0, y: 1, z: 0 }, fogNear: 0, fogFar: 0, fadeStart: 0, fadeEnd: 0, dayFactor: 1, fogDensity: 1, minLight: 0.02,
  };
  const fog = pick(s, 'fog') || [0.8, 0.9, 1];
  const top = pick(s, 'skyTop') || [0.25, 0.55, 0.88];
  const hor = pick(s, 'skyHorizon') || [0.75, 0.89, 1];
  const amb = pick(s, 'ambient') || [0.5, 0.58, 0.74];
  const sun = pick(s, 'sun') || [1, 0.95, 0.85];
  const ai = s.ambientIntensity !== undefined ? s.ambientIntensity : 0.8;
  const si = s.sunIntensity !== undefined ? s.sunIntensity : 1;
  const dens = s.fogDensity !== undefined ? s.fogDensity : 1;
  const vd = Math.max(2, viewDist || 7);
  let far = vd * 16 - 6;
  far /= 1 + 0.45 * (dens - 1);
  let fogMix = 0;
  if (o.sealDistance !== undefined && Number.isFinite(o.sealDistance)) {
    const reach = Math.max(56, o.sealDistance + 30);
    if (reach < far) {
      fogMix = clamp01(1 - o.sealDistance / far) * 0.4;
      far = reach;
    }
  }
  far = Math.max(40, far);
  const near = far * (0.5 - 0.22 * clamp01((dens - 1) / 1.5));
  r.fogFar = far;
  r.fogNear = near;
  r.fadeStart = far * 0.86;
  r.fadeEnd = far * 0.99;
  r.fogDensity = dens;
  const df = s.dayFactor !== undefined ? s.dayFactor : 1;
  const night = 1 - df;
  const ambMul = 0.55 + 0.45 * ai;
  for (let i = 0; i < 3; i++) {
    r.fogColor[i] = srgbToLinear(fog[i]);
    r.skyColor[i] = srgbToLinear(top[i]);
    r.horizonColor[i] = srgbToLinear(hor[i]);
    r.ambient[i] = srgbToLinear(amb[i]) * ambMul + MOON_AMBIENT[i] * night;
    r.sunColor[i] = srgbToLinear(sun[i]) * si * 0.85;
  }
  if (fogMix > 0) {
    const sc = o.sealColor || [0.63, 0.44, 1];
    for (let i = 0; i < 3; i++) r.fogColor[i] += (srgbToLinear(sc[i]) * 0.55 - r.fogColor[i]) * fogMix;
  }
  // yön ışığı: gündüz güneş, gece ay (güneş ufka inerken yön yumuşakça ay'a geçer; sönük soğuk ay ışığı)
  const sd = s.sunDir || { x: 0, y: 1, z: 0 };
  const md = s.moonDir || { x: -sd.x, y: -sd.y, z: -sd.z };
  const sunUp = clamp01((sd.y + 0.08) / 0.2);
  let dx = sd.x * sunUp + md.x * (1 - sunUp);
  let dy = sd.y * sunUp + md.y * (1 - sunUp);
  let dz = sd.z * sunUp + md.z * (1 - sunUp);
  const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  dx /= dl;
  dy /= dl;
  dz /= dl;
  if (dy < 0.12) {
    // ufka yakın/altı ışık yönü yüzeyleri yandan aydınlatır ama hiç yukarı bakmaz: biraz kaldır
    dy = 0.12;
    const l2 = Math.sqrt(dx * dx + dy * dy + dz * dz);
    dx /= l2;
    dy /= l2;
    dz /= l2;
  }
  for (let i = 0; i < 3; i++) r.sunColor[i] = r.sunColor[i] * sunUp + MOON_LIGHT[i] * night * (1 - sunUp);
  r.sunDir.x = dx;
  r.sunDir.y = dy;
  r.sunDir.z = dz;
  r.minLight = 0.012 + 0.016 * night;
  r.dayFactor = 0.35 + 0.65 * df;
  return r;
}

const CLOUD_MODES = {
  basit: { CLOUD_OCT: 2, CLOUD_SHADE: 0, CLOUD_CIRRUS: 0 },
  orta: { CLOUD_OCT: 3, CLOUD_SHADE: 1, CLOUD_CIRRUS: 0 },
  tam: { CLOUD_OCT: 5, CLOUD_SHADE: 1, CLOUD_CIRRUS: 1 },
};

function cloudModeOf(q) {
  if (typeof q === 'string') return (QUALITY[q] && QUALITY[q].clouds) || (CLOUD_MODES[q] ? q : 'tam');
  if (q && typeof q.clouds === 'string' && CLOUD_MODES[q.clouds]) return q.clouds;
  return 'tam';
}

function buildStars(THREE, count) {
  // belirlenimci küçük PRNG (mulberry32)
  let a = 0x9e3779b9;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pos = new Float32Array(count * 3);
  const attr = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    // küre üzerinde düzgün dağılım (tüm küre: gök dönünce görünür)
    const y = rnd() * 2 - 1;
    const th = rnd() * TAU;
    const r = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(th) * r;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = Math.sin(th) * r;
    const b = rnd();
    const big = b > 0.965;
    attr[i * 4] = big ? 2.6 + rnd() * 1.2 : 1.1 + rnd() * 0.9;
    attr[i * 4 + 1] = rnd();
    attr[i * 4 + 2] = big ? 0.9 : 0.25 + b * 0.55;
    attr[i * 4 + 3] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aStar', new THREE.BufferAttribute(attr, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2);
  return g;
}

/**
 * @param {object} THREE three modülü
 * @param {{quality?:string|object, reducedMotion?:boolean, cloudY?:number, pixelRatio?:number}} [opts]
 */
export function createSky(THREE, opts) {
  const o = opts || {};
  let reduced = !!o.reducedMotion;
  const cloudY = o.cloudY !== undefined ? o.cloudY : 176;
  let mode = cloudModeOf(o.quality === undefined ? 'high' : o.quality);
  const starCount = typeof o.quality === 'string' && o.quality === 'low' ? 700 : 1500;

  const col = (r, g, b) => new THREE.Color(r, g, b);
  const uniforms = {
    uTop: { value: col(0.05, 0.25, 0.7) },
    uHor: { value: col(0.5, 0.75, 1) },
    uFog: { value: col(0.6, 0.8, 0.95) },
    uSunCol: { value: col(1, 0.9, 0.7) },
    uAmbient: { value: col(0.4, 0.5, 0.7) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uMoonL: { value: new THREE.Vector3(0, 0, 1) },
    uAuroraCol: { value: col(0.1, 1, 0.45) },
    uAuroraCol2: { value: col(0.55, 0.25, 1) },
    uCamXZ: { value: new THREE.Vector2(0, 0) },
    uCloudOff: { value: new THREE.Vector2(0, 0) },
    uDay: { value: 1 },
    uCover: { value: 0.15 },
    uCloudDark: { value: 0 },
    uCloudH: { value: 100 },
    uTime: { value: 0 },
    uAurora: { value: 0 },
    uMotion: { value: reduced ? 0 : 1 },
    uSunVis: { value: 1 },
    uMoonVis: { value: 0 },
    uCityGlow: { value: col(0, 0, 0) },
  };

  const defs = () => Object.assign({}, CLOUD_MODES[mode]);
  const domeMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    defines: defs(),
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  domeMat.name = 'kesif-gokyuzu';
  const domeGeo = new THREE.SphereGeometry(1, 40, 24);
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.frustumCulled = false;
  dome.renderOrder = 5;
  dome.matrixAutoUpdate = false;
  dome.name = 'kesif-kubbe';

  const starUniforms = {
    uRot: { value: new THREE.Matrix3() },
    uTime: uniforms.uTime,
    uPx: { value: o.pixelRatio || 1 },
    uStarAlpha: { value: 0 },
    uCover: uniforms.uCover,
    uMotion: uniforms.uMotion,
  };
  const starMat = new THREE.ShaderMaterial({
    uniforms: starUniforms,
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  starMat.name = 'kesif-yildiz';
  let starGeo = buildStars(THREE, starCount);
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = 40;
  stars.matrixAutoUpdate = false;
  stars.name = 'kesif-yildizlar';

  const group = new THREE.Group();
  group.name = 'kesif-sky';
  group.add(dome);
  group.add(stars);

  let disposed = false;
  const auroraGreen = [0.1, 1.0, 0.45];

  return {
    object3D: group,

    /**
     * @param {number} dt saniye
     * @param {object} s skyState (bkz. dosya başı)
     * @param {THREE.Camera} camera
     */
    update(dt, s, camera) {
      if (disposed || !s) return;
      const u = uniforms;
      const step = dt > 0 ? Math.min(dt, 0.25) : 0;
      u.uTime.value += step;
      setLin(u.uTop.value, pick(s, 'skyTop') || [0.25, 0.55, 0.88]);
      setLin(u.uHor.value, pick(s, 'skyHorizon') || [0.75, 0.89, 1]);
      setLin(u.uFog.value, pick(s, 'fog') || [0.8, 0.9, 1]);
      const si = s.sunIntensity !== undefined ? s.sunIntensity : 1;
      setLin(u.uSunCol.value, pick(s, 'sun') || [1, 0.95, 0.85], 0.9 * Math.max(0.35, si));
      setLin(u.uAmbient.value, pick(s, 'ambient') || [0.5, 0.58, 0.74], s.ambientIntensity !== undefined ? s.ambientIntensity : 0.8);
      const sd = s.sunDir || { x: 0, y: 1, z: 0 };
      const md = s.moonDir || { x: -sd.x, y: -sd.y, z: -sd.z };
      u.uSunDir.value.set(sd.x, sd.y, sd.z);
      u.uMoonDir.value.set(md.x, md.y, md.z);
      const day = s.dayFactor !== undefined ? s.dayFactor : 1;
      u.uDay.value = day;
      u.uSunVis.value = clamp01((sd.y + 0.12) / 0.2);
      u.uMoonVis.value = clamp01((md.y + 0.12) / 0.2) * (1 - 0.85 * day);
      const mp = s.moonPhase !== undefined ? s.moonPhase : 4;
      const ph = (mp / 8) * TAU;
      u.uMoonL.value.set(Math.sin(ph), 0, -Math.cos(ph));

      const w = s.weather || null;
      const cover = s.cloudCover !== undefined ? s.cloudCover : w && w.cloudCover !== undefined ? w.cloudCover : 0.15;
      u.uCover.value = cover;
      u.uCloudDark.value = s.cloudDark !== undefined ? s.cloudDark : 0;
      const wx = w && w.wind ? w.wind.x : 0;
      const wz = w && w.wind ? w.wind.z : 0;
      const spd = reduced ? 0.25 : 1;
      u.uCloudOff.value.x += (0.0009 + wx * 0.0012) * step * spd;
      u.uCloudOff.value.y += (0.0004 + wz * 0.0012) * step * spd;
      u.uMotion.value = reduced ? 0 : 1;

      let zi = 0;
      if (typeof s.zoneTint === 'number') zi = s.zoneTint;
      else if (s.zoneTint && typeof s.zoneTint.index === 'number') zi = s.zoneTint.index;
      // Donmuş Zirveler (3): aurora; Çekirdek (4): mor ağırlıklı, daha sönük
      const aur = clamp01(1 - Math.abs(zi - 3) * 1.1) + clamp01(1 - Math.abs(zi - 4) * 1.4) * 0.45;
      u.uAurora.value = aur;
      if (aur > 0.01) {
        const mixv = clamp01(zi - 3);
        u.uAuroraCol.value.set(auroraGreen[0] * (1 - mixv) + 0.35 * mixv, auroraGreen[1] * (1 - mixv * 0.7), auroraGreen[2] * (1 - mixv) + 0.9 * mixv);
      }

      // şehir parıltısı (computeSky şehir yolu; doğrusal rgb). Ana diyarda alan yok/0 → shader ek işlem yapmaz.
      const cg = s.cityGlow;
      if (cg && Number.isFinite(cg[0]) && Number.isFinite(cg[1]) && Number.isFinite(cg[2])) u.uCityGlow.value.setRGB(cg[0], cg[1], cg[2]);
      else u.uCityGlow.value.setRGB(0, 0, 0);

      starUniforms.uStarAlpha.value = s.starAlpha !== undefined ? s.starAlpha : 1 - day;
      const a = s.phase !== undefined ? s.phase * TAU : Math.atan2(sd.y, sd.x);
      const c = Math.cos(a);
      const sn = Math.sin(a);
      starUniforms.uRot.value.set(c, -sn, 0, sn, c, 0, 0, 0, 1);

      if (camera) {
        const e = camera.matrixWorld.elements;
        u.uCamXZ.value.set(e[12], e[14]);
        u.uCloudH.value = cloudY - e[13];
      }
    },

    /** 'low'|'medium'|'high' ya da {clouds:'basit'|'orta'|'tam'}. */
    setQuality(q) {
      const m = cloudModeOf(q);
      if (m === mode) return;
      mode = m;
      domeMat.defines = defs();
      domeMat.needsUpdate = true;
      const lowStars = typeof q === 'string' ? q === 'low' : q && q.clouds === 'basit';
      const want = lowStars ? 700 : 1500;
      if (starGeo.attributes.position.count !== want) {
        const g = buildStars(THREE, want);
        stars.geometry = g;
        starGeo.dispose();
        starGeo = g;
      }
    },

    setReducedMotion(b) {
      reduced = !!b;
      uniforms.uMotion.value = reduced ? 0 : 1;
    },

    /** Yıldız noktası boyutu için cihaz piksel oranı. */
    setPixelRatio(r) {
      starUniforms.uPx.value = r > 0 ? r : 1;
    },

    get cloudMode() {
      return mode;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      group.remove(dome);
      group.remove(stars);
      domeGeo.dispose();
      domeMat.dispose();
      starGeo.dispose();
      starMat.dispose();
    },
  };
}
