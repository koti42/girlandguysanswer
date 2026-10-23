/*
 * KEŞİF teknoloji panelleri — saf yardımcılar (DOM/React yok; node'da test edilir).
 *
 *   FREQ_GLYPHS / freqGlyph(i)         ışınlayıcı frekans sembolleri (şekil + ad: renk körlüğü için)   parseFreq(str) / freqString(arr)
 *   formatEU(n) / formatRate(x)        '5 000 EU' · '+12 EU/sn'
 *   networkView(info)                  {has, pct, stored, cap, gen, demand, net, text, level} — enerji ağı özeti
 *   machineState(info)                 {key, text, tone}  çalışıyor | boşta | enerji yok | bekliyor | durdu …
 *   drillView(info)                    madenci ayrıntısı: durum metni, derinlik, tampon
 *   teleporterView(info)               ışınlayıcı: hazır mı, neden hazır değil
 *   liftView(info)                     asansör: yön düğmeleri durumu
 *   arrowDeg(ping, heading)            tarayıcı oku: CSS dönüş derecesi (saat yönü), 0 = tam karşıda
 *   pingText(p)                        'Elmas Cevheri · 14 m · aşağıda'
 *   chargeLevel(fraction)              'ok' | 'low' | 'crit'
 *   statusLines(info) → string[]       ekran okuyucu özeti
 */
import { FREQ_LENGTH, FREQ_SYMBOLS, TECH_RATES } from '../../../game/kesif/sim/techData.js';

export const FREQ_GLYPHS = Object.freeze(['▲', '●', '■', '★', '◆', '☾', '☀', '✦']);
export function freqGlyph(i) {
  return FREQ_GLYPHS[((Math.floor(i) % 8) + 8) % 8];
}
export function freqName(i) {
  return FREQ_SYMBOLS[((Math.floor(i) % 8) + 8) % 8];
}
/** '0123' → [0,1,2,3] (geçersiz/eksikse null). */
export function parseFreq(str) {
  if (typeof str !== 'string' || str.length !== FREQ_LENGTH || !/^[0-7]+$/.test(str)) return null;
  return str.split('').map(Number);
}
export function freqString(arr) {
  return (arr || []).map((n) => String(Math.max(0, Math.min(7, Math.floor(n) || 0)))).join('');
}

const nf = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export function formatEU(n) {
  return nf(Number.isFinite(n) ? n : 0) + ' EU';
}
export function formatRate(x) {
  const v = Math.round((Number(x) || 0) * 10) / 10;
  return (v > 0 ? '+' : '') + String(v).replace('.', ',') + ' EU/sn';
}

export function networkView(info) {
  const n = info && info.network ? info.network : null;
  if (!n) {
    return {
      has: false, pct: 0, stored: 0, cap: 0, gen: 0, demand: 0, net: 0, nodes: 0, machines: 0, text: 'Bağlı bir enerji ağı yok: yan yana enerji bloğu ya da kablo ekle.', level: 'none',
    };
  }
  const pct = n.cap > 0 ? Math.max(0, Math.min(100, Math.round((n.stored / n.cap) * 100))) : 0;
  const net = Math.round((n.gen - n.supplied) * 10) / 10;
  let level = 'ok';
  if (!n.live && n.standby) level = 'ok';
  else if (!n.live) level = 'dead';
  else if (n.demand > n.supplied + 0.01) level = 'short';
  const text = !n.live && n.standby ? 'Jeneratör hazır: talep olunca yakıt yakar.' : !n.live ? 'Ağda enerji kaynağı yok.' : n.demand > n.supplied + 0.01 ? 'Talep üretimi aşıyor: bir jeneratör, güneş paneli ya da pil daha ekle.' : 'Ağ dengede.';
  return {
    has: true, pct, stored: n.stored, cap: n.cap, gen: n.gen, demand: n.demand, supplied: n.supplied, net, nodes: n.nodes, machines: n.machines, text, level,
  };
}

