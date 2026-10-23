/*
 * KEŞİF content sistemi — ANAHTAR KRİSTALİ, MÜHÜR SUNAĞI ve geçit.
 *
 * Akış (macera):
 *   1) Anahtar Tapınağı sunağında (def.altar = B.ALTAR, def.crystal = kristal kaya hücresi): tapınağın TÜM bulmaca odaları çözülmüşse
 *      sunağa sağ tık (ya da kristal kayayı kır) → 'item:anahtar_kristali_z<bölge>' verilir, kristal kaya kalkar, 'crystalCollected' {zone,id}.
 *      Kristal eşyasını kaybetmiş (ölüm) oyuncu sunağa yeniden sağ tıklayıp bir tane daha alır (kilitlenme yok).
 *   2) Mühür Kulesi'nde (def.seal): sunağa ya da kristal yuvası kaidelerine sağ tık → eldeki bölge kristali bir yuvaya konur
 *      (yuva bloğu parlayan "Etkin Kristal Alıcı"), 'crystalPlaced' {zone,id:'<yapı>#s<k>'}.
 *   3) Son kristal: progression 'sealComplete' → kule geçidi (def.seal.gate.cells, SEAL_BARRIER) ~3 sn gürleyerek açılır
 *      (yukarıdan aşağı, toz + ses); bölge halkası (world.unlockZone) animasyonla eş zamanlı açılır; 'zoneUnlocked' başlığı.
 *   Kayıttan yükleme: yapı kaydedilince yerleşmiş yuvalar ve açık geçit durumu ilerlemeden yeniden kurulur.
 *
 *   initSeal(S)  fixedSeal(S, dt)  onSealEvent(S, evt)  disposeSeal(S)  sealStatus(S, zone)
 */
import { B } from '../sim/blocks.js';
import { ITEMS } from '../sim/items.js';
import { ZONES } from '../sim/constants.js';
import { structureSolved } from './contentPuzzles.js';
import { setBlockSafe, startOpenAnim } from './contentAnim.js';
import { itemName, zoneCrystalKey } from './contentHelpers.js';
import { directionText } from './contentGuide.js';
import { emit } from './contentState.js';

const UNLOCK_DELAY = 2.8;

function k3(o) {
  return o.x + ',' + o.y + ',' + o.z;
}

export function sealStatus(S, zone) {
  const z = S.sealZones.get(zone);
  const p = S.G.progression;
  if (!z || !p) return null;
  return { zone, placed: p.placed[zone].length, required: z.def.required, done: !!p.seals[zone], gateOpen: z.gateOpen };
}

export function initSeal(S) {
  const G = S.G;
  S.useInterest[B.ALTAR] = true;
  S.useInterest[B.PORTAL_FRAME] = true;
  S.useInterest[B.RECEIVER_ON] = true;
  S.useInterest[B.CRYSTAL_ROCK] = true;
  S.useInterest[B.SIGN] = true;
  S.useInterest[B.LEVER] = true;
  S.useInterest[B.LEVER_ON] = true;
  S.delayUnlockZone = null;
  S.delayUnlockTick = 0;
  S.useHandlers.push(useSeal, useTempleAltar, useSign);
  S.hooks.add.push(onAdd);
  S.hooks.remove.push(onRemove);
  // halka açılışı animasyonla eş zamanlı (progression çıktısı world.unlockZone'u hemen çağırır)
  const world = G.world;
  if (world && typeof world.unlockZone === 'function' && G.mode === 'macera') {
    S._origUnlock = world.unlockZone;
    world.unlockZone = function unlockZoneDelayed(i) {
      for (let n = 0; n < S.pendingUnlocks.length; n++) if (S.pendingUnlocks[n].zone === i) return 0;
      if (S.delayUnlockZone !== null && G.time.tick <= S.delayUnlockTick && i === S.delayUnlockZone + 1) {
        S.pendingUnlocks.push({ zone: i, at: G.time.seconds + UNLOCK_DELAY });
        S.delayUnlockZone = null;
        return 0;
      }
      return S._origUnlock.call(world, i);
    };
  }
}

