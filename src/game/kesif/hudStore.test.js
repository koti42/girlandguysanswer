import { describe, expect, it, vi } from 'vitest';
import {
  EMPTY_HUD,
  HUD_LIMITS,
  HUD_UI_STATES,
  clampNum,
  clipStr,
  createHudPublisher,
  createHudStore,
  hudEqual,
  hudSignature,
  isImportantChange,
  sanitizeHud,
} from './hudStore.js';

describe('EMPTY_HUD', () => {
  it('sözleşmedeki her alana güvenli varsayılan verir ve derin donmuştur', () => {
    const keys = [
      'hp', 'maxHp', 'hunger', 'oxygen', 'xpLevel', 'hotbar', 'selected', 'held', 'target', 'coords', 'zone', 'biome',
      'time', 'weather', 'quest', 'boss', 'banner', 'parkour', 'abilities', 'mode', 'cameraMode', 'ui', 'fps',
      'flying', 'sprinting', 'underwater', 'hint',
    ];
    keys.forEach((k) => expect(Object.prototype.hasOwnProperty.call(EMPTY_HUD, k)).toBe(true));
    expect(EMPTY_HUD.hotbar).toHaveLength(9);
    expect(EMPTY_HUD.ui).toBe('none');
    expect(EMPTY_HUD.boss).toBeNull();
    expect(Object.isFrozen(EMPTY_HUD)).toBe(true);
    expect(Object.isFrozen(EMPTY_HUD.hotbar[0])).toBe(true);
    expect(Object.isFrozen(EMPTY_HUD.abilities)).toBe(true);
  });

  it('sanitizeHud({}) EMPTY_HUD ile içerik olarak aynıdır', () => {
    expect(hudEqual(sanitizeHud({}), EMPTY_HUD)).toBe(true);
  });
});

