/**
 * Jeton Mağazası — tasarım kayıt defteri (SPEC_V2 §F.2).
 *
 * designs/*.js saf veridir ve değiştirilmez; burası yalnızca anahtar ->
 * tasarım eşlemesini ve kategori listelerini tek yerden sunar. Mağaza
 * arayüzü, profil kozmetikleri, liderlik satırları ve admin önizlemesi
 * tasarımı her zaman buradan alır: kullanıcıdan/sunucudan SVG ya da serbest
 * işaretleme ALINMAZ, sunucu yalnızca anahtar (ör. `frame:neon-gece`) taşır.
 * Bilinmeyen anahtar `null` döner; çizen taraf hiçbir şey çizmez.
 */

import { FRAMES } from './designs/frames.js';
import { MINIS } from './designs/minis.js';
import { TITLES, ICONS, RARITY } from './designs/titles.js';

export { FRAMES, MINIS, TITLES, ICONS, RARITY };

/** Kozmetik kuşanma yuvaları (PUT /game/shop/equip gövdesindeki anahtarlar). */
export const COSMETIC_SLOTS = ['frame', 'mini_avatar', 'title'];

/** Mağaza kategorileri: sekme sırası, Türkçe adı ve kategori ikonu (ICONS anahtarı). */
export const SHOP_CATEGORIES = [
    { key: 'frame', name: 'Profil Çerçeveleri', short: 'Çerçeve', icon: 'frame' },
    { key: 'mini_avatar', name: 'Mini Avatarlar', short: 'Mini', icon: 'mini' },
    { key: 'title', name: 'Unvanlar', short: 'Unvan', icon: 'title' },
    { key: 'avatar_part', name: 'Karakter Parçaları', short: 'Karakter', icon: 'avatar' },
    { key: 'consumable', name: 'Biletler', short: 'Bilet', icon: 'ticket' },
];

/** Mesaj Bileti öğe anahtarı (F.6). */
export const TICKET_MESSAGE_KEY = 'ticket:message';

/** Tüketilebilir öğelerin (koddaki) sabit sunumu — sanatı ICONS'tan gelir. */
const CONSUMABLES = [
    {
        id: TICKET_MESSAGE_KEY,
        category: 'consumable',
        name: 'Mesaj Bileti',
        rarity: 'epic',
        icon: 'ticket',
        description:
            'Mesajlarını kapatmış ya da yalnız takipçilerine açmış birine tek bir saygılı mesaj gönder. Engel aşılamaz; alıcı yanıtlamazsa ikinci mesaj gönderilemez.',
    },
];

const REGISTRY = new Map();
for (const d of [...FRAMES, ...MINIS, ...TITLES, ...CONSUMABLES]) {
    if (d && typeof d.id === 'string') REGISTRY.set(d.id, d);
}

const BY_CATEGORY = {
    frame: FRAMES,
    mini_avatar: MINIS,
    title: TITLES,
    consumable: CONSUMABLES,
};

/** Anahtarın tasarımı (frame/mini/title/consumable); yoksa null. */
export function getDesign(key) {
    if (typeof key !== 'string' || key.length === 0 || key.length > 64) return null;
    return REGISTRY.get(key) ?? null;
}

/** Koddaki tasarımı olan tüm anahtarlar (admin "yeni ürün" seçimi için). */
export function designKeys() {
    return [...REGISTRY.keys()];
}

/** Kategorideki tasarımlar (koddaki sırayla). avatar_part için boş dizi. */
export function listByCategory(category) {
    return BY_CATEGORY[category] ? [...BY_CATEGORY[category]] : [];
}

/** Anahtardan kategori çıkarımı (`frame:` / `mini:` / `title:` / `ticket:` / karakter parçası). */
export function categoryOfKey(key) {
    if (typeof key !== 'string') return null;
    const design = getDesign(key);
    if (design) return design.category;
    const prefix = key.split(':')[0];
    if (prefix === 'frame') return 'frame';
    if (prefix === 'mini') return 'mini_avatar';
    if (prefix === 'title') return 'title';
    if (prefix === 'ticket') return 'consumable';
    if (['hair', 'top', 'bottom', 'shoes', 'acc', 'trail'].includes(prefix)) return 'avatar_part';
    return null;
}

/** Kategori -> kuşanma yuvası (kozmetik değilse null). */
export function slotOfCategory(category) {
    return COSMETIC_SLOTS.includes(category) ? category : null;
}

/** Nadirlik stili; bilinmeyen değerde Sıradan. */
export function rarityOf(rarity) {
    return RARITY[rarity] || RARITY.common;
}

/** Profil/liderlik yanıtındaki `cosmetics` nesnesini güvenli biçime getirir. */
export function normalizeCosmetics(input) {
    const out = { frame: null, mini_avatar: null, title: null };
    if (!input || typeof input !== 'object') return out;
    for (const slot of COSMETIC_SLOTS) {
        const key = input[slot];
        const design = getDesign(key);
        out[slot] = design && design.category === slot ? key : null;
    }
    return out;
}

/**
 * Misafir için statik katalog önizlemesi (sunucusuz): yalnızca koddaki
 * tasarımlar; fiyat/sahiplik bilinmez. Biçim GET /game/shop `categories`
 * ile aynı ki aynı ızgara çizilebilsin.
 */
export function staticCatalog() {
    return SHOP_CATEGORIES.filter((c) => BY_CATEGORY[c.key]).map((c) => ({
        key: c.key,
        name: c.name,
        items: BY_CATEGORY[c.key].map((d) => ({
            key: d.id,
            category: d.category,
            name: d.name,
            description: d.description || '',
            price: null,
            rarity: d.rarity,
            unlock: { type: 'price' },
            owned: false,
            quantity: 0,
            unlocked: true,
            available_until: null,
            is_featured: false,
            is_active: true,
        })),
    }));
}
