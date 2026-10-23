/*
 * KEŞİF render/city — BOYUT KAPISI görseli (Neon Meridyen yolculuğu). Sözleşme KESIF_CITY_CONTRACT §5 (GateEntity).
 *
 *   createGateVisual(THREE, opts?) → {
 *     group                       THREE.Group (boyutun varlık köküne eklenir: ctx.entityRoot; gate.attach(root) ile taşınır)
 *     attach(root)                grubu başka bir köke taşır (null = sahneden çıkar)
 *     show(spec)                  kapıyı gösterir/günceller: {id, kind:'out'|'back', x, y, z, nx, nz, w?, h?, calibrating?}
 *                                 (x,z = orta sütun merkezi, y = ayak seviyesi, (nx,nz) = oyuncuya bakan birim normal)
 *     hide(opts?)                 kapanma animasyonunu başlatır (opts.instant: hemen gizle)
 *     setCharge(k)                0..1 geçiş şarjı: girdap hızlanır, parlaklık artar
 *     setCalibration(k)           0..1 kalibrasyon (ilk açılış): kapı yavaş yavaş açılır, parçacıklar merkeze toplanır
 *     setReducedMotion(b)         girdap/parçacık hızı düşer (yanıp sönme yok), açılma/kapanma yumuşak solmadır
 *     setQuality('low'|'medium'|'high')   parçacık sayısı
 *     update(dt)                  animasyon zamanı + açılış/kapanış + parçacık halkası
 *     openness → 0..1             görsel açıklık;  state → 'gizli'|'aciliyor'|'acik'|'kapaniyor'
 *     stats                       {draws:2, points, visible}
 *     dispose()
 *   }
 *
 * Görünüm: 3 geniş × 4 yüksek OVAL girdap (puzzle portallarının 1×2 dikdörtgen çerçevesinden ve mavi/turuncu renklerinden ayrı): 'out' (Neon Meridyen'e)
 * mor çekirdek + camgöbeği kenar, çentikli (dişli) halka; 'back' (eve) camgöbeği çekirdek + sıcak beyaz kenar, DÜZ çift halka. Renk + şekil ayrımı (renk körlüğü).
 * Çizim: tek levha + tek Points = 2 çağrı; saydam toplamsal, derinlik yazmaz; render-to-texture yok. Yanıp sönme ≤ 2 Hz.
 */
