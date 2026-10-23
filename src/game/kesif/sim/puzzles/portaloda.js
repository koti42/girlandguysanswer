/*
 * KEŞİF bulmaca: PORTAL ODASI ('portaloda') — iki renkli portal, 3 şarj, +5 m yüksekteki platforma ışınlan.
 *
 * Oyuncu girişteki rafın kolunu çekip 'Kuantum Portal Tabancası'nı (item:portal_tabancası) alır. Tabanca BEYAZ DİK panellere
 * mavi (ilk) ve turuncu (ikinci) portal açar; bir portala yürüyünce diğerinden çıkılır (bakış ve hız dönüşü korunur).
 * Panellerde renk kilidi olabilir: mavi DAİRE rünlü paneller yalnızca mavi, turuncu ÜÇGEN rünlü paneller yalnızca turuncu
 * portal tutar; işaretsiz beyaz paneller ikisini de tutar; siyah yüzeyler portal tutmaz. Yüksekteki platformdaki bitiş plakasına
 * basınca bulmaca çözülür: arka kapı açılır ve platformdan inen merdiven belirir. Giriş yanındaki rün kadranı kalan şarjı gösterir.
 *
 * Güvenlik: şarj bitip çözülemiyorsa 15 sn sonra oda otomatik sıfırlanır (şarj geri verilir); kırmızı alt blokla işaretli kol
 * odayı istendiği an sıfırlar. Çukurlu zorluklarda çukur zemini plakaları oyuncuyu girişe ışınlar; yakın kenarda çıkış rampası vardır.
 *
 * ── OYUNUN ÇAĞIRMASI GEREKENLER (tam sözleşme) ───────────────────────────────────────────────────
 *  1) Portal tabancası ateşi (oyuncu elinde 'item:portal_tabancası' varken sol=mavi, sağ=turuncu; ışın izleme `raycastBlocks`
 *     ile — portal blokları ışına şeffaftır):
 *       puzzleManager.handleInteract({ type:'portalShot', x,y,z,            vurulan DUVAR bloğunun hücresi
 *                                      face:{ nx,ny,nz },                     vurulan yüzün dışa bakan normali (tam sayı)
 *                                      color:'mavi' | 'turuncu' })
 *     true dönerse olay bu odaya aittir (başarılı ya da reddedildi; mesaj efektiyle bildirilir) → oyun ayrıca bir şey yapmaz.
 *  2) Gövde (oyuncu/varlık/küp) bir portal bloğuna (PORTAL_BLUE/PORTAL_ORANGE) temas ettiğinde, her kare ya da girişte:
 *       puzzleManager.handleInteract({ type:'entity', x,y,z,                  gövdenin içinde bulunduğu portal hücresi
 *                                      entityId?, playerId?,                   oyuncu için 'player' varsayılır
 *                                      yaw?, vx?, vz? })                       isteğe bağlı: bakış yönü ve yatay hız
 *     ('step' türü de aynı şekilde kabul edilir). Sonuç efekti (kit onEffect'e iletilir):
 *       { kind:'teleport', entityId?, x,y,z (AYAK konumu), yaw, yawDelta, vx?, vz?, keepMomentum:true, reason:'portal' }
 *     yaw = ev.yaw + yawDelta (ev.yaw yoksa çıkış yönüne bakan yaw); vx,vz = rotateVelocity(ev.vx, ev.vz, yawDelta); dikey hız
 *     (vy) korunur. Aynı gövde 0,8 sn boyunca tekrar ışınlanmaz.
 *  3) Efektler: {kind:'giveItem', item:'item:portal_tabancası', count:1} (raf kolu; en çok 3 kez), blok efektleri portal
 *     bloklarını yazar/siler, {kind:'sound', name:'portal', pitch}, {kind:'particles', fx:'portalSwirl'}.
 *  Sıfırlamada (reset) yalnızca oda durumu (portallar, şarj) geri gelir; envanterdeki tabanca kalır.
 *
 * state: { v, lay, panels(DÜNYA), portals:{mavi,turuncu}, charges, max, gun, done, t, cool, stuck, falls, lastFall }
 */
