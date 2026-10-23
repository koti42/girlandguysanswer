/*
 * KEŞİF sim — TEKNOLOJİ: TechState (makine kayıt defteri, enerji ağı zamanlaması, portallar, kayıt). Saf; DOM/three yok.
 *
 *   const tech = new TechState({seed})
 *   tech.tick(dt, ctx) → events[]         (ctx: bkz. aşağıdaki "tick bağlamı"; events paylaşılan dizidir, hemen oku)
 *   tech.onBlockChange(evt | x,y,z,oldId,newId) → {items:[{item,count}], lost:[…]}   dünya blok olayı kancası
 *   tech.onBlockPlaced / onBlockRemoved
 *   tech.machineInfo(x,y,z) → {ok, type, …}      tech.setMachineConfig(x,y,z,cfg) → {ok, reason?, message?}
 *   tech.use…/insert…/take…        etkileşimler (jeneratör yakıtı, ocak, düğme, ışınlanma, asansör, şarj)
 *   tech.shootPortal / travelPortal / pruneBrokenPortals / portalInfo
 *   tech.serialize() / tech.restore(raw, {minY,maxY})
 *
 * Zamanlama: tick(dt) her çağrıda anahtarları (düğme/sensör) ve topoloji değişimini işler (anında yeniden kurma + "kuru"
 * değerlendirme → lamba/kapı gibi bayraklar gecikmez); enerji dengesi ve makine ilerlemesi 1 Hz adımlarla (en çok 5 adım/çağrı)
 * yürür. Sim saati `tech.time`dır (Date.now yok). Yüklü olmayan chunk'taki makineler (getBlock null) uykudadır: durumu korunur,
 * ilerlemez ve ağa katılmaz.
 *
 * tick bağlamı (ctx): {
 *   world {getBlock, setBlock, ensureSectionsNear?, yMin?, yMax?}  (zorunlu),
 *   daylight 0..1, weather 'clear'|'rain'|'storm', player {x,y,z}, inventory (Şarj İstasyonu için), chestAt?(x,y,z)→slots[],
 *   drop?({item,count,x,y,z}), isOccupied?(x,y,z)→bool, skyOpen?(x,y,z)→bool, ensure?(x,y,z)
 * }
 * Olaylar: machineTick{dt,machines,networks,generated,consumed,stored,capacity,drilled,smelted} · poweredChanged{x,y,z,machine,on,powered}
 *   drilled{…} · drillStopped{x,y,z,reason,mined} · smelted{x,y,z,item,count} · machineLost{x,y,z,machine,items} · networkOverflow{count}
 *   portalClosed{color}   (ışınlanma/asansör sonuçlarındaki event: teleported{…}, lifted{…}; portal: portalPlaced, portalUsed)
 */
import { BLOCKS } from './blocks.js';
import { worldMaxY, worldMinY } from './constants.js';
import {
  TECH_RATES, isTechBlockId, machineTypeOfBlock, techBaseId, techBlockDef,
} from './techData.js';
import { buildNetworks, compareKeys, parseKey, pickGeneratorsToStart, posKey, solveNetwork } from './techPower.js';
import {
  TYPE_BASE, canStartBurn, controlSwitch, createMachine, drillTakeBuffer, furnaceInsert,
  furnaceTake, furnaceTakeInput, generationRate, insertFuel, isMachineType, isPartialLoad, loadDemand, machinePrio, machineRole,
  pressButton, sanitizeMachine, startBurn, stepMachine, takeFuel, visualBlockId, visualOn,
} from './techMachines.js';
import { chargeInventory } from './techCharge.js';
import {
  PORTAL_COOLDOWN, PORTAL_MIN_GAP, COLORS, placeOpenPortal, portalCellAt, portalEntry, portalFrame, pruneBrokenPortals, restorePortals,
  serializePortals, travelThrough,
} from './techPortal.js';
import { itemByKey } from './items.js';
import { machineInfo, setMachineConfig } from './techInfo.js';

const R = TECH_RATES;
const MAX_MACHINES = 4000;

function r2(v) {
  return Math.round(v * 100) / 100;
}
function bad(reason, message) {
  return { ok: false, reason, message };
}

export class TechState {
  constructor(opts) {
    const o = opts || {};
    this.seed = (o.seed | 0) >>> 0;
    /** Kayıtlı makineler: "x,y,z" → durum. Kablolar kayıtsızdır (dünyadaki bloktan okunur). */
    this.machines = new Map();
    /** Açık dünya portalları (mavi/turuncu). */
    this.portals = { mavi: null, turuncu: null };
    this.portalCd = 0;
    this.portalCdTo = null; // bekleme YALNIZ çıkış portalına uygulanır (zemin–tavan döngüsü < 1 sn'lik düşüşte kopmasın)
    this.time = 0;
    this.acc = 0;
    this.networks = [];
    this.nodeNet = new Map();
    this.netInfo = [];
    this.overflow = 0;
    this.dirty = true;
    this.events = [];
    this.scanner = { t: 0, pings: [], at: 0 };
    this._powered = new Map();
    this._share = new Map();
    this._on = new Map();
    this._stats = { drilled: 0, smelted: 0 };
    this._mctx = null;
  }

