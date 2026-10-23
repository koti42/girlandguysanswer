/*
 * KEŞİF — oyun modlarına özgü oturum mantığı.
 *
 *   setupMode(G)                    mod kurulumu: harita → G.readOnly = true (blocks sistemi kırma/yerleştirmeyi reddeder)
 *   introFor(G, {resumed, restoreError, contentLive}) → {banners:[{text,sub,priority,duration,key,kind}], hints:[{text,ttl,key,priority}]}
 *   deniedText(reason) → Türkçe ipucu         reason: 'readOnly'|'bounds'|'system'|'height'|'protected'
 *   boundsContact(G, out?) → null | 'bounds'|'height'   gövde yapı alanı sınırına/tavana dayandı mı (insa/harita)
 *   exportMap(G, opts?) → {ok, map, meta:{title,desc,blockCount,spawn,time,base,bytes,chunkCount,encodedBytes}, errors, codes}
 *   setMapTime(G, name) → 'gündüz'|'gece'|'gün batımı'|null
 *   worldCodeFor(G) → string                macera: Dünya Kodu; insa/harita: ''
 *
 * Olay sözleşmesi (blocks sistemi için): reddedilen blok eylemi `G.emit({type:'actionDenied', reason})` ile bildirilir; oturum
 * sistemi bunu ipucu satırına (hud.hint) çevirir. İnşa sınırı: 8×8 chunk (128×128) + tavan (CEILING_Y).
 */
import { ZONES } from '../sim/constants.js';
import { buildInsaMap } from '../sim/saveMapIO.js';
import { MAP_TIMES, RULES } from '../sim/mapFormat.js';
import { mapTimePhase, findSafeSpawn } from '../gameWorld.js';
import { setClockPhase } from '../sim/daynight.js';
import { ceilingFor } from '../gamePlayer.js';

export function setupMode(G) {
  G.readOnly = G.mode === 'harita';
  G.buildBounds = G.world && G.world.frame ? G.world.bounds : null;
  return G.readOnly;
}

export function worldCodeFor(G) {
  return G.mode === 'macera' ? G.worldCode : '';
}

const DENIED = {
  readOnly: 'Bu harita salt okunur: gezip keşfedebilirsin ama blok kırıp koyamazsın.',
  bounds: 'Yapı alanının sınırına geldin; daha öteye inşa edemezsin.',
  height: 'Yükseklik sınırına ulaştın; daha yükseğe çıkamaz ve inşa edemezsin.',
  system: 'Bu blok sistemin parçası; kırılamaz ve değiştirilemez.',
  protected: 'Burası korumalı; önce bulmacayı çöz.',
  seal: 'Mühür bu bölgeyi kapatıyor: önce Anahtar Kristallerini bulup mührü aç.',
};

export function deniedText(reason) {
  return DENIED[reason] || DENIED.system;
}

const isTouch = (G) => !!((G.input && G.input.isTouch === true) || (G.inputState && G.inputState.touch));

/** Açılış duyuruları ve ipuçları (mod + devam/yeni). */
export function introFor(G, o) {
  const opt = o || {};
  const banners = [];
  const hints = [];
  const touch = isTouch(G);
  if (opt.restoreError === 'oldworld') {
    banners.push({
      text: 'Bu dünya eski sürümden', sub: 'Yeni bir dünya başlat', priority: 8, duration: 6200, key: 'intro', kind: 'info',
    });
  } else if (opt.restoreError) {
    banners.push({
      text: 'Kayıt okunamadı', sub: 'Aynı dünyada yeni bir macera başlıyor', priority: 8, duration: 5200, key: 'intro', kind: 'info',
    });
  }
  if (G.mode === 'macera') {
    const zone = ZONES[0].name;
    if (opt.resumed) {
      banners.push({
        text: 'Maceraya devam', sub: 'Dünya Kodu: ' + G.worldCode, priority: 8, duration: 4200, key: 'intro', kind: 'info',
      });
    } else {
      banners.push({
        text: 'Dünya Kodu: ' + G.worldCode, sub: zone + ' · Maceran başlıyor', priority: 8, duration: 5200, key: 'intro', kind: 'info',
      });
      if (!opt.contentLive) hints.push({
        text: touch
          ? 'Bir ağaca yaklaş ve kır düğmesine basılı tut: odun toplamak maceranın ilk adımı.'
          : 'Bir ağaca yaklaş ve sol tıkı basılı tut: odun toplamak maceranın ilk adımı.',
        ttl: 9000,
        key: 'intro',
        priority: 2,
      });
    }
  } else if (G.mode === 'insa') {
    const title = G.mapMeta && G.mapMeta.title ? G.mapMeta.title : '';
    banners.push({
      text: title || 'İnşa Alanı', sub: 'Sınırsız blok · uçuş açık · hasar yok', priority: 8, duration: 4800, key: 'intro', kind: 'info',
    });
    if (!opt.resumed) {
      hints.push({
        text: touch
          ? 'Zıpla düğmesine iki kez bas: uçuş. Envanter düğmesiyle blok paletini aç.'
          : 'Zıplamaya iki kez bas: uçuş. E tuşuyla blok paletini aç, sağ tıkla yerleştir.',
        ttl: 9000,
        key: 'intro',
        priority: 2,
      });
    }
  } else {
    const title = G.mapMeta && G.mapMeta.title ? G.mapMeta.title : 'Topluluk Haritası';
    banners.push({
      text: title, sub: 'Topluluk haritası · salt okunur', priority: 8, duration: 5200, key: 'intro', kind: 'info',
    });
    hints.push({
      text: 'Bu haritada yalnızca gezip keşfedebilirsin; blok kırıp koyamazsın.',
      ttl: 8000,
      key: 'intro',
      priority: 2,
    });
  }
  return { banners, hints };
}

