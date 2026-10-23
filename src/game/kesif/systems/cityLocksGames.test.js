import { describe, expect, it } from 'vitest';
import { doorSides, lockSeed, lockSpec, lockStateKey, normalizeLock } from '../sim/city/interior/locks.js';
import { solveLevers } from '../sim/city/hack/levers.js';
import { createHack } from '../sim/city/hack/index.js';
import { simonSpec } from '../sim/city/hack/simon.js';
import {
  findLockedBuilding, findPlainDoor, makeCityG, propsAround,
} from './cityLocksTestKit.js';

/*
 * cityLocks — üç mini oyun, kart kilidi, gizli kapı, ipucu notu, erişilebilirlik ve iç kapı otomatiği: GERÇEK iç mekânlar, gerçek PropWorld, gerçek envanter.
 */
const SEED = 4242;

function entryPoint(b, d) {
  const s = doorSides(b.it).get(b.door.id);
  const cx = b.door.x + 0.5;
  const cz = b.door.z + 0.5;
  return s.axis === 'x' ? { x: cx + s.sign * d, y: b.door.y, z: cz } : { x: cx, y: b.door.y, z: cz + s.sign * d };
}

function boot(b, opts) {
  const p = entryPoint(b, 1.4);
  const k = makeCityG(SEED, Object.assign({ body: p }, opts || {}));
  k.loadAround(p.x, p.z, 30);
  k.tick(30);
  return { k, p };
}

function playSimon(k) {
  let seen = [];
  let prev = -1;
  for (let i = 0; i < 6000 && k.panel() && k.panel().status !== 'cozuldu' && k.panel().phase === 'play'; i++) {
    const v = k.panel().view;
    if (v.phase === 'show') {
      if (v.lit >= 0 && v.lit !== prev) seen.push(v.lit);
      prev = v.lit;
      k.tick(3);
    } else if (v.phase === 'input') {
      const seq = seen.slice(0, v.round);
      seen = [];
      prev = -1;
      for (let n = 0; n < seq.length; n++) {
        const r = k.input({ op: 'press', index: seq[n] });
        if (r.result === 'round' || r.result === 'won') break;
      }
    } else break;
  }
}

