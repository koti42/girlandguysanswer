import { describe, expect, it } from 'vitest';
import {
  ABILITY_META,
  bossPhase,
  bubbleStates,
  deathMessage,
  fmtCoord,
  formatClock,
  formatDuration,
  iconStates,
  isGameplayUi,
  itemIsRanged,
  itemLabel,
  parkourTier,
  parseHint,
  parseQuestLine,
  timeKind,
  weatherKind,
} from '../kxHudUtils.js';
import { buildTouchLayout, touchScale } from '../kxTouchLayout.js';
import { DEFAULT_KESIF_SETTINGS, normalizeKesifSettings, sanitizePatch } from '../kxSettings.js';
import { createAnnouncer, eventToAnnouncement } from '../kesifAnnouncer.js';
import { drawMinimap, mapBounds } from '../kxMinimapDraw.js';

describe('kxHudUtils', () => {
  it('iconStates: yarım puan = yarım simge, üst sınır uygulanır', () => {
    expect(iconStates(5, 6)).toEqual(['full', 'full', 'half']);
    expect(iconStates(0, 4)).toEqual(['empty', 'empty']);
    expect(iconStates(20, 20)).toHaveLength(10);
    expect(iconStates(999, 999, 20)).toHaveLength(20);
    expect(iconStates(NaN, 20).every((s) => s === 'empty')).toBe(true);
  });

  it('bubbleStates: tam oksijende 10 dolu, bitince hepsi boş', () => {
    expect(bubbleStates(15).every((s) => s === 'full')).toBe(true);
    expect(bubbleStates(0).every((s) => s === 'empty')).toBe(true);
    const mid = bubbleStates(7.5);
    expect(mid.filter((s) => s === 'full')).toHaveLength(5);
  });

  it('parseHint tuş ve metni ayırır', () => {
    expect(parseHint("[E] Kol'u çek")).toEqual({ key: 'E', text: "Kol'u çek" });
    expect(parseHint('Sandık')).toEqual({ key: null, text: 'Sandık' });
    expect(parseHint('   ')).toBeNull();
    expect(parseHint(null)).toBeNull();
  });

  it('biçimlendirme: saat, süre, koordinat', () => {
    expect(formatClock(83.456)).toBe('1:23.45');
    expect(formatClock(-3)).toBe('0:00.00');
    expect(formatDuration(8130)).toBe('2 sa 15 dk');
    expect(formatDuration(95)).toBe('1 dk 35 sn');
    expect(formatDuration(7)).toBe('7 sn');
    expect(fmtCoord(-12.4)).toBe('−12');
    expect(fmtCoord(-0.2)).toBe('0');
  });

  it('timeKind / weatherKind Türkçe değerleri tanır', () => {
    expect(timeKind('gece')).toBe('night');
    expect(timeKind('gün batımı')).toBe('sunset');
    expect(timeKind('şafak')).toBe('sunrise');
    expect(timeKind('gündüz')).toBe('day');
    expect(weatherKind('kar yağışı')).toBe('snow');
    expect(weatherKind('yağmur')).toBe('rain');
    expect(weatherKind('')).toBe('');
  });

  it('eşya adı ve uzak menzil bilgisi eşya tablosundan gelir', () => {
    expect(itemLabel('item:yay')).toBe('Yay');
    expect(itemLabel('item:bilinmeyen_sey')).toBe('bilinmeyen sey');
    expect(itemLabel('')).toBe('');
    expect(itemIsRanged('item:yay')).toBe(true);
    expect(itemIsRanged('item:kazma_demir')).toBe(false);
    expect(itemIsRanged(null)).toBe(false);
  });

  it('bossPhase can azaldıkça artar', () => {
    expect(bossPhase(100, 100)).toBe(1);
    expect(bossPhase(60, 100)).toBe(2);
    expect(bossPhase(20, 100)).toBe(3);
    expect(bossPhase(0, 100)).toBe(3);
    expect(bossPhase(5, 0)).toBe(1);
  });

  it('parseQuestLine tamamlanmış satırı işaretler', () => {
    expect(parseQuestLine('✓ Tezgah yap')).toEqual({ done: true, text: 'Tezgah yap' });
    expect(parseQuestLine('[x] Kazma')).toEqual({ done: true, text: 'Kazma' });
    expect(parseQuestLine('☐ Maden bul')).toEqual({ done: false, text: 'Maden bul' });
    expect(parseQuestLine(5)).toEqual({ done: false, text: '' });
  });

  it('deathMessage çocuk dostu cümleler üretir', () => {
    expect(deathMessage({ cause: 'fall' })).toBe('Çok yüksekten düştün.');
    expect(deathMessage({ cause: 'mob', by: 'Gölge' })).toBe('Gölge seni yendi.');
    expect(deathMessage('Özel neden')).toBe('Özel neden');
    expect(deathMessage(null)).toBe('Bitkin düştün.');
  });

  it('deathMessage motorun Türkçe ölüm nedenlerini de tanır (varsayılana düşmez)', () => {
    expect(deathMessage({ cause: 'düşme' })).toBe('Çok yüksekten düştün.');
    expect(deathMessage({ cause: 'boğulma' })).toBe('Nefesin tükendi.');
    expect(deathMessage({ cause: 'açlık' })).toBe('Açlıktan bitkin düştün.');
    expect(deathMessage({ cause: 'boşluk' })).toBe('Dünyanın dışına düştün.');
    expect(deathMessage({ cause: 'lav' })).toBe('Lavın içine düştün.');
    expect(deathMessage({ cause: 'yaratık', by: 'Gölge' })).toBe('Gölge seni yendi.');
    expect(deathMessage({ cause: 'yaratık' })).toBe('Bir yaratık seni yendi.');
    expect(deathMessage({ cause: 'kaktüs' })).toContain('Kaktüs');
    expect(deathMessage({ cause: 'ok', by: 'Kemikçi' })).toBe('Kemikçi seni oklarıyla yendi.');
    expect(deathMessage({ cause: 'genel' })).toBe('Bitkin düştün.');
  });

  it('parkur kademesi sınırlanır; yetenek tablosu tam', () => {
    expect(parkourTier(0).name).toBe('Bronz');
    expect(parkourTier(9).name).toBe('Kuantum');
    expect(Object.keys(ABILITY_META)).toEqual(['doubleJump', 'grapple', 'glide', 'portalGun']);
    expect(isGameplayUi('none')).toBe(true);
    expect(isGameplayUi('pause')).toBe(false);
  });
});

