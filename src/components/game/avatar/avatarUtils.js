/*
 * Karakter editörü ve kartı için saf yardımcılar (React yok; testlerde
 * doğrudan sınanır).
 *
 * Kilitler sunucudan (`GET /game/avatar` -> items) gelir; istemci yalnızca
 * gösterir. Kaydetme sunucuda yeniden denetlenir.
 */
import { STYLES, itemKey, normalizeAvatar, styleLabel, usedItemKeys } from '../../../game/avatar/catalog';
import { formatNumber } from '../gameUtils';

/** Stil seçilen sekmeler; body/skin yalnızca seçim (kilit yok). */
export const STYLE_SLOTS = ['hair', 'top', 'bottom', 'shoes', 'acc', 'trail'];
/** Rengi olan sekmeler. */
export const COLOR_SLOTS = ['hair', 'top', 'bottom', 'shoes'];

// Renk adları (erişilebilir ad + ipucu); sıra catalog.js paletleriyle aynı.
export const SKIN_NAMES = ['Çok açık', 'Açık', 'Buğday', 'Esmer', 'Koyu', 'Çok koyu'];
export const HAIR_COLOR_NAMES = ['Siyah', 'Koyu kahve', 'Kahve', 'Kumral', 'Sarı', 'Platin', 'Kızıl', 'Pembe', 'Mor', 'Turkuaz'];
export const CLOTH_COLOR_NAMES = [
    'Mercan', 'Pembe', 'Mor', 'Çivit', 'Gök mavisi', 'Turkuaz', 'Yeşil', 'Sarı', 'Turuncu', 'Kırmızı', 'Antrasit', 'Beyaz',
];

// Sekme / panel kimlikleri (aria-controls, aria-labelledby).
export const tabId = (base, slot) => `${base}-tab-${slot}`;
export const panelId = (base, slot) => `${base}-panel-${slot}`;

/** "slot:style" -> öğe. */
export function indexItems(items) {
    const map = new Map();
    for (const it of Array.isArray(items) ? items : []) {
        if (it && typeof it.key === 'string') map.set(it.key, it);
    }
    return map;
}

export function styleOf(config, slot) {
    return slot === 'acc' || slot === 'trail' ? config[slot] : config[slot]?.style;
}

export function withStyle(config, slot, style) {
    if (slot === 'acc' || slot === 'trail') return { ...config, [slot]: style };
    return { ...config, [slot]: { ...config[slot], style } };
}

export function withColor(config, slot, color) {
    if (slot === 'skin') return { ...config, skin: color };
    return { ...config, [slot]: { ...config[slot], color } };
}

/*
 * Öğenin kullanılabilirliği. Sunucu listesinde olmayan öğe (eski istemci /
 * yeni stil) kilitli sayılır: kaydetme zaten reddedilirdi.
 */
export function itemState(item) {
    if (!item) return { unlocked: false, kind: 'unknown', owned: false };
    const u = item.unlock || {};
    return {
        unlocked: !!item.unlocked,
        owned: !!item.owned,
        kind: u.type || 'free',
        price: Number.isFinite(u.jeton) ? u.jeton : null,
        level: Number.isFinite(u.level) ? u.level : null,
        badge: u.badge || null,
    };
}

/** Kilitli öğenin nasıl açılacağı (kısa, rozet için). */
export function lockBadgeText(state) {
    if (state.kind === 'price' && state.price != null) return formatNumber(state.price);
    if (state.kind === 'level' && state.level != null) return `Sv. ${state.level}`;
    if (state.kind === 'badge') return 'Rozet';
    return 'Kilitli';
}

/** Kilitli öğenin açıklaması (cümle). */
export function lockHint(state) {
    if (state.kind === 'price' && state.price != null) return `${formatNumber(state.price)} jetonla açılır.`;
    if (state.kind === 'level' && state.level != null) return `Oyun seviyesi ${state.level} olunca açılır.`;
    if (state.kind === 'badge') return 'Bir oyun rozetiyle açılır.';
    return 'Şu an kullanılamıyor.';
}

/** Yapılandırmadaki kilitli stil öğeleri (kaydı engeller). */
export function lockedKeysOf(config, index) {
    return usedItemKeys(config).filter((k) => !index.get(k)?.unlocked);
}

export function keyLabel(key) {
    const [slot, style] = String(key).split(':');
    return styleLabel(slot, style);
}

export function sameAvatar(a, b) {
    return JSON.stringify(normalizeAvatar(a)) === JSON.stringify(normalizeAvatar(b));
}

/** Kart özet satırları: görünen parçalar (yok olan aksesuar/iz atlanır). */
export function avatarSummary(config) {
    const a = normalizeAvatar(config);
    const rows = [
        { slot: 'hair', label: 'Saç', value: styleLabel('hair', a.hair.style) },
        { slot: 'top', label: 'Üst', value: styleLabel('top', a.top.style) },
    ];
    if (a.acc !== 'none') rows.push({ slot: 'acc', label: 'Aksesuar', value: styleLabel('acc', a.acc) });
    if (a.trail !== 'none') rows.push({ slot: 'trail', label: 'Koşu İzi', value: styleLabel('trail', a.trail) });
    return rows;
}

/** Bir sekmedeki stiller, sunucu durumuyla birlikte (katalog sırası). */
export function slotOptions(slot, index) {
    return (STYLES[slot] || []).map((s) => {
        const key = itemKey(slot, s.id);
        return { id: s.id, label: s.label, key, state: itemState(index.get(key)) };
    });
}

/**
 * WebGL2 var mı (3D önizleme). three.js parçasını boşuna indirmemek için
 * görüntüleyiciyi yüklemeden önce bakılır; görüntüleyici yine kendisi de
 * denetler (onReady(false)).
 */
export function hasWebGL2() {
    try {
        if (typeof document === 'undefined' || typeof window === 'undefined' || !window.WebGL2RenderingContext) return false;
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (!gl) return false;
        gl.getExtension?.('WEBGL_lose_context')?.loseContext();
        return true;
    } catch {
        return false;
    }
}

export function prefersReducedMotion() {
    try {
        return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    } catch {
        return false;
    }
}
