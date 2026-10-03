/**
 * Jeton Mağazası — Unvanlar, küçük ikonlar ve nadirlik stilleri (SPEC_V2 §F.2/§F.3).
 *
 * SAF VERİ: React/DOM yok. Web (React DOM SVG) ve mobil (react-native-svg)
 * aynı veriyi birebir çizer. Yalnızca F.2'deki tag/prop kümesi kullanılır:
 *   tag:  path | circle | ellipse | rect | g | polygon   (+ defs: linearGradient | radialGradient)
 *   prop: d cx cy r rx ry x y width height points fill stroke strokeWidth
 *         strokeLinecap strokeLinejoin opacity transform
 * Gradyan koordinatları objectBoundingBox (0–1). Renkler hex. transform yalnızca
 * translate(x y) / rotate(a cx cy) / scale(s).
 *
 * TITLES[i].style (platform pill'i):
 *   text       pill metni (platform metni, SVG değil)
 *   colors     2–3 renkli soldan sağa gradyan (her durak textColor ile WCAG AA ≥ 4.5)
 *   textColor  '#FFFFFF' ya da koyu ton
 *   icon       ICONS anahtarı; unvan ikonları o unvanın pill renklerine göre boyanmıştır
 *   anim?      yalnızca epic/legendary: 'shimmer' (pill üzerinde kayan parıltı) | 'pulse'
 *
 * ICONS: 24×24 ikonlar { viewBox, defs?, elements }. defs id'leri dosya genelinde
 * benzersizdir; renderer yine de her örnekte önek ekler (F.2).
 *
 * RARITY: rozet/kart stili. colors gradyanı üzerinde textColor AA geçer;
 * glowColor kart parıltısı/kenarlığı içindir (metin için değil).
 */

/* ---------------------------------------------------------------- yardımcılar */

// 4 köşeli parıltı (yıldız) yolu — yalnızca veri üretir, çalışma anında sabit sonuç.
const n2 = (v) => Math.round(v * 100) / 100;
const sparkle = (cx, cy, s) => {
    const [l, r, t, b] = [n2(cx - s), n2(cx + s), n2(cy - s), n2(cy + s)];
    return `M${cx} ${t}Q${cx} ${cy} ${r} ${cy}Q${cx} ${cy} ${cx} ${b}Q${cx} ${cy} ${l} ${cy}Q${cx} ${cy} ${cx} ${t}Z`;
};

/* ---------------------------------------------------------------- ikonlar */

