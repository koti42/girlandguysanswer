/*
 * KEŞİF sim — bulut kaydı zarfı (saf). PUT /game/kesif/save gövdesi ≤ 1,5 MB (config game_kesif.cloud_save_max_bytes).
 * Sığmıyorsa sırayla: (v3) neon halk/NPC → araç → varlıklar → prop → düzenlemeler; sonra varlıklar + düşen eşyalar → harita sisi (mapReveal) → sandık içerikleri → düzenlemeler
 * (oyuncudan EN UZAK chunk'tan başlayarak). Kesilen her aşama `stripped`ta, kayıt `truncated:true` işaretlenir.
 */
import { estimateSaveSize } from './save.js';
import { isObj } from './saveSanitize.js';
import { NEON_TRIM_STAGES, neonEditsBytes, trimNeonEdits } from './dim/dimSanitize.js';

export const CLOUD_MAX_BYTES = 1500000;
/** Sunucu yeniden kodlaması ve başlık payı için güvenlik aralığı. */
export const CLOUD_MARGIN = 4096;

/** Düzenleme parçası anahtarı "cx,cz,si" (v2) ya da "cx,cz": oyuncuya yatay uzaklığın karesi. */
function chunkDist(key, px, pz) {
  const p = key.split(',');
  const cx = Number(p[0]);
  const cz = Number(p[1]);
  const dx = cx * 16 + 8 - px;
  const dz = cz * 16 + 8 - pz;
  return dx * dx + dz * dz;
}

/**
 * Neon Meridyen (dims.neon) kırpması — overworld aşamalarından ÖNCE çalışır (overworld verisi asla önce kırpılmaz):
 * halk/NPC → araç → varlıklar → prop → düzenlemeler (oyuncuya en uzak chunk önce). Yalnız gerçekten bir şey kesilince `stripped`a
 * 'neon:<ad>' yazar. `s` yerinde (yüzeysel kopya üstünde) güncellenir; yeni bayt sayısını döner.
 */
function trimNeon(s, limit, bytes, stripped) {
  if (bytes <= limit || !isObj(s.dims) || !isObj(s.dims.neon)) return bytes;
  let b = bytes;
  let neon = s.dims.neon;
  const put = (n, name) => {
    neon = n;
    s.dims = Object.assign({}, s.dims, { neon });
    if (name) stripped.push(name);
    s.truncated = true;
    b = estimateSaveSize(s);
  };
  for (let i = 0; i < NEON_TRIM_STAGES.length && b > limit; i++) {
    const n2 = NEON_TRIM_STAGES[i].fn(neon);
    if (n2 !== null) put(n2, 'neon:' + NEON_TRIM_STAGES[i].name);
  }
  if (b > limit && isObj(neon.edits) && Object.keys(neon.edits).length > 0) {
    const pos = s.player && s.player.dim === 'neon' && Array.isArray(s.player.pos) ? [s.player.pos[0], s.player.pos[2]] : [0, 0];
    let total = 0;
    let keep = neonEditsBytes(neon.edits) - (b - limit);
    for (let it = 0; it < 6 && b > limit; it++) {
      const r = trimNeonEdits(neon.edits, pos, Math.max(0, keep));
      if (r.dropped > 0) {
        total += r.dropped;
        put(Object.assign({}, neon, { edits: r.edits }), null);
      }
      keep -= (b - limit) + 16;
      if (Object.keys(neon.edits).length === 0) break;
    }
    if (total > 0) stripped.push('neon:edits:' + total);
  }
  return b;
}

/**
 * Kaydı (serializeGame çıktısı) buluta uygun hale getirir. Girdi DEĞİŞTİRİLMEZ (yüzeysel kopya).
 * Döner {ok, payload (JSON metni), bytes, truncated, stripped:[...], save, maxBytes}; hiçbir şekilde sığmazsa
 * ok:false, code:'too_large'.
 */
