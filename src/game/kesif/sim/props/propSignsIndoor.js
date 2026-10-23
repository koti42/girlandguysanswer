/*
 * KEŞİF sim/props — İÇ MEKÂN YAZI PANOLARI (saf): menü tahtası, ilan panosu, skor tablosu. Metinler propTexts.js tablolarındandır (özgün,
 * aile dostu, serbest metin yok). Marka tabelaları (neon_tabela_ic) sokak tabelası tablosunu (propSigns.SIGN_ENTRIES, flags = indeks) kullanır;
 * bu dosya YALNIZ yeni dizgeleri ekler. Çizici (propRendererInterior) bu girişleri kendi küçük atlasına bir kez çizer.
 *
 *   BOARDS            donuk dizi: {i, type:'menu'|'notice'|'score', kind: iç mekân türü | null, lines[], hue, title}
 *   BOARD_ENTRIES     signAtlas girdi biçimi (kind 'ad': atlas yazı boyu/ağırlığı) — createSignAtlas({entries})
 *   boardAt(i) → giriş | null          boardIndexFor(type, interiorKind, n) → indeks (n: hash/sayaç)
 *   boardTypeOf(defKey) → 'menu' | 'notice' | 'score' | null
 *   boardText(board) → "BAŞLIK · satır · satır"
 *   pickBoardForProp(def, prop, interiorKind) → giriş | null      (kimlik hash'inden belirlenimci)
 */
import { MENU_BOARDS, NOTICES, SCORE_BOARDS } from './propTexts.js';
import { hash32 } from '../rng.js';

const HUE_BY_TYPE = { menu: 1, notice: 0, score: 3 };
const entries = [];

function push(type, kind, lines) {
  entries.push({
    i: entries.length,
    type,
    kind: kind || null,
    lines: Object.freeze(lines.slice()),
    title: lines[0],
    hue: HUE_BY_TYPE[type],
  });
}

MENU_BOARDS.forEach((m) => push('menu', m.kind, m.lines));
NOTICES.forEach((m) => push('notice', m.kind, m.lines));
SCORE_BOARDS.forEach((m) => push('score', null, m.lines));

export const BOARDS = Object.freeze(entries.map((e) => Object.freeze(e)));

/** signAtlas girdileri: atlas yalnız `kind` (px/ağırlık), `lines`, `i` kullanır. */
export const BOARD_ENTRIES = Object.freeze(BOARDS.map((b) => Object.freeze({
  i: b.i, kind: 'ad', id: 'pano' + b.i, text: b.title, lines: b.lines, tagline: b.title, hue: b.hue, mode: 0, frame: 1,
})));

const TYPE_OF = Object.freeze({ menu_tahtasi: 'menu', ilan_panosu: 'notice', skor_tablosu: 'score' });

export function boardTypeOf(key) {
  return Object.prototype.hasOwnProperty.call(TYPE_OF, key) ? TYPE_OF[key] : null;
}

export function boardAt(i) {
  return Number.isInteger(i) && i >= 0 && i < BOARDS.length ? BOARDS[i] : null;
}

export function boardText(b) {
  return b ? b.lines.join(' · ') : '';
}

/** Türe uygun pano indeksi (tür eşleşen yoksa tüm türdekilerden). */
export function boardIndexFor(type, interiorKind, n) {
  let pool = BOARDS.filter((b) => b.type === type && b.kind === interiorKind);
  if (pool.length === 0) pool = BOARDS.filter((b) => b.type === type);
  if (pool.length === 0) return -1;
  const k = ((n | 0) % pool.length + pool.length) % pool.length;
  return pool[k].i;
}

export function pickBoardForProp(def, prop, interiorKind) {
  const type = boardTypeOf(def.key);
  if (!type) return null;
  const i = boardIndexFor(type, interiorKind || null, hash32(prop.id ^ 0x600d0b04));
  return i < 0 ? null : BOARDS[i];
}
