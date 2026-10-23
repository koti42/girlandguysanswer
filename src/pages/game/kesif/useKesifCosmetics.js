import { useEffect, useRef } from 'react';

/*
 * Keşif oyununda Mağaza görünümleri (Keşif Koleksiyonu): üye için yükü (loadout) BİR KEZ okur ve oyuna iletir.
 *
 *   kesifApi.loadout() -> { loadout: { portal, alet, asa, jet, arac, gecis } }  (özel; yalnız sahibine; 2,5 sn zaman aşımı)
 *
 * - Oyun başlangıcını ASLA bekletmez: istek arka planda gider; oyun önce varsayılan görünümle açılır, yanıt geç gelirse
 *   `game.setCosmetics(loadout)` canlı uygular (dünya yeniden kurulmaz). Motor kurulurken ref'teki değer `opts.cosmetics` olur.
 * - Misafir / çıkış yapmış (member=false) → İSTEK BİLE ATILMAZ. Hata, zaman aşımı, bozuk yanıt → sessizce varsayılan görünüm.
 * - Mağaza ve oyun farklı sayfalardaysa: sayfa yeniden görünür olunca / odaklanınca (en çok 5 sn'de bir) yeniden okunur. Yoklama (polling) YOK.
 * - Yalnız yuva adları ve metin değerleri kopyalanır; anahtarın geçerliliğini motor (render/skins.js) denetler.
 */
export const COSMETIC_SLOTS = ['portal', 'alet', 'asa', 'jet', 'arac', 'gecis'];
const MIN_GAP_MS = 5000;
const TIMEOUT_MS = 3000;

/** Ham yanıt -> { portal, ... } (yalnız ≤64 karakterlik metinler) | null (hiç görünüm yok / bozuk). */
export function cleanCosmetics(raw) {
    const src = raw && typeof raw === 'object' ? (raw.loadout && typeof raw.loadout === 'object' ? raw.loadout : raw) : null;
    if (!src) return null;
    const out = {};
    let any = false;
    for (const slot of COSMETIC_SLOTS) {
        const v = src[slot];
        out[slot] = typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : null;
        if (out[slot]) any = true;
    }
    return any ? out : null;
}

const same = (a, b) => {
    if (a === b) return true;
    if (!a || !b) return false;
    return COSMETIC_SLOTS.every((s) => a[s] === b[s]);
};

const safe = (fn) => {
    try {
        return fn();
    } catch {
        return undefined;
    }
};

/**
 * @returns ref: { current: temiz yük | null } (motor kurulurken okunur)
 */
export default function useKesifCosmetics({ api, member, gameRef }) {
    const ref = useRef(null);

    useEffect(() => {
        if (!member || !api || typeof api.loadout !== 'function') {
            ref.current = null;
            return undefined;
        }
        let alive = true;
        let inflight = false;
        let last = 0;

        const load = () => {
            if (inflight || !alive) return;
            inflight = true;
            last = Date.now();
            let timer = 0;
            const timeout = new Promise((resolve) => {
                timer = setTimeout(() => resolve(undefined), TIMEOUT_MS);
            });
            Promise.race([Promise.resolve().then(() => api.loadout()), timeout])
                .then((raw) => {
                    if (!alive || raw === undefined) return;
                    const next = cleanCosmetics(raw);
                    if (same(ref.current, next)) return;
                    ref.current = next;
                    safe(() => gameRef?.current?.setCosmetics?.(next));
                })
                .catch(() => {
                    /* sessiz: varsayılan görünüm */
                })
                .finally(() => {
                    clearTimeout(timer);
                    inflight = false;
                });
        };

        load();
        const onBack = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            if (Date.now() - last >= MIN_GAP_MS) load();
        };
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onBack);
        if (typeof window !== 'undefined') window.addEventListener('focus', onBack);
        return () => {
            alive = false;
            if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onBack);
            if (typeof window !== 'undefined') window.removeEventListener('focus', onBack);
        };
    }, [api, member, gameRef]);

    return ref;
}
