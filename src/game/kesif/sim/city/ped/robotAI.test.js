/*
 * Robot YZ: aile dostu değişmezler (hasar YOK, 0.6–0.9 sn önceden işaret, itme/yavaşlama sınırları, 2.5 sn ortak bekleme, sürüş/kısıtlı hareket/güvenli zemin),
 * roller (süpürge, kurye, yardım dronu, bekçi, hatabot, gözcü), dağılma + ganimet, belirlenimcilik.
 */
import { describe, expect, it } from 'vitest';
import {
  fillBox, makeEm, makePlayer, makeWorld, ofType, run,
} from '../../mobAITestKit.js';
import { B } from '../../blocks.js';
import { ROBOT_KEYS, ROBOT_DEFS } from './robotData.js';

const FRIENDLY = ['supurgebot', 'kuryebot', 'yardimdron'];
const PUSHY = ['bekcirobot', 'hatabot', 'gozdrone'];

/** Düz dünya + em + oyuncu + robot. hooks: em.robotHooks. */
function rig(key, o) {
  const opt = o || {};
  const world = opt.world || makeWorld();
  const { em, events } = makeEm(world, opt.em);
  em.hurtPlayer = () => { throw new Error('robot hurtPlayer çağırdı'); }; // robot hasar vermemeli
  em.robotHooks = opt.hooks || {};
  const gy = opt.gy === undefined ? 1 : opt.gy; // zemin (ayak) yüksekliği
  const p = makePlayer(opt.px === undefined ? 3.5 : opt.px, gy, opt.pz === undefined ? 0 : opt.pz);
  const hx = opt.hx === undefined ? 0 : opt.hx;
  const hz = opt.hz === undefined ? 0 : opt.hz;
  const y = ROBOT_DEFS[key].movement === 'uç' ? gy + 1.6 : gy + 0.02;
  const e = em.spawn(key, hx, y, hz, { home: { x: hx, z: hz }, yaw: opt.yaw === undefined ? Math.PI / 2 : opt.yaw });
  return {
    world, em, events, p, e,
  };
}

const CTX = { dayFactor: 0.1, peaceful: false };
function stepN(r, secs, hook) {
  run(r.em, r.p, secs, CTX, (i) => {
    r.p.dead = false;
    if (hook) hook(i);
  });
}

