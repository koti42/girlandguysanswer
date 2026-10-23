/*
 * KEŞİF sim — kayıt: dünya düzenlemeleri (saf). Kayıt v2: düzenlemeler (chunk, KESİT) başına RLE FARKI olarak saklanır; yalnız
 * dokunulan kesitler yazılır (48 kesitlik sütunun tamamı DEĞİL). Bir fark dizisi 4096 bayttır; 255 = "üretilmiş tabana göre
 * değişmedi", diğer değer = o hücrenin yeni blok kimliği (0..254). Dizi mapFormat RLE yardımcılarıyla ([değer][u16 LE uzunluk]
 * üçlüleri) base64 kodlanır. Böylece kayıt, dünya üretiminin yeniden çalıştırılmasına gerek kalmadan tamamen düzenlemelerden
 * kurulur ve seyrek düzenlemeler (binde bir hücre) birkaç yüz bayta sıkışır.
 *   { "cx,cz,si": "<base64 rle>" }       si = kesit indeksi (macera 0..47: y = -400 + 16·si .. ; legacy/insa 0..7: y = 16·si ..)
 * Eski (v1) biçim "cx,cz": 32768 baytlık sütun farkı — yalnız göç için okunur (migrateChunkDiffs: legacy/insa kayıtları yükseltilir).
 * Kesit indeksi yMin'e göredir: macera yMin = WORLD_Y_MIN (-400), legacy modlar 0; editRangeFor(yMin) uygun aralığı verir.
 */
import {
  CHUNK_VOLUME, MAX_BLOCK_ID, SECTION_VOLUME, WORLD_SECTION_COUNT, WORLD_Y_MIN,
} from './constants.js';
import { decodeRleSafe, encodeRle } from './mapFormat.js';

export const EDIT_UNCHANGED = 255;
export const EDIT_CHUNK_LIMIT = 9000;
const SECTION_KEY_RE = /^(-?\d{1,5}),(-?\d{1,5}),(\d{1,2})$/;
const CHUNK_KEY_RE = /^(-?\d{1,5}),(-?\d{1,5})$/;
const SV = SECTION_VOLUME;

/** yMin'e göre düzenleme aralığı: macera {yMin:-400, sections:48}; legacy {yMin:0, sections:8}. */
export function editRangeFor(yMin) {
  return yMin < 0 ? { yMin: WORLD_Y_MIN, sections: WORLD_SECTION_COUNT } : { yMin: 0, sections: 8 };
}

/** "x,y,z" → [x,y,z] | null (tamsayı, y aralık içinde). */
function parseEditKey(k, r) {
  const p = String(k).split(',');
  if (p.length !== 3) return null;
  const x = Number(p[0]);
  const y = Number(p[1]);
  const z = Number(p[2]);
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return null;
  if (y < r.yMin || y >= r.yMin + r.sections * 16 || Math.abs(x) > 1000000 || Math.abs(z) > 1000000) return null;
  return [x, y, z];
}

/**
 * Düzenlemeleri (Map | düz nesne "x,y,z" → id) (chunk, kesit) farklarına kodlar. yMin: dünyanın en alçak y'si (macera -400, legacy 0;
 * varsayılan macera). Döner {chunks:{"cx,cz,si":b64}, count (kodlanan hücre), chunkCount (kesit parçası sayısı)}. Geçersiz girdiler atlanır.
 */
export function encodeEdits(edits, yMin = WORLD_Y_MIN) {
  const r = editRangeFor(yMin);
  const diffs = new Map();
  let count = 0;
  const put = (k, id) => {
    const c = parseEditKey(k, r);
    if (!c || !Number.isInteger(id) || id < 0 || id > MAX_BLOCK_ID) return;
    const cx = c[0] >> 4;
    const cz = c[2] >> 4;
    const si = (c[1] - r.yMin) >> 4;
    const ck = cx + ',' + cz + ',' + si;
    let d = diffs.get(ck);
    if (!d) {
      d = new Uint8Array(SV).fill(EDIT_UNCHANGED);
      diffs.set(ck, d);
    }
    const idx = (((c[1] - r.yMin) & 15) << 8) + ((c[2] & 15) << 4) + (c[0] & 15);
    if (d[idx] === EDIT_UNCHANGED) count++;
    d[idx] = id;
  };
  if (edits instanceof Map) edits.forEach((id, k) => put(k, id));
  else if (edits && typeof edits === 'object') Object.keys(edits).forEach((k) => put(k, edits[k]));
  const chunks = {};
  Array.from(diffs.keys()).sort().forEach((ck) => {
    chunks[ck] = encodeRle(diffs.get(ck));
  });
  return { chunks, count, chunkCount: diffs.size };
}