  /* ---------------------------------------------------------------------------------------------
   * Kayıt defteri / blok kancaları
   * ------------------------------------------------------------------------------------------- */
  has(x, y, z) {
    return this.machines.has(posKey(x, y, z));
  }
  get(x, y, z) {
    return this.machines.get(posKey(x, y, z)) || null;
  }
  count() {
    return this.machines.size;
  }
  _ensureAt(key, id) {
    let m = this.machines.get(key);
    if (m) return m;
    const type = machineTypeOfBlock(id);
    if (!type || !isMachineType(type) || this.machines.size >= MAX_MACHINES) return null;
    m = createMachine(type, id);
    this.machines.set(key, m);
    return m;
  }
  /** Makine bloğu yerleştirildi → kayıt. */
  onBlockPlaced(x, y, z, id) {
    if (!isTechBlockId(id)) return null;
    this.dirty = true;
    return this._ensureAt(posKey(x, y, z), id);
  }
  /** Makine bloğu kırıldı → kayıttan çıkar, içeriği döndür ({items}). */
  onBlockRemoved(x, y, z, oldId) {
    const key = posKey(x, y, z);
    const out = { items: [], lost: [] };
    const m = this.machines.get(key);
    if (m && (!oldId || machineTypeOfBlock(oldId) === m.t)) {
      out.items = machineContents(m);
      out.lost.push({ key, machine: m.t });
      this.machines.delete(key);
      this._powered.delete(key);
      this._on.delete(key);
    }
    if (isTechBlockId(oldId)) this.dirty = true;
    return out;
  }
  /**
   * Dünya blok olayı: World 'blockChange' nesnesi {x,y,z,newId,oldId} ya da (x,y,z,oldId,newId). Aynı makinenin
   * durum varyantı değişimi (ETKİN↔pasif) yok sayılır. Döner {items, lost}: kırılan makinelerin içeriği (yere bırakılmalı).
   */
  onBlockChange(a, b, c, d, e) {
    let x;
    let y;
    let z;
    let oldId;
    let newId;
    if (a && typeof a === 'object') {
      x = a.x; y = a.y; z = a.z; oldId = a.oldId; newId = a.newId !== undefined ? a.newId : a.id;
    } else {
      x = a; y = b; z = c; oldId = d; newId = e;
    }
    const res = { items: [], lost: [] };
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return res;
    const tb = techBaseId(oldId);
    if (tb !== 0 && tb === techBaseId(newId)) return res;
    if (tb !== 0) {
      const r = this.onBlockRemoved(x, y, z, oldId);
      res.items = r.items;
      res.lost = r.lost;
    }
    if (isTechBlockId(newId)) this.onBlockPlaced(x, y, z, newId);
    // portal arka bloğu kırıldı mı?
    for (let i = 0; i < 2; i++) {
      const p = this.portals[COLORS[i]];
      if (!p) continue;
      for (let k = 0; k < 2; k++) {
        if (p.back[k].x === x && p.back[k].y === y && p.back[k].z === z) this.dirty = true;
      }
    }
    return res;
  }

  /** Makine içeriklerini toplayıp kaydı siler (örn. yıkım). */
  removeMachine(x, y, z) {
    return this.onBlockRemoved(x, y, z, 0);
  }

  /* ---------------------------------------------------------------------------------------------
   * Bağlam
   * ------------------------------------------------------------------------------------------- */
  _buildCtx(ctx) {
    const w = ctx.world;
    const m = this._mctx || (this._mctx = {});
    m.getBlock = (x, y, z) => w.getBlock(x, y, z);
    m.setBlock = (x, y, z, id) => w.setBlock(x, y, z, id);
    m.ensure = typeof ctx.ensure === 'function' ? ctx.ensure : (typeof w.ensureSectionsNear === 'function'
      ? (x, y, z) => w.ensureSectionsNear(x, y, z, 1, 2, 2) : undefined);
    m.chestAt = ctx.chestAt;
    m.drop = ctx.drop;
    m.isOccupied = ctx.isOccupied;
    m.canMine = ctx.canMine;
    m.skyOpen = ctx.skyOpen;
    m.player = ctx.player;
    m.inventory = ctx.inventory;
    m.daylight = ctx.daylight === undefined ? 1 : ctx.daylight;
    m.weather = ctx.weather || 'clear';
    m.minY = ctx.minY !== undefined ? ctx.minY : worldMinY(w);
    m.maxY = ctx.maxY !== undefined ? ctx.maxY : worldMaxY(w);
    m.seed = this.seed;
    m.events = this.events;
    m.stats = this._stats;
    return m;
  }

