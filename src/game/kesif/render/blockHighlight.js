/*
 * KEŞİF render — hedef blok çerçevesi, kırma çatlağı aşamaları ve yerleştirme hayaleti.
 *
 *   createBlockHighlight(THREE, {reducedMotion}) → {object3D, setTarget(hit|null), setBreakProgress(0..1),
 *     setPlacementGhost(blockId|null, pos, valid?), update(dt), setReducedMotion(b), setColor(hex), dispose(), state}
 *
 * Çerçeve: 12 kenar, ekran uzayında sabit piksel kalınlığında (≈2 px çekirdek + yumuşak ışıma) şeritler; köşelerde biraz
 * daha parlak, yumuşak nabız (~0,35 Hz). Kutu değişince çerçeve akarak kayar. Kısmi şekiller (plaka, merdiven, meşale,
 * çiçek) gerçek çarpışma kutularına oturur.
 * Çatlak: tek bir prosedürel eşik dokusu (bkz. generateCrackData) + shader; ilerleme 10 kesikli aşamaya bölünür,
 * her aşama bir öncekinin üst kümesidir. Hayalet: yarı saydam dolgu + yeşil/kırmızı çerçeve (geçerli/geçersiz).
 *
 * hit biçimleri (hepsi kabul): {x,y,z} | {pos:{x,y,z}|[x,y,z]} | {block:{x,y,z}|[x,y,z]}; isteğe bağlı blockId,
 * normal ({x,y,z}|[x,y,z]|{nx,ny,nz}) veya face ('top'|'bottom'|'north'|'south'|'east'|'west').
 */
import { getBlock } from '../sim/blocks.js';
import { blockBaseColor } from './blockColors.js';
import { px, py, pz } from './particleLogic.js';

export const CRACK_STAGES = 10;
const MAX_BOXES = 3;
const EDGE_PX = 3;

const FACE_NORMALS = {
  top: [0, 1, 0], up: [0, 1, 0], bottom: [0, -1, 0], down: [0, -1, 0],
  north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0],
};

/** Çarpma kaydı → {x,y,z,nx,ny,nz,hasNormal,blockId} (out yeniden kullanılır). Geçersizse false. */
export function normalizeHit(hit, out) {
  if (!hit) return false;
  let b = hit;
  if (hit.pos) b = hit.pos;
  else if (hit.block && typeof hit.block === 'object') b = hit.block;
  const x = px(b);
  const y = py(b);
  const z = pz(b);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
  out.x = Math.floor(x); out.y = Math.floor(y); out.z = Math.floor(z);
  out.blockId = hit.blockId !== undefined ? hit.blockId : (hit.id !== undefined ? hit.id : -1);
  out.hasNormal = false;
  out.nx = 0; out.ny = 1; out.nz = 0;
  let n = hit.normal;
  if (!n && typeof hit.face === 'string' && FACE_NORMALS[hit.face]) n = FACE_NORMALS[hit.face];
  if (!n && hit.nx !== undefined) n = [hit.nx, hit.ny, hit.nz];
  if (n) {
    const nx = px(n);
    const ny = py(n);
    const nz = pz(n);
    if (Number.isFinite(nx + ny + nz) && (nx !== 0 || ny !== 0 || nz !== 0)) {
      out.nx = nx; out.ny = ny; out.nz = nz; out.hasNormal = true;
    }
  }
  return true;
}

const FULL_BOX = [[0, 0, 0, 1, 1, 1]];
const SHAPE_BOXES = {
  cross: [[0.15, 0, 0.15, 0.85, 0.8, 0.85]],
  torch: [[0.38, 0, 0.38, 0.62, 0.72, 0.62]],
  plate: [[0.05, 0, 0.05, 0.95, 0.14, 0.95]],
};
const boxCache = new Map();

