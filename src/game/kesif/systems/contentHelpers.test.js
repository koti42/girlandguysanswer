import { describe, expect, it } from 'vitest';
import {
  CELL, bearingInfo, cellOfBlock, cellsAround, compassAt, compassLabel, distToRect, inBox, itemName, messageSeconds, normAngle, parseCellId, sameList,
  splitMessage, yawToward, zoneCrystalKey,
} from './contentHelpers.js';
import { createContentFx } from './contentFx.js';

describe('contentHelpers: hücre ve geometri', () => {
  it('cellOfBlock 64 blokluk hücre indeksi (merkez kaydırmalı)', () => {
    expect(cellOfBlock(0)).toBe(0);
    expect(cellOfBlock(31)).toBe(0);
    expect(cellOfBlock(32)).toBe(1);
    expect(cellOfBlock(-32)).toBe(0);
    expect(cellOfBlock(-33)).toBe(-1);
    expect(CELL).toBe(64);
  });

  it('cellsAround yakından uzağa sıralı ve yarıçapla sınırlı', () => {
    const list = cellsAround(0, 0, 160);
    expect(list[0].ci).toBe(0);
    expect(list[0].cj).toBe(0);
    for (let i = 1; i < list.length; i++) expect(list[i].d).toBeGreaterThanOrEqual(list[i - 1].d);
    list.forEach((c) => expect(c.d).toBeLessThanOrEqual(160));
    expect(list.length).toBeGreaterThan(9);
    expect(new Set(list.map((c) => c.key)).size).toBe(list.length);
  });

  it('distToRect / inBox', () => {
    const r = { x0: 0, z0: 0, x1: 10, z1: 10 };
    expect(distToRect(5, 5, r)).toBe(0);
    expect(distToRect(13, 14, r)).toBeCloseTo(5);
    expect(distToRect(-3, 5, r)).toBe(3);
    const b = { x0: 0, y0: 0, z0: 0, x1: 4, y1: 4, z1: 4 };
    expect(inBox(b, 2, 2, 2)).toBe(true);
    expect(inBox(b, 9, 2, 2)).toBe(false);
    expect(inBox(b, 6, 2, 2, 2)).toBe(true);
  });

  it('parseCellId', () => {
    expect(parseCellId('parkur:3,-4')).toEqual({ type: 'parkur', ci: 3, cj: -4 });
    expect(parseCellId('x')).toBeNull();
    expect(parseCellId('turbe:1,2#3')).toBeNull();
  });

  it('normAngle ve sameList', () => {
    expect(Math.abs(normAngle(Math.PI * 3))).toBeCloseTo(Math.PI, 5);
    expect(normAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2, 5);
    expect(sameList([1, 2], [1, 2])).toBe(true);
    expect(sameList([1, 2], [1, 3])).toBe(false);
    expect(sameList(null, [])).toBe(false);
  });
});

describe('contentHelpers: yön ve metin', () => {
  it('yawToward fizik sözleşmesiyle uyumlu (yaw 0 = −Z)', () => {
    expect(yawToward(0, -1)).toBeCloseTo(0);
    expect(yawToward(-1, 0)).toBeCloseTo(Math.PI / 2); // −X = sola
    expect(yawToward(1, 0)).toBeCloseTo(-Math.PI / 2);
  });

  it('compassLabel: kuzey = −Z, doğu = +X', () => {
    expect(compassLabel(0, -10)).toBe('kuzey');
    expect(compassLabel(10, 0)).toBe('doğu');
    expect(compassLabel(0, 10)).toBe('güney');
    expect(compassLabel(-10, 0)).toBe('batı');
    expect(compassLabel(10, -10)).toBe('kuzeydoğu');
    expect(compassLabel(-10, 10)).toBe('güneybatı');
    expect(compassLabel(0, 0)).toBe('tam burada');
  });

  it('compassAt Türkçe bulunma hâli', () => {
    expect(compassAt('kuzey')).toBe('kuzeyde');
    expect(compassAt('güney')).toBe('güneyde');
    expect(compassAt('doğu')).toBe('doğuda');
    expect(compassAt('kuzeybatı')).toBe('kuzeybatıda');
  });

  it('bearingInfo: göreli açı ve taraf', () => {
    // yaw 0: −Z'ye bakıyor; hedef tam önde
    let b = bearingInfo(0, 0, 0, 0, -100);
    expect(b.side).toBe('karşında');
    expect(b.dist).toBeCloseTo(100);
    expect(b.text).toContain('100 blok kuzeyde');
    // hedef −X'te: bakışa göre solda
    b = bearingInfo(0, 0, 0, -100, 0);
    expect(b.relYaw).toBeGreaterThan(0);
    expect(b.side).toBe('solunda');
    b = bearingInfo(0, 0, 0, 100, 0);
    expect(b.side).toBe('sağında');
    b = bearingInfo(0, 0, 0, 0, 100);
    expect(b.side).toBe('arkanda');
    expect(bearingInfo(0, 0, 0, 2, 2).text).toBe('çok yakında');
  });

  it('splitMessage cümle sınırlarında böler; kısa metin tek parça', () => {
    expect(splitMessage('Merhaba dünya.', 150)).toEqual(['Merhaba dünya.']);
    expect(splitMessage('', 150)).toEqual([]);
    const long = 'Birinci cümle burada biter. İkinci cümle biraz daha uzundur ama hâlâ makul. Üçüncü cümle de var: ve onu da ekleyelim ki toplam uzunluk sınırı aşılsın. Dördüncü!';
    const parts = splitMessage(long, 80);
    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((p) => expect(p.length).toBeLessThanOrEqual(80));
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(long);
  });

  it('splitMessage cümlesiz çok uzun metni kelime sınırında keser', () => {
    const t = 'kelime '.repeat(60).trim();
    const parts = splitMessage(t, 100);
    parts.forEach((p) => expect(p.length).toBeLessThanOrEqual(100));
    expect(parts.join(' ')).toBe(t);
  });

  it('messageSeconds sınırlı', () => {
    expect(messageSeconds('a')).toBe(2.6);
    expect(messageSeconds('x'.repeat(1000))).toBe(7);
  });

  it('itemName ve zoneCrystalKey', () => {
    expect(zoneCrystalKey(2)).toBe('item:anahtar_kristali_z2');
    expect(itemName('item:anahtar_kristali_z0')).toContain('Anahtar Kristali');
    expect(itemName('item:yok_boyle_bir_sey')).toBe('item:yok_boyle_bir_sey');
  });
});

