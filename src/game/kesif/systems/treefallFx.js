/*
 * KEŞİF "treefall" sistemi — görsel/işitsel katman: devrilen ağaç nesnesi, poz, ses, parçacık (bütçeli), kamera sarsıntısı.
 *
 *   createFallVisual(G, S, entry) → bool      ağaç bloklarından birleşik geometri kurar, sahneye ekler (aşırı kalabalıkta false)
 *   poseVisual(entry, angle)                  menteşe etrafında döndür + yamaç uyumu (dy)
 *   disposeVisual(G, entry)                   sahneden çıkar, geometriyi bırak
 *   sfx(G, name, x, y, z, vol, pitch)         konumlu ses
 *   leafBurst(G, S, entry, x, y, z, big)      yaprak + kırıntı parçacıkları (bütçe: kısıtlı harekette yarısı)
 *   addShake(G, S, amp, dur) · applyShake(G, S, dt)
 *
 * Erişilebilirlik: kısıtlı harekette (G.reducedMotion / G.accessibility) kamera sarsıntısı YOK, parçacık sayısı yarıya iner; devrilme
 * hareketi kendisi oyun geri bildirimidir ve sürer.
 */
import { createFallObject, meshTreeBlocks } from '../render/treeFallMesh.js';
import { fallPose } from '../render/treeFallAnim.js';

const HALF_PI = Math.PI / 2;
const POS = { x: 0, y: 0, z: 0 };
const NRM = [0, 1, 0];

export const reduced = (G) => !!(G.reducedMotion || G.accessibility);

/** Kısa ipucu (oturum sistemi G.hint verirse öncelik/aralıkla; yoksa sessiz). */
export function hint(G, text, secs) {
  if (typeof G.hint === 'function') G.hint(text, { ttl: Math.round((secs || 3) * 1000), priority: 2, key: 'treefall:' + text, cooldown: 4000 });
}

export function sfx(G, name, x, y, z, vol, pitch) {
  POS.x = x; POS.y = y; POS.z = z;
  G.sound(name, POS, { vol: vol === undefined ? 1 : vol, pitch: pitch === undefined ? 1 : pitch });
}

export function createFallVisual(G, entry) {
  if (!G.THREE || !G.worldRoot || !G.materials || !G.atlas || !G.atlas.uvTable) return false;
  const w = G.world;
  const r = entry.result;
  const sample = {
    light: (x, y, z) => w.getLight(x, y, z),
    biome: (x, z) => {
      const b = typeof w.getBiome === 'function' ? w.getBiome(x, z) : 0;
      return b > 0 ? b : 0;
    },
  };
  const cells = r.logs.concat(r.leaves);
  const mesh = meshTreeBlocks(cells, r.hinge, sample, G.atlas.uvTable);
  if (mesh.stats.faces === 0) return false;
  const obj = createFallObject(G.THREE, mesh, G.materials, r.hinge);
  entry.obj = obj;
  entry.tris = mesh.stats.triangles;
  entry.axis = new G.THREE.Vector3(r.dz, 0, -r.dx);
  // dünyadaki özdeş ağaç chunk yeniden mesh'lenene dek birkaç kare yerinde durur: kopya çok az büyük → z-çakışması/titreme yok
  obj.group.scale.setScalar(1.004);
  G.worldRoot.add(obj.group);
  return true;
}

/** Menteşe etrafında döndür; yamaçta/çukurda yatış yüksekliğine açıyla orantılı kayar. */
export function poseVisual(entry, angle) {
  const o = entry.obj;
  if (!o) return;
  const g = o.group;
  g.quaternion.setFromAxisAngle(entry.axis, angle);
  const k = Math.pow(Math.min(1, Math.max(0, angle / HALF_PI)), 1.5);
  g.position.y = entry.result.hinge.y + entry.dy * k;
  g.updateMatrix();
}

export function disposeVisual(entry) {
  if (entry.obj) {
    entry.obj.dispose();
    entry.obj = null;
  }
}

/** Anlık açı (yumuşatılmış kare ilerlemesi). */
export function angleAt(entry, alpha, dt) {
  if (entry.t >= entry.T) return HALF_PI;
  return fallPose(Math.min(entry.T, entry.t + alpha * dt), entry.T).angle;
}

export function leafBurst(G, entry, x, y, z, count, scale) {
  const p = G.particles;
  if (!p) return;
  const n = reduced(G) ? Math.max(1, count >> 1) : count;
  const leaf = entry.leafId;
  const log = entry.logId;
  POS.x = x; POS.y = y; POS.z = z;
  for (let i = 0; i < n; i++) {
    if (i % 3 === 2 && p.blockDust) {
      NRM[0] = 0; NRM[1] = 1; NRM[2] = 0;
      p.blockDust(log, POS, NRM);
    } else if (p.blockBreak) {
      p.blockBreak(leaf, POS, scale);
    }
  }
}

export function addShake(G, S, amp, dur) {
  if (reduced(G) || !(amp > 0)) return;
  const s = S.shake;
  if (amp > s.amp * (s.t / Math.max(0.001, s.dur))) {
    s.amp = amp;
    s.t = dur;
    s.dur = dur;
  }
}

let phase = 0;
export function applyShake(G, S, dt) {
  const s = S.shake;
  if (!(s.t > 0) || !(dt > 0)) return;
  s.t = Math.max(0, s.t - dt);
  const a = s.amp * (s.t / Math.max(0.001, s.dur));
  if (a <= 0 || !G.camera) return;
  phase += dt * 83;
  const cam = G.camera;
  cam.position.y += Math.cos(phase * 2.3) * a;
  cam.rotation.x += Math.sin(phase * 1.7) * a * 0.5;
  cam.rotation.z += Math.sin(phase * 1.3) * a * 0.3;
}