describe('sanitizeHud', () => {
  it('geçersiz girişte EMPTY_HUD döner', () => {
    [null, undefined, 5, 'x', true, []].forEach((v) => expect(sanitizeHud(v)).toBe(EMPTY_HUD));
  });

  it('kopyalar: girişi değiştirmez, belleği paylaşmaz, dönen nesne donuk değildir', () => {
    const input = { hp: 10, hotbar: [{ item: 'blok:taş', count: 3 }], coords: { x: 1, y: 2, z: 3 }, quest: { title: 'a', lines: ['b'] } };
    const copy = JSON.parse(JSON.stringify(input));
    const out = sanitizeHud(input);
    expect(input).toEqual(copy);
    expect(out.hotbar[0]).not.toBe(input.hotbar[0]);
    expect(out.coords).not.toBe(input.coords);
    expect(out.quest.lines).not.toBe(input.quest.lines);
    expect(Object.isFrozen(out)).toBe(false);
  });

  it('aynı nesne değişince yeni kopya yeni değeri taşır (motor nesneyi yeniden kullanır)', () => {
    const h = { hp: 20 };
    const a = sanitizeHud(h);
    h.hp = 7;
    const b = sanitizeHud(h);
    expect(a.hp).toBe(20);
    expect(b.hp).toBe(7);
  });

  it('sayıları sınırlar; NaN/Infinity/metin varsayılana düşer', () => {
    const o = sanitizeHud({ hp: 999, maxHp: 20, hunger: -5, oxygen: Infinity, fps: NaN, xpLevel: 12.9, selected: 55 });
    expect(o.hp).toBe(20);
    expect(o.hunger).toBe(0);
    expect(o.oxygen).toBe(15);
    expect(o.fps).toBe(0);
    expect(o.xpLevel).toBe(12);
    expect(o.selected).toBe(8);
    expect(sanitizeHud({ selected: -3 }).selected).toBe(0);
    expect(sanitizeHud({ hp: 'abc' }).hp).toBe(20);
    expect(sanitizeHud({ hp: '12' }).hp).toBe(12);
  });

  it('hp, maxHp aşamaz; maxHp eksikse hp varsayılanı maxHp olur', () => {
    expect(sanitizeHud({ maxHp: 40, hp: 100 }).hp).toBe(40);
    expect(sanitizeHud({ maxHp: 30 }).hp).toBe(30);
    expect(sanitizeHud({ maxHp: 0 }).maxHp).toBe(1);
    expect(sanitizeHud({ maxHp: 1e9 }).maxHp).toBe(200);
  });

  it('hotbar 9 yuvaya kırpılır/tamamlanır; bozuk yuva boş olur', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ item: 'blok:taş', count: i + 1 }));
    expect(sanitizeHud({ hotbar: many }).hotbar).toHaveLength(9);
    const few = sanitizeHud({ hotbar: [{ item: 'a', count: 2 }] }).hotbar;
    expect(few).toHaveLength(9);
    expect(few[1]).toEqual({ item: null, count: 0 });
    const bad = sanitizeHud({ hotbar: [null, 5, 'x', { item: 5, count: 3 }, { item: 'a', count: 0 }, { item: 'a', count: -4 }, { item: { x: 1 }, count: 2 }] }).hotbar;
    bad.forEach((s) => expect(s).toEqual({ item: null, count: 0 }));
    expect(sanitizeHud({ hotbar: 'abc' }).hotbar).toHaveLength(9);
  });

  it('yuva sayısı 999 ile sınırlı; icon yalnız güvenli şemalar; fazladan alan atılır', () => {
    const s = sanitizeHud({
      hotbar: [
        { item: 'a', count: 5000, icon: 'data:image/png;base64,AAAA', evil: 1, dur: 0.456789 },
        { item: 'b', count: 1, icon: 'javascript:alert(1)' },
        { item: 'c', count: 1, icon: 'data:text/html;base64,AAAA' },
        { item: 'd', count: 1, icon: 'data:image/png;base64,' + 'A'.repeat(HUD_LIMITS.iconMax) },
        { item: 'e', count: 1, dur: 7 },
      ],
    }).hotbar;
    expect(s[0]).toEqual({ item: 'a', count: 999, icon: 'data:image/png;base64,AAAA', dur: 0.457 });
    expect(s[1]).toEqual({ item: 'b', count: 1 });
    expect(s[2].icon).toBeUndefined();
    expect(s[3].icon).toBeUndefined();
    expect(s[4].dur).toBe(1);
  });

  it('dizgiler kırpılır, kontrol karakterleri atılır, nesneler [object Object] olmaz', () => {
    const long = 'ç'.repeat(500);
    const o = sanitizeHud({ biome: long, hint: long, time: 'gün\u0000batımı\n', weather: { a: 1 }, zone: { id: 2, name: 'x\u0007y' } });
    expect(o.biome.length).toBeLessThanOrEqual(40);
    expect(o.biome.endsWith('…')).toBe(true);
    expect(o.hint.length).toBeLessThanOrEqual(HUD_LIMITS.hint);
    expect(o.time).toBe('gün batımı');
    expect(o.weather).toBe('');
    expect(o.zone).toEqual({ id: 2, name: 'x y' });
  });

  it('kırpma vekil çiftin ortasından kesmez', () => {
    const s = '😀'.repeat(50);
    const out = clipStr(s, 9);
    expect(out.length).toBeLessThanOrEqual(9);
    // Yalnız tam emoji çiftleri + üç nokta
    expect(out.replace(/😀/g, '').replace('…', '')).toBe('');
  });

  it('boş/boşluk metinler null ya da varsayılan olur', () => {
    const o = sanitizeHud({ hint: '   ', held: '', banner: { text: '  ' }, target: { name: '' } });
    expect(o.hint).toBeNull();
    expect(o.held).toBeNull();
    expect(o.banner).toBeNull();
    expect(o.target.name).toBeNull();
  });

  it('görev satırları en çok 6, boş satır atılır', () => {
    const o = sanitizeHud({ quest: { title: 'Ağaç kes', lines: ['a', '', 'b', 3, null, 'c', 'd', 'e', 'f', 'g', 'h'] } });
    expect(o.quest.lines).toEqual(['a', 'b', '3', 'c', 'd', 'e']);
    expect(sanitizeHud({ quest: { lines: 'abc' } }).quest.lines).toEqual([]);
  });

  it('boss: hp, maxHp aşamaz; eksik ad "Boss" olur; geçersiz girişte null', () => {
    expect(sanitizeHud({ boss: { name: 'Kök Ana', hp: 900, maxHp: 300 } }).boss).toEqual({ name: 'Kök Ana', hp: 300, maxHp: 300 });
    expect(sanitizeHud({ boss: { hp: -5, maxHp: 100 } }).boss).toEqual({ name: 'Boss', hp: 0, maxHp: 100 });
    expect(sanitizeHud({ boss: 'x' }).boss).toBeNull();
    expect(sanitizeHud({ boss: null }).boss).toBeNull();
  });

  it('banner ve parkour alanları sınırlanır', () => {
    const o = sanitizeHud({
      banner: { text: 'Yeni Bölge', sub: 'Fısıldayan Ormanlar', until: -4 },
      parkour: { timer: 1e9, checkpoint: 3.7, difficulty: 99 },
    });
    expect(o.banner).toEqual({ text: 'Yeni Bölge', sub: 'Fısıldayan Ormanlar', until: 0 });
    expect(o.parkour).toEqual({ timer: 86400, checkpoint: 3, difficulty: 5 });
    expect(sanitizeHud({ parkour: { difficulty: 0 } }).parkour.difficulty).toBe(1);
  });

  it('abilities yalnız bilinen anahtarlar ve tam true değerleri', () => {
    const o = sanitizeHud({ abilities: { doubleJump: true, grapple: 'yes', glide: 1, portalGun: false, hack: true } });
    expect(o.abilities).toEqual({ doubleJump: true, grapple: false, glide: false, portalGun: false });
  });

  it('mode / cameraMode / ui beyaz liste dışında varsayılana döner', () => {
    const o = sanitizeHud({ mode: 'hile', cameraMode: 'drone', ui: '<script>' });
    expect(o.mode).toBe('macera');
    expect(o.cameraMode).toBe('fp');
    expect(o.ui).toBe('none');
    const p = sanitizeHud({ mode: 'insa', cameraMode: 'tp', ui: 'chest' });
    expect([p.mode, p.cameraMode, p.ui]).toEqual(['insa', 'tp', 'chest']);
  });

  it('ui durumları günlük ve zafer ekranını da kabul eder', () => {
    expect(HUD_UI_STATES).toEqual(['none', 'inventory', 'crafting', 'build', 'map', 'pause', 'dead', 'chest', 'journal', 'victory', 'enchant', 'brew', 'machine', 'dialogue', 'vendor', 'garage', 'photo', 'loading']);
    expect(sanitizeHud({ ui: 'journal' }).ui).toBe('journal');
    expect(sanitizeHud({ ui: 'victory' }).ui).toBe('victory');
    expect(sanitizeHud({ ui: 'Journal' }).ui).toBe('none');
  });

  it('bayraklar yalnız tam true olunca true', () => {
    const o = sanitizeHud({ flying: 1, sprinting: 'true', underwater: true });
    expect([o.flying, o.sprinting, o.underwater]).toEqual([false, false, true]);
  });

  it('koordinatlar sınırlı ve 1 ondalık; target.progress 0..1', () => {
    const o = sanitizeHud({ coords: { x: 12.3456, y: 1e12, z: -1e12 }, target: { block: 4, name: 'Taş', progress: 3 } });
    expect(o.coords).toEqual({ x: 12.3, y: 1_000_000, z: -1_000_000 });
    expect(o.target).toEqual({ block: 4, name: 'Taş', progress: 1 });
    expect(sanitizeHud({ target: { block: 'blok:taş', progress: -1 } }).target).toEqual({ block: 'blok:taş', name: null, progress: 0 });
    expect(sanitizeHud({ coords: 'x' }).coords).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('held nesne ya da dizge olabilir', () => {
    expect(sanitizeHud({ held: 'item:kazma_demir' }).held).toBe('item:kazma_demir');
    expect(sanitizeHud({ held: { name: 'Demir Kazma', item: 'item:kazma_demir' } }).held).toBe('Demir Kazma');
    expect(sanitizeHud({ held: 42 }).held).toBe('42');
  });

  it('JSON.stringify ile döngüsel/prototip tuzaklarına dayanıklı', () => {
    const o = { hp: 5 };
    o.self = o;
    o.__proto__ = { polluted: true };
    const out = sanitizeHud(o);
    expect(out.polluted).toBeUndefined();
    expect(out.self).toBeUndefined();
    expect(() => JSON.stringify(out)).not.toThrow();
  });
});

