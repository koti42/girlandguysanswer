const DEFAULT_FEMALE = '#EC4899';
const DEFAULT_MALE = '#3B82F6';
const DEFAULT_NEUTRAL = '#FF6F61';

/**
 * #RGB / #RRGGBB veya # olmadan gelen değerleri güvenli şekilde RGB'ye çevirir.
 * Geçersizse null döner (8 haneli #RRGGBBAA desteklenmez; önce kırpılır).
 */
function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return null;
    let h = hex.trim();
    if (!h.startsWith('#')) h = `#${h}`;
    h = h.slice(1);
    if (h.length >= 8) h = h.slice(0, 6);
    if (h.length === 3) {
        h = h.split('').map((c) => c + c).join('');
    }
    if (h.length !== 6) return null;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return { r, g, b };
}

function toHex({ r, g, b }) {
    return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Çok açık (beyaza yakın) tema renkleri: başlıkta beyaz üzerine beyaz metin oluşmasın */
function isRgbTooLightForHeader(r, g, b) {
    const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return L > 0.9;
}

function isFemale(gender) {
    const g = gender?.toLowerCase();
    return g === 'female' || g === 'kiz' || g === 'kadın' || g === 'woman';
}

function isMale(gender) {
    const g = gender?.toLowerCase();
    return g === 'male' || g === 'erkek' || g === 'man';
}

/**
 * İçerik sahibinin (contentCreator) cinsiyetine göre renk döner.
 * viewerPrefs = giriş yapan kullanıcının ayarladığı renkler (sadece o görür).
 * viewerPrefs yoksa veya giriş yapmamışsa varsayılan renkler kullanılır.
 */
export function getProfileColor(contentCreator, viewerPrefs = null) {
    const gender = contentCreator?.gender;
    const colorFemale = viewerPrefs?.profile_color_female ?? DEFAULT_FEMALE;
    const colorMale = viewerPrefs?.profile_color_male ?? DEFAULT_MALE;

    if (isFemale(gender)) return colorFemale;
    if (isMale(gender)) return colorMale;
    return DEFAULT_NEUTRAL;
}

export function getProfileColorStyle(contentCreator, viewerPrefs = null) {
    const color = getProfileColor(contentCreator, viewerPrefs);
    return { borderLeftColor: color, borderColor: color };
}

export function getProfileGradientStyle(contentCreator, viewerPrefs = null, alpha = 0.15) {
    const color = getProfileColor(contentCreator, viewerPrefs);
    const rgb = hexToRgb(color) || hexToRgb(DEFAULT_NEUTRAL);
    const { r, g, b } = rgb;
    const safeHex = toHex(rgb);
    return {
        backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha})`,
        borderLeftColor: safeHex,
        borderColor: `rgba(${r}, ${g}, ${b}, 0.25)`,
    };
}

export function getViewerPrefs(user) {
    if (!user) return null;
    const d = user.detail;
    const female = d?.profile_color_female ?? null;
    const male = d?.profile_color_male ?? null;
    if (!female && !male) return null;
    return { profile_color_female: female, profile_color_male: male };
}

export function getThemeStyles(contentCreator, viewerPrefs = null) {
    const color = getProfileColor(contentCreator, viewerPrefs);
    let rgb = hexToRgb(color) || hexToRgb(DEFAULT_NEUTRAL);
    if (isRgbTooLightForHeader(rgb.r, rgb.g, rgb.b)) {
        rgb = hexToRgb(DEFAULT_NEUTRAL);
    }
    const { r, g, b } = rgb;
    const safeHex = toHex(rgb);
    const headerBgSolid = `rgb(${r},${g},${b})`;
    return {
        headerBgSolid,
        headerBg: `linear-gradient(to right, ${headerBgSolid}, rgba(${r},${g},${b},0.88))`,
        borderColor: safeHex,
        bgColor: `rgba(${r}, ${g}, ${b}, 0.08)`,
        bgColorStrong: `rgba(${r}, ${g}, ${b}, 0.15)`,
        shellBg: `linear-gradient(to bottom right, rgba(${r},${g},${b},0.14), rgba(${r},${g},${b},0.05), rgba(${r},${g},${b},0.14))`,
        accentColor: safeHex,
    };
}
