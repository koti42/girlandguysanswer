/*
 * KEŞİF — "cityNpc" sistemi (order 33): Neon Meridyen NPC'leri, diyalog ve satıcılar (Faz 4, paket npc_vendors). Sözleşme KESIF_CITY_CONTRACT §10, §12, §20.
 *
 *   • Sokak NPC'leri (sim/city/ped/npcData: 30 kadro): POI'ye bağlı yerleşim (npcPlace), saat/yağmur çizelgesi; yakındakiler (≤46 m) kahraman olarak çizilir
 *     (render/city/npcFigures: createCharacter low) ve PropWorld'e DİNAMİK prop olarak eklenir → "Konuş" nişanı + çarpışma (araçlarla aynı örüntü, cityNpcProps.js).
 *   • Diyalog: propDialog olayı (sahip/NPC propu) → DialogueSheet (G.ui 'dialogue'; dünya DURMAZ, trafik sürer, girdi kapanır). Klavye 1–4 / dokunma = React tarafı.
 *     Araçtayken konuşma açılmaz. NPC oyuncuya döner, kamera yumuşakça NPC'ye çerçevelenir (reducedMotion: anında). Çıkış: seçenek / Esc / uzaklaşma / ölüm / araca binme.
 *   • Satıcı: propUi {ui:'vendor'} olayı ya da diyalog `vendor` efekti → VendorPanel (G.ui 'vendor'); günlük stok, sınırlar, %40 geri satış (vendorLogic).
 *   • Efekt yolu: G.cityNpc.effects (npcEffects EffectBus) — yerleşik işleyiciler burada, görev/iş/yarış/taksi/foto işleyicilerini discovery_missions bağlar.
 *   • Kayıt: dims.neon.city.{flags, npcs, shop} CANLI tutulur (araç sistemi örüntüsü); yüklemede sanitizeNpcSave ile temizlenir.
 *
 *   G.cityNpc = {effects, talk, figures, setProvider, getFlag, setFlag, wallet, dayN, openDialogue, openVendor, state}
 *   Olaylar: npcTalk dialogueNode dialogueEnd npcEffect npcFlag vendorOpen vendorBuy vendorSell vendorClose kredi · Dinler: propDialog propUi uiChanged death vehicleEnter
 *   API (window.__game): getDialogue chooseDialogue closeDialogue talkTo getVendor openVendor vendorBuy vendorSell closeVendor getNpcInfo
 *   Hata ayıklama komutları: npc list | npc where <id> | npc talk <id> | npc tp <id> | npc day <n> | npc shop
 */
import { createNpcFigures } from '../render/city/npcFigures.js';
import { districtAt } from '../sim/city/cityPlan.js';
import { getBrand } from '../sim/city/cityBrands.js';
import { phaseKeyForHour, pickAmbient } from '../sim/city/ambientLines.js';
import { clockPhase, skyLightAt } from '../sim/daynight.js';
import { dimBoundOf } from '../sim/dim/travel.js';
import { heal as healSurvival } from '../sim/survival.js';
import { createNpcTalk } from '../sim/city/ped/npcTalk.js';
import {
  NPCS, getNpc, hourOf, npcAvailable, npcHash, npcLook,
} from '../sim/city/ped/npcData.js';
import {
  findFreeSpot, ownerLotCenter, ownerSpot, placeStreetNpcs, standHeight,
} from '../sim/city/ped/npcPlace.js';
import {
  createWallet, getFlag, rollDay, sanitizeNpcSave, setFlag, shopOf,
} from '../sim/city/ped/npcSave.js';
import { buyFrom, sellTo, vendorView } from '../sim/city/ped/vendorLogic.js';
import { getVendor } from '../sim/city/ped/vendorData.js';
import { registerCommand } from './sessionCommands.js';
import {
  NPC_T0, installNpcDefs, npcPropId, yawIndex,
} from './cityNpcProps.js';