function fakeG() {
  return {
    hud: { banner: null, hint: null },
    speak: (t) => { fakeG.spoken.push(t); },
    publishHud: () => {},
    callbacks: { onEvent: (e) => { fakeG.events.push(e); } },
    sound: (n, p, o) => { fakeG.sounds.push([n, p, o]); },
    particles: { magicBurst: (p, c) => { fakeG.fx.push(['magicBurst', p.x, c]); }, blockBreak: (id, p) => { fakeG.fx.push(['blockBreak', id, p.y]); } },
  };
}
fakeG.spoken = [];
fakeG.events = [];
fakeG.sounds = [];
fakeG.fx = [];

describe('contentFx: ileti kuyruğu, duyuru, ses/parçacık', () => {
  it('uzun iletiyi sırayla gösterir; aynı ileti tekrar eklenmez', () => {
    fakeG.spoken.length = 0;
    const G = fakeG();
    const fx = createContentFx(G);
    fx.message('Kısa ileti.');
    expect(fx.current()).toBeNull(); // kare ilerleyene dek gösterilmez
    fx.frame(0.016);
    expect(fx.current()).toBe('Kısa ileti.');
    fx.message('Kısa ileti.'); // 1,5 sn içinde yinelenmez
    fx.frame(2.8);
    expect(fx.current()).toBeNull();
    fx.message('Bir. '.repeat(40));
    fx.frame(0.016);
    expect(fx.current().length).toBeLessThanOrEqual(150);
    expect(fakeG.spoken.length).toBe(2);
  });

  it('banner süresi dolunca temizlenir; duraklatılmışken (dt=0) ilerlemez', () => {
    const G = fakeG();
    const fx = createContentFx(G);
    fx.banner('Başlık', 'alt', 50);
    expect(G.hud.banner.text).toBe('Başlık');
    fx.frame(0);
    expect(G.hud.banner).not.toBeNull();
    const until = G.hud.banner.until;
    expect(until).toBeGreaterThan(Date.now() - 5);
    G.hud.banner.until = Date.now() - 1;
    fx.frame(0.016);
    expect(G.hud.banner).toBeNull();
  });

  it('announce onEvent\'e {type:"announce"} gönderir; hata yutulur', () => {
    fakeG.events.length = 0;
    const G = fakeG();
    const fx = createContentFx(G);
    fx.announce('discover', 'Metin', 'alt');
    expect(fakeG.events[0]).toEqual({ type: 'announce', kind: 'discover', text: 'Metin', sub: 'alt' });
    G.callbacks.onEvent = () => { throw new Error('x'); };
    expect(() => fx.announce('info', 'a')).not.toThrow();
  });

  it('parçacık yalnız beyaz listedeki adlarla; geçersiz konumda sessizce atlar', () => {
    fakeG.fx.length = 0;
    const G = fakeG();
    const fx = createContentFx(G);
    fx.particles('magicBurst', 1, 2, 3, 0xff0000);
    fx.particles('bilinmeyenEfekt', 1, 2, 3);
    fx.particles('magicBurst', NaN, 2, 3);
    expect(fakeG.fx).toEqual([['magicBurst', 1, 0xff0000]]);
    fx.blockDust(5, 10, 20, 30);
    expect(fakeG.fx[1][0]).toBe('blockBreak');
    expect(fakeG.fx[1][2]).toBeCloseTo(20.5);
  });

  it('ses: konumlu ve konumsuz', () => {
    fakeG.sounds.length = 0;
    const G = fakeG();
    const fx = createContentFx(G);
    fx.sound('lever', 1, 2, 3, 0.7);
    fx.sound('ui_click');
    expect(fakeG.sounds[0][0]).toBe('lever');
    expect(fakeG.sounds[0][1]).toEqual({ x: 1, y: 2, z: 3 });
    expect(fakeG.sounds[0][2]).toEqual({ pitch: 0.7 });
    expect(fakeG.sounds[1][1]).toBeUndefined();
  });
});