describe('her mini oyun gerçek kilitte uçtan uca', () => {
  ['simon', 'levers', 'dice'].forEach((game) => {
    it(game + ': Başla → kasıtlı başarısızlık → 20 sn soğuma → yeni tohumla Başla → çöz → kilit açılır', () => {
      const S0 = findLockedBuilding(SEED, 'mini_hack', { game, limit: 1500 });
      expect(S0, game + ' kilidi bulunamadı').toBeTruthy();
      const { k } = boot(S0);
      const pad = propsAround(k.pw, S0.door.x + 0.5, S0.door.z + 0.5, 6).find((q) => q.key === 'hack_terminali');
      expect(pad).toBeTruthy();
      const L = normalizeLock(S0.lock);
      const book = k.sys.state.book;
      k.usedProp(pad);
      expect(k.panel().game).toBe(game);
      expect(k.panel().phase).toBe('ready');
      expect(k.input({ op: 'start' }).ok).toBe(true);
      let prm = book.hackParams(S0.lot.id, L);
      // --- kasıtlı başarısızlık
      if (game === 'simon') {
        for (let i = 0; i < 2000 && k.panel().view.phase !== 'input'; i++) k.tick(3);
        k.input({ op: 'press', index: (simonSpec(prm.seed, L.tier).sequence[0] + 1) % 4 });
      } else if (game === 'dice') {
        const m = createHack({ game, seed: prm.seed, tier: L.tier });
        for (let i = 0; i < m.spec.lives; i++) {
          m.spec.solution.forEach((v, q) => k.input({ op: 'set', index: q, value: (v % 6) + 1 }));
          k.input({ op: 'submit' });
        }
      } else {
        const m = createHack({ game, seed: prm.seed, tier: L.tier });
        if (m.spec.budget !== Infinity) {
          for (let i = 0; i < m.spec.budget + 2 && k.panel().phase === 'play'; i++) k.input({ op: 'press', index: i % m.spec.n });
        } else {
          // bütçesiz/süresiz kademe: oyuncunun kaybedeceği bir durum yok; soğuma semantiği doğrudan kilit defterinden sınanır
          book.attemptHack(S0.lot.id, L, 'lost');
        }
      }
      const q = k.panel();
      if (q.status === 'cozuldu') return; // tesadüfen çözüldü (çok nadir)
      expect(q.status).toBe('soguma');
      expect(q.cooldown).toBeGreaterThan(18);
      expect(q.cooldown).toBeLessThanOrEqual(20);
      expect(k.input({ op: 'start' }).result).toBe('soguma');
      k.tick(60 * 21);
      expect(k.panel().status).toBe('bekliyor');
      // --- yeni tohumla çöz
      const first = prm.seed;
      expect(k.input({ op: 'start' }).ok).toBe(true);
      prm = book.hackParams(S0.lot.id, L);
      expect(prm.seed).not.toBe(first);
      if (game === 'levers') {
        const m = createHack({ game, seed: prm.seed, tier: L.tier });
        solveLevers(m.spec).moves.forEach((mv) => k.input({ op: 'press', index: mv }));
      } else if (game === 'dice') {
        const m = createHack({ game, seed: prm.seed, tier: L.tier });
        m.spec.solution.forEach((v, i) => k.input({ op: 'set', index: i, value: v }));
        k.input({ op: 'submit' });
      } else playSimon(k);
      expect(k.panel().status).toBe('cozuldu');
      expect(book.isSolved(S0.lot.id, L)).toBe(true);
      expect(k.events.some((e) => e.type === 'lockOpened' && e.lockId === L.id)).toBe(true);
    }, 30000);
  });

  it('erişilebilirlik modu: mini oyun süreleri ×2 ve dizi metni açık', () => {
    const S0 = findLockedBuilding(SEED, 'mini_hack', { game: 'simon', tier: 2, limit: 1500 }) || findLockedBuilding(SEED, 'mini_hack', { game: 'simon', limit: 1500 });
    expect(S0).toBeTruthy();
    const { k } = boot(S0, { accessibility: true });
    const pad = propsAround(k.pw, S0.door.x + 0.5, S0.door.z + 0.5, 6).find((q) => q.key === 'hack_terminali');
    k.usedProp(pad);
    k.input({ op: 'start' });
    expect(k.panel().view.sequenceText).toBeTruthy();
    expect(k.panel().accessibility).toBe(true);
    const base = [0, 0, 6, 4.5][S0.lock.tier] || 0;
    for (let i = 0; i < 4000 && k.panel().view.phase !== 'input'; i++) k.tick(3);
    expect(k.panel().view.timeMax).toBe(base * 2);
  });
});

describe('kart kilidi', () => {
  it('kart yokken ceza yok; yeterli (hatta üst) seviyede kartla okutulunca açılır', () => {
    const S0 = findLockedBuilding(SEED, 'kart', { limit: 2500 });
    expect(S0, 'kart kilidi').toBeTruthy();
    const { k } = boot(S0);
    const pad = propsAround(k.pw, S0.door.x + 0.5, S0.door.z + 0.5, 6).find((q) => q.key === 'kart_okuyucu');
    expect(pad).toBeTruthy();
    k.usedProp(pad);
    let pn = k.panel();
    expect(pn.type).toBe('kart');
    expect(pn.canRead).toBe(false);
    expect(k.input({ op: 'card' }).result).toBe('kart-yok');
    expect(k.panel().status).toBe('bekliyor');
    expect(k.panel().cooldown).toBe(0);
    const need = pn.need;
    k.G.inventory.add(['item:kart_gri', 'item:kart_turuncu', 'item:kart_mor'][Math.min(2, need)], 1); // bir üst seviye kart
    pn = k.panel();
    expect(pn.canRead).toBe(true);
    expect(k.input({ op: 'card' }).result).toBe('cozuldu');
    expect(k.store[lockStateKey(S0.lot.id, S0.lock.id)]).toBe(1);
  });
});

