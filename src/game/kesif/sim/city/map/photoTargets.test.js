import { describe, expect, it } from 'vitest';
import {
  PHOTO_ASSIGNMENTS, PHOTO_KREDI, PHOTO_SUBJECTS, SUBJECT_IDS, albumCount, applyShot, decodePhotoState, evaluateShot, staticCandidates, subjectBit,
} from './photoTargets.js';
import { dimSeed } from '../../dim/dimensions.js';
import { scanText } from '../citySafeData.js';
import { sanitizeCityState } from '../cityState.js';
import { mulberry32 } from '../../rng.js';
import { KREDI } from '../mission/missionData.js';

const SEED = dimSeed(77, 'neon');
const cam = {
  x: 0, y: 66, z: 20, yaw: 0, pitch: 0, fov: 62,
};

describe('foto albümü: veri', () => {
  it('8 konu, benzersiz kimlik, aile dostu metin; ödül sabitleri', () => {
    expect(PHOTO_SUBJECTS.length).toBe(8);
    expect(new Set(SUBJECT_IDS).size).toBe(8);
    PHOTO_SUBJECTS.forEach((s) => {
      expect(scanText(s.name)).toEqual([]);
      expect(scanText(s.hint)).toEqual([]);
      expect(s.hint.length).toBeLessThanOrEqual(80);
    });
    Object.values(PHOTO_ASSIGNMENTS).forEach((a) => {
      expect(scanText(a.hint)).toEqual([]);
      a.accept.forEach((k) => expect(SUBJECT_IDS.indexOf(k)).toBeGreaterThanOrEqual(0));
    });
    expect(PHOTO_KREDI.album).toBe(KREDI.photo);
    expect(subjectBit('arac')).toBe(6);
    expect(subjectBit('yok')).toBe(-1);
  });

  it('sabit adaylar: 16 terminal + tepe + 8 yarış kapısı + 7 kurye masası; sonlu konum; önbellekli', () => {
    const c = staticCandidates(SEED);
    expect(c).toBe(staticCandidates(SEED));
    const by = {};
    c.forEach((x) => {
      by[x.kind] = (by[x.kind] || 0) + 1;
      expect(Number.isFinite(x.x) && Number.isFinite(x.y) && Number.isFinite(x.z)).toBe(true);
      expect(x.r).toBeGreaterThan(0.5);
      expect(scanText(x.name)).toEqual([]);
    });
    expect(by).toEqual({
      terminal: 16, tepe: 1, yaris: 8, kurye: 7,
    });
  });

  it('durum çözümü sağlam; city.photo kayıt sanitize\'ından geçer', () => {
    expect(decodePhotoState(null)).toEqual({
      n: 0, s: 0, a: 0, w: 0,
    });
    expect(decodePhotoState({
      n: -5, s: 1e9, a: 'x', w: 2,
    })).toEqual({
      n: 0, s: 255, a: 0, w: 0,
    });
    const st = {
      n: 3, s: 0b101, a: 1, w: 0,
    };
    expect(sanitizeCityState({ v: 1, photo: st }).photo).toEqual(st);
    expect(albumCount(st)).toBe(2);
  });
});