/** Blok kimliği → çerçevelenecek kutular [[x0,y0,z0,x1,y1,z1],...] (blok-yerel, en çok 3). Hava/bilinmeyen: tam küp. */
export function outlineBoxesFor(blockId) {
  let v = boxCache.get(blockId);
  if (v) return v;
  const b = getBlock(blockId);
  if (!b || blockId === 0) v = FULL_BOX;
  else if (b.collision && b.collision.length > 0) v = b.collision.slice(0, MAX_BOXES);
  else v = SHAPE_BOXES[b.shape] || FULL_BOX;
  boxCache.set(blockId, v);
  return v;
}

/** İlerleme 0..1 → çatlak aşaması 0..9; ilerleme ≤ 0 → -1 (gizli). */
export function crackStage(progress) {
  if (!(progress > 0)) return -1;
  return Math.min(CRACK_STAGES - 1, Math.floor(progress * CRACK_STAGES));
}

/**
 * Prosedürel çatlak eşik dokusu (RGBA8, size×size). R = pikselin belirdiği aşama (aşama+0,5)/10 (belirmeyen = 255),
 * G = çatlak örtüsü (kenar yumuşaklığı), B = ince vurgu. Tohumla belirlenimci.
 * Dönen: {size, data, stages, counts[10]} — counts[s] aşama s'de ilk görünen piksel sayısı.
 */
export function generateCrackData(size = 64, seed = 1337) {
  let a = (seed | 0) ^ 0x2f1b3c5d;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const stageMap = new Float32Array(size * size).fill(99);
  const cover = new Float32Array(size * size);
  const stamp = (cx, cy, rr, stage) => {
    const x0 = Math.max(0, Math.floor(cx - rr - 1));
    const x1 = Math.min(size - 1, Math.ceil(cx + rr + 1));
    const y0 = Math.max(0, Math.floor(cy - rr - 1));
    const y1 = Math.min(size - 1, Math.ceil(cy + rr + 1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const c = 1 - d / (rr + 0.8);
        if (c <= 0) continue;
        const i = y * size + x;
        if (c > 0.2 && stage < stageMap[i]) stageMap[i] = stage;
        if (c > cover[i]) cover[i] = c;
      }
    }
  };
  const grow = (x, y, ang, len, s0, s1, width, depth) => {
    const steps = Math.max(4, Math.round(len));
    let cx = x;
    let cy = y;
    let an = ang;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const stage = s0 + (s1 - s0) * t;
      stamp(cx, cy, width * (1 - 0.45 * t), stage);
      an += (rnd() - 0.5) * 0.75;
      cx += Math.cos(an);
      cy += Math.sin(an);
      if (depth < 2 && k > 3 && k < steps - 2 && rnd() < 0.09) {
        grow(cx, cy, an + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.7), len * (0.35 + rnd() * 0.3),
          Math.min(9.4, stage + 1 + rnd() * 1.5), Math.min(9.9, stage + 3 + rnd() * 2.5), width * 0.7, depth + 1);
      }
      if (cx < -2 || cy < -2 || cx > size + 2 || cy > size + 2) break;
    }
  };
  const c = size / 2;
  // ana çatlak merkezden, tüm aşamalara yayılır (her aşamada yeni piksel olsun)
  grow(c + (rnd() - 0.5) * 6, c + (rnd() - 0.5) * 6, rnd() * Math.PI * 2, size * 0.55, 0, 9.4, 1.35, 0);
  grow(c, c, rnd() * Math.PI * 2, size * 0.5, 0.4, 9.5, 1.2, 0);
  const extra = 4;
  for (let i = 0; i < extra; i++) {
    const edge = rnd() * 4 | 0;
    const t = rnd() * size;
    const sx = edge === 0 ? t : edge === 1 ? size : edge === 2 ? t : 0;
    const sy = edge === 0 ? 0 : edge === 1 ? t : edge === 2 ? size : t;
    const toward = Math.atan2(c - sy, c - sx) + (rnd() - 0.5) * 0.9;
    grow(sx, sy, toward, size * (0.3 + rnd() * 0.25), 2.2 + i * 1.5, Math.min(9.8, 5.5 + i * 1.5), 1.1, 1);
  }
  const data = new Uint8Array(size * size * 4);
  const counts = new Int32Array(CRACK_STAGES);
  // kenar dolgusu: çatlak dışındaki komşu pikseller en yakın çatlağın aşamasını alır (doğrusal süzgeçte hayalet aşama oluşmaz)
  const pad = new Float32Array(size * size).fill(99);
  for (let i = 0; i < size * size; i++) if (stageMap[i] < 99 && cover[i] > 0.2) pad[i] = stageMap[i];
  for (let pass = 0; pass < 2; pass++) {
    const prev = pad.slice();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (prev[i] < 99) continue;
        let m = 99;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
            const v = prev[yy * size + xx];
            if (v < m) m = v;
          }
        }
        pad[i] = m;
      }
    }
  }
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    const st = stageMap[i];
    if (st < 99 && cover[i] > 0.2) {
      const s = Math.min(CRACK_STAGES - 1, Math.max(0, Math.floor(st)));
      data[o] = Math.round(((s + 0.5) / CRACK_STAGES) * 255);
      counts[s]++;
    } else if (pad[i] < 99) {
      const s = Math.min(CRACK_STAGES - 1, Math.max(0, Math.floor(pad[i])));
      data[o] = Math.round(((s + 0.5) / CRACK_STAGES) * 255);
    } else data[o] = 255;
    data[o + 1] = Math.round(Math.min(1, cover[i] * 1.5) * 255);
    data[o + 2] = 0;
    data[o + 3] = 255;
  }
  // B kanalı: çatlağın bir yanına ince açık kenar (kabartma hissi)
  for (let y = 1; y < size; y++) {
    for (let x = 1; x < size; x++) {
      const d = cover[y * size + x] - cover[(y - 1) * size + (x - 1)];
      data[(y * size + x) * 4 + 2] = d < -0.12 ? Math.round(Math.min(1, -d * 1.4) * 255) : 0;
    }
  }
  return { size, data, stages: CRACK_STAGES, counts };
}

