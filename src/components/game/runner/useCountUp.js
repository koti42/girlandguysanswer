import { useEffect, useState } from 'react';

/**
 * 0'dan hedefe yumuşakça sayan değer. `animate` false ise (azaltılmış
 * hareket) doğrudan hedef döner, zamanlayıcı kurulmaz.
 */
export default function useCountUp(target, { duration = 1200, animate = true } = {}) {
    const end = Number.isFinite(Number(target)) ? Math.max(0, Math.floor(Number(target))) : 0;
    const [frame, setFrame] = useState({ end: null, value: 0 });

    useEffect(() => {
        if (!animate || end === 0) return undefined;
        let raf = 0;
        let startAt = null;
        const tick = (now) => {
            if (startAt === null) startAt = now;
            const t = Math.min(1, (now - startAt) / duration);
            // easeOutCubic
            const eased = 1 - (1 - t) ** 3;
            setFrame({ end, value: Math.round(end * eased) });
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [end, duration, animate]);

    if (!animate) return end;
    // Hedef değişti ama ilk kare henüz gelmedi: eski değer yerine 0'dan başla.
    return frame.end === end ? frame.value : 0;
}
