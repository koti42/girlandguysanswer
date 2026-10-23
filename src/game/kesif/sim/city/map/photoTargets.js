/*
 * KEŞİF sim/city/map — FOTOĞRAF ALBÜMÜ VE FOTO GÖREVLERİ (photo_map). SAF, es2020. Kamera kadrajına «konu» alma testi: kadrajda + görüş hattı açık + yeterince büyük.
 *
 * Konular (8): Boyut Terminali · Tepe Terası · yarış kapısı · kurye masası · dükkân sahibi/sokak NPC'si · dost robot · araç · yaya kalabalığı (≥ 3).
 * Her konuyu İLK kez kadraja alınca +8 Kredi; 8/8 albüm tamamlanınca +30 Kredi (tek sefer). Fotoğrafçı Irmak'ın görevi (`foto_ilk`) bir yer imi konusunu
 * (terminal, tepe, yarış kapısı ya da kurye masası) kadraja almayı ister: +15 Kredi, tek sefer. Kredi şehir-yerel; jetona ÇEVRİLMEZ.
 * Durum `city.photo = {n: çekilen kare, s: konu bit maskesi, a: görev maskesi, w: albüm ödülü 0|1}` (ileri uyum anahtarı; küçük, sanitize'dan geçer).
 *
 *   PHOTO_SUBJECTS · PHOTO_ASSIGNMENTS · PHOTO_KREDI · SUBJECT_IDS
 *   decodePhotoState(raw) → {n, s, a, w} (sağlam)      subjectBit(id) → 0..7 | -1      albumCount(st) → 0..8
 *   staticCandidates(seed) → [{kind, id, name, x, y, z, r}]   terminal/tepe/yarış/kurye (kararlı; önbellekli)
 *   evaluateShot(cam, aspect, candidates, rayFn, opts) → {kinds:[subjectId…], hits:[{kind,id,name,depth}]}
 *   applyShot(st, kinds, assignmentId) → {newSubjects[], albumDone, assignmentDone, kredi}      (st yerinde güncellenir; n artar)
 */
import { getCityPlan } from '../cityPlan.js';
import { terminalName } from '../cityNames.js';
import { subjectInFrame } from './photoMath.js';
import { mapPoiList } from './mapFog.js';
import { KREDI } from '../mission/missionData.js';

export const PHOTO_SUBJECTS = Object.freeze([
  Object.freeze({ id: 'terminal', name: 'Boyut Terminali', hint: 'Işıklı bir Boyut Terminalini kadraja al.' }),
  Object.freeze({ id: 'tepe', name: 'Tepe Terası', hint: 'Tepe Konutları\'nın terasını çek.' }),
  Object.freeze({ id: 'yaris', name: 'Yarış kapısı', hint: 'Bir yarışın başlangıç kapısını çek.' }),
  Object.freeze({ id: 'kurye', name: 'Kurye masası', hint: 'Kurye masalarından birini çek.' }),
  Object.freeze({ id: 'sahip', name: 'Şehir sakini', hint: 'Bir dükkân sahibini ya da sokak sakinini kadraja al.' }),
  Object.freeze({ id: 'robot', name: 'Dost robot', hint: 'Dost bir robotla fotoğraf çek.' }),
  Object.freeze({ id: 'arac', name: 'Araç', hint: 'Bir aracı kadraja al.' }),
  Object.freeze({ id: 'kalabalik', name: 'Kalabalık', hint: 'Kadrajda en az üç yaya olsun.' }),
]);
export const SUBJECT_IDS = Object.freeze(PHOTO_SUBJECTS.map((s) => s.id));

export const PHOTO_ASSIGNMENTS = Object.freeze({
  foto_ilk: Object.freeze({
    id: 'foto_ilk', bit: 0, accept: Object.freeze(['terminal', 'tepe', 'yaris', 'kurye']), kredi: 15,
    hint: 'Fotoğrafçı Irmak bir yer imi ister: terminal, tepe terası, yarış kapısı ya da kurye masası.',
  }),
});

export const PHOTO_KREDI = Object.freeze({ subject: 8, album: KREDI.photo, assignment: 15 });
const CROWD_MIN = 3;

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const int = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : lo);

export function decodePhotoState(raw) {
  const r = isObj(raw) ? raw : {};
  return {
    n: int(r.n, 0, 1000000), s: int(r.s, 0, 0xff), a: int(r.a, 0, 0xff), w: r.w === 1 ? 1 : 0,
  };
}

export function subjectBit(id) {
  return SUBJECT_IDS.indexOf(id);
}

export function albumCount(st) {
  let c = 0;
  const s = st && typeof st.s === 'number' ? st.s | 0 : 0;
  for (let i = 0; i < SUBJECT_IDS.length; i++) if ((s >> i) & 1) c++;
  return c;
}

