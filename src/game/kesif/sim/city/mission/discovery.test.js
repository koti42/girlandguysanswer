import { describe, expect, it } from 'vitest';
import { getCityPlan } from '../cityPlan.js';
import { citySeed } from '../cityPlanTestKit.js';
import { COUNTS, STORY_FRAGMENTS } from './missionData.js';
import {
  buildDiscovery, chipBits, countChips, countGraffiti, countRooms, decodeBits, discoveredMarkers, emptyDiscovery, encodeBits, hasChip, hasGraffiti, hasRoom,
  inVaultTrigger, journalChips, journalGraffiti, journalRooms, journalStory, markChip, markRoom, newSets, paintGraffiti, roomAt, sanitizeDiscovery, setStatus, storyUnlocked,
} from './discovery.js';

describe('keşif kataloğu', () => {
  it('240 çip, 90 grafiti, 30 gizli oda, 16 terminal; kimlikler 0..n-1 ve benzersiz konumlar (20 tohum)', () => {
    for (let i = 0; i < 20; i++) {
      const seed = citySeed(i);
      const cat = buildDiscovery(seed);
      expect(buildDiscovery(seed)).toBe(cat);
      expect(cat.chips).toHaveLength(COUNTS.chips);
      expect(cat.graffiti).toHaveLength(COUNTS.graffiti);
      expect(cat.rooms).toHaveLength(COUNTS.rooms);
      expect(cat.terminals).toHaveLength(COUNTS.terminals);
      cat.chips.forEach((c, k) => {
        expect(c.id).toBe(k);
        expect(Number.isFinite(c.x + c.y + c.z)).toBe(true);
        expect(['cati', 'kanal', 'kapi', 'park']).toContain(c.kind);
      });
      expect(new Set(cat.chips.map((c) => c.x + ',' + c.y + ',' + c.z)).size).toBe(COUNTS.chips);
      expect(new Set(cat.graffiti.map((g) => g.cx.toFixed(2) + ',' + g.cy + ',' + g.cz.toFixed(2))).size).toBe(COUNTS.graffiti);
      expect(new Set(cat.rooms.map((r) => r.id)).size).toBe(COUNTS.rooms);
      expect(new Set(cat.rooms.map((r) => Math.round(r.x) + ',' + Math.round(r.z))).size).toBe(COUNTS.rooms);
      expect(cat.graffiti.filter((g) => g.where === 'kanal')).toHaveLength(18);
      expect(cat.graffiti.filter((g) => g.where === 'sokak')).toHaveLength(72);
      const by = {};
      cat.chips.forEach((c) => { by[c.kind] = (by[c.kind] || 0) + 1; });
      expect(by.cati).toBe(60);
      expect(by.kanal).toBe(40);
      expect((by.kapi || 0) + (by.park || 0)).toBe(140);
      expect(cat.vault && cat.vault.trigger).toBeTruthy();
    }
  });

  it('belirlenimci: aynı tohum aynı katalog; farklı tohum farklı çip konumları', () => {
    const a = buildDiscovery(citySeed(1));
    const b = buildDiscovery(citySeed(2));
    expect(a.chips.map((c) => c.x).join()).not.toBe(b.chips.map((c) => c.x).join());
    const plan = getCityPlan(citySeed(1));
    expect(a.terminals[0].x).toBe(plan.terminals[0].x);
  });

  it('yakınlık dizini kaba kuvvetle aynı sonucu verir', () => {
    const cat = buildDiscovery(citySeed(3));
    const out = [];
    for (let t = 0; t < 40; t++) {
      const x = ((t * 97) % 1400) - 700;
      const z = ((t * 53) % 1400) - 700;
      const r = 25 + (t % 5) * 20;
      cat.nearChips(x, z, r, out);
      const want = [];
      cat.chips.forEach((c, i) => { if ((c.x - x) ** 2 + (c.z - z) ** 2 <= r * r) want.push(i); });
      expect(out.slice().sort((p, q) => p - q)).toEqual(want);
      cat.nearGraffiti(x, z, r, out);
      const wantG = [];
      cat.graffiti.forEach((c, i) => { if ((c.x - x) ** 2 + (c.z - z) ** 2 <= r * r) wantG.push(i); });
      expect(out.slice().sort((p, q) => p - q)).toEqual(wantG);
    }
  });

  it('gizli odalar kanalizasyondadır (y 31) ve tetikleyici kutusu merkezi içerir; Kasa tetikleyicisi derinde', () => {
    const cat = buildDiscovery(citySeed(4));
    cat.rooms.forEach((r) => {
      expect(['tarayici', 'dugme', 'kod']).toContain(r.unlock);
      expect(roomAt(cat, r.x, r.y, r.z)).toBe(r);
      expect(roomAt(cat, r.x, r.y + 30, r.z)).toBeNull();
    });
    const unl = {};
    cat.rooms.forEach((r) => { unl[r.unlock] = (unl[r.unlock] || 0) + 1; });
    expect(unl).toEqual({ tarayici: 12, dugme: 9, kod: 9 });
    const a = cat.vault.anchor;
    expect(inVaultTrigger(cat, a.x, a.y, a.z)).toBe(true);
    expect(inVaultTrigger(cat, 0, 64, 0)).toBe(false);
  });
});

