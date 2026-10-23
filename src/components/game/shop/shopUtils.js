/*
 * Mağaza arayüzü yardımcıları: öğe durumu, metinler, hata sınıflandırma,
 * yerel durum güncellemeleri. Saf fonksiyonlar (test edilebilir).
 */

import {
    COSMETIC_SLOTS,
    KESIF_BADGES,
    KESIF_KIND_INFO,
    KESIF_SLOTS,
    RARITY,
    SHOP_CATEGORIES,
    getDesign,
    kesifSlotOfKey,
    normalizeCosmetics,
    normalizeKesifLoadout,
} from '../../../game/shop';
import { shopError } from './shopError';

export { shopError };

export const CATEGORY_NAMES = Object.fromEntries(SHOP_CATEGORIES.map((c) => [c.key, c.name]));

/** Cüzdan işlem türleri (F.4 game_wallet_transactions.type). */
export const TX_LABELS = {
    earn_runner: 'Koşu ödülü',
    earn_tower: 'Kule ödülü',
    purchase: 'Mağaza alışverişi',
    admin_grant: 'Hediye jeton',
    admin_deduct: 'Jeton düzeltmesi',
    refund: 'İade',
    backfill: 'Geçmiş koşu jetonları',
    ticket_use: 'Mesaj Bileti kullanımı',
    kesif_reward: 'Keşif ödülü',
    kesif_slots: 'Keşif harita hakkı',
    profile_theme: 'Profil teması',
};

export const txLabel = (type) => TX_LABELS[type] || 'Cüzdan hareketi';

export const toInt = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

/** Kilit metni: seviye / rozet. */
export function lockText(unlock) {
    if (!unlock) return 'Kilitli';
    if (unlock.type === 'level') return `Seviye ${toInt(unlock.level, 1)}`;
    if (unlock.type === 'badge') return 'Rozetle açılır';
    return 'Kilitli';
}

export function lockHint(unlock) {
    if (unlock?.type === 'level') return `Oyun seviyen ${toInt(unlock.level, 1)} olunca açılır.`;
    if (unlock?.type === 'badge') {
        // Keşif rozetlerinin adı koddan bilinir; bilinmeyen rozet genel metne düşer.
        const name = Object.prototype.hasOwnProperty.call(KESIF_BADGES, unlock.badge) ? KESIF_BADGES[unlock.badge] : null;
        return name ? `“${name}” rozetini kazanınca açılır.` : 'İlgili rozeti kazanınca açılır.';
    }
    return 'Şu an açılamaz.';
}

/**
 * Bir öğenin arayüz durumu.
 * @param item      sunucu Item'ı
 * @param equipped  { frame, mini_avatar, title }
 * @param balance   cüzdan bakiyesi
 * @param now       ms (test için)
 * @param kesifLoadout  { portal, alet, asa, jet, arac, gecis } (Keşif öğeleri için kuşanma durumu)
 */
export function itemState(item, equipped = {}, balance = 0, now = Date.now(), kesifLoadout = null) {
    const category = item?.category;
    const consumable = category === 'consumable';
    const kesif = category === 'kesif';
    const kind = kesif ? kesifSlotOfKey(item?.key) : null;
    const cosmetic = COSMETIC_SLOTS.includes(category) || kesif;
    const quantity = Math.max(0, toInt(item?.quantity));
    // Sunucu `unlocked`ı "şu an kullanılabilir" anlamında verir: jetonlu öğede yalnızca
    // sahipken true. Kilit yalnızca seviye/rozet öğelerinde anlamlıdır; jetonlu öğe
    // sahip değilken `unlocked: false` gelir ama satın alınabilir.
    const unlockType = item?.unlock?.type || 'price';
    const gated = unlockType === 'level' || unlockType === 'badge';
    // Seviyesi/rozeti tutan öğe satın alınmadan giyilebilir: sahip gibi davranılır.
    const owned = consumable ? quantity > 0 : !!item?.owned || (gated && item?.unlocked === true);
    const isEquipped = !!(
        owned &&
        (kesif ? kind && kesifLoadout?.[kind] === item?.key : cosmetic && equipped?.[category] === item?.key)
    );
    const locked = !owned && gated;
    const until = item?.available_until ? Date.parse(item.available_until) : NaN;
    const expired = Number.isFinite(until) && until <= now;
    const inactive = item?.is_active === false || expired;
    const price = item?.price == null ? null : Math.max(0, toInt(item.price));
    // Kozmetik/karakter parçası bir kez alınır; tüketilebilir her zaman tekrar alınabilir
    const purchasable = !inactive && !gated && unlockType === 'price' && price != null && (consumable || !owned);
    const affordable = price != null && toInt(balance) >= price;
    return {
        category,
        consumable,
        cosmetic,
        kesif,
        kind,
        owned,
        quantity,
        equipped: isEquipped,
        locked,
        expired,
        inactive,
        price,
        free: price === 0,
        purchasable,
        affordable,
        untilMs: Number.isFinite(until) ? until : null,
    };
}