  /* ---------------------------------------------------------------------------------------------
   * Ağ kurma + değerlendirme
   * ------------------------------------------------------------------------------------------- */
  _conducts(id, machine, key) {
    const def = techBlockDef(id);
    if (!def || def.role === 'station') return false;
    if (def.role === 'wire') return true;
    const m = machine || this._ensureAt(key, id);
    if (!m) return false;
    if (def.role === 'switch') return !!m.on;
    return true;
  }

  _rebuild(mctx) {
    const res = buildNetworks({
      getBlock: mctx.getBlock,
      keys: Array.from(this.machines.keys()),
      machineAt: (k) => this.machines.get(k) || null,
      conducts: (id, m, k) => this._conducts(id, m, k),
      maxNodes: R.network.maxNodes,
    });
    this.networks = res.networks;
    this.nodeNet = res.nodeNet;
    if (res.overflow > 0 && res.overflow !== this.overflow) this.events.push({ type: 'networkOverflow', count: res.overflow });
    this.overflow = res.overflow;
  }

  _parts(net, mctx, dt) {
    const gens = [];
    const stores = [];
    const loads = [];
    let demand = 0;
    for (let i = 0; i < net.machines.length; i++) {
      const key = net.machines[i];
      const st = this.machines.get(key);
      if (!st) continue;
      const role = machineRole(st.t);
      if (role === 'gen') {
        gens.push({
          key,
          rate: generationRate(st.t, st, mctx, key),
          burning: st.t === 'gunes' ? true : !st.off && st.burnT > 1e-9,
          canStart: st.t === 'jenerator' && canStartBurn(st),
        });
      } else if (role === 'store') {
        stores.push({
          key, stored: st.stored, cap: R.battery.cap, io: R.battery.io,
        });
      } else if (role === 'load') {
        const d = loadDemand(st.t, st, dt);
        demand += d;
        loads.push({
          key, demand: d, prio: machinePrio(st.t), partial: isPartialLoad(st.t),
        });
      }
    }
    return {
      gens, stores, loads, demand,
    };
  }

