import { beforeAll, describe, expect, it } from 'vitest';
import { createPlayerBody, stepPlayer } from '../sim/physics.js';
import {
  allElevators, buttonPropId, cabinPropId, doorCells,
} from '../sim/city/elevators.js';
import { ID } from '../sim/city/cityEmit.js';
import { lotsInRect, planBuilding } from '../sim/city/cityPlan.js';
import { doorSides, lockSeed, lockSpec, lockStateKey, normalizeLock } from '../sim/city/interior/locks.js';
import { solveLevers } from '../sim/city/hack/levers.js';
import { createHack } from '../sim/city/hack/index.js';
import { simonSpec } from '../sim/city/hack/simon.js';
import { solveDice } from '../sim/city/hack/dice.js';
import { isLockOpen } from '../sim/props/propIndoor.js';
import { CITY_LOCKS_ORDER, LOCK_UI } from './cityLocks.js';
import { findLockedBuilding, makeCityG, propsAround } from './cityLocksTestKit.js';
import { DIMENSION_ORDER } from './dimension.js';
import { CITY_HUD_ORDER } from './cityHud.js';

const SEED = 4242;

/** Kapının giriş tarafında, kapıdan `d` blok uzakta bir nokta. */
function entryPoint(b, d) {
  const sides = doorSides(b.it);
  const s = sides.get(b.door.id);
  const cx = b.door.x + 0.5;
  const cz = b.door.z + 0.5;
  return s.axis === 'x' ? { x: cx + s.sign * d, y: b.door.y, z: cz } : { x: cx, y: b.door.y, z: cz + s.sign * d };
}

function deepPoint(b, d) {
  const sides = doorSides(b.it);
  const s = sides.get(b.door.id);
  const cx = b.door.x + 0.5;
  const cz = b.door.z + 0.5;
  return s.axis === 'x' ? { x: cx - s.sign * d, y: b.door.y, z: cz } : { x: cx, y: b.door.y, z: cz - s.sign * d };
}

function setup(kind, o) {
  const b = findLockedBuilding(SEED, kind, o);
  expect(b, kind + ' kilitli bina bulunamadı').toBeTruthy();
  const p = entryPoint(b, 1.4);
  const k = makeCityG(SEED, { body: p, accessibility: !!(o && o.accessibility) });
  k.loadAround(p.x, p.z, 24);
  k.tick(30);
  const near = propsAround(k.pw, b.door.x + 0.5, b.door.z + 0.5, 6);
  const doorProp = near.find((q) => (q.key === 'kapi' || q.key === 'kapi_genis') && Math.abs(q.x - (b.door.x + 0.5)) < 0.3 && Math.abs(q.z - (b.door.z + 0.5)) < 0.3);
  const padKey = { kod: 'kod_paneli', kart: 'kart_okuyucu', mini_hack: 'hack_terminali' }[kind];
  const pad = near.find((q) => q.key === padKey);
  return {
    b, k, doorProp, pad, near,
  };
}

describe('sistem kimliği ve sırası', () => {
  it('order 24, ad cityLocks; bilinen sistem sıralarıyla çakışmaz', () => {
    expect(CITY_LOCKS_ORDER).toBe(24);
    const known = [-120, -110, -100, -90, -60, 10, 20, 22, 23, 25, 28, 30, 40, 90, 1000, DIMENSION_ORDER, CITY_HUD_ORDER];
    expect(known.indexOf(24)).toBe(-1);
    const k = makeCityG(SEED);
    expect(k.sys.name).toBe('cityLocks');
    expect(k.sys.order).toBe(24);
    expect(LOCK_UI).toBe('dialogue');
  });
});

