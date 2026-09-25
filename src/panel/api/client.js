import axios from 'axios';

/**
 * Panel API istemcisi. İki panel de aynı istemciyi ve aynı token'ı kullanır;
 * hangi panele girilebileceğine rol karar verir.
 *
 * Token anahtarı ana uygulamanınkinden ayrı: yönetici ile sıradan kullanıcı
 * oturumu aynı tarayıcıda birbirini ezmesin.
 */
export const PANEL_TOKEN_KEY = 'panel_token';
export const PANEL_USER_KEY = 'panel_user';

const API_URL = import.meta.env.VITE_API_URL || 'https://herkeslersoruyor.panalix.com.tr/api';

export const client = axios.create({
    baseURL: API_URL,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    timeout: 30000,
});

client.interceptors.request.use((config) => {
    try {
        const token = localStorage.getItem(PANEL_TOKEN_KEY);
        if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch {
        // localStorage erişilemezse anonim devam
    }
    return config;
});

let onUnauthorized = null;
/** Shell, 401'de nereye gidileceğini kaydeder (router dışından). */
export function setUnauthorizedHandler(fn) {
    onUnauthorized = fn;
}

client.interceptors.response.use(
    (res) => res,
    (error) => {
        const status = error.response?.status;
        if (status === 401) {
            try {
                localStorage.removeItem(PANEL_TOKEN_KEY);
                localStorage.removeItem(PANEL_USER_KEY);
            } catch { /* yoksay */ }
            onUnauthorized?.();
        }
        return Promise.reject(error);
    }
);

/** Sunucu mesajını, yoksa doğrulama hatalarının ilkini, yoksa genel metni döner. */
export function errorMessage(error, fallback = 'Bir hata oluştu.') {
    const data = error?.response?.data;
    if (data?.message && typeof data.message === 'string') {
        if (data.errors && typeof data.errors === 'object') {
            const first = Object.values(data.errors).flat()[0];
            if (first) return `${data.message} ${first}`;
        }
        return data.message;
    }
    if (error?.code === 'ECONNABORTED') return 'İstek zaman aşımına uğradı.';
    return error?.message || fallback;
}

export default client;
