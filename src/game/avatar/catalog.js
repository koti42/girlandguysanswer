/*
 * Oyun karakteri (avatar) kataloğu: stiller, renkler, Türkçe etiketler.
 *
 * Saf veri + saf fonksiyonlar; DOM/three bağımlılığı yok. Aynı dosya mobil
 * uygulamaya (girlandguysanswerMobile/src/game/avatar/catalog.js) birebir
 * kopyalanır. Kilitler ve fiyatlar burada DEĞİL, backend'de
 * (config/game.php → avatar.items): istemci kataloğu yalnızca görsel tarafı
 * bilir, neyin açık olduğunu sunucu söyler.
 */

export const AVATAR_VERSION = 1;

export const BODIES = [
    { id: 'kiz', label: 'Kız' },
    { id: 'erkek', label: 'Erkek' },
];

// Açıktan koyuya.
export const SKIN_TONES = ['#FFE3CC', '#F6CBA5', '#E2AA80', '#C98B5B', '#94603A', '#5E3B22'];

export const HAIR_COLORS = [
    '#1F1A17', // siyah
    '#4A2C1D', // koyu kahve
    '#7B4A2A', // kahve
    '#B07A47', // kumral
    '#E3B868', // sarı
    '#F4E2B4', // platin
    '#B23A26', // kızıl
    '#F06CA8', // pembe
    '#7C6CF2', // mor
    '#22C7BE', // turkuaz
];

export const CLOTH_COLORS = [
    '#FF6B6B', // mercan
    '#EC4899', // pembe
    '#8B5CF6', // mor
    '#4F46E5', // çivit
    '#0EA5E9', // gök mavisi
    '#14B8A6', // turkuaz
    '#22C55E', // yeşil
    '#FACC15', // sarı
    '#F97316', // turuncu
    '#DC2626', // kırmızı
    '#1F2937', // antrasit
    '#F3F4F6', // beyaz
];

export const STYLES = {
    hair: [
        { id: 'kisa', label: 'Kısa' },
        { id: 'dalgali', label: 'Dalgalı' },
        { id: 'atkuyrugu', label: 'At Kuyruğu' },
        { id: 'uzun', label: 'Uzun' },
        { id: 'topuz', label: 'Topuz' },
        { id: 'orgu', label: 'Örgü' },
        { id: 'kivircik', label: 'Kıvırcık' },
        { id: 'mohawk', label: 'Mohawk' },
    ],
    top: [
        { id: 'hoodie', label: 'Kapüşonlu' },
        { id: 'tisort', label: 'Tişört' },
        { id: 'ceket', label: 'Deri Ceket' },
        { id: 'forma', label: 'Forma' },
        { id: 'kazak', label: 'Kazak' },
    ],
    bottom: [
        { id: 'jean', label: 'Kot' },
        { id: 'esofman', label: 'Eşofman' },
        { id: 'sort', label: 'Şort' },
        { id: 'etek', label: 'Etek' },
    ],
    shoes: [
        { id: 'spor', label: 'Spor' },
        { id: 'bot', label: 'Bot' },
        { id: 'neon', label: 'Neon Sneaker' },
    ],
    acc: [
        { id: 'none', label: 'Yok' },
        { id: 'sapka', label: 'Şapka' },
        { id: 'bere', label: 'Bere' },
        { id: 'gozluk', label: 'Gözlük' },
        { id: 'gunes', label: 'Güneş Gözlüğü' },
        { id: 'kulaklik', label: 'Kulaklık' },
        { id: 'kedi', label: 'Kedi Kulağı' },
        { id: 'tac', label: 'Taç' },
    ],
    trail: [
        { id: 'none', label: 'Yok' },
        { id: 'kalp', label: 'Kalp İzi' },
        { id: 'yildiz', label: 'Yıldız Tozu' },
        { id: 'neon', label: 'Neon Şerit' },
        { id: 'gokkusagi', label: 'Gökkuşağı' },
    ],
};

