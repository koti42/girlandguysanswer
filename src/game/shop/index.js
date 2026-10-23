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
import { KESIF, KESIF_BADGES, KESIF_KIND_INFO, KESIF_KINDS, kesifSwatches } from './designs/kesif.js';

export { FRAMES, MINIS, TITLES, ICONS, RARITY, KESIF, KESIF_BADGES, KESIF_KIND_INFO, KESIF_KINDS, kesifSwatches };

/** Kozmetik kuşanma yuvaları (PUT /game/shop/equip gövdesindeki anahtarlar). */
export const COSMETIC_SLOTS = ['frame', 'mini_avatar', 'title'];

/**
 * Keşif Koleksiyonu kuşanma yuvaları (PUT /game/shop/equip gövdesinde iç içe `kesif: {yuva: anahtar|null}`).
 * Yuva adı = anahtar öneki = tasarımın `kind`ı. COSMETIC_SLOTS'a KARIŞMAZ: profilde/herkese açık
 * yüzeylerde görünmez (Keşif yükü özeldir), yalnız oyun motoru okur.
 */
export const KESIF_SLOTS = KESIF_KINDS;

/** Mağaza kategorileri: sekme sırası, Türkçe adı ve kategori ikonu (ICONS anahtarı). */
export const SHOP_CATEGORIES = [
    { key: 'frame', name: 'Profil Çerçeveleri', short: 'Çerçeve', icon: 'frame' },
    { key: 'mini_avatar', name: 'Mini Avatarlar', short: 'Mini', icon: 'mini' },
    { key: 'title', name: 'Unvanlar', short: 'Unvan', icon: 'title' },
    { key: 'kesif', name: 'Keşif Koleksiyonu', short: 'Keşif', icon: 'compass' },
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
for (const d of [...FRAMES, ...MINIS, ...TITLES, ...KESIF, ...CONSUMABLES]) {
    if (d && typeof d.id === 'string') REGISTRY.set(d.id, d);
}

const BY_CATEGORY = {
    frame: FRAMES,
    mini_avatar: MINIS,
    title: TITLES,
    kesif: KESIF,
    consumable: CONSUMABLES,
};

/*
 * Keşif dalgası (GAME_SHOP_KESIF1): sunucu bayrağı kapalıyken bu 46 anahtar katalogda
 * HİÇ görünmez. İstemci yalnız sunucunun döndürdüğünü çizer; bu küme yalnız sunucusuz
 * yüzeylerde (misafir statik kataloğu) dalga dışı bırakmak içindir.
 */
export const KESIF_WAVE_KEYS = new Set(
    [
        'frame:neon-meridyen', 'frame:veri-cipi', 'frame:portal-halkasi', 'frame:gece-pazari', 'frame:diyar-isigi',
        'mini:minik-cip', 'mini:kurye-robotu', 'mini:suzulen-tahta', 'mini:neon-kedi', 'mini:portal-minik', 'mini:holo-balina',
        'title:neon-gezgin', 'title:portal-ustasi', 'title:sehir-kuryesi', 'title:cip-avcisi', 'title:usta-mimar', 'title:diyar-kasifi',
    ].concat(KESIF.map((d) => d.id))
);

export const isKesifWaveKey = (key) => KESIF_WAVE_KEYS.has(key);

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

/** Anahtardan kategori çıkarımı (`frame:` / `mini:` / `title:` / `ticket:` / Keşif önekleri / karakter parçası). */
export function categoryOfKey(key) {
    if (typeof key !== 'string') return null;
    const design = getDesign(key);
    if (design) return design.category;
    const prefix = key.split(':')[0];
    if (prefix === 'frame') return 'frame';
    if (prefix === 'mini') return 'mini_avatar';
    if (prefix === 'title') return 'title';
    if (prefix === 'ticket') return 'consumable';
    if (KESIF_SLOTS.includes(prefix)) return 'kesif';
    if (['hair', 'top', 'bottom', 'shoes', 'acc', 'trail'].includes(prefix)) return 'avatar_part';
    return null;
}

/** Kategori -> kuşanma yuvası (kozmetik değilse null). */
export function slotOfCategory(category) {
    return COSMETIC_SLOTS.includes(category) ? category : null;
}

/** Keşif öğesinin yuvası (tasarımın `kind`ı); kodda tasarımı yoksa önekten; Keşif değilse null. */
export function kesifSlotOfKey(key) {
    if (typeof key !== 'string') return null;
    const design = getDesign(key);
    if (design) return design.category === 'kesif' ? design.kind : null;
    const prefix = key.split(':')[0];
    return KESIF_SLOTS.includes(prefix) && /^[a-z_]{1,16}:[a-z0-9-]{1,40}$/.test(key) ? prefix : null;
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

/** Boş Keşif yükü (altı yuva da varsayılan görünüm). */
export const emptyKesifLoadout = () => Object.fromEntries(KESIF_SLOTS.map((s) => [s, null]));

/**
 * GET /game/kesif/loadout ya da kuşanma yanıtındaki `kesif_loadout` nesnesini güvenli biçime getirir:
 * yalnız altı bilinen yuva; değer yalnız o yuvanın tasarımı olan bilinen anahtar, aksi hâlde null.
 * `{ loadout: {...} }` zarfı da kabul edilir.
 */
export function normalizeKesifLoadout(input) {
    const out = emptyKesifLoadout();
    const src = input && typeof input === 'object' && input.loadout && typeof input.loadout === 'object' ? input.loadout : input;
    if (!src || typeof src !== 'object') return out;
    for (const slot of KESIF_SLOTS) {
        const key = src[slot];
        const design = getDesign(key);
        out[slot] = design && design.category === 'kesif' && design.kind === slot ? key : null;
    }
    return out;
}

/**
 * Misafir için statik katalog önizlemesi (sunucusuz): yalnızca koddaki
 * tasarımlar; fiyat/sahiplik bilinmez. Biçim GET /game/shop `categories`
 * ile aynı ki aynı ızgara çizilebilsin. Keşif dalgasının 46 öğesi yalnız
 * `{ wave: true }` ile eklenir (sunucu bayrağı misafire bilinmez).
 */
export function staticCatalog({ wave = false } = {}) {
    return SHOP_CATEGORIES.filter((c) => BY_CATEGORY[c.key])
        .map((c) => ({ c, list: BY_CATEGORY[c.key].filter((d) => wave || !KESIF_WAVE_KEYS.has(d.id)) }))
        .filter(({ list }) => list.length > 0)
        .map(({ c, list }) => ({
            key: c.key,
            name: c.name,
            items: list.map((d) => ({
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