export function buildCloudEnvelope(save, opts) {
  const o = opts || {};
  const maxBytes = Number.isFinite(o.maxBytes) && o.maxBytes > 1000 ? o.maxBytes : CLOUD_MAX_BYTES;
  const limit = maxBytes - CLOUD_MARGIN;
  if (!isObj(save)) return { ok: false, code: 'format', error: 'Kayıt geçersiz.', maxBytes };
  const s = Object.assign({}, save);
  const stripped = [];
  let bytes = estimateSaveSize(s);

  const stage = (name, fn) => {
    if (bytes <= limit) return;
    fn();
    stripped.push(name);
    s.truncated = true;
    bytes = estimateSaveSize(s);
  };

  bytes = trimNeon(s, limit, bytes, stripped);

  stage('entities', () => {
    s.entities = [];
    s.drops = [];
  });
  stage('mapReveal', () => {
    if (isObj(s.progression)) s.progression = Object.assign({}, s.progression, { mapReveal: '' });
  });
  stage('chests', () => {
    s.chests = {};
  });
  if (bytes > limit && isObj(s.edits)) {
    let pos = s.player && Array.isArray(s.player.pos) ? s.player.pos : [0, 64, 0];
    // oyuncu şehirdeyse overworld düzenlemeleri overworld konumuna göre ölçülür (şehir koordinatı onlarla ilgisizdir)
    if (s.player && s.player.dim === 'neon' && isObj(s.dimMeta) && Array.isArray(s.dimMeta.overworldPos)) pos = s.dimMeta.overworldPos;
    const keys = Object.keys(s.edits).sort((a, b) => chunkDist(b, pos[0], pos[2]) - chunkDist(a, pos[0], pos[2]));
    const edits = Object.assign({}, s.edits);
    let dropped = 0;
    // Her adımda yalnız kaldırılan chunk'ın uzunluğunu düşerek yaklaşık boyutu izle, sonda kesin ölç.
    let approx = bytes;
    for (let i = 0; i < keys.length && approx > limit; i++) {
      approx -= keys[i].length + edits[keys[i]].length + 6;
      delete edits[keys[i]];
      dropped++;
    }
    if (dropped > 0) {
      s.edits = edits;
      stripped.push('edits:' + dropped);
      s.truncated = true;
      if (s.editStats) s.editStats = Object.assign({}, s.editStats, { chunks: Object.keys(edits).length, dropped });
      bytes = estimateSaveSize(s);
      // yaklaşım yetmediyse kesinleşene dek devam
      const rest = Object.keys(edits).sort((a, b) => chunkDist(b, pos[0], pos[2]) - chunkDist(a, pos[0], pos[2]));
      for (let i = 0; i < rest.length && bytes > limit; i++) {
        delete edits[rest[i]];
        stripped[stripped.length - 1] = 'edits:' + (dropped + i + 1);
        bytes = estimateSaveSize(s);
      }
    }
  }
  if (bytes > limit) {
    return {
      ok: false, code: 'too_large', error: 'Kayıt buluta sığmıyor.', bytes, truncated: true, stripped, maxBytes,
    };
  }
  let payload;
  try {
    payload = JSON.stringify(s);
  } catch {
    return { ok: false, code: 'format', error: 'Kayıt serileştirilemedi.', maxBytes };
  }
  return {
    ok: true, payload, bytes: estimateSaveSize(s), truncated: stripped.length > 0, stripped, save: s, maxBytes,
  };
}

/** GET yanıtı ({save}) ya da doğrudan kayıt nesnesi → kayıt nesnesi | null. */
export function openCloudEnvelope(body) {
  let b = body;
  if (typeof b === 'string') {
    try {
      b = JSON.parse(b);
    } catch {
      return null;
    }
  }
  if (!isObj(b)) return null;
  if (isObj(b.save) && b.v === undefined) return b.save;
  return b.v !== undefined ? b : null;
}