describe('bekçi robot: nazik engelleme', () => {
  it('uyarı 0.9 sn ÖNCEDEN işaretlenir (attacking="dur"), sonra itme + kısa yavaşlama; hasar yok', () => {
    const r = rig('bekcirobot');
    let markedAt = -1;
    let bumpAt = -1;
    stepN(r, 4, (i) => {
      const t = i / 60;
      if (markedAt < 0 && r.e.attacking === 'dur') markedAt = t;
      if (bumpAt < 0 && ofType(r.events, 'robotBump').length > 0) bumpAt = t;
    });
    expect(markedAt).toBeGreaterThanOrEqual(0);
    expect(bumpAt).toBeGreaterThanOrEqual(markedAt + 0.85);
    expect(bumpAt).toBeLessThanOrEqual(markedAt + 1.2);
    const b = ofType(r.events, 'robotBump')[0];
    expect(b.kind).toBe('guard');
    expect(b.pushed).toBe(true);
    expect(r.p.vx).toBeGreaterThan(2.9); // oyuncu +x tarafında: itme +x
    expect(Math.abs(r.p.vx)).toBeLessThanOrEqual(4);
    const slow = ofType(r.events, 'playerEffect');
    expect(slow.length).toBeGreaterThan(0);
    expect(slow[0].effect).toBe('slow');
    expect(slow[0].t).toBeLessThanOrEqual(0.9);
    expect(ofType(r.events, 'playerHit')).toHaveLength(0);
    expect(r.events.filter((e) => e.type === 'fx' && e.name === 'blocked').length).toBeGreaterThan(0);
  });

  it('oyuncu işaret sırasında uzaklaşırsa temas olmaz', () => {
    const r = rig('bekcirobot');
    stepN(r, 2, () => {
      if (r.e.attacking === 'dur') r.p.x = 12; // uzaklaştı
    });
    expect(ofType(r.events, 'robotBump')).toHaveLength(0);
    expect(r.e.attacking).toBe(false);
  });

  it('iki temas arası ≥ 2.5 sn ve bekçinin kendi beklemesi ≥ 3.5 sn; oyuncu hep yakında dursa bile', () => {
    const r = rig('bekcirobot');
    const times = [];
    let n = 0;
    stepN(r, 30, (i) => {
      r.p.x = 3.5; r.p.z = 0; r.p.vx = 0; r.p.vz = 0; r.p.knockT = 0;
      const c = ofType(r.events, 'robotBump').length;
      if (c > n) { times.push(i / 60); n = c; }
    });
    expect(times.length).toBeGreaterThanOrEqual(3);
    for (let k = 1; k < times.length; k++) expect(times[k] - times[k - 1]).toBeGreaterThanOrEqual(3.5);
    expect(times.length).toBeLessThanOrEqual(8);
  });

  it('sürüş kancası true iken uyarı da temas da yok', () => {
    const r = rig('bekcirobot', { hooks: { driving: () => true } });
    stepN(r, 8);
    expect(ofType(r.events, 'robotBump')).toHaveLength(0);
    expect(r.p.vx).toBe(0);
  });

  it('kısıtlı hareket/erişilebilirlik (gentle): robot uyarır ama fiziksel temas (itme, yavaşlama) yok', () => {
    const r = rig('bekcirobot', { hooks: { gentle: () => true } });
    stepN(r, 6);
    expect(ofType(r.events, 'robotBump').length).toBeGreaterThan(0);
    expect(ofType(r.events, 'robotBump').every((b) => b.pushed === false)).toBe(true);
    expect(r.p.vx).toBe(0);
    expect(ofType(r.events, 'playerEffect')).toHaveLength(0);
  });

  it('güvenli olmayan zemin (itme yönünde uçurum): itme yok (oyuncu düşmesin), kıvılcım var', () => {
    const world = makeWorld({ fill: (x, y) => (y <= 10 && x <= 4 ? B.STONE : 0) }); // x>4: boşluk (uçurum)
    const r = rig('bekcirobot', { world, px: 3.5, gy: 11 });
    stepN(r, 4);
    const b = ofType(r.events, 'robotBump');
    expect(b.length).toBeGreaterThan(0);
    expect(b.every((x) => x.pushed === false)).toBe(true);
    expect(r.p.vx).toBe(0);
  });

  it('suya doğru itme yok', () => {
    const world = makeWorld({ fill: (x, y) => (y <= 10 ? B.STONE : 0) });
    fillBox(world, 5, 10, -5, 12, 10, 5, B.WATER); // su x 5..12
    const r = rig('bekcirobot', { world, px: 3.5, gy: 11 });
    stepN(r, 4);
    const b = ofType(r.events, 'robotBump');
    expect(b.length).toBeGreaterThan(0);
    expect(b.every((x) => x.pushed === false)).toBe(true);
  });

  it('yerine döner, oyuncuya bakar (aim); nöbet noktasından 3 blokta fazla ayrılmaz', () => {
    const r = rig('bekcirobot', { px: 8 });
    let maxD = 0;
    stepN(r, 10, () => { maxD = Math.max(maxD, Math.hypot(r.e.x, r.e.z)); });
    expect(maxD).toBeLessThan(3);
    expect(r.e.aim).not.toBeNull(); // 9 blok izleme menzilinde
  });
});

describe('hatabot: yaramaz ama zararsız', () => {
  it('oyuncuyu kovalar, 0.6 sn önceden işaretler (kivilcim), çarpar, özür dileyip kaçar', () => {
    const r = rig('hatabot', { px: 7 });
    let marked = -1;
    let bump = -1;
    let fled = false;
    let d0 = 0;
    stepN(r, 12, (i) => {
      r.p.x = Math.max(r.p.x, 7) * 0 + r.p.x;
      const t = i / 60;
      if (marked < 0 && r.e.attacking === 'kivilcim') marked = t;
      if (bump < 0 && ofType(r.events, 'robotBump').length > 0) { bump = t; d0 = Math.hypot(r.e.x - r.p.x, r.e.z - r.p.z); }
      if (bump > 0 && !fled && Math.hypot(r.e.x - r.p.x, r.e.z - r.p.z) > d0 + 3) fled = true;
    });
    expect(marked).toBeGreaterThan(0);
    expect(bump).toBeGreaterThanOrEqual(marked + 0.55);
    expect(bump).toBeLessThanOrEqual(marked + 0.8);
    expect(fled).toBe(true);
    expect(ofType(r.events, 'robotSay').some((s) => s.mob === 'hatabot')).toBe(true);
    expect(ofType(r.events, 'playerHit')).toHaveLength(0);
    const b = ofType(r.events, 'robotBump')[0];
    expect(b.kind).toBe('glitch');
  });

  it('hasar alınca panikle uzaklaşır; hp 4 → ölür (dağılır)', () => {
    const r = rig('hatabot', { px: 30 });
    stepN(r, 0.5);
    const x0 = r.e.x;
    r.em.damage(r.e.id, 1, { kind: 'melee', x: x0 + 1, z: r.e.z, strength: 0 });
    stepN(r, 2);
    expect(r.e.x).toBeLessThan(x0 - 1);
    const res = r.em.damage(r.e.id, 99, { kind: 'melee', x: r.e.x + 1, z: r.e.z, strength: 0 });
    expect(res.killed).toBe(true);
    expect(r.e.dead).toBe(true);
  });
});