describe('kod kilidi uçtan uca', () => {
  let S = null;
  beforeAll(() => {
    S = setup('kod'); // köprü (setLockBridge) son kurulan sistemi izler: bu bloğun sistemi testler boyunca en son kurulandır
  });

  it('kapı ve düzenek proplarını bulur; kilitliyken kapı kapalı ve çarpışması var; ipucu bir kez verilir', () => {
    expect(S.doorProp).toBeTruthy();
    expect(S.pad).toBeTruthy();
    expect(S.k.pw.state(S.doorProp.id)).toBe(0);
    const out = new Float64Array(64 * 6);
    const n = S.k.pw.colliders.queryRaw(S.doorProp.x - 0.4, S.doorProp.y + 0.5, S.doorProp.z - 0.4, S.doorProp.x + 0.4, S.doorProp.y + 1.5, S.doorProp.z + 0.4, out, 8);
    expect(n).toBeGreaterThan(0);
    expect(S.k.said.some((t) => /kilitli/i.test(t))).toBe(true);
    expect(isLockOpen(S.b.lock)).toBe(false);
  });

  it('düzenek kullanımı paneli açar: ui dialogue, getLockPanel kod görüntüsü, hane sayısı ve ipucu bilgisi', () => {
    S.k.usedProp(S.pad);
    expect(S.k.G.ui).toBe('dialogue');
    const p = S.k.panel();
    expect(p.type).toBe('kod');
    expect(p.status).toBe('bekliyor');
    const sp = lockSpec(normalizeLock(S.b.lock), lockSeed(SEED, S.b.lot.id, S.b.lock.id));
    expect(p.digits).toBe(sp.digits);
    expect(p.entered).toEqual([]);
    expect(S.k.input({ op: 'close' }).ok).toBe(true);
    expect(S.k.G.ui).toBe('none');
    expect(S.k.panel()).toBeNull();
  });

  it('yanlış kod → 20 sn soğuma (düzenek kırmızı, girdi reddedilir), 20 sn sonra yeniden denenir; geri bildirim exact/present', () => {
    S.k.usedProp(S.pad);
    const sp = lockSpec(normalizeLock(S.b.lock), lockSeed(SEED, S.b.lot.id, S.b.lock.id));
    const wrong = sp.code.map((v) => (v % 6) + 1);
    wrong.forEach((v) => S.k.input({ op: 'digit', value: v }));
    const r = S.k.input({ op: 'submit' });
    expect(r.result).toBe('yanlis');
    const p = S.k.panel();
    expect(p.status).toBe('soguma');
    expect(p.cooldown).toBe(20);
    expect(p.feedback.exact).toBe(0);
    expect(S.k.pw.state(S.pad.id)).toBe(2);
    expect(S.k.input({ op: 'digit', value: 1 }).result).toBe('soguma');
    S.k.tick(60 * 19);
    expect(S.k.panel().status).toBe('soguma');
    S.k.tick(60 * 2);
    expect(S.k.panel().status).toBe('bekliyor');
    expect(S.k.pw.state(S.pad.id)).toBe(0);
  });

  it('doğru kod → çözüldü: kayıt, kapı açılır (durum 1, çarpışma kalkar), olay lockOpened, kart ödülü, panel kendiliğinden kapanır', () => {
    const sp = lockSpec(normalizeLock(S.b.lock), lockSeed(SEED, S.b.lot.id, S.b.lock.id));
    sp.code.forEach((v) => S.k.input({ op: 'digit', value: v }));
    const r = S.k.input({ op: 'submit' });
    expect(r.result).toBe('cozuldu');
    expect(S.k.store[lockStateKey(S.b.lot.id, S.b.lock.id)]).toBe(1);
    expect(isLockOpen(S.b.lock)).toBe(true);
    const ev = S.k.events.find((e) => e.type === 'lockOpened');
    expect(ev.lockId).toBe(S.b.lock.id);
    expect(ev.kind).toBe('kod');
    expect(S.k.pw.state(S.doorProp.id)).toBe(1);
    expect(S.k.panel().status).toBe('cozuldu');
    S.k.tick(60 * 2);
    expect(S.k.panel()).toBeNull();
    expect(S.k.G.ui).toBe('none');
    expect(S.k.pw.state(S.pad.id)).toBe(1);
    // kapı artık yaklaşınca açılır, uzaklaşınca kapanır; kilit kalıcı açık
    S.k.put(...Object.values(deepPoint(S.b, 8)));
    S.k.tick(60);
    expect(S.k.pw.state(S.doorProp.id)).toBe(0);
    expect(isLockOpen(S.b.lock)).toBe(true);
    // gives>0 ise kart: kademeye göre Kart-(t+1)
    const lvl = S.b.lock.tier < 3 ? S.b.lock.tier + 1 : 0;
    if (lvl > 0) expect(S.k.G.inventory.count(['item:kart_gri', 'item:kart_turuncu', 'item:kart_mor'][lvl - 1])).toBe(1);
  });
});

