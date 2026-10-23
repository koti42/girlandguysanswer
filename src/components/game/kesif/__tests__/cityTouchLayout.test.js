/*
 * Neon Meridyen dokunmatik düzen SÖZLEŞMESİ (cityhud): "Boyut kipi" düğmesi + şehir çipleri + yükleme paneli CSS kuralları.
 * jsdom CSS çalıştırmaz: stil dosyaları okunur, yerleşim sayıları (kxTouchLayout) çözümlenir. Gerçek ölçüm: _kesifHarness/cityhud_run.cjs
 * (844×390 ve 390×844 gerçek Chrome/GPU, sınır kutusu çakışma denetimi).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildTouchLayout, touchScale } from '../kxTouchLayout.js';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const read = (rel) => fs.readFileSync(path.join(here, '..', rel), 'utf8').replace(/\r\n/g, '\n');
/** `@media <sorgu> { ... }` blokları (iç içe süslü parantez dengeli). */
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
const px = (body, prop) => {
  const m = new RegExp(prop.replace(/[-]/g, '\\-') + ':\\s*(-?[\\d.]+)px').exec(body || '');
  return m ? Number(m[1]) : null;
};

const ABILITIES = { doubleJump: true, grapple: true, glide: true, portalGun: true };
const PHONES_LAND = [[568, 320], [667, 375], [740, 360], [812, 375], [844, 390], [915, 412], [932, 430]];
const PHONES_PORT = [[320, 568], [360, 640], [375, 667], [390, 844], [412, 915], [430, 932]];

/** Tüm yetenek altkümeleri × çevir / etkileş / uçuş bileşimleri (macera + portalMode). */
function* combos() {
  const keys = ['grapple', 'glide', 'portalGun'];
  for (let m = 0; m < 8; m++) {
    const abilities = { doubleJump: true };
    keys.forEach((k, i) => { abilities[k] = Boolean(m & (1 << i)); });
    for (const canInteract of [false, true]) for (const flying of [false, true]) yield { abilities, canInteract, flying, mode: 'macera', portalMode: true };
  }
}

describe('kxTouchLayout: portalMode düğmesi (isteğe bağlı)', () => {
  it('o.portalMode yoksa yerleşim DEĞİŞMEZ: aynı düğmeler, aynı konumlar (mevcut davranış korunur)', () => {
    for (const portrait of [false, true]) {
      const base = buildTouchLayout({ portrait, canInteract: true, mode: 'macera', abilities: ABILITIES });
      const off = buildTouchLayout({ portrait, canInteract: true, mode: 'macera', abilities: ABILITIES, portalMode: false });
      expect(off).toEqual(base);
      expect(base.buttons.some((b) => b.id === 'portalMode')).toBe(false);
    }
  });

  it('o.portalMode ile bir "portalMode" düğmesi gelir: kimlik/ad aynı, tür toggle, simge dimension, Türkçe ad', () => {
    for (const portrait of [false, true]) {
      const lay = buildTouchLayout({ portrait, canInteract: true, mode: 'macera', abilities: ABILITIES, portalMode: true });
      const b = lay.buttons.filter((x) => x.id === 'portalMode');
      expect(b).toHaveLength(1);
      expect(b[0]).toMatchObject({ name: 'portalMode', label: 'Boyut kipi', icon: 'dimension', kind: 'toggle' });
      expect(b[0].size).toBeGreaterThanOrEqual(44 - 2);
      // diğer düğmelerin konumu ve sayısı değişmez (yalnızca bir düğme eklenir)
      const base = buildTouchLayout({ portrait, canInteract: true, mode: 'macera', abilities: ABILITIES });
      expect(lay.buttons.length).toBe(base.buttons.length + 1);
      base.buttons.forEach((x) => expect(lay.buttons.find((y) => y.id === x.id)).toEqual(x));
    }
  });

  it('Portal Tabancası düğmesi yetenek sırasında hemen ÖNCE; portalMode ondan sonra gelir (yan yana)', () => {
    const lay = buildTouchLayout({ portrait: false, canInteract: false, mode: 'macera', abilities: ABILITIES, portalMode: true });
    const ids = lay.buttons.map((b) => b.id);
    expect(ids.indexOf('ability3')).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf('portalMode')).toBe(ids.indexOf('ability3') + 1);
  });

  it('tüm yetenek altkümelerinde en çok bir portalMode; yuvalar benzersiz', () => {
    for (const portrait of [false, true]) {
      for (const c of combos()) {
        const lay = buildTouchLayout({ ...c, portrait });
        expect(lay.buttons.filter((b) => b.id === 'portalMode')).toHaveLength(1);
        const keys = lay.buttons.map((b) => b.bx + ',' + b.by);
        expect(new Set(keys).size).toBe(keys.length);
        expect(new Set(lay.buttons.map((b) => b.id)).size).toBe(lay.buttons.length);
      }
    }
  });
});

