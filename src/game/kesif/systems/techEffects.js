/*
 * KEŞİF tech sistemi — olay tepkileri (ses, parçacık, ipucu/sesli okuma) ve makine içeriği bırakma.
 *
 *   reactToTechEvent(T, e)       TechState.tick / etkileşim olaylarını seslendirir (poweredChanged, drilled, smelted, machineLost, …)
 *   blockChangeHook(T, evt)      world 'blockChange' → TechState.onBlockChange; kırılan makinenin içeriği yere
 *
 * Mesafe kuralı: ses ve parçacıklar yalnız oyuncuya yakın makinelerde (≈ 26 blok); yoksa sessiz ilerler (CPU/ses bütçesi).
 */
import { MACHINE_NAMES } from '../sim/techInfo.js';
import { dropItems, nearPlayer, say } from './techCtx.js';

const NEAR = 26;
const POINT = { x: 0, y: 0, z: 0 };

function at(x, y, z, dx, dy, dz) {
  POINT.x = x + (dx === undefined ? 0.5 : dx);
  POINT.y = y + (dy === undefined ? 0.5 : dy);
  POINT.z = z + (dz === undefined ? 0.5 : dz);
  return POINT;
}

const ON_TEXT = {
  lamba: 'Lamba yandı.',
  kapi: 'Güç kapısı açıldı.',
  jenerator: 'Jeneratör çalıştı.',
  matkap: 'Otomatik Madenci çalışıyor.',
  ocak: 'Elektrikli ocak çalışıyor.',
  isinlayici: 'Işınlanma platformu hazır.',
  sarj: 'Şarj İstasyonu şarj veriyor.',
  sensor: 'Sensör tetiklendi.',
  dugme: 'Düğme açıldı.',
};
const OFF_TEXT = {
  lamba: 'Lamba söndü.',
  kapi: 'Güç kapısı kapandı.',
  jenerator: 'Jeneratör durdu.',
  matkap: 'Otomatik Madenci durdu.',
  ocak: 'Elektrikli ocak durdu.',
  isinlayici: 'Işınlanma platformu bekliyor.',
  sarj: 'Şarj İstasyonu durdu.',
  sensor: 'Sensör serbest.',
  dugme: 'Düğme kapandı.',
};

export function reactToTechEvent(T, e) {
  const G = T.G;
  switch (e.type) {
    case 'poweredChanged': {
      T.hudDirty = true;
      if (!nearPlayer(G, e.x, e.y, e.z, NEAR)) break;
      const t = e.machine;
      if (t === 'lamba') G.sound(e.on ? 'tech:power_on' : 'tech:power_off', at(e.x, e.y, e.z), { vol: 0.55 });
      else if (t === 'jenerator') G.sound(e.on ? 'tech:generator' : 'tech:power_off', at(e.x, e.y, e.z), { vol: 0.7 });
      else if (t === 'kapi') G.sound('door_open', at(e.x, e.y, e.z), { vol: 0.8, pitch: e.on ? 1.1 : 0.8 });
      else if (t === 'sensor') G.sound('plate', at(e.x, e.y, e.z), { vol: 0.45, pitch: e.on ? 1.3 : 0.9 });
      else if (t === 'dugme') G.sound('lever', at(e.x, e.y, e.z), { vol: 0.6 });
      else G.sound(e.on ? 'tech:power_on' : 'tech:power_off', at(e.x, e.y, e.z), { vol: 0.4 });
      if (nearPlayer(G, e.x, e.y, e.z, 12)) {
        const txt = (e.on ? ON_TEXT : OFF_TEXT)[t];
        if (txt) say(T, 'pw:' + t + (e.on ? 1 : 0), txt, { hint: false, cooldown: 3 });
      }
      break;
    }
    case 'drilled': {
      if (!nearPlayer(G, e.x, e.y, e.z, NEAR) || !G.particles) break;
      if (G.particles.blockBreak) G.particles.blockBreak(e.id, at(e.bx, e.by, e.bz), 0.6);
      if (G.particles.techDust) G.particles.techDust(at(e.x, e.y, e.z, 0.5, -0.1), 0xb8b0a4, 3);
      G.sound('tech:drill', at(e.bx, e.by, e.bz), { vol: 0.5, pitch: 0.9 + ((e.by * 7) & 7) / 40 });
      break;
    }
    case 'drillStopped': {
      T.hudDirty = true;
      if (!nearPlayer(G, e.x, e.y, e.z, 16)) break;
      const why = e.reason === 'ana_kaya' ? 'Ana kayaya ulaştı' : e.reason === 'dip' ? 'Dünyanın dibine ulaştı' : e.reason === 'korumali' ? 'altında korunan bir blok var (sandık, makine, istasyon, bulmaca ya da yapı)' : 'Derinlik sınırına ulaştı';
      say(T, 'drillStop', 'Otomatik Madenci durdu: ' + why + '.', { secs: 4, cooldown: 8 });
      break;
    }
    case 'smelted': {
      if (!nearPlayer(G, e.x, e.y, e.z, NEAR)) break;
      if (G.particles && G.particles.techSpark) G.particles.techSpark(at(e.x, e.y, e.z, 0.5, 1.05), 0xffb040, 6);
      G.sound('pickup', at(e.x, e.y, e.z), { vol: 0.35, pitch: 1.4 });
      break;
    }
    case 'machineLost': {
      dropItems(G, e.items, e.x, e.y, e.z);
      T.hudDirty = true;
      break;
    }
    case 'networkOverflow':
      say(T, 'overflow', 'Ağ çok büyük: 2000 bloktan fazlası tek ağa bağlanmaz.', { secs: 4, cooldown: 20 });
      break;
    case 'machineTick':
      T.hudDirty = true;
      break;
    default:
      break;
  }
}

/** world 'blockChange' → TechState; kırılan makinenin içeriği (yakıt, ocak, madenci tamponu) yere düşer. */
export function blockChangeHook(T, evt) {
  const G = T.G;
  const r = T.tech.onBlockChange(evt);
  if (r && r.items && r.items.length) dropItems(G, r.items, evt.x, evt.y, evt.z);
  if (r && r.lost && r.lost.length) {
    T.hudDirty = true;
    const p = G.techUi && G.techUi.pos;
    if (G.ui === 'machine' && p && p.x === evt.x && p.y === evt.y && p.z === evt.z) G.setUi(null);
  }
}

export function machineName(type) {
  return MACHINE_NAMES[type] || type;
}
