import { describe, expect, it } from 'vitest';
import { createSwipeRecognizer, SWIPE_THRESHOLD_PX } from './swipe.js';
import { ellipsize, fitText, normalizeText, wrapText } from './textLayout.js';
import { buildQualityLadder, createQualityController, initialPixelRatio } from './quality.js';
import { createFixedStepper, TICK_MS } from './fixedStep.js';
import { baseVerticalFov, cameraFraming, gateNearFade, MAX_VFOV, MIN_VFOV } from './cameraMath.js';
import { clamp, damp, fract, hash32, seededRandom } from './mathUtils.js';
import { CHARACTER_PALETTES, normalizeCharacter } from './palette.js';

/*
 * 3D motorun three'ye dokunmayan saf parçaları. Render tarafı tarayıcıda
 * (Playwright) doğrulandı; burada kuralların kendisi sabitleniyor.
 */

// Sahte ölçüm: her karakter puntonun yarısı kadar geniş.
const measureAt = (size) => (s) => Array.from(s).length * size * 0.5;

describe('kaydırma tanıyıcı', () => {
    it('eşik altında komut üretmez, eşik aşılınca yön verir', () => {
        const sw = createSwipeRecognizer();
        sw.begin(1, 100, 100);
        expect(sw.move(1, 100 + SWIPE_THRESHOLD_PX - 1, 100)).toBeNull();
        expect(sw.move(1, 100 + SWIPE_THRESHOLD_PX + 1, 100)).toBe('R');
    });

    it('dört yönü sim kodlarına çevirir (yukarı = zıpla, aşağı = kay)', () => {
        const dirs = [[-30, 0, 'L'], [30, 0, 'R'], [0, -30, 'J'], [0, 30, 'S']];
        for (const [dx, dy, code] of dirs) {
            const sw = createSwipeRecognizer();
            sw.begin(7, 200, 200);
            expect(sw.move(7, 200 + dx, 200 + dy)).toBe(code);
        }
    });

    it('baskın eksen kazanır (çapraz kaydırma tek komut)', () => {
        const sw = createSwipeRecognizer();
        sw.begin(1, 0, 0);
        expect(sw.move(1, 40, -25)).toBe('R');
    });

    it('uzun tek kaydırma aynı yönde ikinci komut üretmez', () => {
        const sw = createSwipeRecognizer();
        sw.begin(1, 0, 0);
        const out = [];
        for (let x = 10; x <= 200; x += 10) out.push(sw.move(1, x, 0));
        expect(out.filter(Boolean)).toEqual(['R']);
    });

    it('parmak kalkmadan yön değişimi yeni komut üretir (yeniden çapa)', () => {
        const sw = createSwipeRecognizer();
        sw.begin(1, 0, 0);
        expect(sw.move(1, 30, 0)).toBe('R');
        expect(sw.move(1, 32, 20)).toBeNull();
        expect(sw.move(1, 32, 60)).toBe('S');
        expect(sw.move(1, 0, 60)).toBe('L');
    });

    it('parmak kaldırılınca aynı yönde yeniden kaydırılabilir', () => {
        const sw = createSwipeRecognizer();
        sw.begin(1, 0, 0);
        expect(sw.move(1, 30, 0)).toBe('R');
        sw.end(1);
        sw.begin(2, 0, 0);
        expect(sw.move(2, 30, 0)).toBe('R');
    });

    it('ikinci parmak yok sayılır', () => {
        const sw = createSwipeRecognizer();
        sw.begin(1, 0, 0);
        sw.begin(2, 500, 500);
        expect(sw.move(2, 600, 500)).toBeNull();
        expect(sw.move(1, -40, 0)).toBe('L');
        sw.end(2);
        expect(sw.isTracking()).toBe(true);
        sw.reset();
        expect(sw.isTracking()).toBe(false);
    });
});

