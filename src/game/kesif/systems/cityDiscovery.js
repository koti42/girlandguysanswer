/*
 * KEŞİF — "cityDiscovery" sistemi (order 34): Neon Meridyen keşifleri (Faz 4, paket discovery_missions). Sözleşme §11.
 *   • 240 veri çipi: yaklaşınca toplanır (+5 Kredi), her 10 çipte bir Meridyen Günlüğü parçası; yakında parlayan işaret (tarayıcıyla 36 m, tarayıcısız 14 m).
 *   • 90 grafiti: duvara yaklaş, etkileşim → 6 kalıp × 8 renk seç → 3 sn boyama (serbest çizim YOK; +15 Kredi tek sefer).
 *   • 30 gizli oda (kanalizasyon cepleri): içine girince bulunur (+50 Kredi); 16 terminal (olay: terminalFound); çatı parkuru bitişi; Kasa «Diyar Işığı» yumurtası.
 *   • Koleksiyonlar (bölge arşivleri, kalıplar, odalar, terminaller), haritada/günlükte YALNIZ bulunanlar.
 * Çizim: render/city/discoveryFx (4 çağrı). Aile dostu, ödül Kredi'dir (jeton yalnız cityApi → neon:* talepleri).
 *
 *   G.cityDiscovery = {info(), nearest(), picker(), fx}
 *   Olaylar: chipFound{id,count} graffitiDone{id} roomFound{id} roofDone{route} diyarIsigi · discover{name}
 *   API (window.__game): getDiscoveryInfo() getGraffitiPicker() graffitiAct({k:'pick'|'paint'|'close', design?, color?})
 *   Hata ayıklama komutları: kesif | kesif cip <id> | kesif tp <cip|grafiti|oda> <id> | kesif hepsi
 */
import * as THREE from 'three';
import { getCityPlan } from '../sim/city/cityPlan.js';
import { createDiscoveryFx, PALETTE, STENCIL_NAMES } from '../render/city/discoveryFx.js';
import { GRAFFITI_COLORS } from '../sim/city/cityNames.js';
import { statAdd, statGet } from '../sim/city/cityState.js';
import {
  countChips, countRooms, decodeBits, discoveredMarkers, hasGraffiti, hasRoom, inVaultRect, inVaultTrigger, markChip, markRoom, newSets, paintGraffiti, roomAt, storyUnlocked,
} from '../sim/city/mission/discovery.js';
import { recordRoof } from '../sim/city/mission/results.js';
import {
  COUNTS, DISCOVERY_TEXT, KREDI, STORY_FRAGMENTS,
} from '../sim/city/mission/missionData.js';
import { registerCommand } from './sessionCommands.js';
import { getKit } from './cityMissionsKit.js';

export const CITY_DISCOVERY_ORDER = 34;
export const PAINT_SEC = 3;
const CHIP_R_FOOT = 1.9;
const CHIP_R_CAR = 3.4;
const CHIP_DY = 2.8;
const SPOT_R = 3.3;
const SCAN_R = 12;
const SEE_R_PLAIN = 14;
const SEE_R_SCAN = 36;
const PAINT_AWAY = 5.5;
const SCAN_ITEM = 'item:tarayıcı';
const EASTER_ITEMS = Object.freeze([['blok:neon_pembe', 6], ['blok:holo_panel', 4]]);

