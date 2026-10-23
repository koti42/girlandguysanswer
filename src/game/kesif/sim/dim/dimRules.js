/*
 * KEŞİF sim — boyut kuralları: kırma/yerleştirme koruması (saf; worker-güvenli). Sözleşme §1.6, §5.
 *
 *   canBreak(world, x, y, z, oldId)  → {ok, reason, message}
 *   canPlace(world, x, y, z, newId)  → {ok, reason, message}
 *   checkSetBlock(world, x, y, z, oldId, newId) → {ok, reason, message}   World.setBlock'un kullandığı birleşik kural
 *   editBudget(world) → {bytes, limit, frac, full}   kodlanmış düzenleme bütçesi (önbellekli)
 *   DENY_MESSAGES / denyMessage(reason)              'korumali' → "Neon Meridyen yapıları korunuyor.", 'doldu' → "Şehirde yer doldu."
 *
 * Kurallar (yalnız `dim.rules.protected` olan boyutta; overworld her zaman {ok:true}):
 *  - KIRMA serbest ⇔ oyuncu koymuş (`world.edits.get("x,y,z") === oldId`) VEYA şehir doğal dolgusu (`cityRules.isNaturalFill`).
 *    Diğer her şey şehir yapısıdır → reddedilir ('korumali').
 *  - YERLEŞTİRME yasak ⇔ `cityRules.isNoBuild` (yol koridoru y64..68, bina iç hacimleri, kapı önü 2 blok, Kapı Meydanı) → 'korumali';
 *    düzenleme bütçesi %90'a ulaştıysa → 'doldu'.
 *  - Şehir kuralları yoksa (üretici henüz yüklenmedi) yalnız bütçe kuralı işler.
 * World.setBlock bu kuralı yalnız oyuncu yazımlarında uygular: `record:false` (kapı/sistem geçişleri, kayıttan uygulama) ve `force:true` muaftır.
 */
import { DIM_SAVE_LIMITS, getDim } from './dimensions.js';
import { getCityRules } from './genRegistry.js';
import { encodeEdits } from '../saveEdits.js';
import { LIQUID_LUT } from '../blocks.js';

export const DENY_MESSAGES = Object.freeze({
  korumali: 'Neon Meridyen yapıları korunuyor.',
  doldu: 'Şehirde yer doldu.',
});

export const RULE_OK = Object.freeze({ ok: true, reason: null, message: null });
const DENIED = Object.freeze({
  korumali: Object.freeze({ ok: false, reason: 'korumali', message: DENY_MESSAGES.korumali }),
  doldu: Object.freeze({ ok: false, reason: 'doldu', message: DENY_MESSAGES.doldu }),
});

/** Bütçe önbelleği: düzenleme sayısı bu kadar değişince yeniden ölçülür (yerleştirme başına O(1) amortize). */
const BUDGET_STEP = 128;
const BUDGET_KEY = '_dimBudget';

export function denyMessage(reason) {
  return DENY_MESSAGES[reason] || '';
}

function rulesOf(world) {
  if (!world) return null;
  const d = world.dimDef || getDim(world.dim);
  return d && d.rules && d.rules.protected ? d : null;
}

/** Kodlanmış düzenleme boyutu (bayt ≈ anahtar + değer + ayraç; saveEnvelope'un yaklaşımıyla aynı). */
export function measureEdits(world) {
  const enc = encodeEdits(world.edits, world.yMin);
  let bytes = 0;
  const ks = Object.keys(enc.chunks);
  for (let i = 0; i < ks.length; i++) bytes += ks[i].length + enc.chunks[ks[i]].length + 6;
  return bytes;
}

export function editBudget(world) {
  const limit = DIM_SAVE_LIMITS.edits;
  const n = world && world.edits ? world.edits.size : 0;
  let c = world ? world[BUDGET_KEY] : null;
  if (!c || Math.abs(n - c.n) >= BUDGET_STEP) {
    c = { n, bytes: n === 0 ? 0 : measureEdits(world) };
    if (world) world[BUDGET_KEY] = c;
  }
  // önbellekten sonra eklenenler için güvenli üst sınır: hücre başına en çok ~12 bayt
  const bytes = c.bytes + Math.max(0, n - c.n) * 12;
  const frac = bytes / limit;
  return { bytes, limit, frac, full: frac >= DIM_SAVE_LIMITS.editFullFrac };
}

export function canBreak(world, x, y, z, oldId) {
  if (rulesOf(world) === null || !(oldId > 0)) return RULE_OK;
  if (world.edits && world.edits.get(x + ',' + y + ',' + z) === oldId) return RULE_OK; // oyuncu koydu
  const cr = getCityRules(world);
  if (cr === null) return RULE_OK;
  return cr.isNaturalFill(x, y, z) ? RULE_OK : DENIED.korumali;
}

export function canPlace(world, x, y, z, newId) {
  if (rulesOf(world) === null || !(newId > 0)) return RULE_OK;
  const cr = getCityRules(world);
  if (cr !== null && cr.isNoBuild(x, y, z)) return DENIED.korumali;
  if (editBudget(world).full) return DENIED.doldu;
  return RULE_OK;
}

/**
 * Birleşik kural: id===0 → kırma; eski hücre boş/sıvı → yalnız yerleştirme; aksi (blok değiştirme) → kırma + yerleştirme.
 */
export function checkSetBlock(world, x, y, z, oldId, newId) {
  if (rulesOf(world) === null) return RULE_OK;
  if (newId === 0) return canBreak(world, x, y, z, oldId);
  if (oldId === 0 || LIQUID_LUT[oldId] === 1) return canPlace(world, x, y, z, newId);
  const b = canBreak(world, x, y, z, oldId);
  return b.ok ? canPlace(world, x, y, z, newId) : b;
}