export function disposeSeal(S) {
  const world = S.G.world;
  while (S.pendingUnlocks.length > 0) {
    const u = S.pendingUnlocks.pop();
    if (S._origUnlock) S._origUnlock.call(world, u.zone);
  }
  if (world && S._origUnlock) world.unlockZone = S._origUnlock;
  S._origUnlock = null;
}

/* ---------------------------------------------------------------------------------------------
 * Yapı kaydı
 * ------------------------------------------------------------------------------------------- */
function onAdd(S, rec) {
  const G = S.G;
  const p = G.progression;
  const def = rec.def;
  if (def.type === 'anahtartapinagi' && def.altar) {
    S.altars.set(k3(def.altar), { kind: 'temple', rec });
    if (def.crystal) S.crystalAt.set(k3(def.crystal), rec);
    if (p && def.crystal && p.crystals[def.zone] && p.crystals[def.zone].indexOf(def.id) >= 0) {
      // alınmış kristalin kayası kalkmış olmalı (düzenleme kaydı kaybolmuş olsa da)
      const cur = G.world.getBlock(def.crystal.x, def.crystal.y, def.crystal.z);
      if (cur === B.CRYSTAL_ROCK) setBlockSafe(G, def.crystal.x, def.crystal.y, def.crystal.z, 0);
    }
  }
  if (def.seal) {
    const seal = def.seal;
    const sockets = seal.sockets.map((s, i) => ({ x: s.x, y: s.y, z: s.z, base: s.base, id: def.id + '#s' + i }));
    const entry = {
      rec, def: seal, sockets, gateOpen: false,
    };
    S.sealZones.set(seal.zone, entry);
    S.altars.set(k3(seal.altar), { kind: 'seal', rec, entry });
    for (let i = 0; i < sockets.length; i++) {
      S.altars.set(k3(sockets[i].base), { kind: 'seal', rec, entry, socket: i });
      S.altars.set(k3(sockets[i]), { kind: 'seal', rec, entry, socket: i });
    }
    S.altars.set(k3(seal.lever), { kind: 'lever', rec, entry });
    restoreSeal(S, entry);
  }
}

function onRemove(S, rec) {
  const def = rec.def;
  if (def.altar) S.altars.delete(k3(def.altar));
  if (def.crystal) S.crystalAt.delete(k3(def.crystal));
  if (def.seal) {
    const e = S.sealZones.get(def.seal.zone);
    if (e && e.rec === rec) S.sealZones.delete(def.seal.zone);
    S.altars.delete(k3(def.seal.altar));
    S.altars.delete(k3(def.seal.lever));
    def.seal.sockets.forEach((s) => {
      S.altars.delete(k3(s.base));
      S.altars.delete(k3(s));
    });
  }
}

/** İlerlemeden yuva bloklarını ve açık geçidi yeniden kurar (idempotent; animasyonsuz). */
function restoreSeal(S, entry) {
  const G = S.G;
  const p = G.progression;
  if (!p) return;
  const zone = entry.def.zone;
  const placed = p.placed[zone] || [];
  for (let i = 0; i < entry.sockets.length; i++) {
    const s = entry.sockets[i];
    if (placed.indexOf(s.id) >= 0 || p.seals[zone] === true) setBlockSafe(G, s.x, s.y, s.z, B.RECEIVER_ON);
  }
  if (p.seals[zone] === true) {
    openGate(S, entry, true);
  }
}

