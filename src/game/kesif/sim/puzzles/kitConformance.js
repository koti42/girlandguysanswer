/*
 * KEŞİF bulmaca altyapısı — uyumluluk denetimi (saf; testlerde kullan).
 *
 *   import { checkPuzzleConformance } from './index.js';
 *   it('uyumlu', () => expect(checkPuzzleConformance('basincplakasi')).toEqual([]));
 *
 * Denetlenen (her zorluk × facing 0..3 için; kayıtlı bulmaca tipi):
 *   - footprint tam sayı ≥ 3 ve build/restore/interact/tick/isSolved/hint çalışıyor, hiçbiri fırlatmıyor
 *   - build BELİRLENİMLİ (iki kurulum özdeş) ve CHUNK-KESİTLİ kurulum tam kurulumla özdeş
 *   - state JSON-serileştirilebilir; başlangıçta çözülmüş değil; hint metin
 *   - yazımlar oda dış kutusuna (+ kapı yaklaşımı) sığıyor; ön kapı açık ve odaya yürünebiliyor
 *   - restore(başlangıç durumu) build sonrası dünyayı DEĞİŞTİRMİYOR (idempotent)
 *   - her anchor ve örnek hücrede 7 olay türü fırlatmıyor; efektler geçerli; state hâlâ JSON
 *   - serialize → restore turu aynı durumu verir; reset(force) dünyayı ilk kurulumla özdeş yapar
 *     (restore, dinamik alanı baştan çizmeli: önce temizle, sonra duruma göre kur)
 * Döner: sorun metinleri dizisi (boşsa uyumlu).
 */
import { DenseChunk } from '../denseChunk.js';
import { getPuzzle } from './kitRegistry.js';
import { buildPuzzleRoom, chunkWriter, makeCtx } from './kitCtx.js';
import { frame, roomBounds } from './kitGeometry.js';
import { PuzzleManager } from './kitManager.js';
import { FakeWorld } from './kitTestkit.js';

const EVENT_TYPES = ['use', 'step', 'blockPlaced', 'blockBroken', 'entity', 'beam', 'portalShot'];
const SEED = 99;

function jsonSafe(v) {
  try {
    return JSON.stringify(JSON.parse(JSON.stringify(v))) === JSON.stringify(v);
  } catch {
    return false;
  }
}

function walkable(w, x, y, z) {
  return w.getBlock(x, y, z) === 0 && w.getBlock(x, y + 1, z) === 0 && w.getBlock(x, y - 1, z) > 0;
}

function reachableFrom(w, sx, sy, sz, tx, tz, limit) {
  const seen = new Set([sx + ',' + sz]);
  const q = [[sx, sz]];
  while (q.length) {
    const [x, z] = q.pop();
    if (x === tx && z === tz) return true;
    const nb = [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]];
    for (let i = 0; i < nb.length; i++) {
      const [nx, nz] = nb[i];
      const k = nx + ',' + nz;
      if (seen.has(k) || Math.abs(nx - sx) > limit || Math.abs(nz - sz) > limit) continue;
      if (walkable(w, nx, sy, nz)) {
        seen.add(k);
        q.push([nx, nz]);
      }
    }
  }
  return false;
}

function sliced(desc, bounds) {
  const merged = new Map();
  const b = bounds;
  for (let cx = (b.x0 - 8) >> 4; cx <= (b.x1 + 8) >> 4; cx++) {
    for (let cz = (b.z0 - 8) >> 4; cz <= (b.z1 + 8) >> 4; cz++) {
      const chunk = new DenseChunk(cx, cz, 128);
      const wr = chunkWriter(chunk);
      buildPuzzleRoom(desc, { seed: SEED, setBlock: wr.setBlock, getBlock: wr.getBlock, clip: wr.clip });
      for (let i = 0; i < chunk.blocks.length; i++) {
        if (chunk.blocks[i] === 0) continue;
        merged.set((cx * 16 + (i & 15)) + ',' + (i >> 8) + ',' + (cz * 16 + ((i >> 4) & 15)), chunk.blocks[i]);
      }
    }
  }
  return merged;
}

