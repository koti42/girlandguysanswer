/*
 * KEŞİF sim — TEKNOLOJİ: makine bilgisi (arayüz paneli) ve yapılandırma. TechState'in ince sarmalayıcıları bu işlevleri çağırır
 * (dosya boyutunu bölmek için ayrıldı): machineInfo(tech, x,y,z) · setMachineConfig(tech, x,y,z, cfg).
 */
import { FREQ_SYMBOLS, TECH_RATES } from './techData.js';
import { parseKey, posKey } from './techPower.js';
import {
  BUTTON_MODES, DRILL_MODES, LAMP_HUES, cleanFreq, drillCells, furnaceTime, isSwitchable, resetDrill, visualOn,
} from './techMachines.js';

const R = TECH_RATES;
export const MACHINE_NAMES = Object.freeze({
  gunes: 'Güneş Paneli', jenerator: 'Yakıt Jeneratörü', pil: 'Pil Bankası', ocak: 'Elektrikli Ocak', matkap: 'Otomatik Madenci',
  lamba: 'Lamba Paneli', isinlayici: 'Işınlanma Platformu', asansor: 'Asansör Platformu', kapi: 'Güç Kapısı', dugme: 'Düğme',
  sensor: 'Sensör', sarj: 'Şarj İstasyonu',
});
function r2(v) {
  return Math.round(v * 100) / 100;
}
function bad(reason, message) {
  return { ok: false, reason, message };
}

/** Makine bilgisi (arayüz paneli). Yoksa {ok:false}. */
export function machineInfo(tech, x, y, z) {
  const key = posKey(x, y, z);
  const st = tech.machines.get(key);
  if (!st) return bad('yok', 'Burada bir makine yok.');
  const net = tech.networkOf(x, y, z);
  const powered = !!tech._powered.get(key);
  const info = {
    ok: true,
    key,
    type: st.t,
    name: MACHINE_NAMES[st.t] || st.t,
    pos: { x, y, z },
    powered,
    on: visualOn(st.t, st),
    network: net,
  };
  if (isSwitchable(st.t)) info.off = !!st.off;
  switch (st.t) {
    case 'gunes':
      info.sky = !!st.sky;
      break;
    case 'jenerator':
      info.fuel = st.fuel ? { item: st.fuel.item, count: st.fuel.count } : null;
      info.burning = st.burnT > 1e-9 && !st.off;
      info.burnLeft = r2(st.burnT);
      info.burnTotal = r2(st.burnTotal);
      info.rate = R.generator.rate;
      break;
    case 'pil':
      info.stored = Math.round(st.stored);
      info.cap = R.battery.cap;
      info.io = R.battery.io;
      break;
    case 'ocak':
      info.inItem = st.inItem;
      info.inCount = st.inCount;
      info.outItem = st.outItem;
      info.outCount = st.outCount;
      info.progress = r2(st.prog);
      info.time = furnaceTime();
      break;
    case 'matkap': {
      const p = parseKey(key);
      info.mode = st.mode;
      info.depth = st.ly === null ? 0 : p[1] - st.ly;
      info.mined = st.mined;
      info.stop = st.stop;
      info.wait = st.wait;
      info.buffer = st.buf.map((s) => ({ item: s.item, count: s.count }));
      info.cells = drillCells(st.mode).length;
      break;
    }
    case 'isinlayici': {
      info.freq = st.freq;
      info.symbols = st.freq ? st.freq.split('').map((c) => FREQ_SYMBOLS[Number(c)]) : null;
      info.buf = Math.round(st.buf);
      info.cap = R.teleporter.cap;
      info.cooldown = r2(st.cd);
      const partner = st.freq ? tech._partnerOf(key, st) : null;
      info.partner = partner ? { x: partner.p[0], y: partner.p[1], z: partner.p[2] } : null;
      info.cost = partner ? tech._teleportCost(parseKey(key), partner.p) : null;
      info.ready = !!partner && st.cd <= 0 && st.buf >= (info.cost || 0);
      break;
    }
    case 'asansor':
      info.buf = Math.round(st.buf);
      info.cap = R.lift.cap;
      info.cooldown = r2(st.cd);
      info.up = tech._liftTarget(key, 1) ? tech._liftTarget(key, 1).p[1] : null;
      info.down = tech._liftTarget(key, -1) ? tech._liftTarget(key, -1).p[1] : null;
      break;
    case 'lamba':
      info.hue = st.hue || 0;
      info.hueName = LAMP_HUES[info.hue].name;
      break;
    case 'kapi':
      info.open = st.open;
      break;
    case 'dugme':
      info.mode = st.mode;
      info.left = r2(st.left);
      break;
    case 'sensor':
      info.radius = st.radius;
      break;
    case 'sarj':
      info.buf = Math.round(st.buf);
      info.cap = R.charger.cap;
      break;
    default:
      break;
  }
  return info;
}