/**
 * Kodlanmış farkları açar ve doğrular. Döner:
 *   {ok, list:[{cx,cz,si,diff:Uint8Array(4096)}], count, bad:[anahtar]}   (atmaz)
 * Geçersiz anahtar/RLE'li parçalar `bad`a girer ve atlanır. 255 dışındaki >254 değerler "değişmedi" sayılır.
 * yMin: kesit sayısı sınırı için (macera 48, legacy 8).
 */
export function decodeEdits(chunks, yMin = WORLD_Y_MIN) {
  const r = editRangeFor(yMin);
  const out = { ok: true, list: [], count: 0, bad: [] };
  if (chunks === undefined || chunks === null) return out;
  if (typeof chunks !== 'object' || Array.isArray(chunks)) {
    out.ok = false;
    return out;
  }
  const keys = Object.keys(chunks);
  if (keys.length > EDIT_CHUNK_LIMIT) {
    out.ok = false;
    return out;
  }
  keys.sort();
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const m = SECTION_KEY_RE.exec(k);
    const v = chunks[k];
    if (!m || typeof v !== 'string' || v.length > 100000 || Number(m[3]) >= r.sections) {
      out.bad.push(k);
      continue;
    }
    const res = decodeRleSafe(v, SV);
    if (!res.ok) {
      out.bad.push(k);
      continue;
    }
    const d = res.data;
    let n = 0;
    for (let j = 0; j < d.length; j++) {
      const b = d[j];
      if (b === EDIT_UNCHANGED) continue;
      if (b > MAX_BLOCK_ID) {
        d[j] = EDIT_UNCHANGED;
        continue;
      }
      n++;
    }
    out.count += n;
    out.list.push({
      cx: Number(m[1]), cz: Number(m[2]), si: Number(m[3]), diff: d,
    });
  }
  return out;
}

/** Açılmış farkları [[x,y,z,id],...] listesine döker (world.applyEdits biçimi). yMin: dünyanın en alçak y'si. */
export function diffsToEntries(list, yMin = WORLD_Y_MIN) {
  const r = editRangeFor(yMin);
  const entries = [];
  for (let c = 0; c < list.length; c++) {
    const {
      cx, cz, si, diff,
    } = list[c];
    const x0 = cx * 16;
    const z0 = cz * 16;
    const y0 = r.yMin + si * 16;
    for (let i = 0; i < SV; i++) {
      const v = diff[i];
      if (v === EDIT_UNCHANGED) continue;
      entries.push([x0 + (i & 15), y0 + (i >> 8), z0 + ((i >> 4) & 15), v]);
    }
  }
  return entries;
}

/** Açılmış farkları dünyaya uygular (yüklü chunk/kesitlere hemen, diğerlerine üretilince). Uygulanan hücre sayısı. */
export function applyEditsToWorld(world, list) {
  const entries = diffsToEntries(list, world && world.yMin !== undefined ? world.yMin : 0);
  if (entries.length === 0) return 0;
  return world.applyEdits(entries);
}

/**
 * v1 → v2 göçü (yalnız legacy/insa kayıtları: y 0..127): "cx,cz" → 32768 baytlık sütun farkını 8 kesit farkına böler.
 * Geçersiz parçalar atlanır. Döner {"cx,cz,si": b64}.
 */
export function migrateChunkDiffs(chunks) {
  const out = {};
  if (!chunks || typeof chunks !== 'object' || Array.isArray(chunks)) return out;
  Object.keys(chunks).sort().forEach((k) => {
    const m = CHUNK_KEY_RE.exec(k);
    const v = chunks[k];
    if (!m || typeof v !== 'string' || v.length > 400000) return;
    const res = decodeRleSafe(v, CHUNK_VOLUME);
    if (!res.ok) return;
    for (let si = 0; si < 8; si++) {
      const slice = res.data.subarray(si * SV, (si + 1) * SV);
      let any = false;
      for (let i = 0; i < SV; i++) {
        if (slice[i] !== EDIT_UNCHANGED && slice[i] <= MAX_BLOCK_ID) {
          any = true;
          break;
        }
      }
      if (any) out[m[1] + ',' + m[2] + ',' + si] = encodeRle(slice);
    }
  });
  return out;
}
