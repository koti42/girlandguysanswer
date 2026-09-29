import { useCallback, useEffect, useState } from 'react';

/**
 * Basit veri çekme kancası.
 *
 * Yanıt, hangi `key` + deneme için geldiyse onunla saklanır; parametre
 * (key) değişince ya da `reload()` çağrılınca eski veri otomatik olarak
 * "yükleniyor"a düşer. Böylece effect gövdesinde senkron setState yok.
 *
 * `fetcher` useCallback ile sabitlenmiş olmalı.
 */
export default function useAsync(fetcher, key = '') {
    const [attempt, setAttempt] = useState(0);
    const fullKey = `${key}#${attempt}`;
    const [state, setState] = useState({ key: null, data: null, error: null });

    useEffect(() => {
        let alive = true;
        Promise.resolve()
            .then(fetcher)
            .then(
                (data) => alive && setState({ key: fullKey, data, error: null }),
                (error) => alive && setState({ key: fullKey, data: null, error: error || new Error('unknown') })
            );
        return () => {
            alive = false;
        };
    }, [fetcher, fullKey]);

    const reload = useCallback(() => setAttempt((a) => a + 1), []);
    const current = state.key === fullKey;

    return {
        data: current ? state.data : null,
        error: current ? state.error : null,
        loading: !current,
        reload,
    };
}