export function createSystem(G) {
  const kit = getKit(G);
  const st = {
    cat: null,
    seed: -1,
    cityRef: null,
    bits: new Uint8Array(COUNTS.chips),
    buf: [],
    acc: 0,
    slow: 0,
    fxAcc: 0,
    fx: null,
    fxShown: false,
    warmed: false,
    chipList: [],
    decalVer: -1,
    decals: [],
    paint: null,
    picker: null,
    nearSpot: -1,
    scanSay: -99,
    roomSay: -99,
    spotSay: -99,
    roofSay: 0,
    stats: { chips: 0, graffiti: 0, rooms: 0, roofs: 0 },
  };
  const pos = { x: 0, y: 64, z: 0, speed: 0, cls: null, veh: null, driving: false, yaw: 0 };

  const now = () => (G.time ? G.time.seconds : 0);
  const reduced = () => !!(G.reducedMotion || G.accessibility);
  const tier = () => (G.quality && G.quality.settings && G.quality.settings.effTier) || 'high';

  function catalog() {
    const seed = kit.seed();
    if (seed === -1) return null;
    if (st.seed !== seed || !st.cat) {
      st.seed = seed;
      st.cat = kit.catalog();
      st.decalVer = -1;
    }
    return st.cat;
  }

  function hasScanner() {
    const inv = G.inventory;
    return !!inv && typeof inv.count === 'function' && inv.count(SCAN_ITEM) > 0;
  }

  function syncBits() {
    st.bits = decodeBits(kit.blob().discovery.chips, COUNTS.chips);
  }

  /* ---------------------------------------------------------------------------- toplama */
  function checkSets() {
    const c = kit.blob();
    const cat = st.cat;
    if (!c || !cat) return;
    const fresh = newSets(cat, c.discovery, kit.terminalMask());
    fresh.forEach((s) => {
      kit.kredi(s.reward, 'koleksiyon');
      kit.banner(DISCOVERY_TEXT.setDone + ': ' + s.name, '+' + s.reward + ' Kredi', { kind: 'reward' });
      if (typeof G.sound === 'function') G.sound('achievement');
    });
  }

  function collectChip(id) {
    const c = kit.blob();
    if (!c || !markChip(c.discovery, id)) return false;
    st.bits[id] = 1;
    st.stats.chips++;
    const n = countChips(c.discovery);
    kit.kredi(KREDI.chip, 'cip');
    if (typeof G.sound === 'function') G.sound('pickup');
    kit.say(DISCOVERY_TEXT.chipFound + ' ' + n + '/' + COUNTS.chips + ' · +' + KREDI.chip + ' Kredi', 'cip');
    kit.discover('Veri çipi ' + n + '/' + COUNTS.chips);
    G.emit({ type: 'chipFound', id, count: n });
    if (n % 10 === 0 && storyUnlocked(n) > c.discovery.story) {
      c.discovery.story = storyUnlocked(n);
      const frag = STORY_FRAGMENTS[c.discovery.story - 1];
      kit.kredi(KREDI.chipStory, 'gunluk');
      kit.banner(DISCOVERY_TEXT.storyTitle + ' ' + c.discovery.story + '/' + STORY_FRAGMENTS.length, frag, { kind: 'discover', duration: 6000 });
    }
    checkSets();
    return true;
  }

  function stepChips(p) {
    const cat = st.cat;
    const r = p.driving ? CHIP_R_CAR : CHIP_R_FOOT;
    cat.nearChips(p.x, p.z, r + 0.6, st.buf);
    for (let i = 0; i < st.buf.length; i++) {
      const id = st.buf[i];
      if (st.bits[id] === 1) continue;
      const ch = cat.chips[id];
      const dx = ch.x - p.x;
      const dz = ch.z - p.z;
      if (dx * dx + dz * dz <= r * r && Math.abs(ch.y - p.y) <= CHIP_DY) collectChip(id);
    }
  }

  function refreshChipFx(p) {
    const cat = st.cat;
    const scan = hasScanner();
    const R = scan ? SEE_R_SCAN : SEE_R_PLAIN;
    cat.nearChips(p.x, p.z, R, st.buf);
    const list = st.chipList;
    list.length = 0;
    let bestD = Infinity;
    for (let i = 0; i < st.buf.length; i++) {
      const id = st.buf[i];
      if (st.bits[id] === 1) continue;
      const ch = cat.chips[id];
      if (Math.abs(ch.y - p.y) > 14 && ch.kind !== 'kanal') {
        if (Math.abs(ch.y - p.y) > 40) continue;
      }
      const d = Math.hypot(ch.x - p.x, ch.z - p.z);
      list.push({
        x: ch.x, y: ch.y, z: ch.z, hot: scan && d <= 24,
      });
      if (scan && d < bestD && Math.abs(ch.y - p.y) < 8) bestD = d;
    }
    if (st.fx) st.fx.setChips(list, list.length);
    if (scan && bestD <= SCAN_R && now() - st.scanSay > 3) {
      st.scanSay = now();
      kit.say(DISCOVERY_TEXT.chipScan + ' ' + Math.round(bestD) + ' m', 'tarama');
    }
  }

  /* ---------------------------------------------------------------------------- odalar, çatı, Kasa */
  function stepRooms(p) {
    const cat = st.cat;
    const c = kit.blob();
    const r = roomAt(cat, p.x, p.y, p.z);
    if (r && !hasRoom(c.discovery, r.id)) {
      markRoom(c.discovery, r.id);
      st.stats.rooms++;
      kit.kredi(KREDI.room, 'oda');
      kit.banner(DISCOVERY_TEXT.roomFound + '!', r.name + ' · +' + KREDI.room + ' Kredi', { kind: 'discover', duration: 4800 });
      kit.discover(r.name);
      if (typeof G.sound === 'function') G.sound('achievement');
      G.emit({ type: 'roomFound', id: r.id });
      checkSets();
      return;
    }
    if (hasScanner() && !r && now() - st.roomSay > 6) {
      for (let i = 0; i < cat.rooms.length; i++) {
        const q = cat.rooms[i];
        if (hasRoom(c.discovery, i)) continue;
        if (Math.abs(q.y - p.y) < 6 && Math.hypot(q.x - p.x, q.z - p.z) <= SCAN_R + 4) {
          st.roomSay = now();
          kit.say('Tarayıcı: ' + DISCOVERY_TEXT.roomNear + '.', 'oda-ipucu');
          break;
        }
      }
    }
  }

  function stepRoof(p) {
    if (p.y < 70) return;
    const plan = getCityPlan(st.seed);
    const c = kit.blob();
    for (let i = 0; i < plan.roofRoutes.length; i++) {
      const e = plan.roofRoutes[i].end;
      if (Math.abs(p.y - e.y) <= 3.5 && Math.hypot(p.x - e.x, p.z - e.z) <= 4.5) {
        if (recordRoof(c, i)) {
          st.stats.roofs++;
          kit.kredi(KREDI.roof, 'cati');
          kit.banner('Çatı parkuru tamam!', '+' + KREDI.roof + ' Kredi', { kind: 'reward' });
          if (typeof G.sound === 'function') G.sound('quest');
          G.emit({ type: 'roofDone', route: i });
        }
      }
    }
  }

  function stepVault(p) {
    if (p.y > -60) return;
    const c = kit.blob();
    const cat = st.cat;
    if (inVaultRect(cat, p.x, p.y, p.z) && !statGet(c, 'vault')) {
      statAdd(c, 'vault', 1);
      kit.banner('Kasa', 'Teknoloji Parkı\'nın altındaki Kasa\'ya girdin.', { kind: 'discover' });
    }
    if (inVaultTrigger(cat, p.x, p.y, p.z) && !statGet(c, 'easter')) easter();
  }

  function easter() {
    G.emit({ type: 'diyarIsigi' });
    kit.kredi(KREDI.easter, 'diyar');
    const given = [];
    EASTER_ITEMS.forEach(([item, n]) => { if (kit.give(item, n) > 0) given.push(n); });
    kit.banner(DISCOVERY_TEXT.easterTitle, DISCOVERY_TEXT.easterLine, { kind: 'unlock', duration: 7000, priority: 8 });
    if (typeof G.sound === 'function') G.sound('dim:arrive');
    if (!reduced() && typeof G.fx === 'function') {
      try {
        G.fx('portalBurst', G.body.x, G.body.y + 1, G.body.z);
      } catch { /* yut */ }
    }
  }

  /* ---------------------------------------------------------------------------- grafiti */
  function stepSpots(p) {
    const cat = st.cat;
    const c = kit.blob();
    st.nearSpot = -1;
    if (p.driving) return;
    cat.nearGraffiti(p.x, p.z, SPOT_R + 3, st.buf);
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < st.buf.length; i++) {
      const id = st.buf[i];
      if (hasGraffiti(c.discovery, id)) continue;
      const g = cat.graffiti[id];
      if (Math.abs(g.y - p.y) > 3) continue;
      const d = Math.hypot(g.x - p.x, g.z - p.z);
      if (d <= SPOT_R && d < bd) {
        bd = d;
        best = id;
      }
    }
    if (best >= 0) {
      const g = cat.graffiti[best];
      const l = G.look;
      let facing = true;
      if (l) {
        const wx = g.cx - p.x;
        const wz = g.cz - p.z;
        const wl = Math.hypot(wx, wz) || 1;
        const ll = Math.hypot(l.x, l.z) || 1;
        facing = (wx * l.x + wz * l.z) / (wl * ll) > 0.3;
      }
      if (facing) {
        st.nearSpot = best;
        if (!st.paint && !st.picker && now() - st.spotSay > 2.5 && G.ui === 'none') {
          st.spotSay = now();
          kit.say(DISCOVERY_TEXT.graffitiAsk + ': boş duvar', 'grafiti');
        }
      }
    }
  }

  function openPicker(id) {
    if (typeof G.setUi !== 'function' || G.ui !== 'none') return false;
    st.picker = { id, design: 0, color: 4, msg: '' };
    G.setUi('dialogue');
    if (G.ui !== 'dialogue') {
      st.picker = null;
      return false;
    }
    if (typeof G.sound === 'function') G.sound('ui_open', undefined, { vol: 0.5 });
    return true;
  }

  function closePicker() {
    if (!st.picker) return false;
    st.picker = null;
    if (G.ui === 'dialogue' && typeof G.setUi === 'function') G.setUi('none');
    return true;
  }

  function pickerView() {
    const p = st.picker;
    if (!p) return null;
    return {
      type: 'graffiti',
      spot: p.id,
      stencils: STENCIL_NAMES.map((name, i) => ({ i, name })),
      colors: GRAFFITI_COLORS.map((name, i) => ({ i, name, hex: '#' + PALETTE[i].toString(16).padStart(6, '0') })),
      design: p.design,
      color: p.color,
      msg: p.msg,
      seconds: PAINT_SEC,
    };
  }

  function pickerAct(a) {
    const p = st.picker;
    if (!p || !a || typeof a !== 'object') return { ok: false, reason: 'kapali' };
    if (a.k === 'pick') {
      if (Number.isInteger(a.design) && a.design >= 0 && a.design < STENCIL_NAMES.length) p.design = a.design;
      if (Number.isInteger(a.color) && a.color >= 0 && a.color < PALETTE.length) p.color = a.color;
      return { ok: true };
    }
    if (a.k === 'close') {
      closePicker();
      return { ok: true };
    }
    if (a.k === 'paint') {
      const c = kit.blob();
      if (hasGraffiti(c.discovery, p.id)) {
        p.msg = DISCOVERY_TEXT.graffitiAlready;
        return { ok: false, reason: 'dolu', message: p.msg };
      }
      const g = st.cat.graffiti[p.id];
      st.paint = {
        id: p.id, design: p.design, color: p.color, t: 0, x: g.x, z: g.z, say: 0,
      };
      closePicker();
      kit.say(DISCOVERY_TEXT.graffitiHold, 'boya');
      return { ok: true };
    }
    return { ok: false, reason: 'bilinmeyen' };
  }

  function stepPaint(dt, p) {
    const pt = st.paint;
    if (!pt) return;
    const away = Math.hypot(pt.x - p.x, pt.z - p.z) > PAINT_AWAY || p.driving || (G.player && G.player.dead);
    if (away) {
      st.paint = null;
      kit.say(DISCOVERY_TEXT.graffitiAway, 'boya');
      return;
    }
    pt.t += dt;
    if (pt.t - pt.say >= 1) {
      pt.say = pt.t;
      if (typeof G.hint === 'function') G.hint(DISCOVERY_TEXT.graffitiHold + ' %' + Math.min(100, Math.round((pt.t / PAINT_SEC) * 100)), { ttl: 1300, priority: 5, key: 'boya', cooldown: 0 });
    }
    if (pt.t >= PAINT_SEC) {
      const c = kit.blob();
      st.paint = null;
      if (paintGraffiti(c.discovery, pt.id, pt.design, pt.color)) {
        st.stats.graffiti++;
        st.decalVer = -1;
        kit.kredi(KREDI.graffiti, 'grafiti');
        const n = Object.keys(c.discovery.graffiti).length;
        kit.say(DISCOVERY_TEXT.graffitiDone + ' ' + n + '/' + COUNTS.graffiti + ' · ' + STENCIL_NAMES[pt.design] + ' · +' + KREDI.graffiti + ' Kredi', 'boya');
        kit.discover('Grafiti ' + n + '/' + COUNTS.graffiti);
        if (typeof G.sound === 'function') G.sound('craft');
        G.emit({ type: 'graffitiDone', id: pt.id, design: pt.design, color: pt.color });
        checkSets();
      }
    }
  }

  function refreshDecals() {
    const cat = st.cat;
    const c = kit.blob();
    if (!cat || !c || !st.fx) return;
    const out = [];
    const ids = Object.keys(c.discovery.graffiti);
    for (let i = 0; i < ids.length; i++) {
      const id = Number(ids[i]);
      const g = cat.graffiti[id];
      if (!g) continue;
      const v = c.discovery.graffiti[id];
      out.push({
        cx: g.cx, cy: g.cy, cz: g.cz, yaw: g.yaw, w: g.w, h: g.h, design: v[0], color: v[1],
      });
    }
    st.decals = out;
    st.fx.setDecals(out, out.length);
    st.decalVer = ids.length;
  }

  /* ---------------------------------------------------------------------------- çizim köprüsü */
  function ensureFx() {
    if (st.fx || !G.scene) return st.fx;
    st.fx = createDiscoveryFx({ THREE, quality: tier(), reducedMotion: reduced() });
    G.scene.add(st.fx.group);
    st.fx.group.visible = false;
    G.cityFx = st.fx;
    return st.fx;
  }

  function targets() {
    const fx = st.fx;
    if (!fx) return;
    const mm = G.cityMissions ? G.cityMissions.mm : null;
    const run = mm && mm.st ? mm.st.run : null;
    const rings = [];
    let beam = null;
    if (mm && mm.st.kind) {
      const stg = mm.st;
      if (stg.stage === 'staging' || stg.stage === 'countdown') {
        const g = stg.race.gates[0];
        rings.push({
          x: g.x, y: g.y, z: g.z, r: g.r * 1.2, nx: g.dx, nz: g.dz, role: 'sonraki',
        });
        beam = {
          x: g.x, y: g.y, z: g.z, r: 6, color: [0.72, 1, 0.24],
        };
      } else if (run) {
        const def = run.def;
        const s = def.steps[Math.min(run.step, def.steps.length - 1)];
        if (s.type === 'gates') {
          const gs = s.gates;
          for (let k = 0; k < 2; k++) {
            const idx = (run.gate + k) % gs.length;
            const left = run.total - run.passed - k;
            if (left <= 0) break;
            const g = gs[idx];
            const prev = gs[(idx + gs.length - 1) % gs.length];
            let dx = g.x - prev.x;
            let dz = g.z - prev.z;
            const l = Math.hypot(dx, dz) || 1;
            dx /= l; dz /= l;
            rings.push({
              x: g.x, y: g.y, z: g.z, r: g.r, nx: dx, nz: dz, role: k === 0 ? 'sonraki' : 'sonra',
            });
          }
          if (rings.length) {
            beam = {
              x: rings[0].x, y: rings[0].y, z: rings[0].z, r: 6, color: [0.72, 1, 0.24],
            };
          }
        } else if (s.type === 'goto' || s.type === 'hold') {
          rings.push({
            x: s.x, y: s.y === undefined ? 64 : s.y, z: s.z, r: s.r, nx: 0, nz: 1, role: 'hedef',
          });
          beam = { x: s.x, y: s.y === undefined ? 64 : s.y, z: s.z, r: s.r };
        }
      }
    }
    fx.setRings(rings, rings.length);
    fx.setBeam(beam);
  }

  /* ---------------------------------------------------------------------------- görünümler */
  function info() {
    const c = kit.blob();
    const cat = catalog();
    if (!cat) return null;
    return {
      chips: countChips(c.discovery),
      graffiti: Object.keys(c.discovery.graffiti).length,
      rooms: countRooms(c.discovery),
      near: st.nearSpot,
      painting: st.paint ? Math.min(1, st.paint.t / PAINT_SEC) : 0,
      scanner: hasScanner(),
      fx: st.fx ? st.fx.stats : null,
    };
  }

  const system = {
    name: 'cityDiscovery',
    order: CITY_DISCOVERY_ORDER,
    st,

    init() {
      G.cityDiscovery = {
        info,
        picker: pickerView,
        openPicker,
        st,
        markers: () => {
          const cat = catalog();
          return cat && kit.ctx() ? discoveredMarkers(cat, kit.blob().discovery) : [];
        },
      };
      registerCommand('kesif', 'kesif | cip <id> | tp <cip|grafiti|oda> <id> | hepsi', (g, a) => {
        const ok = (message, data) => ({ ok: true, message, data });
        if (!kit.inCity()) return { ok: false, message: "Keşifler yalnız Neon Meridyen'de." };
        const cat = catalog();
        const cmd = a && a[0] ? a[0] : '';
        if (cmd === 'cip') return ok(collectChip(Number(a[1]) | 0) ? 'Çip toplandı.' : 'Olmadı.');
        if (cmd === 'hepsi') {
          for (let i = 0; i < COUNTS.chips; i++) collectChip(i);
          return ok('240 çip.');
        }
        if (cmd === 'tp') {
          const id = Number(a[2]) | 0;
          const list = a[1] === 'grafiti' ? cat.graffiti : a[1] === 'oda' ? cat.rooms : cat.chips;
          const t = list[id];
          if (!t) return { ok: false, message: 'Bilinmeyen kimlik.' };
          const r = G.teleport ? G.teleport(t.x, (t.y || 64) + 0.2, t.z, { maxR: 6, yaw: t.yaw }) : false;
          return ok(r === false ? 'Işınlanamadı.' : 'Işınlandı.');
        }
        const i = info();
        return ok('Çip ' + i.chips + ' · grafiti ' + i.graffiti + ' · oda ' + i.rooms, i);
      });
    },

    fixedUpdate(_G, dt) {
      if (!kit.inCity()) return;
      const cat = catalog();
      if (!cat) return;
      const ctxBlob = kit.ctx() ? kit.ctx().city : null;
      if (ctxBlob && st.cityRef !== ctxBlob) {
        st.cityRef = ctxBlob;
        kit.blob();
        syncBits();
        st.decalVer = -1;
      }
      kit.pos(pos);
      stepPaint(dt, pos);
      st.acc += dt;
      if (st.acc >= 0.1) {
        st.acc = 0;
        if (!(G.player && G.player.dead)) {
          stepChips(pos);
          stepSpots(pos);
        }
      }
      st.slow += dt;
      if (st.slow >= 0.5) {
        st.slow = 0;
        stepRooms(pos);
        stepRoof(pos);
        stepVault(pos);
      }
      // etkileşim: grafiti
      const inp = G.inputState;
      if (inp && inp.interactPressed && st.nearSpot >= 0 && G.ui === 'none' && !st.paint && !pos.driving && !G.transitionActive) {
        const c = kit.blob();
        if (!hasGraffiti(c.discovery, st.nearSpot)) openPicker(st.nearSpot);
      }
    },

    frameUpdate(_G, dt) {
      const fx = ensureFx();
      if (!fx) return;
      if (!kit.inCity()) {
        if (st.fxShown) {
          fx.group.visible = false;
          st.fxShown = false;
        }
        return;
      }
      const cat = catalog();
      if (!cat) return;
      if (!st.fxShown) {
        fx.group.visible = true;
        st.fxShown = true;
      }
      if (!st.warmed && G.renderer && G.camera && G.scene) {
        st.warmed = true;
        const vmg = G.viewModel && G.viewModel.group;
        const vmWas = vmg ? vmg.visible : false;
        const variants = vmg ? [{ enter() { vmg.visible = true; }, exit() {} }, { enter() { vmg.visible = false; }, exit() { vmg.visible = vmWas; } }] : null;
        fx.warm(G.renderer, G.scene, G.camera, { variants });
      }
      fx.setQuality(tier());
      fx.setReducedMotion(reduced());
      kit.pos(pos);
      const c = kit.blob();
      if (st.decalVer !== Object.keys(c.discovery.graffiti).length) refreshDecals();
      st.fxAcc += dt;
      if (st.fxAcc >= 0.25 || st.chipList.length === 0) {
        st.fxAcc = 0;
        refreshChipFx(pos);
        targets();
      }
      const lk = G.cityLook && G.cityLook.state ? G.cityLook.state : null;
      fx.update(Math.min(dt || 0.016, 0.1), { night: lk ? lk.night : 0, reduced: reduced() });
    },

    onEvent(_G, evt) {
      if (!evt || !kit.inCity()) return;
      if (evt.type === 'terminalFound') {
        const c = kit.blob();
        // prop olayı `terminal` alanını taşır (propBehaviors), eski sözleşme `index`; ikisi de kabul (geçerli aralık: 0..15)
        const ti = Number.isInteger(evt.index) ? evt.index : evt.terminal;
        if (c && Number.isInteger(ti) && ti >= 0 && ti < COUNTS.terminals) {
          kit.kredi(KREDI.terminal, 'terminal');
          kit.discover(DISCOVERY_TEXT.terminalFound);
          checkSets();
        }
      } else if (evt.type === 'death' && st.paint) {
        st.paint = null;
      } else if (evt.type === 'uiChanged' && st.picker && G.ui !== 'dialogue') {
        st.picker = null;
      }
    },

    beforeDimension() {
      st.paint = null;
      st.picker = null;
    },

    onDimension() {
      st.cityRef = null;
      st.cat = null;
      st.seed = -1;
      st.decalVer = -1;
      st.chipList.length = 0;
      st.paint = null;
      st.picker = null;
      if (st.fx && G.dim !== 'neon') {
        st.fx.group.visible = false;
        st.fxShown = false;
      }
    },

    api() {
      return {
        getDiscoveryInfo: () => (kit.inCity() ? info() : null),
        getGraffitiPicker: () => (kit.inCity() ? pickerView() : null),
        graffitiAct: (a) => pickerAct(a),
      };
    },

    dispose() {
      if (st.fx) st.fx.dispose();
      st.fx = null;
      G.cityFx = null;
      G.cityDiscovery = null;
    },
  };
  return system;
}

export default createSystem;