export const ICONS = {
    /* ===== Unvan ikonları (pill renklerine göre) ===== */

    // Gece Kuşu — lacivert/mor pill, beyaz metin: soluk altın hilal + parıltılar
    moon: {
        viewBox: '0 0 24 24',
        defs: [
            { tag: 'linearGradient', id: 'ic-moon-g', props: { x1: 0, y1: 0, x2: 1, y2: 1 },
              stops: [{ offset: 0, color: '#FFF4CC' }, { offset: 1, color: '#F2C96B' }] },
        ],
        elements: [
            { tag: 'path', props: { d: 'M19.6 15.1A8.4 8.4 0 1 1 9.4 3.6a6.6 6.6 0 0 0 10.2 11.5z', fill: 'url(#ic-moon-g)' } },
            { tag: 'circle', props: { cx: 7.4, cy: 14.6, r: 1.1, fill: '#E3B355', opacity: 0.55 } },
            { tag: 'circle', props: { cx: 10.6, cy: 18, r: 0.8, fill: '#E3B355', opacity: 0.5 } },
            { tag: 'path', props: { d: sparkle(17.2, 5.2, 2.6), fill: '#FFFFFF' } },
            { tag: 'path', props: { d: sparkle(21, 9.6, 1.5), fill: '#FFE7A3' } },
            { tag: 'circle', props: { cx: 13.6, cy: 3.2, r: 0.8, fill: '#FFFFFF', opacity: 0.8 } },
        ],
    },

    // Bilgi Kurdu — zümrüt pill: açık kitap + altın kurdele + minik kurt
    book: {
        viewBox: '0 0 24 24',
        defs: [
            { tag: 'linearGradient', id: 'ic-book-r', props: { x1: 0, y1: 0, x2: 1, y2: 0 },
              stops: [{ offset: 0, color: '#D6F5EE' }, { offset: 1, color: '#FFFFFF' }] },
        ],
        elements: [
            { tag: 'path', props: { d: 'M12 6.8C10 5.2 7 4.6 2.6 5.1v13.4c4.4-.5 7.4.1 9.4 1.6z', fill: '#FFFFFF' } },
            { tag: 'path', props: { d: 'M12 6.8c2-1.6 5-2.2 9.4-1.7v13.4c-4.4-.5-7.4.1-9.4 1.6z', fill: 'url(#ic-book-r)' } },
            { tag: 'path', props: { d: 'M12 6.8v13.3', stroke: '#9ADBCB', strokeWidth: 0.9, strokeLinecap: 'round' } },
            { tag: 'path', props: { d: 'M4.6 9.2c1.8-.2 3.4 0 5 .6M4.6 12c1.8-.2 3.4 0 5 .6M4.6 14.8c1.8-.2 3.4 0 5 .6', fill: 'none', stroke: '#5FB9A6', strokeWidth: 0.9, strokeLinecap: 'round' } },
            { tag: 'polygon', props: { points: '15.6,5.3 15.6,11 17,9.8 18.4,11 18.4,4.9', fill: '#F2B33D' } },
            // minik kitap kurdu sayfanın üstünden bakıyor
            { tag: 'path', props: { d: 'M18.6 15.6c.2-1.2 1.2-1.9 2.1-1.6', fill: 'none', stroke: '#7AD36B', strokeWidth: 1.6, strokeLinecap: 'round' } },
            { tag: 'circle', props: { cx: 21, cy: 13.6, r: 1.3, fill: '#7AD36B' } },
            { tag: 'circle', props: { cx: 21.3, cy: 13.4, r: 0.35, fill: '#0B3B36' } },
        ],
    },

    // Maratoncu — mercan pill, koyu metin: hız çizgili koşu ayakkabısı
    sneaker: {
        viewBox: '0 0 24 24',
        elements: [
            { tag: 'path', props: { d: 'M1.4 9.8h3M.8 12.8h2.8M1.6 15.8h1.8', fill: 'none', stroke: '#3A0D0D', strokeWidth: 1.5, strokeLinecap: 'round' } },
            {
                tag: 'g', props: { transform: 'translate(-1.2 -1.4) scale(1.1)' },
                children: [
                    { tag: 'path', props: { d: 'M6 15.6c0-1.3.7-2 1.7-2.2l2.3-.5 2-3.9c.3-.6 1-.8 1.6-.5l1.2.7c.5.3.7.9.4 1.4l-.4.9 3.4 1.4c1.7.6 4 1.3 4 3.3v.5H6z', fill: '#3A0D0D' } },
                    { tag: 'rect', props: { x: 5.6, y: 16.1, width: 16.8, height: 2.6, rx: 1.3, fill: '#FFFFFF' } },
                    { tag: 'rect', props: { x: 5.6, y: 17.7, width: 16.8, height: 1, rx: 0.5, fill: '#3A0D0D', opacity: 0.25 } },
                    { tag: 'path', props: { d: 'M12.6 11.6l1.3.6M11.9 13l1.3.6M14 10.3l1.2.5', fill: 'none', stroke: '#FFFFFF', strokeWidth: 0.9, strokeLinecap: 'round' } },
                    { tag: 'path', props: { d: 'M7.4 14.6c2.6-.4 5.6.1 8 1', fill: 'none', stroke: '#FFB4A0', strokeWidth: 0.9, strokeLinecap: 'round' } },
                ],
            },
        ],
    },

    // Kule Ustası — mor/magenta pill: üst üste dizilmiş bloklar + altın bayrak
    tower: {
        viewBox: '0 0 24 24',
        defs: [
            { tag: 'linearGradient', id: 'ic-tower-b', props: { x1: 0, y1: 0, x2: 0, y2: 1 },
              stops: [{ offset: 0, color: '#FFFFFF' }, { offset: 1, color: '#E7DBFF' }] },
        ],
        elements: [
            { tag: 'rect', props: { x: 4.4, y: 17, width: 15.2, height: 4.4, rx: 1.1, fill: 'url(#ic-tower-b)' } },
            { tag: 'rect', props: { x: 6.4, y: 12.5, width: 11.6, height: 4.1, rx: 1, fill: 'url(#ic-tower-b)' } },
            { tag: 'rect', props: { x: 7.6, y: 8.3, width: 8.4, height: 3.8, rx: 0.9, fill: 'url(#ic-tower-b)' } },
            { tag: 'rect', props: { x: 4.4, y: 19.6, width: 15.2, height: 1.8, rx: 0.9, fill: '#C4B0F2' } },
            { tag: 'rect', props: { x: 9.4, y: 14, width: 1.8, height: 1.6, rx: 0.4, fill: '#7E22CE', opacity: 0.55 } },
            { tag: 'rect', props: { x: 13.2, y: 14, width: 1.8, height: 1.6, rx: 0.4, fill: '#7E22CE', opacity: 0.55 } },
            { tag: 'rect', props: { x: 11, y: 9.5, width: 1.8, height: 1.6, rx: 0.4, fill: '#7E22CE', opacity: 0.55 } },
            { tag: 'path', props: { d: 'M11.8 8.3V2.4', stroke: '#FFFFFF', strokeWidth: 1.2, strokeLinecap: 'round' } },
            { tag: 'path', props: { d: 'M12.3 2.5l5 1.7-5 1.8z', fill: '#FFD56B', strokeLinejoin: 'round', stroke: '#FFD56B', strokeWidth: 0.6 } },
        ],
    },

    // Soru Avcısı — mavi pill: nişangâh + altın soru işareti
    target: {
        viewBox: '0 0 24 24',
        elements: [
            { tag: 'circle', props: { cx: 12, cy: 12, r: 8.2, fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.8 } },
            { tag: 'circle', props: { cx: 12, cy: 12, r: 5.1, fill: '#FFFFFF', opacity: 0.18 } },
            { tag: 'path', props: { d: 'M12 1.2v4M12 18.8v4M1.2 12h4M18.8 12h4', stroke: '#FFFFFF', strokeWidth: 1.8, strokeLinecap: 'round' } },
            { tag: 'path', props: { d: 'M10 10.2a2.1 2.1 0 1 1 3 1.9c-.6.3-1 .8-1 1.5v.3', fill: 'none', stroke: '#FFD56B', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } },
            { tag: 'circle', props: { cx: 12, cy: 16.1, r: 1, fill: '#FFD56B' } },
        ],
    },

    // Çay Ustası — demli kahve pill: ince belli çay bardağı, tabak, buhar
    tea: {
        viewBox: '0 0 24 24',
        defs: [
            { tag: 'linearGradient', id: 'ic-tea-t', props: { x1: 0, y1: 0, x2: 0, y2: 1 },
              stops: [{ offset: 0, color: '#F0602F' }, { offset: 0.45, color: '#DC3F22' }, { offset: 1, color: '#A82512' }] },
        ],
        elements: [
            { tag: 'path', props: { d: 'M10.4 3.4c-.7-.8.5-1.4-.1-2.2M13.6 3.4c-.7-.8.5-1.4-.1-2.2', fill: 'none', stroke: '#FFFFFF', strokeWidth: 0.9, strokeLinecap: 'round', opacity: 0.7 } },
            { tag: 'ellipse', props: { cx: 12, cy: 20.2, rx: 8, ry: 1.9, fill: '#FFFFFF' } },
            { tag: 'ellipse', props: { cx: 12, cy: 19.8, rx: 5.6, ry: 1.1, fill: '#F2B33D' } },
            { tag: 'path', props: { d: 'M7.6 4.4H16.4C16.3 7.7 14.7 9.7 13.9 11.5C15.1 12.5 15.8 14 15.6 15.8C15.4 17.4 14.3 18.3 12.6 18.3H11.4C9.7 18.3 8.6 17.4 8.4 15.8C8.2 14 8.9 12.5 10.1 11.5C9.3 9.7 7.7 7.7 7.6 4.4Z', fill: '#FFFFFF', opacity: 0.22 } },
            { tag: 'path', props: { d: 'M8.6 6.9H15.4C15 8.9 13.9 10.3 13.2 11.7C14.3 12.6 14.9 14 14.7 15.6C14.5 16.9 13.7 17.4 12.5 17.4H11.5C10.3 17.4 9.5 16.9 9.3 15.6C9.1 14 9.7 12.6 10.8 11.7C10.1 10.3 9 8.9 8.6 6.9Z', fill: 'url(#ic-tea-t)' } },
            { tag: 'path', props: { d: 'M7.6 4.4H16.4C16.3 7.7 14.7 9.7 13.9 11.5C15.1 12.5 15.8 14 15.6 15.8C15.4 17.4 14.3 18.3 12.6 18.3H11.4C9.7 18.3 8.6 17.4 8.4 15.8C8.2 14 8.9 12.5 10.1 11.5C9.3 9.7 7.7 7.7 7.6 4.4Z', fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.2, strokeLinejoin: 'round' } },
            { tag: 'ellipse', props: { cx: 12, cy: 7.1, rx: 3.3, ry: 0.45, fill: '#FF9A6B' } },
            { tag: 'path', props: { d: 'M9.7 7.8c.3 1 .8 1.8 1.3 2.5M9.9 14.2c-.1.8 0 1.5.3 2', fill: 'none', stroke: '#FFFFFF', strokeWidth: 0.8, strokeLinecap: 'round', opacity: 0.8 } },
        ],
    },

    // Meraklı Kedi — pembe/lila pill, koyu metin: yana bakan meraklı kedi
    cat: {
        viewBox: '0 0 24 24',
        elements: [
            { tag: 'path', props: { d: 'M4.6 9.6L5 3.4l4.4 3.4c.9-.2 1.7-.3 2.6-.3s1.7.1 2.6.3L19 3.4l.4 6.2c.9 1.4 1.6 3 1.6 4.6 0 4.2-4 6.8-9 6.8s-9-2.6-9-6.8c0-1.6.7-3.2 1.6-4.6z', fill: '#3B0A2A' } },
            { tag: 'path', props: { d: 'M6.1 5.6l.2 3 2-1.5zM17.9 5.6l-.2 3-2-1.5z', fill: '#F48FB1' } },
            { tag: 'ellipse', props: { cx: 8.8, cy: 13.4, rx: 2, ry: 2.4, fill: '#FFFFFF' } },
            { tag: 'ellipse', props: { cx: 15.2, cy: 13.4, rx: 2, ry: 2.4, fill: '#FFFFFF' } },
            { tag: 'circle', props: { cx: 9.6, cy: 13.1, r: 1.2, fill: '#3B0A2A' } },
            { tag: 'circle', props: { cx: 16, cy: 13.1, r: 1.2, fill: '#3B0A2A' } },
            { tag: 'circle', props: { cx: 10, cy: 12.6, r: 0.4, fill: '#FFFFFF' } },
            { tag: 'circle', props: { cx: 16.4, cy: 12.6, r: 0.4, fill: '#FFFFFF' } },
            { tag: 'path', props: { d: 'M11.1 16.3h1.8l-.9 1z', fill: '#F48FB1', stroke: '#F48FB1', strokeWidth: 0.6, strokeLinejoin: 'round' } },
            { tag: 'path', props: { d: 'M5 16.4l-2.6-.5M5.2 17.8l-2.4.6M19 16.4l2.6-.5M18.8 17.8l2.4.6', stroke: '#3B0A2A', strokeWidth: 0.8, strokeLinecap: 'round' } },
        ],
    },

    // Efsane — altın pill, koyu metin: mücevherli taç
    crown: {
        viewBox: '0 0 24 24',
        defs: [
            { tag: 'linearGradient', id: 'ic-crown-g', props: { x1: 0, y1: 0, x2: 0, y2: 1 },
              stops: [{ offset: 0, color: '#6B4300' }, { offset: 1, color: '#2E1B00' }] },
        ],
        elements: [
            { tag: 'path', props: { d: 'M3 8.6l4.3 3.8L12 4.8l4.7 7.6L21 8.6l-1.7 8.6H4.7z', fill: 'url(#ic-crown-g)', stroke: '#2E1B00', strokeWidth: 0.8, strokeLinejoin: 'round' } },
            { tag: 'rect', props: { x: 4.4, y: 17.6, width: 15.2, height: 2.8, rx: 0.8, fill: '#2E1B00' } },
            { tag: 'path', props: { d: 'M5.6 15.4h12.8', stroke: '#FFE7A3', strokeWidth: 0.8, strokeLinecap: 'round', opacity: 0.7 } },
            { tag: 'circle', props: { cx: 3, cy: 8.6, r: 1.5, fill: '#FF6B6B', stroke: '#2E1B00', strokeWidth: 0.6 } },
            { tag: 'circle', props: { cx: 12, cy: 4.4, r: 1.7, fill: '#FFFFFF', stroke: '#2E1B00', strokeWidth: 0.6 } },
            { tag: 'circle', props: { cx: 21, cy: 8.6, r: 1.5, fill: '#FF6B6B', stroke: '#2E1B00', strokeWidth: 0.6 } },
            { tag: 'polygon', props: { points: '12,17.9 13.2,19 12,20.1 10.8,19', fill: '#FF6B6B' } },
            { tag: 'circle', props: { cx: 7.6, cy: 19, r: 0.6, fill: '#FFE7A3' } },
            { tag: 'circle', props: { cx: 16.4, cy: 19, r: 0.6, fill: '#FFE7A3' } },
            { tag: 'path', props: { d: sparkle(12, 12.2, 2), fill: '#FFE7A3' } },
        ],
    },

    /* ===== Mağaza arayüzü ikonları (açık ve koyu zeminde okunur) ===== */

    // Jeton — koşu oyunundaki altın jetonla aynı palet, kabartma "?"
    jeton: {
        viewBox: '0 0 24 24',
        defs: [
            { tag: 'radialGradient', id: 'ic-jeton-face', props: { cx: 0.4, cy: 0.35, r: 0.65, fx: 0.36, fy: 0.3 },
              stops: [{ offset: 0, color: '#FFF3B0' }, { offset: 0.55, color: '#FFD34D' }, { offset: 1, color: '#D79A1E' }] },
            { tag: 'linearGradient', id: 'ic-jeton-rim', props: { x1: 0, y1: 0, x2: 0, y2: 1 },
              stops: [{ offset: 0, color: '#E8AE2E' }, { offset: 1, color: '#9C5E0A' }] },
        ],
        elements: [
            { tag: 'circle', props: { cx: 12, cy: 12.6, r: 10.6, fill: '#8A5108' } },
            { tag: 'circle', props: { cx: 12, cy: 12, r: 10.6, fill: 'url(#ic-jeton-rim)' } },
            { tag: 'circle', props: { cx: 12, cy: 12, r: 9.2, fill: 'url(#ic-jeton-face)' } },
            { tag: 'circle', props: { cx: 12, cy: 12, r: 7.3, fill: 'none', stroke: '#B8740F', strokeWidth: 1 } },
            // kabartma "?" — gölge + açık üst
            { tag: 'path', props: { d: 'M9.6 9.9a2.6 2.6 0 1 1 3.9 2.2c-.9.5-1.4 1.1-1.4 2v.3', fill: 'none', stroke: '#A8650C', strokeWidth: 2.1, strokeLinecap: 'round', strokeLinejoin: 'round', transform: 'translate(0.4 0.6)' } },
            { tag: 'circle', props: { cx: 12.5, cy: 17.4, r: 1.25, fill: '#A8650C' } },
            { tag: 'path', props: { d: 'M9.6 9.9a2.6 2.6 0 1 1 3.9 2.2c-.9.5-1.4 1.1-1.4 2v.3', fill: 'none', stroke: '#FFF6C8', strokeWidth: 2.1, strokeLinecap: 'round', strokeLinejoin: 'round' } },
            { tag: 'circle', props: { cx: 12.1, cy: 16.8, r: 1.25, fill: '#FFF6C8' } },
            { tag: 'path', props: { d: 'M5.4 8.6a7.4 7.4 0 0 1 4-3.7', fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.1, strokeLinecap: 'round', opacity: 0.75 } },
        ],
    },

    // Profil Çerçevesi kategorisi — altın halka, mercan taş, ortada silüet
    frame: {
        viewBox: '0 0 24 24',
        defs: [
            { tag: 'linearGradient', id: 'ic-frame-ring', props: { x1: 0, y1: 0, x2: 1, y2: 1 },
              stops: [{ offset: 0, color: '#FFE08A' }, { offset: 0.5, color: '#E2B94C' }, { offset: 1, color: '#B07A12' }] },
            { tag: 'linearGradient', id: 'ic-frame-in', props: { x1: 0, y1: 0, x2: 0, y2: 1 },
              stops: [{ offset: 0, color: '#FFE3E3' }, { offset: 1, color: '#FFC4C4' }] },
        ],
        elements: [
            { tag: 'circle', props: { cx: 12, cy: 12.4, r: 7.4, fill: 'url(#ic-frame-in)' } },
            { tag: 'circle', props: { cx: 12, cy: 10.6, r: 2.6, fill: '#FF6B6B' } },
            { tag: 'path', props: { d: 'M7.2 17.4c.9-2.4 2.7-3.6 4.8-3.6s3.9 1.2 4.8 3.6c-1.3 1.3-3 2-4.8 2s-3.5-.7-4.8-2z', fill: '#FF6B6B' } },
            { tag: 'circle', props: { cx: 12, cy: 12.4, r: 8.6, fill: 'none', stroke: 'url(#ic-frame-ring)', strokeWidth: 2.6 } },
            { tag: 'polygon', props: { points: '12,1.2 14,3.8 12,6.3 10,3.8', fill: '#FF6B6B', stroke: '#B07A12', strokeWidth: 0.7, strokeLinejoin: 'round' } },
            { tag: 'circle', props: { cx: 3.4, cy: 12.4, r: 1.2, fill: '#FFF4CC', stroke: '#B07A12', strokeWidth: 0.6 } },
            { tag: 'circle', props: { cx: 20.6, cy: 12.4, r: 1.2, fill: '#FFF4CC', stroke: '#B07A12', strokeWidth: 0.6 } },
        ],
    },

    // Mini Avatar kategorisi — mor çıkartma-yaratık + altın parıltı
    mini: {
        viewBox: '0 0 24 24',
        defs: [
            { tag: 'linearGradient', id: 'ic-mini-g', props: { x1: 0, y1: 0, x2: 0, y2: 1 },
              stops: [{ offset: 0, color: '#9E7BFF' }, { offset: 1, color: '#5B33D6' }] },
        ],
        elements: [
            { tag: 'circle', props: { cx: 6.4, cy: 7.4, r: 3, fill: '#5B33D6' } },
            { tag: 'circle', props: { cx: 17.6, cy: 7.4, r: 3, fill: '#5B33D6' } },
            { tag: 'circle', props: { cx: 6.4, cy: 7.4, r: 1.4, fill: '#FFB4C8' } },
            { tag: 'circle', props: { cx: 17.6, cy: 7.4, r: 1.4, fill: '#FFB4C8' } },
            { tag: 'circle', props: { cx: 12, cy: 13.4, r: 8.6, fill: 'url(#ic-mini-g)' } },
            { tag: 'ellipse', props: { cx: 9, cy: 12.6, rx: 1.3, ry: 1.6, fill: '#FFFFFF' } },
            { tag: 'ellipse', props: { cx: 15, cy: 12.6, rx: 1.3, ry: 1.6, fill: '#FFFFFF' } },
            { tag: 'circle', props: { cx: 9.3, cy: 12.9, r: 0.7, fill: '#24124F' } },
            { tag: 'circle', props: { cx: 15.3, cy: 12.9, r: 0.7, fill: '#24124F' } },
            { tag: 'ellipse', props: { cx: 6.9, cy: 15.6, rx: 1.3, ry: 0.8, fill: '#FF8FA3', opacity: 0.85 } },
            { tag: 'ellipse', props: { cx: 17.1, cy: 15.6, rx: 1.3, ry: 0.8, fill: '#FF8FA3', opacity: 0.85 } },
            { tag: 'path', props: { d: 'M10 16.2c1.1 1.1 2.9 1.1 4 0', fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.2, strokeLinecap: 'round' } },
            { tag: 'path', props: { d: sparkle(20.6, 2.8, 2.2), fill: '#E2B94C' } },
        ],
    },

    // Unvan kategorisi — kuyruklu kurdele afiş + yıldız
    title: {
        viewBox: '0 0 24 24',
        defs: [
            { tag: 'linearGradient', id: 'ic-title-g', props: { x1: 0, y1: 0, x2: 1, y2: 0 },
              stops: [{ offset: 0, color: '#FF8A5B' }, { offset: 1, color: '#FF5C7A' }] },
        ],
        elements: [
            { tag: 'polygon', props: { points: '0.8,10.4 5.2,10.4 5.2,18.6 0.8,18.6 2.6,14.5', fill: '#C93A4E' } },
            { tag: 'polygon', props: { points: '23.2,10.4 18.8,10.4 18.8,18.6 23.2,18.6 21.4,14.5', fill: '#C93A4E' } },
            { tag: 'polygon', props: { points: '5.2,16 5.2,18.6 7.4,16', fill: '#8E2133' } },
            { tag: 'polygon', props: { points: '18.8,16 18.8,18.6 16.6,16', fill: '#8E2133' } },
            { tag: 'rect', props: { x: 3.6, y: 6.2, width: 16.8, height: 9.8, rx: 1.8, fill: 'url(#ic-title-g)' } },
            { tag: 'rect', props: { x: 5.2, y: 6.9, width: 13.6, height: 1.2, rx: 0.6, fill: '#FFFFFF', opacity: 0.3 } },
            { tag: 'polygon', props: { points: '12.00,7.90 12.85,10.13 15.23,10.25 13.38,11.75 14.00,14.05 12.00,12.75 10.00,14.05 10.62,11.75 8.77,10.25 11.15,10.13', fill: '#FFFFFF', stroke: '#FFFFFF', strokeWidth: 0.5, strokeLinejoin: 'round' } },
        ],
    },

    // Mesaj Bileti — çentikli bilet, delikli çizgi, mesaj balonu
    ticket: {
        viewBox: '0 0 24 24',
        defs: [
            { tag: 'linearGradient', id: 'ic-ticket-g', props: { x1: 0, y1: 0, x2: 1, y2: 1 },
              stops: [{ offset: 0, color: '#FF6B6B' }, { offset: 1, color: '#F2A93B' }] },
        ],
        elements: [
            {
                tag: 'g', props: { transform: 'rotate(-10 12 12)' },
                children: [
                    { tag: 'path', props: { d: 'M3.5 6h17A1.5 1.5 0 0 1 22 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 16.5V14a2 2 0 0 0 0-4V7.5A1.5 1.5 0 0 1 3.5 6z', fill: 'url(#ic-ticket-g)', stroke: '#C2410C', strokeWidth: 0.7, strokeLinejoin: 'round' } },
                    { tag: 'rect', props: { x: 15.6, y: 7.2, width: 0.9, height: 1.5, rx: 0.45, fill: '#FFFFFF', opacity: 0.8 } },
                    { tag: 'rect', props: { x: 15.6, y: 10, width: 0.9, height: 1.5, rx: 0.45, fill: '#FFFFFF', opacity: 0.8 } },
                    { tag: 'rect', props: { x: 15.6, y: 12.8, width: 0.9, height: 1.5, rx: 0.45, fill: '#FFFFFF', opacity: 0.8 } },
                    { tag: 'rect', props: { x: 15.6, y: 15.5, width: 0.9, height: 1.5, rx: 0.45, fill: '#FFFFFF', opacity: 0.8 } },
                    { tag: 'path', props: { d: 'M6.4 8.9h6.2c.7 0 1.2.5 1.2 1.2v3.2c0 .7-.5 1.2-1.2 1.2H9.4l-2 1.6v-1.6h-1c-.7 0-1.2-.5-1.2-1.2v-3.2c0-.7.5-1.2 1.2-1.2z', fill: '#FFFFFF' } },
                    { tag: 'circle', props: { cx: 7.6, cy: 11.7, r: 0.6, fill: '#E5484D' } },
                    { tag: 'circle', props: { cx: 9.5, cy: 11.7, r: 0.6, fill: '#E5484D' } },
                    { tag: 'circle', props: { cx: 11.4, cy: 11.7, r: 0.6, fill: '#E5484D' } },
                    { tag: 'path', props: { d: sparkle(18.2, 12, 1.3), fill: '#FFFFFF' } },
                ],
            },
        ],
    },

    // Cüzdan — mor oyun teması, içinden jeton taşıyor
    wallet: {
        viewBox: '0 0 24 24',
        defs: [
            { tag: 'linearGradient', id: 'ic-wallet-g', props: { x1: 0, y1: 0, x2: 1, y2: 1 },
              stops: [{ offset: 0, color: '#7C5CFF' }, { offset: 1, color: '#3B2A9E' }] },
            { tag: 'radialGradient', id: 'ic-wallet-coin', props: { cx: 0.4, cy: 0.35, r: 0.65 },
              stops: [{ offset: 0, color: '#FFF3B0' }, { offset: 0.6, color: '#FFD34D' }, { offset: 1, color: '#D79A1E' }] },
        ],
        elements: [
            { tag: 'circle', props: { cx: 15.4, cy: 6.4, r: 3.8, fill: 'url(#ic-wallet-coin)', stroke: '#B8740F', strokeWidth: 0.8 } },
            { tag: 'circle', props: { cx: 9.4, cy: 7.4, r: 3, fill: 'url(#ic-wallet-coin)', stroke: '#B8740F', strokeWidth: 0.8 } },
            { tag: 'rect', props: { x: 2, y: 8.2, width: 20, height: 13, rx: 2.6, fill: 'url(#ic-wallet-g)' } },
            { tag: 'path', props: { d: 'M4.6 10.4h11', stroke: '#FFFFFF', strokeWidth: 0.8, strokeLinecap: 'round', opacity: 0.35 } },
            { tag: 'rect', props: { x: 14.6, y: 12.2, width: 8.4, height: 5.2, rx: 2.6, fill: '#2A1D78', stroke: '#9E87FF', strokeWidth: 0.7 } },
            { tag: 'circle', props: { cx: 17.6, cy: 14.8, r: 1.3, fill: '#FFD34D' } },
        ],
    },

    // Nadirlik yıldızı
    rarity: {
        viewBox: '0 0 24 24',
        defs: [
            { tag: 'linearGradient', id: 'ic-rarity-g', props: { x1: 0, y1: 0, x2: 0, y2: 1 },
              stops: [{ offset: 0, color: '#FFE89A' }, { offset: 0.55, color: '#F6C343' }, { offset: 1, color: '#E08A1E' }] },
        ],
        elements: [
            { tag: 'polygon', props: { points: '12.00,2.80 14.53,9.32 21.51,9.71 16.09,14.13 17.88,20.89 12.00,17.10 6.12,20.89 7.91,14.13 2.49,9.71 9.47,9.32', fill: 'url(#ic-rarity-g)', stroke: '#C77712', strokeWidth: 1.2, strokeLinejoin: 'round' } },
            { tag: 'polygon', props: { points: '12.00,9.40 12.82,11.47 15.04,11.61 13.33,13.03 13.88,15.19 12.00,14.00 10.12,15.19 10.67,13.03 8.96,11.61 11.18,11.47', fill: '#FFF6D6', opacity: 0.7 } },
        ],
    },

    // Mağaza — mercan alışveriş çantası
    shop: {
        viewBox: '0 0 24 24',
        defs: [
            { tag: 'linearGradient', id: 'ic-shop-g', props: { x1: 0, y1: 0, x2: 0, y2: 1 },
              stops: [{ offset: 0, color: '#FF8A80' }, { offset: 1, color: '#E5484D' }] },
        ],
        elements: [
            { tag: 'path', props: { d: 'M8.4 9.6V6.8a3.6 3.6 0 0 1 7.2 0v2.8', fill: 'none', stroke: '#B4262C', strokeWidth: 1.8, strokeLinecap: 'round' } },
            { tag: 'path', props: { d: 'M4.4 8h15.2l-1.1 12.4c-.1.9-.8 1.6-1.7 1.6H7.2c-.9 0-1.6-.7-1.7-1.6z', fill: 'url(#ic-shop-g)' } },
            { tag: 'rect', props: { x: 4.4, y: 8, width: 15.2, height: 1.8, fill: '#FFFFFF', opacity: 0.25 } },
            { tag: 'circle', props: { cx: 8.4, cy: 11, r: 1, fill: '#7F1D22' } },
            { tag: 'circle', props: { cx: 15.6, cy: 11, r: 1, fill: '#7F1D22' } },
            { tag: 'path', props: { d: sparkle(12, 15.6, 3.2), fill: '#FFE08A' } },
        ],
    },

    // Avatar parçası kategorisi — karakter büstü
    avatar: {
        viewBox: '0 0 24 24',
        defs: [
            { tag: 'linearGradient', id: 'ic-avatar-body', props: { x1: 0, y1: 0, x2: 0, y2: 1 },
              stops: [{ offset: 0, color: '#7C5CFF' }, { offset: 1, color: '#4C33C9' }] },
        ],
        elements: [
            { tag: 'path', props: { d: 'M3.6 22c.6-4.3 3.9-6.9 8.4-6.9s7.8 2.6 8.4 6.9z', fill: 'url(#ic-avatar-body)' } },
            { tag: 'circle', props: { cx: 12, cy: 9.6, r: 5.2, fill: '#F6C9A6' } },
            { tag: 'path', props: { d: 'M6.6 9.4c-.4-3.6 2-6.4 5.4-6.4 3.1 0 5.6 2.2 5.5 5.6-1.9.2-3.8-.5-5.1-2-1.1 1.6-3.3 2.7-5.8 2.8z', fill: '#FF6B6B' } },
            { tag: 'circle', props: { cx: 10, cy: 10.6, r: 0.7, fill: '#3A2130' } },
            { tag: 'circle', props: { cx: 14, cy: 10.6, r: 0.7, fill: '#3A2130' } },
            { tag: 'path', props: { d: 'M10.6 12.8c.8.6 2 .6 2.8 0', fill: 'none', stroke: '#C46A55', strokeWidth: 0.9, strokeLinecap: 'round' } },
            { tag: 'path', props: { d: 'M10.2 15.3l1.8 2 1.8-2', fill: 'none', stroke: '#FFFFFF', strokeWidth: 0.9, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.8 } },
        ],
    },

    // Kilitli
    lock: {
        viewBox: '0 0 24 24',
        defs: [
            { tag: 'linearGradient', id: 'ic-lock-g', props: { x1: 0, y1: 0, x2: 0, y2: 1 },
              stops: [{ offset: 0, color: '#9AA3B8' }, { offset: 1, color: '#5E6680' }] },
        ],
        elements: [
            { tag: 'path', props: { d: 'M8 10.6V8a4 4 0 0 1 8 0v2.6', fill: 'none', stroke: '#7A839A', strokeWidth: 2.2, strokeLinecap: 'round' } },
            { tag: 'rect', props: { x: 4.8, y: 10.2, width: 14.4, height: 11, rx: 2.6, fill: 'url(#ic-lock-g)' } },
            { tag: 'rect', props: { x: 6.8, y: 10.9, width: 10.4, height: 1.3, rx: 0.65, fill: '#FFFFFF', opacity: 0.3 } },
            { tag: 'circle', props: { cx: 12, cy: 14.8, r: 1.7, fill: '#2B3042' } },
            { tag: 'rect', props: { x: 11.2, y: 15.4, width: 1.6, height: 3.2, rx: 0.8, fill: '#2B3042' } },
        ],
    },

    // Sahip / kuşanılmış
    check: {
        viewBox: '0 0 24 24',
        defs: [
            { tag: 'linearGradient', id: 'ic-check-g', props: { x1: 0, y1: 0, x2: 0, y2: 1 },
              stops: [{ offset: 0, color: '#3DDC84' }, { offset: 1, color: '#16A34A' }] },
        ],
        elements: [
            { tag: 'circle', props: { cx: 12, cy: 12, r: 10, fill: 'url(#ic-check-g)' } },
            { tag: 'path', props: { d: 'M7.4 12.4l3.1 3.1 6.1-6.4', fill: 'none', stroke: '#FFFFFF', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } },
        ],
    },

    // Geri sayım (Haftanın Vitrini)
    clock: {
        viewBox: '0 0 24 24',
        elements: [
            { tag: 'rect', props: { x: 10, y: 0.8, width: 4, height: 2.2, rx: 1, fill: '#6D4AFF' } },
            { tag: 'circle', props: { cx: 12, cy: 13.2, r: 9.2, fill: '#6D4AFF' } },
            { tag: 'circle', props: { cx: 12, cy: 13.2, r: 7.2, fill: '#FFFFFF' } },
            { tag: 'path', props: { d: 'M12 13.2V8.6M12 13.2l3 1.9', fill: 'none', stroke: '#2A1D78', strokeWidth: 1.7, strokeLinecap: 'round' } },
            { tag: 'circle', props: { cx: 12, cy: 13.2, r: 1.1, fill: '#FF6B6B' } },
            { tag: 'path', props: { d: 'M12 6.6v1M18.6 13.2h-1M12 19.8v-1M5.4 13.2h1', stroke: '#B9A8FF', strokeWidth: 1.1, strokeLinecap: 'round' } },
        ],
    },

    // Parıltı (vitrin / yeni)
    sparkle: {
        viewBox: '0 0 24 24',
        defs: [
            { tag: 'linearGradient', id: 'ic-sparkle-g', props: { x1: 0, y1: 0, x2: 1, y2: 1 },
              stops: [{ offset: 0, color: '#FFE08A' }, { offset: 1, color: '#E2A01C' }] },
        ],
        elements: [
            { tag: 'path', props: { d: sparkle(10, 13, 9), fill: 'url(#ic-sparkle-g)' } },
            { tag: 'path', props: { d: sparkle(19, 5, 3.6), fill: '#FF6B6B' } },
            { tag: 'circle', props: { cx: 19.6, cy: 18.6, r: 1.4, fill: '#B47CFF' } },
        ],
    },
};

