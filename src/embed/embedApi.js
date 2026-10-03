import axios from 'axios';

/*
 * Mobil gömmenin API istemcisi.
 *
 * Sitenin services/api.js örneği kullanılmaz: o örnek token'ı
 * localStorage'dan okuyor, 401'de depoyu temizliyor ve 403'te (dondurulmuş /
 * banlı hesap) sayfayı profile yönlendiriyor; WebView içinde bunların hiçbiri
 * istenmiyor. Burada token yalnızca bellekte (köprüden gelen değer), aynı
 * API adresi, gameApi.js ile aynı uçlar ve zarf (`{ success, message, data }`
 * içindeki `data`), aynı zaman aşımları ve her çağrıda taze Idempotency-Key.
 * Hata olduğu gibi fırlatılır: gameErrorStatus / gameErrorMessage aynen çalışır.
 */

export const API_URL = import.meta.env.VITE_API_URL || 'https://herkeslersoruyor.panalix.com.tr/api';

const unwrap = (res) => res?.data?.data ?? {};

const freshKey = () =>
    window.crypto?.randomUUID ? window.crypto.randomUUID() : `embed_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const cfg = (ms) => ({ headers: { 'Idempotency-Key': freshKey() }, timeout: ms });
const runPath = (runId, tail) => `/game/runner/${encodeURIComponent(runId)}/${tail}`;
const towerPath = (runId, tail) => `/game/tower/${encodeURIComponent(runId)}/${tail}`;

/**
 * getToken(): o anki token (string | null). Her istekte okunur; token
 * yoksa Authorization başlığı eklenmez (misafir).
 */
export function createEmbedApi(getToken) {
    const http = axios.create({
        baseURL: API_URL,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });
    http.interceptors.request.use((config) => {
        const token = getToken?.();
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
    });

    return {
        http,
        // Koşu (gameApi.js ile aynı sözleşme)
        startRunner: () => http.post('/game/runner/start', {}, cfg(15000)).then(unwrap),
        runnerGate: (runId, { gate, lane }) => http.post(runPath(runId, 'gate'), { gate, lane }, cfg(8000)).then(unwrap),
        finishRunner: (runId, { end_tick, inputs, client_score }) =>
            http
                .post(runPath(runId, 'finish'), Number.isFinite(client_score) ? { end_tick, inputs, client_score } : { end_tick, inputs }, cfg(20000))
                .then(unwrap),
        abandonRunner: (runId) => http.post(runPath(runId, 'abandon'), {}, cfg(10000)).then(unwrap),
        // Kule (towerApi.js ile aynı sözleşme ve biçim: useTowerSession `api` olarak alır)
        tower: {
            start: () => http.post('/game/tower/start', {}, cfg(15000)).then(unwrap),
            answer: (runId, { q, choice }) => http.post(towerPath(runId, 'answer'), { q, choice }, cfg(8000)).then(unwrap),
            finish: (runId, { end_tick, inputs, client_score }) =>
                http
                    .post(towerPath(runId, 'finish'), Number.isFinite(client_score) ? { end_tick, inputs, client_score } : { end_tick, inputs }, cfg(20000))
                    .then(unwrap),
            abandon: (runId) => http.post(towerPath(runId, 'abandon'), {}, cfg(10000)).then(unwrap),
        },
    };
}
