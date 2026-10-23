import { useCallback, useEffect, useRef, useState } from 'react';
import { A11Y_ATTR, isAccessibilityOn } from '../../../utils/accessibility';
import { normalizeAvatar } from '../../../game/avatar/catalog';
import { hasWebGL2, prefersReducedMotion } from '../../game/avatar/avatarUtils';
import { loadIslandScene } from './islandLoader';

/*
 * Ada Profili: saf yardımcılar (React'siz, node'da sınanır) ve sahne
 * motorunu yaşam döngüsüyle bağlayan `useIslandScene` kancası.
 *
 * Gizlilik kuralı tek yerde: `canViewContent`. Sayfa gizli bir hesabın
 * sayılarını/içeriğini sekmelerde kilitliyorsa (ProfileTabs) sahne kartları
 * da aynısını yapar; ada temalı profil standart profilden fazlasını göstermez.
 */

/** Sahne durakları (motorun ISLAND_STOPS listesiyle aynı sıra ve anahtarlar). */
export const ISLAND_STOPS = [
    { key: 'hakkinda', label: 'Hakkında' },
    { key: 'sorular', label: 'Sorular' },
    { key: 'cevaplar', label: 'Cevaplar' },
    { key: 'rozetler', label: 'Rozetler' },
    { key: 'takip', label: 'Takip' },
];

/** Sahne yüksekliği; yer tutucuyla aynı değer (düzen kayması olmasın). */
export const ISLAND_HERO_HEIGHT = 'clamp(360px, 70vh, 640px)';

const DAY_MS = 86400000;

export function wrapIndex(i, n) {
    if (!Number.isFinite(i) || !(n > 0)) return 0;
    return ((Math.round(i) % n) + n) % n;
}

let supportCache = null;

/** WebGL2 var mı (bir kez sınanır). */
export function islandSupported() {
    if (supportCache === null) supportCache = hasWebGL2();
    return supportCache;
}

/** Yalnız testler için. */
export function resetIslandSupportCache() {
    supportCache = null;
}

export function isCoarsePointer() {
    try {
        return Boolean(window.matchMedia?.('(pointer: coarse)').matches);
    } catch {
        return false;
    }
}

/** <html data-a11y="1"> (erişilebilirlik modu) açık mı. */
export function a11yDomOn() {
    try {
        return typeof document !== 'undefined' && document.documentElement.hasAttribute(A11Y_ATTR);
    } catch {
        return false;
    }
}

/**
 * Kahraman sahne çizilsin mi? Tema aktif + engelli değil + erişilebilirlik
 * modu kapalı + hareket azaltma kapalı + WebGL2 var. Aksi halde standart
 * kapak/sekmeler (erişilebilir yedek) kullanılır.
 */
export function shouldShowIsland(profile, { blocked = false, user = null } = {}) {
    if (!profile?.profile_theme?.active || blocked) return false;
    if (isAccessibilityOn(user) || a11yDomOn()) return false;
    if (prefersReducedMotion()) return false;
    return islandSupported();
}

/**
 * Tema rozeti: süresizse 'Süresiz', süreliyse kalan gün. Süresi dolmuş ya da
 * tarihi bozuk ise null (rozet gösterilmez).
 * Gizlilik: API `expires_at` alanını yalnızca profil sahibine gönderir; ziyaretçi
 * yükünde alan YOKTUR (undefined). Yok ≠ null: null = süresiz, undefined = bilinmiyor
 * (rozet yok; yanlışlıkla "Süresiz" yazılmaz).
 */
export function themeBadge(profileTheme, now = Date.now()) {
    if (!profileTheme || profileTheme.expires_at === undefined) return null;
    if (profileTheme.expires_at === null) return { unlimited: true, label: 'Süresiz' };
    const end = Date.parse(profileTheme.expires_at);
    if (!Number.isFinite(end)) return null;
    const left = end - now;
    if (left <= 0) return null;
    const days = Math.ceil(left / DAY_MS);
    if (left < DAY_MS) return { unlimited: false, days: 0, label: 'Bugün bitiyor' };
    return { unlimited: false, days, label: `${days} gün kaldı` };
}

/** Gizli hesapta içerik yalnız sahibine ve takipçisine açık (ProfileTabs ile aynı). */
export function canViewContent(profile, isOwn) {
    return Boolean(isOwn || !profile?.isPrivate || profile?.isFollowing);
}

/** Mesaj bağlantısı gösterilsin mi (ProfileActions kuralının aynısı). */
export function canMessage(profile, isAdmin = false) {
    if (!profile || profile.hasBlocked || profile.isBlocked) return false;
    return Boolean(
        isAdmin ||
            (profile.allow_messaging !== false &&
                (profile.messaging_mode !== 'followers' || profile.isFollowing))
    );
}

/** Takip düğmesinin yazısı ve devre dışı durumu (ProfileActions ile aynı). */
export function followState(profile) {
    const closed = profile?.allow_following === false && !profile?.isFollowing && !profile?.hasPendingRequest;
    let label = 'Takip Et';
    if (profile?.hasBlocked) label = 'Engellenmiş';
    else if (profile?.isFollowing) label = 'Takip Ediliyor';
    else if (profile?.hasPendingRequest) label = 'İstek Gönderildi';
    else if (profile?.allow_following === false) label = 'Takip Kapalı';
    else if (profile?.isPrivate) label = 'Takip İsteği Gönder';
    return { label, disabled: closed || Boolean(profile?.hasBlocked), active: Boolean(profile?.isFollowing) };
}

