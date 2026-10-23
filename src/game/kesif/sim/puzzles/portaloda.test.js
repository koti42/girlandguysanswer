import { describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import { raycastBlocks } from '../raycast.js';
import { seededRandom } from '../rng.js';
import {
  FakeWorld, buildPuzzleRoom, checkPuzzleConformance, fakeManager, frame, getPuzzle, simulate,
} from './index.js';
import portaloda from './portaloda.js';
import {
  PORTAL_GRACE, PORTAL_MAX_CHARGES, findPanel, frontCells, placePortal, planSolution, portalAt, portalLayout, portalSize,
  rotateVelocity, teleportTarget,
} from './portalodaLogic.js';
import { yawOfDir } from './ps2Shared.js';

const TYPE = 'portaloda';
const ORIGIN = { x: -20, y: 50, z: 35 };

function setup(difficulty, facing, seed) {
  const sd = seed === undefined ? 9 : seed;
  const f = facing === undefined ? 0 : facing;
  const h = fakeManager({ seed: sd });
  const desc = {
    id: 'po:' + difficulty + ':' + f + ':' + sd, type: TYPE, origin: ORIGIN, facing: f, difficulty, zone: 3,
  };
  buildPuzzleRoom(desc, { seed: sd, setBlock: h.world.writer() });
  h.mgr.register(desc.id, desc);
  const F = frame({
    origin: ORIGIN, facing: f, seed: 0, setBlock() {},
  });
  return {
    h, desc, F, sd, S: () => h.mgr.get(desc.id).state,
  };
}

function ev(type, w, extra) {
  return Object.assign({
    type, x: w.x, y: w.y, z: w.z,
  }, extra);
}

/** Panel p'nin ortasındaki duvar hücresine atış olayı. */
function shot(ctx, panelId, color, dy, dz) {
  const p = ctx.S().panels.find((q) => q.id === panelId);
  const b = p.box;
  const x = ((b.x0 + b.x1) >> 1) + (p.nz !== 0 && dz ? dz : 0);
  const z = ((b.z0 + b.z1) >> 1) + (p.nx !== 0 && dz ? dz : 0);
  const y = dy === undefined ? (b.y0 + b.y1) >> 1 : b.y0 + dy;
  return ctx.h.mgr.handleInteract({
    type: 'portalShot', x, y, z, face: { nx: p.nx, ny: 0, nz: p.nz }, color,
  });
}

function fresh(ctx) {
  const w = new FakeWorld({ seed: ctx.sd });
  buildPuzzleRoom(ctx.desc, { seed: ctx.sd, setBlock: w.writer() });
  return w;
}

describe('portaloda — kayıt ve uyumluluk', () => {
  it('kayıtlı, Türkçe ad, footprint tutarlı', () => {
    const impl = getPuzzle(TYPE);
    expect(impl).toBeTruthy();
    expect(portaloda).toBe(impl);
    expect(impl.name).toBe('Portal Odası');
    for (let d = 1; d <= 5; d++) expect(impl.footprint(d)).toEqual(Object.assign(portalSize(d), { margin: 2 }));
  });

  it('kit uyumluluk denetimi sorunsuz', () => {
    expect(checkPuzzleConformance(TYPE)).toEqual([]);
  }, 180000);
});

describe('portaloda — saf portal işlevleri', () => {
  function state(difficulty, facing) {
    const ctx = setup(difficulty, facing);
    return JSON.parse(JSON.stringify(ctx.S()));
  }

  it('placePortal girdiyi değiştirmez; şarj düşer; aynı renk taşınır; üst üste gelmez', () => {
    const S = state(1, 0);
    const snap = JSON.stringify(S);
    const E = S.panels.find((p) => p.id === 'E');
    const X = S.panels.find((p) => p.id === 'X');
    const cell = (p) => ({
      x: (p.box.x0 + p.box.x1) >> 1, y: p.box.y0, z: (p.box.z0 + p.box.z1) >> 1, nx: p.nx, ny: 0, nz: p.nz,
    });
    const r1 = placePortal(S, cell(E), 'mavi');
    expect(JSON.stringify(S)).toBe(snap);
    expect(r1.ok).toBe(true);
    expect(r1.state.charges).toBe(PORTAL_MAX_CHARGES - 1);
    expect(r1.portal.cells.length).toBe(2);
    expect(r1.portal.cells[1].y).toBe(r1.portal.cells[0].y + 1);
    expect(r1.portal.nx).toBe(E.nx);
    expect(r1.message).toMatch(/Mavi portal açıldı/);
    // aynı yere ikinci kez: reddedilir, şarj harcanmaz
    const r2 = placePortal(r1.state, cell(E), 'mavi');
    expect(r2.ok).toBe(false);
    expect(r2.state).toBe(r1.state);
    // turuncu aynı hücrelere: üst üste
    const r3 = placePortal(r1.state, cell(E), 'turuncu');
    expect(r3.ok).toBe(false);
    expect(r3.reason).toBe('ustuste');
    // taşıma: mavi başka yere
    const r4 = placePortal(r1.state, { ...cell(E), z: cell(E).z + 1 }, 'mavi');
    expect(r4.ok).toBe(true);
    expect(r4.removed.z).toBe(r1.portal.z);
    expect(r4.state.charges).toBe(PORTAL_MAX_CHARGES - 2);
    // turuncu X'e
    const r5 = placePortal(r4.state, cell(X), 'turuncu');
    expect(r5.ok).toBe(true);
    expect(portalAt(r5.state, r5.portal.x, r5.portal.y, r5.portal.z)).toBe('turuncu');
    expect(portalAt(r5.state, r5.portal.x, r5.portal.y + 1, r5.portal.z)).toBe('turuncu');
    expect(portalAt(r5.state, r5.portal.x, r5.portal.y + 2, r5.portal.z)).toBeNull();
  });

  it('geçersiz atışlar şarj harcamaz: yatay yüzey, panel dışı, yanlış renk, şarjsız', () => {
    const S = state(3, 1);
    const F = S.panels.find((p) => p.id === 'F');
    const G = S.panels.find((p) => p.id === 'G');
    const cell = (p) => ({
      x: (p.box.x0 + p.box.x1) >> 1, y: (p.box.y0 + p.box.y1) >> 1, z: (p.box.z0 + p.box.z1) >> 1, nx: p.nx, ny: 0, nz: p.nz,
    });
    expect(placePortal(S, { ...cell(F), nx: 0, ny: 1, nz: 0 }, 'mavi').reason).toBe('yatay');
    expect(placePortal(S, { ...cell(F), x: cell(F).x + 3 }, 'mavi').reason).toBe('panel');
    expect(placePortal(S, { ...cell(F), nx: -F.nx, nz: -F.nz }, 'mavi').reason).toBe('panel');
    const wrong = placePortal(S, cell(F), 'turuncu');
    expect(wrong.ok).toBe(false);
    expect(wrong.reason).toBe('renk');
    expect(wrong.message).toMatch(/yalnızca mavi/);
    expect(placePortal(S, cell(G), 'mavi').reason).toBe('renk');
    expect(placePortal(S, cell(F), 'yesil').ok).toBe(false);
    expect(placePortal(S, null, 'mavi').ok).toBe(false);
    for (const r of [wrong]) expect(r.state).toBe(S);
    const empty = { ...S, charges: 0 };
    expect(placePortal(empty, cell(F), 'mavi').reason).toBe('sarj');
  });

  it('teleportTarget: çıkış hücresi portalın bir ilerisi; bakış/hız dönüşü giriş→çıkış yönünü verir', () => {
    for (let f = 0; f < 4; f++) {
      for (let d = 1; d <= 5; d++) {
        const S = state(d, f);
        const mavi = S.panels.find((p) => p.acc !== 'turuncu');
        const tur = S.panels.find((p) => p.acc !== 'mavi' && p.id !== mavi.id);
        const cell = (p) => ({
          x: (p.box.x0 + p.box.x1) >> 1, y: p.box.y0, z: (p.box.z0 + p.box.z1) >> 1, nx: p.nx, ny: 0, nz: p.nz,
        });
        const a = placePortal(S, cell(mavi), 'mavi');
        const b = placePortal(a.state, cell(tur), 'turuncu');
        const st = b.state;
        expect(teleportTarget(a.state, 'mavi')).toBeNull();
        const t1 = teleportTarget(st, 'mavi');
        const t2 = teleportTarget(st, st.portals.turuncu);
        expect(t1.cell.x).toBe(st.portals.turuncu.x + st.portals.turuncu.nx);
        expect(t1.cell.z).toBe(st.portals.turuncu.z + st.portals.turuncu.nz);
        expect(t1.y).toBe(st.portals.turuncu.y);
        expect(t1.x).toBeCloseTo(t1.cell.x + 0.5, 6);
        // giriş portalına doğru yürüyen oyuncunun hızı (−normal) çıkışta +normal olur
        const vin = [-st.portals.mavi.nx * 4, -st.portals.mavi.nz * 4];
        const vout = rotateVelocity(vin[0], vin[1], t1.yawDelta);
        expect(vout[0]).toBeCloseTo(st.portals.turuncu.nx * 4, 6);
        expect(vout[1]).toBeCloseTo(st.portals.turuncu.nz * 4, 6);
        // bakış yönü (yaw) da aynı dönüşle çıkış yönüne bakar
        const yawIn = yawOfDir(-st.portals.mavi.nx, -st.portals.mavi.nz);
        const yawOut = yawIn + t1.yawDelta;
        expect(Math.cos(yawOut)).toBeCloseTo(Math.cos(t1.yaw), 6);
        expect(Math.sin(yawOut)).toBeCloseTo(Math.sin(t1.yaw), 6);
        // dönüş yönü: turuncudan girip mavidan çıkış
        const vin2 = [-st.portals.turuncu.nx * 4, -st.portals.turuncu.nz * 4];
        const back = rotateVelocity(vin2[0], vin2[1], t2.yawDelta);
        expect(back[0]).toBeCloseTo(st.portals.mavi.nx * 4, 6);
        expect(back[1]).toBeCloseTo(st.portals.mavi.nz * 4, 6);
      }
    }
  });
});

describe('portaloda — yerleşim, çözücü ve fiziksel doğrulama', () => {
  it('soyut çözücü: en az şarj zorluk basamağıyla (2,2,3,3,3) ve 3 şarjla çözülür; kesinlikle takılmaz', () => {
    const expected = [2, 2, 3, 3, 3];
    for (let d = 1; d <= 5; d++) {
      for (let s = 1; s <= 12; s++) {
        const L = portalLayout(d, seededRandom(s * 7 + d));
        const plan = planSolution(L, PORTAL_MAX_CHARGES);
        expect(plan, 'd' + d + ' s' + s).not.toBeNull();
        expect(plan.placements).toBe(expected[d - 1]);
        expect(planSolution(L, expected[d - 1] - 1)).toBeNull();
      }
    }
  });

  it('ayna: bazı tohumlar platformu solda kurar; iki düzen de aynı çözüm maliyetinde', () => {
    const mirrors = new Set();
    for (let s = 1; s <= 20; s++) mirrors.add(portalLayout(3, seededRandom(s)).mirror);
    expect(mirrors.size).toBe(2);
  });

  it('yerleşim sınırları: paneller duvar içinde, çukur satırlarından ayrık, kapı koridoru (−1..1) boş', () => {
    for (let d = 1; d <= 5; d++) {
      for (let m = 0; m < 2; m++) {
        let L;
        for (let s = 1; s < 40; s++) {
          L = portalLayout(d, seededRandom(s));
          if (L.mirror === (m === 1)) break;
        }
        for (const p of L.panels) {
          if (p.wall === 'B') {
            expect(p.a0).toBeGreaterThanOrEqual(L.x0);
            expect(p.a1).toBeLessThanOrEqual(L.x1);
            expect(p.a1 < -1 || p.a0 > 1).toBe(true);
          } else {
            expect(p.a0).toBeGreaterThanOrEqual(0);
            expect(p.a1).toBeLessThanOrEqual(L.d - 1);
            if (L.pit) expect(p.a1 < L.pit.lz0 || p.a0 > L.pit.lz1).toBe(true);
          }
          expect(p.ly1 - p.ly0).toBeGreaterThanOrEqual(1);
          expect(p.ly1).toBeLessThanOrEqual(L.h - 2);
        }
        expect(L.platform.lx0 <= 1 && L.platform.lx1 >= -1).toBe(false);
        if (L.ledge) expect(L.ledge.lx0 <= 1 && L.ledge.lx1 >= -1).toBe(false);
      }
    }
  });

  it('fiziksel LOS: her panel, vis dediği her bölgeden gerçekten ışın izlemeyle vurulabilir', () => {
    for (let d = 1; d <= 5; d++) {
      for (const f of [0, 2]) {
        const ctx = setup(d, f, d + 3);
        const L = ctx.S().lay;
        const S = ctx.S();
        for (const p of S.panels) {
          for (const zid of p.vis) {
            const zone = L.zones.find((z) => z.id === zid);
            let hitAny = false;
            for (let lz = zone.lz0; lz <= zone.lz1 && !hitAny; lz++) {
              for (let lx = zone.lx0; lx <= zone.lx1 && !hitAny; lx++) {
                const feet = ctx.F.toWorld(lx, zone.y, lz);
                const here = ctx.h.world.getBlock(feet.x, feet.y, feet.z);
                const head = ctx.h.world.getBlock(feet.x, feet.y + 1, feet.z);
                const floor = ctx.h.world.getBlock(feet.x, feet.y - 1, feet.z);
                if (here !== 0 || head !== 0 || floor === 0 || floor === B.PRESSURE_PLATE) continue;
                const eye = { x: feet.x + 0.5, y: feet.y + 1.62, z: feet.z + 0.5 };
                for (let y = p.box.y0; y <= p.box.y1 && !hitAny; y++) {
                  for (let z = p.box.z0; z <= p.box.z1 && !hitAny; z++) {
                    for (let x = p.box.x0; x <= p.box.x1 && !hitAny; x++) {
                      const target = {
                        x: x + 0.5 + 0.49 * p.nx, y: y + 0.5, z: z + 0.5 + 0.49 * p.nz,
                      };
                      const dir = { x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z };
                      const r = raycastBlocks(ctx.h.world, eye, dir, 60);
                      if (r && r.x === x && r.y === y && r.z === z && r.face.nx === p.nx && r.face.nz === p.nz) hitAny = true;
                    }
                  }
                }
              }
            }
            expect(hitAny, 'd' + d + ' f' + f + ' panel ' + p.id + ' görünür olmalı: ' + zid).toBe(true);
          }
        }
      }
    }
  });

  it('güvenli iniş: her panelin her olası portal konumunun çıkış hücresi hava, başı hava, zemin ≤ 3 altta', () => {
    for (let d = 1; d <= 5; d++) {
      for (const f of [0, 1, 3]) {
        const ctx = setup(d, f, d + 11);
        const S = ctx.S();
        for (const p of S.panels) {
          for (const c of frontCells(p)) {
            const x = c.x + p.nx;
            const z = c.z + p.nz;
            for (let yb = p.box.y0; yb <= p.box.y1 - 1; yb++) {
              // portal hücreleri (ön) hava olmalı
              expect(ctx.h.world.getBlock(c.x, yb, c.z), 'ön hücre ' + p.id).toBe(0);
              expect(ctx.h.world.getBlock(c.x, yb + 1, c.z)).toBe(0);
              expect(ctx.h.world.getBlock(x, yb, z), 'çıkış ayak ' + p.id).toBe(0);
              expect(ctx.h.world.getBlock(x, yb + 1, z), 'çıkış baş ' + p.id).toBe(0);
              let drop = 0;
              while (drop <= 3 && ctx.h.world.getBlock(x, yb - 1 - drop, z) === 0) drop++;
              expect(drop, 'iniş ' + p.id + ' d' + d).toBeLessThanOrEqual(3);
            }
          }
        }
      }
    }
  });
});

describe('portaloda — oyun içi akış', () => {
  it('başlangıç: çözülmemiş, raf kolu, sıfırlama kolu, 3 rün kadranı, kapı kilitli, platform plakası', () => {
    for (let d = 1; d <= 5; d++) {
      const ctx = setup(d, d % 4);
      expect(ctx.S().done).toBe(false);
      expect(ctx.S().charges).toBe(3);
      expect(ctx.h.world.count(B.LEVER)).toBe(2);
      expect(ctx.h.world.count(B.LOCKED_DOOR)).toBeGreaterThan(0);
      expect(ctx.h.world.count(B.PORTAL_BLUE) + ctx.h.world.count(B.PORTAL_ORANGE)).toBe(0);
      expect(ctx.h.world.count(B.CONCRETE_WHITE)).toBeGreaterThan(4);
      expect(ctx.h.mgr.hintFor(ctx.desc.id)).toMatch(/Portal Tabancası/);
    }
  });

  it('raf kolu: tabancayı verir (en çok 3 kez) ve ipucu şarjı söyler', () => {
    const ctx = setup(1, 0);
    const L = ctx.S().lay;
    const lever = ctx.F.toWorld(L.dispenser.lx, 0, L.dispenser.lz);
    const gives = [];
    ctx.h.mgr.on('effect', (e) => {
      if (e.kind === 'giveItem') gives.push(e);
    });
    for (let i = 0; i < 5; i++) ctx.h.mgr.handleInteract(ev('use', lever));
    expect(gives.length).toBe(3);
    expect(gives[0].item).toBe('item:portal_tabancası');
    expect(ctx.h.mgr.hintFor(ctx.desc.id)).toMatch(/Şarj: 3\/3/);
  });

  it('atış: portal blokları yazılır, kadran söner, başarısız atış mesaj verir ve true döner', () => {
    const ctx = setup(3, 2);
    const msgs = [];
    ctx.h.mgr.on('message', (e) => msgs.push(e.text));
    expect(shot(ctx, 'F', 'turuncu')).toBe(true);
    expect(msgs[msgs.length - 1]).toMatch(/yalnızca mavi/);
    expect(ctx.S().charges).toBe(3);
    expect(shot(ctx, 'F', 'mavi')).toBe(true);
    expect(ctx.S().charges).toBe(2);
    expect(ctx.h.world.count(B.PORTAL_BLUE)).toBe(2);
    expect(shot(ctx, 'G', 'turuncu')).toBe(true);
    expect(ctx.h.world.count(B.PORTAL_ORANGE)).toBe(2);
    expect(ctx.S().charges).toBe(1);
    // kadranda 1 rün yanık, 2 sönük
    const L = ctx.S().lay;
    const side = L.dispenser.lx > 0 ? L.x1 + 1 : L.x0 - 1;
    const ids = [1, 2, 3].map((i) => {
      const w = ctx.F.toWorld(side, L.dial.ly0 + i - 1, L.dial.lz);
      return ctx.h.world.getBlock(w.x, w.y, w.z);
    });
    expect(ids.filter((id) => id === B.BASALT).length).toBe(2);
    // yüksek hücreye atış: portal panele sığacak şekilde aşağı kaydırılır
    expect(shot(ctx, 'X', 'mavi', 2)).toBe(true);
    const X = ctx.S().portals.mavi;
    const px = ctx.S().panels.find((p) => p.id === 'X');
    expect(X.y).toBeGreaterThanOrEqual(px.box.y0);
    expect(X.y + 1).toBeLessThanOrEqual(px.box.y1);
    // olayı olmayan şey: yüz bilgisiz atış
    expect(ctx.h.mgr.handleInteract({ type: 'portalShot', x: px.box.x0, y: px.box.y0, z: px.box.z0, color: 'mavi' })).toBe(false);
  });

  it('ışınlanma: giriş portalına temas → teleport efekti (yaw/hız dönüşü, entityId), 0,8 sn bekleme, çift yön', () => {
    const ctx = setup(1, 1, 5);
    shot(ctx, 'E', 'mavi', 0);
    shot(ctx, 'X', 'turuncu', 0);
    const S = ctx.S();
    const tele = [];
    const msgs = [];
    ctx.h.mgr.on('effect', (e) => {
      if (e.kind === 'teleport') tele.push(e);
    });
    ctx.h.mgr.on('message', (e) => msgs.push(e.text));
    const m = S.portals.mavi;
    const tt = teleportTarget(S, 'mavi');
    const evt = {
      type: 'entity', x: m.cells[0].x, y: m.cells[0].y, z: m.cells[0].z, yaw: 0.3, vx: -m.nx * 4, vz: -m.nz * 4,
    };
    expect(ctx.h.mgr.handleInteract(evt)).toBe(true);
    expect(tele.length).toBe(1);
    expect(tele[0].x).toBeCloseTo(tt.x, 6);
    expect(tele[0].y).toBe(tt.y);
    expect(tele[0].yaw).toBeCloseTo(0.3 + tt.yawDelta, 6);
    expect(tele[0].keepMomentum).toBe(true);
    expect(tele[0].vx).toBeCloseTo(S.portals.turuncu.nx * 4, 2);
    expect(tele[0].vz).toBeCloseTo(S.portals.turuncu.nz * 4, 2);
    // bekleme süresince aynı gövde tekrar ışınlanmaz
    ctx.h.mgr.handleInteract(evt);
    expect(tele.length).toBe(1);
    simulate(ctx.h.mgr, 1, { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z });
    // küp (başka varlık) bağımsız bekleme: çıkıştan geri (turuncu → mavi)
    const o = S.portals.turuncu;
    ctx.h.mgr.handleInteract({
      type: 'step', x: o.cells[1].x, y: o.cells[1].y, z: o.cells[1].z, entityId: 'kup:1',
    });
    expect(tele.length).toBe(2);
    expect(tele[1].entityId).toBe('kup:1');
    expect(tele[1].x).toBeCloseTo(S.portals.mavi.x + S.portals.mavi.nx + 0.5, 6);
    // tek portal varken uyarı
    const ctx2 = setup(1, 0, 6);
    shot(ctx2, 'E', 'mavi');
    const m2 = [];
    ctx2.h.mgr.on('message', (e) => m2.push(e.text));
    const pb = ctx2.S().portals.mavi;
    ctx2.h.mgr.handleInteract({ type: 'entity', x: pb.x, y: pb.y, z: pb.z });
    expect(m2.some((t) => /Diğer portal henüz yok/.test(t))).toBe(true);
    expect(msgs.length).toBeGreaterThanOrEqual(0);
  });

  it('çözüm planı oyun olaylarıyla uygulanır: bitiş plakası, kapı, merdiven, tek çözüldü olayı', () => {
    for (let d = 1; d <= 5; d++) {
      for (const f of [0, 3]) {
        const ctx = setup(d, f, 30 + d);
        const plan = planSolution(ctx.S().lay, 3);
        const teleports = [];
        ctx.h.mgr.on('effect', (e) => {
          if (e.kind === 'teleport') teleports.push(e);
        });
        let shots = 0;
        for (const step of plan.plan) {
          if (step.act === 'shoot') {
            expect(shot(ctx, step.panel, step.color, 0)).toBe(true);
            shots++;
          } else if (step.act === 'walk-portal') {
            const p = ctx.S().portals[step.from];
            const n0 = teleports.length;
            ctx.h.mgr.handleInteract({
              type: 'entity', x: p.cells[0].x, y: p.cells[0].y, z: p.cells[0].z, entityId: 'oyuncu',
            });
            expect(teleports.length, 'ışınlanma d' + d).toBe(n0 + 1);
            simulate(ctx.h.mgr, 1, { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z });
          }
        }
        expect(shots).toBe(plan.placements);
        expect(ctx.S().charges).toBe(3 - shots);
        const L = ctx.S().lay;
        const goal = ctx.F.toWorld(L.goal.lx, L.platform.top, L.goal.lz);
        expect(ctx.h.world.getBlock(goal.x, goal.y, goal.z)).toBe(B.PRESSURE_PLATE);
        ctx.h.mgr.handleInteract(ev('step', goal));
        ctx.h.mgr.handleInteract(ev('step', goal));
        expect(ctx.h.solved.length).toBe(1);
        expect(ctx.h.world.getBlock(goal.x, goal.y, goal.z)).toBe(B.PRESSURE_PLATE_ON);
        expect(ctx.h.world.count(B.LOCKED_DOOR)).toBe(0);
        expect(ctx.h.world.count(B.POLISHED)).toBeGreaterThan(0);
        // merdiven platforma kadar 1'er basamak yükselir
        const rows = L.stairs.rows;
        for (let i = 0; i < rows.length; i++) {
          const w = ctx.F.toWorld(L.stairs.lx0, i, rows[i]);
          expect(ctx.h.world.getBlock(w.x, w.y, w.z)).toBe(B.POLISHED);
          const above = ctx.F.toWorld(L.stairs.lx0, i + 1, rows[i]);
          expect(ctx.h.world.getBlock(above.x, above.y, above.z)).toBe(0);
        }
      }
    }
  });

  it('şarj bitince: reddedilir; süre dolunca oda otomatik sıfırlanır (şarj geri, portallar kalkar, dünya ilk kurulumla özdeş)', () => {
    const ctx = setup(4, 0, 17);
    const fw = fresh(ctx);
    const msgs = [];
    ctx.h.mgr.on('message', (e) => msgs.push(e.text));
    shot(ctx, 'D2', 'turuncu');
    shot(ctx, 'F', 'mavi');
    shot(ctx, 'D2', 'turuncu', 0, 1);
    expect(ctx.S().charges).toBe(0);
    const before = ctx.h.world.snapshot();
    expect(shot(ctx, 'G', 'turuncu')).toBe(true);
    expect(ctx.S().charges).toBe(0);
    expect(ctx.h.world.snapshot()).toBe(before);
    expect(msgs.some((m) => /Şarjın bitti/.test(m))).toBe(true);
    simulate(ctx.h.mgr, PORTAL_GRACE - 2, { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z });
    expect(ctx.S().charges).toBe(0);
    simulate(ctx.h.mgr, 4, { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z });
    expect(ctx.S().charges).toBe(3);
    expect(ctx.S().portals.mavi).toBeNull();
    expect(ctx.h.world.snapshot()).toBe(fw.snapshot());
    expect(msgs.some((m) => /sıfırlan/.test(m))).toBe(true);
  });

  it('başarılı ışınlanma şarj sıfırken bekleme süresini yeniler (çözüm yolundayken sıfırlanmaz)', () => {
    const ctx = setup(3, 1, 4);
    shot(ctx, 'F', 'mavi');
    shot(ctx, 'G', 'turuncu');
    shot(ctx, 'X', 'mavi');
    expect(ctx.S().charges).toBe(0);
    simulate(ctx.h.mgr, PORTAL_GRACE - 3, { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z });
    const o = ctx.S().portals.turuncu;
    ctx.h.mgr.handleInteract({
      type: 'entity', x: o.cells[0].x, y: o.cells[0].y, z: o.cells[0].z,
    });
    simulate(ctx.h.mgr, PORTAL_GRACE - 3, { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z });
    expect(ctx.S().portals.mavi).not.toBeNull();
  });

  it('sıfırlama kolu ve çözülmüş odada kolun etkisizliği', () => {
    const ctx = setup(2, 1, 21);
    const fw = fresh(ctx);
    const L = ctx.S().lay;
    shot(ctx, 'E', 'mavi');
    shot(ctx, 'X', 'turuncu');
    expect(ctx.h.world.snapshot()).not.toBe(fw.snapshot());
    ctx.h.mgr.handleInteract(ev('use', ctx.F.toWorld(L.reset.lx, 0, L.reset.lz)));
    expect(ctx.S().charges).toBe(3);
    expect(ctx.h.world.snapshot()).toBe(fw.snapshot());
    const goal = ctx.F.toWorld(L.goal.lx, L.platform.top, L.goal.lz);
    ctx.h.mgr.handleInteract(ev('step', goal));
    const snap = ctx.h.world.snapshot();
    ctx.h.mgr.handleInteract(ev('use', ctx.F.toWorld(L.reset.lx, 0, L.reset.lz)));
    expect(ctx.h.world.snapshot()).toBe(snap);
    expect(ctx.S().done).toBe(true);
  });

  it('çukur (d≥2): zemin plakası girişe ışınlar; kısıtlı sıklık', () => {
    const ctx = setup(4, 2, 8);
    const L = ctx.S().lay;
    const tele = [];
    ctx.h.mgr.on('effect', (e) => {
      if (e.kind === 'teleport') tele.push(e);
    });
    const cell = ctx.F.toWorld(0, -2, L.pit.lz0 + 1);
    expect(ctx.h.world.getBlock(cell.x, cell.y, cell.z)).toBe(B.PRESSURE_PLATE);
    ctx.h.mgr.handleInteract(ev('step', cell));
    ctx.h.mgr.handleInteract(ev('step', cell));
    expect(tele.length).toBe(1);
    const e0 = ctx.F.toWorld(0, 0, 1);
    expect(tele[0].x).toBeCloseTo(e0.x + 0.5, 6);
    expect(tele[0].z).toBeCloseTo(e0.z + 0.5, 6);
  });

  it('serileştirme turu portallar açıkken: yeni dünya birebir aynı, portal içinden ışınlanma çalışır', () => {
    for (const d of [2, 5]) {
      const a = setup(d, 3, 44);
      const plan = planSolution(a.S().lay, 3);
      for (const step of plan.plan) {
        if (step.act === 'shoot') shot(a, step.panel, step.color, 0);
        else break;
      }
      const saved = JSON.parse(JSON.stringify(a.h.mgr.serialize()));
      const b = fakeManager({ seed: 44 });
      buildPuzzleRoom(a.desc, { seed: 44, setBlock: b.world.writer() });
      b.mgr.register(a.desc.id, a.desc);
      b.mgr.restore(saved);
      expect(b.world.snapshot(), 'd' + d).toBe(a.h.world.snapshot());
      expect(JSON.stringify(b.mgr.serialize())).toBe(JSON.stringify(saved));
      const st = b.mgr.get(a.desc.id).state;
      expect(st.portals.mavi || st.portals.turuncu).toBeTruthy();
    }
  });

  it('findPanel yüz normaline duyarlıdır', () => {
    const ctx = setup(1, 0);
    const S = ctx.S();
    const E = S.panels.find((p) => p.id === 'E');
    const x = E.box.x0;
    const y = E.box.y0;
    const z = E.box.z0;
    expect(findPanel(S.panels, x, y, z, E.nx, E.nz)).toBe(E);
    expect(findPanel(S.panels, x, y, z, -E.nx, -E.nz)).toBeNull();
  });
});