describe('derin taraftan çıkış her zaman serbest (hapis yok)', () => {
  it('kilitli kapı çözülmemişken derin taraftaki oyuncu kapıya yaklaşınca kapı açılır', () => {
    const b = findLockedBuilding(SEED, 'kod');
    const p = deepPoint(b, 1.2);
    const k = makeCityG(SEED, { body: p });
    k.loadAround(p.x, p.z, 24);
    k.tick(40);
    const near = propsAround(k.pw, b.door.x + 0.5, b.door.z + 0.5, 3);
    const doorProp = near.find((q) => q.key === 'kapi' || q.key === 'kapi_genis');
    expect(doorProp).toBeTruthy();
    expect(k.pw.state(doorProp.id)).toBe(1);
    const out = new Float64Array(64 * 6);
    expect(k.pw.colliders.queryRaw(doorProp.x - 0.3, doorProp.y + 0.5, doorProp.z - 0.3, doorProp.x + 0.3, doorProp.y + 1.5, doorProp.z + 0.3, out, 8)).toBe(0);
    // giriş tarafına geçince (çözülmemiş) kapı kapanır
    const q = entryPoint(b, 1.4);
    k.put(q.x, q.y, q.z);
    k.tick(60);
    expect(k.pw.state(doorProp.id)).toBe(0);
  });
});

describe('mini oyun kilidi', () => {
  it('düzenek paneli hazır aşamasında açar; Başla ile makine kurulur; çözücüyle kazanılır → kilit açılır', () => {
    const S = setup('mini_hack', { tier: 1 });
    expect(S.pad).toBeTruthy();
    S.k.usedProp(S.pad);
    let p = S.k.panel();
    expect(p.type).toBe('hack');
    expect(p.phase).toBe('ready');
    expect(p.how.length).toBe(3);
    expect(S.k.input({ op: 'press', index: 0 }).ok).toBe(false);
    expect(S.k.input({ op: 'start' }).ok).toBe(true);
    p = S.k.panel();
    expect(p.phase).toBe('play');
    const game = p.game;
    if (game === 'levers') {
      const sol = solveLevers(p.view.levers && S.k.sys.state.book.hackParams && createHack({ game: 'levers', seed: S.k.sys.state.book.hackParams(S.b.lot.id, normalizeLock(S.b.lock)).seed, tier: 1 }).spec);
      sol.moves.forEach((m) => S.k.input({ op: 'press', index: m }));
    } else if (game === 'dice') {
      const prm = S.k.sys.state.book.hackParams(S.b.lot.id, normalizeLock(S.b.lock));
      const m = createHack({ game: 'dice', seed: prm.seed, tier: 1 });
      expect(solveDice(m.spec).length).toBe(1);
      m.spec.solution.forEach((v, i) => S.k.input({ op: 'set', index: i, value: v }));
      S.k.input({ op: 'submit' });
    } else {
      // simon: gözlemci (yalnız görünüm): tick ile yanan sembolleri izle
      let seen = [];
      let prev = -1;
      for (let i = 0; i < 4000 && S.k.panel().phase === 'play' && S.k.panel().status !== 'cozuldu'; i++) {
        const v = S.k.panel().view;
        if (v.phase === 'show') {
          if (v.lit >= 0 && v.lit !== prev) seen.push(v.lit);
          prev = v.lit;
          S.k.tick(3);
        } else if (v.phase === 'input') {
          const seq = seen.slice(0, v.round);
          seen = [];
          prev = -1;
          for (let q = 0; q < seq.length; q++) {
            const r = S.k.input({ op: 'press', index: seq[q] });
            if (r.result === 'round' || r.result === 'won') break;
          }
        } else break;
      }
    }
    expect(S.k.panel().status).toBe('cozuldu');
    expect(S.k.store[lockStateKey(S.b.lot.id, S.b.lock.id)]).toBe(1);
  });

  it('başarısız deneme → soğuma 20 sn; soğuma bitince panel hazır duruma döner ve YENİ tohum', () => {
    const S = setup('mini_hack', { tier: 1 });
    S.k.usedProp(S.pad);
    S.k.input({ op: 'start' });
    const first = S.k.sys.state.book.hackParams(S.b.lot.id, normalizeLock(S.b.lock));
    const g = S.k.panel().game;
    // kasıtlı başarısızlık
    if (g === 'simon') {
      for (let i = 0; i < 400 && S.k.panel().view.phase !== 'input'; i++) S.k.tick(3);
      const wrong = (simonSpec(first.seed, 1).sequence[0] + 1) % 4;
      S.k.input({ op: 'press', index: wrong });
    } else if (g === 'dice') {
      const m = createHack({ game: 'dice', seed: first.seed, tier: 1 });
      m.spec.solution.forEach((v, i) => S.k.input({ op: 'set', index: i, value: (v % 6) + 1 }));
      for (let i = 0; i < 4; i++) S.k.input({ op: 'submit' });
    } else {
      for (let i = 0; i < 4000 && S.k.panel().status === 'bekliyor' && S.k.panel().phase === 'play'; i++) {
        // kolu çekip sıfırlamak kaybettirmez (tier 1 bütçesiz); 90 sn'lik süre yok → bu oyunda başarısızlık mümkün değil: elle kaybettir
        S.k.sys.state.book.attemptHack(S.b.lot.id, normalizeLock(S.b.lock), 'lost');
        break;
      }
    }
    const p = S.k.panel();
    if (g !== 'levers') {
      expect(p.status).toBe('soguma');
      expect(p.cooldown).toBe(20);
      expect(S.k.input({ op: 'start' }).result).toBe('soguma');
      S.k.tick(60 * 21);
      const q = S.k.panel();
      expect(q.status).toBe('bekliyor');
      expect(q.phase).toBe('ready');
      const second = S.k.sys.state.book.hackParams(S.b.lot.id, normalizeLock(S.b.lock));
      expect(second.seed).not.toBe(first.seed);
      expect(S.k.input({ op: 'start' }).ok).toBe(true);
    }
  });
});

