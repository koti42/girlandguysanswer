import { describe, expect, it, vi } from 'vitest';
import { KIND_PRIORITY, STARTUP_MS, createAnnouncer, eventToAnnouncement } from '../kesifAnnouncer.js';

function make(opts) {
  const clock = { t: 1000 };
  const a = createAnnouncer({ now: () => clock.t, ...(opts || {}) });
  return { a, clock };
}

const QUEST = { type: 'questUpdate', title: 'Odun topla', done: false };
const QUEST_DONE = { type: 'questUpdate', title: 'Odun topla', done: true };
const DISCOVER = { type: 'discover', name: 'Çayır' };
const ZONE0 = { type: 'zoneEnter', zone: { name: 'Başlangıç Vadisi' } };

describe('kesifAnnouncer başlangıç sakinliği', () => {
  it('ilk 6 sn: Görev güncellendi, Keşfettin ve ilk bölge girişi toast olarak GÖRÜNMEZ (yığılma yok)', () => {
    const { a, clock } = make();
    a.begin();
    expect(a.push(QUEST)).toBeNull();
    expect(a.push(DISCOVER)).toBeNull();
    expect(a.push(ZONE0)).toBeNull();
    clock.t += 3000;
    expect(a.push({ type: 'questUpdate', title: 'Tezgah yap' })).toBeNull();
    expect(a.get()).toHaveLength(0);
  });

  it('süre bitince ertelenen keşif tek duyuru olarak bırakılır (en sonuncusu)', () => {
    const { a, clock } = make();
    a.begin();
    a.push({ type: 'discover', name: 'Orman' });
    a.push(DISCOVER);
    expect(a.get()).toHaveLength(0);
    clock.t += STARTUP_MS + 50;
    expect(a.tick()).not.toBeNull();
    expect(a.get()).toHaveLength(1);
    expect(a.get()[0]).toMatchObject({ kind: 'discover', sub: 'Çayır' });
    expect(a.tick()).toBeNull(); // bir kez
  });

  it('zamanlayıcı ertelenen keşfi kendiliğinden bırakır', () => {
    vi.useFakeTimers();
    try {
      const clock = { t: 0 };
      const a = createAnnouncer({ now: () => clock.t });
      a.begin();
      a.push(DISCOVER);
      clock.t = STARTUP_MS + 100;
      vi.advanceTimersByTime(STARTUP_MS + 100);
      expect(a.get().map((x) => x.kind)).toEqual(['discover']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('önemli olaylar (başarım, mühür) başlangıçta da geçer', () => {
    const { a } = make();
    a.begin();
    expect(a.push({ type: 'achievement', title: 'İlk adım' })).not.toBeNull();
    expect(a.push({ type: 'zoneUnlocked', zone: { name: 'Fısıldayan Ormanlar' } })).not.toBeNull();
    expect(a.get()).toHaveLength(2);
  });

  it('başlangıçtan sonra bölge girişi ve görev güncellemesi normal çalışır', () => {
    const { a, clock } = make();
    a.begin();
    a.push(ZONE0);
    clock.t += STARTUP_MS + 1;
    expect(a.push({ type: 'zoneEnter', zone: { name: 'Fısıldayan Ormanlar' } })).not.toBeNull();
    expect(a.push(QUEST)).not.toBeNull();
    expect(a.get()).toHaveLength(2);
  });

  it('begin() çağrılmazsa süre ilk push ile başlar; begin() sayacı sıfırlar', () => {
    const { a, clock } = make();
    expect(a.push(QUEST)).toBeNull(); // ilk push süreyi başlattı
    clock.t += STARTUP_MS + 10;
    expect(a.push({ type: 'questUpdate', title: 'Yeni görev' })).not.toBeNull();
    a.clear();
    a.begin();
    expect(a.push({ type: 'questUpdate', title: 'Başka görev' })).toBeNull();
  });
});

describe('kesifAnnouncer kuyruk kuralları', () => {
  const settled = () => {
    const m = make();
    m.a.begin();
    m.clock.t += STARTUP_MS + 1;
    return m;
  };

  it('aynı anda en çok 2 duyuru görünür; taşan en düşük öncelikliyi (eşitte en eskiyi) düşürür', () => {
    const { a } = settled();
    a.push({ type: 'crystal', count: 1, total: 3 }); // 4
    a.push({ type: 'puzzleSolved', puzzleType: 'terazi' }); // 3
    a.push({ type: 'achievement', title: 'Gezgin' }); // 3: bulmaca (eski, eşit) düşer
    expect(a.get().map((x) => x.kind)).toEqual(['crystal', 'achievement']);
    a.push({ type: 'bossDefeated', boss: 'Kök Ana' }); // 7: başarım düşer
    expect(a.get().map((x) => x.kind)).toEqual(['crystal', 'boss']);
    expect(a.get()).toHaveLength(2);
  });

  it('düşük öncelikli yeni duyuru, dolu yüksek öncelikli kuyruğa girmez', () => {
    const { a } = settled();
    a.push({ type: 'bossDefeated', boss: 'Kök Ana' });
    a.push({ type: 'zoneUnlocked', zone: { name: 'Yanık Kanyonlar' } });
    expect(a.push({ type: 'achievement', title: 'Hevesli' })).toBeNull();
    expect(a.get().map((x) => x.kind).sort()).toEqual(['boss', 'unlock']);
  });

  it('aynı türden keşif/görev duyuruları yığılmaz: yerinde güncellenir', () => {
    const { a } = settled();
    a.push({ type: 'discover', name: 'Orman' });
    const id = a.push({ type: 'discover', name: 'Dağ' });
    expect(a.get()).toHaveLength(1);
    expect(a.get()[0]).toMatchObject({ sub: 'Dağ', id });
    a.push({ type: 'questUpdate', title: 'A' });
    a.push({ type: 'questUpdate', title: 'B' });
    expect(a.get().filter((x) => x.kind === 'quest')).toHaveLength(1);
    expect(a.get().length).toBeLessThanOrEqual(2);
  });

  it('yinelenen duyuru 6 sn içinde tekrarlanmaz, sonra tekrar gösterilir', () => {
    const { a, clock } = settled();
    expect(a.push({ type: 'achievement', title: 'Gezgin' })).not.toBeNull();
    clock.t += 4000;
    expect(a.push({ type: 'achievement', title: 'Gezgin' })).toBeNull();
    clock.t += 3000;
    expect(a.push({ type: 'achievement', title: 'Gezgin' })).not.toBeNull();
  });

  it('görev tamamlandı (done) görev güncellemesinden daha önemlidir', () => {
    expect(eventToAnnouncement(QUEST_DONE)).toMatchObject({ done: true });
    expect(KIND_PRIORITY.quest).toBeLessThan(3);
    const { a } = settled();
    a.push({ type: 'crystal', count: 1, total: 3 });
    a.push({ type: 'crystal', count: 2, total: 3 });
    // dolu (4,4) kuyrukta tamamlanan görev (3) girmez, güncelleme (2) hiç girmez
    expect(a.push(QUEST_DONE)).toBeNull();
    expect(a.push(QUEST)).toBeNull();
  });

  it('abonelik: yalnızca gerçekten değişince bildirir', () => {
    const { a } = settled();
    const fn = vi.fn();
    const off = a.subscribe(fn);
    a.push({ type: 'achievement', title: 'Bir' });
    expect(fn).toHaveBeenCalledTimes(1);
    a.push({ type: 'achievement', title: 'Bir' }); // yinelenen
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });
});