describe('keşif durumu', () => {
  it('çip bit kümesi gidiş-dönüş; bilinmeyen/negatif/aşırı dizinler güvenli', () => {
    const ds = emptyDiscovery();
    expect(ds.chips).toHaveLength(60);
    expect(markChip(ds, 0)).toBe(true);
    expect(markChip(ds, 0)).toBe(false);
    expect(markChip(ds, 239)).toBe(true);
    expect(markChip(ds, 240)).toBe(false);
    expect(markChip(ds, -1)).toBe(false);
    expect(markChip(ds, 1.5)).toBe(false);
    expect(hasChip(ds, 0)).toBe(true);
    expect(hasChip(ds, 1)).toBe(false);
    expect(countChips(ds)).toBe(2);
    const bits = decodeBits(ds.chips, COUNTS.chips);
    expect(encodeBits(bits, COUNTS.chips)).toBe(ds.chips);
    expect(chipBits(ds)[239]).toBe(1);
  });

  it('grafiti: tek sefer, kalıp/renk sınırlanır; oda bit kümesi', () => {
    const ds = emptyDiscovery();
    expect(paintGraffiti(ds, 5, 2, 3)).toBe(true);
    expect(paintGraffiti(ds, 5, 1, 1)).toBe(false);
    expect(paintGraffiti(ds, 90, 0, 0)).toBe(false);
    expect(paintGraffiti(ds, 6, 99, -4)).toBe(true);
    expect(ds.graffiti[6]).toEqual([5, 0]);
    expect(hasGraffiti(ds, 5)).toBe(true);
    expect(countGraffiti(ds)).toBe(2);
    expect(markRoom(ds, 29)).toBe(true);
    expect(markRoom(ds, 29)).toBe(false);
    expect(markRoom(ds, 30)).toBe(false);
    expect(hasRoom(ds, 29)).toBe(true);
    expect(countRooms(ds)).toBe(1);
  });

  it('sanitize: bozuk girdi atmaz, sınırlar uygulanır, prototip güvenli', () => {
    const bad = [null, 1, 'x', [], { chips: 5, graffiti: [], rooms: 'a', sets: -3, story: 999, shops: 'z' }, JSON.parse('{"graffiti":{"__proto__":[1,1],"3":[9,9],"x":[1,1],"500":[1,1]},"shops":["a_b","__proto__","BÜYÜK",1,"x y"]}')];
    bad.forEach((b) => {
      const s = sanitizeDiscovery(b);
      expect(s.chips).toHaveLength(60);
      expect(Object.getPrototypeOf(s.graffiti)).toBe(Object.prototype);
      expect(s.rooms).toBeGreaterThanOrEqual(0);
      expect(s.story).toBeLessThanOrEqual(STORY_FRAGMENTS.length);
    });
    const s = sanitizeDiscovery(bad[5]);
    expect(s.graffiti[3]).toEqual([5, 7]);
    expect(Object.keys(s.graffiti)).toEqual(['3']);
    expect(s.shops).toEqual(['a_b']);
    const full = emptyDiscovery();
    for (let i = 0; i < 240; i += 3) markChip(full, i);
    paintGraffiti(full, 12, 1, 2);
    markRoom(full, 3);
    full.shops.push('ramen_bari');
    expect(sanitizeDiscovery(JSON.parse(JSON.stringify(full)))).toEqual(full);
  });
});

