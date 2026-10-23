/*
 * KEŞİF — "cityLocks" sistemi (order 24, sözleşme §8, §19 locks_hack): Neon Meridyen kilitleri, kapıları, mini oyun makineleri ve kule asansörleri.
 *
 *   • Cephe girişi kayar kapıları (239/240, `record:false`): oyuncu ≤2 blokta açılır, kapıdayken kapanmaz.                          → cityLocksDoors.js
 *   • İç kapı propları: kilitsiz → yaklaşınca açılır; kilitli → çözülünce (kalıcı) ya da DERİN taraftan (çıkış serbest) açılır.        → cityLocksDoors.js
 *   • Kilit düzenekleri (kod_paneli / kart_okuyucu / hack_terminali) `propUsed` ile panel açar: ui 'dialogue' + G.getLockPanel() verisi.  → cityLocksPanel.js
 *     Yanlış deneme = 20 sn soğuma (KALICI KİLİT YOK); çözüm `dims.neon.locks[kilitKimliği] = 1` (kayıt v3, paylaşılan nesne).
 *   • Asansörler (kule çekirdeği başına 1): kabin dinamik prop + görsel, durak kapıları 239/240, platform taşıma, kayıt.                 → cityLocksElev.js
 *   • Kimlik kartları item:kart_gri|turuncu|mor (dimBound 'neon'), olay `lockOpened {lockId, kind, tier, lot, hidden, how, x,y,z}`.
 *   • props_content köprüsü: propIndoor.setLockBridge({isOpen(lockId)}) bu sistemin durumuna bağlanır.
 *
 * G'ye dokunuş: hiçbir dünya/prop/oyuncu nesnesi önbelleğe alınmaz (her çağrıda taze; dimAudit); onDimension zorunlu kancadır.
 * api(): getLockPanel() · lockInput(act) · closeLockPanel() · getLocksInfo() · getLocksDebug()
 * serialize/restore: dims.neon.locks (DimCtx.locks) zaten boyut kaydındadır; boyut yöneticisi yoksa (tek dünya/test) bu sistem {v:1, locks} yazar.
 */
import {
  CARD_KEYS, CARD_NAMES, LockBook, assignClues, cardKey, onEntrySide,
} from '../sim/city/interior/locks.js';
import {
  clueOfProp, doorOfProp, lockById, padOfProp, padPropsOf,
} from '../sim/city/interior/lockLookup.js';
import { registerDimBound } from '../sim/dim/travel.js';
import { setLockBridge } from '../sim/props/propIndoor.js';
import { createElevators } from './cityLocksElev.js';
import { createInteriorDoors, createStreetDoors } from './cityLocksDoors.js';
import { createPanels } from './cityLocksPanel.js';

export const CITY_LOCKS_ORDER = 24;
export const LOCK_UI = 'dialogue';

const PAD_KEYS = Object.freeze({ kod_paneli: true, kart_okuyucu: true, hack_terminali: true });
const DOOR_KEYS = Object.freeze({ kapi: true, kapi_genis: true });
const CLUE_KEYS = Object.freeze({
  kod_notu: true, ilan_panosu: true, bilgi_terminali: true, posta_kutusu: true,
});
const COOL_STATE = 2;

/** G'nin dünyası: ctx (DimCtx benzeri) parametresi üzerinden okunur → fabrika kapsamında önbellek yok. */
function worldOf(ctx) {
  return ctx.world;
}

