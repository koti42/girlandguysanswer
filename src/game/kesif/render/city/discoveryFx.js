/*
 * KEŞİF render/city — KEŞİF VE GÖREV GÖRSELLERİ (Neon Meridyen Faz 4, discovery_missions): veri çipleri, grafiti çıkartmaları, görev ışığı ve yarış kapı halkaları.
 * Hepsi örnekli ve tek çağrıdır: çipler 1 + grafiti 1 + halkalar 1 + ışın 1 = 4 çizim çağrısı (sözleşme §17: toplam ≤ 250). Işık YOK (ShaderMaterial/Basic), render-to-texture YOK.
 *
 *   createDiscoveryFx({THREE?, quality?, reducedMotion?}) → fx
 *   fx.group                        kök (frustumCulled kapalı örnekli ağlar)
 *   fx.setChips(list, n)            [{x,y,z,hot}] — görünür (bulunmamış) çipler; hot: tarayıcıyla parlayan
 *   fx.setDecals(list, n)           [{cx,cy,cz,yaw,w,h,design,color}] — boyanmış grafitiler (değişince çağrılır)
 *   fx.setRings(list, n)            [{x,y,z,r,nx,nz,role:'sonraki'|'sonra'|'hedef'}]   yarış kapısı (dikey) / hedef (yatay) halkası
 *   fx.setBeam(spec|null)           {x,y,z,r,color?:[r,g,b]} görev ışığı sütunu
 *   fx.update(dt, env)              env {night 0..1, reduced}
 *   fx.setQuality('low'|'medium'|'high') · fx.setReducedMotion(b) · fx.warm(renderer, scene, camera, opts) → ms · fx.stats · fx.dispose()
 *   STENCIL_NAMES (6) · PALETTE (8 sabit renk, kilit: serbest çizim yok)
 * Grafiti kalıpları 6×8 sabit (Yıldız, Roket, Robot, Bulut, Gezegen, Dalga); atlas bir kez tuvalde çizilir (tarayıcı yoksa düz doku).
 */
import * as THREE_NS from 'three';

export const CAPS = Object.freeze({
  high: Object.freeze({ chips: 64, decals: 90, rings: 6 }),
  medium: Object.freeze({ chips: 48, decals: 90, rings: 6 }),
  low: Object.freeze({ chips: 32, decals: 60, rings: 4 }),
});
export const PALETTE = Object.freeze([0xff4d5e, 0xff9a3c, 0xffe14d, 0x5be06f, 0x38e8ff, 0x4d7bff, 0xb07cff, 0xff6fd0]);
export const STENCIL_NAMES = Object.freeze(['Yıldız', 'Roket', 'Robot', 'Bulut', 'Gezegen', 'Dalga']);
const CELL_W = 192;
const CELL_H = 128;
const RING_COLOR = Object.freeze({ sonraki: 0xb6ff3d, sonra: 0x38e8ff, hedef: 0xffe14d });
const CHIP_COLOR = 0x6dffb4;
const CHIP_HOT = 0xffffff;

