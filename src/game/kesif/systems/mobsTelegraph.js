/*
 * KEŞİF mobs sistemi — yer işaretleri (telegraf): boss/düşman saldırılarının yerdeki uyarı alanları.
 *
 *   telegraphParams(h, sub, out)       saf: tehlike (em.hazards öğesi) → {kind, x,y,z, sx,sz, rotY, prog, act, rin, rout, a0, a1}  (test edilir)
 *   createTelegraphs(THREE, parent, opts) → { update(hazards, camPos, time, dt), clear(), dispose(), stats }
 *
 * Kind: 0 disk (circle/zone), 1 halka (ring), 2 çubuk (line/beam), 3 dilim (beam süpürme alanı), 4 rün/portal çemberi.
 * Her işaret havuzdan bir düz levha (tek ShaderMaterial; kare başı ayırma yok). Hazırlık (windup) boyunca iç dolgu büyür /
 * çubuk dolar; etkinleşince parlak flaş. Renk kodu + şekil kodu (disk/halka/çubuk/dilim) birlikte okunur; bölgenin dışındaki yapılar
 * işaretlenmez. Kısıtlı harekette titreşim/çizgi akışı kapalı (sabit opaklık).
 */
import { createKeyedSlots } from './mobsPool.js';

export const KIND = Object.freeze({
  disc: 0, ring: 1, bar: 2, sector: 3, rune: 4,
});
const MAX_SLOTS = 28;
const SHOW_DIST = 90;
const LIFT = 0.07;

/** Tehlike → şekil parametreleri. sub 0 = ana şekil, sub 1 = ışının süpürme dilimi. Dönüş: false → bu alt şekil yok. */
export function telegraphParams(h, sub, out) {
  const s = h.shape;
  out.x = h.x; out.y = h.y + LIFT; out.z = h.z;
  out.rotY = 0;
  out.prog = h.stage === 'windup' ? h.progress : 1;
  out.act = h.stage === 'active' ? 1 : 0;
  out.rin = 0; out.rout = 1; out.a0 = 0; out.a1 = 0;
  out.alpha = 1;
  if (sub === 1) {
    if (s !== 'beam' || h.stage !== 'windup') return false;
    const w = Math.abs(h.arc1 - h.arc0);
    if (!(w > 0.04)) return false;
    out.kind = KIND.sector;
    out.sx = h.len; out.sz = h.len;
    out.a0 = Math.min(h.arc0, h.arc1);
    out.a1 = Math.max(h.arc0, h.arc1);
    out.alpha = 0.6;
    return true;
  }
  switch (s) {
    case 'circle':
    case 'zone': {
      out.kind = KIND.disc;
      const r = h.r + (s === 'zone' ? 0 : 0.05);
      out.sx = r; out.sz = r;
      if (s === 'zone') {
        out.prog = 1;
        out.act = 0.22;
        out.alpha = 0.7;
      }
      return true;
    }
    case 'ring': {
      out.kind = KIND.ring;
      const half = h.thick * 0.5;
      const rOut = (h.stage === 'windup' ? h.rIn : h.r) + half;
      const ext = Math.max(0.5, (h.stage === 'windup' ? h.rIn : h.r) + half + 0.1);
      out.sx = ext; out.sz = ext;
      out.rin = Math.max(0, ((h.stage === 'windup' ? h.rIn : h.r) - half) / ext);
      out.rout = Math.min(1, rOut / ext);
      return true;
    }
    case 'line':
    case 'beam': {
      out.kind = KIND.bar;
      const len = s === 'beam' && h.stage === 'active' ? h.effLen : h.len;
      const dx = h.dx;
      const dz = h.dz;
      out.x = h.x + dx * len * 0.5;
      out.z = h.z + dz * len * 0.5;
      out.sx = Math.max(0.1, len * 0.5);
      out.sz = Math.max(0.1, h.width * 0.5);
      out.rotY = Math.atan2(-dz, dx);
      return true;
    }
    case 'rune':
    case 'portal': {
      out.kind = KIND.rune;
      out.sx = h.r; out.sz = h.r;
      out.act = h.stage === 'active' ? 1 : 0;
      return true;
    }
    default:
      return false;
  }
}