function openGate(S, entry, instant) {
  if (entry.gateOpen && !instant) return;
  const cells = entry.def.gate.cells;
  entry.gateOpen = true;
  if (instant) {
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const cur = S.G.world.getBlock(c.x, c.y, c.z);
      if (cur === null) S.G.world.applyEdits([[c.x, c.y, c.z, 0]]);
      else if (cur === entry.def.gate.id) S.G.world.setBlock(c.x, c.y, c.z, 0);
    }
    return;
  }
  startOpenAnim(S, cells, { expect: entry.def.gate.id, seconds: 3.2, sound: 'door', pitch: 0.5 });
}

/* ---------------------------------------------------------------------------------------------
 * Kullan: kristal yuvaları / sunak / kol
 * ------------------------------------------------------------------------------------------- */
function useSeal(S, x, y, z) {
  const hit = S.altars.get(x + ',' + y + ',' + z);
  if (!hit || (hit.kind !== 'seal' && hit.kind !== 'lever')) return false;
  const G = S.G;
  const p = G.progression;
  const entry = hit.entry;
  const zone = entry.def.zone;
  if (!p || !p.active) return false;
  if (hit.kind === 'lever') {
    if (p.seals[zone]) {
      S.fx.message(ZONES[zone].name + ' mührü zaten açık.');
      if (!entry.gateOpen) openGate(S, entry, false);
    } else {
      S.fx.message('Kol çekilmiyor: önce kristalleri sunağa yerleştir (' + p.placed[zone].length + '/' + entry.def.required + ').');
      S.fx.sound('puzzle_wrong', x + 0.5, y + 0.5, z + 0.5);
    }
    return true;
  }
  return placeCrystal(S, entry, hit.socket === undefined ? -1 : hit.socket);
}

export function placeCrystal(S, entry, want) {
  const G = S.G;
  const p = G.progression;
  const zone = entry.def.zone;
  const need = entry.def.required;
  const placedIds = p.placed[zone];
  if (p.seals[zone]) {
    S.fx.message(ZONES[zone].name + ' mührü zaten açıldı.');
    return true;
  }
  const item = zoneCrystalKey(zone);
  const have = G.inventory ? G.inventory.count(item) : 0;
  const al = entry.def.altar;
  if (have < 1) {
    const col = p.crystals[zone].length;
    let msg = 'Mühür Sunağı: ' + placedIds.length + '/' + need + ' kristal yerleşti.';
    if (col < need) msg += ' ' + (need - col) + ' Anahtar Kristali daha topla: ' + (directionText(S, 'anahtartapinagi', zone, p.crystals[zone]) || 'bölgedeki tapınaklara bak') + '.';
    else msg += ' Elinde ' + itemName(item) + ' yok; sunağa dönüp kristali yeniden alabilirsin.';
    S.fx.message(msg);
    S.fx.sound('puzzle_wrong', al.x + 0.5, al.y + 0.5, al.z + 0.5);
    return true;
  }
  // hedef yuva: istenen boşsa o, değilse ilk boş
  let k = -1;
  if (want >= 0 && placedIds.indexOf(entry.sockets[want].id) < 0) k = want;
  for (let i = 0; i < entry.sockets.length && k < 0; i++) if (placedIds.indexOf(entry.sockets[i].id) < 0) k = i;
  if (k < 0) {
    S.fx.message('Tüm yuvalar dolu.');
    return true;
  }
  if (!G.inventory.remove(item, 1)) return true;
  const s = entry.sockets[k];
  setBlockSafe(G, s.x, s.y, s.z, B.RECEIVER_ON);
  S.fx.particles('magicBurst', s.x + 0.5, s.y + 0.8, s.z + 0.5, 0x7fe8ff, { radius: 1.6, scale: 1 });
  S.fx.sound('craft', s.x + 0.5, s.y + 0.5, s.z + 0.5, 1.2);
  G.haptic('medium');
  const completes = placedIds.length + 1 >= need;
  if (completes) {
    // progression çıktısı iç içe yayımda SONRA (kuyruktan) uygulanır → bayrak birkaç saniye geçerli kalır
    S.delayUnlockZone = zone;
    S.delayUnlockTick = G.time.tick + 240;
  }
  emit(S, { type: 'crystalPlaced', zone, id: s.id });
  return true;
}

