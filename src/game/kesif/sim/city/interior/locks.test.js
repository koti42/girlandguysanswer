import { describe, expect, it } from 'vitest';
import {
  CARD_KEYS, CARD_NAMES, COOLDOWN_SEC, LOCK_KINDS, LockBook, applyLocks, assignClues, cardKey, cardLevelOf, clueCodeText, clueRefOf, doorSides, hackSeedFor,
  lockPrompt, lockSeed, lockSpec, lockStateKey, lockTitle, makeLock, normalizeLock, onEntrySide, planLocks, solveCity, solveReachability,
} from './locks.js';
import { LOCK_KINDS as GRAPH_LOCK_KINDS, validateInterior } from './graph.js';
import { HACK_GAMES } from '../hack/index.js';
import { scanText } from '../citySafeData.js';
import { chainInterior, noteProp } from './locksTestKit.js';
import { mulberry32 } from '../../rng.js';

const ID_OK = /^[0-9a-z]{1,10}$/;

describe('Lock modeli', () => {
  it('LOCK_KINDS graph.js ile aynı; soğuma 20 sn; 3 kart anahtarı + adı', () => {
    expect(LOCK_KINDS).toEqual(GRAPH_LOCK_KINDS);
    expect(COOLDOWN_SEC).toBe(20);
    expect(CARD_KEYS).toEqual(['item:kart_gri', 'item:kart_turuncu', 'item:kart_mor']);
    expect(CARD_NAMES.length).toBe(3);
    expect(cardKey(1)).toBe('item:kart_gri');
    expect(cardKey(3)).toBe('item:kart_mor');
    expect(cardKey(0)).toBeNull();
    expect(cardKey(4)).toBeNull();
    expect(cardLevelOf('item:kart_turuncu')).toBe(2);
    expect(cardLevelOf('item:x')).toBe(0);
  });

  it('makeLock: geçerli → donuk; geçersiz kimlik/tür/kademe fırlatır; normalizeLock fırlatmaz', () => {
    const l = makeLock('k1', 'kod', 2, { code: '1234', gives: 2, junk: 1 });
    expect(Object.isFrozen(l)).toBe(true);
    expect(Object.isFrozen(l.data)).toBe(true);
    expect(l.data).toEqual({ code: [1, 2, 3, 4], gives: 2 });
    expect(() => makeLock('', 'kod', 1)).toThrow();
    expect(() => makeLock('a b', 'kod', 1)).toThrow();
    expect(() => makeLock('a', 'x', 1)).toThrow();
    expect(() => makeLock('a', 'kod', 4)).toThrow();
    expect(() => makeLock('a', 'kod', 1.5)).toThrow();
    expect(() => makeLock(5, 'kod', 1)).toThrow();
    [null, undefined, 0, 'x', [], {}, { id: 'a' }, { id: 'a', kind: 'kod', tier: NaN }, { id: '__proto__', kind: 'kod', tier: 1 }].forEach((raw) => {
      const r = normalizeLock(raw);
      if (r) expect(['kod', 'serbest', 'mini_hack', 'kart']).toContain(r.kind);
    });
    expect(normalizeLock({ id: 'a', kind: 'kod', tier: 1 }).tier).toBe(1);
    // geçersiz veri sessizce atılır
    expect(makeLock('a', 'kod', 1, { code: [9, 9, 9], digits: 7, clue: 'x' }).data).toEqual({});
    expect(makeLock('a', 'mini_hack', 1, { game: 'spike' }).data).toEqual({});
    expect(makeLock('a', 'kart', 1, { card: 9 }).data).toEqual({});
    expect(makeLock('a', 'mini_hack', 1, { game: 'dice' }).data).toEqual({ game: 'dice' });
  });

  it('lockStateKey: uyumlu kimlik AYNEN anahtar (köprü kimlikle çalışır); uyumsuz kimlikler x+hash, parsel başına ayrı; hepsi ^[0-9a-z]{1,10}$', () => {
    expect(lockStateKey(5, 'l0001a')).toBe('l0001a');
    expect(lockStateKey(9, 'l0001a')).toBe('l0001a');
    const seen = new Set();
    for (let lot = 0; lot < 2000; lot++) {
      for (let k = 0; k < 10; k++) {
        const key = lockStateKey(lot, 'K-' + k);
        expect(ID_OK.test(key)).toBe(true);
        expect(key[0]).toBe('x');
        seen.add(key);
      }
    }
    expect(seen.size).toBe(20000);
    expect(lockStateKey(5, 'A.b')).toBe(lockStateKey(5, 'A.b'));
    expect(lockStateKey(5, 'A.b')).not.toBe(lockStateKey(6, 'A.b'));
    // iç mekân üreticilerinin gerçek kimlik şemaları
    for (let lot = 0; lot < 3000; lot++) {
      ['k' + lot.toString(36) + 'a', 'l' + ('0000' + lot.toString(36)).slice(-4) + '1', 'l' + lot.toString(36) + 'b'].forEach((id) => {
        if (id.length <= 10) expect(lockStateKey(lot, id)).toBe(id);
      });
    }
  });

  it('lockSpec: belirlenimci; kod hane sayısı kademeye göre (3/3/4/4), her hane 1..6; veri verilirse o kullanılır', () => {
    for (let s = 0; s < 200; s++) {
      for (let t = 0; t < 4; t++) {
        const L = makeLock('c' + t, 'kod', t);
        const sp = lockSpec(L, lockSeed(s, 7, L.id));
        expect(sp).toEqual(lockSpec(L, lockSeed(s, 7, L.id)));
        expect(sp.digits).toBe(t >= 2 ? 4 : 3);
        expect(sp.code.length).toBe(sp.digits);
        sp.code.forEach((d) => expect(d >= 1 && d <= 6).toBe(true));
      }
    }
    const fixed = lockSpec(makeLock('c', 'kod', 0, { code: [6, 5, 4, 3] }), 1);
    expect(fixed.code).toEqual([6, 5, 4, 3]);
    expect(fixed.digits).toBe(4);
    expect(clueCodeText(fixed.code)).toBe('6 - 5 - 4 - 3');
    expect(lockSpec(null, 1)).toBeNull();
  });

  it('kod çeşitliliği: farklı tohum/parsel farklı kod; mini oyun seçimi 3 oyunu da kapsar', () => {
    const codes = new Set();
    const games = new Set();
    for (let s = 0; s < 300; s++) {
      codes.add(lockSpec(makeLock('c', 'kod', 1), lockSeed(s, 1, 'c')).code.join(''));
      games.add(lockSpec(makeLock('h', 'mini_hack', 1), lockSeed(s, 1, 'h')).game);
    }
    expect(codes.size).toBeGreaterThan(100);
    expect(Array.from(games).sort()).toEqual(HACK_GAMES.slice().sort());
  });

  it('varsayılan ödül: serbest/kart vermez; kod/mini_hack kademe t<3 → Kart-(t+1); t=3 yok; gives açıkça verilebilir', () => {
    for (let t = 0; t < 4; t++) {
      expect(lockSpec(makeLock('a', 'kod', t), 1).gives).toBe(t < 3 ? t + 1 : 0);
      expect(lockSpec(makeLock('a', 'mini_hack', t), 1).gives).toBe(t < 3 ? t + 1 : 0);
      expect(lockSpec(makeLock('a', 'kart', t), 1).gives).toBe(0);
      expect(lockSpec(makeLock('a', 'serbest', t), 1).gives).toBe(0);
    }
    expect(lockSpec(makeLock('a', 'kod', 0, { gives: 0 }), 1).gives).toBe(0);
    expect(lockSpec(makeLock('a', 'kod', 0, { gives: 3 }), 1).gives).toBe(3);
    // kart seviyesi: kademe, en az 1
    expect(lockSpec(makeLock('a', 'kart', 0), 1).card).toBe(1);
    expect(lockSpec(makeLock('a', 'kart', 2), 1).card).toBe(2);
    expect(lockSpec(makeLock('a', 'kart', 1, { card: 3 }), 1).card).toBe(3);
  });

  it('Türkçe metinler temiz', () => {
    const strs = [].concat(CARD_NAMES, LOCK_KINDS.map((k) => lockPrompt({ kind: k })), LOCK_KINDS.map((k) => lockTitle({ kind: k })));
    expect(strs.filter((s) => scanText(s).length > 0)).toEqual([]);
  });
});

