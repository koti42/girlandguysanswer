import { describe, expect, it } from 'vitest';
import { Inventory, creativeInventory } from '../sim/inventory.js';
import { createCombatState, CELL_SHOTS } from '../sim/combat.js';
import { B } from '../sim/blocks.js';
import {
  fillBox, makeEm, makePlayer, makeWorld,
} from '../sim/mobAITestKit.js';
import {
  ASSIST, DEATH_MARKER, MODEL_CAP, addShake, capDistance, modelCapFor, ammoInfo, assistActive, assistOnDeath, assistReset, chunkOffsets, claimFor, combatLevelStep,
  createAssist, createDeathMarker, deriveWorldRefs, fireRayGunSafe, heldKind, inCircle, litFactor, nextPortalColor, pickDifficulty,
  shakeByDistance, shakeNow, shouldEvictFromSafe, slowDisplace, stepDeathMarker, swingKindFor, threatFromCount,
} from './mobsLogic.js';

describe('heldKind / swingKindFor', () => {
  it('eşya rolleri', () => {
    expect(heldKind(null)).toBe('none');
    expect(heldKind('item:elma')).toBe('none');
    expect(heldKind('item:kılıç_demir')).toBe('melee');
    expect(heldKind('item:kazma_taş')).toBe('melee');
    expect(heldKind('item:yay')).toBe('bow');
    expect(heldKind('item:ışın_tüfeği')).toBe('gun');
    expect(heldKind('item:kalkan')).toBe('shield');
    expect(heldKind('item:portal_tabancası')).toBe('portal');
    expect(heldKind('yok:eşya')).toBe('none');
  });

  it('savurma türü: kılıç kesme, alet vuruş, elle yumruk', () => {
    expect(swingKindFor('item:kılıç_demir')).toBe('slash');
    expect(swingKindFor('item:kazma_demir')).toBe('attack');
    expect(swingKindFor(null)).toBe('punch');
    expect(swingKindFor('item:elma')).toBe('punch');
  });
});

describe('ammoInfo', () => {
  it('cephane sayılır; yaratıcı envanter sınırsız; cephanesiz silah tamam', () => {
    const inv = new Inventory();
    expect(ammoInfo(inv, 'item:yay')).toEqual({ need: 'item:ok', have: 0, ok: false });
    inv.add('item:ok', 3);
    expect(ammoInfo(inv, 'item:yay')).toMatchObject({ have: 3, ok: true });
    expect(ammoInfo(inv, 'item:ışın_tüfeği').need).toBe('item:enerji_hücresi');
    expect(ammoInfo(inv, 'item:kılıç_demir')).toEqual({ need: null, have: 0, ok: true });
    expect(ammoInfo(creativeInventory(), 'item:yay').ok).toBe(true);
    expect(ammoInfo(null, 'item:yay').ok).toBe(false);
  });
});

describe('fireRayGunSafe', () => {
  function setup() {
    const w = makeWorld();
    fillBox(w, -1, 1, -6, 1, 3, -6, B.DIRT);
    const kit = makeEm(w);
    const p = makePlayer(0, 1, 0);
    p.eyeH = 1.62;
    const inv = new Inventory();
    return { w, ...kit, p, inv, cs: createCombatState() };
  }
  const look = { x: 0, y: 0, z: -1 };

  it('hücre tüketir (her CELL_SHOTS atışta 1), bekleme süresi uygular, hücresizken ateş etmez', () => {
    const s = setup();
    expect(fireRayGunSafe(s.em, s.cs, s.p, look, 'item:ışın_tüfeği', s.inv).reason).toBe('cephane yok');
    s.inv.add('item:enerji_hücresi', 2);
    const r = fireRayGunSafe(s.em, s.cs, s.p, look, 'item:ışın_tüfeği', s.inv);
    expect(r.fired).toBe(true);
    expect(s.inv.count('item:enerji_hücresi')).toBe(1);
    expect(s.cs.cells).toBe(CELL_SHOTS - 1);
    expect(fireRayGunSafe(s.em, s.cs, s.p, look, 'item:ışın_tüfeği', s.inv).reason).toBe('bekleme');
    expect(fireRayGunSafe(s.em, s.cs, s.p, look, 'item:kılıç_demir', s.inv).reason).toBe('ışın silahı değil');
  });

  it('blocks:false iken bloğa hasar vermez; true iken çatlatır', () => {
    const a = setup();
    a.inv.add('item:enerji_hücresi', 1);
    fireRayGunSafe(a.em, a.cs, a.p, look, 'item:ışın_tüfeği', a.inv, { blocks: false });
    expect(a.em.blockDamage.size).toBe(0);
    const b = setup();
    b.inv.add('item:enerji_hücresi', 1);
    fireRayGunSafe(b.em, b.cs, b.p, look, 'item:ışın_tüfeği', b.inv, { blocks: true });
    expect(b.em.blockDamage.size).toBe(1);
  });

  it('yaratıcı envanterde hücre harcanmaz', () => {
    const s = setup();
    s.inv = creativeInventory();
    const r = fireRayGunSafe(s.em, s.cs, s.p, look, 'item:ışın_tüfeği', s.inv);
    expect(r.fired).toBe(true);
  });
});