describe('düğme yayı: portalMode ile çakışma ve bölge denetimi', () => {
  const hud = read('kesifTouchHud.css');
  const ARC_L = px(/\.kx-root\[data-touch='1'\] \{([^}]*)\}/.exec(hud)[1], '--kx-arc-l');

  it('hiçbir düğme çifti (gerçek yatay/dikey telefon ölçekleri, tüm bileşimler) birbirine binmez (≥ 44 px görsel hedef)', () => {
    for (const portrait of [false, true]) {
      for (const [w, h] of portrait ? PHONES_PORT : PHONES_LAND) {
        const cs = touchScale(w, h, portrait);
        for (const c of combos()) {
          const { buttons } = buildTouchLayout({ ...c, portrait });
          const p = buttons.map((b) => ({ id: b.id, x: b.bx * cs, y: b.by * cs, s: Math.max(44, b.size * cs) }));
          for (let i = 0; i < p.length; i++) {
            for (let j = i + 1; j < p.length; j++) {
              const d = Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y);
              expect(d + 2, `${w}x${h} ${p[i].id}/${p[j].id}`).toBeGreaterThanOrEqual((p[i].s + p[j].s) / 2);
            }
          }
        }
      }
    }
  });

  it('yatay: yayın sol ucu --kx-arc-l bandına en çok 8 px taşar (bant içeriği ortalanmıştır; düğme bandın üst kenarının üstünde)', () => {
    for (const [w, h] of PHONES_LAND) {
      const cs = touchScale(w, h, false);
      for (const c of combos()) {
        const { anchor, buttons } = buildTouchLayout({ ...c, portrait: false });
        const left = Math.max(...buttons.map((b) => (anchor.edge - b.bx + Math.max(44, b.size * cs) / (2 * cs)) * cs));
        expect(left, `${w}x${h}`).toBeLessThanOrEqual(ARC_L + 8);
        // portalMode düğmesinin alt kenarı alt-orta bandın (can + eşya çubuğu ≈ 100 px) üstünde
        const pm = buttons.find((b) => b.id === 'portalMode');
        const bottomEdge = anchor.bottom + pm.by * cs - Math.max(44, pm.size * cs) / 2;
        expect(bottomEdge, `${w}x${h}`).toBeGreaterThanOrEqual(110);
      }
    }
  });

  it('yatay: en üstteki düğme üst çubuğun (kenar 8 + 44 px) altında kalır', () => {
    for (const [w, h] of PHONES_LAND) {
      const cs = touchScale(w, h, false);
      for (const c of combos()) {
        const { anchor, buttons } = buildTouchLayout({ ...c, portrait: false });
        const topEdge = Math.min(...buttons.map((b) => h - (8 + anchor.bottom + b.by * cs) - Math.max(44, b.size * cs) / 2));
        expect(topEdge, `${w}x${h}`).toBeGreaterThanOrEqual(8 + 44 + 2);
      }
    }
  });

  it('dikey: düğmeler ekranın içinde (sağ/sol kenar), can/açlık + eşya çubuğunun (≥ 100 px) üstünde', () => {
    for (const [w, h] of PHONES_PORT) {
      const cs = touchScale(w, h, true);
      for (const c of combos()) {
        const { anchor, buttons } = buildTouchLayout({ ...c, portrait: true });
        buttons.forEach((b) => {
          const s = Math.max(44, b.size * cs);
          const centerFromRight = 10 + (anchor.edge - b.bx) * cs;
          expect(w - centerFromRight - s / 2, `${w}x${h} ${b.id} sol kenar`).toBeGreaterThanOrEqual(0);
          expect(anchor.bottom + b.by * cs + s / 2, `${w}x${h} ${b.id} üst`).toBeLessThan(h - 52 - 44);
          if (b.id === 'portalMode') expect(anchor.bottom + b.by * cs - s / 2, `${w}x${h} alt`).toBeGreaterThanOrEqual(100);
        });
      }
    }
  });

  it('görsel düğme boyutu 44 px altına inmez (CSS max(44px, …)) ve portalMode düğmesi aynı .kx-tbtn sınıfını kullanır', () => {
    const touchCss = read('kesifTouch.css');
    expect(touchCss).toMatch(/--s: max\(44px, calc\(var\(--bs\) \* var\(--kx-cs, 1\) \* 1px\)\);/);
    const tc = read('TouchControls.jsx');
    expect(tc).toContain("dimension: LuOrbit");
    expect(tc).toMatch(/className="kx-tbtn"/);
  });
});

