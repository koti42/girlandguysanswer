import { useCallback, useEffect, useRef, useState } from 'react';

/** Sonuç ekranı açıldıktan sonra düğmelerin tıklamaya kapalı kaldığı süre (ms). */
export const RESULT_GUARD_MS = 600;

let defaultMs = RESULT_GUARD_MS;

/*
 * Yalnızca testler için: varsayılan süreyi değiştirir. Test kurulumu
 * (src/test/setup.js) bunu 0 yapar ki sonuç düğmesine hemen tıklayan eski
 * akış testleri korumaya takılmasın; korumanın kendi testleri 600'e çeker.
 */
export function setResultGuardDefault(ms) {
    defaultMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
}

/**
 * Sonuç ekranı dokunuş koruması (koşu + kule; SPA + gömme). Oyunun son
 * hızlı dokunuşları sonuç açılır açılmaz "Tekrar"/"Mağazaya git" gibi bir
 * düğmeye denk gelmesin diye ilk `ms` (varsayılan 600) boyunca kök kapsayıcıdaki tıklamalar
 * yakalama aşamasında yutulur (bağlantılarda varsayılan gezinme de durur).
 *
 * Döner: `guarded` (koruma sürüyor mu) ve köke yayılacak `guardProps`
 * (onClickCapture + CSS'in soluk görünüm için okuduğu `data-result-guard`).
 * Görsel soluk → normal geçişi CSS'te (game.css); azaltılmış harekette geçiş
 * yok ama koruma aynen sürer. Klavyede Enter/Boşluk da tıklama ürettiği için
 * aynı şekilde korunur.
 */
export default function useResultGuard(ms) {
    const wait = ms ?? defaultMs;
    const active = wait > 0;
    const [guarded, setGuarded] = useState(active);
    const guardedRef = useRef(active);

    useEffect(() => {
        if (!active) return undefined;
        const t = setTimeout(() => {
            guardedRef.current = false;
            setGuarded(false);
        }, wait);
        return () => clearTimeout(t);
    }, [active, wait]);

    const onClickCapture = useCallback((e) => {
        if (!guardedRef.current) return;
        e.preventDefault();
        e.stopPropagation();
    }, []);

    return {
        guarded,
        guardProps: { onClickCapture, 'data-result-guard': guarded ? 'on' : 'off' },
    };
}