export const CITY_NPC_ORDER = 33;
export const DAY_SECONDS = 1200;
const ACTIVATE_R = 46;
const DEACTIVATE_R = 56;
const OWNER_ACTIVATE_R = 34;
const OWNER_DEACTIVATE_R = 42;
const OWNER_LOOKUP_R = 70;
const SYNC_EVERY = 0.2;
const TALK_CLOSE_R = 11;
const BARK_MIN = 20;
const BARK_SPAN = 14;
const BARK_RANGE = 11;
const FRAME_SEC = 0.7;
const FRAME_PITCH = 0.27;
const PED_TYPE = Object.freeze({
  vendor: 'satici', courier: 'kurye', robot: 'temizlik_robotu', kid: 'cocuk', guide: 'halk', taxi: 'halk', marshal: 'halk', mechanic: 'halk', dj: 'halk', host: 'halk',
  mentor: 'halk', photographer: 'turist', elder: 'halk',
});
const wrapPi = (a) => {
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
};

export function createSystem(G) {
  const st = {
    seed: null,
    raw: new Map(),
    adj: new Map(),
    retry: new Map(),
    props: new Map(),
    ui: '',
    off: false,
    talkNpc: '',
    talkProp: 0,
    vend: null,
    frame: null,
    acc: SYNC_EVERY,
    t: 0,
    barkAt: BARK_MIN,
    recent: [],
    version: 0,
    said: '',
    stats: {
      syncs: 0, opened: 0, vendorOpened: 0, barks: 0, refusals: 0, props: 0,
    },
  };
  let figures = null;
  let talk = null;
  const probe = {
    getBlock: (x, y, z) => (G.world ? G.world.getBlock(x, y, z) : 0),
    isBlocked: null,
  };

  const reduced = () => !!(G.reducedMotion || G.accessibility);
  const isCity = () => G.dim === 'neon' && !!G.world;

  function say(text) {
    if (!text) return;
    if (typeof G.hint === 'function') G.hint(text, { ttl: 4200, priority: 3, key: 'npc:' + text, cooldown: 400 });
    else if (G.hud) G.hud.hint = text;
    if (typeof G.speak === 'function') G.speak(text);
  }

  function cityBlob() {
    const m = G.dimMgr;
    const c = m && typeof m.get === 'function' ? m.get('neon') : null;
    if (!c) return null;
    if (!c.city || typeof c.city !== 'object') c.city = { v: 1 };
    return c.city;
  }

  const wallet = createWallet(cityBlob, (e) => G.emit(e));

  function dayN() {
    if (typeof G.cityDay === 'function') {
      const d = G.cityDay();
      if (Number.isFinite(d) && d >= 0) return Math.floor(d);
    }
    const c = cityBlob();
    const s = c ? shopOf(c) : null;
    return s ? Math.floor(s.t / DAY_SECONDS) : 0;
  }

  function hourNow() {
    return G.clock ? hourOf(clockPhase(G.clock)) : 12;
  }

  function rainNow() {
    const w = G.weatherSim;
    return !!w && w.intensity > 0.3 && w.renderKind === 'rain';
  }

  function envNow() {
    const b = G.body;
    let dist = '';
    if (b && G.world) {
      try {
        dist = districtAt(G.world.seed, b.x, b.z, b.y) || '';
      } catch {
        dist = '';
      }
    }
    return { phase: phaseKeyForHour(hourNow()), rain: rainNow(), dist };
  }

  function itemDrop(item, n) {
    const b = G.body;
    if (G.em && typeof G.em.spawnItem === 'function' && b) G.em.spawnItem(item, n, b.x, b.y + 0.6, b.z);
  }

  function healPlayer(hp, food) {
    const sv = G.survival;
    if (!sv || sv.dead) return false;
    let did = 0;
    if (hp > 0) did += healSurvival(sv, hp);
    if (food > 0 && sv.hunger < sv.maxHunger) {
      const before = sv.hunger;
      sv.hunger = Math.min(sv.maxHunger, sv.hunger + food);
      sv.saturation = Math.min(sv.hunger, (sv.saturation || 0) + food * 0.6);
      did += sv.hunger - before;
    }
    return did > 0;
  }

  function ensureTalk() {
    if (talk) return talk;
    talk = createNpcTalk({
      city: () => (isCity() ? cityBlob() : null),
      inv: {
        count: (k) => (G.inventory ? G.inventory.count(k) : 0),
        canAdd: (k, n) => (G.inventory ? G.inventory.canAdd(k, n) : false),
        add: (k, n) => (G.inventory ? G.inventory.add(k, n) : n),
        remove: (k, n) => (G.inventory ? G.inventory.remove(k, n) : false),
      },
      wallet,
      emit: (e) => G.emit(e),
      env: envNow,
      day: dayN,
      drop: itemDrop,
      hintText: say,
      heal: healPlayer,
    });
    return talk;
  }

  /* ---------------------------------------------------------------------------------- arayüz sahipliği */
  function takeUi(name) {
    if (typeof G.setUi !== 'function') return false;
    if (G.ui === 'none') {
      G.setUi(name);
      return G.ui === name;
    }
    if (G.ui === 'dialogue' && name === 'vendor' && st.ui === 'dialogue') {
      G.setUi(name);
      return G.ui === name;
    }
    return false;
  }

  function dropUi(name) {
    if (st.ui === name && G.ui === name && typeof G.setUi === 'function') G.setUi('none');
    if (st.ui === name) st.ui = '';
  }

  function lockPanelOpen() {
    return typeof G.getLockPanel === 'function' && !!G.getLockPanel();
  }

  function canTalk() {
    if (!isCity() || !G.player || G.player.dead) return 'Burada konuşamazsın.';
    if (G.player.vehicle) return 'Önce araçtan in.';
    if (G.transitionActive) return 'Geçiş sürüyor.';
    if (lockPanelOpen()) return 'Önce paneli kapat.';
    return '';
  }

  /* ---------------------------------------------------------------------------------- diyalog */
  function npcPos(npcId) {
    const f = figures ? figures.get(npcId) : null;
    if (f) return f;
    return null;
  }

  function frameOn(npcId) {
    const f = npcPos(npcId);
    const b = G.body;
    if (!f || !b || !G.player) return;
    const ex = b.x;
    const ey = b.y + (b.eyeH || 1.62);
    const ez = b.z;
    const dx = f.x - ex;
    const dz = f.z - ez;
    const dy = f.eyeY - ey;
    const h = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz);
    // NPC alt sayfanın (ekranın alt ~%40'ı) üstünde kalsın: bakışı biraz aşağı çek (ekranda yukarı çıkar)
    const pitch = Math.max(-0.7, Math.min(0.5, Math.atan2(dy, Math.max(0.1, h)) - FRAME_PITCH));
    st.frame = { t: 0, yaw, pitch };
    if (reduced()) {
      G.player.yaw = yaw;
      G.player.pitch = pitch;
      st.frame = null;
    }
  }

  function stepFrame(dt) {
    const fr = st.frame;
    if (!fr || !G.player) return;
    fr.t += dt;
    const k = 1 - Math.exp(-9 * dt);
    G.player.yaw += wrapPi(fr.yaw - G.player.yaw) * k;
    G.player.pitch += (fr.pitch - G.player.pitch) * k;
    if (fr.t >= FRAME_SEC) st.frame = null;
  }

  function openDialogue(npcId, hint) {
    const why = canTalk();
    if (why) {
      st.stats.refusals++;
      say(why);
      return { ok: false, reason: 'engel', message: why };
    }
    if (!getNpc(npcId)) return { ok: false, reason: 'yok' };
    if (st.ui === 'dialogue') closeDialogue('replaced');
    if (st.ui === 'vendor') closeVendor();
    if (G.ui !== 'none') return { ok: false, reason: 'ui' };
    const t = ensureTalk();
    syncCity();
    const view = t.start(npcId, hint);
    if (!view) return { ok: false, reason: 'yok' };
    if (!takeUi('dialogue')) {
      t.close('ui');
      return { ok: false, reason: 'ui' };
    }
    st.ui = 'dialogue';
    st.talkNpc = npcId;
    st.version++;
    st.stats.opened++;
    if (figures) {
      const b = G.body;
      if (b) figures.faceTarget(npcId, b.x, b.z);
    }
    frameOn(npcId);
    announce(view);
    if (typeof G.sound === 'function') G.sound('ui_open', undefined, { vol: 0.5 });
    return { ok: true, view };
  }

  function announce(view) {
    if (!view) return;
    const text = view.npc.name + ': ' + view.lines.join(' ');
    if (text !== st.said && typeof G.speak === 'function') G.speak(text);
    st.said = text;
  }

  function finishDialogue(res) {
    const t = ensureTalk();
    const pending = t.pending;
    t.pending = null;
    const npcId = st.talkNpc;
    st.talkNpc = '';
    st.said = '';
    st.frame = null;
    if (figures && npcId) figures.clearFace(npcId);
    dropUi('dialogue');
    if (res && res.say) say(res.say === 'end' ? '' : res.say);
    if (pending && pending.ui === 'vendor') openVendor(pending.id, true);
    else if (pending && pending.ui === 'garage') G.emit({ type: 'propUi', ui: 'garage' });
  }

  function closeDialogue(reason) {
    if (!talk || !talk.runner.isOpen()) {
      dropUi('dialogue');
      return false;
    }
    talk.pending = reason === 'replaced' ? null : talk.pending;
    talk.close(reason || 'kapat');
    finishDialogue(null);
    return true;
  }

  function chooseDialogue(n) {
    if (!talk || !talk.runner.isOpen() || st.ui !== 'dialogue') return { ok: false, ended: true, reason: 'kapali', view: null };
    const r = talk.choose(n);
    if (typeof G.sound === 'function' && r.ok) G.sound('ui_click', undefined, { vol: 0.4 });
    if (r.ended) {
      finishDialogue(r);
      return { ok: r.ok, ended: true, view: null, msg: r.msg || '' };
    }
    st.version++;
    announce(r.view);
    return { ok: r.ok, ended: false, reason: r.reason, view: r.view };
  }

  /* ---------------------------------------------------------------------------------- satıcı */
  function vendorInfo(id) {
    const n = getNpc(id);
    if (!n) return { name: 'Otomat', title: 'Atıştırmalık Otomatı', brand: '' };
    const b = n.brand ? getBrand(n.brand) : null;
    return { name: n.name, title: n.title, brand: b ? b.name : '' };
  }

  function vendorCtx() {
    const c = cityBlob();
    if (!c) return null;
    rollDay(c, dayN());
    return {
      seed: G.world ? G.world.seed : 0,
      dayN: dayN(),
      shop: shopOf(c),
      inv: {
        count: (k) => (G.inventory ? G.inventory.count(k) : 0),
        canAdd: (k, n) => (G.inventory ? G.inventory.canAdd(k, n) : false),
        add: (k, n) => (G.inventory ? G.inventory.add(k, n) : n),
        remove: (k, n) => (G.inventory ? G.inventory.remove(k, n) : false),
        list: () => (G.inventory ? G.inventory.list() : []),
      },
      wallet,
      isBound: (item) => !!dimBoundOf(item),
    };
  }

  function openVendor(vendorId, fromDialogue) {
    const why = canTalk();
    if (why) {
      st.stats.refusals++;
      say(why);
      return { ok: false, reason: 'engel', message: why };
    }
    const id = getVendor(vendorId) ? vendorId : 'otomat';
    if (st.ui === 'dialogue') closeDialogue('vendor');
    if (st.ui === 'vendor') closeVendor();
    if (G.ui !== 'none') return { ok: false, reason: 'ui' };
    if (!takeUi('vendor')) return { ok: false, reason: 'ui' };
    st.ui = 'vendor';
    st.vend = { id, msg: '' };
    st.version++;
    st.stats.vendorOpened++;
    G.emit({ type: 'vendorOpen', vendor: id });
    const info = vendorInfo(id);
    if (typeof G.speak === 'function') G.speak(info.name + ' tezgâhı açıldı.');
    if (typeof G.sound === 'function') G.sound('ui_open', undefined, { vol: 0.5 });
    return { ok: true, fromDialogue: !!fromDialogue };
  }

  function closeVendor() {
    if (!st.vend) {
      dropUi('vendor');
      return false;
    }
    const id = st.vend.id;
    st.vend = null;
    dropUi('vendor');
    st.version++;
    G.emit({ type: 'vendorClose', vendor: id });
    return true;
  }

  function getVendorView() {
    if (!st.vend || st.ui !== 'vendor') return null;
    const ctx = vendorCtx();
    if (!ctx) return null;
    const v = vendorView(ctx, st.vend.id, vendorInfo(st.vend.id));
    if (!v) return null;
    v.msg = st.vend.msg;
    v.vendor.canTalk = !!getNpc(st.vend.id);
    v.version = st.version;
    return v;
  }

  function vendorTrade(kind, item, n) {
    if (!st.vend || st.ui !== 'vendor') return { ok: false, reason: 'kapali', message: 'Satıcı paneli kapalı.' };
    const ctx = vendorCtx();
    if (!ctx) return { ok: false, reason: 'kapali', message: 'Satıcı paneli kapalı.' };
    const r = kind === 'buy' ? buyFrom(ctx, st.vend.id, item, n) : sellTo(ctx, st.vend.id, item, n);
    st.vend.msg = r.message;
    st.version++;
    if (r.ok) {
      G.emit({
        type: kind === 'buy' ? 'vendorBuy' : 'vendorSell', vendor: st.vend.id, item, n: r.n, price: r.price,
      });
      if (typeof G.sound === 'function') G.sound('ui_click', undefined, { vol: 0.5 });
    }
    if (typeof G.speak === 'function') G.speak(r.message);
    return r;
  }

  /* ---------------------------------------------------------------------------------- sokak NPC'leri */
  function syncCity() {
    if (!isCity()) return false;
    const seed = G.world.seed;
    if (st.seed !== seed) {
      st.seed = seed;
      st.raw = new Map();
      placeStreetNpcs(seed).forEach((s) => st.raw.set(s.id, s));
      st.adj = new Map();
      st.retry = new Map();
      const c = cityBlob();
      if (c) {
        const clean = sanitizeNpcSave(c);
        c.flags = clean.flags;
        c.npcs = clean.npcs;
        c.shop = clean.shop;
      }
    }
    return true;
  }

  function resolveSpot(npc) {
    if (st.adj.has(npc.id)) return st.adj.get(npc.id);
    const raw = st.raw.get(npc.id);
    if (!raw) return null;
    if ((st.retry.get(npc.id) || 0) > st.t) return null;
    const taken = [];
    st.adj.forEach((s) => { if (s) taken.push(s); });
    const pr = {
      getBlock: probe.getBlock,
      isBlocked: (x, y, z) => taken.some((q) => (q.x - x) * (q.x - x) + (q.z - z) * (q.z - z) < 2.56),
    };
    const f = findFreeSpot(pr, raw.x, raw.y, raw.z, { maxR: 5 });
    if (!f) {
      st.retry.set(npc.id, st.t + 2.5);
      return null;
    }
    const spot = {
      id: npc.id, x: f.x, y: f.y, z: f.z, yaw: raw.yaw,
    };
    st.adj.set(npc.id, spot);
    return spot;
  }

  function removeProp(id) {
    const pid = st.props.get(id);
    if (pid === undefined) return;
    st.props.delete(id);
    if (G.props && typeof G.props.removeDynamic === 'function') G.props.removeDynamic(pid);
  }

  function ensureProp(npc, idx, spot) {
    if (st.props.has(npc.id) || !G.props) return;
    installNpcDefs(G.props);
    let pid = npcPropId(G.world.seed, npc.id);
    while (G.props.has(pid)) pid = (pid + 1) >>> 0 || 0x80000001;
    const ok = G.props.addDynamic({
      id: pid, t: NPC_T0 + idx, x: spot.x, y: spot.y, z: spot.z, yaw: yawIndex(spot.yaw), variant: 0, flags: 0,
    });
    if (ok) {
      st.props.set(npc.id, pid);
      st.stats.props++;
    }
  }

  function clearProps() {
    Array.from(st.props.keys()).forEach(removeProp);
  }

  function ensureFigures() {
    if (figures || !G.scene) return figures;
    figures = createNpcFigures({ tier: tierOf(), reducedMotion: reduced() });
    G.scene.add(figures.group);
    figures.group.visible = false;
    G.npcFigures = figures;
    return figures;
  }

  function tierOf() {
    const q = G.quality && G.quality.settings ? G.quality.settings.effTier : null;
    return q === 'low' || q === 'medium' || q === 'high' ? q : 'high';
  }

  /** Sahibin duracağı yer (iç mekân planı ownerPost): yakın değilse null (planı gereksiz yere çözme); station sahipleri (kendi propu olanlar) figürsüz. */
  function ownerSpotNow(npc, px, pz) {
    const c = ownerLotCenter(st.seed, npc.id);
    if (!c || Math.hypot(c.x - px, c.z - pz) > OWNER_LOOKUP_R) return null;
    const sp = ownerSpot(st.seed, npc.id);
    return sp && !sp.station ? sp : null;
  }

  function scan() {
    st.stats.syncs++;
    if (!ensureFigures() || !G.body || !syncCity()) return;
    const b = G.body;
    const hour = hourNow();
    const rain = rainNow();
    const cands = [];
    for (let i = 0; i < NPCS.length; i++) {
      const npc = NPCS[i];
      const owner = npc.kind === 'owner';
      const talking = st.talkNpc === npc.id;
      const was = figures.has(npc.id);
      let spot = null;
      let d = 0;
      if (owner) {
        const sp = ownerSpotNow(npc, b.x, b.z);
        if (!sp) continue;
        d = Math.hypot(sp.x - b.x, sp.z - b.z);
        if (!talking && d > (was ? OWNER_DEACTIVATE_R : OWNER_ACTIVATE_R)) continue;
        const sy = standHeight(probe, sp.x, sp.y, sp.z); // sahne/plaka üstünde durana yarım blok yükseklik
        spot = sy === null ? sp : Object.assign({}, sp, { y: sy });
      } else {
        const raw = st.raw.get(npc.id);
        if (!raw) continue;
        d = Math.hypot(raw.x - b.x, raw.z - b.z);
        if (!talking && d > (was ? DEACTIVATE_R : ACTIVATE_R)) continue;
        if (!talking && !npcAvailable(npc, hour, rain)) continue;
        spot = resolveSpot(npc);
        if (!spot) continue;
      }
      cands.push({
        id: npc.id, look: npcLook(npc), x: spot.x, y: spot.y, z: spot.z, yaw: spot.yaw, dist: d, emotes: npc.emotes, h: npcHash(st.seed, npc.id), idx: i, spot,
      });
    }
    figures.sync(cands, st.t);
    const want = new Set();
    cands.forEach((c) => {
      const f = figures.get(c.id);
      if (f && f.visible) {
        want.add(c.id);
        ensureProp(NPCS[c.idx], c.idx, c.spot);
      }
    });
    Array.from(st.props.keys()).forEach((id) => { if (!want.has(id)) removeProp(id); });
  }

  /* ---------------------------------------------------------------------------------- yüzlük konuşma ("bark") */
  function bark() {
    if (!figures || G.ui !== 'none' || (G.player && G.player.vehicle) || !G.body) return;
    const b = G.body;
    let best = null;
    let bd = 1e9;
    st.props.forEach((pid, id) => {
      const f = figures.get(id);
      if (!f || !f.visible) return;
      const d = Math.hypot(f.x - b.x, f.z - b.z);
      if (d < bd && d <= BARK_RANGE) { bd = d; best = id; }
    });
    if (!best) return;
    const npc = getNpc(best);
    const env = envNow();
    const slot = (st.stats.barks + (npcHash(st.seed, best) % 97)) | 0;
    const line = pickAmbient(st.seed, slot, {
      type: PED_TYPE[npc.kind] || 'halk', district: env.dist, phase: env.phase, rain: env.rain,
    }, st.recent);
    if (!line) return;
    st.recent.push(line.id);
    if (st.recent.length > 4) st.recent.shift();
    st.stats.barks++;
    say(npc.name + ': ' + line.text);
  }

  /* ---------------------------------------------------------------------------------- sistem */
  function leaveCity() {
    if (st.ui === 'dialogue') closeDialogue('dim');
    if (st.ui === 'vendor') closeVendor();
    clearProps();
    if (figures) {
      figures.sync([], st.t);
      figures.group.visible = false;
    }
    st.seed = null;
    st.raw = new Map();
    st.adj = new Map();
  }

  const sys = {
    name: 'cityNpc',
    order: CITY_NPC_ORDER,
    state: st,

    init() {
      G.cityNpc = {
        get effects() { return ensureTalk().bus; },
        get talk() { return ensureTalk(); },
        get figures() { return figures; },
        setProvider: (p) => ensureTalk().setProvider(p),
        getFlag: (k) => getFlag(cityBlob() || {}, k),
        setFlag: (k, v) => {
          const c = cityBlob();
          const ok = !!c && setFlag(c, k, v);
          if (ok) G.emit({ type: 'npcFlag', key: k, v: v === true ? 1 : v === false ? 0 : v });
          return ok;
        },
        wallet,
        dayN,
        openDialogue,
        openVendor,
        state: st,
      };
      ensureTalk();
      registerDebug();
    },

    beforeDimension() {
      leaveCity();
    },

    onDimension() {
      st.said = '';
      if (!isCity()) leaveCity();
      else syncCity();
    },

    fixedUpdate(_G, dt) {
      if (!isCity()) {
        if (st.seed !== null || st.props.size > 0) leaveCity();
        return;
      }
      if (G.time && G.time.paused) return;
      if (st.off) {
        if (st.props.size > 0) leaveCity();
        return;
      }
      st.t += dt;
      const c = cityBlob();
      if (c) shopOf(c).t += dt;
      stepFrame(dt);
      if (st.ui === 'dialogue') {
        if (G.player && (G.player.dead || G.player.vehicle)) closeDialogue('engel');
        else if (st.talkNpc && figures && G.body) {
          const f = figures.get(st.talkNpc);
          if (f && Math.hypot(f.x - G.body.x, f.z - G.body.z) > TALK_CLOSE_R) closeDialogue('uzak');
          else if (f) figures.faceTarget(st.talkNpc, G.body.x, G.body.z);
        }
      }
      st.acc += dt;
      if (st.acc >= SYNC_EVERY) {
        st.acc = 0;
        scan();
      }
      if (st.ui === '' && st.t >= st.barkAt) {
        st.barkAt = st.t + BARK_MIN + (npcHash(st.seed || 0, 'bark' + st.stats.barks) % (BARK_SPAN * 10)) / 10;
        bark();
      }
    },

    frameUpdate(_G, dt) {
      if (!figures) return;
      const city = isCity();
      figures.group.visible = city && !st.off;
      if (!city || st.off) return;
      const t = tierOf();
      if (figures.tier !== t) figures.setTier(t);
      figures.setReducedMotion(reduced());
      const b = G.body;
      const sky = G.clock ? skyLightAt(clockPhase(G.clock)) : 1;
      figures.update(dt, st.t, {
        px: b ? b.x : undefined,
        pz: b ? b.z : undefined,
        light(x, y, z) {
          const w = G.world;
          if (!w || typeof w.getLight !== 'function') return 1;
          const l = w.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
          if (!Number.isFinite(l)) return 1;
          const lit = Math.max(((l >> 4) / 15) * sky, ((l & 15) / 15) * 0.95);
          // oyuncu karakterinden (0,28 + lit·0,95) biraz aydınlık: neon gece sokağında kadro okunaklı kalsın
          return Math.min(1.25, 0.46 + lit * 0.85);
        },
      });
    },

    onEvent(_G, e) {
      if (!e || typeof e.type !== 'string') return;
      switch (e.type) {
        case 'propDialog':
          if (typeof e.npc === 'string') openDialogue(e.npc, typeof e.node === 'string' ? e.node : undefined);
          break;
        case 'propUi':
          if (e.ui === 'vendor') openVendor(typeof e.vendor === 'string' ? e.vendor : 'otomat');
          break;
        case 'uiChanged':
          if (e.ui === 'none' || (e.ui !== 'dialogue' && e.ui !== 'vendor')) {
            if (st.ui === 'dialogue' && e.ui !== 'dialogue') {
              if (talk && talk.runner.isOpen()) talk.close('ui');
              finishDialogue(null);
            }
            if (st.ui === 'vendor' && e.ui !== 'vendor') closeVendor();
          }
          break;
        case 'death':
        case 'vehicleEnter':
          if (st.ui === 'dialogue') closeDialogue('engel');
          if (st.ui === 'vendor') closeVendor();
          break;
        default:
          break;
      }
    },

    api() {
      return {
        getDialogue() {
          if (st.ui !== 'dialogue' || !talk) return null;
          const v = talk.view();
          return v;
        },
        chooseDialogue: (n) => chooseDialogue(n),
        closeDialogue() {
          return closeDialogue('kapat');
        },
        talkTo(npcId, hint) {
          return openDialogue(npcId, hint);
        },
        getVendor: getVendorView,
        openVendor: (id) => openVendor(id),
        vendorBuy: (item, n) => vendorTrade('buy', item, n === undefined ? 1 : n),
        vendorSell: (item, n) => vendorTrade('sell', item, n === undefined ? 1 : n),
        closeVendor: () => closeVendor(),
        getNpcInfo() {
          const c = cityBlob();
          return {
            city: isCity(),
            active: Array.from(st.props.keys()),
            figures: figures ? figures.stats() : null,
            ui: st.ui,
            talking: st.talkNpc,
            kredi: isCity() ? wallet.get() : 0,
            day: isCity() ? dayN() : 0,
            flags: c && c.flags ? Object.assign({}, c.flags) : {},
            stats: Object.assign({}, st.stats),
          };
        },
      };
    },

    dispose() {
      leaveCity();
      if (figures) {
        if (G.scene) G.scene.remove(figures.group);
        figures.dispose();
        figures = null;
      }
      G.npcFigures = null;
      G.cityNpc = null;
    },
  };

  let debugDone = false;
  function registerDebug() {
    if (debugDone) return;
    debugDone = true;
    registerCommand('npc', 'npc list | where <id> | talk <id> | tp <id> [mesafe] | day <n> | shop', (g, a) => {
      const ok = (message, data) => ({ ok: true, message, data });
      const err = (message) => ({ ok: false, message });
      const cmd = a && a[0] ? a[0] : 'list';
      if (!G.cityNpc || !isCity()) return err('NPC sistemi yalnız Neon Meridyen\'de.');
      if (cmd === 'list') {
        return ok('Aktif: ' + (Array.from(st.props.keys()).join(', ') || 'yok'), { active: Array.from(st.props.keys()), all: NPCS.map((n) => n.id) });
      }
      const anySpot = (id) => st.adj.get(id) || st.raw.get(id) || (getNpc(id) && getNpc(id).kind === 'owner' ? ownerSpot(st.seed, id) : null);
      if (cmd === 'where') {
        const sp = anySpot(a[1]);
        return sp ? ok(a[1] + ' @ ' + sp.x.toFixed(1) + ',' + sp.y + ',' + sp.z.toFixed(1), sp) : err('Bilinmeyen NPC.');
      }
      if (cmd === 'talk') {
        const r = openDialogue(a[1], a[2]);
        return r.ok ? ok('Diyalog açıldı.', { node: r.view.node }) : err('Açılamadı: ' + (r.reason || ''));
      }
      if (cmd === 'tp') {
        const sp = anySpot(a[1]);
        if (!sp) return err('Bilinmeyen NPC.');
        const q = Math.floor(Number(a[3])) || 0; // yaklaşma yönü: yüzün önü + q×90°
        const ay = sp.yaw + q * (Math.PI / 2);
        const sx = Math.sin(ay);
        const cz = Math.cos(ay);
        const dd = Number.isFinite(Number(a[2])) && Number(a[2]) > 0.8 ? Number(a[2]) : 3;
        const bx = sp.x - sx * dd;
        const bz = sp.z - cz * dd;
        G.body.x = bx; G.body.y = sp.y; G.body.z = bz; G.body.vx = 0; G.body.vy = 0; G.body.vz = 0;
        G.player.yaw = Math.atan2(-(sp.x - bx), -(sp.z - bz));
        G.player.pitch = 0;
        return ok('Işınlandı: ' + a[1], { x: bx, z: bz });
      }
      if (cmd === 'day') {
        const n = Math.floor(Number(a[1]));
        if (!Number.isFinite(n) || n < 0) return err('npc day <n>');
        const c = cityBlob();
        shopOf(c).t = n * DAY_SECONDS + 0.5;
        rollDay(c, n);
        return ok('Gün: ' + n, { day: dayN() });
      }
      if (cmd === 'off' || cmd === 'on') {
        st.off = cmd === 'off';
        if (st.off) leaveCity();
        return ok('NPC sistemi: ' + (st.off ? 'kapalı' : 'açık'), { off: st.off });
      }
      if (cmd === 'shop') {
        const r = openVendor(a[1] || 'otomat');
        return r.ok ? ok('Satıcı açıldı.') : err('Açılamadı: ' + (r.reason || ''));
      }
      return err('npc list | where <id> | talk <id> | tp <id> | day <n> | shop [id]');
    });
  }

  return sys;
}

export default createSystem;
