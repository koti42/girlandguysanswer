/*
 * Dokunmatik düzen SÖZLEŞMESİ (CSS kuralı + saf yerleşim sayıları): jsdom CSS çalıştırmaz, bu yüzden stil dosyaları okunur ve
 * medya sorgusu / sayı sözleşmeleri doğrulanır. Gerçek tarayıcı ölçümleri _kesifHarness/touchui-* senaryolarındadır.
 *
 * Kapsam: (1) paneller 44 px yuva + otomatik sütun (yatay taşma yok), (2) dokunmatik HUD bölgeleri (joystick / yay / alt-orta bant / üst öbek),
 * (3) eşya çubuğu 44 px + şerit, (4) duyuru yığını üst-orta öbekte, (5) düğme yayı sayıları bölgelere sığar.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TOUCH_ANCHOR, buildTouchLayout, touchScale } from '../kxTouchLayout.js';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const css = (name) => fs.readFileSync(path.join(here, '..', name), 'utf8').replace(/\r\n/g, '\n');

/** `@media <query> { ... }` bloklarının gövdelerini (iç içe süslü parantez dengeli) döndürür. */
function mediaBlocks(src, queryIncludes) {
  const out = [];
  let i = 0;
  while ((i = src.indexOf('@media', i)) >= 0) {
    const open = src.indexOf('{', i);
    const query = src.slice(i + 6, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
      j++;
    }
    if (!queryIncludes || query.includes(queryIncludes)) out.push({ query, body: src.slice(open + 1, j - 1) });
    i = j;
  }
  return out;
}
/** Seçici (tam metin) → bildirim gövdesi (ilk eşleşen kural). */
function rule(src, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('(?:^|[}\\n])\\s*' + esc + '\\s*\\{([^}]*)\\}').exec(src);
  return m ? m[1] : null;
}
const px = (body, prop) => {
  const m = new RegExp(prop.replace(/[-]/g, '\\-') + ':\\s*(-?[\\d.]+)px').exec(body || '');
  return m ? Number(m[1]) : null;
};

