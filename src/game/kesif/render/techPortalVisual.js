/*
 * KEŞİF render — AÇIK DÜNYA PORTAL çerçeveleri (Portal Tabancası): yüzeye yapışık iki oval, girdap shader'ı, yumuşak ışıma, parçacık halkası.
 *
 *   createPortalVisual(THREE, parent, opts) → {
 *     sync(frames, now)      tech.portalFrames() ({mavi, turuncu}; null olabilir) — yeni/taşınan portal "açılma" animasyonuyla belirir
 *     update(dt, camera, particles, reduced)    shader zamanı + parçacık halkası + açılma animasyonu
 *     mesh(color) → Mesh | null        (test/hata ayıklama)    dispose()
 *     setPalette({a:{c,c2}, b:{c,c2}} | null)    Keşif mağaza görünümü: yalnız RENK uniform'ları (a = mavi portal, b = turuncu); null = varsayılan
 *     hexOf(name) → 0xRRGGBB            portalın şu anki ışıma rengi (parçacıklar için)
 *   }
 *
 * Renk körlüğü: mavi = DÜZ halka + saat yönünde girdap; turuncu = ÇİZGİLİ halka + saat yönü tersi girdap (renge ek olarak şekil/yön farkı).
 * Çizim: saydam, derinlik yazmaz (polygonOffset ile duvara karşı kayık), render-to-texture YOK. İki levha + iki ışıma = 4 çizim çağrısı.
 * Isınma: portal yokken de sahnede görünür ama çok uzakta (y = −9000) durur → renderer.compile programı önceden bağlar (ilk atışta takılma yok).
 */
const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uKind;
uniform float uOpen;
uniform float uCalm;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float open = clamp(uOpen, 0.0, 1.0);
  float rr = length(p) / max(open, 0.02);
  if (rr > 1.0) discard;
  float t = uTime * (1.0 - 0.7 * uCalm);
  float ang = atan(p.y, p.x);
  float dir = uKind > 0.5 ? -1.0 : 1.0;
  float rim = smoothstep(0.76, 0.9, rr) * (1.0 - smoothstep(0.95, 1.0, rr));
  float dash = step(0.0, sin(ang * 10.0 - t * 1.4 * dir));
  rim *= mix(1.0, 0.25 + 0.75 * dash, uKind);
  float sw = 0.5 + 0.5 * sin(ang * 3.0 * dir + rr * 8.0 - t * 2.4 * dir);
  float inner = 1.0 - smoothstep(0.0, 0.9, rr);
  vec3 core = mix(uColor2, uColor, sw);
  vec3 col = core * (0.5 + 0.75 * sw * inner) + uColor * rim * 1.4 + vec3(rim * 0.55);
  float fl = 0.5 + 0.5 * sin(t * 6.0 + rr * 5.0);
  col += uColor * 0.12 * fl * (1.0 - uCalm);
  float a = clamp(0.9 * (1.0 - smoothstep(0.9, 1.0, rr)) + rim, 0.0, 1.0);
  col = clamp(col, 0.0, 3.0);
  gl_FragColor = vec4(col, a);
}
`;

const HALO_FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uColor;
uniform float uOpen;
uniform float uCalm;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float d = clamp(1.0 - length(p), 0.0, 1.0);
  float pulse = 0.85 + 0.15 * sin(uTime * 2.2 * (1.0 - 0.7 * uCalm));
  float a = d * d * 0.5 * pulse * clamp(uOpen, 0.0, 1.0);
  gl_FragColor = vec4(uColor * a, a);
}
`;

const PALETTE = {
  mavi: { c: 0x3a9bff, c2: 0x0a2a78, kind: 0, hex: 0x3a8fff },
  turuncu: { c: 0xff9a2e, c2: 0x7a2a00, kind: 1, hex: 0xff9a3a },
};
const NAMES = ['mavi', 'turuncu'];
const FAR_Y = -9000;
const OPEN_TIME = 0.4;