describe('LockBook — soğuma, deneme, kalıcılık', () => {
  const lock = makeLock('kk', 'kod', 1, { code: [2, 4, 6] });
  const LOT = 11;

  it('doğru kod → solved, store[anahtar]=1 (paylaşılan nesne), tekrar deneme "already"', () => {
    const store = {};
    const b = new LockBook({ store, seed: 5 });
    expect(b.isOpen(LOT, lock)).toBe(false);
    const r = b.attemptCode(LOT, lock, [2, 4, 6]);
    expect(r.result).toBe('solved');
    expect(store[lockStateKey(LOT, 'kk')]).toBe(1);
    expect(b.isOpen(LOT, lock)).toBe(true);
    expect(b.attemptCode(LOT, lock, [1, 1, 1]).result).toBe('already');
    expect(Object.keys(store).length).toBe(1);
    // yeni LockBook aynı store ile çözülmüş görür (kayıt/yükleme)
    const b2 = new LockBook({ store: JSON.parse(JSON.stringify(store)), seed: 5 });
    expect(b2.isOpen(LOT, lock)).toBe(true);
  });

  it('yanlış kod → 20 sn soğuma; soğumada "cooldown" (kalan süre azalır); tam 20 sn sonra yeniden denenir', () => {
    const b = new LockBook({ seed: 5 });
    const w = b.attemptCode(LOT, lock, [1, 1, 1]);
    expect(w.result).toBe('wrong');
    expect(w.cooldown).toBe(20);
    expect(b.cooldownLeft(LOT, lock)).toBe(20);
    b.tick(5);
    const c = b.attemptCode(LOT, lock, [2, 4, 6]);
    expect(c.result).toBe('cooldown');
    expect(c.cooldown).toBeCloseTo(15, 6);
    b.tick(14.99);
    expect(b.attemptCode(LOT, lock, [2, 4, 6]).result).toBe('cooldown');
    b.tick(0.02);
    expect(b.cooldownLeft(LOT, lock)).toBe(0);
    expect(b.attemptCode(LOT, lock, [2, 4, 6]).result).toBe('solved');
  });

  it('KALICI KİLİT YOK: 200 ardışık yanlışın ardından doğru kod yine de açar', () => {
    const b = new LockBook({ seed: 9 });
    for (let i = 0; i < 200; i++) {
      expect(b.attemptCode(LOT, lock, [1, 1, 1]).result).toBe('wrong');
      b.tick(COOLDOWN_SEC);
    }
    expect(b.attempts(LOT, lock)).toBe(200);
    expect(b.attemptCode(LOT, lock, [2, 4, 6]).result).toBe('solved');
  });

  it('geri bildirim (Mastermind): exact/present brute-force ile aynı; geçersiz girdi ceza vermez', () => {
    const rng = mulberry32(3);
    for (let n = 0; n < 300; n++) {
      const L = makeLock('q', 'kod', n % 4);
      const b = new LockBook({ seed: n });
      const sp = b.specOf(7, L);
      const g = [];
      for (let i = 0; i < sp.digits; i++) g.push(1 + Math.floor(rng() * 6));
      const r = b.attemptCode(7, L, g);
      if (g.every((v, i) => v === sp.code[i])) {
        expect(r.result).toBe('solved');
        continue;
      }
      let ex = 0;
      const rest = sp.code.slice();
      const gr = [];
      g.forEach((v, i) => {
        if (v === sp.code[i]) ex++;
        else gr.push(v);
      });
      const cr = sp.code.filter((v, i) => v !== g[i]);
      let pr = 0;
      gr.forEach((v) => {
        const k = cr.indexOf(v);
        if (k >= 0) {
          cr.splice(k, 1);
          pr++;
        }
      });
      expect(rest.length).toBe(sp.digits);
      expect(r.result).toBe('wrong');
      expect(r.exact).toBe(ex);
      expect(r.present).toBe(pr);
    }
    const b = new LockBook({ seed: 1 });
    [null, undefined, [], [1], [1, 2], [1, 2, 3, 4], [0, 1, 2], [7, 1, 1], [1.5, 2, 3], 'x', [NaN, 1, 1]].forEach((bad) => {
      expect(b.attemptCode(LOT, lock, bad).result).toBe('invalid');
      expect(b.cooldownLeft(LOT, lock)).toBe(0);
    });
    expect(b.attemptCode(LOT, makeLock('z', 'kart', 1), [1, 2, 3]).result).toBe('invalid');
  });

  it('kart: yetersiz kartta ceza yok; üst seviye kart alt seviye kilidi açar; doğru kart çözer', () => {
    const b = new LockBook({ seed: 4 });
    const k2 = makeLock('kc', 'kart', 2);
    let r = b.attemptCard(LOT, k2, () => false);
    expect(r).toEqual({ result: 'missing', need: 2 });
    expect(b.cooldownLeft(LOT, k2)).toBe(0);
    r = b.attemptCard(LOT, k2, (key) => key === 'item:kart_gri');
    expect(r.result).toBe('missing');
    r = b.attemptCard(LOT, k2, (key) => key === 'item:kart_mor');
    expect(r.result).toBe('solved');
    expect(r.used).toBe(3);
    const b2 = new LockBook({ seed: 4 });
    expect(b2.attemptCard(LOT, k2, (key) => key === 'item:kart_turuncu').result).toBe('solved');
    expect(b2.attemptCard(LOT, k2, () => false).result).toBe('already');
    expect(b2.attemptCard(LOT, makeLock('x', 'kod', 1), () => true).result).toBe('invalid');
  });

  it('mini oyun sonucu: kayıp → 20 sn soğuma + yeni tohum; galibiyet → çözüldü', () => {
    const b = new LockBook({ seed: 4 });
    const h = makeLock('hh', 'mini_hack', 2);
    const p0 = b.hackParams(LOT, h);
    expect(HACK_GAMES).toContain(p0.game);
    expect(p0.tier).toBe(2);
    expect(b.attemptHack(LOT, h, 'lost')).toEqual({ result: 'wrong', cooldown: 20 });
    expect(b.attemptHack(LOT, h, 'won').result).toBe('cooldown');
    b.tick(20);
    const p1 = b.hackParams(LOT, h);
    expect(p1.seed).not.toBe(p0.seed);
    expect(p1.game).toBe(p0.game);
    expect(b.attemptHack(LOT, h, 'won').result).toBe('solved');
    expect(b.isSolved(LOT, h)).toBe(true);
    expect(hackSeedFor(1, 0)).not.toBe(hackSeedFor(1, 1));
    expect(b.hackParams(LOT, makeLock('kk2', 'kod', 1))).toBeNull();
  });

  it('serbest kilit hep açık; çözülen kilit kalıcı; resetTransient soğumayı siler ama çözümü silmez; NaN/negatif tick yok sayılır', () => {
    const b = new LockBook({ seed: 4 });
    const s = makeLock('ss', 'serbest', 0);
    expect(b.isOpen(LOT, s)).toBe(true);
    expect(b.isOpen(LOT, null)).toBe(true);
    b.attemptCode(LOT, lock, [1, 1, 1]);
    b.tick(NaN);
    b.tick(-5);
    b.tick(Infinity);
    expect(b.cooldownLeft(LOT, lock)).toBe(20);
    b.resetTransient();
    expect(b.cooldownLeft(LOT, lock)).toBe(0);
    b.solve(LOT, lock);
    b.resetTransient();
    expect(b.isSolved(LOT, lock)).toBe(true);
    expect(b.solve(LOT, lock)).toBe(false);
    expect(b.solvedCount).toBe(1);
  });

  it('soğuma kilit başına bağımsız (iki kilit ayrı sayaç)', () => {
    const b = new LockBook({ seed: 4 });
    const a = makeLock('a1', 'kod', 0, { code: [1, 1, 1] });
    const c = makeLock('a2', 'kod', 0, { code: [1, 1, 1] });
    b.attemptCode(1, a, [2, 2, 2]);
    expect(b.cooldownLeft(1, a)).toBe(20);
    expect(b.cooldownLeft(1, c)).toBe(0);
    expect(b.attemptCode(1, c, [1, 1, 1]).result).toBe('solved');
    const na = makeLock('Q.1', 'kod', 0, { code: [1, 1, 1] });
    b.attemptCode(1, na, [2, 2, 2]);
    expect(b.cooldownLeft(1, na)).toBe(20);
    expect(b.cooldownLeft(2, na)).toBe(0); // uyumsuz kimlik: başka parsel = başka kilit
  });
});