  /**
   * Tüm ağları değerlendirir. commit=false ("kuru"): yalnız beslenme bayrakları/görsel durum; hiçbir enerji/ilerleme yazılmaz.
   * commit=true: jeneratör başlatma, enerji dağıtımı, makine adımı (dt sn).
   */
  _evaluate(mctx, dt, commit) {
    const step = commit ? dt : 1;
    const powered = this._powered;
    const shareMap = this._share;
    powered.clear();
    shareMap.clear();
    const info = [];
    let generated = 0;
    let consumed = 0;
    let stored = 0;
    let capacity = 0;
    for (let n = 0; n < this.networks.length; n++) {
      const net = this.networks[n];
      const parts = this._parts(net, mctx, step);
      if (commit) {
        let dischargeAvail = 0;
        parts.stores.forEach((s) => { dischargeAvail += Math.min(s.io, s.stored / step); });
        const starts = pickGeneratorsToStart(parts.gens, parts.demand - dischargeAvail, 0);
        if (starts.length > 0) {
          starts.forEach((k) => startBurn(this.machines.get(k)));
          const again = this._parts(net, mctx, step);
          parts.gens = again.gens;
        }
      }
      const res = solveNetwork(parts, step);
      let stor = 0;
      let cap = 0;
      parts.stores.forEach((s) => {
        stor += s.stored;
        cap += s.cap;
      });
      res.powered.forEach((v, k) => powered.set(k, v));
      res.share.forEach((v, k) => shareMap.set(k, v));
      if (commit) {
        res.storeDelta.forEach((delta, k) => {
          const m = this.machines.get(k);
          if (m) m.stored = Math.max(0, Math.min(R.battery.cap, Math.round((m.stored + delta) * 1000) / 1000));
        });
        generated += res.fromGen * step + res.toStore * step + res.wasted * step;
        consumed += res.supplied * step;
      }
      info.push({
        id: n,
        nodes: net.count,
        machines: net.machines.length,
        overflow: net.overflow,
        gen: res.gen,
        demand: res.demand,
        supplied: res.supplied,
        stored: Math.round(stor),
        cap,
        live: res.live,
        // yakıtlı ama henüz yanmayan jeneratör var (talep gelince yakar): panel/HUD "kaynak yok" demesin
        standby: !res.live && parts.gens.some((g) => !g.burning && g.canStart),
        wasted: res.wasted,
      });
      stored += stor;
      capacity += cap;
    }
    this.netInfo = info;
    // beslenmeyen/ağsız makineler
    const keys = Array.from(this.machines.keys()).sort(compareKeys);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const st = this.machines.get(key);
      if (!st) continue; // bu adımda başka bir makine tarafından kırıldı (matkap → blockChange → onBlockChange)
      if (!powered.has(key)) powered.set(key, false);
      const p = parseKey(key);
      const id = mctx.getBlock(p[0], p[1], p[2]);
      if (id === null || id === undefined) continue; // uyku
      if (commit) {
        stepMachine(st.t, st, key, shareMap.get(key) || 0, dt, mctx);
      } else if (st.t === 'lamba' || st.t === 'kapi') {
        stepMachine(st.t, st, key, shareMap.get(key) || 0, 0, mctx);
      }
    }
    if (commit) this._chargerStep(mctx, dt);
    this._applyVisuals(mctx);
    return {
      generated, consumed, stored, capacity,
    };
  }

  /** Şarj İstasyonu: yakınındaki oyuncunun envanterini tamponundan doldurur. */
  _chargerStep(mctx, dt) {
    const inv = mctx.inventory;
    const pl = mctx.player;
    this.machines.forEach((st, key) => {
      if (st.t !== 'sarj') return;
      st.on = false;
      if (!inv || !pl || st.buf <= 0) return;
      const p = parseKey(key);
      const dx = pl.x - (p[0] + 0.5);
      const dy = pl.y + 0.9 - (p[1] + 0.5);
      const dz = pl.z - (p[2] + 0.5);
      if (dx * dx + dy * dy + dz * dz > R.charger.range * R.charger.range) return;
      const used = chargeInventory(inv, Math.min(st.buf, R.charger.outRate * dt));
      if (used > 0) {
        st.buf = Math.max(0, Math.round((st.buf - used) * 1000) / 1000);
        st.on = true;
      }
    });
  }

  /** Görsel durum: ETKİN/pasif blok kimliği değişimleri ve 'poweredChanged' olayları. */
  _applyVisuals(mctx) {
    const on = this._on;
    this.machines.forEach((st, key) => {
      const p = parseKey(key);
      const id = mctx.getBlock(p[0], p[1], p[2]);
      if (id === null || id === undefined) return;
      const flag = visualOn(st.t, st);
      const want = visualBlockId(st.t, flag);
      if (id !== want && techBaseId(id) === TYPE_BASE[st.t]) mctx.setBlock(p[0], p[1], p[2], want);
      const prev = on.get(key);
      if (prev === undefined) {
        on.set(key, flag);
      } else if (prev !== flag) {
        on.set(key, flag);
        this.events.push({
          type: 'poweredChanged', x: p[0], y: p[1], z: p[2], machine: st.t, on: flag, powered: !!this._powered.get(key),
        });
      }
    });
  }

  /** Blok kimliği makineyle uyuşmayan makineleri (blok kırıldı/değişti) siler; içeriğini olay olarak bildirir. */
  _validate(mctx) {
    const lost = [];
    this.machines.forEach((st, key) => {
      const p = parseKey(key);
      if (!p) {
        lost.push(key);
        return;
      }
      const id = mctx.getBlock(p[0], p[1], p[2]);
      if (id === null || id === undefined) return;
      if (machineTypeOfBlock(id) !== st.t) lost.push(key);
    });
    for (let i = 0; i < lost.length; i++) {
      const key = lost[i];
      const st = this.machines.get(key);
      const p = parseKey(key) || [0, 0, 0];
      this.events.push({
        type: 'machineLost', x: p[0], y: p[1], z: p[2], machine: st.t, items: machineContents(st),
      });
      this.machines.delete(key);
      this._on.delete(key);
      this.dirty = true;
    }
  }

  /**
   * Zamanı ilerletir. Döner: bu çağrıda oluşan olaylar (paylaşılan dizi; sonraki tick'te sıfırlanır).
   */
  tick(dt, ctx) {
    this.events.length = 0;
    const d = Math.max(0, Math.min(5, Number(dt) || 0));
    if (!ctx || !ctx.world) return this.events;
    const mctx = this._buildCtx(ctx);
    this.time += d;
    if (this.portalCd > 0) {
      this.portalCd = Math.max(0, this.portalCd - d);
      if (this.portalCd <= 0) this.portalCdTo = null;
    }
    // anahtarlar (düğme darbesi, sensör yakınlığı)
    this.machines.forEach((st, key) => {
      if (st.t !== 'dugme' && st.t !== 'sensor') return;
      const p = parseKey(key);
      const id = mctx.getBlock(p[0], p[1], p[2]);
      if (id === null || id === undefined) return;
      if (controlSwitch(st.t, st, key, d, mctx)) this.dirty = true;
    });
    if (this.dirty) {
      this._rebuild(mctx);
      this._evaluate(mctx, 1, false);
      this.dirty = false;
    }
    this.acc += d;
    let steps = 0;
    while (this.acc >= R.network.energyStep - 1e-9 && steps < R.network.maxStepsPerTick) {
      this.acc -= R.network.energyStep;
      steps++;
      this._energyStep(mctx, R.network.energyStep);
    }
    if (this.acc >= R.network.energyStep) this.acc = 0;
    return this.events;
  }

  _energyStep(mctx, dt) {
    this._stats.drilled = 0;
    this._stats.smelted = 0;
    this._validate(mctx);
    this._rebuild(mctx);
    const tot = this._evaluate(mctx, dt, true);
    this.dirty = false;
    if (this.machines.size === 0) return;
    this.events.push({
      type: 'machineTick',
      dt,
      machines: this.machines.size,
      networks: this.networks.length,
      generated: Math.round(tot.generated * 100) / 100,
      consumed: Math.round(tot.consumed * 100) / 100,
      stored: Math.round(tot.stored),
      capacity: tot.capacity,
      drilled: this._stats.drilled,
      smelted: this._stats.smelted,
    });
  }

  /* ---------------------------------------------------------------------------------------------
   * Bilgi / yapılandırma
   * ------------------------------------------------------------------------------------------- */
  /** Anahtarın ağ özeti (arayüz/HUD). */
  networkOf(x, y, z) {
    const idx = this.nodeNet.get(posKey(x, y, z));
    return idx === undefined ? null : this.netInfo[idx] || null;
  }

  /** Makine bilgisi (arayüz paneli): bkz. techInfo.js. Yoksa {ok:false}. */
  machineInfo(x, y, z) {
    return machineInfo(this, x, y, z);
  }

  /**
   * Yapılandırma: matkap {mode:'column'|'alan', restart:true} · ışınlanma {freq:'0123'|null} · sensör {radius:2..8} ·
   * düğme {mode:'toggle'|'pulse'}. Reddedilirse {ok:false, reason, message}. Bkz. techInfo.js.
   */
  setMachineConfig(x, y, z, cfg) {
    return setMachineConfig(this, x, y, z, cfg);
  }

  /* ---------------------------------------------------------------------------------------------
   * Etkileşimler
   * ------------------------------------------------------------------------------------------- */
  /** Jeneratöre yakıt koy → {ok, accepted}. */
  insertFuel(x, y, z, itemKey, count) {
    const st = this.get(x, y, z);
    if (!st || st.t !== 'jenerator') return bad('yok', 'Burada jeneratör yok.');
    const n = insertFuel(st, itemKey, count);
    if (n <= 0) return bad('yakit', 'Bu eşya yakıt değil ya da yığın dolu.');
    this.dirty = true;
    return { ok: true, accepted: n };
  }
  takeFuel(x, y, z) {
    const st = this.get(x, y, z);
    if (!st || st.t !== 'jenerator') return null;
    return takeFuel(st);
  }
  furnaceInsert(x, y, z, itemKey, count) {
    const st = this.get(x, y, z);
    if (!st || st.t !== 'ocak') return bad('yok', 'Burada elektrikli ocak yok.');
    const n = furnaceInsert(st, itemKey, count);
    if (n <= 0) return bad('girdi', 'Bu eşya ocakta işlenmez ya da yığın dolu.');
    this.dirty = true;
    return { ok: true, accepted: n };
  }
  furnaceTake(x, y, z) {
    const st = this.get(x, y, z);
    return st && st.t === 'ocak' ? furnaceTake(st) : null;
  }
  furnaceTakeInput(x, y, z) {
    const st = this.get(x, y, z);
    return st && st.t === 'ocak' ? furnaceTakeInput(st) : null;
  }
  drillTake(x, y, z) {
    const st = this.get(x, y, z);
    return st && st.t === 'matkap' ? drillTakeBuffer(st) : [];
  }
  /** Düğmeye bas → {ok, on}. */
  pressButton(x, y, z) {
    const st = this.get(x, y, z);
    if (!st || st.t !== 'dugme') return bad('yok', 'Burada düğme yok.');
    const on = pressButton(st);
    this.dirty = true;
    return { ok: true, on };
  }

  /** Pil Bankası / Şarj İstasyonundan envantere şarj aktarır (sağ tık). maxEU: tek seferde en çok. */
  dischargeInto(x, y, z, inventory, maxEU) {
    const st = this.get(x, y, z);
    if (!st || (st.t !== 'pil' && st.t !== 'sarj')) return bad('yok', 'Burada şarj kaynağı yok.');
    const avail = st.t === 'pil' ? st.stored : st.buf;
    const cap = maxEU > 0 ? maxEU : 400;
    const used = chargeInventory(inventory, Math.min(avail, cap));
    if (used <= 0) return bad(avail <= 0 ? 'bos' : 'dolu', avail <= 0 ? 'Kaynak boş.' : 'Eşyaların şarjı zaten dolu.');
    if (st.t === 'pil') st.stored = Math.max(0, Math.round((st.stored - used) * 1000) / 1000);
    else st.buf = Math.max(0, Math.round((st.buf - used) * 1000) / 1000);
    return { ok: true, used };
  }

  /* --- ışınlanma --- */
  _partnerOf(key, st) {
    let best = null;
    this.machines.forEach((m, k) => {
      if (k === key || m.t !== 'isinlayici' || !m.freq || m.freq !== st.freq) return;
      if (best === null || compareKeys(k, best.key) < 0) best = { key: k, st: m, p: parseKey(k) };
    });
    return best;
  }
  _teleportCost(a, b) {
    const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    return Math.min(R.teleporter.maxCost, Math.round(R.teleporter.baseCost + R.teleporter.perDistance * dist));
  }

  /**
   * (x,y,z)'deki platformdan ışınla. ctx: {world}. Başarıda {ok, to:{x,y,z (ayak: platform üstü)}, cost, distance, cooldown, event}.
   * Nedenler: yok · frekans · es_yok · bekleme{left} · enerji{need,have} · yuklenmedi · engelli
   */
  teleport(x, y, z, ctx) {
    const key = posKey(x, y, z);
    const st = this.machines.get(key);
    if (!st || st.t !== 'isinlayici') return bad('yok', 'Burada ışınlanma platformu yok.');
    if (!st.freq) return bad('frekans', 'Önce platformun frekansını ayarla.');
    const partner = this._partnerOf(key, st);
    if (!partner) return bad('es_yok', 'Aynı frekansta eş platform yok.');
    if (st.cd > 0) {
      return {
        ok: false, reason: 'bekleme', left: r2(st.cd), message: 'Platform soğuyor (' + Math.ceil(st.cd) + ' sn).',
      };
    }
    const cost = this._teleportCost([x, y, z], partner.p);
    if (st.buf < cost) {
      return {
        ok: false, reason: 'enerji', need: cost, have: Math.floor(st.buf), message: 'Yetersiz enerji: ' + cost + ' EU gerekli, ' + Math.floor(st.buf) + ' EU var.',
      };
    }
    const get = (a, b, c) => ctx.world.getBlock(a, b, c);
    const tid = get(partner.p[0], partner.p[1], partner.p[2]);
    if (tid === null || tid === undefined) return bad('yuklenmedi', 'Hedef platformun bulunduğu bölge henüz yüklenmedi.');
    if (machineTypeOfBlock(tid) !== 'isinlayici') {
      this.machines.delete(partner.key);
      this.dirty = true;
      return bad('es_yok', 'Eş platform artık yok.');
    }
    if (!clearAbove(get, partner.p)) return bad('engelli', 'Hedef platformun üstü kapalı.');
    st.buf = Math.round((st.buf - cost) * 1000) / 1000;
    st.cd = R.teleporter.cooldown;
    partner.st.cd = R.teleporter.cooldown;
    const dist = Math.hypot(x - partner.p[0], y - partner.p[1], z - partner.p[2]);
    const to = { x: partner.p[0] + 0.5, y: partner.p[1] + 0.5, z: partner.p[2] + 0.5 };
    return {
      ok: true,
      to,
      from: { x, y, z },
      cost,
      distance: Math.round(dist),
      cooldown: R.teleporter.cooldown,
      event: {
        type: 'teleported', x, y, z, tx: partner.p[0], ty: partner.p[1], tz: partner.p[2], cost, distance: Math.round(dist),
      },
    };
  }

  /** Hedef platform (aynı frekanstaki eş) bilgisi: yükleme isteği için. */
  teleportTargetOf(x, y, z) {
    const key = posKey(x, y, z);
    const st = this.machines.get(key);
    if (!st || st.t !== 'isinlayici' || !st.freq) return null;
    const p = this._partnerOf(key, st);
    return p ? { x: p.p[0], y: p.p[1], z: p.p[2] } : null;
  }

  /* --- asansör --- */
  _liftTarget(key, dir) {
    const p = parseKey(key);
    let best = null;
    this.machines.forEach((m, k) => {
      if (m.t !== 'asansor' || k === key) return;
      const q = parseKey(k);
      if (!q || q[0] !== p[0] || q[2] !== p[2]) return;
      const dy = (q[1] - p[1]) * dir;
      if (dy <= 0 || dy > R.lift.maxRange) return;
      if (best === null || dy < best.dy) best = { key: k, st: m, p: q, dy };
    });
    return best;
  }
  /**
   * Asansörle yukarı (dir=1) ya da aşağı (dir=-1). Başarıda {ok, to, distance, duration(sn), cost}. Nedenler:
   * yok · hedef_yok · bekleme · enerji · yuklenmedi · engelli
   */
  lift(x, y, z, dir, ctx) {
    const key = posKey(x, y, z);
    const st = this.machines.get(key);
    if (!st || st.t !== 'asansor') return bad('yok', 'Burada asansör platformu yok.');
    const d = dir < 0 ? -1 : 1;
    const target = this._liftTarget(key, d);
    if (!target) return bad('hedef_yok', d > 0 ? 'Yukarıda bağlı asansör platformu yok.' : 'Aşağıda bağlı asansör platformu yok.');
    if (st.cd > 0) return { ok: false, reason: 'bekleme', left: r2(st.cd), message: 'Asansör hazırlanıyor.' };
    // tampon (80 EU) üstünde bir bedel asla ödenemezdi: 54–96 blok uzaktaki bağlı platformlar kalıcı 'enerji' hatası verirdi → bedel tamponla sınırlı
    const cost = Math.min(R.lift.cap, Math.max(R.lift.minCost, Math.ceil(target.dy * R.lift.costPerBlock)));
    if (st.buf < cost) {
      return {
        ok: false, reason: 'enerji', need: cost, have: Math.floor(st.buf), message: 'Yetersiz enerji: ' + cost + ' EU gerekli.',
      };
    }
    const get = (a, b, c) => ctx.world.getBlock(a, b, c);
    const tid = get(target.p[0], target.p[1], target.p[2]);
    if (tid === null || tid === undefined) return bad('yuklenmedi', 'Hedef platformun bölgesi henüz yüklenmedi.');
    if (machineTypeOfBlock(tid) !== 'asansor') {
      this.machines.delete(target.key);
      this.dirty = true;
      return bad('hedef_yok', 'Hedef platform artık yok.');
    }
    if (!clearAbove(get, target.p)) return bad('engelli', 'Hedef platformun üstü kapalı.');
    st.buf = Math.round((st.buf - cost) * 1000) / 1000;
    st.cd = R.lift.cooldown;
    target.st.cd = R.lift.cooldown;
    return {
      ok: true,
      to: { x: target.p[0] + 0.5, y: target.p[1] + 0.5, z: target.p[2] + 0.5 },
      distance: target.dy,
      duration: Math.round((target.dy / R.lift.speed) * 100) / 100,
      cost,
      event: {
        type: 'lifted', x, y, z, ty: target.p[1], distance: target.dy, cost,
      },
    };
  }

  /* ---------------------------------------------------------------------------------------------
   * Portallar
   * ------------------------------------------------------------------------------------------- */
  /** Portal at. hit: raycastBlocks sonucu; opts: {world|getBlock, eye, yaw}. Döner placeOpenPortal sonucu (+event). */
  shootPortal(color, hit, opts) {
    const o = opts || {};
    const getBlock = o.getBlock || (o.world ? (a, b, c) => o.world.getBlock(a, b, c) : null);
    const res = placeOpenPortal(this.portals, hit, color, {
      getBlock, world: o.world, eye: o.eye, yaw: o.yaw, range: o.range, los: o.los,
    });
    if (res.ok) {
      this.portals = res.portals;
      res.event = {
        type: 'portalPlaced',
        color,
        x: res.portal.x,
        y: res.portal.y,
        z: res.portal.z,
        nx: res.portal.nx,
        ny: res.portal.ny,
        nz: res.portal.nz,
        replaced: !!res.replaced,
      };
    }
    return res;
  }
  portalAt(x, y, z) {
    return portalCellAt(this.portals, x, y, z);
  }
  /** Çizim çerçeveleri: {mavi, turuncu} (null olabilir). */
  portalFrames() {
    return {
      mavi: this.portals.mavi ? portalFrame(this.portals.mavi) : null,
      turuncu: this.portals.turuncu ? portalFrame(this.portals.turuncu) : null,
    };
  }
  /**
   * Gövde bir portala giriyor mu ve ışınlanabilir mi? body {x,y,z,w?,h?}, vel {x,y,z}, look {yaw,pitch}.
   * Başarıda {ok, from, to, x,y,z, vx,vy,vz, yaw, pitch, speed, event:{type:'portalUsed'…}} ve bekleme kurulur. Girmiyorsa null.
   */
  travelPortal(body, vel, look, world) {
    const getBlock = typeof world === 'function' ? world : (a, b, c) => world.getBlock(a, b, c);
    for (let i = 0; i < 2; i++) {
      const p = this.portals[COLORS[i]];
      if (!p || !this.portals[COLORS[1 - i]]) continue;
      if (this.portalCd > 0) {
        if (this.portalCdTo === COLORS[i] || this.portalCdTo === '*') continue; // az önce çıkılan portal: ping-pong yok (1 sn)
        if (PORTAL_COOLDOWN - this.portalCd < PORTAL_MIN_GAP) continue; // öbür portala bile en az 0,25 sn sonra
      }
      if (!portalEntry(p, body, vel)) continue;
      const res = travelThrough(this.portals, COLORS[i], {
        x: body.x, y: body.y, z: body.z, w: body.w, h: body.h, vx: vel.x, vy: vel.y, vz: vel.z, yaw: look.yaw, pitch: look.pitch,
      }, getBlock);
      if (!res.ok) return Object.assign({ from: COLORS[i] }, res);
      this.portalCd = PORTAL_COOLDOWN;
      this.portalCdTo = res.to;
      res.from = COLORS[i];
      res.event = {
        type: 'portalUsed', from: COLORS[i], to: res.to, speed: Math.round(res.speed * 10) / 10,
      };
      return res;
    }
    return null;
  }
  /** Arka bloğu kırılan portalları kapat → kapananlar [color]. Olaylar: portalClosed. */
  pruneBrokenPortals(world) {
    const getBlock = typeof world === 'function' ? world : (a, b, c) => world.getBlock(a, b, c);
    const res = pruneBrokenPortals(this.portals, getBlock);
    this.portals = res.portals;
    return res.closed;
  }

  /* ---------------------------------------------------------------------------------------------
   * Kayıt
   * ------------------------------------------------------------------------------------------- */
  serialize() {
    const m = {};
    const keys = Array.from(this.machines.keys()).sort(compareKeys);
    for (let i = 0; i < keys.length; i++) m[keys[i]] = jsonState(this.machines.get(keys[i]));
    const cd = Math.round(this.portalCd * 100) / 100; // qa5: cdt yuvarlanmış cd > 0 iken yazılır (cd:0 + cdt kalıntısı ikinci temizlemede düşerdi)
    return {
      v: 1,
      tm: Math.round(this.time * 100) / 100,
      cd,
      cdt: cd > 0 && this.portalCdTo ? this.portalCdTo : undefined,
      m,
      p: serializePortals(this.portals),
    };
  }
  /** Katı doğrulama; bozuk girdi atılır (asla atmaz). ctx: {minY,maxY}. */
  restore(raw, ctx) {
    this.machines.clear();
    this._powered.clear();
    this._share.clear();
    this._on.clear();
    this.portals = { mavi: null, turuncu: null };
    this.networks = [];
    this.nodeNet.clear();
    this.dirty = true;
    this.acc = 0;
    this.portalCd = 0;
    this.portalCdTo = null;
    this.time = 0;
    if (!raw || typeof raw !== 'object') return this;
    const t = Number(raw.tm);
    this.time = Number.isFinite(t) && t >= 0 && t < 1e9 ? t : 0;
    const cd = Number(raw.cd);
    this.portalCd = Number.isFinite(cd) && cd > 0 ? Math.min(cd, PORTAL_COOLDOWN) : 0;
    if (this.portalCd > 0) this.portalCdTo = raw.cdt === 'mavi' || raw.cdt === 'turuncu' ? raw.cdt : '*'; // eski kayıt: ikisi de beklemede
    const c = ctx || {};
    const minY = Number.isFinite(c.minY) ? c.minY : -1000;
    const maxY = Number.isFinite(c.maxY) ? c.maxY : 1000;
    const m = raw.m && typeof raw.m === 'object' ? raw.m : {};
    const keys = Object.keys(m);
    for (let i = 0; i < keys.length && this.machines.size < MAX_MACHINES; i++) {
      const key = keys[i];
      const p = parseKey(key);
      if (!p || p[1] < minY || p[1] > maxY) continue;
      const rec = m[key];
      if (!rec || typeof rec !== 'object' || typeof rec.t !== 'string') continue;
      const st = sanitizeMachine(rec.t, rec, { minY, maxY });
      if (st) this.machines.set(posKey(p[0], p[1], p[2]), st);
    }
    this.portals = restorePortals(raw.p);
    return this;
  }
}