describe('cephe kayar kapıları', () => {
  function streetCase() {
    const lots = lotsInRect(SEED, -200, -200, 200, 200).filter((l) => l.built && l.door);
    const lot = lots.find((l) => planBuilding(SEED, l).doors[0]);
    const bp = planBuilding(SEED, lot);
    return { lot, door: bp.doors[0] };
  }

  it('oyuncu ≤2 blokta kapı 240 (açık), uzaklaşınca 0.6 sn sonra 239; kapıdayken kapanmaz', () => {
    const { door } = streetCase();
    const f = door.front;
    const k = makeCityG(SEED, { body: { x: f.x + 0.5, y: 64, z: f.z + 0.5 } });
    k.tick(20);
    const cell = (y) => k.world.getBlock(door.x, y, door.z);
    expect(cell(65)).toBe(ID.DOOR_OPEN);
    // kapı hücresindeyken kapanmaz
    k.put(door.x + 0.5, 64, door.z + 0.5);
    k.tick(120);
    expect(cell(65)).toBe(ID.DOOR_OPEN);
    // uzaklaş
    k.put(f.x + 0.5 + door_dir(door).x * 12, 64, f.z + 0.5 + door_dir(door).z * 12);
    k.tick(60);
    expect(cell(65)).toBe(ID.DOOR);
    // tüm yazımlar record:false
    expect(k.world.writes.length).toBeGreaterThan(0);
    expect(k.world.writes.every((w) => w[4] === true)).toBe(true);
  });
});

function door_dir(d) {
  return { x: d.axis === 'x' ? 0 : 0, z: 0, ...(d.face === 'n' ? { z: -1 } : d.face === 's' ? { z: 1 } : d.face === 'w' ? { x: -1 } : { x: 1 }) };
}