describe('kolaylaştırma ve zorluk', () => {
  it('3 ölüm 10 dk içinde → 8 dk kolay; dışında değil', () => {
    const a = createAssist();
    expect(assistOnDeath(a, 0)).toBe(false);
    expect(assistOnDeath(a, 100)).toBe(false);
    expect(assistOnDeath(a, 200)).toBe(true);
    expect(assistActive(a, 200 + ASSIST.hold - 1)).toBe(true);
    expect(assistActive(a, 200 + ASSIST.hold + 1)).toBe(false);
    const b = createAssist();
    assistOnDeath(b, 0);
    assistOnDeath(b, 400);
    expect(assistOnDeath(b, 1000)).toBe(false); // ilk ölüm penceresi dışına çıktı
    assistReset(a);
    expect(assistActive(a, 201)).toBe(false);
  });

  it('pickDifficulty', () => {
    expect(pickDifficulty({ easy: false, mode: 'macera', assist: false })).toBe('normal');
    expect(pickDifficulty({ easy: true, mode: 'macera' })).toBe('easy');
    expect(pickDifficulty({ easy: false, mode: 'harita' })).toBe('easy');
    expect(pickDifficulty({ easy: false, mode: 'macera', assist: true })).toBe('easy');
  });
});

describe('portal / hareket / ışık', () => {
  it('portal renk sırası: mavi → turuncu → mavi; başarısız atış rengi korur', () => {
    expect(nextPortalColor('mavi', true)).toBe('turuncu');
    expect(nextPortalColor('turuncu', true)).toBe('mavi');
    expect(nextPortalColor('turuncu', false)).toBe('turuncu');
    expect(nextPortalColor('mavi', false)).toBe('mavi');
  });

  it('slowDisplace yatay yer değiştirmeyi ölçekler', () => {
    const out = { x: 0, z: 0 };
    slowDisplace({ x: 10, z: 20 }, { x: 11, z: 20.5 }, 0.5, out);
    expect(out.x).toBeCloseTo(10.5);
    expect(out.z).toBeCloseTo(20.25);
    slowDisplace({ x: 0, z: 0 }, { x: 2, z: 0 }, 5, out);
    expect(out.x).toBe(2);
    slowDisplace({ x: 0, z: 0 }, { x: 2, z: 0 }, -1, out);
    expect(out.x).toBe(0);
  });

  it('litFactor: karanlıkta 0.3, ışıkta 1', () => {
    expect(litFactor(0, 0)).toBeCloseTo(0.3);
    expect(litFactor(15, 0)).toBeCloseTo(1);
    expect(litFactor(0, 15)).toBeCloseTo(1);
    expect(litFactor(7.5, 3)).toBeGreaterThan(0.6);
    expect(litFactor(99, -4)).toBeCloseTo(1);
  });

  it('combatLevelStep hızlı çıkar, yavaş iner; threatFromCount', () => {
    let v = 0;
    v = combatLevelStep(v, 1, 0.2);
    expect(v).toBeCloseTo(0.3);
    expect(combatLevelStep(1, 0, 1)).toBeCloseTo(0.75);
    expect(combatLevelStep(0.1, 0, 10)).toBe(0);
    expect(threatFromCount(0, false)).toBe(0);
    expect(threatFromCount(1, false)).toBeCloseTo(0.55);
    expect(threatFromCount(9, false)).toBe(1);
    expect(threatFromCount(0, true)).toBe(1);
  });
});