/* ---------------------------------------------------------------------------------------------
 * Tapınak sunağı: Anahtar Kristali
 * ------------------------------------------------------------------------------------------- */
function useTempleAltar(S, x, y, z, id) {
  let rec = null;
  const a = S.altars.get(x + ',' + y + ',' + z);
  if (a && a.kind === 'temple') rec = a.rec;
  else if (id === B.CRYSTAL_ROCK) rec = S.crystalAt.get(x + ',' + y + ',' + z) || null;
  if (!rec) return false;
  const p = S.G.progression;
  if (!p || !p.active) return false;
  takeCrystal(S, rec);
  return true;
}

/** Tapınağın kristalini oyuncuya verir (bulmacalar çözülmüşse). Döner: verildi mi. */
export function takeCrystal(S, rec) {
  const G = S.G;
  const p = G.progression;
  const def = rec.def;
  const zone = def.zone;
  const item = zoneCrystalKey(zone);
  const st = structureSolved(S, rec);
  const cpos = def.crystal || def.altar;
  const collected = p.crystals[zone].indexOf(def.id) >= 0;
  if (collected) {
    // kristal eşyası kaybolmuşsa (ölüm) yeniden ver: elde olması gereken = toplanan − yerleşen
    const owed = p.crystals[zone].length - p.placed[zone].length;
    const have = G.inventory ? G.inventory.count(item) : 0;
    if (!p.seals[zone] && have < owed) {
      giveCrystal(S, item, cpos);
      S.fx.message('Anahtar Kristali yeniden belirdi. Bu sefer Mühür Kulesi\'ne götür.');
      return true;
    }
    S.fx.message('Bu tapınağın Anahtar Kristali\'ni zaten aldın.');
    return false;
  }
  if (st.solved < st.total) {
    S.fx.message('Kristal henüz mühürlü: önce tüm bulmaca odalarını çöz (' + st.solved + '/' + st.total + ').');
    S.fx.sound('puzzle_wrong', cpos.x + 0.5, cpos.y + 0.5, cpos.z + 0.5);
    return false;
  }
  giveCrystal(S, item, cpos);
  if (def.crystal) {
    const cur = G.world.getBlock(def.crystal.x, def.crystal.y, def.crystal.z);
    if (cur === B.CRYSTAL_ROCK) setBlockSafe(G, def.crystal.x, def.crystal.y, def.crystal.z, 0);
  }
  S.fx.particles('magicBurst', cpos.x + 0.5, cpos.y + 1, cpos.z + 0.5, 0x7fe8ff, { radius: 2.4, scale: 1.4 });
  S.fx.particles('levelUp', cpos.x + 0.5, cpos.y + 0.6, cpos.z + 0.5, 0x7fe8ff);
  // mesaj ('Anahtar Kristali alındı (n/N)') progression'ın türettiği 'crystal' olayında gösterilir (sayaç doğru olsun)
  emit(S, { type: 'crystalCollected', zone, id: def.id });
  return true;
}

function giveCrystal(S, item, pos) {
  const G = S.G;
  if (!ITEMS[item]) return;
  const left = G.inventory.add(item, 1);
  if (left > 0 && G.em && typeof G.em.spawnItem === 'function') G.em.spawnItem(item, left, G.body.x, G.body.y + 0.6, G.body.z);
  S.fx.sound('achievement', pos.x + 0.5, pos.y + 0.5, pos.z + 0.5);
  G.haptic('success');
}

