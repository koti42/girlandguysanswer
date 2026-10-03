import { useCallback, useEffect, useRef, useState } from 'react';
import { shopApi } from '../../../services/shopApi';
import { normalizeTicketCheck } from './ticketUtils';
import { shopError } from './shopError';

/*
 * GET /game/shop/tickets/message/check kancası.
 * `enabled` false iken istek atılmaz; `refresh()` elle yeniden sorar (ör.
 * gönderim 403 aldıktan ya da bilet mesajı gönderildikten sonra).
 * Kullanıcı adı değişince eski yanıt yok sayılır; aynı kişi yenilenirken
 * son yanıt korunur.
 */
export default function useTicketCheck(username, enabled) {
    const [state, setState] = useState({ key: null, username: null, status: 'idle', data: null, error: null });
    const [attempt, setAttempt] = useState(0);
    const reqRef = useRef(0);
    const active = !!(enabled && username);
    const key = active ? `${username}#${attempt}` : null;

    useEffect(() => {
        if (!key) return undefined;
        const req = ++reqRef.current;
        shopApi.checkMessageTicket(username).then(
            (data) => req === reqRef.current && setState({ key, username, status: 'done', data: normalizeTicketCheck(data), error: null }),
            (err) => req === reqRef.current && setState({ key, username, status: 'error', data: null, error: shopError(err, 'Bilet durumu alınamadı.').message })
        );
        return () => {
            reqRef.current += 1;
        };
    }, [key, username]);

    const refresh = useCallback(() => setAttempt((a) => a + 1), []);
    const current = key != null && state.key === key;

    return {
        status: !key ? 'idle' : current ? state.status : 'loading',
        // Aynı kişi için yenilenirken son yanıt görünür kalır (titreme yok)
        data: current || (key != null && state.username === username) ? state.data : null,
        error: current ? state.error : null,
        refresh,
    };
}
