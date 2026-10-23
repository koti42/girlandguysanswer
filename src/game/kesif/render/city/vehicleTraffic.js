/*
 * KEŞİF render/city — ÖRNEKLİ TRAFİK ÇİZİCİSİ: tür başına 1 InstancedMesh (≤600 üçgen 'lo' model) → tüm trafik ≤ 8 çizim çağrısı (sözleşme: ≤15).
 *
 *   createTrafficRenderer(THREE, ctx) → tr          ctx = {shared, geoShared(kind,'lo') → BufferGeometry paylaşımlı öznitelikli}
 *   tr.group
 *   tr.begin()                                       kare başı sayaçları sıfırlar
 *   tr.add(kind, x, y, z, yaw, o?) → bool            o: {pitch, roll, spin, paint (0..15 | -1), color (0xRRGGBB), brake (0/1), head (0/1), turn (−1 sol, 1 sağ, 2 dörtlü), sky, blk}
 *   tr.end()                                         sayıları kesinler (GPU tamponları işaretlenir)
 *   tr.setCap(n)                                     toplam araç üst sınırı (kademe: 30/18/10)
 *   tr.stats {cars, draws, tris, dropped}            tr.dispose()
 * Tür başına kapasite TRAFFIC_KIND_CAP; toplam üst sınırı aşan araçlar atılır (en uzaktakiler çağıranda zaten elenir).
 */
import { COSMETICS } from '../../sim/city/vehicle/vehicleData.js';
import { MODEL_KINDS, buildModel } from './vehicleGeo.js';
import { VEH_FRAGMENT, VEH_VERTEX } from './vehicleShaders.js';
import { ownUniforms, sharedUniformsFor } from './vehicleRig.js';

export const TRAFFIC_KIND_CAP = 32;
const BODY_LIN = COSMETICS.body.map((s) => {
  const f = (c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return [f((s.hex >> 16) & 255), f((s.hex >> 8) & 255), f(s.hex & 255)];
});

function lin8(hex) {
  const f = (c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}

function mark(attr, count) {
  if (attr.clearUpdateRanges) attr.clearUpdateRanges();
  if (attr.addUpdateRange) attr.addUpdateRange(0, count * attr.itemSize);
  attr.needsUpdate = true;
}

export function createTrafficRenderer(THREE, ctx) {
  const group = new THREE.Group();
  group.name = 'arac-trafik';
  const slots = new Map();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const mat4 = new THREE.Matrix4();
  const shared = sharedUniformsFor(THREE, ctx.shared);
  let cap = 30;
  let total = 0;
  let dropped = 0;
  const stats = {
    cars: 0, draws: 0, tris: 0, dropped: 0,
  };

  MODEL_KINDS.forEach((kind) => {
    const model = buildModel(kind, 'lo');
    const geo = ctx.geoShared(kind, 'lo');
    const aI0 = new THREE.InstancedBufferAttribute(new Float32Array(TRAFFIC_KIND_CAP * 4), 4);
    const aL = new THREE.InstancedBufferAttribute(new Float32Array(TRAFFIC_KIND_CAP * 3), 3);
    aI0.setUsage(THREE.DynamicDrawUsage);
    aL.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aI0', aI0);
    geo.setAttribute('aL', aL);
    const uniforms = Object.assign({}, shared, ownUniforms(THREE));
    uniforms.uQ.value = 0.6;
    uniforms.uAccentU.value.set(kind === 'taksi' ? 0x14161b : 0xe6eaf0);
    uniforms.uNeonC.value.set(0x22e6ff);
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VEH_VERTEX,
      fragmentShader: VEH_FRAGMENT,
      defines: { INSTANCED: 1 },
      side: THREE.FrontSide,
    });
    mat.name = 'kesif-arac-trafik-' + kind;
    const mesh = new THREE.InstancedMesh(geo, mat, TRAFFIC_KIND_CAP);
    mesh.name = 'trafik-' + kind;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TRAFFIC_KIND_CAP * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    slots.set(kind, {
      kind, mesh, mat, aI0, aL, n: 0, tris: model.tris.total, uniforms,
    });
  });

  const tr = {
    group,
    stats,
    meshes: slots,
    begin() {
      slots.forEach((s) => { s.n = 0; });
      total = 0;
      dropped = 0;
    },
    add(kind, x, y, z, yaw, o) {
      const s = slots.get(kind) || slots.get('sedan');
      if (!Number.isFinite(x + y + z + yaw)) {
        dropped++;
        return false;
      }
      if (total >= cap || s.n >= TRAFFIC_KIND_CAP) {
        dropped++;
        return false;
      }
      const i = s.n++;
      total++;
      const op = o || null;
      euler.set(op && op.pitch ? op.pitch : 0, yaw, op && op.roll ? -op.roll : 0, 'YXZ');
      mat4.makeRotationFromEuler(euler);
      mat4.setPosition(x, y, z);
      s.mesh.setMatrixAt(i, mat4);
      let c;
      if (op && op.color !== undefined) c = lin8(op.color);
      else c = BODY_LIN[(((op && op.paint !== undefined ? op.paint : i * 5 + 3) | 0) % 16 + 16) % 16];
      const ca = s.mesh.instanceColor.array;
      ca[i * 3] = c[0]; ca[i * 3 + 1] = c[1]; ca[i * 3 + 2] = c[2];
      const a = s.aI0.array;
      a[i * 4] = op && op.spin ? op.spin : 0;
      a[i * 4 + 1] = op && op.brake ? (op.brake > 0 ? 1 : 0) : 0;
      a[i * 4 + 2] = op && op.head ? 1 : 0;
      a[i * 4 + 3] = op && op.turn ? op.turn : 0;
      const l = s.aL.array;
      l[i * 3] = op && op.sky !== undefined ? op.sky : 1;
      l[i * 3 + 1] = op && op.blk !== undefined ? op.blk : 0;
      l[i * 3 + 2] = op && op.fade !== undefined ? op.fade : 1;
      return true;
    },
    end() {
      let cars = 0;
      let draws = 0;
      let tris = 0;
      slots.forEach((s) => {
        s.mesh.count = s.n;
        s.mesh.visible = s.n > 0;
        if (s.n > 0) {
          mark(s.mesh.instanceMatrix, s.n);
          mark(s.mesh.instanceColor, s.n);
          mark(s.aI0, s.n);
          mark(s.aL, s.n);
          cars += s.n;
          draws++;
          tris += s.n * s.tris;
        }
      });
      stats.cars = cars; stats.draws = draws; stats.tris = tris; stats.dropped = dropped;
    },
    setCap(n) {
      cap = Math.max(0, Math.min(TRAFFIC_KIND_CAP * slots.size, n | 0));
    },
    getCap() {
      return cap;
    },
    dispose() {
      slots.forEach((s) => {
        s.mat.dispose();
        if (s.mesh.dispose) s.mesh.dispose();
      });
      group.clear();
      slots.clear();
    },
  };
  return tr;
}