describe('gizli kapı ve ipucu', () => {
  it('gizli raf (serbest + hidden): yaklaşmak açmaz; kullanılınca kalıcı açılır ve lockOpened {hidden:true} yayılır', () => {
    const S0 = findLockedBuilding(SEED, 'serbest', { hidden: true, limit: 1500 });
    expect(S0, 'gizli kapı').toBeTruthy();
    const p = entryPoint(S0, 1.6);
    const k = makeCityG(SEED, { body: p });
    k.loadAround(p.x, p.z, 30);
    k.tick(40);
    const shelf = propsAround(k.pw, S0.door.x + 0.5, S0.door.z + 0.5, 3).find((q) => q.key === 'gizli_kapi_raf');
    expect(shelf).toBeTruthy();
    expect(k.pw.state(shelf.id)).toBe(0);
    k.usedProp(shelf);
    const ev = k.events.find((e) => e.type === 'lockOpened');
    expect(ev.hidden).toBe(true);
    expect(k.pw.state(shelf.id)).toBe(1);
    k.tick(180); // oyuncu yakında kalsın ya da gitsin: gizli kapı açık kalır
    expect(k.pw.state(shelf.id)).toBe(1);
    expect(k.store[lockStateKey(S0.lot.id, S0.lock.id)]).toBe(1);
  });

  it('ipucu taşıyıcısını (not / terminal / pano) kullanmak kodu söyler; sahip ipucu veren kilit atlanır', () => {
    let tested = 0;
    for (let n = 0; n < 6 && tested < 2; n++) {
      const S0 = findLockedBuilding(SEED, 'kod', { tier: 1, limit: 300 + n * 150 });
      if (!S0 || (S0.lock.data && S0.lock.data.clue === 'owner')) continue;
      const { k } = boot(S0);
      const sp = lockSpec(normalizeLock(S0.lock), lockSeed(SEED, S0.lot.id, S0.lock.id));
      const holders = propsAround(k.pw, S0.door.x + 0.5, S0.door.z + 0.5, 16).filter((q) => ['kod_notu', 'bilgi_terminali', 'ilan_panosu'].indexOf(q.key) >= 0);
      let heard = false;
      holders.forEach((h) => {
        k.G.hud.hint = null;
        k.usedProp(h);
        if (k.said.join('|').indexOf(sp.code.join(' - ')) >= 0) heard = true;
      });
      expect(holders.length).toBeGreaterThan(0);
      expect(heard).toBe(true);
      tested++;
      break;
    }
    expect(tested).toBeGreaterThan(0);
  });
});

describe('iç kapı otomatiği', () => {
  it('kilitsiz kapı yaklaşınca açılır (çarpışma kalkar), uzaklaşınca kapanır (çarpışma geri gelir)', () => {
    const S0 = findPlainDoor(SEED, 800);
    expect(S0, 'sıradan iç kapı').toBeTruthy();
    const p = entryPoint(S0, 1.2);
    const k = makeCityG(SEED, { body: p });
    k.loadAround(p.x, p.z, 30);
    k.tick(40);
    const dprop = propsAround(k.pw, S0.door.x + 0.5, S0.door.z + 0.5, 3).find((q) => (q.key === 'kapi' || q.key === 'kapi_genis') && Math.abs(q.x - (S0.door.x + 0.5)) < 0.3 && Math.abs(q.z - (S0.door.z + 0.5)) < 0.3);
    expect(dprop).toBeTruthy();
    expect(k.pw.state(dprop.id)).toBe(1);
    const out = new Float64Array(64 * 6);
    const hit = () => k.pw.colliders.queryRaw(dprop.x - 0.3, dprop.y + 0.5, dprop.z - 0.3, dprop.x + 0.3, dprop.y + 1.5, dprop.z + 0.3, out, 8);
    expect(hit()).toBe(0);
    k.put(p.x + 12, 64, p.z + 12);
    k.tick(120);
    expect(k.pw.state(dprop.id)).toBe(0);
    expect(hit()).toBeGreaterThan(0);
  });
});