describe('kapı metni satır kaydırma', () => {
    it('kontrol karakterlerini ve fazla boşluğu temizler', () => {
        expect(normalizeText('  Ankara\n\t ve​  İzmir‮ ')).toBe('Ankara ve İzmir');
        expect(normalizeText(null)).toBe('');
        expect(normalizeText(42)).toBe('42');
    });

    it('kelime sınırından kaydırır, Türkçe karakterleri korur', () => {
        const lines = wrapText('Çağlayan Şişli Üsküdar Ğ', 10 * 5, measureAt(10));
        expect(lines).toEqual(['Çağlayan', 'Şişli', 'Üsküdar Ğ']);
        expect(lines.join(' ')).toBe('Çağlayan Şişli Üsküdar Ğ');
    });

    it('satıra sığmayan tek kelimeyi harf harf böler', () => {
        const lines = wrapText('Muvaffakiyetsizleştiricileştiriveremeyebileceklerimizdenmişsinizcesine', 100, measureAt(20));
        expect(lines.length).toBeGreaterThan(1);
        for (const l of lines) expect(measureAt(20)(l)).toBeLessThanOrEqual(100);
        expect(lines.join('')).toBe('Muvaffakiyetsizleştiricileştiriveremeyebileceklerimizdenmişsinizcesine');
    });

    it('kısa metin en büyük puntoda tek satır kalır', () => {
        const r = fitText('Ankara', { maxWidth: 400, maxLines: 3, maxSize: 80, minSize: 30, measure: (s, z) => measureAt(z)(s) });
        expect(r).toEqual({ size: 80, lines: ['Ankara'], truncated: false });
    });

    it('uzun metin sığana kadar küçülür', () => {
        const text = 'Gökyüzündeki yıldızların ışığı bize ulaşana kadar geçen süre';
        const r = fitText(text, { maxWidth: 400, maxLines: 3, maxSize: 80, minSize: 30, measure: (s, z) => measureAt(z)(s) });
        expect(r.size).toBeLessThan(80);
        expect(r.lines.length).toBeLessThanOrEqual(3);
        expect(r.truncated).toBe(false);
        for (const l of r.lines) expect(measureAt(r.size)(l)).toBeLessThanOrEqual(400);
    });

    it('en küçük puntoda da sığmazsa kesip üç nokta koyar', () => {
        const text = 'kelime '.repeat(80);
        const r = fitText(text, { maxWidth: 200, maxLines: 3, maxSize: 60, minSize: 30, measure: (s, z) => measureAt(z)(s) });
        expect(r.size).toBe(30);
        expect(r.lines).toHaveLength(3);
        expect(r.truncated).toBe(true);
        expect(r.lines[2].endsWith('…')).toBe(true);
        for (const l of r.lines) expect(measureAt(30)(l)).toBeLessThanOrEqual(200);
    });

    it('uzun kelimeyi bölmek yerine küçültür (Süleymaniye Camii)', () => {
        // Eski davranış: 80 puntoda 'Süleymani' / 'ye Camii'.
        const text = 'Süleymaniye Camii';
        const r = fitText(text, { maxWidth: 400, maxLines: 3, maxSize: 80, minSize: 30, measure: (s, z) => measureAt(z)(s) });
        expect(r.truncated).toBe(false);
        expect(r.size).toBeLessThan(80);
        expect(r.lines.join(' ').split(' ')).toEqual(text.split(' '));
        for (const name of ['Kahramanmaraş', 'Afyonkarahisar']) {
            const f = fitText(name, { maxWidth: 400, maxLines: 3, maxSize: 80, minSize: 30, measure: (s, z) => measureAt(z)(s) });
            expect(f.lines).toEqual([name]);
        }
    });

    it('maxHeight verilince satırlar alana dikey olarak sığar', () => {
        const maxHeight = 190;
        const text = 'Bir iki üç dört beş altı';
        const opts = { maxWidth: 400, maxLines: 3, maxSize: 80, minSize: 30, measure: (s, z) => measureAt(z)(s) };
        const r = fitText(text, { ...opts, maxHeight, lineHeight: 1.12 });
        expect(r.truncated).toBe(false);
        expect(r.lines.length * r.size * 1.12).toBeLessThanOrEqual(maxHeight);
        expect(r.lines.join(' ')).toBe(text);
        // Yükseklik sınırı olmadan daha büyük puntoda 3 satır alanı taşardı.
        const loose = fitText(text, opts);
        expect(loose.lines.length * loose.size * 1.12).toBeGreaterThan(maxHeight);
    });

    it('en küçük puntoda bile sığmayan tek kelime yine harf harf bölünür', () => {
        const word = 'Muvaffakiyetsizleştiricileştiriveremeyebileceklerimiz';
        const r = fitText(word, { maxWidth: 200, maxLines: 3, maxSize: 60, minSize: 30, measure: (s, z) => measureAt(z)(s) });
        expect(r.size).toBe(30);
        for (const l of r.lines) expect(measureAt(30)(l)).toBeLessThanOrEqual(200);
    });

    it('boş metin boş satır listesi döner', () => {
        const r = fitText('   ', { maxWidth: 200, maxLines: 3, maxSize: 60, minSize: 30, measure: (s, z) => measureAt(z)(s) });
        expect(r.lines).toEqual([]);
    });

    it('ellipsize sığan satıra dokunmaz', () => {
        expect(ellipsize('kısa', 100, measureAt(10))).toBe('kısa');
        const cut = ellipsize('çok uzun bir satır burada', 60, measureAt(10));
        expect(cut.endsWith('…')).toBe(true);
        expect(measureAt(10)(cut)).toBeLessThanOrEqual(60);
    });
});