/* ------------------------------------------------------------------------------------------------ shader'lar */

const EDGE_VERT = /* glsl */`
attribute vec3 aA;
attribute vec3 aB;
uniform vec3 uMin;
uniform vec3 uMax;
uniform vec2 uRes;
uniform float uWidth;
uniform float uExpand;
varying float vSide;
varying float vT;
void main() {
  vec3 lo = uMin - vec3(uExpand);
  vec3 hi = uMax + vec3(uExpand);
  vec4 ca = projectionMatrix * viewMatrix * vec4(mix(lo, hi, aA), 1.0);
  vec4 cb = projectionMatrix * viewMatrix * vec4(mix(lo, hi, aB), 1.0);
  const float EPS = 0.02;
  if (ca.w < EPS && cb.w < EPS) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  if (ca.w < EPS) ca = mix(ca, cb, (EPS - ca.w) / (cb.w - ca.w));
  if (cb.w < EPS) cb = mix(cb, ca, (EPS - cb.w) / (ca.w - cb.w));
  vec2 na = ca.xy / ca.w;
  vec2 nb = cb.xy / cb.w;
  vec2 d = (nb - na) * uRes;
  float len = length(d);
  vec2 dir = len > 0.0001 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float t = position.x;
  vec4 c = mix(ca, cb, t);
  vec2 off = (nrm * position.y * uWidth + dir * (t * 2.0 - 1.0) * uWidth * 0.6) / uRes * 2.0;
  // derinlik kaydırma: görünüm uzayında ~3 cm kameraya doğru (z_clip = A·z + B; d(ndc)/d(mesafe) = -B / mesafe²)
  float bias = -projectionMatrix[3][2] * 0.03 / max(c.w, 0.05);
  gl_Position = vec4(c.xy + off * c.w, c.z - bias, c.w);
  vSide = position.y;
  vT = t;
}
`;