describe('kapı tarafları — içeriden çıkış her zaman serbest', () => {
  it('doorSides: giriş/derin oda, geçiş ekseni ve işaret; onEntrySide', () => {
    const it = chainInterior(3, { locks: { 0: makeLock('l0', 'kod', 0), 1: makeLock('l1', 'kod', 1) } });
    const sides = doorSides(it);
    const s0 = sides.get('d0');
    expect(s0.entry).toBe('R0');
    expect(s0.deep).toBe('R1');
    expect(s0.axis).toBe('x');
    expect(s0.sign).toBe(-1);
    expect(onEntrySide(s0, 2, 2)).toBe(true); // R0 içinde
    expect(onEntrySide(s0, 7, 2)).toBe(false); // R1 içinde: serbest çıkış
    expect(sides.get('d1').entry).toBe('R1');
    expect(onEntrySide(sides.get('d1'), 12, 2)).toBe(false);
  });

  it('girişten her odaya derinlik tutarlı; döngülü graf güvenli', () => {
    const it = chainInterior(4);
    it.graph.push(['R0', 'R3', 'dx']);
    it.doors.push({
      id: 'dx', kind: 'door', x: 6, y: 64, z: 2, axis: 'z', w: 1, h: 3,
    });
    const sides = doorSides(it);
    expect(sides.get('dx').entry).toBe('R0');
    expect(sides.get('dx').deep).toBe('R3');
    expect(doorSides(null).size).toBe(0);
    expect(doorSides({}).size).toBe(0);
  });
});

