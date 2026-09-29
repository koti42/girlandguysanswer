import { useEffect, useState } from 'react';

/** Belirli aralıklarla güncellenen `Date.now()`. Geri sayımlar için. */
export default function useNow(intervalMs = 1000, enabled = true) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!enabled) return undefined;
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs, enabled]);
    return now;
}

/** Sayfa başlığını oyun bölümüne göre ayarlar, çıkışta eskisine döner. */
export function useGameTitle(title) {
    useEffect(() => {
        const prev = document.title;
        document.title = title ? `${title} · Oyun Merkezi · Herkesler Soruyor` : 'Oyun Merkezi · Herkesler Soruyor';
        return () => {
            document.title = prev;
        };
    }, [title]);
}
