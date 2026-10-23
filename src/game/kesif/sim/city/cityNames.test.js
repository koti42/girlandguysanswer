import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_NAMES, COMPASS_KEYS, GARAGE_COLORS, GRAFFITI_COLORS, GRAFFITI_STENCILS, JOB_PACKAGES, JOB_TIERS,
  METRIC_LABELS, NEON_COLORS, PED_NAMES, PHOTO_FILTERS, QUEST_CHAIN_NEON, RACE_NAMES, RADIO_STATIONS, ROBOT_NAMES,
  TERMINAL_NAMES, UNDERGLOW_PATTERNS, VEHICLE_CLASS_NAMES, VEHICLE_PART_NAMES, allCityNameStrings, terminalName,
} from './cityNames.js';
import { PED_TYPES } from './ambientLines.js';
import { scanText } from './citySafeData.js';

describe('cityNames — görev/başarım/parça/yer adı tabloları', () => {
  it('görev zinciri: 12 görev, sözleşme kimlikleri, benzersiz, açıklama <= 60 kr', () => {
    expect(QUEST_CHAIN_NEON.map((q) => q.id)).toEqual([
      'nm_ilk_surus', 'nm_ilk_teslimat', 'nm_yaris_bronz', 'nm_cip_10', 'nm_graffiti_5', 'nm_cati_parkur',
      'nm_fotograf', 'nm_taksi_5', 'nm_robot_10', 'nm_gizli_oda', 'nm_garaj_boya', 'nm_portal_yumurtasi',
    ]);
    QUEST_CHAIN_NEON.forEach((q) => {
      expect(q.name.length).toBeLessThanOrEqual(24);
      expect(q.desc.length).toBeLessThanOrEqual(60);
      expect(q.desc).toMatch(/[.!?]$/);
    });
    expect(new Set(QUEST_CHAIN_NEON.map((q) => q.name)).size).toBe(12);
  });

  it('başarımlar: 24, nm_* kimlik, görev kimlikleriyle çakışmaz, ad <= 24, açıklama <= 60', () => {
    expect(ACHIEVEMENT_NAMES.length).toBe(24);
    const ids = ACHIEVEMENT_NAMES.map((a) => a.id);
    expect(new Set(ids).size).toBe(24);
    expect(new Set(ACHIEVEMENT_NAMES.map((a) => a.name)).size).toBe(24);
    const quests = new Set(QUEST_CHAIN_NEON.map((q) => q.id));
    ACHIEVEMENT_NAMES.forEach((a) => {
      expect(a.id).toMatch(/^nm_[a-z0-9_]+$/);
      expect(quests.has(a.id), a.id).toBe(false);
      expect(a.name.length, a.name).toBeLessThanOrEqual(24);
      expect(a.desc.length, a.desc).toBeLessThanOrEqual(60);
    });
    expect(ids).toContain('nm_ilk_gecis');
    expect(ids).toContain('nm_tum_terminaller');
  });

  it('kurye kademeleri, paket adları, metrik etiketleri', () => {
    expect(JOB_TIERS.map((t) => t.key)).toEqual(['caylak', 'usta', 'efsane']);
    expect(JOB_PACKAGES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(JOB_PACKAGES).size).toBe(JOB_PACKAGES.length);
    JOB_PACKAGES.forEach((p) => expect(p.length).toBeLessThanOrEqual(24));
    expect(Object.keys(METRIC_LABELS).sort()).toEqual([
      'chipsFound', 'citySeconds', 'cityKm', 'dimHops', 'graffitiDone', 'jobsDone', 'kredi', 'locksOpened',
      'photosTaken', 'racesWon', 'robotsDissolved', 'roomsFound', 'terminalsFound'].sort());
  });

  it('araç sınıfları, parçalar, garaj renkleri (16+16), zemin ışığı', () => {
    expect(Object.keys(VEHICLE_CLASS_NAMES)).toEqual(['taksi', 'spor', 'kamyonet', 'motor', 'hoverbike', 'suzulkay']);
    expect(Object.keys(VEHICLE_PART_NAMES).length).toBeGreaterThanOrEqual(12);
    Object.keys(VEHICLE_PART_NAMES).forEach((k) => expect(k).toMatch(/^[a-z0-9_]+$/));
    expect(GARAGE_COLORS.length).toBe(16);
    expect(NEON_COLORS.length).toBe(16);
    expect(new Set(GARAGE_COLORS).size).toBe(16);
    expect(new Set(NEON_COLORS).size).toBe(16);
    expect(Object.keys(UNDERGLOW_PATTERNS)).toEqual(['sabit', 'nefes', 'dalga']);
  });

  it('grafiti 6 kalıp × 8 renk, 8 yarış, radyo 5 + Sessiz, 6 foto filtresi', () => {
    expect(GRAFFITI_STENCILS.length).toBe(6);
    expect(GRAFFITI_COLORS.length).toBe(8);
    expect(RACE_NAMES.length).toBe(8);
    expect(new Set(RACE_NAMES).size).toBe(8);
    expect(RADIO_STATIONS.length).toBe(6);
    expect(RADIO_STATIONS[5].id).toBe('sessiz');
    expect(new Set(RADIO_STATIONS.map((r) => r.id)).size).toBe(6);
    expect(PHOTO_FILTERS.length).toBe(6);
    expect(new Set(PHOTO_FILTERS.map((r) => r.id)).size).toBe(6);
  });

  it('robot ve yaya adları tamam (ped tipleri ambientLines ile aynı)', () => {
    expect(Object.keys(ROBOT_NAMES).sort()).toEqual(['bekcirobot', 'gozdrone', 'hatabot']);
    expect(Object.keys(PED_NAMES).sort()).toEqual(PED_TYPES.slice().sort());
  });

  it('terminaller: 16 benzersiz ad, sıra sözleşmeye uygun, terminalName sınırları', () => {
    expect(TERMINAL_NAMES.length).toBe(16);
    expect(new Set(TERMINAL_NAMES).size).toBe(16);
    expect(TERMINAL_NAMES[0]).toBe('Kapı Meydanı');
    expect(TERMINAL_NAMES[15]).toBe('Tepe Terası');
    expect(COMPASS_KEYS.length).toBe(8);
    expect(TERMINAL_NAMES.slice(7, 15).every((n) => n.indexOf('Çevreyolu ') === 0)).toBe(true);
    expect(TERMINAL_NAMES.slice(1, 7).every((n) => /Terminali$/.test(n))).toBe(true);
    expect(terminalName(0)).toBe('Kapı Meydanı');
    expect(terminalName(15)).toBe('Tepe Terası');
    [-1, 16, 1.5, NaN, null, undefined, 'x'].forEach((v) => expect(terminalName(v)).toBe('Bilinmeyen Terminal'));
    expect(terminalName('3')).toBe(TERMINAL_NAMES[3]);
  });

  it('tüm ad dizgeleri: yalnızca Latin/Türkçe harf, rakam ve temel noktalama; güvenli; <= 60 kr', () => {
    const all = allCityNameStrings();
    expect(all.length).toBeGreaterThan(200);
    const bad = [];
    all.forEach((s) => {
      if (!/^[A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû0-9 .,:;!?'’&/()+%-]+$/.test(s)) bad.push('karakter: ' + s);
      if (s.length > 60) bad.push('uzun: ' + s);
      if (s !== s.trim()) bad.push('boşluk: ' + s);
      const hits = scanText(s);
      if (hits.length) bad.push('tarama: ' + s + ' -> ' + hits.map((h) => h.term));
    });
    expect(bad).toEqual([]);
  });
});