describe('kod ipuçları', () => {
  it('açık eşleşme (lock alanı / data=clueRefOf) ve örtük eşleşme (sıralı)', () => {
    const L1 = makeLock('a1', 'kod', 0);
    const L2 = makeLock('a2', 'kod', 1);
    const it = chainInterior(3, {
      locks: { 0: L1, 1: L2 },
      props: [noteProp(66, 0, { lock: 'a2' }), noteProp(65, 0, { data: clueRefOf('a1') })],
    });
    const m = assignClues(it);
    expect(m.get('a1').prop.slot).toBe(65);
    expect(m.get('a2').prop.slot).toBe(66);
    const imp = chainInterior(3, { locks: { 0: L1, 1: L2 }, props: [noteProp(70, 0), noteProp(71, 1)] });
    const mi = assignClues(imp);
    expect(mi.get('a1').prop.slot).toBe(70);
    expect(mi.get('a2').prop.slot).toBe(71);
    expect(assignClues({}).size).toBe(0);
    expect(assignClues(chainInterior(2, { locks: { 0: L1 } })).size).toBe(0);
    expect(clueRefOf('a1')).toBeGreaterThan(0);
    expect(clueRefOf('a1')).toBeLessThanOrEqual(65535);
  });

  it('başka kilide açıkça bağlı not, boşta kalan kilide verilmez; owner ipucu notu aramaz', () => {
    const L1 = makeLock('a1', 'kod', 0);
    const L2 = makeLock('a2', 'kod', 0, { clue: 'owner' });
    const it = chainInterior(3, { locks: { 0: L1, 1: L2 }, props: [noteProp(70, 0, { lock: 'zzz' })] });
    expect(assignClues(it).size).toBe(0);
  });
});