/** Gövde yapı alanı kenarında / tavanda mı? Döner: null | 'bounds' | 'height' (macera: yalnız tavan 'height'). */
export function boundsContact(G) {
  const b = G.body;
  const bd = G.buildBounds;
  const hw = b.w * 0.5 + 0.002;
  const s = G.inputState;
  const wantsMove = s && (Math.abs(s.moveX) > 0.1 || Math.abs(s.moveZ) > 0.1);
  // Tavan teması yalnızca oyuncu yukarı/ileri DENEYİNCE bildirilir; tavanda durup beklemek ipucu tekrarlatmaz.
  if (b.y >= ceilingFor(G.world) - 0.01) return wantsMove || (s && s.jump) ? 'height' : null;
  if (G.mode === 'macera' || !bd) return null;
  if (!wantsMove) return null;
  const minX = bd.minCx * 16 + hw;
  const maxX = (bd.maxCx + 1) * 16 - hw;
  const minZ = bd.minCz * 16 + hw;
  const maxZ = (bd.maxCz + 1) * 16 - hw;
  const eps = 0.02;
  if (b.x <= minX + eps || b.x >= maxX - eps || b.z <= minZ + eps || b.z >= maxZ - eps) return 'bounds';
  return null;
}

/* ------------------------------------------------------------------------------------------------
 * Harita dışa aktarımı (insa)
 * ---------------------------------------------------------------------------------------------- */
function parseMapSource(src) {
  if (src && typeof src === 'object') return src;
  if (typeof src === 'string') {
    try {
      const v = JSON.parse(src);
      return v && typeof v === 'object' ? v : null;
    } catch {
      return null;
    }
  }
  return null;
}

function fail(code, text) {
  return {
    ok: false, map: null, meta: null, errors: [text], codes: [code], error: text,
  };
}

function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  let t = '';
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13) t += ' ';
    else if (c >= 32 && c !== 127 && c !== 60 && c !== 62) t += v.charAt(i);
  }
  const a = Array.from(t.replace(/\s+/g, ' ').trim());
  return a.length > max ? a.slice(0, max).join('') : a.join('');
}

/** Spawn: oyuncunun ayakta durduğu yer (havada/uçuyorsa en yakın güvenli zemin); olmazsa dünya doğuşu. */
function exportSpawn(G) {
  const b = G.body;
  try {
    const sp = findSafeSpawn(G.world, b.x, b.y, b.z, { maxR: 6 });
    if (sp.ok) return [sp.x, sp.y, sp.z];
  } catch { /* yut */ }
  return [G.spawn.x, G.spawn.y, G.spawn.z];
}

/**
 * İnşa dünyasından yayınlanabilir harita. Başarısızlık: {ok:false, errors:[Türkçe], codes}.
 * opts: {title, desc}. Sistem blokları kurala göre taşa/havaya çevrilir (sim/saveMapIO.buildInsaMap).
 */
export function exportMap(G, opts) {
  const o = opts || {};
  if (G.mode !== 'insa') return fail('mode', 'Yalnızca inşa modundaki harita dışa aktarılabilir.');
  const world = G.world;
  const meta = G.mapMeta || {};
  const baseMap = parseMapSource(G.opts && G.opts.mapData);
  const title = cleanText(o.title !== undefined ? o.title : meta.title, RULES.titleMax);
  const desc = cleanText(o.desc !== undefined ? o.desc : meta.desc, RULES.descMax);
  const time = MAP_TIMES.indexOf(meta.time) >= 0 ? meta.time : 'gündüz';
  let anyEdit = false;
  world.forEachChunk((c) => { if (c.edited) anyEdit = true; });
  const hasBase = !!(baseMap && baseMap.chunks && Object.keys(baseMap.chunks).length > 0);
  if (!anyEdit && !hasBase) return fail('empty', 'Henüz hiçbir şey inşa etmedin. Biraz inşa edip tekrar dene.');
  let res;
  try {
    res = buildInsaMap(world, {
      title, desc, base: meta.base, spawn: exportSpawn(G), time, baseMap,
    });
  } catch {
    return fail('internal', 'Harita hazırlanamadı. Biraz bekleyip tekrar dene.');
  }
  if (!res.ok) {
    return {
      ok: false, map: null, meta: null, errors: res.errors && res.errors.length ? res.errors : ['Harita kurallara uymuyor.'], codes: res.codes || [], error: (res.errors && res.errors[0]) || 'Harita kurallara uymuyor.',
    };
  }
  const st = res.stats || {};
  return {
    ok: true,
    map: res.map,
    meta: {
      title,
      desc,
      blockCount: st.blockCount || 0,
      spawn: res.map.spawn.slice(),
      time: res.map.time,
      base: res.map.base,
      bytes: res.bytes,
      chunkCount: st.chunkCount || 0,
      encodedBytes: st.encodedBytes || 0,
    },
    errors: [],
    codes: [],
  };
}

/** İnşa/harita zaman kilidi: haritanın günün saatini değiştirir ('gündüz'|'gece'|'gün batımı'). */
export function setMapTime(G, name) {
  if (G.mode === 'macera' || MAP_TIMES.indexOf(name) < 0) return null;
  if (G.mapMeta) G.mapMeta.time = name;
  if (G.clock) {
    setClockPhase(G.clock, mapTimePhase(name));
    G.clock.frozen = true;
  }
  return name;
}
