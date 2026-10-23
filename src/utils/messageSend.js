/**
 * Mesaj gönderimi için yardımcılar: istemci mesaj kimliği, hata sınıflandırma (Türkçe,
 * duruma özel metinler) ve yalnızca GÜVENLİ durumlarda otomatik yeniden deneme.
 *
 * Gönderim mesaj başına tekrar-güvenlidir: aynı client_temp_id sunucuda aynı mesaja karşılık
 * gelir (Idempotency-Key olarak da gider), bu yüzden yanıtı kaybolan bir isteği yeniden
 * göndermek asla ikinci bir kopya üretmez.
 */

/** Her mesaja bir kez üretilen kimlik; yeniden denemelerde AYNISI kullanılır. */
export function newClientMessageId() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return `temp-${crypto.randomUUID()}`;
        }
    } catch {
        // randomUUID kullanılamıyor (güvensiz bağlam): aşağıdaki yedek
    }
    return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
}

/** `temp-…` iyimser kimlikleri sunucuda bir mesaj değildir (yanıt/silme gibi işlemlerde kullanılmaz). */
export function isTempMessageId(id) {
    return typeof id === 'string' && id.startsWith('temp-');
}

export const GENERIC_SEND_ERROR = 'Mesaj gönderilemedi. Lütfen tekrar deneyin.';

function serverMessage(data) {
    if (data && typeof data === 'object') {
        if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();
        const first = data.errors && typeof data.errors === 'object' ? Object.values(data.errors)[0] : null;
        if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
    }
    return null;
}

/**
 * Hata → { kind, message, retryable, autoRetry, keepBubble }
 *  retryable : kullanıcı "tekrar dene" ile aynı mesajı yeniden gönderebilir
 *  autoRetry : arka planda geri çekilmeyle (backoff) otomatik denemek güvenli
 *  keepBubble: balon "gönderilemedi" olarak kalır (false = kural/doğrulama reddi, balon kaldırılır)
 */
export function classifySendError(error) {
    const response = error?.response;
    const status = response?.status;

    if (!response) {
        if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT' || /timeout/i.test(error?.message || '')) {
            return { kind: 'timeout', status: null, message: 'Sunucu zamanında yanıt vermedi. "Tekrar dene"ye dokun; mesaj iki kez gitmez.', retryable: true, autoRetry: true, keepBubble: true };
        }
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        return {
            kind: offline ? 'offline' : 'network',
            status: null,
            message: offline
                ? 'İnternet bağlantın yok. Bağlandığında "tekrar dene"ye dokun.'
                : 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.',
            retryable: true,
            autoRetry: true,
            keepBubble: true,
        };
    }

    const fromServer = serverMessage(response.data);

    if (status === 401) {
        return { kind: 'auth', status, message: 'Oturumun sona ermiş. Mesajını göndermek için yeniden giriş yap.', retryable: true, autoRetry: false, keepBubble: true };
    }
    if (status === 403) {
        return { kind: 'forbidden', status, message: fromServer || 'Bu kullanıcıya şu an mesaj gönderemezsin.', retryable: false, autoRetry: false, keepBubble: false };
    }
    if (status === 404) {
        return { kind: 'not_found', status, message: fromServer || 'Bu kullanıcı bulunamadı.', retryable: false, autoRetry: false, keepBubble: false };
    }
    if (status === 408) {
        return { kind: 'timeout', status, message: 'İstek zaman aşımına uğradı. "Tekrar dene"ye dokun.', retryable: true, autoRetry: true, keepBubble: true };
    }
    if (status === 409) {
        return { kind: 'conflict', status, message: fromServer || 'Mesaj kimliği çakıştı. Mesajı yeniden yazıp gönder.', retryable: false, autoRetry: false, keepBubble: false };
    }
    if (status === 413) {
        return { kind: 'too_large', status, message: 'Gönderilen dosya çok büyük. Daha küçük bir dosya seç.', retryable: false, autoRetry: false, keepBubble: false };
    }
    if (status === 422 || status === 400) {
        // Laravel'in varsayılan doğrulama metinleri İngilizcedir ("Validation error", "The content field..."): Türkçe karşılık göster.
        const custom = fromServer && !/^validation error$|^the .* (field|must)/i.test(fromServer) ? fromServer : null;
        return { kind: 'invalid', status, message: custom || 'Mesaj gönderilemedi: içerik boş, geçersiz ya da çok uzun (en fazla 5000 karakter).', retryable: false, autoRetry: false, keepBubble: false };
    }
    if (status === 429) {
        const retryAfter = Number(response.headers?.['retry-after']);
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? ` Yaklaşık ${Math.ceil(retryAfter)} sn bekle.` : ' Birkaç saniye bekle.';
        return { kind: 'rate_limited', status, message: `Çok hızlı mesaj gönderiyorsun.${wait}`, retryable: true, autoRetry: false, keepBubble: true };
    }
    if (status === 503) {
        return { kind: 'unavailable', status, message: 'Servis kısa süreliğine kullanılamıyor. Birazdan "tekrar dene"ye dokun.', retryable: true, autoRetry: true, keepBubble: true };
    }
    if (status === 502 || status === 504 || (status >= 520 && status <= 524)) {
        return { kind: 'gateway', status, message: 'Sunucuya şu an ulaşılamıyor. Birazdan "tekrar dene"ye dokun.', retryable: true, autoRetry: true, keepBubble: true };
    }
    if (status >= 500) {
        return { kind: 'server', status, message: 'Sunucuda geçici bir sorun oluştu. Birazdan "tekrar dene"ye dokun.', retryable: true, autoRetry: false, keepBubble: true };
    }
    if (status >= 400) {
        return { kind: 'client', status, message: fromServer || GENERIC_SEND_ERROR, retryable: false, autoRetry: false, keepBubble: false };
    }
    return { kind: 'unknown', status, message: fromServer || GENERIC_SEND_ERROR, retryable: true, autoRetry: false, keepBubble: true };
}

/** Testlerde `retryConfig.delays = [0, 0]` ile bekleme kapatılır. */
export const retryConfig = { delays: [700, 1800] };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `fn` (aynı client_temp_id ile POST) güvenle yeniden denenebilen hatalarda (ağ yok, zaman aşımı,
 * 408/502/503/504) geri çekilmeyle tekrarlanır. Diğer hatalar anında yukarı atılır.
 */
export async function sendWithRetry(fn, { delays = retryConfig.delays, onRetry } = {}) {
    let attempt = 0;
    while (true) {
        try {
            return await fn(attempt);
        } catch (error) {
            const info = classifySendError(error);
            if (!info.autoRetry || attempt >= delays.length) {
                throw error;
            }
            const wait = delays[attempt];
            attempt += 1;
            if (onRetry) onRetry(attempt, info);
            await sleep(wait);
        }
    }
}
