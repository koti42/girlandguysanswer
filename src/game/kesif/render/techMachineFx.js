/*
 * KEŞİF render — MAKİNE efektleri: kablo akımı, güneş paneli parıltısı, jeneratör/ocak bacası, madenci ışını + tozu, ışınlanma ışık sütunu,
 * asansör ışını, şarj istasyonu parıltısı. Etkin makine bloklarının emisyonlu dokuları TechState tarafından blok değişimiyle zaten gelir;
 * burası yalnızca dinamik katman (parçacık + iki örneklenmiş çizim).
 *
 *   createMachineFx(THREE, G, T, parent, opts) → { update(dt, camera, time, reduced), dispose(), stats }
 *
 * Bütçe: 2 çizim çağrısı (ışınlar + kabuklar, örneklenmiş, toplamalı karışım, derinlik yazmaz). Makine taraması ≈ 8 Hz ve yalnız kameraya
 * RANGE blok içindeki makineler; en çok MAX_BEAMS ışın / MAX_SHELLS kabuk. Parçacıklar sys.density ile ölçeklenir (kalite kademesi).
 * Kısıtlı harekette: akım/parıltı animasyonu yavaşlar, parçacık yoğunluğu azalır.
 */
import { TECH_BLOCK_IDS, TECH_RATES } from '../sim/techData.js';
import { LAMP_HUES } from '../sim/techMachines.js';

const RANGE = 26;
const CABLE_RANGE = 22;
const MAX_BEAMS = 32;
const MAX_SHELLS = 640;
const SLOW = 0.125;
const CABLE_ID = TECH_BLOCK_IDS.CABLE;
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

const BEAM_VERT = /* glsl */`
attribute vec4 aInst;
attribute vec3 aCol;
varying vec2 vUv;
varying vec4 vInst;
varying vec3 vCol;
void main() {
  vUv = uv;
  vInst = aInst;
  vCol = aCol;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BEAM_FRAG = /* glsl */`