describe('cityHud.css sözleşmesi', () => {
  const css = read('city/cityHud.css');

  it('yükleme paneli: tam ekran, HUD (20) üstünde, yükleme ekranı (70) ve pencerelerin (80) altında; tıklamayı engellemez', () => {
    const m = /\.kcl-scrim \{([^}]*)\}/.exec(css);
    expect(m).toBeTruthy();
    expect(m[1]).toMatch(/position: absolute;/);
    expect(m[1]).toMatch(/inset: 0;/);
    expect(m[1]).toMatch(/pointer-events: none;/);
    const z = Number(/z-index: (\d+)/.exec(m[1])[1]);
    expect(z).toBeGreaterThan(20);
    expect(z).toBeLessThan(70);
    const play = read('../../../pages/game/kesif/kesifPlay.css');
    expect(Number(/\.kxp-loading \{[^}]*z-index: (\d+)/.exec(play)[1])).toBeGreaterThan(z);
    expect(Number(/\.kxp-dialogs \{[^}]*z-index: (\d+)/.exec(play)[1])).toBeGreaterThan(z);
  });

  it('kart telefon genişliğine sığar (min(100%, 27rem)) ve kısa yatay ekranda sıkışır (simge gizli)', () => {
    expect(css).toMatch(/\.kcl-card \{[^}]*width: min\(100%, 27rem\);[^}]*max-height: 100%;/);
    const short = mediaBlocks(css, '(orientation: landscape) and (max-height: 460px)');
    expect(short).toHaveLength(1);
    expect(short[0].body).toMatch(/\.kcl-ico \{\s*display: none;/);
  });

  it('hareket azaltma: dönen simge, kayan çubuk ve giriş animasyonu kapanır (medya sorgusu + data-reduced)', () => {
    const rm = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}\n/.exec(css);
    expect(rm).toBeTruthy();
    expect(rm[1]).toMatch(/\.kcl-ico/);
    expect(rm[1]).toMatch(/animation: none;/);
    expect(css).toMatch(/\.kcl-scrim\[data-reduced='1'\] \.kcl-ico/);
    // yanıp sönme yok: en hızlı animasyon 1.5 sn (≤ 3 Hz sınırının çok altında)
    const durations = [...css.matchAll(/animation:[^;]*?([\d.]+)(m?s)/g)].map((x) => (x[2] === 'ms' ? Number(x[1]) / 1000 : Number(x[1])));
    expect(durations.length).toBeGreaterThan(0);
    durations.forEach((d) => expect(d).toBeGreaterThanOrEqual(0.26));
  });

  it('erişilebilirlik modu: opak zemin, büyük yazı', () => {
    expect(css).toMatch(/\.kcl-scrim\[data-a11y='1'\] \.kcl-card \{[^}]*background: rgb\(6, 8, 14\);/);
    expect(css).toMatch(/\.kcl-scrim\[data-a11y='1'\] \{[^}]*font-size: 1\.12em;/);
  });

  it('ışık ipucu şekli ≥ 16 px (şekil okunur); dokunmatikte bölge adı 2 satıra kırılır (… ile kesilmez)', () => {
    const shape = /\.kx-clight-shape \{([^}]*)\}/.exec(css)[1];
    expect(px(shape, 'width')).toBeGreaterThanOrEqual(16);
    expect(px(shape, 'height')).toBeGreaterThanOrEqual(16);
    expect(css).toMatch(/\.kx-root\[data-touch='1'\] \.kx-cchip \.kx-chip-zone > span:not\(\.kx-cwx\) \{[^}]*-webkit-line-clamp: 2;[^}]*white-space: normal;/);
  });

  it('dokunmatik düğme: dimension simgesi basılı (data-lock) durumda renk + parıltı ile ayrışır', () => {
    expect(css).toMatch(/\.kx-tbtn\[data-icon='dimension'\]\[data-lock='1'\] \{[^}]*border-color: var\(--kc-pink\);/);
  });

  it('Nasıl Oynanır sekme çubuğu üç seçenek tek sırada; düğmeler ≥ 44 px', () => {
    expect(css).toMatch(/\.kx-ht-bar \.kx-seg-row\[data-cols='3'\] \{\s*grid-template-columns: repeat\(3, 1fr\);/);
    expect(px(/\.kx-ht-bar \.kx-seg-row\[data-cols='3'\] \.kx-seg-btn \{([^}]*)\}/.exec(css)[1], 'min-height')).toBeGreaterThanOrEqual(44);
  });

  it('cityHud.css kesif.css giriş dosyasına dokunmaz: bileşenler kendi stilini içe aktarır', () => {
    expect(read('city/CityHud.jsx')).toContain("import './cityHud.css';");
    expect(read('city/LoadingOverlay.jsx')).toContain("import './cityHud.css';");
    expect(read('kesif.css')).not.toContain('cityHud');
  });
});