/** Kart/çekmece için kısa erişilebilir özet. */
export function itemA11ySummary(item, state, rarityLabel) {
    const parts = [item?.name, rarityLabel];
    if (state.equipped) parts.push('kuşanıldı');
    else if (state.owned && state.consumable) parts.push(`sende ${state.quantity} adet`);
    else if (state.owned) parts.push('sende');
    else if (state.locked) parts.push(`kilitli, ${lockText(item?.unlock).toLowerCase()}`);
    else if (state.inactive) parts.push('satışta değil');
    else if (state.price != null) parts.push(state.free ? 'ücretsiz' : `${state.price.toLocaleString('tr-TR')} jeton`);
    return parts.filter(Boolean).join(', ');
}

/** Satın alma hatasını kullanıcı metnine çevirir. */
export function buyErrorMessage(err) {
    const e = shopError(err, 'Satın alma tamamlanamadı. Lütfen tekrar dene.');
    if (e.reason === 'insufficient') return { ...e, message: 'Yeterli jetonun yok. Koşu ve kule oyunlarından jeton kazanabilirsin.' };
    if (e.status === 409) return { ...e, message: e.message || 'Bu öğe zaten sende.' };
    return e;
}

/** Mağaza yanıtını güvenli biçime getirir. */
export function normalizeShop(data) {
    const wallet = data?.wallet || {};
    const categories = Array.isArray(data?.categories) ? data.categories : [];
    return {
        wallet: {
            balance: Math.max(0, toInt(wallet.balance)),
            earned_total: Math.max(0, toInt(wallet.earned_total)),
            spent_total: Math.max(0, toInt(wallet.spent_total)),
        },
        featured: Array.isArray(data?.featured) ? data.featured.filter((i) => i && typeof i.key === 'string') : [],
        categories: categories
            .filter((c) => c && typeof c.key === 'string')
            .map((c) => ({
                key: c.key,
                name: c.name || CATEGORY_NAMES[c.key] || c.key,
                items: Array.isArray(c.items) ? c.items.filter((i) => i && typeof i.key === 'string') : [],
            })),
        equipped: normalizeCosmetics(data?.equipped),
        // Keşif yükü özeldir; sunucu (yeni) bu alanı dönmezse boş kalır, sayfa ayrıca sorar.
        kesifLoadout: normalizeKesifLoadout(data?.kesif_loadout ?? data?.kesif?.loadout),
        kesifKnown: data?.kesif_loadout != null || data?.kesif?.loadout != null,
        tickets: Math.max(0, toInt(data?.tickets)),
        player: { level: Math.max(1, toInt(data?.player?.level, 1)) },
    };
}

/** Satın alınan/güncellenen öğeyi vitrinde ve kategorilerde yerinde değiştirir. */
export function replaceItem(shop, item) {
    if (!shop || !item?.key) return shop;
    const swap = (list) => list.map((i) => (i.key === item.key ? { ...i, ...item } : i));
    return {
        ...shop,
        featured: swap(shop.featured),
        categories: shop.categories.map((c) => ({ ...c, items: swap(c.items) })),
    };
}