/** Panel başlığı altındaki durum etiketi. */
export function machineState(info) {
  if (!info) return { key: 'yok', text: '', tone: 'dim' };
  const nw = networkView(info);
  if (info.off) return { key: 'kapali', text: 'Kapalı (anahtar)', tone: 'dim' };
  switch (info.type) {
    case 'gunes':
      return info.sky ? { key: 'calisiyor', text: 'Gökyüzü açık', tone: 'good' } : { key: 'kapali', text: 'Üstü kapalı', tone: 'bad' };
    case 'jenerator':
      if (info.burning) return { key: 'calisiyor', text: 'Yanıyor', tone: 'good' };
      return info.fuel ? { key: 'bosta', text: 'Hazır (talep yok)', tone: 'dim' } : { key: 'yakit', text: 'Yakıt yok', tone: 'bad' };
    case 'pil':
      return info.stored > 0 ? { key: 'dolu', text: 'Şarjlı', tone: 'good' } : { key: 'bos', text: 'Boş', tone: 'dim' };
    case 'ocak':
      if (info.on) return { key: 'calisiyor', text: 'Eritiyor', tone: 'good' };
      if (info.inItem && !info.powered) return { key: 'enerji', text: 'Enerji yok', tone: 'bad' };
      return { key: 'bosta', text: info.inItem ? 'Bekliyor' : 'Boşta', tone: 'dim' };
    case 'matkap':
      if (info.stop) return { key: 'durdu', text: 'Durdu', tone: 'bad' };
      if (info.wait === 'dolu') return { key: 'dolu', text: 'Tampon dolu', tone: 'bad' };
      if (info.on) return { key: 'calisiyor', text: 'Kazıyor', tone: 'good' };
      return { key: info.powered ? 'bosta' : 'enerji', text: info.powered ? 'Hazır' : 'Enerji yok', tone: info.powered ? 'dim' : 'bad' };
    case 'isinlayici':
      if (!info.freq) return { key: 'ayarsiz', text: 'Frekans ayarsız', tone: 'bad' };
      if (info.ready) return { key: 'hazir', text: 'Hazır', tone: 'good' };
      return { key: 'bekliyor', text: info.cooldown > 0 ? 'Soğuyor' : 'Hazır değil', tone: 'dim' };
    case 'asansor':
      return info.cooldown > 0 ? { key: 'bekliyor', text: 'Hazırlanıyor', tone: 'dim' } : { key: 'hazir', text: 'Hazır', tone: 'good' };
    case 'lamba':
      if (info.on) return { key: 'calisiyor', text: 'Yanıyor', tone: 'good' };
      return { key: info.powered ? 'bosta' : 'enerji', text: info.powered ? 'Hazır' : 'Enerji yok', tone: info.powered ? 'dim' : 'bad' };
    case 'kapi':
      return info.open ? { key: 'acik', text: 'Açık', tone: 'good' } : { key: 'kapali', text: 'Kapalı', tone: 'dim' };
    case 'dugme':
      return info.on ? { key: 'acik', text: 'Açık', tone: 'good' } : { key: 'kapali', text: 'Kapalı', tone: 'dim' };
    case 'sensor':
      return info.on ? { key: 'acik', text: 'Algıladı', tone: 'good' } : { key: 'kapali', text: 'Boşta', tone: 'dim' };
    case 'sarj':
      return info.on ? { key: 'calisiyor', text: 'Şarj veriyor', tone: 'good' } : { key: 'bosta', text: nw.has ? 'Hazır' : 'Boşta', tone: 'dim' };
    default:
      return { key: 'bosta', text: info.powered ? 'Çalışıyor' : 'Boşta', tone: 'dim' };
  }
}