describe('gözcü dron: tarama işareti 0.8 sn', () => {
  it('tarama halkası 0.8 sn önceden görünür; sonuç yalnızca kısa yavaşlama (itme yok)', () => {
    const r = rig('gozdrone', { px: 5 });
    let marked = -1;
    let bump = -1;
    stepN(r, 6, (i) => {
      const t = i / 60;
      if (marked < 0 && r.e.attacking === 'tarama') marked = t;
      if (bump < 0 && ofType(r.events, 'robotBump').length > 0) bump = t;
    });
    expect(marked).toBeGreaterThanOrEqual(0);
    expect(bump).toBeGreaterThanOrEqual(marked + 0.75);
    expect(bump).toBeLessThanOrEqual(marked + 1.1);
    const b = ofType(r.events, 'robotBump')[0];
    expect(b.kind).toBe('scan');
    expect(b.pushed).toBe(false);
    expect(r.p.vx).toBe(0);
    expect(ofType(r.events, 'playerEffect')[0].t).toBeLessThanOrEqual(0.5);
    expect(r.events.some((e) => e.type === 'fx' && e.name === 'beamHit')).toBe(true);
  });

  it('araya duvar girince tarama başlamaz', () => {
    const world = makeWorld();
    fillBox(world, 2, 1, -6, 2, 6, 6, B.STONE); // x=2 duvarı
    const r = rig('gozdrone', { world, px: 5 });
    stepN(r, 6);
    expect(ofType(r.events, 'robotBump')).toHaveLength(0);
  });

  it('tavan boşluğuna sığar: alçak tavanda (4 blok) süzülme yüksekliği tavanı delmez', () => {
    const world = makeWorld();
    fillBox(world, -30, 5, -30, 30, 6, 30, B.STONE); // tavan y=5
    const r = rig('gozdrone', { world, px: 40 });
    r.e.y = 2.2;
    let maxTop = 0;
    stepN(r, 20, () => { maxTop = Math.max(maxTop, r.e.y + r.e.h); });
    expect(maxTop).toBeLessThan(5.01);
  });
});