describe('claimFor (girdi sahipliği)', () => {
  it('yay/tabanca/portal her zaman saldırıyı alır; yakın dövüş yalnızca hedef varken', () => {
    expect(claimFor('bow', false, false, false, false).attack).toBe(true);
    expect(claimFor('gun', false, false, false, false).attack).toBe(true);
    expect(claimFor('portal', false, false, false, false)).toEqual({ attack: true, use: true });
    expect(claimFor('portal', false, true, true, false)).toEqual({ attack: true, use: false }); // etkileşimli bloğa sağ tık = kullan
    expect(claimFor('melee', false, false, false, false).attack).toBe(false);
    expect(claimFor('melee', true, false, false, false).attack).toBe(true);
    expect(claimFor('none', true, false, false, false).attack).toBe(true);
    expect(claimFor('shield', false, false, true, true)).toEqual({ attack: false, use: true });
    expect(claimFor('shield', false, false, true, false).use).toBe(false);
  });

  it('yay/tabanca sağ tıkı yalnızca etkileşimli blok yokken alır', () => {
    expect(claimFor('bow', false, false, true, false).use).toBe(true);
    expect(claimFor('bow', false, true, true, false).use).toBe(false);
    expect(claimFor('gun', false, false, false, false).use).toBe(false);
  });
});

describe('yapı verisi → arena / güvenli bölge', () => {
  const structs = [
    { id: 'a', x: 10, z: 20, safeRadius: 30 },
    { id: 'b', x: 500, z: 0, boss: { x: 500, z: 0, radius: 24, zone: 2, key: 'tasbekci', y: 70, name: 'Taş Bekçi' } },
    { id: 'c', x: 1, z: 1, safeRadius: 0 },
    null,
  ];
  it('arena ve güvenli bölgeleri çıkarır; done ilerlemeden', () => {
    const r = deriveWorldRefs(structs, { 2: true });
    expect(r.safes).toEqual([{ x: 10, z: 20, r: 30 }]);
    expect(r.arenas).toHaveLength(1);
    expect(r.arenas[0]).toMatchObject({ x: 500, z: 0, r: 24, done: true, zone: 2, key: 'tasbekci' });
    const r2 = deriveWorldRefs(structs, null, r);
    expect(r2).toBe(r);
    expect(r2.arenas[0].done).toBe(false);
    expect(deriveWorldRefs(null, null).arenas).toEqual([]);
  });

  it('inCircle ve güvenli bölgeden çıkarma kuralı', () => {
    const safes = [{ x: 0, z: 0, r: 10 }];
    expect(inCircle(safes, 5, 5, 0)).toBe(safes[0]);
    expect(inCircle(safes, 9, 9, 0)).toBeNull();
    expect(inCircle(safes, 9, 9, 5)).toBe(safes[0]);
    const hostile = { dead: false, def: { boss: false, hostile: true }, minion: false, x: 1, z: 1 };
    expect(shouldEvictFromSafe(hostile, safes)).toBe(true);
    expect(shouldEvictFromSafe(Object.assign({}, hostile, { def: { boss: true, hostile: true } }), safes)).toBe(false);
    expect(shouldEvictFromSafe(Object.assign({}, hostile, { minion: true }), safes)).toBe(false);
    expect(shouldEvictFromSafe(Object.assign({}, hostile, { dead: true }), safes)).toBe(false);
    expect(shouldEvictFromSafe(Object.assign({}, hostile, { def: { boss: false, hostile: false } }), safes)).toBe(false);
    expect(shouldEvictFromSafe(Object.assign({}, hostile, { x: 50 }), safes)).toBe(false);
  });
});