describe('foto albümü: kadraj değerlendirme', () => {
  const at = (kind, x, z, r) => ({
    kind, id: kind + x, name: kind, x, y: 66, z, r: r || 1.5,
  });

  it('kadrajdaki konular bulunur; arkadaki/uzaktaki bulunmaz; çıktı sıralı ve benzersiz', () => {
    const cands = [at('terminal', 0, 5), at('terminal', 3, 8), at('arac', 0, -10), at('robot', 0, 60), at('kurye', 0, 100)];
    const r = evaluateShot(cam, 16 / 9, cands, null);
    expect(r.kinds).toEqual(['terminal', 'arac']);
    expect(r.hits.length).toBe(3);
    const none = evaluateShot(Object.assign({}, cam, { yaw: Math.PI }), 16 / 9, cands, null);
    expect(none.kinds).toEqual(['robot']); // arkaya dönünce yalnız ilerideki robot; kurye masası 60 m'den uzak
  });

  it('kalabalık: yaya adayları ≥ 3 kadrajdayken; 2 yeterli değil', () => {
    const peds = (n) => Array.from({ length: n }, (_, i) => ({
      kind: 'yaya', id: 'p' + i, name: 'yaya', x: -4 + i * 2, y: 65.5, z: 0, r: 0.5,
    }));
    expect(evaluateShot(cam, 16 / 9, peds(2), null).kinds).toEqual([]);
    expect(evaluateShot(cam, 16 / 9, peds(3), null).kinds).toEqual(['kalabalik']);
    expect(evaluateShot(cam, 16 / 9, peds(6), null).crowd).toBe(6);
  });

  it('görüş hattı: duvar arkasındaki terminal sayılmaz', () => {
    const wall = (ox, oy, oz, dx, dy, dz, max) => (6 <= max ? 6 : null);
    expect(evaluateShot(cam, 16 / 9, [at('terminal', 0, -20)], wall).kinds).toEqual([]);
    expect(evaluateShot(cam, 16 / 9, [at('terminal', 0, -20)], null).kinds).toEqual(['terminal']);
  });

  it('bozuk aday/kind yok sayılır, atmaz', () => {
    const bad = [null, undefined, 5, { kind: 3 }, { kind: 'bilinmez', x: 0, y: 66, z: 0, r: 1 }, at('terminal', 0, -10)];
    expect(evaluateShot(cam, 16 / 9, bad, null).kinds).toEqual(['terminal']);
    expect(evaluateShot(cam, 16 / 9, null, null).kinds).toEqual([]);
  });
});

describe('foto albümü: ilerleme ve ödül', () => {
  it('yeni konu +8 Kredi, ikinci kez 0; kare sayısı her çekimde artar', () => {
    const st = decodePhotoState(null);
    let r = applyShot(st, ['terminal'], null);
    expect(r.newSubjects).toEqual(['terminal']);
    expect(r.kredi).toBe(PHOTO_KREDI.subject);
    expect(st.n).toBe(1);
    r = applyShot(st, ['terminal'], null);
    expect(r.kredi).toBe(0);
    expect(st.n).toBe(2);
    r = applyShot(st, [], null);
    expect(r.kredi).toBe(0);
    expect(st.n).toBe(3);
  });

  it('8/8 albüm tek sefer +30 ödül verir', () => {
    const st = decodePhotoState(null);
    let total = 0;
    let albums = 0;
    SUBJECT_IDS.forEach((k) => {
      const r = applyShot(st, [k], null);
      total += r.kredi;
      if (r.albumDone) albums++;
    });
    expect(albums).toBe(1);
    expect(total).toBe(8 * PHOTO_KREDI.subject + PHOTO_KREDI.album);
    expect(albumCount(st)).toBe(8);
    expect(applyShot(st, SUBJECT_IDS, null).kredi).toBe(0);
  });

  it('Irmak görevi: kabul edilen konu +15 tek sefer; yanlış konu sayılmaz; bilinmeyen görev yok sayılır', () => {
    const st = decodePhotoState(null);
    let r = applyShot(st, ['robot'], 'foto_ilk');
    expect(r.assignmentDone).toBe(false);
    r = applyShot(st, ['yaris'], 'foto_ilk');
    expect(r.assignmentDone).toBe(true);
    expect(r.kredi).toBe(PHOTO_KREDI.subject + PHOTO_ASSIGNMENTS.foto_ilk.kredi);
    r = applyShot(st, ['terminal'], 'foto_ilk');
    expect(r.assignmentDone).toBe(false);
    const st2 = decodePhotoState(null);
    expect(applyShot(st2, ['terminal'], '__proto__').assignmentDone).toBe(false);
    expect(applyShot(st2, ['terminal'], 'yok').kredi).toBe(0);
  });

  it('fuzz: rastgele çekimler albümü asla taşırmaz, Kredi tavanı sınırlı', () => {
    const r = mulberry32(31);
    const st = decodePhotoState(null);
    let total = 0;
    for (let i = 0; i < 300; i++) {
      const ks = SUBJECT_IDS.filter(() => r() < 0.2).concat(r() < 0.1 ? ['x', 3, null] : []);
      total += applyShot(st, ks, r() < 0.3 ? 'foto_ilk' : null).kredi;
      expect(st.s).toBeLessThanOrEqual(255);
    }
    expect(total).toBeLessThanOrEqual(8 * PHOTO_KREDI.subject + PHOTO_KREDI.album + PHOTO_ASSIGNMENTS.foto_ilk.kredi);
  });
});