/* ---------------------------------------------------------------- nadirlik */

export const RARITY = {
    common: {
        label: 'Sıradan', order: 0, stars: 1,
        colors: ['#6B7385', '#4B5263'], textColor: '#FFFFFF',
        glow: false, glowColor: '#A3ABBD',
    },
    rare: {
        label: 'Nadir', order: 1, stars: 2,
        colors: ['#2F6FE4', '#1D4BB8'], textColor: '#FFFFFF',
        glow: false, glowColor: '#5AA2FF',
    },
    epic: {
        label: 'Epik', order: 2, stars: 3,
        colors: ['#8B3FE0', '#5B21B6'], textColor: '#FFFFFF',
        glow: true, glowColor: '#B47CFF',
    },
    legendary: {
        label: 'Efsanevi', order: 3, stars: 4,
        colors: ['#FFD86B', '#E2B94C', '#FF6B6B'], textColor: '#2B1600',
        glow: true, glowColor: '#FFC94D',
    },
};

/* ---------------------------------------------------------------- unvanlar */

export const TITLES = [
    {
        id: 'title:gece-kusu', category: 'title', name: 'Gece Kuşu', rarity: 'rare',
        description: 'Herkes uyurken soruların peşinde olanlara. Lacivert gece, soluk altın bir hilal.',
        style: { text: 'Gece Kuşu', colors: ['#2A2470', '#43348F', '#6A48C2'], textColor: '#FFFFFF', icon: 'moon' },
    },
    {
        id: 'title:bilgi-kurdu', category: 'title', name: 'Bilgi Kurdu', rarity: 'rare',
        description: 'Okumadan duramayanlar için: açık kitap, altın kurdele ve sayfadan bakan minik bir kurt.',
        style: { text: 'Bilgi Kurdu', colors: ['#0B4F4A', '#0F766E', '#12805F'], textColor: '#FFFFFF', icon: 'book' },
    },
    {
        id: 'title:maratoncu', category: 'title', name: 'Maratoncu', rarity: 'common',
        description: 'Koşu pistinin vazgeçmeyen yüzü. Mercan rengi enerji, hız çizgili ayakkabı.',
        style: { text: 'Maratoncu', colors: ['#FFB27A', '#FF8A6B', '#FF6B6B'], textColor: '#3A0D0D', icon: 'sneaker' },
    },
    {
        id: 'title:kule-ustasi', category: 'title', name: 'Kule Ustası', rarity: 'epic',
        description: 'Blokları milim milim dizip zirveye çıkanlara. Mor-magenta ışıltı, tepesinde altın bayrak.',
        style: { text: 'Kule Ustası', colors: ['#3B0F7A', '#6D28D9', '#A21CAF'], textColor: '#FFFFFF', icon: 'tower', anim: 'pulse' },
    },
    {
        id: 'title:soru-avcisi', category: 'title', name: 'Soru Avcısı', rarity: 'common',
        description: 'Gözünden hiçbir soru kaçmaz. Derin mavi, nişangâhın ortasında altın bir soru işareti.',
        style: { text: 'Soru Avcısı', colors: ['#1E3A8A', '#1D4ED8', '#0E7490'], textColor: '#FFFFFF', icon: 'target' },
    },
    {
        id: 'title:cay-ustasi', category: 'title', name: 'Çay Ustası', rarity: 'common',
        description: 'Tavşan kanı demleyen, sohbeti koyulaştıran. İnce belli bardak, altın yaldızlı tabak.',
        style: { text: 'Çay Ustası', colors: ['#5A1E0C', '#8A3412', '#A3470E'], textColor: '#FFFFFF', icon: 'tea' },
    },
    {
        id: 'title:merakli-kedi', category: 'title', name: 'Meraklı Kedi', rarity: 'common',
        description: 'Her şeyi bilmek isteyen, her soruya burnunu sokan. Pastel pembe, yana bakan kocaman gözler.',
        style: { text: 'Meraklı Kedi', colors: ['#FBC7DE', '#F5A9D0', '#E7B4F5'], textColor: '#3B0A2A', icon: 'cat' },
    },
    {
        id: 'title:efsane', category: 'title', name: 'Efsane', rarity: 'legendary',
        description: 'Topluluğun en parlak isimlerine. Altından mercana akan ışık, mücevherli taç ve kayan parıltı.',
        style: { text: 'Efsane', colors: ['#FFE08A', '#E2B94C', '#F08A4B'], textColor: '#2B1600', icon: 'crown', anim: 'shimmer' },
    },
];

export default TITLES;