describe('uyarlamalı kalite', () => {
    const feed = (q, ms, totalMs) => {
        let changed = null;
        for (let t = 0; t < totalMs; t += ms) {
            const r = q.sample(ms);
            if (r != null) changed = r;
        }
        return changed;
    };

    it('başlangıç oranı min(dpr, 2)', () => {
        expect(initialPixelRatio(3)).toBe(2);
        expect(initialPixelRatio(1.5)).toBe(1.5);
        expect(initialPixelRatio(undefined)).toBe(1);
        expect(initialPixelRatio(-2)).toBe(1);
    });

    it('akıcı karede oranı korur', () => {
        const q = createQualityController({ dpr: 2 });
        expect(feed(q, 16.7, 20000)).toBeNull();
        expect(q.ratio).toBe(2);
    });

    it('orta yavaşlıkta (20-24 ms) kademeli düşürür, 1.0 altına inmez', () => {
        const q = createQualityController({ dpr: 3 });
        feed(q, 22, 30000);
        expect(q.ratio).toBe(1);
        expect(q.lite).toBe(false);
    });

    it('1.0da hâlâ 24 ms üstündeyse düşük kademeye (0.85 → 0.75, lite) iner', () => {
        const q = createQualityController({ dpr: 3 });
        const seen = [];
        for (let t = 0; t < 40000; t += 30) {
            const r = q.sample(30);
            if (r != null) seen.push([r, q.lite]);
        }
        expect(seen).toEqual([
            [1.75, false],
            [1.5, false],
            [1.25, false],
            [1, false],
            [0.85, true],
            [0.75, true],
        ]);
        expect(q.ratio).toBe(0.75);
        expect(q.lite).toBe(true);
    });

    it('kademe merdiveni: dpr 1 → 1, 0.85, 0.75; dpr 1 altındaysa taban dpr, yalnızca lite', () => {
        expect(buildQualityLadder(1)).toEqual([
            { ratio: 1, lite: false },
            { ratio: 0.85, lite: true },
            { ratio: 0.75, lite: true },
        ]);
        expect(buildQualityLadder(0.8)).toEqual([
            { ratio: 0.8, lite: false },
            { ratio: 0.75, lite: true },
        ]);
        expect(buildQualityLadder(0.5)).toEqual([
            { ratio: 0.5, lite: false },
            { ratio: 0.5, lite: true },
        ]);
        expect(buildQualityLadder(1.5).map((l) => l.ratio)).toEqual([1.5, 1.25, 1, 0.85, 0.75]);
    });

    it('çok yavaşken (> 40 ms) iki kademe birden iner, merdiven sonunda durur', () => {
        const q = createQualityController({ dpr: 2 });
        const seen = [];
        for (let t = 0; t < 30000; t += 50) {
            const r = q.sample(50);
            if (r != null) seen.push(r);
        }
        expect(seen).toEqual([1.5, 1, 0.75]);
        expect(q.lite).toBe(true);
    });

    it('dpr 1 altındaysa tabanı dpr; yavaşsa oran aynı kalıp lite açılır (değişim bildirilir)', () => {
        const q = createQualityController({ dpr: 0.75 });
        expect(feed(q, 40, 20000)).toBe(0.75);
        expect(q.ratio).toBe(0.75);
        expect(q.lite).toBe(true);
    });

    it('çok yavaş cihazda (her kare > 100 ms) yine de düşürür; tekil takılma sayılmaz', () => {
        const q = createQualityController({ dpr: 1 });
        feed(q, 160, 20000);
        expect(q.ratio).toBe(0.75);
        expect(q.lite).toBe(true);
        const r = createQualityController({ dpr: 1 });
        for (let i = 0; i < 2000; i++) r.sample(i % 2 === 0 ? 250 : 16.7);
        expect(r.ratio).toBe(1);
    });

    it('düşük kademeden rahatlayınca en fazla 2 kez yükselir; geri yavaşlarsa kilitlenir', () => {
        const q = createQualityController({ dpr: 1 });
        feed(q, 30, 8000); // 1 -> 0.85 -> 0.75
        expect(q.ratio).toBe(0.75);
        feed(q, 16, 12000);
        expect(q.ratio).toBe(0.85);
        expect(q.lite).toBe(true);
        feed(q, 16, 12000);
        expect(q.ratio).toBe(1);
        expect(q.lite).toBe(false);
        feed(q, 30, 2200); // yükseltmeden hemen sonra yavaş -> düş ve kilitle
        expect(q.ratio).toBe(0.85);
        expect(q.locked).toBe(true);
        feed(q, 16, 60000);
        expect(q.ratio).toBe(0.85);
        expect(q.lite).toBe(true);
    });

    it('düşük kademede 20-24 ms arası titreşim üretmez (ne iner ne çıkar)', () => {
        const q = createQualityController({ dpr: 1 });
        feed(q, 30, 3500); // 1 -> 0.85
        expect(q.ratio).toBe(0.85);
        const changes = [];
        for (let i = 0; i < 3000; i++) {
            const r = q.sample(i % 2 ? 23 : 21);
            if (r != null) changes.push(r);
        }
        expect(changes).toEqual([]);
        expect(q.ratio).toBe(0.85);
    });

    it('ısınma süresi ve tekil takılmalar ölçüme girmez', () => {
        const q = createQualityController({ dpr: 2 });
        q.warmup(1000);
        for (let i = 0; i < 20; i++) q.sample(45); // ısınma (900 ms)
        for (let i = 0; i < 300; i++) q.sample(i % 50 === 0 ? 400 : 16.7);
        expect(q.ratio).toBe(2);
    });

    it('düşürdükten sonra uzun süre rahatsa bir kademe yükseltir; titreşirse kilitlenir', () => {
        const q = createQualityController({ dpr: 2 });
        feed(q, 25, 4000); // 2 -> 1.75 (ısınma + bir pencere)
        expect(q.ratio).toBe(1.75);
        feed(q, 16, 15000);
        expect(q.ratio).toBe(2);
        feed(q, 25, 1600); // yükseltme hemen yavaşlattı -> düş ve kilitle
        expect(q.ratio).toBe(1.75);
        feed(q, 16, 60000);
        expect(q.ratio).toBe(1.75);
    });

    it('geçersiz kare süresini yok sayar', () => {
        const q = createQualityController({ dpr: 2 });
        expect(q.sample(NaN)).toBeNull();
        expect(q.sample(-5)).toBeNull();
        expect(q.sample(0)).toBeNull();
    });
});