const STOP_TEXT = {
  ana_kaya: 'Ana kayaya ulaştı: daha aşağısı kırılamaz.',
  korumali: 'Altında korunan bir blok var (sandık, makine, istasyon, bulmaca ya da yapı): önce onu kaldır, sonra devam et.',
  dip: 'Dünyanın dibine ulaştı.',
  derinlik: 'Derinlik sınırına (' + TECH_RATES.drill.maxDepth + ' blok) ulaştı.',
};
export function drillView(info) {
  const stopText = info && info.stop ? STOP_TEXT[info.stop] || 'Durdu.' : '';
  const waitText = info && info.wait === 'yuk' ? 'Aşağıdaki bölge yükleniyor…' : info && info.wait === 'dolu' ? 'Tampon dolu: boşaltmazsan bekler.' : '';
  const buffer = info && Array.isArray(info.buffer) ? info.buffer : [];
  let total = 0;
  buffer.forEach((s) => { total += s.count; });
  return {
    mode: info ? info.mode : 'column',
    cells: info ? info.cells : 1,
    depth: info ? info.depth : 0,
    mined: info ? info.mined : 0,
    stopped: !!(info && info.stop),
    stopText,
    waitText,
    buffer,
    total,
    status: stopText || waitText || (info && info.on ? 'Kazıyor.' : info && !info.powered ? 'Enerji bekliyor.' : 'Hazır.'),
  };
}

export function teleporterView(info) {
  if (!info) return { ready: false, reason: '' };
  let reason = '';
  if (!info.freq) reason = 'Önce 4 sembollü frekansı ayarla.';
  else if (!info.partner) reason = 'Aynı frekansta eş platform yok.';
  else if (info.cooldown > 0) reason = 'Platform soğuyor (' + Math.ceil(info.cooldown) + ' sn).';
  else if (info.cost && info.buf < info.cost) reason = 'Enerji yetersiz: ' + info.cost + ' EU gerekli, ' + info.buf + ' EU var.';
  else if (!info.onPad) reason = 'Platformun üstüne çık.';
  return {
    ready: !!info.freq && !!info.partner && !reason, reason, cost: info.cost || 0, buf: info.buf || 0, cap: info.cap || 0, partner: info.partner || null,
  };
}

export function liftView(info) {
  if (!info) return { up: false, down: false, reason: '' };
  const energy = info.buf >= TECH_RATES.lift.minCost;
  let reason = '';
  if (!info.onPad) reason = 'Platformun üstüne çık.';
  else if (info.cooldown > 0) reason = 'Asansör hazırlanıyor.';
  else if (!energy) reason = 'Enerji yetersiz.';
  return {
    up: info.up !== null && info.up !== undefined && !reason,
    down: info.down !== null && info.down !== undefined && !reason,
    upY: info.up, downY: info.down, reason, buf: info.buf, cap: info.cap,
  };
}

/** Tarayıcı oku: hedefin oyuncu yönüne göre açısı. yaw: hedefe bakan yaw; heading: oyuncu yaw'ı (+ sola). CSS saat yönü derecesi. */
export function arrowDeg(ping, heading) {
  if (!ping) return 0;
  let d = (ping.yaw || 0) - (heading || 0); // + sola
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const deg = -d * (180 / Math.PI);
  return Math.round(deg * 10) / 10 + 0; // −0 olmasın
}

export function pingText(p) {
  if (!p) return '';
  const v = p.dy > 3 ? 'yukarıda' : p.dy < -3 ? 'aşağıda' : 'aynı hizada';
  return p.name + ' · ' + Math.round(p.dist) + ' m · ' + v;
}

export function chargeLevel(fraction) {
  const f = Number(fraction) || 0;
  return f <= 0.1 ? 'crit' : f <= 0.3 ? 'low' : 'ok';
}

/** Ekran okuyucu özeti (panel açılınca / değişince). */
export function statusLines(info) {
  if (!info) return [];
  const lines = [];
  const st = machineState(info);
  lines.push(info.name + ': ' + st.text + '.');
  const nw = networkView(info);
  if (nw.has) lines.push('Ağ: ' + nw.text + ' Üretim ' + nw.gen + ', tüketim ' + nw.supplied + ' EU/sn; depo ' + nw.stored + ' / ' + nw.cap + ' EU.');
  return lines;
}