describe('chunkOffsets', () => {
  it('merkezden uzağa sıralı, önbellekli, simetrik', () => {
    const o = chunkOffsets(3);
    expect(o[0]).toEqual([0, 0]);
    expect(chunkOffsets(3)).toBe(o);
    for (let i = 1; i < o.length; i++) {
      expect(o[i][0] ** 2 + o[i][1] ** 2).toBeGreaterThanOrEqual(o[i - 1][0] ** 2 + o[i - 1][1] ** 2);
    }
    expect(o.some((p) => p[0] === -3 && p[1] === 0)).toBe(true);
    expect(o.length).toBeGreaterThan(25);
  });
});

describe('ölüm işareti', () => {
  it('ömrü dolunca ya da eşyalar toplanınca biter', () => {
    const m = createDeathMarker(1, 2, 3);
    expect(m.life).toBe(DEATH_MARKER.life);
    stepDeathMarker(m, 1, true);
    expect(m.done).toBe(false);
    // ilk saniyelerde eşya yok sayılsa bile (tolerans) bitmez
    stepDeathMarker(m, 2, false);
    expect(m.done).toBe(false);
    stepDeathMarker(m, DEATH_MARKER.grace, false);
    stepDeathMarker(m, DEATH_MARKER.emptyHold + 0.1, false);
    expect(m.done).toBe(true);
    const k = createDeathMarker(0, 0, 0, 10);
    stepDeathMarker(k, 11, true);
    expect(k.done).toBe(true);
    const j = createDeathMarker(0, 0, 0, 300);
    stepDeathMarker(j, 10, true);
    stepDeathMarker(j, 5, true);
    expect(j.done).toBe(false);
  });
});

describe('kamera sarsıntısı', () => {
  it('daha güçlü darbe yer değiştirir, sönümlenir, kısıtlı harekette yok', () => {
    const s = { amp: 0, t: 0, dur: 1 };
    addShake(s, 0.05, 0.5, true);
    expect(shakeNow(s, 0.1)).toBe(0);
    addShake(s, 0.05, 0.5, false);
    expect(shakeNow(s, 0.25)).toBeCloseTo(0.025);
    addShake(s, 0.01, 0.5, false); // zayıf: yok sayılır
    expect(s.amp).toBe(0.05);
    addShake(s, 0.08, 0.4, false);
    expect(s.amp).toBe(0.08);
    shakeNow(s, 1);
    expect(shakeNow(s, 0.1)).toBe(0);
    addShake(s, 0, 1, false);
    expect(s.t).toBe(0);
  });

  it('uzaklığa göre zayıflar', () => {
    expect(shakeByDistance(0.1, 0, 40)).toBeCloseTo(0.1);
    expect(shakeByDistance(0.1, 20, 40)).toBeCloseTo(0.025);
    expect(shakeByDistance(0.1, 40, 40)).toBe(0);
    expect(shakeByDistance(0.1, 90, 40)).toBe(0);
  });
});

describe('görünür model sınırı', () => {
  it('modelCapFor: kademeye göre, geçersiz → orta, geçersiz kılma', () => {
    expect(modelCapFor('low')).toBe(MODEL_CAP.low);
    expect(modelCapFor('high')).toBe(MODEL_CAP.high);
    expect(modelCapFor('?')).toBe(MODEL_CAP.medium);
    expect(modelCapFor('low', 7)).toBe(7);
    expect(modelCapFor('low', 0)).toBe(MODEL_CAP.low);
  });

  it('capDistance: sınır altında sınırsız; üstünde cap-inci en yakın uzaklık', () => {
    const scratch = new Float32Array(16);
    expect(capDistance([5, 9, 1], 3, 3, scratch)).toBe(Infinity);
    const d = [30, 4, 12, 8, 50, 2];
    expect(capDistance(d, 6, 3, scratch)).toBeCloseTo(8.5);
    expect(d).toEqual([30, 4, 12, 8, 50, 2]); // girdi bozulmaz
    expect(capDistance(d, 6, 1, scratch)).toBeCloseTo(2.5);
  });
});