describe('sabit zaman adımı', () => {
    it('gerçek zamandan hızlı adım atmaz', () => {
        const st = createFixedStepper();
        let steps = 0;
        for (let i = 0; i < 600; i++) steps += st.advance(7); // 4.2 sn, 144 Hz ekran
        expect(steps).toBeLessThanOrEqual(Math.floor((600 * 7) / TICK_MS) + 1);
        expect(steps).toBeGreaterThanOrEqual(Math.floor((600 * 7) / TICK_MS) - 1);
    });

    it('uzun kareyi 250 ms ile sınırlar (sekme dönüşünde sıçrama yok)', () => {
        const st = createFixedStepper();
        expect(st.advance(5000)).toBe(15);
        expect(st.alpha).toBeGreaterThanOrEqual(0);
        expect(st.alpha).toBeLessThan(1);
    });

    it('alpha iki tick arası konumu verir; reset biriktiriciyi sıfırlar', () => {
        const st = createFixedStepper();
        expect(st.advance(TICK_MS / 2)).toBe(0);
        expect(st.alpha).toBeCloseTo(0.5, 5);
        st.reset();
        expect(st.alpha).toBe(0);
        expect(st.advance(NaN)).toBe(0);
        expect(st.advance(-100)).toBe(0);
    });
});