/* ------------------------------------------------------------------------------------------------
 * Sabit adaylar
 * ---------------------------------------------------------------------------------------------- */
const CACHE = new Map();

export function staticCandidates(seed) {
  const key = seed >>> 0;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const plan = getCityPlan(seed);
  const out = [];
  for (let i = 0; i < plan.terminals.length; i++) {
    const t = plan.terminals[i];
    out.push({
      kind: 'terminal', id: 't' + i, name: terminalName(i), x: t.x, y: t.y + 1.6, z: t.z, r: 1.4,
    });
  }
  const top = plan.hill && plan.hill.top ? plan.hill.top : null;
  if (top) {
    out.push({
      kind: 'tepe', id: 'tepe', name: 'Tepe Terası', x: top.x, y: (plan.hill.maxY || 112) + 1.5, z: top.z, r: 5,
    });
  } else {
    const t15 = plan.terminals[15];
    out.push({
      kind: 'tepe', id: 'tepe', name: 'Tepe Terası', x: t15.x, y: t15.y + 1.6, z: t15.z, r: 5,
    });
  }
  const list = mapPoiList(seed);
  for (let k = 0; k < list.length; k++) {
    const p = list[k];
    if (p.type === 'race_gate') {
      out.push({
        kind: 'yaris', id: 'y' + p.id, name: p.name, x: p.x, y: p.y + 2.5, z: p.z, r: 4,
      });
    } else if (p.type === 'courier_desk') {
      out.push({
        kind: 'kurye', id: 'k' + p.id, name: p.name, x: p.x, y: p.y + 1.2, z: p.z, r: 1.5,
      });
    }
  }
  if (CACHE.size >= 4) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, out);
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Kadraj değerlendirme ve ilerleme
 * ---------------------------------------------------------------------------------------------- */
/**
 * Adaylardan kadraja girenler. 'kalabalik' için aynı türden ≥ 3 aday gerekir (kind 'yaya'); diğer türler tekil.
 * opts: subjectInFrame seçenekleri. Dönen kinds benzersiz ve SUBJECT_IDS sırasındadır.
 */
export function evaluateShot(cam, aspect, candidates, rayFn, opts) {
  const hits = [];
  const seen = Object.create(null);
  let crowd = 0;
  const list = Array.isArray(candidates) ? candidates : [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!c || typeof c.kind !== 'string') continue;
    const o = c.kind === 'yaya' ? Object.assign({}, opts, { minSize: 0.02, maxDist: 40 }) : opts;
    const r = subjectInFrame(cam, aspect, c, rayFn, o);
    if (!r.ok) continue;
    if (c.kind === 'yaya') {
      crowd++;
      continue;
    }
    if (SUBJECT_IDS.indexOf(c.kind) < 0) continue;
    hits.push({
      kind: c.kind, id: String(c.id), name: String(c.name || c.kind), depth: r.depth,
    });
    seen[c.kind] = true;
  }
  if (crowd >= CROWD_MIN) seen.kalabalik = true;
  const kinds = SUBJECT_IDS.filter((k) => seen[k] === true);
  return { kinds, hits, crowd };
}

/** İlerlemeyi işler: konu bitleri, albüm, görev; Kredi toplamı döner. st yerinde güncellenir (n her zaman +1). */
export function applyShot(st, kinds, assignmentId) {
  const res = {
    newSubjects: [], albumDone: false, assignmentDone: false, kredi: 0,
  };
  st.n = Math.min(1000000, (st.n | 0) + 1);
  const ks = Array.isArray(kinds) ? kinds : [];
  for (let i = 0; i < ks.length; i++) {
    const b = subjectBit(ks[i]);
    if (b < 0 || ((st.s >> b) & 1) === 1) continue;
    st.s |= 1 << b;
    res.newSubjects.push(ks[i]);
    res.kredi += PHOTO_KREDI.subject;
  }
  if (albumCount(st) >= SUBJECT_IDS.length && st.w !== 1) {
    st.w = 1;
    res.albumDone = true;
    res.kredi += PHOTO_KREDI.album;
  }
  const as = typeof assignmentId === 'string' && Object.prototype.hasOwnProperty.call(PHOTO_ASSIGNMENTS, assignmentId) ? PHOTO_ASSIGNMENTS[assignmentId] : null;
  if (as && ((st.a >> as.bit) & 1) === 0 && as.accept.some((k) => ks.indexOf(k) >= 0)) {
    st.a |= 1 << as.bit;
    res.assignmentDone = true;
    res.kredi += as.kredi;
  }
  return res;
}