// Editördeki sekme sırası ve başlıkları.
export const SLOTS = [
    { id: 'body', label: 'Vücut' },
    { id: 'skin', label: 'Ten' },
    { id: 'hair', label: 'Saç' },
    { id: 'top', label: 'Üst' },
    { id: 'bottom', label: 'Alt' },
    { id: 'shoes', label: 'Ayakkabı' },
    { id: 'acc', label: 'Aksesuar' },
    { id: 'trail', label: 'Koşu İzi' },
];

const styleIds = (slot) => STYLES[slot].map((s) => s.id);

/** "slot:style" — backend öğe anahtarıyla aynı biçim. */
export const itemKey = (slot, style) => `${slot}:${style}`;

export function styleLabel(slot, style) {
    return STYLES[slot]?.find((s) => s.id === style)?.label ?? style;
}

/** Hiç kaydetmemiş kullanıcının karakteri; vücut cinsiyetten. */
export function defaultAvatar(gender) {
    const kiz = gender === 'female';
    return {
        v: AVATAR_VERSION,
        body: kiz ? 'kiz' : 'erkek',
        skin: 1,
        hair: { style: kiz ? 'atkuyrugu' : 'kisa', color: kiz ? 1 : 0 },
        top: { style: 'hoodie', color: kiz ? 0 : 4 },
        bottom: { style: 'jean', color: 3 },
        shoes: { style: 'spor', color: 11 },
        acc: 'none',
        trail: 'none',
    };
}

const intIn = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
const pick = (v, ids, fallback) => (ids.includes(v) ? v : fallback);
const color = (v, max, fallback) => (intIn(v, max) ? v : fallback);

/**
 * Her türlü girdiyi geçerli bir yapılandırmaya çevirir (eksik/bozuk alan
 * varsayılana düşer). Sunucudan gelen veriyi göstermeden önce kullanılır;
 * kilit kontrolü yapmaz.
 */
export function normalizeAvatar(input, gender) {
    const d = defaultAvatar(gender);
    const a = input && typeof input === 'object' ? input : {};
    const part = (slot, maxColor) => {
        const p = a[slot] && typeof a[slot] === 'object' ? a[slot] : {};
        return {
            style: pick(p.style, styleIds(slot), d[slot].style),
            color: color(p.color, maxColor, d[slot].color),
        };
    };
    return {
        v: AVATAR_VERSION,
        body: pick(a.body, BODIES.map((b) => b.id), d.body),
        skin: color(a.skin, SKIN_TONES.length - 1, d.skin),
        hair: part('hair', HAIR_COLORS.length - 1),
        top: part('top', CLOTH_COLORS.length - 1),
        bottom: part('bottom', CLOTH_COLORS.length - 1),
        shoes: part('shoes', CLOTH_COLORS.length - 1),
        acc: pick(a.acc, styleIds('acc'), d.acc),
        trail: pick(a.trail, styleIds('trail'), d.trail),
    };
}

/** Kesin şema kontrolü (normalize etmeden): sunucuya göndermeden önce. */
export function isValidAvatar(a) {
    if (!a || typeof a !== 'object' || a.v !== AVATAR_VERSION) return false;
    const partOk = (slot, maxColor) =>
        a[slot] && styleIds(slot).includes(a[slot].style) && intIn(a[slot].color, maxColor);
    return (
        BODIES.some((b) => b.id === a.body) &&
        intIn(a.skin, SKIN_TONES.length - 1) &&
        partOk('hair', HAIR_COLORS.length - 1) &&
        partOk('top', CLOTH_COLORS.length - 1) &&
        partOk('bottom', CLOTH_COLORS.length - 1) &&
        partOk('shoes', CLOTH_COLORS.length - 1) &&
        styleIds('acc').includes(a.acc) &&
        styleIds('trail').includes(a.trail)
    );
}

/** Yapılandırmanın kullandığı stil öğeleri ("slot:style"); kilit kontrolü için. */
export function usedItemKeys(a) {
    return [
        itemKey('hair', a.hair.style),
        itemKey('top', a.top.style),
        itemKey('bottom', a.bottom.style),
        itemKey('shoes', a.shoes.style),
        itemKey('acc', a.acc),
        itemKey('trail', a.trail),
    ];
}