describe('kamera görüş açısı', () => {
    it('yatay ekranda alt sınır, çok dikey ekranda üst sınır', () => {
        expect(baseVerticalFov(16 / 9)).toBe(MIN_VFOV);
        expect(baseVerticalFov(390 / 844)).toBe(MAX_VFOV);
    });

    it('oran daraldıkça FOV büyür ve sınırlar içinde kalır', () => {
        let prev = 0;
        for (const a of [2, 1.5, 1.2, 1, 0.8, 0.6, 0.4]) {
            const v = baseVerticalFov(a);
            expect(v).toBeGreaterThanOrEqual(prev);
            expect(v).toBeGreaterThanOrEqual(MIN_VFOV);
            expect(v).toBeLessThanOrEqual(MAX_VFOV);
            prev = v;
        }
        expect(baseVerticalFov(0)).toBeGreaterThanOrEqual(MIN_VFOV);
        expect(baseVerticalFov(NaN)).toBeGreaterThanOrEqual(MIN_VFOV);
    });
});

describe('kamera kadrajı ve kapı erimesi', () => {
    it('yatay ekranda kadraj değişmez (masaüstü/yatay mobil)', () => {
        for (const a of [16 / 9, 844 / 390, 1]) {
            expect(cameraFraming(a)).toEqual({ pk: 0, back: 5.4, height: 3.2, lookAhead: 9, lookY: 1.25, fovOffset: 0, kick: 7 });
        }
    });

    it('dikeyde kamera yükselir, yaklaşır, aşağı bakar ve FOV daralır', () => {
        const f = cameraFraming(390 / 844);
        expect(f.pk).toBe(1);
        expect(f.height).toBeGreaterThan(4);
        expect(f.back).toBeLessThan(5.4);
        expect(f.lookY).toBeLessThan(f.height / 2);
        expect(f.fovOffset).toBeLessThan(0);
        expect(cameraFraming(360 / 740)).toEqual(f);
        // Ara oranlar iki uç arasında; geçersiz oran yatay sayılır, out nesnesine yazar.
        const mid = cameraFraming(0.75);
        expect(mid.height).toBeGreaterThan(3.2);
        expect(mid.height).toBeLessThan(f.height);
        const out = {};
        expect(cameraFraming(NaN, out)).toBe(out);
        expect(out.pk).toBe(0);
    });

    it('kapı kameraya yaklaştıkça erir: uzakta 1, kameraya 1.5 m kala 0, arada azalan', () => {
        expect(gateNearFade(20)).toBe(1);
        expect(gateNearFade(5)).toBe(1);
        expect(gateNearFade(1.5)).toBe(0);
        expect(gateNearFade(-3)).toBe(0);
        let prev = 1;
        for (let d = 5; d >= 1.5; d -= 0.25) {
            const v = gateNearFade(d);
            expect(v).toBeLessThanOrEqual(prev);
            prev = v;
        }
        expect(gateNearFade(NaN)).toBe(1);
        expect(gateNearFade(4, 6.5, 2)).toBeCloseTo(0.417, 2);
    });
});

describe('matematik ve palet yardımcıları', () => {
    it('clamp, fract ve damp', () => {
        expect(clamp(5, 0, 1)).toBe(1);
        expect(clamp(-5, 0, 1)).toBe(0);
        expect(fract(-0.25)).toBeCloseTo(0.75, 10);
        expect(damp(0, 10, 1000, 1)).toBeCloseTo(10, 5);
        expect(damp(0, 10, 0, 1)).toBe(0);
    });

    it('hash32 belirlenimci ve 32 bit; seededRandom [0,1)', () => {
        expect(hash32(123)).toBe(hash32(123));
        expect(hash32(123)).not.toBe(hash32(124));
        expect(hash32(-1)).toBeGreaterThanOrEqual(0);
        expect(hash32(-1)).toBeLessThan(2 ** 32);
        const a = seededRandom(9);
        const b = seededRandom(9);
        for (let i = 0; i < 100; i++) {
            const v = a();
            expect(v).toBe(b());
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('karakter girdisi güvenli varsayılana düşer', () => {
        expect(normalizeCharacter({ body: 'erkek', palette: 2 })).toEqual({ body: 'erkek', palette: 2 });
        expect(normalizeCharacter({ body: 'robot', palette: 9 })).toEqual({ body: 'kiz', palette: 0 });
        expect(normalizeCharacter({ palette: '1' })).toEqual({ body: 'kiz', palette: 1 });
        expect(normalizeCharacter(null)).toEqual({ body: 'kiz', palette: 0 });
        expect(normalizeCharacter({ palette: 1.5 })).toEqual({ body: 'kiz', palette: 0 });
        expect(CHARACTER_PALETTES).toHaveLength(4);
    });
});