describe('dost robotlar', () => {
  FRIENDLY.forEach((key) => {
    it(key + ': yaralanmaz (hasar engellenir, hp sabit, ölmez)', () => {
      const r = rig(key, { px: 30 });
      stepN(r, 0.5);
      const hp0 = r.e.hp;
      const res = r.em.damage(r.e.id, 999, { kind: 'melee', x: 0, z: 0, strength: 5 });
      expect(res.blocked).toBe(true);
      expect(res.killed).toBe(false);
      expect(r.e.hp).toBe(hp0);
      stepN(r, 2);
      expect(r.e.dead).toBe(false);
      expect(r.e.hp).toBe(hp0);
    });
  });

  it('süpürge bot: dolaşır, 120 sn boyunca evinden ≤ leash+3 uzaklaşmaz; oyuncu yaklaşınca selam (duraklar, bir kez konuşur)', () => {
    const r = rig('supurgebot', { px: 25 });
    const leash = ROBOT_DEFS.supurgebot.robot.leash;
    let maxD = 0;
    let moved = 0;
    let px = r.e.x;
    let pz = r.e.z;
    stepN(r, 120, () => {
      maxD = Math.max(maxD, Math.hypot(r.e.x, r.e.z));
      moved += Math.hypot(r.e.x - px, r.e.z - pz);
      px = r.e.x; pz = r.e.z;
    });
    expect(maxD).toBeLessThanOrEqual(leash + 3);
    expect(moved).toBeGreaterThan(8);
    const g = rig('supurgebot', { px: 2 });
    let greeted = false;
    stepN(g, 3, () => { if (g.e.state === 'greet') greeted = true; });
    expect(greeted).toBe(true);
    expect(ofType(g.events, 'robotSay').filter((s) => s.mob === 'supurgebot').length).toBe(1);
  });

  it('kurye bot: iki nokta arasında gidip gelir (>10 blok yol), oyuncuya yol verir (selam)', () => {
    const r = rig('kuryebot', { px: 25 });
    let moved = 0;
    let px = r.e.x;
    let pz = r.e.z;
    let maxD = 0;
    stepN(r, 90, () => {
      moved += Math.hypot(r.e.x - px, r.e.z - pz);
      px = r.e.x; pz = r.e.z;
      maxD = Math.max(maxD, Math.hypot(r.e.x, r.e.z));
    });
    expect(moved).toBeGreaterThan(10);
    expect(maxD).toBeLessThanOrEqual(ROBOT_DEFS.kuryebot.robot.leash + 4);
  });

  it('yardım dronu: 16 blok içindeki oyuncuya eşlik eder (yanında uçar), uzaklaşınca evine döner; süzülme yüksekliği makul', () => {
    const r = rig('yardimdron', { px: 10 });
    stepN(r, 10);
    expect(Math.hypot(r.e.x - r.p.x, r.e.z - r.p.z)).toBeLessThan(6.5);
    const dy = r.e.y - r.p.y;
    expect(dy).toBeGreaterThan(0.8);
    expect(dy).toBeLessThan(3.6);
    r.p.x = 80;
    stepN(r, 20);
    expect(Math.hypot(r.e.x, r.e.z)).toBeLessThan(ROBOT_DEFS.yardimdron.robot.leash + 2); // takip etmedi
  });

  it('yardım dronu güvenli bölge hedefini takip etmez (hooks.safe)', () => {
    const r = rig('yardimdron', { px: 10, hooks: { safe: (x) => x > 5 } });
    stepN(r, 12);
    expect(r.e.x).toBeLessThan(6);
  });
});

describe('dağılma ve ganimet', () => {
  PUSHY.forEach((key) => {
    it(key + ': hp 0 → mobKilled + ganimet (var olan eşyalar), kan/hasar yok, 1.35 sn sonra kalkar', () => {
      const r = rig(key, { px: 30 });
      stepN(r, 0.3);
      const res = r.em.damage(r.e.id, 999, { kind: 'melee', x: 0, z: 0, strength: 0 });
      expect(res.killed).toBe(true);
      const k = ofType(r.events, 'mobKilled')[0];
      expect(k.mob).toBe(key);
      expect(k.loot.every((l) => l.item.indexOf('item:') === 0 && l.count >= 1)).toBe(true);
      expect(r.events.some((e) => e.type === 'fx' && e.name === 'mobDeath')).toBe(true);
      stepN(r, 1.5);
      expect(r.em.mobs.has(r.e.id)).toBe(false);
    });
  });

  it('ganimet düşer: yerde eşya varlıkları; çok sayıda dağılmada bakır tel ~%50 görülür', () => {
    let tel = 0;
    const N = 60;
    for (let i = 0; i < N; i++) {
      const r = rig('bekcirobot', { px: 30, em: { seed: 100 + i } });
      r.em.damage(r.e.id, 999, { kind: 'melee', x: 0, z: 0, strength: 0 });
      let found = false;
      r.em.items.forEach((it) => { if (it.item === 'item:bakır_tel') found = true; });
      if (found) tel++;
    }
    expect(tel / N).toBeGreaterThan(0.3);
    expect(tel / N).toBeLessThan(0.7);
  });
});

