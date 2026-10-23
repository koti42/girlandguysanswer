import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createAnnouncer } from '../kesifAnnouncer.js';
import { isTouchUi, parseHint, parseQuestLine, touchText } from '../kxHudUtils.js';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const css = (name) => fs.readFileSync(path.join(here, '..', name), 'utf8');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('touchText: fare deyimleri dokunmatik karşılığına çevrilir', () => {
  it('"(sol tık)" parantezi düşer, "sağ tıkla" -> "dokun"', () => {
    expect(touchText('Bir ağaca yaklaş, kır düğmesini (sol tık) basılı tut.', true)).toBe('Bir ağaca yaklaş, kır düğmesini basılı tut.');
    expect(touchText('Sandığa sağ tıkla.', true)).toBe('Sandığa dokun.');
    expect(touchText('Aynayı sağ tıklayarak çevir', true)).toBe('Aynayı dokunarak çevir');
    expect(touchText('Yiyeceği seç ve kullan (sağ tık).', true)).toBe('Yiyeceği seç ve kullan.');
    expect(touchText('Shift + tık hızlı taşır.', true)).toBe('çift dokunma hızlı taşır.');
    expect(touchText('Çömelerek (Shift) kenardan düşmeden inşa et.', true)).toBe('Çömelerek kenardan düşmeden inşa et.');
    expect(touchText('Beyaz panellere ateş et: sol tık mavi, sağ tık turuncu portal açar.', true)).not.toMatch(/tık/);
  });

  it('masaüstünde (ya da matchMedia yokken) metin aynen kalır', () => {
    expect(isTouchUi()).toBe(false);
    expect(touchText('Sandığa sağ tıkla.')).toBe('Sandığa sağ tıkla.');
    expect(parseHint('[E] Kola sağ tıkla').text).toBe('Kola sağ tıkla');
  });

  it('dokunmatik cihazda (hover:none + pointer:coarse) ipucu, görev satırı ve duyuru çevrilir', () => {
    vi.stubGlobal('window', { matchMedia: (q) => ({ matches: /hover: none/.test(q) && /pointer: coarse/.test(q) }) });
    expect(isTouchUi()).toBe(true);
    expect(parseHint('Kola sağ tıkla').text).toBe('Kola dokun');
    expect(parseHint('[E] Yatağa sağ tıkla').text).toBe('Yatağa dokun');
    expect(parseQuestLine('✓ Tezgaha sağ tıkla (sol tık)')).toEqual({ done: true, text: 'Tezgaha dokun' });
    const a = createAnnouncer();
    const id = a.push({ type: 'announce', text: 'Bir aynayı sağ tıklayarak çevir', sub: 'Sağ tıkla: döner' });
    expect(id).not.toBeNull();
    const item = a.get()[0];
    expect(item.text).toBe('Bir aynayı dokunarak çevir');
    expect(item.sub).toMatch(/dokun/);
  });

  it('boş / metin olmayan girdiler dokunulmaz', () => {
    expect(touchText('', true)).toBe('');
    expect(touchText(null, true)).toBeNull();
    expect(touchText(undefined, true)).toBeUndefined();
  });
});

describe('dokunmatik düzen CSS kuralları (yatay telefon)', () => {
  it('mana çubuğu başparmak yayına taşmaz (genişlik sınırı + sol/sağ el hizası)', () => {
    const s = css('kesifMagic.css');
    expect(s).toMatch(/@media \(max-height: 430px\)[\s\S]*\.kx-root\[data-touch='1'\] \.kx-mana\s*\{[^}]*width:\s*min\(100%,\s*15\.5rem\)[^}]*align-self:\s*flex-start/);
    expect(s).toMatch(/\[data-touch='1'\]\[data-left='1'\] \.kx-mana\s*\{[^}]*align-self:\s*flex-end/);
  });

  it('kendiliğinden açılan dokunmatik kontrol ipucu balonu (kx-coach) stillerde de yok', () => {
    expect(css('kesifTouch.css')).not.toMatch(/\.kx-coach/);
    expect(css('kesifResponsive.css')).not.toMatch(/\.kx-coach/);
  });

  it('≤380 px yükseklikte mana satırı varken ipucu nişangâhın üstüne alınır', () => {
    expect(css('kesifMagic.css')).toMatch(/@media \(max-height: 380px\)\s*\{\s*\.kx-root\[data-touch='1'\]:has\(\.kx-mana\) \.kx-mid\s*\{[^}]*top:\s*calc\(50% - 56px\)/);
  });

  it('klavye kısayolu listesi dokunmatik cihazda gizlenir', () => {
    expect(css('panels.css')).toMatch(/@media \(hover: none\) and \(pointer: coarse\)\s*\{\s*\.kp-keys\s*\{\s*display:\s*none/);
  });

  it('alçak dokunmatik ekranda ipucu tek satır, yayın solunda (sol elli: sağında); panel kapat/sekme düğmeleri 44 px', () => {
    const s = css('kesifMagic.css');
    expect(s).toMatch(/\.kx-root\[data-touch='1'\] \.kx-mid\s*\{[^}]*left:\s*calc\(\(100% - 17rem\) \/ 2\)/);
    expect(s).toMatch(/\[data-touch='1'\]\[data-left='1'\] \.kx-mid\s*\{[^}]*left:\s*calc\(\(100% \+ 17rem\) \/ 2\)/);
    expect(s).toMatch(/\.kx-hint > span:last-child\s*\{[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/);
    expect(css('panels.css')).toMatch(/@media \(max-height: 420px\)\s*\{[\s\S]*?\.kp-close\s*\{\s*width:\s*44px;\s*height:\s*44px/);
    expect(css('panelsCraft.css')).toMatch(/@media \(max-height: 520px\)\s*\{[\s\S]*?\.kp-work-tab\s*\{\s*min-height:\s*44px/);
  });
});