function clearAbove(get, p) {
  for (let k = 1; k <= 2; k++) {
    const id = get(p[0], p[1] + k, p[2]);
    if (id === null || id === undefined) return false;
    if (id !== 0 && BLOCKS[id] && BLOCKS[id].solid) return false;
  }
  return true;
}

/** Makine durumunun JSON kopyası (iç içe diziler/nesneler derin kopya). */
function jsonState(st) {
  const out = {};
  Object.keys(st).forEach((k) => {
    const v = st[k];
    if (Array.isArray(v)) out[k] = v.map((e) => (e && typeof e === 'object' ? Object.assign({}, e) : e));
    else if (v && typeof v === 'object') out[k] = Object.assign({}, v);
    else out[k] = v;
  });
  return out;
}

/** Makinenin içindeki eşyalar (yıkılınca yere bırakılır): [{item,count}]. */
export function machineContents(st) {
  const out = [];
  if (st.t === 'jenerator' && st.fuel) out.push({ item: st.fuel.item, count: st.fuel.count });
  if (st.t === 'ocak') {
    if (st.inItem && st.inCount > 0) out.push({ item: st.inItem, count: st.inCount });
    if (st.outItem && st.outCount > 0) out.push({ item: st.outItem, count: st.outCount });
  }
  if (st.t === 'matkap') st.buf.forEach((s) => out.push({ item: s.item, count: s.count }));
  return out.filter((s) => itemByKey(s.item));
}