function diffCount(world, map) {
  let n = 0;
  world.blocks.forEach((id, k) => {
    if (map.get(k) !== id) n++;
  });
  map.forEach((id, k) => {
    if (world.blocks.get(k) !== id) n++;
  });
  return n;
}

function checkOne(type, impl, diff, facing, problems) {
  const tag = type + ' d' + diff + ' f' + facing + ': ';
  const bad = (m) => problems.push(tag + m);
  const fp = impl.footprint(diff);
  if (!fp || !Number.isInteger(fp.w) || !Number.isInteger(fp.d) || !Number.isInteger(fp.h) || fp.w < 3 || fp.d < 3 || fp.h < 3) {
    bad('footprint {w,d,h} tam sayı ≥ 3 olmalı');
    return;
  }
  const desc = {
    id: 'uyum:' + type, type, origin: { x: 37, y: 40, z: -21 }, facing, difficulty: diff, zone: (diff + facing) % 5,
  };
  const A = new FakeWorld({ seed: SEED });
  const r1 = buildPuzzleRoom(desc, { seed: SEED, setBlock: A.writer() });
  if (!r1 || r1.state === undefined) {
    bad('build state döndürmedi');
    return;
  }
  if (!jsonSafe(r1.state)) bad('başlangıç state JSON-serileştirilebilir değil');
  const built = A.snapshot();
  const B2 = new FakeWorld({ seed: SEED });
  const r2 = buildPuzzleRoom(desc, { seed: SEED, setBlock: B2.writer() });
  if (B2.snapshot() !== built || JSON.stringify(r2.state) !== JSON.stringify(r1.state)) bad('build belirlenimli değil');
  const rb = roomBounds(desc.origin, facing, fp, fp.margin === undefined ? 2 : fp.margin);
  const mergedSlices = sliced(desc, rb.outer);
  const dc = diffCount(A, mergedSlices);
  if (dc > 0) bad('chunk-kesitli kurulum tam kurulumdan ' + dc + ' blokta farklı (clip/getBlock/rng bağımlılığı?)');
  let outside = 0;
  A.blocks.forEach((id, k) => {
    const p = k.split(',');
    const x = Number(p[0]);
    const z = Number(p[2]);
    const y = Number(p[1]);
    const o = rb.outer;
    if (x < o.x0 - 6 || x > o.x1 + 6 || z < o.z0 - 6 || z > o.z1 + 6 || y < o.y0 - 2 || y > o.y1 + 4) outside++;
  });
  if (outside > 0) bad(outside + ' blok oda dış kutusunun (+yaklaşım) dışına yazılmış');

  const ctx = makeCtx({
    id: desc.id, world: A, worldSeed: SEED, origin: desc.origin, facing, difficulty: diff, zone: desc.zone, setBlock: A.writer(),
  });
  const F = frame(ctx);
  const d0 = F.toWorld(0, 0, -1);
  if (A.getBlock(d0.x, d0.y, d0.z) !== 0 || A.getBlock(d0.x, d0.y + 1, d0.z) !== 0) bad('ön kapı (lx=0,lz=−1) açık değil');
  const s = F.toWorld(0, 0, -4);
  const t = F.toWorld(0, 0, 0);
  if (!reachableFrom(A, s.x, s.y, s.z, t.x, t.z, 60)) bad('kapı yaklaşımından oda içine yürünemiyor');

  if (impl.isSolved(JSON.parse(JSON.stringify(r1.state)))) bad('başlangıç durumu zaten çözülmüş');
  if (typeof impl.hint(JSON.parse(JSON.stringify(r1.state))) !== 'string') bad('hint metin döndürmedi');
  impl.restore(ctx, JSON.parse(JSON.stringify(r1.state)));
  if (A.snapshot() !== built) bad('restore(başlangıç) build sonrası dünyayı değiştiriyor (idempotent değil)');

  const mgr = new PuzzleManager({ world: A, seed: SEED, strict: true });
  const effectKinds = new Set();
  mgr.on('effect', (e) => effectKinds.add(e.kind));
  mgr.register(desc.id, desc);
  const cells = [];
  const inn = rb.inner;
  const stride = Math.max(1, Math.floor(((inn.x1 - inn.x0 + 1) * (inn.y1 - inn.y0 + 1) * (inn.z1 - inn.z0 + 1)) / 120));
  let n = 0;
  for (let x = inn.x0; x <= inn.x1; x++) {
    for (let y = inn.y0; y <= inn.y1; y++) {
      for (let z = inn.z0; z <= inn.z1; z++) {
        if ((n++ % stride) === 0) cells.push({ x, y, z });
      }
    }
  }
  const view = mgr.get(desc.id);
  const anchorCells = [];
  const collect = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 6) return;
    if (Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z)) anchorCells.push(node);
    Object.keys(node).forEach((k) => collect(node[k], depth + 1));
  };
  collect(view.anchors, 0);
  try {
    const all = anchorCells.slice(0, 60).concat(cells);
    for (let i = 0; i < all.length; i++) {
      for (let k = 0; k < EVENT_TYPES.length; k++) {
        mgr.handleInteract({
          type: EVENT_TYPES[k], x: all[i].x, y: all[i].y, z: all[i].z, item: 'blok:taş', entityId: 'e1', playerId: 'p1',
        });
        if ((i + k) % 5 === 0) mgr.update(1 / 20, { x: t.x, y: t.y, z: t.z });
      }
    }
    for (let i = 0; i < 600; i++) mgr.update(1 / 60, { x: t.x, y: t.y, z: t.z });
  } catch (err) {
    bad('olay/tick sırasında hata fırlattı: ' + (err && err.message));
    return;
  }
  if (mgr.skippedEffects > 0) bad(mgr.skippedEffects + ' geçersiz efekt (setBlock tam sayı/id 0..127, message metin…)');
  if (!jsonSafe(mgr.get(desc.id).state)) bad('olaylardan sonra state JSON-serileştirilebilir değil');
  const saved = JSON.parse(JSON.stringify(mgr.serialize()));
  const W2 = new FakeWorld({ seed: SEED });
  buildPuzzleRoom(desc, { seed: SEED, setBlock: W2.writer() });
  const m2 = new PuzzleManager({ world: W2, seed: SEED, strict: true });
  m2.register(desc.id, desc);
  m2.restore(saved);
  if (JSON.stringify(m2.serialize()) !== JSON.stringify(saved)) bad('serialize → restore turu aynı durumu vermiyor');
  mgr.reset(desc.id, { force: true });
  if (JSON.stringify(mgr.get(desc.id).state) !== JSON.stringify(r1.state)) bad('reset durumu başlangıca döndürmüyor');
  if (A.snapshot() !== built) {
    bad('reset(force) sonrası dünya ilk kurulumdan farklı: restore dinamik alanı baştan çizmeli (önce temizle)');
  }
}

/**
 * Kayıtlı bulmaca tipini denetler. opts: { difficulties?:[…], facings?:[…] } (varsayılan tüm aralık × 0..3).
 * Döner: sorun metinleri (boş dizi = uyumlu).
 */
export function checkPuzzleConformance(type, opts) {
  const impl = getPuzzle(type);
  if (!impl) return [type + ': kayıtlı değil'];
  const o = opts || {};
  const problems = [];
  const diffs = o.difficulties || [];
  if (diffs.length === 0) for (let d = impl.difficultyRange[0]; d <= impl.difficultyRange[1]; d++) diffs.push(d);
  const facings = o.facings || [0, 1, 2, 3];
  for (let i = 0; i < diffs.length; i++) {
    for (let j = 0; j < facings.length; j++) {
      try {
        checkOne(type, impl, diffs[i], facings[j], problems);
      } catch (err) {
        problems.push(type + ' d' + diffs[i] + ' f' + facings[j] + ': beklenmeyen hata: ' + (err && err.message));
      }
    }
  }
  return problems;
}