describe('paneller: 44 px yuva ve otomatik sütun (panelsTouch.css)', () => {
  const touch = css('panelsTouch.css');
  const base = css('panels.css');
  const coarse = mediaBlocks(touch, '(pointer: coarse), (max-width: 760px)')[0];

  it('dokunmatik/dar ekranda yuva 44 px, erişilebilirlik modunda 52 px', () => {
    expect(coarse).toBeTruthy();
    expect(px(rule(coarse.body, '.kp-overlay'), '--kp-slot')).toBe(44);
    expect(px(rule(coarse.body, '.kp-overlay.kp-a11y,\n  .kp-overlay.kp-a11y .kp-chest,\n  .kp-overlay.kp-a11y .kp-hotstrip'), '--kp-slot')).toBe(52);
    // sandık ve inşa şeridi kendi --kp-slot'unu tanımlar: onlar da 44'e çekilir
    expect(coarse.body).toMatch(/\.kp-overlay \.kp-chest,\s*\.kp-overlay \.kp-hotstrip \{ --kp-slot: 44px; \}/);
  });

  it('ızgara sütunları auto-fill: sütun sayısını ekran seçer, 9\'dan fazla açılmaz (yatay taşma yok)', () => {
    expect(coarse.body).toMatch(/grid-template-columns: repeat\(auto-fill, minmax\(var\(--kp-slot\), 1fr\)\)/);
    expect(coarse.body).toMatch(/max-width: calc\(9 \* var\(--kp-slot\) \+ 8 \* var\(--kp-gap\)\)/);
    // sabit 9 sütunlu repeat dokunmatik blokta yok
    expect(coarse.body).not.toMatch(/repeat\(9,/);
  });

  it('eski taşan formül (100vw − 88 px) yalnız masaüstü tabanında kalır; dokunmatik blok --kp-slot\'u düz 44 px yapar', () => {
    expect(base).toMatch(/--kp-slot: clamp\(30px, min\(calc\(\(100vw - 88px\) \/ 9\)/);
    expect(touch).not.toMatch(/100vw - 88px/);
    expect(px(rule(coarse.body, '.kp-overlay'), '--kp-slot')).toBeGreaterThanOrEqual(44);
  });

  it('düğme/çip/sekme/arama en az 44 px; yuvalar dikey kaydırmaya izin verir (sürükleme basılı tutunca)', () => {
    expect(coarse.body).toMatch(/\.kp-overlay \.kp-tab,[\s\S]*min-height: 44px/);
    expect(coarse.body).toMatch(/\.kp-overlay \.kp-pinchip \{ width: 44px; height: 44px; \}/);
    expect(coarse.body).toMatch(/\.kp-overlay \.kp-slot,\s*\.kp-overlay \.kp-block \{ touch-action: pan-y; \}/);
    expect(coarse.body).toMatch(/\.kp-slot\[data-armed\]/);
  });

  it('dar telefonda: sekmeli başlıkta başlık metni ekran okuyucuya kalır (kırpılma yok), üretim üst denetimleri tek sütun, arama kendi satırında', () => {
    const narrow = mediaBlocks(touch, '(max-width: 480px)').find((b) => b.query === '(max-width: 480px)');
    expect(narrow.body).toMatch(/\.kp-head:has\(\.kp-work\) \.kp-head-text \{[^}]*clip: rect\(0 0 0 0\)/);
    expect(narrow.body).toMatch(/\.kp-craft-top \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(narrow.body).toMatch(/\.kp-search-row \.kp-search \{ flex: 1 1 100%; \}/);
    expect(narrow.body).toMatch(/\.kp-search-row \{ flex-wrap: wrap; \}/);
  });

  it('kısa yatayda envanter iki sütun: ızgara solda, karakter+bilgi sağda; zırh 2×2', () => {
    const land = mediaBlocks(touch, '(orientation: landscape) and (max-height: 520px)').find((b) => b.query === '(orientation: landscape) and (max-height: 520px)');
    expect(land.body).toMatch(/grid-template-areas: 'main char' 'main side';/);
    expect(land.body).toMatch(/repeat\(2, var\(--kp-slot\)\)/);
  });

  it('büyü masası eylem çubuğu gövde dolgusuyla hizalı (yatay taşma 4 px hatası)', () => {
    expect(touch).toMatch(/\.ke-actions \{ margin: 2px -10px -10px; padding: 8px 10px 10px; bottom: -10px; \}/);
    expect(touch).toMatch(/\.ke-actions \{ margin: 2px -8px -12px; padding: 8px 8px 12px; bottom: -12px; \}/);
  });

  it('PanelShell tüm panel stillerinden sonra panelsTouch.css yükler', () => {
    const shell = fs.readFileSync(path.join(here, '..', 'PanelShell.jsx'), 'utf8').replace(/\r\n/g, '\n');
    const order = ["'./panels.css'", "'./panelsMagic.css'", "'./panelsTouch.css'"].map((s) => shell.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('dokunmatik HUD bölgeleri (kesifTouchHud.css)', () => {
  const hud = css('kesifTouchHud.css');
  const vars = rule(hud, ".kx-root[data-touch='1']");

  it('eşya çubuğu yuvası dokunmatikte 44 px, erişilebilirlikte 52 px', () => {
    expect(px(vars, '--kx-slot')).toBe(44);
    expect(px(rule(hud, ".kx-root[data-touch='1'][data-a11y='1']"), '--kx-slot')).toBe(52);
  });

  it('çubuk sığmayınca yatay şerit olur (kaydırma çubuğu gizli, kenar solması) ve sarmalayıcılar yerleşime karışmaz', () => {
    expect(rule(hud, ".kx-hotbar[data-scroll='1']")).toMatch(/overflow-x: auto;[\s\S]*overflow-y: hidden/);
    expect(rule(hud, ".kx-hotbar[data-scroll='1']")).toMatch(/scrollbar-width: none/);
    expect(hud).toMatch(/\.kx-hotbar\[data-scroll='1'\]\[data-fade='lr'\]/);
    expect(rule(hud, '.kx-hotbar')).toMatch(/max-width: 100%/);
    expect(hud).toMatch(/\.kx-top,\n\.kx-tcwrap,\n\.kx-gauges \{\n {2}display: contents;/);
  });

  it('yatay: alt-orta bant joystick ile yay arasında; sol elli aynalanır', () => {
    const land = mediaBlocks(hud, '(orientation: landscape)').find((b) => b.query === '(orientation: landscape)');
    expect(land.body).toMatch(/\.kx-bottom \{\s*left: calc\(var\(--kx-safe-l\) \+ var\(--kx-joy-r\)\);\s*right: calc\(var\(--kx-safe-r\) \+ var\(--kx-arc-l\)\);/);
    expect(land.body).toMatch(/\[data-left='1'\] \.kx-bottom \{\s*left: calc\(var\(--kx-safe-l\) \+ var\(--kx-arc-l\)\);\s*right: calc\(var\(--kx-safe-r\) \+ var\(--kx-joy-r\)\);/);
    expect(land.body).toMatch(/\[data-left='1'\] \.kx-tcwrap/);
  });

  it('geniş yatayda orta öbek üst çubukla aynı sırada, dar yatayda üst çubuğun altında', () => {
    const wide = mediaBlocks(hud, '(min-width: 780px)')[0];
    expect(wide.body).toMatch(/\.kx-tcwrap \{\s*top: var\(--kx-safe-t\);\s*right: calc\(var\(--kx-safe-r\) \+ var\(--kx-top-w\)\);/);
    const land = mediaBlocks(hud, '(orientation: landscape)').find((b) => b.query === '(orientation: landscape)');
    expect(land.body).toMatch(/\.kx-tcwrap \{[^}]*top: calc\(var\(--kx-safe-t\) \+ 52px\);/);
  });

  it('dikey: üst çubuk yatay sıra, üst öbek tek sütun akışı, ölçerler sol sütunda (yayın üstünde, joystick ghost\'un üstünde)', () => {
    const port = mediaBlocks(hud, '(orientation: portrait)').filter((b) => b.query === '(orientation: portrait)').map((b) => b.body).join(' ');
    expect(port).toMatch(/\.kx-topbar \{\s*flex-direction: row;/);
    expect(port).toMatch(/\.kx-top \{\s*display: flex;\s*flex-direction: column;/);
    expect(port).toMatch(/\.kx-gauges \{\s*position: absolute;/);
    expect(port).toMatch(/\.kx-joy-ghost \{\s*bottom: calc\(var\(--kx-safe-b\) \+ 150px\)/);
  });

  it('duyuru yığını dokunmatikte akışta (üst-orta öbek), sabit konumlu değil; kısa ekranda yalnız en yeni', () => {
    expect(rule(hud, ".kx-root[data-touch='1'] .kx-toasts")).toMatch(/position: static/);
    const short = mediaBlocks(hud, '(orientation: landscape) and (max-height: 420px)');
    expect(short.some((b) => /\.kx-toast:not\(:last-child\)/.test(b.body))).toBe(true);
    const small = mediaBlocks(hud, '(orientation: portrait) and (max-height: 700px)').filter((b) => b.query === '(orientation: portrait) and (max-height: 700px)');
    expect(small.some((b) => /\.kx-toast:not\(:last-child\)/.test(b.body))).toBe(true);
  });

  it('"telefonunu çevir" ipucu üst öbekte akışta; çok küçük dikey ekranda ve duyuru varken gizlenir', () => {
    expect(hud).toMatch(/\.kx-tc \.kxp-orient \{\s*position: static;/);
    expect(hud).toMatch(/\.kx-tcwrap:has\(\.kx-toast\) \.kxp-orient \{\s*display: none;/);
    expect(mediaBlocks(hud, '(orientation: portrait) and (max-height: 640px)')[0].body).toMatch(/\.kxp-orient \{\s*display: none;/);
  });
});

describe('düğme yayı sayıları bölgelere sığar', () => {
  const hud = css('kesifTouchHud.css');
  const vars = rule(hud, ".kx-root[data-touch='1']");
  const ARC_L = px(vars, '--kx-arc-l');
  const all = { canInteract: true, mode: 'insa', abilities: { doubleJump: true, grapple: true, glide: true, portalGun: true } };

  /** Yayın sol ucu (kenardan, px): çapa kenarı + en uzak düğmenin merkez uzaklığı + yarıçap, ölçekle. */
  const arcLeft = (portrait, cs) => {
    const { anchor, buttons } = buildTouchLayout({ ...all, portrait });
    return Math.max(...buttons.map((b) => (anchor.edge - b.bx + b.size / 2) * cs));
  };

  it('yatay: yayın sol ucu --kx-arc-l içinde (tüm gerçek yatay telefon yükseklikleri)', () => {
    for (const [w, h] of [[568, 320], [667, 375], [740, 360], [812, 375], [844, 390], [915, 412], [932, 430]]) {
      const cs = touchScale(w, h, false);
      expect(arcLeft(false, cs), `${w}x${h}`).toBeLessThanOrEqual(ARC_L);
    }
  });

  it('dikey: çapa, 44 px yuvalı can/açlık + eşya çubuğunun (≈ 96 px) üstünde; ölçerler en soldaki düğmenin üstünde başlar', () => {
    expect(TOUCH_ANCHOR.portrait.bottom).toBeGreaterThanOrEqual(148);
    const { anchor, buttons } = buildTouchLayout({ ...all, portrait: true });
    const lowest = Math.min(...buttons.map((b) => anchor.bottom + b.by - b.size / 2));
    expect(lowest).toBeGreaterThanOrEqual(100); // can/açlık satırının üstü (çubuk 56 + boşluk 6 + can 26 + pay)
    // ölçer sütunu: sol sütunda (genişliği ≈ 0.41 · W) yayla x'te kesişen düğmelerin en üstü
    const gauges = /\.kx-gauges \{\s*position: absolute;\s*left: 0;\s*bottom: calc\(100% \+ (\d+)px \+ max\((\d+)px, min\((\d+)px, ([\d.]+)vw\)\)\);\s*width: calc\(100% \* ([\d.]+)\);/.exec(hud);
    expect(gauges).toBeTruthy();
    const [base, lo, hi, vw] = gauges.slice(1, 5).map(Number);
    const frac = Number(gauges[5]);
    const STACK = 88; // çubuk 56 + boşluk 6 + can satırı 26
    for (const w of [320, 360, 390, 430]) {
      const cs = touchScale(w, 800, true);
      const colRight = 10 + (w - 20) * frac; // güvenli alan kenar payı 10 px
      let overlapTop = 0;
      for (const b of buttons) {
        const left = w - 10 - (anchor.edge - b.bx + b.size / 2) * cs;
        if (left < colRight) overlapTop = Math.max(overlapTop, anchor.bottom + (b.by + b.size / 2) * cs);
      }
      const offset = base + Math.max(lo, Math.min(hi, (vw * w) / 100));
      expect(STACK + offset, `W=${w}: ölçerler yayın en soldaki düğmesinin üstünde başlamalı`).toBeGreaterThanOrEqual(overlapTop);
    }
  });

  it('yay düğmeleri görsel olarak da 44 px altına inmez (CSS max(44px, …)) ve en küçük ölçekte birbirine binmez', () => {
    const touchCss = css('kesifTouch.css');
    expect(touchCss).toMatch(/--s: max\(44px, calc\(var\(--bs\) \* var\(--kx-cs, 1\) \* 1px\)\);/);
    for (const portrait of [false, true]) {
      for (const cs of [0.78, 0.9, 1, 1.15]) {
        const { buttons } = buildTouchLayout({ ...all, portrait });
        const px = buttons.map((b) => ({ id: b.id, x: b.bx * cs, y: b.by * cs, s: Math.max(44, b.size * cs) }));
        for (let i = 0; i < px.length; i++) {
          for (let j = i + 1; j < px.length; j++) {
            const d = Math.hypot(px[i].x - px[j].x, px[i].y - px[j].y);
            expect(d + 2, `${portrait ? 'dikey' : 'yatay'} cs=${cs}: ${px[i].id}/${px[j].id}`).toBeGreaterThanOrEqual((px[i].s + px[j].s) / 2);
          }
        }
      }
    }
  });

  it('yatayda en üstteki yetenek düğmesi üst çubuğun (kenar 8 + 44 px) altında kalır: dokunma hedefleri çakışmaz', () => {
    const { anchor, buttons } = buildTouchLayout({ ...all, portrait: false });
    for (const [w, h] of [[568, 320], [667, 375], [740, 360], [812, 375], [844, 390], [915, 412], [932, 430]]) {
      const cs = touchScale(w, h, false);
      const topEdge = Math.min(...buttons.map((b) => h - (8 + anchor.bottom + b.by * cs) - Math.max(44, b.size * cs) / 2));
      expect(topEdge, `${w}x${h}`).toBeGreaterThanOrEqual(8 + 44 + 2);
    }
  });

  it('üst çubuk 6 düğme + boşluk üst çubuk bölgesine (--kx-top-w) sığar', () => {
    expect(6 * 44 + 5 * 6).toBeLessThanOrEqual(px(vars, '--kx-top-w'));
  });
});