describe('kxTouchLayout', () => {
  const dist = (a, b) => Math.hypot(a.bx - b.bx, a.by - b.by);
  const all = { canInteract: true, mode: 'macera', abilities: { doubleJump: true, grapple: true, glide: true, portalGun: true } };

  for (const portrait of [false, true]) {
    it(`düğmeler üst üste binmez (${portrait ? 'dikey' : 'yatay'})`, () => {
      const { buttons } = buildTouchLayout({ ...all, portrait });
      for (let i = 0; i < buttons.length; i++) {
        for (let j = i + 1; j < buttons.length; j++) {
          const min = (buttons[i].size + buttons[j].size) / 2;
          expect(dist(buttons[i], buttons[j]), `${buttons[i].id} / ${buttons[j].id}`).toBeGreaterThanOrEqual(min);
        }
      }
    });

    it(`tüm düğmeler en az 44 px (${portrait ? 'dikey' : 'yatay'})`, () => {
      const { buttons } = buildTouchLayout({ ...all, portrait });
      expect(Math.min(...buttons.map((b) => b.size))).toBeGreaterThanOrEqual(44);
    });
  }

  it('yetenek düğmeleri yalnız açık yeteneklerle çıkar; Etkileş yalnız ipucu varken', () => {
    const none = buildTouchLayout({ abilities: {} }).buttons.map((b) => b.id);
    expect(none).not.toContain('interact');
    expect(none).not.toContain('ability1');
    const some = buildTouchLayout({ abilities: { grapple: true, doubleJump: true }, canInteract: true }).buttons.map((b) => b.id);
    expect(some).toContain('ability1');
    expect(some).toContain('interact');
    expect(some).not.toContain('ability2');
  });

  it('uçuşta zıpla/çömel etiketleri değişir; inşa modunda uç düğmesi var', () => {
    const b = buildTouchLayout({ flying: true, mode: 'insa' }).buttons;
    expect(b.find((x) => x.id === 'jump').label).toBe('Yukarı uç');
    expect(b.find((x) => x.id === 'crouch').label).toBe('Aşağı in');
    expect(b.some((x) => x.name === 'fly')).toBe(true);
  });

  it('abilityButtons eşlemesi varsayılanı ezer', () => {
    const b = buildTouchLayout({ abilities: { grapple: true }, abilityButtons: { grapple: 'ability4' } }).buttons;
    expect(b.some((x) => x.name === 'ability4' && x.ability === 'grapple')).toBe(true);
  });

  it('touchScale sınırlanır', () => {
    expect(touchScale(300, 200, false)).toBe(0.78);
    expect(touchScale(2000, 1200, false)).toBe(1.15);
    expect(touchScale(390, 800, true)).toBe(1);
  });
});