/** blockBroken olayı: kristal kayası kırıldıysa kristal ver / geri koy. */
export function onBlockBroken(S, evt) {
  const G = S.G;
  S.lastBroken.x = evt.x;
  S.lastBroken.y = evt.y;
  S.lastBroken.z = evt.z;
  S.lastBroken.tick = G.time.tick;
  const rec = S.crystalAt.get(evt.x + ',' + evt.y + ',' + evt.z);
  if (!rec || evt.id !== B.CRYSTAL_ROCK || G.mode !== 'macera') return;
  const p = G.progression;
  if (p.crystals[rec.def.zone].indexOf(rec.def.id) >= 0) return;
  const st = structureSolved(S, rec);
  if (st.solved < st.total) {
    setBlockSafe(G, evt.x, evt.y, evt.z, B.CRYSTAL_ROCK);
    S.fx.message('Kristal henüz mühürlü: önce tüm bulmaca odalarını çöz (' + st.solved + '/' + st.total + ').');
    return;
  }
  takeCrystal(S, rec);
}

/* ---------------------------------------------------------------------------------------------
 * Tabela
 * ------------------------------------------------------------------------------------------- */
function useSign(S, x, y, z, id) {
  if (id !== B.SIGN) return false;
  const sg = S.G.structureSigns.get(x + ',' + y + ',' + z);
  if (!sg) return false;
  S.fx.sound('ui_click', x + 0.5, y + 0.5, z + 0.5);
  S.fx.message(sg.text, { speak: true });
  return true;
}

/* ---------------------------------------------------------------------------------------------
 * Olaylar + zaman
 * ------------------------------------------------------------------------------------------- */
export function onSealEvent(S, evt) {
  const G = S.G;
  if (evt.type === 'sealProgress') {
    const e = S.sealZones.get(evt.zone);
    const pos = e ? e.def.altar : G.body;
    S.fx.sound('quest', pos.x + 0.5, pos.y + 0.5, pos.z + 0.5, 1.15);
    S.fx.message('Mühür: ' + evt.placed + '/' + evt.required + ' kristal yerleşti.' + (evt.placed < evt.required ? ' ' + (evt.required - evt.placed) + ' kristal daha gerek.' : ''));
  } else if (evt.type === 'sealComplete') {
    const e = S.sealZones.get(evt.zone);
    S.fx.message(ZONES[evt.zone].name + ' mührü açıldı!' + (evt.unlocks !== null && evt.unlocks !== undefined ? ' Kule geçidi gürleyerek açılıyor.' : ''), { speak: true });
    S.fx.sound('zone_unlock', G.body.x, G.body.y + 1, G.body.z);
    G.haptic('heavy');
    if (e) openGate(S, e, false);
    S.version++;
  } else if (evt.type === 'crystal') {
    const p = G.progression;
    const n = evt.count;
    const req = evt.required;
    const dir = n >= req ? directionText(S, 'muhursunagi', evt.zone, null) : directionText(S, 'anahtartapinagi', evt.zone, p.crystals[evt.zone]);
    S.fx.message('Anahtar Kristali alındı! (' + n + '/' + req + ') ' + (n >= req
      ? 'Hepsi tamam: Mühür Kulesi' + (dir ? ' — ' + dir : '') + '.'
      : 'Sıradaki tapınak' + (dir ? ': ' + dir : '') + '.'));
    S.version++;
  } else if (evt.type === 'zoneUnlocked') {
    S.fx.banner(ZONES[evt.zone].name + ' açıldı!', 'Mühür kırıldı — yeni bölge seni bekliyor', 5200, true);
    S.version++;
  }
}

export function fixedSeal(S) {
  if (S.pendingUnlocks.length === 0) return;
  const now = S.G.time.seconds;
  for (let i = S.pendingUnlocks.length - 1; i >= 0; i--) {
    const u = S.pendingUnlocks[i];
    if (now >= u.at) {
      S.pendingUnlocks.splice(i, 1);
      if (S._origUnlock) S._origUnlock.call(S.G.world, u.zone);
      S.fx.sound('zone_unlock', S.G.body.x, S.G.body.y + 1, S.G.body.z, 0.8);
    }
  }
}