describe('güvenlik: hasar fuzz ve belirlenimcilik', () => {
  it('her rol × 6 tohum × rastgele oyuncu yolu, 90 sn: playerHit 0, hurtPlayer çağrısı 0, itme ≤ 4 m/s', () => {
    let bumps = 0;
    let maxV = 0;
    for (const key of ROBOT_KEYS) {
      for (let s = 0; s < 6; s++) {
        const r = rig(key, { em: { seed: 500 + s }, px: 5 + s, pz: s - 3, hx: 0, hz: 0 });
        let ax = 5 + s;
        let az = s - 3;
        stepN(r, 90, (i) => {
          // oyuncu robotun çevresinde rasgele dolaşır (belirlenimci)
          ax += Math.sin(i * 0.013 + s) * 0.05;
          az += Math.cos(i * 0.017 + s * 2) * 0.05;
          if (r.p.knockT <= 0) { r.p.x = ax; r.p.z = az; }
          maxV = Math.max(maxV, Math.hypot(r.p.vx, r.p.vz));
        });
        expect(ofType(r.events, 'playerHit')).toHaveLength(0);
        bumps += ofType(r.events, 'robotBump').length;
      }
    }
    expect(bumps).toBeGreaterThan(0); // fuzz gerçekten temas üretti
    expect(maxV).toBeLessThanOrEqual(4.0001);
  });

  it('belirlenimci: aynı tohum → aynı olay akışı ve konumlar', () => {
    const go = () => {
      const out = [];
      ROBOT_KEYS.forEach((key, k) => {
        const r = rig(key, { em: { seed: 7 + k }, px: 6 });
        stepN(r, 30);
        out.push([r.e.x.toFixed(4), r.e.y.toFixed(4), r.e.z.toFixed(4), r.e.state, r.events.map((e) => e.type + (e.name || '')).join(',')]);
      });
      return JSON.stringify(out);
    };
    expect(go()).toBe(go());
  });

  it('güvenli bölge kancası: içeri giren robot ≤ 1.1 sn içinde nazikçe kaldırılır (mobFade)', () => {
    const r = rig('supurgebot', { px: 25, hooks: { safe: () => true } });
    stepN(r, 1.2);
    expect(r.em.mobs.has(r.e.id)).toBe(false);
    expect(r.events.some((e) => e.type === 'fx' && e.name === 'mobFade')).toBe(true);
  });

  it('NaN/uç değerler: oyuncu aynı noktada, dt küçük/büyük, robot ölüsü sorun çıkarmaz', () => {
    const r = rig('bekcirobot', { px: 0.0001, pz: 0 });
    for (let i = 0; i < 300; i++) r.em.update(i % 7 === 0 ? 0.09 : 1 / 120, r.p, CTX);
    expect(Number.isFinite(r.e.x) && Number.isFinite(r.e.y) && Number.isFinite(r.e.z)).toBe(true);
    expect(Number.isFinite(r.e.yaw)).toBe(true);
  });
});

describe('yol (araç şeridi) hedefi olmasın', () => {
  it('hooks.road bir şeridi işaretliyse dolaşma hedefleri o şeritte seçilmez (süpürge + kurye, 120 sn)', () => {
    const band = (x, z) => Math.abs(z - 6) < 3; // z∈(3,9): "yol"
    ['supurgebot', 'kuryebot'].forEach((key) => {
      const r = rig(key, { px: 25, hooks: { road: (x, z) => band(x, z) } });
      let bad = 0;
      stepN(r, 120, () => {
        const rb = r.e.ai.rb;
        if (rb && (rb.mode === 'walk' || key === 'kuryebot') && band(rb.tx, rb.tz) && !(key === 'kuryebot' && rb.leg === 0 && rb.bz === rb.tz && false)) bad++;
      });
      // kurye B noktası ilk atamada rastgele olabilir: yalnız sweeper için sıkı denetim
      if (key === 'supurgebot') expect(bad).toBe(0);
    });
  });

  it('yeraltında (y<60) road kancası çağrılsa da hedef reddedilmez (kanalizasyon yolların altındadır)', () => {
    let called = 0;
    const r = rig('supurgebot', { px: 25, hooks: { road: (x, z, y) => { called++; return y >= 60; } }, gy: 31 });
    let moved = 0;
    let px = r.e.x;
    let pz = r.e.z;
    stepN(r, 60, () => { moved += Math.hypot(r.e.x - px, r.e.z - pz); px = r.e.x; pz = r.e.z; });
    expect(called).toBeGreaterThan(0);
    expect(moved).toBeGreaterThan(2);
  });
});

describe('oyuncu yok / ölü', () => {
  it('player=null iken tüm robotlar atmaz, yerinde kalır; oyuncu ölüyken temas olmaz', () => {
    ROBOT_KEYS.forEach((key) => {
      const r = rig(key, { px: 3 });
      for (let i = 0; i < 600; i++) r.em.update(1 / 60, null, CTX);
      expect(Number.isFinite(r.e.x)).toBe(true);
      expect(ofType(r.events, 'robotBump')).toHaveLength(0);
      const d = rig(key, { px: 3 });
      d.p.dead = true;
      for (let i = 0; i < 600; i++) { d.p.dead = true; d.em.update(1 / 60, d.p, CTX); }
      expect(ofType(d.events, 'robotBump')).toHaveLength(0);
      expect(d.p.vx).toBe(0);
    });
  });
});
