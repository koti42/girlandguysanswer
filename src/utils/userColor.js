const DEFAULT_FEMALE = '#EC4899';
const DEFAULT_MALE = '#3B82F6';
const DEFAULT_NEUTRAL = '#FF6F61';

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
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return {
        backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha})`,
        borderLeftColor: color,
        borderColor: `${color}40`,
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
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return {
        headerBg: `linear-gradient(to right, ${color}, ${color}dd)`,
        borderColor: color,
        bgColor: `rgba(${r}, ${g}, ${b}, 0.08)`,
        bgColorStrong: `rgba(${r}, ${g}, ${b}, 0.15)`,
        shellBg: `linear-gradient(to bottom right, ${color}18, ${color}0c, ${color}18)`,
        accentColor: color,
    };
}