import { B, RUNES } from '../blocks.js';
import { frame, localDir } from './kitGeometry.js';
import { buildChamber, setDoorOpen, doorEffects } from './kitChamber.js';
import { subRng } from './kitCtx.js';
import { fx } from './kitEffects.js';
import { registerPuzzle } from './kitRegistry.js';
import {
  carvePit, chamberOf, sfx, teleportFx,
} from './ps2Shared.js';
import {
  PORTAL_GRACE, PORTAL_MAX_CHARGES, clampPortalDifficulty, placePortal, portalAt, portalLayout, portalSize,
  rotateVelocity, teleportTarget,
} from './portalodaLogic.js';

const TYPE = 'portaloda';
const EMPTY = Object.freeze([]);
const GUN_ITEM = 'item:portal_tabancası';
const COOL = 0.8;

const FRAMES = new WeakMap();
const DOORS = new WeakMap();
const LAYOUTS = new Map();

function frameOf(ctx) {
  let F = FRAMES.get(ctx);
  if (!F) {
    F = frame(ctx);
    FRAMES.set(ctx, F);
  }
  return F;
}

function layoutFor(ctx) {
  const diff = clampPortalDifficulty(ctx.difficulty);
  const key = ctx.seed + ':' + diff;
  let json = LAYOUTS.get(key);
  if (json === undefined) {
    json = JSON.stringify(portalLayout(diff, subRng(ctx, 'portaloda')));
    if (LAYOUTS.size > 64) LAYOUTS.clear();
    LAYOUTS.set(key, json);
  }
  return JSON.parse(json);
}

function chamberOpts(L) {
  return {
    w: L.w, d: L.d, h: L.h, doorBack: 'locked',
  };
}

function doorOf(ctx, L) {
  let d = DOORS.get(ctx);
  if (!d) {
    d = chamberOf(ctx, chamberOpts(L)).doorBack;
    DOORS.set(ctx, d);
  }
  return d;
}

/* ------------------------------------------------------------------------------------------------
 * Panel geometrisi (yerel → dünya)
 * ---------------------------------------------------------------------------------------------- */
/** Panel tanımı → yerel duvar kutusu ve yerel yüz normali. */
function panelLocal(L, p) {
  if (p.wall === 'L') {
    return { lx0: L.x0 - 1, lx1: L.x0 - 1, lz0: p.a0, lz1: p.a1, nlx: 1, nlz: 0 };
  }
  if (p.wall === 'R') {
    return { lx0: L.x1 + 1, lx1: L.x1 + 1, lz0: p.a0, lz1: p.a1, nlx: -1, nlz: 0 };
  }
  return { lx0: p.a0, lx1: p.a1, lz0: L.d, lz1: L.d, nlx: 0, nlz: -1 };
}

function panelsWorld(F, L) {
  const out = [];
  for (let i = 0; i < L.panels.length; i++) {
    const p = L.panels[i];
    const g = panelLocal(L, p);
    const box = F.worldBox(g.lx0, p.ly0, g.lz0, g.lx1, p.ly1, g.lz1);
    const n = localDir(F.facing, g.nlx, g.nlz);
    out.push({
      id: p.id, acc: p.acc, zone: p.zone, vis: p.vis.slice(), nx: n.dx, nz: n.dz, box,
    });
  }
  return out;
}