describe('solveReachability — sabit nokta çözülebilirliği', () => {
  it('kilitsiz iç mekân: ok, hiç kilit yok', () => {
    const r = solveReachability(chainInterior(3));
    expect(r.ok).toBe(true);
    expect(r.locks).toBe(0);
    expect(solveReachability(null).ok).toBe(true);
    expect(solveReachability({}).ok).toBe(true);
  });

  it('zincir: kod → hack → kod; çözüm sırası dıştan içe; her oda erişilir', () => {
    const it = chainInterior(4, {
      locks: { 0: makeLock('a', 'kod', 0), 1: makeLock('b', 'mini_hack', 1), 2: makeLock('c', 'kod', 2) },
      props: [noteProp(64, 0), noteProp(65, 1), noteProp(66, 2)],
    });
    const r = solveReachability(it, { requireClues: true });
    expect(r.ok).toBe(true);
    expect(r.order).toEqual(['a', 'b', 'c']);
    expect(r.clues).toEqual({ a: 'prop', c: 'prop' });
    expect(r.unreachableRooms).toEqual([]);
    expect(r.cardsGranted).toEqual([1, 2, 3]);
  });

  it('kod ipucu kilidin ARKASINDAKİ odada ise (requireClues) çözülemez; çıkarım modunda çözülür', () => {
    const it = chainInterior(3, { locks: { 0: makeLock('a', 'kod', 0) }, props: [noteProp(64, 2)] });
    const strict = solveReachability(it, { requireClues: true });
    expect(strict.ok).toBe(false);
    expect(strict.unsolved[0].id).toBe('a');
    expect(strict.unsolved[0].reason).toMatch(/erişilemez/);
    const loose = solveReachability(it);
    expect(loose.ok).toBe(true);
    expect(loose.clues.a).toBe('cikarim');
    // not yok
    const none = chainInterior(3, { locks: { 0: makeLock('a', 'kod', 0) } });
    expect(solveReachability(none, { requireClues: true }).unsolved[0].reason).toBe('kod notu yok');
    expect(solveReachability(none).ok).toBe(true);
  });

  it('kart kilidi: sağlayıcı yoksa çözülemez; dış kart ya da daha düşük kademeli kilit sağlarsa çözülür', () => {
    const lonely = chainInterior(2, { locks: { 0: makeLock('k', 'kart', 1) } });
    const r0 = solveReachability(lonely);
    expect(r0.ok).toBe(false);
    expect(r0.unsolved[0].reason).toMatch(/Kart-1/);
    expect(solveReachability(lonely, { externalCards: [1] }).ok).toBe(true);
    expect(solveReachability(lonely, { externalCards: [3] }).ok).toBe(true); // üst kart alt kilidi açar
    expect(solveReachability(lonely, { externalCards: [2] }).ok).toBe(true);
    // d0: kod tier0 (Kart-1 verir) → d1: kart tier1
    const chain = chainInterior(3, { locks: { 0: makeLock('a', 'kod', 0), 1: makeLock('k', 'kart', 1) } });
    const r1 = solveReachability(chain);
    expect(r1.ok).toBe(true);
    expect(r1.order).toEqual(['a', 'k']);
    expect(r1.dag.violations).toEqual([]);
    expect(r1.dag.edges).toEqual([['k', 'a']]);
  });

  it('KISIR DÖNGÜ: kart kilidinin kartı kendi arkasındaki kilitten gelirse çözülemez (kilit çözümü kilidin arkasında olamaz)', () => {
    // d0 kart-1 kilidi; Kart-1'i veren kod kilidi (d1) onun ARKASINDA
    const dead = chainInterior(3, { locks: { 0: makeLock('k', 'kart', 1), 1: makeLock('a', 'kod', 0) } });
    const r = solveReachability(dead);
    expect(r.ok).toBe(false);
    expect(r.unsolved.map((u) => u.id).sort()).toEqual(['a', 'k']);
    expect(r.unreachableRooms).toEqual(['R1', 'R2']);
    // iki kart karşılıklı bağımlılık
    const two = chainInterior(3, { locks: { 0: makeLock('k1', 'kart', 2), 1: makeLock('k2', 'kart', 1) } });
    expect(solveReachability(two).ok).toBe(false);
  });

  it('DAG ihlali bildirimi: sağlayıcı kademesi ≥ kart seviyesi', () => {
    const it = chainInterior(3, { locks: { 0: makeLock('a', 'kod', 1, { gives: 1 }), 1: makeLock('k', 'kart', 1) } });
    const r = solveReachability(it);
    expect(r.ok).toBe(true);
    expect(r.dag.violations.length).toBe(1);
    expect(r.dag.violations[0]).toMatch(/Kart-1/);
  });

  it('serbest kilit ve kapı dışı türler: engel sayılmaz, uyarı verilir', () => {
    const it = chainInterior(3, { locks: { 0: makeLock('s', 'serbest', 0) } });
    expect(solveReachability(it).ok).toBe(true);
    const arch = chainInterior(2, { locks: { 0: makeLock('x', 'kod', 1) } });
    arch.doors[1].kind = 'arch';
    const r = solveReachability(arch);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => /zorlanmayan/.test(w))).toBe(true);
  });

  it('paralel dallar: iki kilitli oda ayrı ayrı çözülür', () => {
    const it = chainInterior(2, {});
    // R0 → R2 (ikinci dal)
    it.rooms.push({
      id: 'R2', x0: 0, x1: 4, z0: 5, z1: 9, y0: 64, y1: 68, role: 'oda',
    });
    it.doors.push({
      id: 'dz', kind: 'door', x: 2, y: 64, z: 4, axis: 'x', w: 1, h: 3, lock: makeLock('z', 'mini_hack', 2),
    });
    it.doors[1].lock = makeLock('y', 'kod', 0);
    it.graph.push(['R0', 'R2', 'dz']);
    const r = solveReachability(it);
    expect(r.ok).toBe(true);
    expect(r.order.sort()).toEqual(['y', 'z']);
    expect(doorSides(it).get('dz').sign).toBe(-1);
  });

  it('solveCity: kart havuzu boştan başlar, bir binanın verdiği kart diğerinin kilidini açar', () => {
    const a = chainInterior(2, { locks: { 0: makeLock('a', 'kod', 0) } });
    const b = chainInterior(2, { locks: { 0: makeLock('k', 'kart', 1) } });
    const only = solveCity([{ lotId: 2, interior: b }]);
    expect(only.ok).toBe(false);
    expect(only.unsolved[0]).toMatchObject({ lotId: 2, id: 'k' });
    const both = solveCity([{ lotId: 2, interior: b }, { lotId: 1, interior: a }]);
    expect(both.ok).toBe(true);
    expect(both.pool).toEqual([1]);
    expect(solveCity([{ lotId: 1, interior: b }], { externalCards: [1] }).ok).toBe(true);
    expect(solveCity([]).ok).toBe(true);
  });
});