const DECAL_VERT = /* glsl */`
attribute float aDesign;
varying vec2 vUv;
varying float vDesign;
varying vec3 vWorld;
varying vec3 vTint;
void main() {
  vUv = uv;
  vDesign = aDesign;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vTint = vec3(1.0);
#ifdef USE_INSTANCING_COLOR
  vTint = instanceColor;
#endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const DECAL_FRAG = /* glsl */`
uniform sampler2D uAtlas;
uniform float uNight;
varying vec2 vUv;
varying float vDesign;
varying vec3 vWorld;
varying vec3 vTint;
void main() {
  vec2 uv = vec2((vDesign + vUv.x) / 6.0, vUv.y);
  vec4 t = texture2D(uAtlas, uv);
  float d = distance(vWorld, cameraPosition);
  float fade = 1.0 - smoothstep(80.0, 130.0, d);
  if (t.a * fade < 0.04) discard;
  vec3 tint = vTint;
  vec3 col = tint * (0.72 + 0.3 * t.r) * (1.0 + 0.2 * uNight);
  gl_FragColor = vec4(col, t.a * fade);
}
`;

const BEAM_VERT = /* glsl */`
varying float vY;
void main() {
  vY = position.y * 0.0166667 + 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BEAM_FRAG = /* glsl */`
uniform float uTime;
uniform float uCalm;
uniform vec3 uBeam;
varying float vY;
void main() {
  float a = pow(clamp(1.0 - vY, 0.0, 1.0), 1.4) * 0.7;
  a *= 0.82 + 0.18 * sin(uTime * 2.4 + vY * 9.0) * (1.0 - uCalm);
  gl_FragColor = vec4(uBeam * 0.95, a);
}
`;

const RING_VERT = /* glsl */`
varying vec3 vTint;
void main() {
  vTint = vec3(1.0);
#ifdef USE_INSTANCING_COLOR
  vTint = instanceColor;
#endif
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const RING_FRAG = /* glsl */`
uniform float uTime;
uniform float uCalm;
varying vec3 vTint;
void main() {
  vec3 c = vTint;
  float p = 0.85 + 0.15 * sin(uTime * 3.0) * (1.0 - uCalm);
  gl_FragColor = vec4(c * 0.95 * p, 0.9);
}
`;

const CHIP_VERT = /* glsl */`
varying vec3 vTint;
varying float vShade;
void main() {
  vTint = vec3(0.4, 1.0, 0.7);
#ifdef USE_INSTANCING_COLOR
  vTint = instanceColor;
#endif
  vShade = 0.65 + 0.35 * normalize(normal).y;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const CHIP_FRAG = /* glsl */`
varying vec3 vTint;
varying float vShade;
void main() {
  vec3 c = vTint;
  gl_FragColor = vec4(c * (0.55 + 0.4 * vShade), 0.95);
}
`;

/** Altı kalıbı tuvale çizer (beyaz + yumuşak kenar); tuval yoksa (düğüm testleri) null. */
export function drawAtlas(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || typeof d.createElement !== 'function') return null;
  const cv = d.createElement('canvas');
  cv.width = CELL_W * 6;
  cv.height = CELL_H;
  const g = cv.getContext('2d');
  if (!g) return null;
  g.clearRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const at = (i, fn) => {
    g.save();
    g.translate(i * CELL_W + CELL_W / 2, CELL_H / 2);
    fn();
    g.restore();
  };
  at(0, () => { // yıldız
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 === 0 ? 50 : 22;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      if (k === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  });
  at(1, () => { // roket
    g.beginPath();
    g.moveTo(0, -52);
    g.quadraticCurveTo(26, -22, 20, 26);
    g.lineTo(-20, 26);
    g.quadraticCurveTo(-26, -22, 0, -52);
    g.fill();
    g.beginPath();
    g.moveTo(-20, 8); g.lineTo(-40, 36); g.lineTo(-20, 28); g.closePath();
    g.moveTo(20, 8); g.lineTo(40, 36); g.lineTo(20, 28); g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(-10, 34); g.lineTo(0, 54); g.lineTo(10, 34); g.closePath();
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(0, -8, 8, 0, Math.PI * 2); g.fill();
  });
  at(2, () => { // robot
    g.fillRect(-30, -30, 60, 52);
    g.fillRect(-4, -46, 8, 16);
    g.beginPath(); g.arc(0, -48, 6, 0, Math.PI * 2); g.fill();
    g.fillRect(-44, -10, 12, 30);
    g.fillRect(32, -10, 12, 30);
    g.fillRect(-22, 26, 14, 24);
    g.fillRect(8, 26, 14, 24);
    g.globalCompositeOperation = 'destination-out';
    g.fillRect(-20, -18, 12, 12);
    g.fillRect(8, -18, 12, 12);
    g.fillRect(-16, 6, 32, 6);
  });
  at(3, () => { // bulut
    g.beginPath();
    g.arc(-24, 8, 22, 0, Math.PI * 2);
    g.arc(0, -8, 30, 0, Math.PI * 2);
    g.arc(28, 6, 24, 0, Math.PI * 2);
    g.fill();
    g.fillRect(-40, 8, 82, 22);
  });
  at(4, () => { // gezegen
    g.beginPath(); g.arc(0, 0, 34, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.lineWidth = 6;
    g.beginPath(); g.ellipse(0, 0, 58, 14, -0.35, 0, Math.PI * 2); g.stroke();
    g.globalCompositeOperation = 'source-over';
    g.lineWidth = 7;
    g.beginPath(); g.ellipse(0, 0, 58, 14, -0.35, Math.PI * 0.05, Math.PI * 0.95); g.stroke();
  });
  at(5, () => { // dalga
    g.lineWidth = 12;
    for (let r = 0; r < 3; r++) {
      g.beginPath();
      for (let x = -56; x <= 56; x += 4) {
        const y = -26 + r * 26 + Math.sin((x / 56) * Math.PI * 2) * 11;
        if (x === -56) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  });
  return cv;
}

export function createDiscoveryFx(optIn) {
  const opt = optIn || {};
  const THREE = opt.THREE || THREE_NS;
  let quality = CAPS[opt.quality] ? opt.quality : 'high';
  let reduced = !!opt.reducedMotion;
  const group = new THREE.Group();
  group.name = 'discoveryFx';
  const stats = {
    chips: 0, decals: 0, rings: 0, beam: 0, draws: 4, warmMs: 0,
  };
  const time = { v: 0 };
  const tmp = new THREE.Object3D();
  const col = new THREE.Color();
  const own = [];

  /* ---------------------------------------------------------------------- çipler */
  const chipGeo = new THREE.OctahedronGeometry(0.4, 0);
  own.push(chipGeo);
  const chipMat = new THREE.ShaderMaterial({
    vertexShader: CHIP_VERT, fragmentShader: CHIP_FRAG, transparent: true, depthWrite: false, fog: false,
  });
  own.push(chipMat);
  const chipMesh = new THREE.InstancedMesh(chipGeo, chipMat, CAPS.high.chips);
  chipMesh.name = 'chips';
  chipMesh.frustumCulled = false;
  chipMesh.count = 0;
  chipMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPS.high.chips * 3), 3);
  group.add(chipMesh);
  let chipList = [];
  let chipN = 0;

  /* ---------------------------------------------------------------------- grafiti */
  const decalGeo = new THREE.PlaneGeometry(1, 1);
  own.push(decalGeo);
  const designAttr = new THREE.InstancedBufferAttribute(new Float32Array(CAPS.high.decals), 1);
  decalGeo.setAttribute('aDesign', designAttr);
  const cv = drawAtlas();
  const atlas = cv ? new THREE.CanvasTexture(cv) : new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  if (cv) {
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.minFilter = THREE.LinearMipmapLinearFilter;
    atlas.generateMipmaps = true;
  }
  atlas.needsUpdate = true;
  own.push(atlas);
  const decalMat = new THREE.ShaderMaterial({
    uniforms: { uAtlas: { value: atlas }, uNight: { value: 0 } },
    vertexShader: DECAL_VERT,
    fragmentShader: DECAL_FRAG,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
    fog: false,
  });
  own.push(decalMat);
  const decalMesh = new THREE.InstancedMesh(decalGeo, decalMat, CAPS.high.decals);
  decalMesh.name = 'decals';
  decalMesh.frustumCulled = false;
  decalMesh.count = 0;
  decalMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPS.high.decals * 3), 3);
  group.add(decalMesh);

  /* ---------------------------------------------------------------------- halkalar + ışın */
  const ringGeo = new THREE.TorusGeometry(1, 0.06, 5, quality === 'low' ? 28 : 44);
  own.push(ringGeo);
  const ringUniforms = { uTime: { value: 0 }, uCalm: { value: reduced ? 1 : 0 } };
  const ringMat = new THREE.ShaderMaterial({
    uniforms: ringUniforms, vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  own.push(ringMat);
  const ringMesh = new THREE.InstancedMesh(ringGeo, ringMat, CAPS.high.rings);
  ringMesh.name = 'rings';
  ringMesh.frustumCulled = false;
  ringMesh.count = 0;
  ringMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPS.high.rings * 3), 3);
  group.add(ringMesh);

  const beamGeo = new THREE.CylinderGeometry(1, 1, 60, quality === 'low' ? 10 : 16, 1, true);
  own.push(beamGeo);
  const beamUniforms = { uTime: ringUniforms.uTime, uCalm: ringUniforms.uCalm, uBeam: { value: new THREE.Vector3(1, 0.8, 0.22) } };
  const beamMat = new THREE.ShaderMaterial({
    uniforms: beamUniforms, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  own.push(beamMat);
  const beamMesh = new THREE.Mesh(beamGeo, beamMat);
  beamMesh.name = 'beam';
  beamMesh.frustumCulled = false;
  beamMesh.visible = false;
  group.add(beamMesh);

  /* ---------------------------------------------------------------------- API */
  function setChips(list, n) {
    chipList = list;
    chipN = Math.max(0, Math.min(n === undefined ? list.length : n, CAPS[quality].chips));
    chipMesh.count = chipN;
    for (let i = 0; i < chipN; i++) {
      col.setHex(list[i].hot ? CHIP_HOT : CHIP_COLOR);
      chipMesh.instanceColor.setXYZ(i, col.r, col.g, col.b);
    }
    chipMesh.instanceColor.needsUpdate = true;
    stats.chips = chipN;
  }

  function setDecals(list, n) {
    const m = Math.max(0, Math.min(n === undefined ? list.length : n, CAPS[quality].decals));
    for (let i = 0; i < m; i++) {
      const d = list[i];
      const fitW = Math.min(d.w, d.h * (CELL_W / CELL_H));
      const fitH = fitW / (CELL_W / CELL_H);
      tmp.position.set(d.cx, d.cy, d.cz);
      tmp.rotation.set(0, d.yaw + Math.PI, 0);
      tmp.scale.set(fitW, fitH, 1);
      tmp.updateMatrix();
      decalMesh.setMatrixAt(i, tmp.matrix);
      col.setHex(PALETTE[((d.color % PALETTE.length) + PALETTE.length) % PALETTE.length]);
      decalMesh.instanceColor.setXYZ(i, col.r, col.g, col.b);
      designAttr.setX(i, ((d.design % 6) + 6) % 6);
    }
    decalMesh.count = m;
    decalMesh.instanceMatrix.needsUpdate = true;
    decalMesh.instanceColor.needsUpdate = true;
    designAttr.needsUpdate = true;
    stats.decals = m;
  }

  function setRings(list, n) {
    const m = Math.max(0, Math.min(n === undefined ? list.length : n, CAPS[quality].rings));
    for (let i = 0; i < m; i++) {
      const r = list[i];
      tmp.rotation.set(0, 0, 0);
      if (r.role === 'hedef') {
        const rr = Math.min(10, Math.max(2.5, r.r));
        tmp.position.set(r.x, r.y + 0.18, r.z);
        tmp.rotation.set(-Math.PI / 2, 0, 0);
        tmp.scale.set(rr, rr, rr);
      } else {
        const rr = Math.max(2.5, r.r * 0.9);
        tmp.position.set(r.x, r.y + rr * 0.72, r.z);
        tmp.rotation.set(0, Math.atan2(r.nx, r.nz), 0);
        tmp.scale.set(rr, rr, rr);
      }
      tmp.updateMatrix();
      ringMesh.setMatrixAt(i, tmp.matrix);
      col.setHex(RING_COLOR[r.role] || RING_COLOR.sonra);
      ringMesh.instanceColor.setXYZ(i, col.r, col.g, col.b);
    }
    ringMesh.count = m;
    ringMesh.instanceMatrix.needsUpdate = true;
    ringMesh.instanceColor.needsUpdate = true;
    stats.rings = m;
  }

  function setBeam(spec) {
    if (!spec) {
      beamMesh.visible = false;
      stats.beam = 0;
      return;
    }
    const r = Math.min(4, Math.max(1, spec.r * 0.38));
    if (spec.color) beamUniforms.uBeam.value.set(spec.color[0], spec.color[1], spec.color[2]);
    beamMesh.position.set(spec.x, spec.y + 30, spec.z);
    beamMesh.scale.set(r, 1, r);
    beamMesh.visible = true;
    stats.beam = 1;
  }

  function update(dt, env) {
    const e = env || {};
    time.v += Math.min(0.1, Math.max(0, dt || 0));
    ringUniforms.uTime.value = time.v;
    ringUniforms.uCalm.value = reduced || e.reduced ? 1 : 0;
    decalMat.uniforms.uNight.value = Math.max(0, Math.min(1, e.night || 0));
    if (chipN > 0) {
      const calm = reduced || e.reduced;
      for (let i = 0; i < chipN; i++) {
        const c = chipList[i];
        const bob = calm ? 0 : Math.sin(time.v * 2.2 + i * 1.7) * 0.12;
        tmp.position.set(c.x, c.y + 0.95 + bob, c.z);
        tmp.rotation.set(0, calm ? 0.6 : time.v * 1.4 + i, 0);
        const s = c.hot && !calm ? 1.15 + 0.12 * Math.sin(time.v * 5 + i) : 1;
        tmp.scale.set(s, s * 1.5, s);
        tmp.updateMatrix();
        chipMesh.setMatrixAt(i, tmp.matrix);
      }
      chipMesh.instanceMatrix.needsUpdate = true;
    }
  }

  function setQuality(q) {
    if (!CAPS[q] || q === quality) return;
    quality = q;
    chipMesh.count = Math.min(chipMesh.count, CAPS[q].chips);
    decalMesh.count = Math.min(decalMesh.count, CAPS[q].decals);
    ringMesh.count = Math.min(ringMesh.count, CAPS[q].rings);
  }

  function setReducedMotion(b) {
    reduced = !!b;
    ringUniforms.uCalm.value = reduced ? 1 : 0;
  }

  /** Programları önceden derler (ilk görünümde takılma olmasın): her ağ bir örnekle görünür yapılıp renderer.compile çağrılır. */
  function warm(renderer, scene, camera, wopt) {
    if (!renderer || !scene || !camera || typeof renderer.compile !== 'function') return 0;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const prev = [chipMesh, decalMesh, ringMesh].map((m) => [m, m.count]);
    const prevBeam = beamMesh.visible;
    prev.forEach(([m]) => { m.count = 1; });
    tmp.position.set(camera.position.x, camera.position.y, camera.position.z - 4);
    tmp.rotation.set(0, 0, 0);
    tmp.scale.set(1, 1, 1);
    tmp.updateMatrix();
    [chipMesh, decalMesh, ringMesh].forEach((m) => { m.setMatrixAt(0, tmp.matrix); m.instanceMatrix.needsUpdate = true; });
    beamMesh.visible = true;
    const variants = wopt && Array.isArray(wopt.variants) && wopt.variants.length ? wopt.variants : [null];
    let rt = null;
    let prevRT = null;
    try {
      prevRT = typeof renderer.getRenderTarget === 'function' ? renderer.getRenderTarget() : null;
      if (wopt && wopt.postfx && typeof renderer.setRenderTarget === 'function' && typeof THREE.WebGLRenderTarget === 'function') {
        rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType });
        renderer.setRenderTarget(rt);
      }
    } catch {
      rt = null;
    }
    try {
      for (let i = 0; i < variants.length; i++) {
        const vt = variants[i];
        try {
          if (vt && typeof vt.enter === 'function') vt.enter();
          renderer.compile(scene, camera);
        } catch {
          /* yut */
        } finally {
          try { if (vt && typeof vt.exit === 'function') vt.exit(); } catch { /* yut */ }
        }
      }
    } finally {
      if (rt) {
        try { renderer.setRenderTarget(prevRT); } catch { /* yut */ }
        try { rt.dispose(); } catch { /* yut */ }
      }
    }
    prev.forEach(([m, c]) => { m.count = c; });
    beamMesh.visible = prevBeam;
    stats.warmMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    return stats.warmMs;
  }

  function dispose() {
    if (group.parent) group.parent.remove(group);
    own.forEach((o) => { try { o.dispose(); } catch { /* yut */ } });
    chipMesh.dispose();
    decalMesh.dispose();
    ringMesh.dispose();
  }

  return {
    group,
    stats,
    setChips,
    setDecals,
    setRings,
    setBeam,
    update,
    setQuality,
    setReducedMotion,
    warm,
    dispose,
    get caps() {
      return CAPS[quality];
    },
    chipMesh,
    decalMesh,
    ringMesh,
    beamMesh,
  };
}