/** Anahtara göre öğe (vitrin + kategoriler). */
export function findItem(shop, key) {
    if (!shop || !key) return null;
    for (const c of shop.categories) {
        const hit = c.items.find((i) => i.key === key);
        if (hit) return hit;
    }
    return shop.featured.find((i) => i.key === key) || null;
}

/** Vitrinin geri sayım hedefi: en yakın available_until; yoksa null. */
export function featuredDeadline(featured, now = Date.now()) {
    let best = null;
    for (const i of featured || []) {
        const t = i?.available_until ? Date.parse(i.available_until) : NaN;
        if (Number.isFinite(t) && t > now && (best == null || t < best)) best = t;
    }
    return best;
}

/** Kısa kalan süre (kart rozeti; dakikada bir güncellenir): "3 gün", "5 sa", "12 dk". */
export function shortLeft(ms) {
    const m = Math.max(0, Math.floor(ms / 60000));
    if (m >= 1440) return `${Math.floor(m / 1440)} gün`;
    if (m >= 60) return `${Math.floor(m / 60)} sa`;
    return `${Math.max(1, m)} dk`;
}

/**
 * Misafir kataloğunda Keşif dalgasının gösterilip gösterilmeyeceği (VITE_SHOP_KESIF_GUEST=1).
 * Misafir sunucuya sormaz, dalga bayrağını bilemez: bayrak açılıp web yayınlandıktan sonra derleme anında açılır.
 */
export function guestKesifEnabled(env) {
    return !!env && env.VITE_SHOP_KESIF_GUEST === '1';
}

/* ------------------------------------------------------------ Keşif sekmesi: tür çipleri ve sıralama */

/** Tür çipleri: Tümü + altı yuva (anahtar önekine göre yerel süzgeç; sunucu öğe şekli değişmez). */
export const KESIF_CHIPS = [
    { key: 'all', label: 'Tümü' },
    ...KESIF_SLOTS.map((k) => ({ key: k, label: KESIF_KIND_INFO[k]?.label || k })),
];

export function filterByKesifKind(items, kind) {
    const list = Array.isArray(items) ? items : [];
    if (!kind || kind === 'all') return list;
    return list.filter((i) => kesifSlotOfKey(i?.key) === kind);
}

/** Sıralama seçenekleri: sunucu sırası (önerilen), fiyat artan, nadirlik (en nadir önce). */
export const SORTS = [
    { key: 'recommended', label: 'Önerilen' },
    { key: 'price', label: 'Fiyat (artan)' },
    { key: 'rarity', label: 'Nadirlik (en nadir önce)' },
];

const rarityOrder = (r) => (RARITY[r] ? RARITY[r].order : -1);

/**
 * Kararlı sıralama (yeni dizi döner; girdi değişmez). Fiyatı olmayanlar (rozet/seviye
 * kilidi, misafir) fiyat sıralamasında sona gider; eşitlikte sunucu sırası korunur.
 */
export function sortItems(items, mode) {
    const list = (Array.isArray(items) ? items : []).map((item, index) => ({ item, index }));
    if (mode === 'price') {
        const p = (i) => (i?.price == null ? Number.POSITIVE_INFINITY : toInt(i.price));
        list.sort((a, b) => p(a.item) - p(b.item) || a.index - b.index);
    } else if (mode === 'rarity') {
        list.sort((a, b) => rarityOrder(b.item?.rarity) - rarityOrder(a.item?.rarity) || a.index - b.index);
    }
    return list.map((x) => x.item);
}

/*
 * Oyun Merkezi "Mağaza" kartının vitrin ürünü: vitrinin ilk çizilebilir
 * ürünü (çerçeve / mini avatar / unvan; karakter parçasının kart görseli
 * yok); yoksa sabit bir tasarım. Görsel her zaman koddaki tasarımdan.
 */
const SHOWCASE_FALLBACK_KEY = 'frame:yildiz-tozu';

export function pickShowcase(featured) {
    for (const item of Array.isArray(featured) ? featured : []) {
        const d = getDesign(item?.key);
        if (d && (d.art || d.category === 'title')) return { key: item.key, design: d, live: true };
    }
    return { key: SHOWCASE_FALLBACK_KEY, design: getDesign(SHOWCASE_FALLBACK_KEY), live: false };
}
