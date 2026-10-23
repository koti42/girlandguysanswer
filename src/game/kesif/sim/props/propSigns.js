/*
 * KEŞİF sim/props — TABELA/REKLAM DİZGE TABLOSU (saf). Kaynak yalnızca citycontent tabloları (CITY_BRANDS, CITY_AD_LINES): sözleşme §2
 * (özgün adlar, serbest metin yok). `Prop.flags & 0xffff` tabela/billboard için bu tablonun indeksidir; render/props/signAtlas.js
 * aynı tabloyu bir kez 1024² tuvale çizer.
 *
 *   SIGN_ENTRIES   donuk dizi: {i, kind:'brand'|'ad', id, text, lines[1..2], tagline, hue:0..3, mode:0..4, frame:0..2}
 *                  (önce 60 dükkân, sonra reklam satırları; sıra citycontent tablolarının sırasıdır)
 *   SIGN_COUNT     toplam (≤140 olmalı: test)
 *   signIndexOf(kind, id) → indeks | -1          signAt(i) → giriş | null
 *   pickSignIndex(seed, kind, districtKey, slot) → indeks (dükkân: bölgeye uygun; reklam: bölgeye uygun satır)
 *   HUE_NAMES      ['camgobegi','pembe','kehribar','limon'] (SIGN_HUES ile aynı sıra)
 */
import {
  CITY_AD_LINES, CITY_BRANDS, SIGN_FRAMES, SIGN_HUES, SIGN_MODES, pickAdLine, pickBrand, signLines,
} from '../city/cityBrands.js';
import { hash32, stringSeedToInt } from '../rng.js';

export const HUE_NAMES = SIGN_HUES;

/** Reklam satırı: en çok 2 satır, satır başına ≤ 24 karakter (bölme: dengeli sözcük sınırı). */
const AD_LINE_CHARS = 24;

const entries = [];
CITY_BRANDS.forEach((b) => {
  entries.push({
    i: entries.length,
    kind: 'brand',
    id: b.id,
    text: b.name,
    lines: signLines(b, { upper: true }),
    tagline: b.tagline,
    hue: Math.max(0, SIGN_HUES.indexOf(b.style.hue)),
    mode: Math.max(0, SIGN_MODES.indexOf(b.style.mode)),
    frame: Math.max(0, SIGN_FRAMES.indexOf(b.style.frame)),
  });
});
CITY_AD_LINES.forEach((a) => {
  entries.push({
    i: entries.length,
    kind: 'ad',
    id: a.id,
    text: a.text,
    lines: signLines(a.text, { maxChars: AD_LINE_CHARS }),
    tagline: a.text,
    hue: stringSeedToInt(a.id) % SIGN_HUES.length,
    mode: 0,
    frame: 1,
  });
});

export const SIGN_ENTRIES = Object.freeze(entries.map((e) => Object.freeze(Object.assign({}, e, { lines: Object.freeze(e.lines.slice()) }))));
export const SIGN_COUNT = SIGN_ENTRIES.length;

const BY_KEY = new Map();
SIGN_ENTRIES.forEach((e) => BY_KEY.set(e.kind + ':' + e.id, e.i));
const BRAND_COUNT = CITY_BRANDS.length;

export function signIndexOf(kind, id) {
  const v = BY_KEY.get(kind + ':' + id);
  return v === undefined ? -1 : v;
}

export function signAt(i) {
  return Number.isInteger(i) && i >= 0 && i < SIGN_COUNT ? SIGN_ENTRIES[i] : null;
}

/** Belirlenimci seçim: kind 'brand' → dükkân tabelası, 'ad' → reklam. Hiçbir zaman -1 dönmez. */
export function pickSignIndex(seed, kind, districtKey, slot) {
  if (kind === 'ad') {
    const a = pickAdLine(seed | 0, districtKey || 'merkez', slot | 0);
    const i = a ? signIndexOf('ad', a.id) : -1;
    if (i >= 0) return i;
    return BRAND_COUNT + (hash32((seed ^ Math.imul(slot | 0, 0x9e3779b1)) | 0) % Math.max(1, SIGN_COUNT - BRAND_COUNT));
  }
  const b = pickBrand(seed | 0, districtKey || 'merkez', slot | 0);
  const i = b ? signIndexOf('brand', b.id) : -1;
  if (i >= 0) return i;
  return hash32((seed ^ Math.imul(slot | 0, 0x9e3779b1)) | 0) % Math.max(1, BRAND_COUNT);
}