describe('koleksiyonlar, harita, günlük', () => {
  const cat = buildDiscovery(citySeed(5));

  it('setler: kimlikler geçerli, tamamlanınca bir kez ödül; terminal seti maskeyle', () => {
    expect(cat.sets.length).toBeLessThanOrEqual(30);
    cat.sets.forEach((s) => {
      expect(s.need).toBeGreaterThan(0);
      if (s.ids) s.ids.forEach((id) => expect(id).toBeGreaterThanOrEqual(0));
    });
    const ds = emptyDiscovery();
    expect(newSets(cat, ds, 0)).toHaveLength(0);
    const roof = cat.sets.find((s) => s.id === 'cip_cati');
    roof.ids.forEach((id) => markChip(ds, id));
    const fresh = newSets(cat, ds, 0);
    expect(fresh.map((f) => f.id)).toContain('cip_cati');
    expect(newSets(cat, ds, 0)).toHaveLength(0); // ikinci kez yok
    const t = setStatus(cat, ds, 0xffff).find((s) => s.id === 'terminal_hepsi');
    expect(t.done).toBe(true);
    expect(newSets(cat, ds, 0xffff).map((f) => f.id)).toContain('terminal_hepsi');
    for (let i = 0; i < 10; i++) markRoom(ds, i);
    expect(newSets(cat, ds, 0xffff).map((f) => f.id)).toContain('oda_10');
    // altı kalıp: her kalıptan bir grafiti
    for (let d = 0; d < 6; d++) paintGraffiti(ds, 50 + d, d, d);
    expect(newSets(cat, ds, 0xffff).map((f) => f.id)).toContain('graf_kalip');
  });

  it('harita işaretleri ve günlük YALNIZ bulunanları içerir', () => {
    const ds = emptyDiscovery();
    expect(discoveredMarkers(cat, ds)).toHaveLength(0);
    expect(journalChips(cat, ds)).toHaveLength(0);
    markChip(ds, 7);
    paintGraffiti(ds, 4, 1, 1);
    markRoom(ds, 2);
    const m = discoveredMarkers(cat, ds);
    expect(m.map((x) => x.id).sort()).toEqual(['cip:7', 'grafiti:4', 'oda:2']);
    expect(m.every((x) => x.discovered === true && Number.isFinite(x.x + x.z))).toBe(true);
    expect(journalChips(cat, ds)).toHaveLength(1);
    expect(journalGraffiti(cat, ds)[0].design).toBe('Roket');
    expect(journalRooms(cat, ds)).toHaveLength(1);
    expect(JSON.stringify(m)).not.toContain('cip:8');
  });

  it('hikâye parçaları her 10 çipte bir açılır, 24 parça', () => {
    expect(STORY_FRAGMENTS).toHaveLength(24);
    expect(storyUnlocked(0)).toBe(0);
    expect(storyUnlocked(9)).toBe(0);
    expect(storyUnlocked(10)).toBe(1);
    expect(storyUnlocked(240)).toBe(24);
    expect(storyUnlocked(9999)).toBe(24);
    expect(journalStory(35)).toHaveLength(3);
    STORY_FRAGMENTS.forEach((s) => expect(s.length).toBeLessThanOrEqual(110));
  });
});
