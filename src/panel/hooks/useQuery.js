import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client';

/**
 * Tek istek yöneten hook. `fetcher` bir axios promise döner; `deps`
 * değişince yeniden çeker. Eskimiş cevaplar (deps değiştikten sonra dönen)
 * yok sayılır.
 */
export function useQuery(fetcher, deps = [], { enabled = true, select } = {}) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState(null);
    const seq = useRef(0);

    const run = useCallback(async () => {
        if (!enabled) { setLoading(false); return; }
        const id = ++seq.current;
        setLoading(true);
        setError(null);
        try {
            const res = await fetcher();
            if (id !== seq.current) return;
            const body = res?.data?.data ?? res?.data ?? null;
            setData(select ? select(body) : body);
        } catch (e) {
            if (id !== seq.current) return;
            setError(errorMessage(e));
        } finally {
            if (id === seq.current) setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, ...deps]);

    useEffect(() => { run(); }, [run]);

    return { data, loading, error, refetch: run, setData };
}

/** Sayfalı liste: aynı hook, `items` ve `pagination` ayrı çıkar. */
export function usePagedQuery(fetcher, deps = [], opts = {}) {
    const q = useQuery(fetcher, deps, opts);
    const body = q.data || {};
    const items = body.items ?? body.users ?? body.complaints ?? body.questions ?? [];
    return { ...q, items, pagination: body.pagination || { current_page: 1, total_pages: 1, total: items.length } , extra: body };
}