export function createSystem(G) {
  const st = {
    book: new LockBook({ store: {}, seed: 0 }),
    fallbackStore: {},
    seed: null,
    store: null,
    wasCity: false,
    pads: new Map(), // propId → bookTime (soğuma bitişi)
    padOwner: null,
    uiOwned: false,
    events: { opened: 0, wrong: 0, cards: 0 },
  };
  let streetDoors = null;
  let interiorDoors = null;
  let elev = null;
  let panels = null;
  let disposed = false;

  /* ------------------------------------------------------------------------------------------ yardımcılar (taze okuma) */
  const isCity = () => {
    const w = worldOf(G);
    return G.dim === 'neon' && !!w && w.dim === 'neon';
  };
  const citySeed = () => {
    const w = worldOf(G);
    return w ? w.seed | 0 : 0;
  };
  const storeNow = () => {
    const m = G.dimMgr;
    const c = m && typeof m.get === 'function' ? m.get('neon') : null;
    if (c && c.locks && typeof c.locks === 'object') return c.locks;
    return st.fallbackStore;
  };
  const solvedNow = () => {
    const s = storeNow();
    let n = 0;
    Object.keys(s).forEach((k) => { if (s[k] === 1) n++; });
    return n;
  };
  const accessibility = () => !!G.accessibility;
  const nowSec = () => (G.time ? G.time.seconds : 0);

  function say(text) {
    if (!text) return;
    if (typeof G.hint === 'function') G.hint(text, { ttl: 3600, priority: 4, key: 'lock:say', cooldown: 300 });
    else if (G.hud) G.hud.hint = text;
    if (typeof G.speak === 'function') G.speak(text);
  }

  function hintOnly(text) {
    if (typeof G.hint === 'function') G.hint(text, { ttl: 2600, priority: 3, key: 'lock:hint', cooldown: 1500 });
    else if (G.hud) G.hud.hint = text;
  }

  function sound(name, opts) {
    if (typeof G.sound === 'function') G.sound(name, undefined, opts || { vol: 0.8 });
  }

  function soundAt(name, x, y, z, opts) {
    if (typeof G.sound === 'function') G.sound(name, { x, y, z }, opts || { vol: 0.8 });
  }

  const hasItem = (key) => !!(G.inventory && G.inventory.count(key) > 0);

  function syncBook() {
    const seed = citySeed();
    const store = storeNow();
    if (st.seed !== seed) {
      st.seed = seed;
      st.book.seed = seed;
      st.book.resetTransient();
    }
    if (st.store !== store) {
      st.store = store;
      st.book.setStore(store);
    }
  }

  /* ------------------------------------------------------------------------------------------ arayüz sahipliği */
  function openUi() {
    if (typeof G.setUi !== 'function') return false;
    if (G.ui === 'none') {
      G.setUi(LOCK_UI);
      st.uiOwned = G.ui === LOCK_UI;
      return st.uiOwned;
    }
    return G.ui === LOCK_UI;
  }

  function closeUi() {
    if (st.uiOwned && G.ui === LOCK_UI && typeof G.setUi === 'function') G.setUi('none');
    st.uiOwned = false;
  }

  function closePanel() {
    if (panels) panels.close();
    closeUi();
  }

  /* ------------------------------------------------------------------------------------------ çözüm etkileri */
  function propsNear(pw, x, z, r, filter) {
    const out = [];
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = pw.chunkProps(cx + dx, cz + dz);
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          if (Math.abs(p.x - x) > r || Math.abs(p.z - z) > r) continue;
          const e = pw.entry(p.id);
          if (e && e.def && filter(e.def, p)) out.push(p);
        }
      }
    }
    return out;
  }

  function setPadStates(door, state) {
    const pw = G.props;
    if (!pw || !door) return;
    const pads = padPropsOf(pw, door);
    for (let i = 0; i < pads.length; i++) {
      pw.setState(pads[i].id, state);
      if (state === COOL_STATE) st.pads.set(pads[i].id, st.book.now + 20);
      else st.pads.delete(pads[i].id);
    }
  }

  function giveCard(level) {
    const key = cardKey(level);
    if (!key || !G.inventory) return;
    for (let lv = level; lv <= 3; lv++) if (hasItem(cardKey(lv))) return; // aynı ya da üst seviye kart zaten var
    const left = G.inventory.add(key, 1);
    if (left > 0 && G.em && typeof G.em.spawnItem === 'function' && G.body) G.em.spawnItem(key, left, G.body.x, G.body.y + 0.6, G.body.z);
    st.events.cards++;
    G.emit({
      type: 'itemPickedUp', item: key, count: 1, source: 'lock',
    });
    say(CARD_NAMES[level - 1] + ' kazandın!');
  }

  /** Bir kilit çözüldü (kod / kart / mini oyun / gizli kapı): düzenek yeşil, kapı açılır, kart ödülü, olay. */
  function applySolved(info) {
    const { lotId, lock, door } = info;
    const hidden = !!info.hidden;
    setPadStates(door, 1);
    const pw = G.props;
    if (pw && interiorDoors) {
      const doors = propsNear(pw, door.x + 0.5, door.z + 0.5, 0.4, (d) => d.tags.indexOf('door') >= 0);
      for (let i = 0; i < doors.length; i++) interiorDoors.openNow(pw, doors[i]);
    }
    const sp = st.book.specOf(lotId, lock);
    if (sp && sp.gives > 0 && lock.kind !== 'serbest') giveCard(sp.gives);
    st.events.opened++;
    soundAt('prop:door', door.x + 0.5, door.y + 1, door.z + 0.5);
    G.emit({
      type: 'lockOpened',
      lockId: lock.id,
      kind: lock.kind,
      tier: lock.tier,
      lot: lotId,
      hidden,
      how: info.how || '',
      x: door.x + 0.5,
      y: door.y,
      z: door.z + 0.5,
    });
    say(hidden ? 'Raf yana kaydı: gizli bir oda buldun!' : 'Kilit açıldı!');
  }

  /* ------------------------------------------------------------------------------------------ prop etkileşimleri */
  function openLockPanel(info) {
    if (!info || !info.lock) return false;
    const L = info.lock;
    if (L.kind === 'serbest') return false;
    if (st.book.isSolved(info.lotId, L)) {
      say('Bu kilit zaten açık.');
      applySolved(Object.assign({ how: 'zaten' }, info));
      return true;
    }
    let hasClue = false;
    try {
      hasClue = assignClues(info.it).has(L.id);
    } catch {
      hasClue = false;
    }
    if (!panels.open({
      type: 'lock', lotId: info.lotId, lock: L, door: info.door, hasClue,
    })) return false;
    if (!openUi()) {
      panels.close();
      return false;
    }
    const sn = panels.snapshot();
    if (typeof G.speak === 'function' && accessibility() && sn) G.speak(sn.title + '. ' + (sn.live || ''));
    return true;
  }

  function openElevatorPanel(rec) {
    if (!panels || panels.isOpen() || G.ui !== 'none') return;
    if (!panels.open({ type: 'elevator', rec })) return;
    if (!openUi()) panels.close();
  }

  function onPad(prop, key) {
    const info = padOfProp(citySeed(), prop, key);
    if (!info || !info.lock) {
      hintOnly('Bu düzenek çalışmıyor.');
      return;
    }
    openLockPanel(info);
  }

  function onDoor(prop) {
    const pw = G.props;
    const info = interiorDoors ? interiorDoors.infoOf(prop) : doorOfProp(citySeed(), prop);
    if (!info || !info.lock || info.lock.kind === 'serbest') return;
    if (st.book.isSolved(info.lotId, info.lock)) return;
    const b = G.body;
    const entry = info.side && b ? onEntrySide(info.side, b.x, b.z) : true;
    if (!entry) return; // içeriden çıkış serbest (kapı kendiliğinden açılır)
    const pads = pw ? padPropsOf(pw, info.door) : [];
    if (pads.length === 0) {
      openLockPanel(info); // düzenek yoksa kapının kendisi paneli açar (asla çözümsüz kilit yok)
      return;
    }
    hintOnly('Kapı kilitli. Yanındaki düzeneği kullan.');
  }

  function onSecret(prop) {
    const info = doorOfProp(citySeed(), prop);
    if (!info || !info.lock) return;
    const L = info.lock;
    if (info.hidden && L.kind === 'serbest') {
      if (st.book.solve(info.lotId, L)) applySolved(Object.assign({ how: 'gizli' }, info));
      return;
    }
    onDoor(prop);
  }

  function onClue(prop) {
    const c = clueOfProp(citySeed(), prop);
    if (!c) return;
    const text = 'Notta şu yazıyor: ' + c.digits.join(' - ');
    const cur = G.hud ? G.hud.hint : null;
    if (typeof cur === 'string' && c.digits.every((d) => cur.indexOf(String(d)) >= 0) && cur.indexOf('-') >= 0) return; // props_content iletisi rakamları zaten gösteriyor
    say(text);
  }

  function onPropUsed(e) {
    if (!isCity() || !e || typeof e.key !== 'string') return;
    const prop = {
      id: e.id, x: e.x, y: e.y, z: e.z,
    };
    if (PAD_KEYS[e.key] === true) onPad(prop, e.key);
    else if (DOOR_KEYS[e.key] === true) onDoor(prop);
    else if (e.key === 'gizli_kapi_raf') onSecret(prop);
    else if (e.key === 'asansor_dugmesi') {
      const msg = elev.onButton(prop);
      if (msg) say(msg);
    } else if (CLUE_KEYS[e.key] === true) onClue(prop);
  }

  /** props_content `fx.lock(lockId, op)` → 'propLock': kilidi kimliğinden bul ve paneli aç (aynı kilit için idempotent). */
  function onPropLock(e) {
    if (!isCity() || !e || typeof e.lockId !== 'string' || !G.body) return;
    if (panels.isOpen()) return;
    const info = lockById(citySeed(), G.body.x, G.body.z, e.lockId);
    if (info && info.lock && info.lock.kind !== 'serbest') openLockPanel(info);
  }

  /* ------------------------------------------------------------------------------------------ panel bağlamı */
  function buildPanels() {
    panels = createPanels({
      book: st.book,
      citySeed,
      hasItem,
      accessibility,
      say,
      sound,
      solved: (info) => applySolved(info),
      elevator: {
        go: (rec, i) => {
          const r = elev.go(rec, i);
          if (r.message) say(r.message);
          if (r.ok) elev.dismiss(rec); // kat seçildi: varışta panel yeniden KENDİLİĞİNDEN açılmaz (platformdan inip tekrar binene dek)
          return r;
        },
        halt: (rec) => {
          const r = elev.halt(rec);
          if (r.message) say(r.message);
          return r;
        },
        view: (rec) => elev.view(rec),
      },
    });
  }

  function buildRuntime() {
    streetDoors = createStreetDoors({
      seed: citySeed,
      world: () => (isCity() ? worldOf(G) : null),
      body: () => G.body,
      accessibility,
    });
    interiorDoors = createInteriorDoors({
      seed: citySeed,
      props: () => (isCity() ? G.props : null),
      body: () => G.body,
      book: st.book,
      accessibility,
      sound: (n, x, y, z) => soundAt(n, x, y, z, { vol: 0.7 }),
      hint: hintOnly,
      now: nowSec,
    });
    elev = createElevators({
      seed: citySeed,
      world: () => (isCity() ? worldOf(G) : null),
      props: () => (isCity() ? G.props : null),
      body: () => G.body,
      store: storeNow,
      say,
      sound: (n, x, y, z, o) => soundAt(n, x, y, z, o),
      accessibility,
      now: nowSec,
      root: () => G.entityRoot || null,
      THREE: () => G.THREE || null,
      openPanel: openElevatorPanel,
    });
  }

  /* ------------------------------------------------------------------------------------------ soğuma göstergesi (düzenek propları) */
  function tickPads() {
    if (st.pads.size === 0) return;
    const pw = G.props;
    const gone = [];
    st.pads.forEach((until, id) => {
      if (st.book.now >= until) {
        if (pw && pw.has(id) && pw.state(id) === COOL_STATE) pw.setState(id, 0);
        gone.push(id);
      }
    });
    for (let i = 0; i < gone.length; i++) st.pads.delete(gone[i]);
  }

  function cleanup() {
    if (panels && panels.isOpen()) closePanel();
    if (elev) elev.reset();
    if (interiorDoors) interiorDoors.reset();
    if (streetDoors) streetDoors.reset();
    st.pads.clear();
    st.book.resetTransient();
    st.seed = null;
    st.store = null;
  }

  /* ------------------------------------------------------------------------------------------ sistem */
  return {
    name: 'cityLocks',
    order: CITY_LOCKS_ORDER,
    state: st,

    init() {
      registerDimBound('neon', CARD_KEYS);
      setLockBridge({ isOpen: (id) => st.book.isOpenById(id) });
      buildPanels();
      buildRuntime();
    },

    beforeDimension() {
      if (elev) elev.reset();
      if (panels && panels.isOpen()) closePanel();
    },

    onDimension() {
      cleanup();
    },

    fixedUpdate(_G, dt) {
      if (!isCity()) {
        if (st.wasCity) {
          cleanup();
          st.wasCity = false;
        }
        return;
      }
      st.wasCity = true;
      syncBook();
      st.book.tick(dt);
      if (G.player && G.player.dead && panels.isOpen()) closePanel();
      streetDoors.tick(dt);
      interiorDoors.tick(dt);
      elev.tick(dt);
      if (panels.isOpen()) {
        if (panels.tick(dt)) closeUi();
        else if (G.ui === 'none') panels.close(); // arayüz başka yolla kapandı
      }
      tickPads();
    },

    frameUpdate(_G, _dt, alpha) {
      if (elev && st.wasCity) elev.frame(alpha === undefined ? 1 : alpha);
    },

    onEvent(_G, e) {
      if (!e || typeof e.type !== 'string') return;
      if (e.type === 'propUsed') onPropUsed(e);
      else if (e.type === 'propLock') onPropLock(e);
      else if (e.type === 'uiChanged') {
        if (e.ui === 'none' && panels && panels.isOpen()) {
          const cur = panels.current();
          if (cur && cur.type === 'asansor' && cur.rec && cur.status !== 'cozuldu') elev.dismiss(cur.rec);
          panels.close();
          st.uiOwned = false;
        } else if (e.ui !== LOCK_UI) st.uiOwned = false;
      } else if (e.type === 'death' && panels && panels.isOpen()) closePanel();
    },

    api() {
      return {
        getLockPanel: () => (panels ? panels.snapshot() : null),
        lockInput(act) {
          if (!panels || !panels.isOpen()) return { ok: false, result: 'panel-yok' };
          const cur = panels.current();
          const door = cur && cur.door ? cur.door : null;
          const r = panels.input(act);
          if (act && act.op === 'close') {
            if (cur && cur.type === 'asansor' && cur.rec) elev.dismiss(cur.rec);
            closeUi();
          } else if (door && r && r.result === 'yanlis') setPadStates(door, COOL_STATE);
          else if (door && cur.type === 'hack' && cur.phase === 'lost') setPadStates(door, COOL_STATE);
          if (!panels.isOpen()) closeUi();
          return r;
        },
        closeLockPanel() {
          closePanel();
          return true;
        },
        getLocksInfo() {
          return {
            city: isCity(),
            solved: solvedNow(), // kayıttaki çözülmüş kilitler (yüklemeden sonra da doğru; solvedCount yalnız oturum sayacıdır)
            opened: st.events.opened,
            cards: st.events.cards,
            panel: panels && panels.isOpen() ? panels.type() : null,
            streetOpen: streetDoors ? streetDoors.openCount() : 0,
            interiorDoors: interiorDoors ? interiorDoors.stats() : null,
            elevators: elev ? elev.stats() : null,
          };
        },
        /** QA / hata ayıklama: oyuncunun içinde olduğu binanın kilitleri (kodlar dahil) ve etkin asansörler. */
        getLocksDebug() {
          const b = G.body;
          const out = { locks: [], elevators: [] };
          if (!b || !isCity()) return out;
          const seed = citySeed();
          const pw = G.props;
          if (pw) {
            const cx = Math.floor(b.x / 16);
            const cz = Math.floor(b.z / 16);
            const seen = {};
            for (let dx = -1; dx <= 1; dx++) {
              for (let dz = -1; dz <= 1; dz++) {
                pw.chunkProps(cx + dx, cz + dz).forEach((p) => {
                  const e = pw.entry(p.id);
                  if (!e || !e.def || e.def.tags.indexOf('door') < 0) return;
                  const info = doorOfProp(seed, p);
                  if (!info || !info.lock || seen[info.lock.id]) return;
                  seen[info.lock.id] = true;
                  const sp = st.book.specOf(info.lotId, info.lock);
                  out.locks.push({
                    id: info.lock.id,
                    kind: info.lock.kind,
                    tier: info.lock.tier,
                    lot: info.lotId,
                    solved: st.book.isSolved(info.lotId, info.lock),
                    code: sp.code,
                    game: sp.game,
                    card: sp.card,
                    hack: info.lock.kind === 'mini_hack' ? st.book.hackParams(info.lotId, info.lock) : null,
                    door: { x: info.door.x, y: info.door.y, z: info.door.z },
                  });
                });
              }
            }
          }
          if (elev) {
            elev.active().forEach((r) => out.elevators.push({
              id: r.el.id, cx: r.el.cx, cz: r.el.cz, y: r.sim.y, phase: r.sim.phase, at: r.sim.at, stops: r.el.stops.map((s) => s.y), face: r.el.face,
            }));
          }
          return out;
        },
      };
    },

    serialize() {
      if (elev) elev.saveAll(); // yoldaki kabin konumu kayda yazılır (boyut yöneticisi blobu bu haritayı okur)
      if (G.dimMgr) return null;
      return { v: 1, locks: Object.assign({}, st.fallbackStore) };
    },

    restore(_G, data) {
      if (!data || typeof data !== 'object' || !data.locks || typeof data.locks !== 'object') return;
      const ks = Object.keys(data.locks);
      for (let i = 0; i < ks.length && i < 4096; i++) {
        const k = ks[i];
        if (/^[0-9a-z]{1,10}$/.test(k) && k !== '__proto__') st.fallbackStore[k] = data.locks[k];
      }
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        if (panels && panels.isOpen()) closePanel();
        if (elev) elev.reset();
        if (streetDoors) streetDoors.closeAll();
      } catch { /* dünya zaten yok */ }
      setLockBridge(null);
    },
  };
}

export default createSystem;