function eachPanelCell(L, p, fn) {
  const g = panelLocal(L, p);
  for (let ly = p.ly0; ly <= p.ly1; ly++) {
    for (let lz = g.lz0; lz <= g.lz1; lz++) {
      for (let lx = g.lx0; lx <= g.lx1; lx++) fn(lx, ly, lz);
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Çizim
 * ---------------------------------------------------------------------------------------------- */
function dialCells(L) {
  const side = L.dispenser.lx > 0 ? L.x1 + 1 : L.x0 - 1;
  const out = [];
  for (let i = 0; i < PORTAL_MAX_CHARGES; i++) out.push([side, L.dial.ly0 + i, L.dial.lz]);
  return out;
}

function paintStatic(F, L, theme) {
  if (L.pit) {
    carvePit(F, {
      x0: L.x0, x1: L.x1, lz0: L.pit.lz0, lz1: L.pit.lz1, stand: -2, floorId: B.BASALT, ramp: true,
    });
  }
  const box = (b, ly0, ly1) => {
    F.paint(b.lx0, ly0, b.lz0, b.lx1, ly1, b.lz1, (lx, ly, lz) => {
      if (ly === ly1) return ((lx + lz) & 1) === 0 ? theme.floor : theme.floorAlt;
      return theme.wall;
    });
  };
  box(L.platform, 0, L.platform.top - 1);
  if (L.ledge) box(L.ledge, 0, L.ledge.top - 1);
  // paneller
  for (let i = 0; i < L.panels.length; i++) {
    const p = L.panels[i];
    eachPanelCell(L, p, (lx, ly, lz) => F.set(lx, ly, lz, B.CONCRETE_WHITE));
    const g = panelLocal(L, p);
    if (p.acc !== 'her') {
      const cornerId = p.acc === 'mavi' ? B.CONCRETE_BLUE : B.CONCRETE_ORANGE;
      F.set(g.lx0, p.ly0, g.lz0, cornerId);
      F.set(g.lx1, p.ly0, g.lz1, cornerId);
      F.set(g.lx0, p.ly1, g.lz0, cornerId);
      F.set(g.lx1, p.ly1, g.lz1, cornerId);
      const mx = (g.lx0 + g.lx1) >> 1;
      const mz = (g.lz0 + g.lz1) >> 1;
      F.set(mx, (p.ly0 + p.ly1) >> 1, mz, p.acc === 'mavi' ? RUNES[1].id : RUNES[0].id);
    }
  }
  for (let i = 0; i < L.decoys.length; i++) {
    eachPanelCell(L, L.decoys[i], (lx, ly, lz) => F.set(lx, ly, lz, B.CONCRETE_BLACK));
  }
  // raf, sıfırlama, fenerler
  F.set(L.dispenser.lx, -1, L.dispenser.lz, B.CONCRETE_YELLOW);
  F.set(L.reset.lx, -1, L.reset.lz, B.CONCRETE_RED);
  F.set(L.platform.lx0, L.platform.top, L.platform.lz0, B.LANTERN);
  F.set(L.platform.lx0, L.platform.top, L.platform.lz1, B.LANTERN);
  F.set(L.platform.lx1, L.platform.top, L.platform.lz1, B.LANTERN);
  if (L.ledge) {
    F.set(L.ledge.lx0, L.ledge.top, L.ledge.lz0, B.LANTERN);
    F.set(L.ledge.lx1, L.ledge.top, L.ledge.lz0, B.LANTERN);
  }
}

/** Panelin tüm ön hücrelerini yerel koordinatta listeler (portal temizleme için). */
function candidateCells(L) {
  const out = [];
  for (let i = 0; i < L.panels.length; i++) {
    const p = L.panels[i];
    const g = panelLocal(L, p);
    eachPanelCell(L, p, (lx, ly, lz) => out.push([lx + g.nlx, ly, lz + g.nlz]));
  }
  return out;
}

function portalBlock(color) {
  return color === 'mavi' ? B.PORTAL_BLUE : B.PORTAL_ORANGE;
}

function paintDynamic(ctx, F, L, S) {
  F.lever(L.dispenser.lx, 0, L.dispenser.lz, false);
  F.lever(L.reset.lx, 0, L.reset.lz, false);
  const cand = candidateCells(L);
  for (let i = 0; i < cand.length; i++) F.set(cand[i][0], cand[i][1], cand[i][2], 0);
  const cols = ['mavi', 'turuncu'];
  for (let c = 0; c < 2; c++) {
    const p = S.portals[cols[c]];
    if (!p) continue;
    for (let k = 0; k < p.cells.length; k++) {
      const l = F.toLocal(p.cells[k].x, p.cells[k].y, p.cells[k].z);
      F.set(l.x, l.y, l.z, portalBlock(cols[c]));
    }
  }
  F.set(L.goal.lx, L.platform.top, L.goal.lz, S.done ? B.PRESSURE_PLATE_ON : B.PRESSURE_PLATE);
  const dials = dialCells(L);
  for (let i = 0; i < dials.length; i++) F.set(dials[i][0], dials[i][1], dials[i][2], i < S.charges ? RUNES[i % RUNES.length].id : B.BASALT);
  for (let i = 0; i < L.stairs.rows.length; i++) {
    for (let ly = 0; ly <= i; ly++) {
      for (let lx = L.stairs.lx0; lx <= L.stairs.lx1; lx++) F.set(lx, ly, L.stairs.rows[i], S.done ? B.POLISHED : 0);
    }
  }
  setDoorOpen(ctx, doorOf(ctx, L), S.done);
}

/* ------------------------------------------------------------------------------------------------
 * Efekt yardımcıları
 * ---------------------------------------------------------------------------------------------- */
function portalEffects(p, blockId) {
  const blocks = [];
  for (let i = 0; i < p.cells.length; i++) blocks.push([p.cells[i].x, p.cells[i].y, p.cells[i].z, blockId]);
  return blocks;
}

function dialEffect(F, L, charges) {
  const dials = dialCells(L);
  const blocks = [];
  for (let i = 0; i < dials.length; i++) {
    const w = F.toWorld(dials[i][0], dials[i][1], dials[i][2]);
    blocks.push([w.x, w.y, w.z, i < charges ? RUNES[i % RUNES.length].id : B.BASALT]);
  }
  return fx.setBlocks(blocks);
}

const COLOR_HEX = { mavi: 0x3d9bff, turuncu: 0xff9a3a };

function hintText(S) {
  if (S.done) return 'Tamamlandı: arka kapı açık, platformdan inen merdiveni kullanabilirsin.';
  if (S.gun === 0) return 'Girişin yanındaki sarı işaretli rafın kolunu çek: Kuantum Portal Tabancası alırsın.';
  const parts = ['Şarj: ' + S.charges + '/' + S.max + '.'];
  parts.push('Beyaz panellere ateş et: sol tık mavi, sağ tık turuncu portal açar. Mavi daire işaretli paneller yalnızca mavi, turuncu üçgen işaretliler yalnızca turuncu tutar; siyah yüzeyler tutmaz.');
  if (S.portals.mavi && S.portals.turuncu) parts.push('İki portal hazır: birine yürü, diğerinden çık. Hedef: yüksekteki platform.');
  else parts.push('İki portal gerekir. Hedef: yüksekteki platformdaki plakaya ulaş.');
  if (S.charges === 0) parts.push('Şarj bitti: oda ' + PORTAL_GRACE + ' sn içinde sıfırlanır; kırmızı kolla hemen sıfırlayabilirsin.');
  return parts.join(' ');
}

const _loc = { x: 0, y: 0, z: 0 };

function sameLocal(loc, lx, ly, lz) {
  return loc.x === lx && loc.y === ly && loc.z === lz;
}

/* ------------------------------------------------------------------------------------------------
 * Olay işleyicileri
 * ---------------------------------------------------------------------------------------------- */
function handleShot(F, L, S, ev) {
  const effects = [];
  const f = ev.face;
  if (!f || (ev.color !== 'mavi' && ev.color !== 'turuncu')) return { state: S, effects, handled: false };
  const res = placePortal(S, {
    x: ev.x, y: ev.y, z: ev.z, nx: f.nx, ny: f.ny, nz: f.nz,
  }, ev.color);
  if (!res.ok) {
    effects.push(fx.message(res.message));
    effects.push(sfx(res.reason === 'sarj' ? 'gun_empty' : 'puzzle_wrong', ev.x, ev.y, ev.z));
    return { state: S, effects, handled: true };
  }
  const next = res.state;
  const blocks = [];
  if (res.removed) {
    const rb = portalEffects(res.removed, 0);
    for (let i = 0; i < rb.length; i++) blocks.push(rb[i]);
  }
  const nb = portalEffects(res.portal, portalBlock(ev.color));
  for (let i = 0; i < nb.length; i++) blocks.push(nb[i]);
  effects.push(fx.setBlocks(blocks));
  effects.push(dialEffect(F, L, next.charges));
  effects.push(sfx('portal', res.portal.x, res.portal.y, res.portal.z, ev.color === 'mavi' ? 1 : 1.3));
  effects.push(fx.particles('portalSwirl', res.portal.x + 0.5, res.portal.y + 1, res.portal.z + 0.5, COLOR_HEX[ev.color]));
  effects.push(fx.message(res.message));
  if (next.charges === 0) effects.push(fx.message('Şarj bitti. Portalların hazırsa hemen geç; yoksa oda ' + PORTAL_GRACE + ' sn sonra sıfırlanır.'));
  return { state: next, effects, handled: true };
}

function handleEntity(ctx, F, L, S, ev, color) {
  const effects = [];
  const who = ev.entityId !== undefined ? String(ev.entityId) : (ev.playerId !== undefined ? 'p:' + ev.playerId : 'player');
  if (S.cool[who] !== undefined && S.cool[who] > S.t) return { state: S, effects, handled: true };
  const tt = teleportTarget(S, color);
  if (!tt) {
    if (S.t - S.noPair >= 2) {
      S.noPair = S.t;
      effects.push(fx.message('Diğer portal henüz yok. İkinci portalı da aç.'));
    }
    return { state: S, effects, handled: true };
  }
  S.cool[who] = S.t + COOL;
  if (S.stuck >= 0) S.stuck = S.t;
  const eff = {
    kind: 'teleport',
    x: tt.x,
    y: tt.y,
    z: tt.z,
    yaw: Number.isFinite(ev.yaw) ? ev.yaw + tt.yawDelta : tt.yaw,
    yawDelta: tt.yawDelta,
    keepMomentum: true,
    reason: 'portal',
  };
  if (ev.entityId !== undefined) eff.entityId = ev.entityId;
  if (Number.isFinite(ev.vx) || Number.isFinite(ev.vz)) {
    const v = rotateVelocity(Number.isFinite(ev.vx) ? ev.vx : 0, Number.isFinite(ev.vz) ? ev.vz : 0, tt.yawDelta);
    eff.vx = Math.round(v[0] * 1000) / 1000;
    eff.vz = Math.round(v[1] * 1000) / 1000;
  }
  effects.push(eff);
  effects.push(sfx('portal', tt.x, tt.y, tt.z, color === 'mavi' ? 1.3 : 1));
  effects.push(fx.particles('portalSwirl', tt.x, tt.y + 1, tt.z, COLOR_HEX[color === 'mavi' ? 'turuncu' : 'mavi']));
  return { state: S, effects, handled: true };
}

/* ------------------------------------------------------------------------------------------------
 * Bulmaca uygulaması
 * ---------------------------------------------------------------------------------------------- */
const impl = {
  type: TYPE,
  name: 'Portal Odası',
  summary: 'Portal tabancasıyla beyaz panellere mavi ve turuncu portal aç, yüksekteki platforma ışınlan.',
  difficultyRange: [1, 5],

  footprint(difficulty) {
    return Object.assign(portalSize(difficulty), { margin: 2 });
  },

  build(ctx) {
    const L = layoutFor(ctx);
    const F = frameOf(ctx);
    const ch = buildChamber(ctx, chamberOpts(L));
    DOORS.set(ctx, ch.doorBack);
    paintStatic(F, L, ch.theme);
    const S = {
      v: 1,
      lay: L,
      panels: panelsWorld(F, L),
      portals: { mavi: null, turuncu: null },
      charges: PORTAL_MAX_CHARGES,
      max: PORTAL_MAX_CHARGES,
      gun: 0,
      done: false,
      t: 0,
      cool: {},
      stuck: -1,
      noPair: -99,
      falls: 0,
      lastFall: -99,
    };
    paintDynamic(ctx, F, L, S);
    const door = ch.doorBack;
    return {
      state: S,
      anchors: {
        dispenser: F.toWorld(L.dispenser.lx, 0, L.dispenser.lz),
        reset: F.toWorld(L.reset.lx, 0, L.reset.lz),
        goal: F.toWorld(L.goal.lx, L.platform.top, L.goal.lz),
        door: { x: door.x, y: door.y, z: door.z },
      },
    };
  },

  restore(ctx, S) {
    paintDynamic(ctx, frameOf(ctx), S.lay, S);
  },

  interact(ctx, S, ev) {
    const F = frameOf(ctx);
    const L = S.lay;
    if (ev.type === 'portalShot') return handleShot(F, L, S, ev);
    const loc = F.toLocal(ev.x, ev.y, ev.z, _loc);
    const effects = [];
    if (ev.type === 'use') {
      if (sameLocal(loc, L.dispenser.lx, 0, L.dispenser.lz)) {
        if (S.gun >= 3) {
          effects.push(fx.message('Raf boş. Şarjın: ' + S.charges + '/' + S.max + '.'));
        } else {
          S.gun += 1;
          effects.push(fx.giveItem(GUN_ITEM, 1));
          effects.push(sfx('pickup', ev.x, ev.y, ev.z));
          effects.push(fx.message('Kuantum Portal Tabancası alındı: ' + S.charges + ' şarj. Beyaz panellere ateş et.'));
        }
        return { state: S, effects };
      }
      if (sameLocal(loc, L.reset.lx, 0, L.reset.lz)) {
        effects.push(sfx('lever', ev.x, ev.y, ev.z));
        effects.push(fx.message('Oda sıfırlanıyor: portallar kalktı, şarjın geri geldi.'));
        effects.push(fx.reset());
        return { state: S, effects };
      }
      return { state: S, effects };
    }
    if (ev.type === 'entity' || ev.type === 'step') {
      const color = portalAt(S, ev.x, ev.y, ev.z);
      if (color) return handleEntity(ctx, F, L, S, ev, color);
      if (ev.type !== 'step') return { state: S, effects };
      if (sameLocal(loc, L.goal.lx, L.platform.top, L.goal.lz)) {
        if (!S.done) {
          S.done = true;
          effects.push(fx.setBlock(ev.x, ev.y, ev.z, B.PRESSURE_PLATE_ON));
          const door = doorOf(ctx, L);
          const dEff = doorEffects(door, true);
          for (let i = 0; i < dEff.length; i++) effects.push(dEff[i]);
          const blocks = [];
          for (let i = 0; i < L.stairs.rows.length; i++) {
            for (let ly = 0; ly <= i; ly++) {
              for (let lx = L.stairs.lx0; lx <= L.stairs.lx1; lx++) {
                const w = F.toWorld(lx, ly, L.stairs.rows[i]);
                blocks.push([w.x, w.y, w.z, B.POLISHED]);
              }
            }
          }
          effects.push(fx.setBlocks(blocks));
          effects.push(sfx('door_open', door.x, door.y, door.z));
          effects.push(fx.particles('levelUp', ev.x + 0.5, ev.y + 1, ev.z + 0.5, 0xffd24a));
          effects.push(fx.message('Başardın! Arka kapı açıldı, platformdan merdiven belirdi.'));
        }
        return { state: S, effects };
      }
      if (L.pit && loc.y === -2 && loc.z >= L.pit.lz0 && loc.z <= L.pit.lz1 && loc.x >= L.x0 && loc.x <= L.x1) {
        if (S.t - S.lastFall >= 1.5) {
          S.lastFall = S.t;
          S.falls += 1;
          effects.push(teleportFx(F, 0, 0, 1, 'dusme'));
          effects.push(sfx('land', ev.x, ev.y, ev.z));
          effects.push(fx.message('Çukura düştün! Girişe döndün.'));
        }
      }
    }
    return { state: S, effects };
  },

  tick(ctx, S, dt) {
    S.t += dt;
    let effects = EMPTY;
    const keys = Object.keys(S.cool);
    for (let i = 0; i < keys.length; i++) if (S.cool[keys[i]] <= S.t) delete S.cool[keys[i]];
    if (S.charges === 0 && !S.done) {
      if (S.stuck < 0) S.stuck = S.t;
      else if (S.t - S.stuck >= PORTAL_GRACE) {
        S.stuck = -1;
        effects = [fx.message('Şarj bitti ve çözüm bulunamadı: oda sıfırlanıyor, şarjın geri geliyor.'), fx.reset()];
      }
    } else if (S.stuck >= 0) {
      S.stuck = -1;
    }
    return { state: S, effects };
  },

  isSolved(S) {
    return S.done === true;
  },

  hint(S) {
    return hintText(S);
  },
};

export const portaloda = registerPuzzle(TYPE, impl);
export default portaloda;