/** Son sorular: yalnız sayfanın zaten gösterdiği alanlar (başlık + bağlantı). */
export function questionItems(questions, limit = 3) {
    if (!Array.isArray(questions)) return [];
    const out = [];
    for (const q of questions) {
        if (!q || typeof q !== 'object') continue;
        const ref = q.slug || q.id;
        if (ref == null || ref === '') continue;
        const raw = String(q.title || q.content || '').trim();
        const title = raw.length > 90 ? `${raw.slice(0, 89)}…` : raw;
        out.push({ id: q.id ?? ref, to: `/question/${ref}`, title: title || 'Başlıksız soru' });
        if (out.length >= limit) break;
    }
    return out;
}

/** Rozet listesi: ilk `limit` rozet + kalan sayısı. */
export function badgeItems(badges, limit = 8) {
    const list = Array.isArray(badges) ? badges.filter((b) => b && typeof b === 'object' && b.name) : [];
    return {
        items: list.slice(0, limit).map((b, i) => ({
            id: b.id ?? b.slug ?? `b${i}`,
            name: String(b.name),
            icon: b.icon_url || null,
            description: b.description || '',
        })),
        extra: Math.max(0, list.length - limit),
    };
}

/** Sahneye giden sade profil özeti (kişisel veri: yalnız zaten herkese açık olanlar). */
export function sceneProfile(profile) {
    return {
        username: profile?.username || '',
        name: profile?.name || profile?.username || '',
        gender: profile?.gender || null,
        level: profile?.level?.name || null,
    };
}

/**
 * Sahne motorunu yükler, kurar ve söker.
 *
 * phase: 'off' (kapalı) | 'loading' | 'ready' | 'failed'. Motor ayrı parça
 * olarak gelir (three.js ana pakete girmez); yükleme/kurulum/bağlam kaybı
 * hatasında 'failed' olur ve çağıran standart yedeği çizer. Avatar ya da
 * cinsiyet değişirse sahne yeniden kurulur; durak değişimi geri çağrıyla
 * bildirilir. Sökülürken kurulum bitmemişse biten sahne hemen yok edilir.
 */
export function useIslandScene({ enabled, avatar, gender, profile, stops = ISLAND_STOPS, onStopChange, quality }) {
    const hostRef = useRef(null);
    const sceneRef = useRef(null);
    const stopCb = useRef(onStopChange);
    const profileRef = useRef(profile);
    // Son istenen görünüm kaydırması: sahne henüz yokken/yeniden kurulurken de korunur.
    const viewOffsetRef = useRef(0);
    useEffect(() => {
        stopCb.current = onStopChange;
        profileRef.current = profile;
    });

    const runKey = `${JSON.stringify(avatar ?? null)}|${gender ?? ''}`;
    const [state, setState] = useState({ key: runKey, phase: 'loading' });
    const phase = !enabled ? 'off' : state.key === runKey ? state.phase : 'loading';

    useEffect(() => {
        if (!enabled) return undefined;
        let cancelled = false;
        let failed = false;
        let scene = null;

        const settle = (next) => {
            if (!cancelled) setState({ key: runKey, phase: next });
        };
        const fail = (err) => {
            if (failed || cancelled) return;
            failed = true;
            if (err) console.warn('[ada] sahne kullanılamıyor', err);
            try {
                scene?.destroy?.();
            } catch {
                /* sahne zaten kapanmış olabilir */
            }
            scene = null;
            sceneRef.current = null;
            settle('failed');
        };

        loadIslandScene()
            .then(async (mod) => {
                if (cancelled || !hostRef.current) return;
                const created = await mod.createIslandScene({
                    container: hostRef.current,
                    profile: sceneProfile(profileRef.current),
                    avatarConfig: normalizeAvatar(avatar, gender),
                    gender,
                    stops,
                    reducedMotion: prefersReducedMotion(),
                    quality: quality || (isCoarsePointer() ? 'medium' : 'auto'),
                    onStopChange: (i) => {
                        if (!cancelled && !failed) stopCb.current?.(i);
                    },
                    onReady: (ok) => {
                        if (ok === false) fail();
                        else if (!failed) settle('ready');
                    },
                    onError: (err) => fail(err),
                });
                if (cancelled || failed) {
                    created?.destroy?.();
                    return;
                }
                if (!created) {
                    fail();
                    return;
                }
                scene = created;
                sceneRef.current = created;
                if (viewOffsetRef.current > 0) {
                    try {
                        created.setViewOffset?.({ y: viewOffsetRef.current, immediate: true });
                    } catch {
                        /* görünüm kaydırması isteğe bağlı */
                    }
                }
                settle('ready');
            })
            .catch((err) => fail(err));

        return () => {
            cancelled = true;
            sceneRef.current = null;
            try {
                scene?.destroy?.();
            } catch {
                /* yok say */
            }
            scene = null;
        };
        // avatar/gender runKey'e dahil; stops/quality sabit kabul edilir.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, runKey]);

    const goTo = useCallback((i) => {
        try {
            sceneRef.current?.goTo?.(i);
        } catch {
            /* sahne kapanmış olabilir */
        }
    }, []);

    /**
     * Telefonda bilgi kartının üstüne sığdırma: ada merkezini sahne yüksekliğinin y kesri
     * kadar yukarı kaydırır (0 = sıfırla). Sahne yokken değer saklanır, kurulunca uygulanır.
     */
    const setViewOffset = useCallback((y) => {
        const next = Number.isFinite(y) && y > 0 ? y : 0;
        const prev = viewOffsetRef.current;
        // Yerleşim titremesinde aynı değeri tekrar tekrar iletme; sıfırlama her zaman geçer.
        if (next === prev || (next > 0 && prev > 0 && Math.abs(next - prev) < 0.004)) return;
        viewOffsetRef.current = next;
        try {
            sceneRef.current?.setViewOffset?.({ y: next });
        } catch {
            /* sahne kapanmış olabilir */
        }
    }, []);

    return { hostRef, phase, goTo, setViewOffset };
}