const EDGE_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uPulse;
uniform float uAlpha;
varying float vSide;
varying float vT;
void main() {
  float s = abs(vSide);
  float core = 1.0 - smoothstep(0.0, 0.42, s);
  float halo = pow(max(1.0 - s, 0.0), 2.2) * 0.5;
  float corner = 0.78 + 0.22 * pow(abs(vT * 2.0 - 1.0), 3.0);
  float a = (core + halo) * corner * uPulse * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (1.0 + core * 0.7), a);
  #include <colorspace_fragment>
}
`;

const CRACK_VERT = /* glsl */`
uniform vec3 uMin;
uniform vec3 uMax;
uniform vec3 uOrigin;
varying vec3 vLocal;
varying vec3 vN;
void main() {
  vec3 p01 = position + 0.5;
  vec3 wp = mix(uMin - vec3(0.003), uMax + vec3(0.003), p01);
  vLocal = wp - uOrigin;
  vN = normal;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const CRACK_FRAG = /* glsl */`
uniform sampler2D uCrack;
uniform float uStage;
varying vec3 vLocal;
varying vec3 vN;
void main() {
  vec3 an = abs(vN);
  vec2 uv;
  if (an.x > 0.5) uv = vLocal.zy;
  else if (an.y > 0.5) uv = vLocal.xz;
  else uv = vLocal.xy;
  float seed = dot(vN, vec3(0.17, 0.31, 0.53));
  uv = fract(uv + vec2(seed * 3.7, seed * 5.1));
  vec4 t = texture2D(uCrack, uv);
  float stage = floor(t.r * 10.0);
  float show = step(stage, uStage + 0.01);
  float a = show * t.g * 0.86;
  if (a < 0.02) discard;
  vec3 col = mix(vec3(0.03, 0.025, 0.02), vec3(0.9, 0.88, 0.82), t.b * 0.5);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

const FACE_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uPulse;
varying vec2 vUv;
void main() {
  vec2 p = abs(vUv - 0.5) * 2.0;
  float edge = pow(max(p.x, p.y), 5.0);
  float a = (0.05 + 0.1 * edge) * uPulse;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;
const FACE_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/* ------------------------------------------------------------------------------------------------ nesne */

export function createBlockHighlight(THREE, opts = {}) {
  const group = new THREE.Group();
  group.name = 'blockHighlight';
  group.visible = true;
  let reduced = !!opts.reducedMotion;
  let time = 0;
  const res = new THREE.Vector2(1920, 1080);
  const uRes = { value: res };
  const uWidth = { value: EDGE_PX };
  const uPulse = { value: 1 };
  const outlineColor = new THREE.Color(0xeaf6ff);

  /* ---- kenar geometrisi (birim küpün 12 kenarı) ---- */
  const corners = [];
  for (let i = 0; i < 8; i++) corners.push([i & 1, (i >> 1) & 1, (i >> 2) & 1]);
  const edgePairs = [];
  for (let i = 0; i < 8; i++) {
    for (let k = 0; k < 3; k++) {
      const j = i ^ (1 << k);
      if (i < j) edgePairs.push([i, j]);
    }
  }
  const edgeGeo = new THREE.BufferGeometry();
  {
    const pos = [];
    const A = [];
    const Bv = [];
    const idx = [];
    edgePairs.forEach((pair, e) => {
      const base = e * 4;
      for (let v = 0; v < 4; v++) {
        pos.push(v & 1, v & 2 ? 1 : -1, 0);
        A.push(corners[pair[0]][0], corners[pair[0]][1], corners[pair[0]][2]);
        Bv.push(corners[pair[1]][0], corners[pair[1]][1], corners[pair[1]][2]);
      }
      idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    });
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    edgeGeo.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(A), 3));
    edgeGeo.setAttribute('aB', new THREE.BufferAttribute(new Float32Array(Bv), 3));
    edgeGeo.setIndex(idx);
  }
  const tmpV2 = new THREE.Vector2();
  const disposables = [edgeGeo];

  function makeEdge(color, order) {
    const uniforms = {
      uMin: { value: new THREE.Vector3() },
      uMax: { value: new THREE.Vector3(1, 1, 1) },
      uRes,
      uWidth,
      uExpand: { value: 0.006 },
      uColor: { value: color },
      uPulse,
      uAlpha: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: EDGE_VERT,
      fragmentShader: EDGE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(edgeGeo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.visible = false;
    mesh.onBeforeRender = (renderer) => {
      const rt = renderer.getRenderTarget();
      if (rt) { tmpV2.set(rt.width, rt.height); uWidth.value = EDGE_PX; } else {
        renderer.getDrawingBufferSize(tmpV2);
        uWidth.value = EDGE_PX * renderer.getPixelRatio();
      }
      if (tmpV2.x > 0 && tmpV2.y > 0) res.copy(tmpV2);
    };
    group.add(mesh);
    disposables.push(mat);
    return { mesh, uniforms, mat };
  }

  /* ---- çatlak dokusu ---- */
  const crack = generateCrackData(64, 1337);
  const crackTex = new THREE.DataTexture(crack.data, crack.size, crack.size, THREE.RGBAFormat);
  crackTex.magFilter = THREE.LinearFilter;
  crackTex.minFilter = THREE.LinearFilter;
  crackTex.wrapS = THREE.RepeatWrapping;
  crackTex.wrapT = THREE.RepeatWrapping;
  crackTex.needsUpdate = true;
  disposables.push(crackTex);
  const crackGeo = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(crackGeo);
  const uStage = { value: -1 };

  const target = [];
  const ghost = [];
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(unitBox);
  for (let i = 0; i < MAX_BOXES; i++) {
    // çatlak
    const cmat = new THREE.ShaderMaterial({
      uniforms: {
        uMin: { value: new THREE.Vector3() }, uMax: { value: new THREE.Vector3(1, 1, 1) }, uOrigin: { value: new THREE.Vector3() },
        uCrack: { value: crackTex }, uStage,
      },
      vertexShader: CRACK_VERT,
      fragmentShader: CRACK_FRAG,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const cmesh = new THREE.Mesh(crackGeo, cmat);
    cmesh.frustumCulled = false;
    cmesh.renderOrder = 5;
    cmesh.visible = false;
    group.add(cmesh);
    disposables.push(cmat);
    const edge = makeEdge(outlineColor, 8);
    // goal/current kutu (akıcı kayma için)
    target.push({
      crack: cmesh, cmat, edge, cur: [0, 0, 0, 1, 1, 1], goal: [0, 0, 0, 1, 1, 1], on: false,
    });
    // hayalet
    const fillMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34, depthWrite: false });
    const fill = new THREE.Mesh(unitBox, fillMat);
    fill.renderOrder = 7;
    fill.visible = false;
    group.add(fill);
    disposables.push(fillMat);
    const gcolor = new THREE.Color(0x8cffb0);
    const gedge = makeEdge(gcolor, 9);
    ghost.push({ fill, fillMat, edge: gedge, color: gcolor });
  }
  const faceMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: outlineColor }, uPulse },
    vertexShader: FACE_VERT,
    fragmentShader: FACE_FRAG,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const faceGeo = new THREE.PlaneGeometry(1, 1);
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.renderOrder = 6;
  face.visible = false;
  face.frustumCulled = false;
  group.add(face);
  disposables.push(faceMat, faceGeo);

  /* ---- durum ---- */
  const hitTmp = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, hasNormal: false, blockId: -1 };
  const state = {
    hasTarget: false, x: 0, y: 0, z: 0, blockId: -1, progress: 0, stage: -1, ghostId: -1, ghostValid: true, boxes: 0,
  };
  let snap = true;

  function setTarget(hit) {
    if (!hit || !normalizeHit(hit, hitTmp)) {
      state.hasTarget = false;
      state.progress = 0;
      uStage.value = -1;
      state.stage = -1;
      for (let i = 0; i < MAX_BOXES; i++) {
        target[i].on = false;
        target[i].crack.visible = false;
        target[i].edge.mesh.visible = false;
      }
      face.visible = false;
      snap = true;
      return;
    }
    const changed = !state.hasTarget || hitTmp.x !== state.x || hitTmp.y !== state.y || hitTmp.z !== state.z;
    if (changed) { state.progress = 0; uStage.value = -1; state.stage = -1; }
    state.hasTarget = true;
    state.x = hitTmp.x; state.y = hitTmp.y; state.z = hitTmp.z; state.blockId = hitTmp.blockId;
    const boxes = hitTmp.blockId >= 0 ? outlineBoxesFor(hitTmp.blockId) : FULL_BOX;
    state.boxes = boxes.length;
    for (let i = 0; i < MAX_BOXES; i++) {
      const T = target[i];
      if (i < boxes.length) {
        const b = boxes[i];
        T.goal[0] = hitTmp.x + b[0]; T.goal[1] = hitTmp.y + b[1]; T.goal[2] = hitTmp.z + b[2];
        T.goal[3] = hitTmp.x + b[3]; T.goal[4] = hitTmp.y + b[4]; T.goal[5] = hitTmp.z + b[5];
        if (!T.on || snap) for (let k = 0; k < 6; k++) T.cur[k] = T.goal[k];
        T.on = true;
        T.edge.mesh.visible = true;
        // çatlak her zaman tam hedef kutuda (kayma yok)
        const u = T.cmat.uniforms;
        u.uMin.value.set(T.goal[0], T.goal[1], T.goal[2]);
        u.uMax.value.set(T.goal[3], T.goal[4], T.goal[5]);
        u.uOrigin.value.set(hitTmp.x, hitTmp.y, hitTmp.z);
        T.crack.visible = state.stage >= 0;
      } else {
        T.on = false;
        T.edge.mesh.visible = false;
        T.crack.visible = false;
      }
    }
    snap = false;
    // yüz tonu
    if (hitTmp.hasNormal) {
      const b0 = target[0].goal;
      const ax = Math.abs(hitTmp.nx);
      const ay = Math.abs(hitTmp.ny);
      const az = Math.abs(hitTmp.nz);
      const sx = b0[3] - b0[0];
      const sy = b0[4] - b0[1];
      const sz = b0[5] - b0[2];
      const cx = (b0[0] + b0[3]) / 2;
      const cy = (b0[1] + b0[4]) / 2;
      const cz = (b0[2] + b0[5]) / 2;
      face.rotation.set(0, 0, 0);
      if (ay >= ax && ay >= az) {
        const s = hitTmp.ny >= 0 ? 1 : -1;
        face.rotation.x = -s * Math.PI / 2;
        face.scale.set(sx, sz, 1);
        face.position.set(cx, s > 0 ? b0[4] + 0.004 : b0[1] - 0.004, cz);
      } else if (ax >= az) {
        const s = hitTmp.nx >= 0 ? 1 : -1;
        face.rotation.y = s * Math.PI / 2;
        face.scale.set(sz, sy, 1);
        face.position.set(s > 0 ? b0[3] + 0.004 : b0[0] - 0.004, cy, cz);
      } else {
        const s = hitTmp.nz >= 0 ? 1 : -1;
        face.rotation.y = s > 0 ? 0 : Math.PI;
        face.scale.set(sx, sy, 1);
        face.position.set(cx, cy, s > 0 ? b0[5] + 0.004 : b0[2] - 0.004);
      }
      face.visible = true;
    } else face.visible = false;
  }

  function setBreakProgress(p) {
    const v = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
    state.progress = v;
    const st = crackStage(v);
    state.stage = st;
    uStage.value = st;
    for (let i = 0; i < MAX_BOXES; i++) target[i].crack.visible = st >= 0 && target[i].on;
  }

  function setPlacementGhost(blockId, pos, valid = true) {
    if (blockId === null || blockId === undefined || !pos) {
      state.ghostId = -1;
      for (let i = 0; i < MAX_BOXES; i++) { ghost[i].fill.visible = false; ghost[i].edge.mesh.visible = false; }
      return;
    }
    const x = Math.floor(px(pos));
    const y = Math.floor(py(pos));
    const z = Math.floor(pz(pos));
    const boxes = outlineBoxesFor(blockId);
    state.ghostId = blockId;
    state.ghostValid = !!valid;
    const base = blockId > 0 ? blockBaseColor(blockId) : 0xffffff;
    for (let i = 0; i < MAX_BOXES; i++) {
      const G = ghost[i];
      if (i < boxes.length) {
        const b = boxes[i];
        const e = 0.004;
        G.fill.position.set(x + (b[0] + b[3]) / 2, y + (b[1] + b[4]) / 2, z + (b[2] + b[5]) / 2);
        G.fill.scale.set(b[3] - b[0] + e, b[4] - b[1] + e, b[5] - b[2] + e);
        G.fill.visible = true;
        G.fillMat.color.setHex(valid ? base : 0xff5a5a);
        G.fillMat.color.lerp(outlineColor, valid ? 0.18 : 0.1);
        G.color.setHex(valid ? 0x8cffb0 : 0xff6a6a);
        const u = G.edge.uniforms;
        u.uMin.value.set(x + b[0], y + b[1], z + b[2]);
        u.uMax.value.set(x + b[3], y + b[4], z + b[5]);
        u.uExpand.value = 0.004;
        G.edge.mesh.visible = true;
      } else {
        G.fill.visible = false;
        G.edge.mesh.visible = false;
      }
    }
  }

  function update(dt) {
    const h = dt > 0.1 ? 0.1 : dt < 0 ? 0 : dt;
    time += h;
    // yumuşak nabız (~0,35 Hz); kısıtlı harekette neredeyse sabit
    uPulse.value = reduced ? 0.92 : 0.78 + 0.22 * Math.sin(time * 2.2);
    const k = 1 - Math.exp(-h * 28);
    for (let i = 0; i < MAX_BOXES; i++) {
      const T = target[i];
      if (!T.on) continue;
      for (let j = 0; j < 6; j++) T.cur[j] += (T.goal[j] - T.cur[j]) * (reduced ? 1 : k);
      const u = T.edge.uniforms;
      u.uMin.value.set(T.cur[0], T.cur[1], T.cur[2]);
      u.uMax.value.set(T.cur[3], T.cur[4], T.cur[5]);
      u.uAlpha.value = state.stage >= 0 ? 1.0 : 0.9;
    }
    if (state.ghostId >= 0) {
      const gp = reduced ? 0.8 : 0.78 + 0.22 * Math.sin(time * 2.6 + 1);
      for (let i = 0; i < MAX_BOXES; i++) {
        ghost[i].fillMat.opacity = 0.2 + 0.16 * gp;
        ghost[i].edge.uniforms.uAlpha.value = 0.75;
      }
    }
  }

  function setReducedMotion(b) { reduced = !!b; }
  function setColor(hex) {
    outlineColor.setHex(hex);
  }

  function dispose() {
    group.removeFromParent();
    for (let i = 0; i < disposables.length; i++) disposables[i].dispose();
    disposables.length = 0;
  }

  return {
    object3D: group,
    setTarget,
    setBreakProgress,
    setPlacementGhost,
    update,
    setReducedMotion,
    setColor,
    dispose,
    state,
  };
}