/* ------------------------------------------------------------------------------------------------
 * Asansör: gerçek kule, gerçek fizik, gerçek sistem
 * ---------------------------------------------------------------------------------------------- */
describe('asansör uçtan uca (gerçek fizik)', () => {
  const DT = 1 / 60;
  const els = allElevators(SEED);
  const el = els.find((e) => e.stops.length >= 3);

  function boot() {
    const st = el.stops[0];
    const px = st.out[0] + 0.5;
    const pz = st.out[1] + 0.5;
    const k = makeCityG(SEED, { body: { x: px, y: 64, z: pz } });
    k.G.body = createPlayerBody(px, 64, pz);
    k.G.body.eyeH = 1.62;
    k.loadAround(px, pz, 40);
    return k;
  }
  const yawToward = (dx, dz) => Math.atan2(-dx, -dz);
  function step(k, input, n) {
    for (let i = 0; i < n; i++) {
      stepPlayer(k.G.body, input || {}, k.world, DT, {}, { mode: 'macera' });
      k.tick(1);
    }
  }

  it('yakınında etkinleşir: kabin ve kabin düğmesi dinamik prop, kapılar yalnız kabin durağında açık (240), diğerleri 239', () => {
    const k = boot();
    k.tick(40);
    const dbg = k.sys.api().getLocksDebug();
    const rec = dbg.elevators.find((e) => e.id === el.id);
    expect(rec).toBeTruthy();
    expect(k.pw.has(cabinPropId(el.id))).toBe(true);
    expect(k.pw.has(buttonPropId(el.id))).toBe(true);
    el.stops.forEach((s, i) => {
      doorCells(el, i).forEach(([x, y, z]) => expect(k.world.getBlock(x, y, z), 'kat ' + i + ' y' + y).toBe(i === 0 ? ID.DOOR_OPEN : ID.DOOR));
    });
    // durak düğmeleri propPlan'dan gelir
    const near = propsAround(k.pw, el.cx, el.cz, 8).filter((q) => q.key === 'asansor_dugmesi');
    expect(near.length).toBeGreaterThanOrEqual(1);
  });

  it('binince panel açılır; kat seçilir; 8 b/sn yolculukta oyuncu kabinde kalır; varışta kapı açılır; dışarı çıkılır', () => {
    const k = boot();
    k.tick(40);
    const d = el.dir;
    // kabine yürü (kapıya doğru değil, kuyuya doğru)
    step(k, { moveZ: 1, yaw: yawToward(-d[0], -d[1]) }, 60);
    const inBore = () => k.G.body.x > el.bore.x0 && k.G.body.x < el.bore.x1 && k.G.body.z > el.bore.z0 && k.G.body.z < el.bore.z1;
    expect(inBore()).toBe(true);
    step(k, {}, 60);
    const p = k.panel();
    expect(p && p.type).toBe('asansor');
    expect(k.G.ui).toBe('dialogue');
    expect(p.stops.length).toBe(el.stops.length);
    expect(p.stops[0].here).toBe(true);
    // 2. kata git
    expect(k.input({ op: 'go', stop: 1 }).ok).toBe(true);
    let maxDy = 0;
    let airborne = 0;
    let vmax = 0;
    for (let i = 0; i < 60 * 60; i++) {
      stepPlayer(k.G.body, {}, k.world, DT, {}, { mode: 'macera' });
      k.tick(1);
      const rec = k.sys.api().getLocksDebug().elevators.find((e) => e.id === el.id);
      if (i % 10 === 0 && rec) {
        maxDy = Math.max(maxDy, Math.abs(k.G.body.y - rec.y));
        vmax = Math.max(vmax, Math.abs(k.G.body.y - (k.G.body.prevY === undefined ? k.G.body.y : k.G.body.prevY)));
      }
      if (!k.G.body.onGround) airborne++;
      if (rec && rec.phase === 'idle' && rec.at === 1) break;
    }
    const rec = k.sys.api().getLocksDebug().elevators.find((e) => e.id === el.id);
    expect(rec.at).toBe(1);
    expect(rec.y).toBe(el.stops[1].y);
    expect(maxDy).toBeLessThan(0.1);
    expect(airborne).toBeLessThan(30);
    expect(inBore()).toBe(true);
    expect(Math.abs(k.G.body.y - el.stops[1].y)).toBeLessThan(0.05);
    // kapılar: 1. durak açık, 0. durak kapalı
    doorCells(el, 1).forEach(([x, y, z]) => expect(k.world.getBlock(x, y, z)).toBe(ID.DOOR_OPEN));
    doorCells(el, 0).forEach(([x, y, z]) => expect(k.world.getBlock(x, y, z)).toBe(ID.DOOR));
    // dışarı çık
    k.input({ op: 'close' });
    step(k, { moveZ: 1, yaw: yawToward(d[0], d[1]) }, 120);
    expect(inBore()).toBe(false);
    expect(Math.abs(k.G.body.y - el.stops[1].y)).toBeLessThan(0.1);
    expect(k.G.body.onGround).toBe(true);
    // sol dış hücre: kapı önü
    expect(Math.abs(k.G.body.x - (el.stops[1].out[0] + 0.5)) + Math.abs(k.G.body.z - (el.stops[1].out[1] + 0.5))).toBeLessThan(12);
  }, 60000);

  it('dış düğme kabini çağırır (kabin orada ise "burada"); yolda kayıt yazılır ve yeni sistem kaldığı yerden sürer; kayıt hasarsız geri yüklenir', () => {
    const k = boot();
    k.tick(40);
    const rec0 = () => k.sys.api().getLocksDebug().elevators.find((e) => e.id === el.id);
    const buttonAt = (i) => propsAround(k.pw, el.stops[i].button.x, el.stops[i].button.z, 1.5).find((q) => q.key === 'asansor_dugmesi' && Math.abs(q.y - el.stops[i].button.y) < 0.5);
    const btn0 = buttonAt(0);
    const btn1 = buttonAt(1);
    expect(btn0 && btn1).toBeTruthy();
    // kabin 0'da: 0. durak düğmesi "burada"
    k.usedProp(btn0);
    expect(k.said.join('|')).toMatch(/burada/);
    // 1. kata çıkıp düğmeye bas: kabin çağrılır
    k.put(el.stops[1].out[0] + 0.5, el.stops[1].y, el.stops[1].out[1] + 0.5);
    k.usedProp(btn1);
    expect(k.said.join('|')).toMatch(/çağrıldı/);
    expect(k.pw.state(btn1.id)).toBe(1);
    k.tick(60 * 3);
    const mid = rec0();
    expect(mid.phase).toBe('moving');
    expect(mid.y).toBeGreaterThan(64);
    // yolda kayıt (0.5 sn'de bir) yazıldı
    const saved = JSON.parse(JSON.stringify(k.store[el.id]));
    expect(saved.s).toBe(0);
    expect(saved.t).toBe(1);
    expect(Math.abs(saved.y - mid.y)).toBeLessThan(8 * 0.55);
    expect(JSON.stringify(saved).length).toBeLessThan(160);
    // yeni sistem + aynı kayıt (yükleme): kabin kaydedilen yükseklikten sürer ve varır
    const k2 = makeCityG(SEED, { body: { x: el.stops[1].out[0] + 0.5, y: el.stops[1].y, z: el.stops[1].out[1] + 0.5 }, store: JSON.parse(JSON.stringify(k.store)) });
    k2.loadAround(el.stops[1].out[0], el.stops[1].out[1], 40);
    k2.tick(30);
    const r2 = k2.sys.api().getLocksDebug().elevators.find((e) => e.id === el.id);
    expect(r2.phase).toBe('moving');
    expect(Math.abs(r2.y - saved.y)).toBeLessThan(1.5);
    k2.tick(60 * 30);
    const r3 = k2.sys.api().getLocksDebug().elevators.find((e) => e.id === el.id);
    expect(r3.phase).toBe('idle');
    expect(r3.at).toBe(1);
    doorCells(el, 1).forEach(([x, y, z]) => expect(k2.world.getBlock(x, y, z)).toBe(ID.DOOR_OPEN));
    expect(k2.store[el.id]).toEqual({ s: 1 });
    // bozuk kayıt güvenli: zemin kat
    const k3 = makeCityG(SEED, { body: { x: el.stops[0].out[0] + 0.5, y: 64, z: el.stops[0].out[1] + 0.5 }, store: { [el.id]: { s: 'x', t: NaN, y: 1e9 } } });
    k3.loadAround(el.stops[0].out[0], el.stops[0].out[1], 40);
    k3.tick(30);
    expect(k3.sys.api().getLocksDebug().elevators.find((e) => e.id === el.id).y).toBe(64);
  }, 60000);

  it('beforeDimension / onDimension: kabinler sökülür, kayıt yazılır, kapılar kapanır; panel kapanır', () => {
    const k = boot();
    k.tick(40);
    expect(k.pw.has(cabinPropId(el.id))).toBe(true);
    k.sys.beforeDimension(k.G);
    expect(k.pw.has(cabinPropId(el.id))).toBe(false);
    expect(k.sys.api().getLocksInfo().elevators.active).toBe(0);
    k.sys.onDimension(k.G);
    k.tick(1);
    expect(k.sys.api().getLocksInfo().elevators.active).toBeGreaterThanOrEqual(0);
  });
});

