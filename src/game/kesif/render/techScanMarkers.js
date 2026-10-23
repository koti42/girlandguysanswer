/*
 * KEŞİF render — TARAYICI işaretleri: tarama sonuçları (cevher, yapı, canlı) duvarların ARKASINDAN da görünen, zamanla sönen simgeler.
 *
 *   createScanMarkers(THREE, parent, opts) → { sync(pings, age, life), update(time, dpr, reduced), dispose(), count }
 *
 * Tek `Points` nesnesi (1 çizim çağrısı, derinlik testi KAPALI). Biçim, renge ek olarak türü anlatır (renk körlüğü): cevher = elmas,
 * yapı = kare halka, canlı = daire, düşman = üçgen. Boyut mesafeyle küçülür (14–34 px). Ping ömrü sonunda ve yeni taramada solar.
 */
const VERT = /* glsl */`
attribute vec3 aCol;
attribute vec2 aSA;
uniform float uDpr;
varying vec3 vCol;
varying vec2 vSA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(-mv.z, 1.0);
  gl_PointSize = clamp(30.0 * uDpr / (1.0 + dist * 0.025), 14.0 * uDpr, 34.0 * uDpr);
  vCol = aCol;
  vSA = aSA;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */`
uniform float uTime;
uniform float uCalm;
varying vec3 vCol;
varying vec2 vSA;
void main() {
  vec2 p = (gl_PointCoord - 0.5) * 2.0;
  p.y = -p.y;
  float shape = vSA.x;
  float d;
  if (shape < 0.5) d = abs(p.x) + abs(p.y);
  else if (shape < 1.5) d = max(abs(p.x), abs(p.y)) * 1.15;
  else if (shape < 2.5) d = length(p);
  else d = max(abs(p.x) * 0.866 + p.y * 0.5 + 0.25, -p.y + 0.0) * 1.1;
  float ring = smoothstep(0.62, 0.74, d) * (1.0 - smoothstep(0.88, 1.0, d));
  float dot = 1.0 - smoothstep(0.1, 0.2, length(p));
  float pulse = 0.78 + 0.22 * sin(uTime * 5.0 * (1.0 - 0.8 * uCalm));
  float m = clamp(ring + dot * 0.9, 0.0, 1.0);
  if (m < 0.02) discard;
  gl_FragColor = vec4(clamp(vCol * (0.9 + 0.5 * pulse), 0.0, 2.0), clamp(m * vSA.y * pulse, 0.0, 1.0));
}
`;

const CAP = 48;
const SHAPE = { maden: 0, yapı: 1, canlı: 2 };

export function createScanMarkers(THREE, parent, opts) {
  const o = opts || {};
  const pos = new THREE.BufferAttribute(new Float32Array(CAP * 3), 3);
  const col = new THREE.BufferAttribute(new Float32Array(CAP * 3), 3);
  const sa = new THREE.BufferAttribute(new Float32Array(CAP * 2), 2);
  pos.setUsage(THREE.DynamicDrawUsage);
  col.setUsage(THREE.DynamicDrawUsage);
  sa.setUsage(THREE.DynamicDrawUsage);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', pos);
  geo.setAttribute('aCol', col);
  geo.setAttribute('aSA', sa);
  geo.setDrawRange(0, 0);
  const uniforms = { uTime: { value: 0 }, uDpr: { value: 1 }, uCalm: { value: o.reducedMotion ? 1 : 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 40;
  points.name = 'tech-tarama';
    parent.add(points);
  let n = 0;
  let lastKey = '';
  const tmp = new THREE.Color();

  /** pings: tech.scanner.pings; age: son taramadan beri sn; life: görünme ömrü (sn). */
  function sync(pings, age, life) {
    const list = pings || [];
    const fadeIn = Math.min(1, age / 0.18);
    const fadeOut = 1 - Math.min(1, Math.max(0, (age - (life - 2.2)) / 2.2));
    const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
    const count = Math.min(CAP, list.length);
    const key = count + ':' + (count ? list[0].x + ',' + list[0].y + ',' + list[0].z + ',' + list[count - 1].x : '');
    if (key !== lastKey) {
      lastKey = key;
      for (let i = 0; i < count; i++) {
        const p = list[i];
        pos.array[i * 3] = p.x; pos.array[i * 3 + 1] = p.y; pos.array[i * 3 + 2] = p.z;
        tmp.setHex(p.color >>> 0);
        col.array[i * 3] = tmp.r; col.array[i * 3 + 1] = tmp.g; col.array[i * 3 + 2] = tmp.b;
        sa.array[i * 2] = p.hostile ? 3 : (SHAPE[p.type] === undefined ? 0 : SHAPE[p.type]);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }
    for (let i = 0; i < count; i++) sa.array[i * 2 + 1] = alpha;
    sa.needsUpdate = true;
    n = alpha > 0.01 ? count : 0;
    geo.setDrawRange(0, n); // 0 → çizim yok ama program önceden bağlı kalır (ilk taramada takılma yok)
  }

  function update(time, dpr, reduced) {
    uniforms.uTime.value = time;
    uniforms.uDpr.value = dpr || 1;
    uniforms.uCalm.value = reduced ? 1 : 0;
  }

  function dispose() {
    parent.remove(points);
    geo.dispose();
    mat.dispose();
  }

  return {
    sync, update, dispose, points, get count() { return n; },
  };
}