describe('clampNum / hudEqual', () => {
  it('clampNum', () => {
    expect(clampNum(5, 0, 3)).toBe(3);
    expect(clampNum(-1, 0, 3)).toBe(0);
    expect(clampNum(undefined, 0, 3, 2)).toBe(2);
    expect(clampNum(1.23456, 0, 3, 0, 2)).toBe(1.23);
    expect(clampNum(true, 0, 3, 1)).toBe(1);
  });

  it('hudEqual derin karşılaştırır', () => {
    expect(hudEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(hudEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    expect(hudEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(hudEqual([], {})).toBe(false);
    expect(hudEqual(null, {})).toBe(false);
    expect(hudEqual(NaN, NaN)).toBe(true);
  });
});

describe('createHudStore', () => {
  it('başlangıç EMPTY_HUD; set temiz kopya saklar ve abonelere haber verir', () => {
    const s = createHudStore();
    expect(s.get()).toBe(EMPTY_HUD);
    const l = vi.fn();
    const off = s.subscribe(l);
    const hud = { hp: 12, ui: 'inventory' };
    expect(s.set(hud)).toBe(true);
    expect(l).toHaveBeenCalledTimes(1);
    expect(s.get().hp).toBe(12);
    expect(s.get()).not.toBe(hud);
    off();
    s.set({ hp: 3 });
    expect(l).toHaveBeenCalledTimes(1);
  });

  it('içerik aynıysa haber vermez ve kimlik değişmez (aynı nesneyi yeniden kullanan motor)', () => {
    const s = createHudStore();
    const l = vi.fn();
    s.subscribe(l);
    const hud = { hp: 10 };
    s.set(hud);
    const first = s.get();
    expect(s.set(hud)).toBe(false);
    expect(s.get()).toBe(first);
    expect(l).toHaveBeenCalledTimes(1);
    hud.hp = 9;
    s.set(hud);
    expect(s.get()).not.toBe(first);
    expect(l).toHaveBeenCalledTimes(2);
  });

  it('patch ve reset', () => {
    const s = createHudStore();
    s.set({ hp: 5, fps: 60 });
    s.patch({ fps: 30 });
    expect(s.get().hp).toBe(5);
    expect(s.get().fps).toBe(30);
    expect(s.patch(null)).toBe(false);
    s.reset();
    expect(s.get()).toBe(EMPTY_HUD);
  });

  it('hatalı abone diğerlerini engellemez', () => {
    const s = createHudStore();
    const ok = vi.fn();
    s.subscribe(() => {
      throw new Error('x');
    });
    s.subscribe(ok);
    s.set({ hp: 1 });
    expect(ok).toHaveBeenCalled();
  });
});

describe('önemli değişim', () => {
  const base = () => ({ hp: 20, ui: 'none', selected: 0, zone: { id: 0 }, quest: { title: 'a' }, boss: null, banner: null, hint: null });

  it('hudSignature ilkel kopya verir', () => {
    const h = base();
    const sig = hudSignature(h, {});
    h.hp = 1;
    expect(sig.hp).toBe(20);
  });

  it('küçük değişim önemsiz; ui/seçili/boss/duyuru/bölge/görev/ipucu/hasar önemli', () => {
    const sig = hudSignature(base(), {});
    expect(isImportantChange(sig, { ...base(), fps: 60, coords: { x: 5 } })).toBe(false);
    expect(isImportantChange(sig, { ...base(), hp: 21 })).toBe(false);
    expect(isImportantChange(sig, { ...base(), ui: 'pause' })).toBe(true);
    expect(isImportantChange(sig, { ...base(), selected: 3 })).toBe(true);
    expect(isImportantChange(sig, { ...base(), boss: { name: 'x' } })).toBe(true);
    expect(isImportantChange(sig, { ...base(), banner: { text: 'merhaba' } })).toBe(true);
    expect(isImportantChange(sig, { ...base(), zone: { id: 1 } })).toBe(true);
    expect(isImportantChange(sig, { ...base(), quest: { title: 'b' } })).toBe(true);
    expect(isImportantChange(sig, { ...base(), hint: 'ipucu' })).toBe(true);
    expect(isImportantChange(sig, { ...base(), hp: 19 })).toBe(true);
    expect(isImportantChange(null, base())).toBe(true);
    // Yeniden doğuş
    const dead = hudSignature({ ...base(), hp: 0 }, {});
    expect(isImportantChange(dead, { ...base(), hp: 20 })).toBe(true);
  });
});

describe('createHudPublisher', () => {
  function rig(opts) {
    let t = 0;
    const timers = [];
    const published = [];
    const pub = createHudPublisher((h) => published.push(JSON.parse(JSON.stringify(h))), {
      now: () => t,
      setTimer: (fn, ms) => {
        const id = { fn, at: t + ms, live: true };
        timers.push(id);
        return id;
      },
      clearTimer: (id) => {
        id.live = false;
      },
      ...opts,
    });
    const advance = (ms) => {
      t += ms;
      timers.filter((x) => x.live && x.at <= t).forEach((x) => {
        x.live = false;
        x.fn();
      });
    };
    return { pub, published, advance, setT: (v) => (t = v), timers };
  }

  it('ilk push anında yayımlanır; 15 Hz içinde gelenler bekletilir', () => {
    const r = rig();
    const h = { hp: 20, fps: 1 };
    expect(r.pub.push(h)).toBe(true);
    h.fps = 2;
    expect(r.pub.push(h)).toBe(false);
    h.fps = 3;
    expect(r.pub.push(h)).toBe(false);
    expect(r.published).toHaveLength(1);
    expect(r.pub.pending).toBe(true);
  });

  it('bekleyen son durum süre dolunca zamanlayıcıyla yayımlanır (yalnız sonuncusu)', () => {
    const r = rig();
    const h = { hp: 20, fps: 1 };
    r.pub.push(h);
    h.fps = 2;
    r.pub.push(h);
    h.fps = 3;
    r.pub.push(h);
    r.advance(30);
    expect(r.published).toHaveLength(1);
    r.advance(40);
    expect(r.published).toHaveLength(2);
    expect(r.published[1].fps).toBe(3);
    expect(r.pub.pending).toBe(false);
  });

  it('en çok hz kadar yayın: 1 saniyede 60 push ≈ 15 yayın', () => {
    const r = rig();
    const h = { hp: 20, fps: 0 };
    for (let i = 0; i < 60; i++) {
      r.setT(i * (1000 / 60));
      h.fps = i;
      r.pub.push(h);
    }
    expect(r.published.length).toBeGreaterThanOrEqual(14);
    expect(r.published.length).toBeLessThanOrEqual(16);
  });

  it('önemli değişim beklemeden geçer; immediate de', () => {
    const r = rig();
    const h = { hp: 20, ui: 'none' };
    r.pub.push(h);
    h.ui = 'inventory';
    expect(r.pub.push(h)).toBe(true);
    h.hp = 10;
    expect(r.pub.push(h)).toBe(true);
    h.fps = 99;
    expect(r.pub.push(h)).toBe(false);
    expect(r.pub.push(h, { immediate: true })).toBe(true);
    expect(r.published).toHaveLength(4);
  });

  it('flush bekleyeni hemen yayımlar; cancel sonrası hiçbir şey yayımlanmaz', () => {
    const r = rig();
    const h = { fps: 1 };
    r.pub.push(h);
    h.fps = 2;
    r.pub.push(h);
    r.pub.flush();
    expect(r.published.map((p) => p.fps)).toEqual([1, 2]);
    h.fps = 3;
    r.pub.push(h);
    r.pub.cancel();
    r.advance(1000);
    expect(r.published).toHaveLength(2);
    expect(r.pub.push({ hp: 1 })).toBe(false);
    expect(r.published).toHaveLength(2);
  });

  it('hz sınırları: geçersiz hz 15e düşer', () => {
    const r = rig({ hz: NaN });
    r.pub.push({ fps: 1 });
    expect(r.pub.push({ fps: 2 })).toBe(false);
    r.setT(70);
    expect(r.pub.push({ fps: 3 })).toBe(true);
  });
});

describe('büyü HUD alanları (mana, etkiler, büyü, büyülü yuva)', () => {
  it('EMPTY_HUD varsayılanları: mana 0/0, etki yok, büyü yok; ui listesi enchant ve brew içerir', () => {
    expect(EMPTY_HUD.mana).toEqual({ value: 0, max: 0 });
    expect(EMPTY_HUD.effects).toEqual([]);
    expect(EMPTY_HUD.spell).toBe(null);
    expect(HUD_UI_STATES).toContain('enchant');
    expect(HUD_UI_STATES).toContain('brew');
    expect(sanitizeHud({ ui: 'enchant' }).ui).toBe('enchant');
    expect(sanitizeHud({ ui: 'brew' }).ui).toBe('brew');
    expect(sanitizeHud({ ui: 'Brew' }).ui).toBe('none');
  });

  it('mana sınırlanır: değer 0..max, tamsayı, çöp girdi 0/0', () => {
    expect(sanitizeHud({ mana: { value: 37.9, max: 120 } }).mana).toEqual({ value: 37, max: 120 });
    expect(sanitizeHud({ mana: { value: 500, max: 100 } }).mana).toEqual({ value: 100, max: 100 });
    expect(sanitizeHud({ mana: { value: -5, max: 100 } }).mana).toEqual({ value: 0, max: 100 });
    expect(sanitizeHud({ mana: { value: 'x', max: NaN } }).mana).toEqual({ value: 0, max: 0 });
    expect(sanitizeHud({ mana: 7 }).mana).toEqual({ value: 0, max: 0 });
    expect(sanitizeHud({ mana: { value: 5, max: 1e9 } }).mana.max).toBe(1000);
  });

  it('etkiler: en çok 12, simge beyaz listede, süre/oran sınırlı, bilinmeyen simge kalp olur', () => {
    const many = [];
    for (let i = 0; i < 20; i++) many.push({ key: 'e' + i, name: 'Etki ' + i, icon: 'hiz', level: 2, secondsLeft: 30, fraction: 0.5 });
    const h = sanitizeHud({ effects: many });
    expect(h.effects).toHaveLength(HUD_LIMITS.effects);
    const e = sanitizeHud({ effects: [{ key: 'x', name: 'N', icon: 'zzz', level: 99, secondsLeft: 1e9, fraction: 7 }] }).effects[0];
    expect(e.icon).toBe('kalp');
    expect(e.level).toBe(5);
    expect(e.secondsLeft).toBe(3600);
    expect(e.fraction).toBe(1);
    expect(sanitizeHud({ effects: [null, 3, { name: 'anahtarsız' }, { key: '' }] }).effects).toEqual([]);
    expect(sanitizeHud({ effects: 'x' }).effects).toEqual([]);
  });

  it('büyü: alanlar sınırlanır; geçersiz null; hazır yalnız tam true', () => {
    const s = sanitizeHud({ spell: { key: 'ates_topu', name: 'Ateş Topu', manaCost: 12.8, cooldown01: 3, ready: 1 } }).spell;
    expect(s).toEqual({ key: 'ates_topu', name: 'Ateş Topu', manaCost: 12, cooldown01: 1, ready: false });
    expect(sanitizeHud({ spell: { key: 'a', name: 'A', manaCost: 3, cooldown01: 0.25, ready: true } }).spell.ready).toBe(true);
    expect(sanitizeHud({ spell: {} }).spell).toBe(null);
    expect(sanitizeHud({ spell: 'ates' }).spell).toBe(null);
  });

  it('hotbar yuvasında büyü sayısı: 0..6, büyüsüz yuvada alan yok', () => {
    const hb = [{ item: 'item:kılıç_demir', count: 1, ench: 3 }, { item: 'item:taş', count: 2, ench: 0 }, { item: 'item:x', count: 1, ench: 99 }, { item: 'item:y', count: 1, ench: 'z' }];
    const h = sanitizeHud({ hotbar: hb }).hotbar;
    expect(h[0].ench).toBe(3);
    expect('ench' in h[1]).toBe(false);
    expect(h[2].ench).toBe(6);
    expect('ench' in h[3]).toBe(false);
  });

  it('mana/etki değişimi depoya haber verir; aynı içerik vermez', () => {
    const store = createHudStore();
    const fn = vi.fn();
    store.subscribe(fn);
    const base = { mana: { value: 50, max: 100 }, effects: [{ key: 'hiz', name: 'Hız', icon: 'hiz', level: 1, secondsLeft: 60, fraction: 1 }] };
    expect(store.set(base)).toBe(true);
    expect(store.set(JSON.parse(JSON.stringify(base)))).toBe(false);
    expect(store.set({ ...base, mana: { value: 51, max: 100 } })).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