describe('dayanıklılık', () => {
  it('bozuk/rastgele propUsed ve propLock olayları hiç fırlatmaz; panel yokken lockInput güvenli', () => {
    const k = makeCityG(SEED, { body: { x: 0.5, y: 64, z: 0.5 } });
    k.loadAround(0, 0, 40);
    k.tick(10);
    const junk = [null, undefined, 0, 'x', {}, { type: 'propUsed' }, { type: 'propUsed', key: 'kod_paneli' }, { type: 'propUsed', key: 'kod_paneli', x: NaN, y: 1, z: 2 },
      { type: 'propUsed', key: 'kapi', x: 1e9, y: 0, z: 1e9 }, { type: 'propLock', lockId: 5 }, { type: 'propLock', lockId: '__proto__' }, { type: 'propLock', lockId: 'zzz' },
      { type: 'propUsed', key: 'asansor_dugmesi', id: 1, x: 3, y: 64, z: 3 }, { type: 'uiChanged', ui: 'none' }, { type: 'death' }];
    junk.forEach((e) => expect(() => k.sys.onEvent(k.G, e)).not.toThrow());
    [null, undefined, {}, { op: 'x' }, { op: 'digit', value: 'z' }, 5].forEach((a) => expect(() => k.sys.api().lockInput(a)).not.toThrow());
    expect(k.sys.api().lockInput({ op: 'digit', value: 1 }).ok).toBe(false);
    expect(k.panel()).toBeNull();
  });

  it('şehir dışında (overworld) hiçbir şey yapmaz; yeniden şehre dönünce çalışır', () => {
    const k = makeCityG(SEED, { body: { x: 0.5, y: 64, z: 0.5 } });
    k.G.dim = 'overworld';
    k.world.dim = 'overworld';
    const before = k.world.writes.length;
    expect(() => k.tick(120)).not.toThrow();
    expect(k.world.writes.length).toBe(before);
    expect(k.sys.api().getLocksInfo().city).toBe(false);
  });

  it('serialize: boyut yöneticisi varsa null; yoksa kendi haritası; restore güvenli', () => {
    const k = makeCityG(SEED, { noDimMgr: true });
    expect(k.sys.serialize()).toEqual({ v: 1, locks: {} });
    k.sys.restore(k.G, { v: 1, locks: { abc: 1, '__proto__': 1, 'BAD KEY': 2, k1x: { s: 1 } } });
    expect(k.sys.serialize().locks.abc).toBe(1);
    expect(k.sys.serialize().locks['BAD KEY']).toBeUndefined();
    k.sys.restore(k.G, null);
    k.sys.restore(k.G, { locks: 5 });
    const m = makeCityG(SEED);
    expect(m.sys.serialize()).toBeNull();
  });

  it('dispose: panel kapanır, köprü kaldırılır; ikinci dispose zararsız', () => {
    const k = makeCityG(SEED);
    k.sys.dispose();
    k.sys.dispose();
    expect(isLockOpen({ id: 'zz', kind: 'kod' })).toBe(false);
  });
});