const VERT = /* glsl */`
varying vec2 vUv;
varying float vViewZ;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */`
uniform float uTime;
uniform float uPhase;
uniform float uOpen;
uniform float uCharge;
uniform float uCalm;
uniform float uKind;
uniform vec3 uCore;
uniform vec3 uRimCol;
varying vec2 vUv;
varying float vViewZ;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float open = clamp(uOpen, 0.0, 1.0);
  float rr = length(p) / max(open, 0.03);
  if (rr > 1.0) discard;
  float t = uPhase; // hız integrali (CPU): şarj değişse de faz sürekli, her noktada <= 1,8 Hz
  float ang = atan(p.y, p.x);
  float dir = uKind > 0.5 ? -1.0 : 1.0;
  float rim = smoothstep(0.80, 0.90, rr) * (1.0 - smoothstep(0.95, 1.0, rr));
  float notch = step(0.0, sin(ang * 14.0 - t * 0.9 * dir));
  float rimShape = mix(0.35 + 0.65 * notch, 1.0, uKind);
  float ring2 = uKind > 0.5 ? smoothstep(0.60, 0.64, rr) * (1.0 - smoothstep(0.66, 0.70, rr)) : 0.0;
  float sw = 0.5 + 0.5 * sin(ang * 3.0 * dir + rr * 9.0 - t * 2.4 * dir);
  float sw2 = 0.5 + 0.5 * sin(ang * 5.0 * dir - rr * 6.0 + t * 1.7 * dir);
  float inner = 1.0 - smoothstep(0.0, 0.95, rr);
  vec3 core = mix(uCore * 0.35, uCore, sw) + uRimCol * 0.25 * sw2 * inner;
  vec3 col = core * (0.55 + 0.9 * inner) + uRimCol * rim * rimShape * 1.6 + uRimCol * ring2 * 0.9;
  col += vec3(rim * 0.35 * rimShape);
  float pulse = 0.5 + 0.5 * sin(t * 3.0 + rr * 4.0);
  col += uCore * 0.14 * pulse * (1.0 - uCalm);
  col *= 1.0 + 0.9 * clamp(uCharge, 0.0, 1.0);
  float edge = 1.0 - smoothstep(0.92, 1.0, rr);
  float a = clamp(0.88 * edge + rim * rimShape, 0.0, 1.0);
  // yakın solma: kapıya yaklaştıkça levha ekranı kapladığından parlaklık düşürülür (tam ekran beyaz patlama / ani parlaklık sıçraması yok)
  a *= 0.22 + 0.78 * smoothstep(0.8, 4.5, vViewZ);
  col = clamp(col, 0.0, 3.0);
  gl_FragColor = vec4(col, a);
}
`;

const PVERT = /* glsl */`
uniform float uTime;
uniform float uPhaseP;
uniform float uOpen;
uniform float uCharge;
uniform float uCalm;
uniform float uCalib;
uniform vec2 uRadius;
uniform float uScale;
attribute float aSeed;
varying float vA;
void main() {
  float ph = fract(aSeed * 7.31);
  float a = aSeed * 6.2831853 + uPhaseP * (0.35 + 0.5 * ph) * (ph > 0.5 ? 1.0 : -1.0);
  float shrink = mix(1.0, 0.25, clamp(uCalib, 0.0, 1.0));
  float drift = 1.02 + 0.16 * sin(uTime * 0.9 * (1.0 - 0.6 * uCalm) + aSeed * 40.0);
  vec3 pos = vec3(cos(a) * uRadius.x * drift * shrink, sin(a) * uRadius.y * drift * shrink, 0.18 * sin(aSeed * 90.0 + uTime));
  pos *= clamp(uOpen, 0.0, 1.0);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float sz = (0.10 + 0.12 * ph) * uScale;
  gl_PointSize = clamp(sz * 420.0 / max(-mv.z, 0.5), 1.0, 14.0);
  vA = clamp(uOpen, 0.0, 1.0) * (0.45 + 0.55 * ph) * (0.3 + 0.7 * smoothstep(0.8, 4.5, -mv.z));
}
`;

const PFRAG = /* glsl */`
uniform vec3 uRimCol;
varying float vA;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float a = (1.0 - smoothstep(0.2, 1.0, r)) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uRimCol * 1.4, a);
}
`;

export const GATE_SHADERS = Object.freeze({
  VERT, FRAG, PVERT, PFRAG,
});

/** 'out': Neon Meridyen'e (mor çekirdek, camgöbeği kenar); 'back': eve (camgöbeği çekirdek, sıcak beyaz kenar). Doğrusal-ish 0..1. */
export const GATE_COLORS = Object.freeze({
  out: Object.freeze({ core: [0.55, 0.2, 1.0], rim: [0.1, 0.95, 1.0], kind: 0 }),
  back: Object.freeze({ core: [0.1, 0.9, 0.85], rim: [1.0, 0.95, 0.78], kind: 1 }),
});

const POINTS = Object.freeze({ low: 24, medium: 40, high: 64 });
const OPEN_SECS = 0.55;
const CLOSE_SECS = 0.45;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function createGateVisual(THREE, opts) {
  const o = opts || {};
  const group = new THREE.Group();
  group.name = 'kesif-boyut-kapisi';
  group.visible = false;
  let quality = o.quality === 'low' || o.quality === 'medium' || o.quality === 'high' ? o.quality : 'high';
  let reduced = !!o.reducedMotion;

  const uniforms = {
    uTime: { value: 0 },
    uPhase: { value: 0 },
    uOpen: { value: 0 },
    uCharge: { value: 0 },
    uCalm: { value: reduced ? 1 : 0 },
    uKind: { value: 0 },
    uCore: { value: new THREE.Vector3(0.55, 0.2, 1.0) },
    uRimCol: { value: new THREE.Vector3(0.1, 0.95, 1.0) },
  };
  const puniforms = {
    uTime: uniforms.uTime,
    uPhaseP: { value: 0 },
    uOpen: uniforms.uOpen,
    uCharge: uniforms.uCharge,
    uCalm: uniforms.uCalm,
    uCalib: { value: 0 },
    uRadius: { value: new THREE.Vector2(1.5, 2.0) },
    uScale: { value: 1 },
    uRimCol: uniforms.uRimCol,
  };

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  plane.frustumCulled = false;
  plane.renderOrder = 120;
  plane.name = 'kapi-girdap';
  group.add(plane);

  const maxPts = POINTS.high;
  const seeds = new Float32Array(maxPts);
  for (let i = 0; i < maxPts; i++) seeds[i] = (i + 0.5) / maxPts;
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxPts * 3), 3));
  pgeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  pgeo.setDrawRange(0, POINTS[quality]);
  const points = new THREE.Points(pgeo, new THREE.ShaderMaterial({
    uniforms: puniforms,
    vertexShader: PVERT,
    fragmentShader: PFRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  }));
  points.frustumCulled = false;
  points.renderOrder = 121;
  points.name = 'kapi-halka';
  group.add(points);

  let state = 'gizli';
  let t = 0;
  let phase = 0;
  let phaseP = 0;
  let open = 0;
  let calib = 0;
  let calibrating = false;
  let spec = null;
  let disposed = false;
  let parent = null;

  function place(s) {
    const w = s.w > 0 ? s.w : 3;
    const h = s.h > 0 ? s.h : 4;
    group.position.set(s.x, s.y + h * 0.5, s.z);
    // levha normali +Z: dönüş θ → (sin θ, cos θ) = (nx, nz)
    group.rotation.set(0, Math.atan2(s.nx || 0, s.nz === undefined ? 1 : s.nz), 0);
    plane.scale.set(w, h, 1);
    puniforms.uRadius.value.set(w * 0.5, h * 0.5);
    puniforms.uScale.value = 1;
  }

  function paint(kind) {
    const c = GATE_COLORS[kind === 'back' ? 'back' : 'out'];
    uniforms.uCore.value.set(c.core[0], c.core[1], c.core[2]);
    uniforms.uRimCol.value.set(c.rim[0], c.rim[1], c.rim[2]);
    uniforms.uKind.value = c.kind;
  }

  const api = {
    group,
    attach(root) {
      if (parent === root) return;
      if (parent) parent.remove(group);
      parent = root || null;
      if (parent) parent.add(group);
    },
    show(s) {
      if (disposed || !s) return;
      const same = spec && spec.id === s.id && state !== 'kapaniyor' && state !== 'gizli';
      spec = s;
      place(s);
      paint(s.kind);
      calibrating = !!s.calibrating;
      if (!same) {
        open = 0;
        state = 'aciliyor';
        group.visible = true;
      }
    },
    hide(hopts) {
      if (disposed || state === 'gizli') return;
      if (hopts && hopts.instant) {
        state = 'gizli';
        open = 0;
        uniforms.uOpen.value = 0;
        group.visible = false;
        spec = null;
        return;
      }
      state = 'kapaniyor';
    },
    setCharge(k) {
      uniforms.uCharge.value = clamp01(Number(k) || 0);
    },
    setCalibration(k) {
      calib = clamp01(Number(k) || 0);
      puniforms.uCalib.value = calib;
    },
    setReducedMotion(b) {
      reduced = !!b;
      uniforms.uCalm.value = reduced ? 1 : 0;
    },
    setQuality(q) {
      if (q !== 'low' && q !== 'medium' && q !== 'high') return;
      quality = q;
      pgeo.setDrawRange(0, POINTS[quality]);
    },
    update(dt) {
      if (disposed || state === 'gizli') return;
      const d = dt > 0 ? Math.min(dt, 0.1) : 0;
      t += d;
      uniforms.uTime.value = t;
      // faz = hızın zaman integrali (girdap ve parçacık ayrı hız eğrileri); şarj/sakin geçişleri fazı sıçratmaz
      phase += d * (1 - 0.75 * uniforms.uCalm.value) * (1 + 3.5 * uniforms.uCharge.value);
      phaseP += d * (1 - 0.7 * uniforms.uCalm.value) * (1 + 2.5 * uniforms.uCharge.value);
      uniforms.uPhase.value = phase;
      puniforms.uPhaseP.value = phaseP;
      if (state === 'aciliyor') {
        // kalibrasyonda açılma kalibrasyon ilerlemesine bağlanır (3 sn); normalde 0,55 sn
        const target = calibrating ? Math.max(0.12, calib) : 1;
        const rate = calibrating ? 4 : 1 / OPEN_SECS;
        open = open < target ? Math.min(target, open + d * rate) : target;
        if (!calibrating && open >= 1) state = 'acik';
      } else if (state === 'acik') {
        open = 1;
      } else if (state === 'kapaniyor') {
        open -= d / CLOSE_SECS;
        if (open <= 0) {
          open = 0;
          state = 'gizli';
          group.visible = false;
          spec = null;
        }
      }
      if (state === 'aciliyor' && calibrating && calib >= 1) {
        calibrating = false;
      }
      // reducedMotion: açılma/kapanma sert değil yumuşak (ease); hareketsiz değil ama yavaş
      uniforms.uOpen.value = reduced ? open * open * (3 - 2 * open) : 1 - (1 - open) * (1 - open);
    },
    get openness() {
      return open;
    },
    get state() {
      return state;
    },
    get spec() {
      return spec;
    },
    get stats() {
      return { draws: group.visible ? 2 : 0, points: group.visible ? POINTS[quality] : 0, visible: group.visible };
    },
    uniforms,
    dispose() {
      if (disposed) return;
      disposed = true;
      api.attach(null);
      plane.geometry.dispose();
      plane.material.dispose();
      pgeo.dispose();
      points.material.dispose();
    },
  };
  return api;
}
