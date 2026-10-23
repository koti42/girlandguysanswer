/*
 * KEŞİF — Mağaza görünümü (Keşif Koleksiyonu) denetleyicisi: yük (loadout) → skin kümesi → tüketiciler. three/DOM yok.
 *
 *   createCosmetics(G, loadout?) → G.cosmetics = {
 *     skins            donmuş skin kümesi (skins.resolveSkinSet; boşsa key '')    loadout   temizlenmiş yük kopyası | null
 *     set(loadout, {preview}?)   yükü değiştirir; yaşayan dünyayı YENİDEN KURMADAN tüketicilere uygular (karakter/birinci şahıs eşyası, sırt jetpack'i,
 *                                portal renkleri, parçacık renkleri); preview:true ise küçük bir 'gecis' önizleme efekti oynar
 *     tick()             kare başına ucuz denetim: kalite kademesi (low) / kısıtlı hareket değişirse hareketli görünümleri açar/kapar
 *     arrive(phase)      'gecis' efekti: phase 0 çıkış, 1 varış/doğuş (skin yoksa hiçbir şey yapmaz)
 *     dispose()
 *   }
 *   portalHex(G, 'mavi'|'turuncu') → portal parçacık rengi (skin varsa onun, yoksa eski sabit)
 *
 * Yalnız GÖRÜNÜM: simülasyon, fizik, istatistik, kayıt ve belirlenimlilik değişmez (denetleyici G.sim/G.player/G.time'a YAZMAZ).
 * Geçersiz/bilinmeyen/bozuk her giriş sessizce varsayılan görünüme düşer. Misafir/çıkış yapmış oyuncu: yük yok → eski görünüm.
 */
import { SKIN_SLOTS, resolveSkinSet, emptySkinSet, clearSkinCaches } from './skins.js';
import { pruneHeldSkinCache } from './heldItems.js';

const DEFAULT_HEX = { mavi: 0x3a8fff, turuncu: 0xff9a3a };

/** Dış yükü (herhangi bir nesne) yalnız 6 bilinen yuva ve kısa metin değerleriyle kopyalar; yoksa null. */
export function cleanLoadout(input) {
  const src = input && typeof input === 'object' ? (input.loadout && typeof input.loadout === 'object' ? input.loadout : input) : null;
  if (!src) return null;
  const out = {};
  let any = false;
  for (let i = 0; i < SKIN_SLOTS.length; i++) {
    const v = src[SKIN_SLOTS[i]];
    out[SKIN_SLOTS[i]] = typeof v === 'string' && v.length <= 64 ? v : null;
    if (out[SKIN_SLOTS[i]]) any = true;
  }
  return any ? Object.freeze(out) : null;
}

export function portalHex(G, name) {
  const sk = G && G.cosmetics && G.cosmetics.skins ? G.cosmetics.skins.portal : null;
  if (!sk) return DEFAULT_HEX[name] === undefined ? 0xffffff : DEFAULT_HEX[name];
  return name === 'mavi' ? sk.a.c : sk.b.c;
}

export function createCosmetics(G, initial) {
  let loadout = cleanLoadout(initial);
  let env = { tier: 'high', reduced: false };
  let skins = emptySkinSet();
  let disposed = false;

  // kare başına ucuz denetim: tahsis yok (ilkel değerler)
  function tierNow() {
    const q = G.quality && G.quality.settings ? G.quality.settings : null;
    const t = q ? q.effTier || q.tier : null;
    return t === 'low' || t === 'medium' || t === 'high' ? t : 'high';
  }
  const reducedNow = () => !!(G.reducedMotion || G.accessibility);

  function guard(fn) {
    try { fn(); } catch (e) {
      if (G.opts && G.opts.strictSystems) throw e;
    }
  }

  function apply() {
    guard(() => { if (G.character && G.character.setSkins) G.character.setSkins(skins.key ? skins : null); });
    guard(() => { if (G.viewModel && G.viewModel.setSkins) G.viewModel.setSkins(skins.key ? skins : null); });
    guard(() => {
      const tv = G.techVisuals;
      if (!tv) return;
      if (tv.backpack && tv.backpack.setSkins) tv.backpack.setSkins(skins.key ? skins : null);
      if (tv.portal && tv.portal.setPalette) tv.portal.setPalette(skins.portal);
    });
    guard(() => { if (G.particles && G.particles.setSkin) G.particles.setSkin(skins.key ? skins : null); });
    // kullanılmayan skin malzemelerini at (önbellek sınırsız büyümesin); etkin skin'ler kalır
    guard(() => {
      const active = new Set();
      ['portal', 'alet', 'asa', 'jet'].forEach((s) => { if (skins[s]) active.add(skins[s].key); });
      pruneHeldSkinCache(active);
    });
  }

  function resolve() {
    env = { tier: tierNow(), reduced: reducedNow() };
    const next = resolveSkinSet(loadout, env);
    const changed = next.key !== skins.key;
    skins = next;
    return changed;
  }

  function arrive(phase) {
    if (disposed || !skins.gecis || !G.body) return;
    guard(() => G.fx('gecisBurst', { x: G.body.x, y: G.body.y + 0.1, z: G.body.z }, phase ? 1 : 0));
  }

  const api = {
    get skins() { return skins; },
    get loadout() { return loadout; },
    get env() { return env; },
    set(next, o) {
      if (disposed) return false;
      loadout = cleanLoadout(next);
      const changed = resolve();
      if (changed) apply();
      if (o && o.preview) arrive(1);
      return changed;
    },
    tick() {
      if (disposed) return;
      if (tierNow() === env.tier && reducedNow() === env.reduced) return;
      if (resolve()) apply();
    },
    arrive,
    apply,
    dispose() {
      disposed = true;
      skins = emptySkinSet();
      clearSkinCaches();
    },
  };
  resolve();
  return api;
}