uniform float uTime;
uniform float uCalm;
varying vec2 vUv;
varying vec4 vInst;
varying vec3 vCol;
void main() {
  float edge = clamp(1.0 - abs(vUv.x - 0.5) * 2.0, 0.0, 1.0);
  float h = vUv.y;
  float speed = 1.6 * (1.0 - 0.7 * uCalm);
  float stripes = 0.5 + 0.5 * sin((h * vInst.w * 1.4 - uTime * speed) * 5.0 + vInst.y);
  float kind = vInst.z;
  float vf = kind < 0.5 ? (1.0 - h * 0.55) : (kind < 1.5 ? (1.0 - h) : sin(clamp(h, 0.0, 1.0) * 3.14159));
  float a = edge * edge * vInst.x * mix(1.0, stripes, 0.45) * vf;
  gl_FragColor = vec4(clamp(vCol, 0.0, 2.0), clamp(a, 0.0, 1.0));
}
`;

const SHELL_VERT = /* glsl */`
attribute vec4 aInst;
attribute vec3 aCol;
varying vec2 vUv;
varying vec4 vInst;
varying vec3 vCol;
varying vec3 vWp;
void main() {
  vUv = uv;
  vInst = aInst;
  vCol = aCol;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SHELL_FRAG = /* glsl */`
uniform float uTime;
uniform float uCalm;
varying vec2 vUv;
varying vec4 vInst;
varying vec3 vCol;
varying vec3 vWp;
void main() {
  float t = uTime * (1.0 - 0.6 * uCalm);
  float kind = vInst.z;
  float edge = smoothstep(0.34, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));
  float a;
  vec3 col = vCol;
  if (kind < 0.5) {
    float pulse = 0.5 + 0.5 * sin(dot(vWp, vec3(0.7, 0.5, 0.9)) * 2.2 - t * 3.0 + vInst.y);
    a = vInst.x * (0.04 + 0.26 * pulse) * (0.2 + 0.8 * edge);
    col = vCol * (0.7 + 0.7 * pulse);
  } else if (kind < 1.5) {
    float band = smoothstep(0.55, 1.0, 0.5 + 0.5 * sin((vUv.x + vUv.y) * 7.0 - t * 1.3 + vInst.y));
    a = vInst.x * (0.08 + 0.5 * band);
    col = mix(vCol, vec3(1.0), band * 0.6);
  } else if (kind > 3.5) {
    float rad = clamp(length(vUv - 0.5) * 2.0, 0.0, 1.0);
    float soft = 1.0 - smoothstep(0.0, 1.0, rad);
    a = vInst.x * 0.55 * soft * soft * (0.9 + 0.1 * sin(t * 1.7 + vInst.y));
    col = vCol * 1.25;
  } else if (kind > 2.5) {
    a = vInst.x * (0.3 + 0.06 * sin(t * 2.1 + vInst.y)) * (0.55 + 0.45 * edge);
    col = vCol * 1.15;
  } else {
    a = vInst.x * (0.14 + 0.16 * sin(t * 3.2 + vInst.y)) * (0.5 + 0.5 * edge);
  }
  gl_FragColor = vec4(clamp(col, 0.0, 2.0), clamp(a, 0.0, 1.0));
}
`;

function hashKey(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  return h >>> 0;
}

export function createMachineFx(THREE, G, T, parent, opts) {
  const o = opts || {};
  const posCache = new Map();
  const liftCache = new Map();
  const uTime = { value: 0 };
  const uCalm = { value: o.reducedMotion ? 1 : 0 };
  const st = { beams: 0, shells: 0, machines: 0, cables: 0, scanMs: 0 };
  let acc = SLOW;
  let tickN = 0;
  let humT = 1;

  function makeInstanced(geometry, vert, frag, cap, name) {
    const aInst = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    const aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    aInst.setUsage(THREE.DynamicDrawUsage);
    aCol.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aInst', aInst);
    geometry.setAttribute('aCol', aCol);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime, uCalm },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: name === 'beams' ? THREE.DoubleSide : THREE.FrontSide,
    });
    const mesh = new THREE.InstancedMesh(geometry, mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = 16;
    mesh.name = 'tech-' + name;
    parent.add(mesh);
    return { mesh, aInst, aCol, mat, geometry, cap, n: 0 };
  }

  // iki çapraz dikey levha: taban y = 0, tepe y = 1 (örnek matrisi yüksekliği ölçekler)
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0,
    0, 0, -0.5, 0, 0, 0.5, 0, 1, 0.5, 0, 1, -0.5,
  ]), 3));
  beamGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]), 2));
  beamGeo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  const beams = makeInstanced(beamGeo, BEAM_VERT, BEAM_FRAG, MAX_BEAMS, 'beams');
  const shells = makeInstanced(new THREE.BoxGeometry(1, 1, 1), SHELL_VERT, SHELL_FRAG, MAX_SHELLS, 'shells');

  function setInst(set, i, x, y, z, sx, sy, sz, inten, phase, kind, h, r, g, b) {
    const m = set.mesh.instanceMatrix.array;
    const k = i * 16;
    m[k] = sx; m[k + 1] = 0; m[k + 2] = 0; m[k + 3] = 0;
    m[k + 4] = 0; m[k + 5] = sy; m[k + 6] = 0; m[k + 7] = 0;
    m[k + 8] = 0; m[k + 9] = 0; m[k + 10] = sz; m[k + 11] = 0;
    m[k + 12] = x; m[k + 13] = y; m[k + 14] = z; m[k + 15] = 1;
    const a = set.aInst.array;
    a[i * 4] = inten; a[i * 4 + 1] = phase; a[i * 4 + 2] = kind; a[i * 4 + 3] = h;
    const c = set.aCol.array;
    c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b;
  }

  function finish(set, n) {
    set.mesh.count = n;
    set.n = n;
    set.mesh.instanceMatrix.needsUpdate = true;
    set.aInst.needsUpdate = true;
    set.aCol.needsUpdate = true;
  }

  function parse(key) {
    let p = posCache.get(key);
    if (!p) {
      const s = key.split(',');
      p = [Number(s[0]), Number(s[1]), Number(s[2]), hashKey(key)];
      posCache.set(key, p);
      if (posCache.size > 6000) posCache.clear();
    }
    return p;
  }

  function liftTarget(key, now) {
    let c = liftCache.get(key);
    if (c && now - c.t < 1.5) return c;
    const tech = T.tech;
    const up = typeof tech._liftTarget === 'function' ? tech._liftTarget(key, 1) : null;
    c = { t: now, dy: up ? up.dy : 0 };
    liftCache.set(key, c);
    if (liftCache.size > 400) liftCache.clear();
    return c;
  }

  const pt = { x: 0, y: 0, z: 0 };
  function at(x, y, z) {
    pt.x = x; pt.y = y; pt.z = z;
    return pt;
  }

  function scan(camera, now, reduced) {
    const tech = T.tech;
    const pts = G.particles;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const R2 = RANGE * RANGE;
    const day = T.ctx ? T.ctx.daylight : 1;
    let bn = 0;
    let sn = 0;
    let machines = 0;
    const R = TECH_RATES;
    {
      tech.machines.forEach((m, key) => {
        const p = parse(key);
        const dx = p[0] + 0.5 - cx;
        const dy = p[1] + 0.5 - cy;
        const dz = p[2] + 0.5 - cz;
        if (dx * dx + dy * dy + dz * dz > R2) return;
        machines++;
        const x = p[0];
        const y = p[1];
        const z = p[2];
        const slot = (tickN + p[3]) & 3;
        switch (m.t) {
          case 'jenerator':
            if (m.burnT > 1e-9 && !m.off && pts && pts.techSmoke && slot === 0) pts.techSmoke(at(x + 0.5, y + 1.05, z + 0.5), 0.9);
            break;
          case 'ocak':
            if (m.on && pts) {
              if (slot === 0 && pts.techSmoke) pts.techSmoke(at(x + 0.5, y + 1.05, z + 0.5), 0.4);
              if (slot === 2 && pts.techSpark) pts.techSpark(at(x + 0.5, y + 0.95, z + 0.5), 0xffa040, 2);
            }
            break;
          case 'matkap':
            if (m.on) {
              const depth = m.ly === null || m.ly === undefined ? 4 : Math.max(1, Math.min(14, y - m.ly));
              if (bn < MAX_BEAMS) {
                setInst(beams, bn++, x + 0.5, y - depth, z + 0.5, 0.34, depth, 0.34, 0.55, p[3] & 15, 0, depth, 1.0, 0.72, 0.3);
              }
              if (pts && pts.techDust && slot === 1) pts.techDust(at(x + 0.5, y - 0.1, z + 0.5), 0xb8b0a4, 2);
            }
            break;
          case 'isinlayici': {
            const ready = !!m.freq && m.cd <= 0 && m.buf >= R.teleporter.minReady;
            const cooling = !!m.freq && m.cd > 0;
            if ((ready || cooling) && bn < MAX_BEAMS) {
              setInst(beams, bn++, x + 0.5, y + 0.5, z + 0.5, 0.75, 4.5, 0.75, ready ? 0.7 : 0.2, p[3] & 15, 1, 4.5, 0.35, 1.0, 0.92);
            }
            if (ready && pts && pts.teleportRing && !reduced && (((tickN >> 3) + p[3]) & 7) === 0 && slot === 0) pts.teleportRing(at(x + 0.5, y + 0.6, z + 0.5), 0x7affea);
            break;
          }
          case 'asansor':
            if (m.buf >= R.lift.minCost && bn < MAX_BEAMS) {
              const c = liftTarget(key, now);
              if (c.dy > 0) {
                const len = Math.min(c.dy, 36);
                setInst(beams, bn++, x + 0.5, y + 0.5, z + 0.5, 0.7, len, 0.7, 0.4, p[3] & 15, 2, len, 0.7, 0.88, 1.0);
              }
            }
            break;
          case 'sarj':
            if (m.buf > 1 && sn < MAX_SHELLS) {
              setInst(shells, sn++, x + 0.5, y + 0.5, z + 0.5, 1.03, 1.03, 1.03, m.on ? 0.9 : 0.35, p[3] & 15, 2, 1, 0.3, 1.0, 0.8);
              if (m.on && pts && pts.techSpark && slot === 3) pts.techSpark(at(x + 0.5, y + 1.0, z + 0.5), 0x7affea, 2);
            }
            break;
          case 'lamba':
            // yanan lamba: seçilen renkte hale (ışık değeri aynı; yalnız renk)
            if (m.on && !m.off && sn < MAX_SHELLS) {
              const hc = LAMP_HUES[m.hue || 0].rgb;
              setInst(shells, sn++, x + 0.5, y + 0.5, z + 0.5, 1.07, 1.07, 1.07, 0.9, p[3] & 15, 3, 1, hc[0], hc[1], hc[2]);
              if (sn < MAX_SHELLS) setInst(shells, sn++, x + 0.5, y + 0.5, z + 0.5, 2.4, 2.4, 2.4, 0.8, p[3] & 15, 4, 1, hc[0], hc[1], hc[2]);
            }
            break;
          case 'gunes':
            if (sn < MAX_SHELLS) {
              const k = day * (m.sky ? 1 : 0.15);
              if (k > 0.05) setInst(shells, sn++, x + 0.5, y + 0.5, z + 0.5, 1.0, 0.04, 1.0, 0.9 * k, p[3] & 15, 1, 1, 0.55, 0.85, 1.0);
            }
            break;
          default:
            break;
        }
      });
      // kablo akımı: enerji taşıyan (canlı) ağlara bağlı kabloların komşuluk taraması (kablolar kayıtlı makine değildir → BFS)
      let cables = 0;
      const CR2 = CABLE_RANGE * CABLE_RANGE;
      const queue = [];
      const seen = new Set();
      tech.machines.forEach((m, key) => {
        const idx = tech.nodeNet.get(key);
        const info = idx === undefined ? null : tech.netInfo[idx];
        if (!info || !info.live) return;
        const p = parse(key);
        const dx = p[0] + 0.5 - cx;
        const dy = p[1] + 0.5 - cy;
        const dz = p[2] + 0.5 - cz;
        if (dx * dx + dy * dy + dz * dz > CR2) return;
        queue.push(p[0], p[1], p[2], info.supplied > 0 ? 1 : 0.4);
      });
      for (let qi = 0; qi < queue.length && sn < MAX_SHELLS; qi += 4) {
        const qx = queue[qi];
        const qy = queue[qi + 1];
        const qz = queue[qi + 2];
        const inten = queue[qi + 3];
        for (let d = 0; d < 6; d++) {
          const nx = qx + DIRS[d][0];
          const ny = qy + DIRS[d][1];
          const nz = qz + DIRS[d][2];
          const nk = nx + ',' + ny + ',' + nz;
          if (seen.has(nk)) continue;
          seen.add(nk);
          if (G.world.getBlock(nx, ny, nz) !== CABLE_ID) continue;
          const dx = nx + 0.5 - cx;
          const dy = ny + 0.5 - cy;
          const dz = nz + 0.5 - cz;
          if (dx * dx + dy * dy + dz * dz > CR2 || sn >= MAX_SHELLS) continue;
          cables++;
          setInst(shells, sn++, nx + 0.5, ny + 0.5, nz + 0.5, 1.012, 1.012, 1.012, inten, ((nx * 7 + ny * 13 + nz * 5) & 15) * 0.4, 0, 1, 0.3, 0.95, 1.0);
          queue.push(nx, ny, nz, inten);
        }
      }
      st.cables = cables;
    }
    // makine uğultusu: çalışan en yakın iki makine (jeneratör, ocak, madenci, şarj), ≈ 1,6 sn'de bir; 12 blok
    humT -= SLOW;
    if (humT <= 0) {
      humT = 1.6;
      let n1 = null;
      let n2 = null;
      let d1 = 144;
      let d2 = 144;
      tech.machines.forEach((m, key) => {
        const running = m.t === 'jenerator' ? m.burnT > 1e-9 && !m.off : m.on;
        if (!running || (m.t !== 'jenerator' && m.t !== 'ocak' && m.t !== 'matkap' && m.t !== 'sarj')) return;
        const p = parse(key);
        const dx = p[0] + 0.5 - cx;
        const dy = p[1] + 0.5 - cy;
        const dz = p[2] + 0.5 - cz;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < d1) { n2 = n1; d2 = d1; n1 = p; d1 = d; } else if (d < d2) { n2 = p; d2 = d; }
      });
      if (n1) G.sound('tech:hum', at(n1[0] + 0.5, n1[1] + 0.5, n1[2] + 0.5), { vol: 0.4 });
      if (n2) G.sound('tech:hum', at(n2[0] + 0.5, n2[1] + 0.5, n2[2] + 0.5), { vol: 0.3, pitch: 1.08 });
    }
    st.machines = machines;
    st.beams = bn;
    st.shells = sn;
    finish(beams, bn);
    finish(shells, sn);
  }

  function update(dt, camera, time, reduced) {
    uTime.value = time;
    uCalm.value = reduced ? 1 : 0;
    if (!camera || !T.tech) return;
    acc += dt;
    if (acc < SLOW) return;
    acc = 0;
    tickN++;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    scan(camera, time, reduced);
    st.scanMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  }

  function dispose() {
    parent.remove(beams.mesh);
    parent.remove(shells.mesh);
    beams.geometry.dispose();
    shells.geometry.dispose();
    beams.mat.dispose();
    shells.mat.dispose();
    posCache.clear();
    liftCache.clear();
  }

  return {
    update, dispose, stats: st, _beams: beams, _shells: shells,
  };
}