/**
   * Yapılandırma: matkap {mode:'column'|'alan', restart:true} · ışınlanma {freq:'0123'|null} · sensör {radius:2..8} ·
   * düğme {mode:'toggle'|'pulse'} · lamba {hue:0..7} · jeneratör/ocak/madenci/lamba/ışınlayıcı/asansör/şarj {off:bool}. Reddedilirse {ok:false, reason, message}.
   */
export function setMachineConfig(tech, x, y, z, cfg) {
  const key = posKey(x, y, z);
  const st = tech.machines.get(key);
  if (!st) return bad('yok', 'Burada bir makine yok.');
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const has = (k) => Object.prototype.hasOwnProperty.call(c, k);
  if (has('off')) {
    if (!isSwitchable(st.t)) return bad('ayar_yok', 'Bu makine açılıp kapatılamaz.');
    const off = !!c.off;
    if (off !== !!st.off) {
      if (off) st.off = true;
      else delete st.off;
      tech.dirty = true;
    }
  }
  switch (st.t) {
    case 'lamba':
      if (has('hue')) {
        const h = Math.floor(Number(c.hue));
        if (!(h >= 0 && h < LAMP_HUES.length)) return bad('renk', 'Geçersiz lamba rengi.');
        if (h > 0) st.hue = h;
        else delete st.hue;
      }
      return has('hue') || has('off') ? { ok: true } : bad('ayar_yok', 'Bu ayar lambada yok.');
    case 'matkap':
      if (has('mode')) {
        if (DRILL_MODES.indexOf(c.mode) < 0) return bad('mod', 'Geçersiz kazı modu.');
        if (c.mode !== st.mode) {
          st.mode = c.mode;
          resetDrill(st);
        }
      }
      if (c.restart) resetDrill(st);
      return { ok: true };
    case 'isinlayici': {
      if (!has('freq')) return { ok: true };
      if (c.freq === null || c.freq === '') {
        st.freq = null;
        return { ok: true };
      }
      const f = cleanFreq(c.freq);
      if (!f) return bad('frekans', 'Frekans 4 sembol olmalı (her biri 0–7).');
      let same = 0;
      tech.machines.forEach((m, k) => {
        if (k !== key && m.t === 'isinlayici' && m.freq === f) same++;
      });
      if (same >= 2) return bad('dolu', 'Bu frekansta zaten iki platform var.');
      st.freq = f;
      return { ok: true };
    }
    case 'sensor':
      if (has('radius')) {
        const r = Math.floor(Number(c.radius));
        if (!(r >= R.sensor.minRadius && r <= R.sensor.maxRadius)) return bad('menzil', 'Menzil 2 ile 8 blok arasında olmalı.');
        st.radius = r;
        tech.dirty = true;
      }
      return { ok: true };
    case 'dugme':
      if (has('mode')) {
        if (BUTTON_MODES.indexOf(c.mode) < 0) return bad('mod', 'Geçersiz düğme modu.');
        st.mode = c.mode;
      }
      return { ok: true };
    default:
      return has('off') ? { ok: true } : bad('ayar_yok', 'Bu makinenin ayarı yok.');
  }
}