export function createPortalVisual(THREE, parent, opts) {
  const o = opts || {};
  const group = new THREE.Group();
  group.name = 'kesif-portallar';
  parent.add(group);
  // portal başına renk (varsayılan PALETTE'in kopyası; kind ASLA değişmez: düz / kesikli halka renk körü ayrımı)
  const pals = { mavi: Object.assign({}, PALETTE.mavi), turuncu: Object.assign({}, PALETTE.turuncu) };
  const items = {};
  const basis = new THREE.Matrix4();
  const vr = new THREE.Vector3();
  const vu = new THREE.Vector3();
  const vn = new THREE.Vector3();
  const pt = { x: 0, y: 0, z: 0 };

  function make(name) {
    const pal = pals[name];
    const uniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(pal.c) },
      uColor2: { value: new THREE.Color(pal.c2) },
      uKind: { value: pal.kind },
      uOpen: { value: 0 },
      uCalm: { value: o.reducedMotion ? 1 : 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const hUniforms = {
      uTime: uniforms.uTime, uColor: uniforms.uColor, uOpen: uniforms.uOpen, uCalm: uniforms.uCalm,
    };
    const hmat = new THREE.ShaderMaterial({
      uniforms: hUniforms,
      vertexShader: VERT,
      fragmentShader: HALO_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), mat);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 3.4), hmat);
    quad.matrixAutoUpdate = false;
    halo.matrixAutoUpdate = false;
    quad.renderOrder = 18;
    halo.renderOrder = 17;
    quad.frustumCulled = false;
    halo.frustumCulled = false;
    quad.name = 'portal-' + name;
    halo.name = 'portal-halo-' + name;
    group.add(halo, quad);
    const it = {
      name, quad, halo, mat, hmat, uniforms, key: '', open: 0, active: false, swirlT: 0, center: [0, 0, 0], axis: 0,
    };
    place(it, null);
    return it;
  }

  function place(it, fr) {
    if (!fr) {
      basis.identity();
      basis.setPosition(0, FAR_Y, 0);
      it.quad.matrix.copy(basis);
      it.halo.matrix.copy(basis);
      it.quad.matrixWorldNeedsUpdate = true;
      it.halo.matrixWorldNeedsUpdate = true;
      return;
    }
    vr.set(fr.r[0], fr.r[1], fr.r[2]);
    vu.set(fr.u[0], fr.u[1], fr.u[2]);
    vn.set(fr.n[0], fr.n[1], fr.n[2]);
    basis.makeBasis(vr, vu, vn);
    // tek hücre (2 yükseklik): çerçeve merkezi 1×2 dikdörtgenin ortası; yüzeyin 2 cm önüne
    basis.setPosition(fr.center[0] + fr.n[0] * 0.02, fr.center[1] + fr.n[1] * 0.02, fr.center[2] + fr.n[2] * 0.02);
    it.quad.matrix.copy(basis);
    basis.setPosition(fr.center[0] + fr.n[0] * 0.012, fr.center[1] + fr.n[1] * 0.012, fr.center[2] + fr.n[2] * 0.012);
    it.halo.matrix.copy(basis);
    it.quad.matrixWorldNeedsUpdate = true;
    it.halo.matrixWorldNeedsUpdate = true;
  }

  NAMES.forEach((n) => { items[n] = make(n); });

  function keyOf(fr) {
    return fr ? fr.cells[0].x + ',' + fr.cells[0].y + ',' + fr.cells[0].z + ':' + fr.n.join(',') + ':' + fr.u.join(',') : '';
  }

  /** frames: {mavi, turuncu}. Yeni ya da taşınan portal açılma animasyonuyla belirir. */
  function sync(frames) {
    for (let i = 0; i < NAMES.length; i++) {
      const name = NAMES[i];
      const it = items[name];
      const fr = frames ? frames[name] : null;
      const k = keyOf(fr);
      if (k === it.key) continue;
      it.key = k;
      if (!fr) {
        it.active = false;
        it.open = 0;
        place(it, null);
        continue;
      }
      it.active = true;
      it.open = o.reducedMotion ? 1 : 0.02;
      it.uniforms.uOpen.value = it.open;
      it.center = fr.center;
      it.axis = fr.n[1] !== 0 ? 0 : fr.n[0] !== 0 ? 1 : 2;
      place(it, fr);
    }
  }

  function update(dt, camera, particles, reduced, time) {
    for (let i = 0; i < NAMES.length; i++) {
      const it = items[NAMES[i]];
      it.uniforms.uTime.value = time;
      it.uniforms.uCalm.value = reduced ? 1 : 0;
      if (!it.active) continue;
      if (it.open < 1) {
        it.open = Math.min(1, it.open + dt / OPEN_TIME);
        // yumuşak aşma: easeOutBack
        const t = it.open - 1;
        it.uniforms.uOpen.value = it.open >= 1 ? 1 : Math.min(1.0, 1 + 2.2 * t * t * t + 1.2 * t * t);
      }
      it.swirlT -= dt;
      if (it.swirlT <= 0 && particles && particles.portalSwirl && camera) {
        it.swirlT = reduced ? 1.4 : 0.55;
        const dx = it.center[0] - camera.position.x;
        const dy = it.center[1] - camera.position.y;
        const dz = it.center[2] - camera.position.z;
        if (dx * dx + dy * dy + dz * dz < 30 * 30) {
          pt.x = it.center[0]; pt.y = it.center[1] + 0.5; pt.z = it.center[2];
          particles.portalSwirl(pt, pals[it.name].hex, {
            axis: it.axis === 1 ? 'x' : it.axis === 2 ? 'z' : undefined, radius: 0.85, count: reduced ? 3 : 7,
          });
        }
      }
    }
  }

  /** Keşif görünümü: iki portalın renklerini değiştirir (yalnız uniform değeri; yeni malzeme/program yok). */
  function setPalette(p) {
    const ok = (x) => x && Number.isFinite(x.c) && Number.isFinite(x.c2);
    const src = p && ok(p.a) && ok(p.b) ? { mavi: p.a, turuncu: p.b } : null;
    NAMES.forEach((n) => {
      const d = PALETTE[n];
      const pl = pals[n];
      pl.c = src ? src[n].c : d.c;
      pl.c2 = src ? src[n].c2 : d.c2;
      pl.hex = src ? src[n].c : d.hex;
      const it = items[n];
      it.uniforms.uColor.value.setHex(pl.c);
      it.uniforms.uColor2.value.setHex(pl.c2);
    });
  }
  if (o.palette) setPalette(o.palette);

  function dispose() {
    NAMES.forEach((n) => {
      const it = items[n];
      it.quad.geometry.dispose();
      it.halo.geometry.dispose();
      it.mat.dispose();
      it.hmat.dispose();
    });
    parent.remove(group);
  }

  return {
    sync, update, dispose, group, setPalette, hexOf: (n) => (pals[n] ? pals[n].hex : 0xffffff), mesh: (c) => (items[c] && items[c].active ? items[c].quad : null), _items: items,
  };
}

export const PORTAL_HEX = { mavi: PALETTE.mavi.hex, turuncu: PALETTE.turuncu.hex };