describe('kxSettings', () => {
  it('normalize sınırlar ve bilinmeyeni atar', () => {
    const s = normalizeKesifSettings({ fov: 500, sensitivity: '1.5', quality: 'ultra', invertY: 'evet', hack: 1, viewDist: 2 });
    expect(s.fov).toBe(100);
    expect(s.sensitivity).toBe(1.5);
    expect(s.quality).toBe(DEFAULT_KESIF_SETTINGS.quality);
    expect(s.invertY).toBe(false);
    expect(s.viewDist).toBe(3);
    expect(s.hack).toBeUndefined();
  });

  it('sanitizePatch yalnız geçerli anahtarları geçirir', () => {
    expect(sanitizePatch({ muted: true, fov: 'x', zzz: 1, quality: 'high' })).toEqual({ muted: true, quality: 'high' });
    expect(sanitizePatch(null)).toEqual({});
  });
});

describe('kesifAnnouncer', () => {
  it('olayları Türkçe duyuruya çevirir, gürültülü olayları atar', () => {
    expect(eventToAnnouncement({ type: 'zoneEnter', zone: { name: 'Fısıldayan Ormanlar' } })).toMatchObject({ kind: 'zone', text: 'Fısıldayan Ormanlar' });
    expect(eventToAnnouncement({ type: 'puzzleSolved', puzzleType: 'terazi' })).toMatchObject({ kind: 'puzzle', sub: 'Terazi' });
    expect(eventToAnnouncement({ type: 'crystal', count: 2, total: 3 }).sub).toBe('2 / 3 toplandı');
    expect(eventToAnnouncement({ type: 'ability', key: 'glide' }).sub).toBe('Planör');
    expect(eventToAnnouncement({ type: 'inventoryChanged' })).toBeNull();
    expect(eventToAnnouncement({ type: 'death' })).toBeNull();
    expect(eventToAnnouncement(null)).toBeNull();
  });

  it('kuyruk: sınır, tekrar önleme, kapatma, abonelik', () => {
    let t = 0;
    const a = createAnnouncer({ max: 2, now: () => t });
    let calls = 0;
    const off = a.subscribe(() => calls++);
    const id1 = a.push({ type: 'achievement', title: 'Ağaç dostu' });
    expect(a.push({ type: 'achievement', title: 'Ağaç dostu' })).toBeNull(); // tekrar
    t = 7000;
    a.push({ type: 'puzzleSolved' });
    a.push({ type: 'achievement', title: 'İlk adım' });
    expect(a.get()).toHaveLength(2);
    expect(a.get().some((x) => x.id === id1)).toBe(false);
    const last = a.get()[1].id;
    expect(a.dismiss(last)).toBe(true);
    expect(a.dismiss(last)).toBe(false);
    a.clear();
    expect(a.get()).toHaveLength(0);
    expect(calls).toBeGreaterThanOrEqual(4);
    off();
  });
});

describe('kxMinimapDraw', () => {
  function fakeCtx() {
    const calls = [];
    const proxy = new Proxy(
      {},
      {
        get(_t, name) {
          if (name === 'calls') return calls;
          return (...args) => calls.push([String(name), ...args]);
        },
        set(_t, name, value) {
          calls.push(['set:' + String(name), value]);
          return true;
        },
      }
    );
    return proxy;
  }

  it('mapBounds: size sayı/nesne/yok ve bounds', () => {
    expect(mapBounds({ size: 200 })).toEqual({ minX: -100, minZ: -100, maxX: 100, maxZ: 100 });
    expect(mapBounds({ size: { x: 100, z: 60 } })).toEqual({ minX: -50, minZ: -30, maxX: 50, maxZ: 30 });
    expect(mapBounds({ bounds: { minX: 0, minZ: 1, maxX: 2, maxZ: 3 } })).toEqual({ minX: 0, minZ: 1, maxX: 2, maxZ: 3 });
    const d = mapBounds(null);
    expect(d.maxX).toBeGreaterThan(500);
  });

  it('drawMinimap oyuncu okunu ve işaretleri çizer, bozuk veride düşmez', () => {
    const ctx = fakeCtx();
    const info = {
      zone: { id: 1, name: 'Z' },
      size: 400,
      spawn: { x: 0, z: 0 },
      markers: [
        { type: 'boss', x: 5, z: 5, discovered: true, color: '#f00' },
        { type: 'kule', x: 9999, z: 0, discovered: true, track: true },
        { type: 'gizli', x: 1, z: 1, discovered: false },
        null,
      ],
    };
    drawMinimap(ctx, 100, info, { x: 0, z: 0, yaw: 0.7 }, null, { radiusBlocks: 40, dpr: 1 });
    const names = ctx.calls.map((c) => c[0]);
    expect(names).toContain('clip');
    expect(names.filter((n) => n === 'fillText')).toHaveLength(1);
    expect(names.filter((n) => n === 'arc').length).toBeGreaterThan(3);
    expect(() => drawMinimap(fakeCtx(), 100, null, { x: 0, z: 0, yaw: 0 }, null, { radiusBlocks: 40, dpr: 1 })).not.toThrow();
  });
});