describe('planLocks / applyLocks (DAG\'ı yapıdan garanti eder)', () => {
  it('zincir iç mekânlarda 500 tohum: her yerleştirme çözülebilir, dış kart gerekmez, DAG ihlali yok', () => {
    let withKart = 0;
    let total = 0;
    for (let s = 0; s < 500; s++) {
      const n = 3 + (s % 5);
      const it = chainInterior(n);
      const plan = planLocks(it, s, { max: 4, density: 1, lotId: s });
      const lk = applyLocks(it, plan);
      const r = solveReachability(lk, { seed: s, lotId: s });
      expect(r.ok, 'seed ' + s + JSON.stringify(r.unsolved)).toBe(true);
      expect(r.dag.violations).toEqual([]);
      total += plan.length;
      if (plan.some((p) => p.lock.kind === 'kart')) withKart++;
      // girdi değişmedi
      expect(it.doors.every((d) => !d.lock)).toBe(true);
      // kod kilitleri çıkarım ya da not ile çözülür
      plan.forEach((p) => expect(['kod', 'mini_hack', 'kart']).toContain(p.lock.kind));
    }
    expect(total).toBeGreaterThan(1000);
    expect(withKart).toBeGreaterThan(30);
  });

  it('belirlenimci; max 0 / graf yok güvenli; kilit sınırları kademe 0..3', () => {
    const it = chainInterior(6);
    expect(planLocks(it, 3, { max: 3, density: 1 })).toEqual(planLocks(it, 3, { max: 3, density: 1 }));
    expect(planLocks(it, 3, { max: 0 })).toEqual([]);
    expect(planLocks({}, 3)).toEqual([]);
    expect(planLocks(null, 3)).toEqual([]);
    planLocks(it, 9, { max: 5, density: 1 }).forEach((p) => {
      expect(p.lock.tier >= 0 && p.lock.tier <= 3).toBe(true);
      expect(ID_OK.test(lockStateKey(1, p.lock.id))).toBe(true);
    });
  });

  it('uygulanan iç mekân hâlâ graph.js doğrulamasından geçecek kilit biçiminde (kimlikler benzersiz)', () => {
    for (let s = 0; s < 50; s++) {
      const it = chainInterior(6);
      const lk = applyLocks(it, planLocks(it, s, { max: 5, density: 1 }));
      const ids = lk.doors.filter((d) => d.lock).map((d) => d.lock.id);
      expect(new Set(ids).size).toBe(ids.length);
      lk.doors.forEach((d) => {
        if (d.lock) expect(normalizeLock(d.lock)).not.toBeNull();
      });
      expect(typeof validateInterior).toBe('function');
    }
  });
});