const VERT = /* glsl */`
varying vec2 vP;
void main() {
  vP = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */`
precision highp float;
uniform vec3 uColor;
uniform float uKind;
uniform float uProg;
uniform float uAct;
uniform float uTime;
uniform float uCalm;
uniform float uRin;
uniform float uRout;
uniform float uA0;
uniform float uA1;
uniform float uAlpha;
varying vec2 vP;
const float TAU = 6.2831853;

float stripes(vec2 p) {
  return 0.5 + 0.5 * sin((p.x + p.y) * 16.0 - uTime * 1.6 * (1.0 - uCalm));
}

void main() {
  float r = length(vP);
  float a = 0.0;
  vec3 col = uColor;
  if (uKind < 0.5) {
    float inside = smoothstep(1.0, 0.95, r);
    float rim = smoothstep(0.82, 0.93, r) * inside;
    float fill = smoothstep(uProg + 0.03, uProg - 0.03, r) * inside;
    float warn = mix(0.22, 0.5, uProg) * (0.75 + 0.25 * stripes(vP));
    a = max(rim * 0.95, fill * warn) + inside * 0.12;
    a = mix(a, inside * (0.55 + 0.35 * stripes(vP * 0.6)), uAct);
    col = mix(col, vec3(1.0), uAct * 0.35 * rim);
  } else if (uKind < 1.5) {
    float inside = smoothstep(uRin - 0.015, uRin + 0.015, r) * smoothstep(uRout + 0.015, uRout - 0.015, r);
    float edge = max(smoothstep(0.06, 0.0, abs(r - uRin)), smoothstep(0.06, 0.0, abs(r - uRout)));
    a = inside * (0.28 + 0.3 * uProg) * (0.8 + 0.2 * stripes(vP)) + edge * 0.5 * inside;
    a = mix(a, inside * 0.9, uAct);
    col = mix(col, vec3(1.0), uAct * 0.4);
  } else if (uKind < 2.5) {
    float along = (vP.x + 1.0) * 0.5;
    float inside = step(abs(vP.x), 1.0) * step(abs(vP.y), 1.0);
    float rim = smoothstep(0.78, 0.92, abs(vP.y)) + smoothstep(0.975, 0.995, abs(vP.x));
    float fill = step(along, uProg);
    a = inside * (0.1 + 0.34 * fill * (0.7 + 0.3 * stripes(vec2(along * 12.0, vP.y)))) + rim * inside * 0.55;
    a = mix(a, inside * (0.7 + 0.2 * stripes(vec2(along * 8.0, vP.y))), uAct);
    col = mix(col, vec3(1.0), uAct * 0.5 * (1.0 - abs(vP.y)));
  } else if (uKind < 3.5) {
    float ang = atan(vP.y, vP.x);
    float w = uA1 - uA0;
    float rel = mod(ang - uA0, TAU);
    float inArc = w >= TAU ? 1.0 : smoothstep(-0.02, 0.02, rel) * smoothstep(w + 0.02, w - 0.02, rel);
    float inside = smoothstep(1.0, 0.97, r) * inArc;
    float rim = smoothstep(0.9, 0.99, r) * inside;
    a = inside * (0.07 + 0.08 * stripes(vP * 0.5)) + rim * 0.4;
  } else {
    float ang = atan(vP.y, vP.x) + uTime * 0.9 * (1.0 - uCalm);
    float dash = step(0.5, fract(ang / TAU * 14.0));
    float ring = smoothstep(0.78, 0.84, r) * smoothstep(0.98, 0.92, r) * (0.45 + 0.55 * dash);
    float core = smoothstep(0.7, 0.0, r) * (0.18 + 0.2 * sin(uTime * 2.0 * (1.0 - uCalm)));
    a = ring + core;
    a = mix(a, a + smoothstep(1.0, 0.2, r) * 0.45, uAct);
  }
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * uAlpha);
  #include <colorspace_fragment>
}`;

export function createTelegraphs(THREE, parent, opts) {
  const o = opts || {};
  const DANGER = new THREE.Color(0xff3b1f);
  let calm = o.reducedMotion ? 1 : 0;
  const geo = new THREE.PlaneGeometry(2, 2);
  geo.rotateX(-Math.PI / 2);
  const group = new THREE.Group();
  group.name = 'telegraf';
  parent.add(group);
  const keyed = createKeyedSlots(MAX_SLOTS, 2);
  const meshes = [];
  const mats = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(0xff5a3a) },
        uKind: { value: 0 },
        uProg: { value: 0 },
        uAct: { value: 0 },
        uTime: { value: 0 },
        uCalm: { value: calm },
        uRin: { value: 0 },
        uRout: { value: 1 },
        uA0: { value: 0 },
        uA1: { value: 0 },
        uAlpha: { value: 1 },
      },
    });
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    m.frustumCulled = false;
    m.renderOrder = 12;
    m.name = 'telegraf-' + i;
    group.add(m);
    meshes.push(m);
    mats.push(mat);
  }
  const P = {
    kind: 0, x: 0, y: 0, z: 0, sx: 1, sz: 1, rotY: 0, prog: 0, act: 0, rin: 0, rout: 1, a0: 0, a1: 0, alpha: 1,
  };
  const stats = { active: 0 };
  let disposed = false;

  function place(slot, h, sub) {
    const m = meshes[slot.idx];
    const u = mats[slot.idx].uniforms;
    if (slot.fresh) {
      const danger = h.shape !== 'rune' && h.shape !== 'portal' && h.shape !== 'zone';
      if (h.shape === 'rune') u.uColor.value.setHex(h.color === undefined ? 0xb08cff : h.color);
      else if (h.shape === 'portal') u.uColor.value.setHex(h.color === undefined ? 0x9b4dff : h.color);
      else u.uColor.value.setHex(h.color === undefined ? 0xff5a3a : h.color);
      // tehlike alanları sıcak uyarı tonuna çekilir (okunabilirlik: zeminden ayrışır)
      if (danger) u.uColor.value.lerp(DANGER, 0.28);
    }
    m.visible = true;
    m.position.set(P.x, P.y, P.z);
    m.rotation.y = P.rotY;
    m.scale.set(P.sx, 1, P.sz);
    u.uKind.value = P.kind;
    u.uProg.value = P.prog;
    u.uAct.value = P.act;
    u.uRin.value = P.rin;
    u.uRout.value = P.rout;
    u.uA0.value = P.a0;
    u.uA1.value = P.a1;
    u.uAlpha.value = P.alpha;
    return sub;
  }

  function update(hazards, cam, time) {
    if (disposed) return;
    keyed.begin();
    const cx = cam ? cam.x : 0;
    const cz = cam ? cam.z : 0;
    for (let i = 0; i < hazards.length; i++) {
      const h = hazards[i];
      if (h.stage === 'done') continue;
      const dx = h.x - cx;
      const dz = h.z - cz;
      if (dx * dx + dz * dz > SHOW_DIST * SHOW_DIST) continue;
      for (let sub = 0; sub < 2; sub++) {
        if (!telegraphParams(h, sub, P)) continue;
        const slot = keyed.use(h, sub);
        if (!slot) break;
        place(slot, h, sub);
      }
    }
    keyed.end((s) => { meshes[s.idx].visible = false; });
    for (let i = 0; i < mats.length; i++) mats[i].uniforms.uTime.value = time;
    stats.active = keyed.active;
  }

  return {
    update,
    stats,
    /** Shader derleme ısınması: tüm levhaları kısa süre görünür yap. */
    warm(on) {
      for (let i = 0; i < meshes.length; i++) meshes[i].visible = !!on && i < 1;
    },
    setReducedMotion(b) {
      calm = b ? 1 : 0;
      for (let i = 0; i < mats.length; i++) mats[i].uniforms.uCalm.value = calm;
    },
    clear() {
      keyed.releaseAll((s) => { meshes[s.idx].visible = false; });
      stats.active = 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      parent.remove(group);
      geo.dispose();
      for (let i = 0; i < mats.length; i++) mats[i].dispose();
    },
  };
}
