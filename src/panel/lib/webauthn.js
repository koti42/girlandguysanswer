/**
 * Passkey (WebAuthn) tarayıcı köprüsü.
 *
 * Sunucu seçenekleri base64url ile gönderir; tarayıcı ArrayBuffer bekler.
 * Dönüşüm tek yerde: yanlış kodlanan tek alan doğrulamayı sessizce başarısız
 * kılar. Saf yardımcılar dışa açık ki test edilebilsin.
 */

export function passkeySupported() {
    return typeof window !== 'undefined'
        && typeof window.PublicKeyCredential === 'function'
        && typeof navigator.credentials?.create === 'function';
}

export async function conditionalUiAvailable() {
    try {
        return passkeySupported() && (await window.PublicKeyCredential.isConditionalMediationAvailable?.()) === true;
    } catch {
        return false;
    }
}

export function fromBase64Url(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

export function toBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Sunucudan gelen seçeneklerden null alanları atar. WebAuthn'da isteğe bağlı
 * alan YA geçerli değer alır YA hiç bulunmaz; `authenticatorAttachment: null`
 * tarayıcıda TypeError veriyor ve kayıt sunucuya ulaşmadan ölüyordu.
 */
export function stripNulls(value) {
    if (Array.isArray(value)) return value.map(stripNulls);
    if (value !== null && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (v === null || v === undefined) continue;
            out[k] = stripNulls(v);
        }
        return out;
    }
    return value;
}

export function decodeCreationOptions(options) {
    const o = stripNulls(options);
    return {
        publicKey: {
            ...o,
            challenge: fromBase64Url(o.challenge),
            user: { ...o.user, id: fromBase64Url(o.user.id) },
            excludeCredentials: (o.excludeCredentials ?? []).map((c) => ({ ...c, id: fromBase64Url(c.id) })),
        },
    };
}

export function decodeRequestOptions(options) {
    const o = stripNulls(options);
    return {
        publicKey: {
            ...o,
            challenge: fromBase64Url(o.challenge),
            allowCredentials: (o.allowCredentials ?? []).map((c) => ({ ...c, id: fromBase64Url(c.id) })),
        },
    };
}

export function encodeCredential(credential) {
    const r = credential.response;
    return {
        id: credential.id,
        rawId: toBase64Url(credential.rawId),
        type: credential.type,
        response: {
            clientDataJSON: toBase64Url(r.clientDataJSON),
            ...(r.attestationObject ? { attestationObject: toBase64Url(r.attestationObject) } : {}),
            ...(r.authenticatorData ? { authenticatorData: toBase64Url(r.authenticatorData) } : {}),
            ...(r.signature ? { signature: toBase64Url(r.signature) } : {}),
            ...(r.userHandle ? { userHandle: toBase64Url(r.userHandle) } : {}),
        },
    };
}

/** Kullanıcı vazgeçtiyse (iptal) bunu sessiz kabul et, gerçek hataları ayır. */
export function isUserCancel(err) {
    return err?.name === 'NotAllowedError' || err?.name === 'AbortError';
}

/**
 * Oturum açıkken yeni passkey kaydeder. `api` nesnesi { registrationOptions(), register(body) }.
 */
export async function registerPasskey(api, name) {
    const opts = await api.registrationOptions();
    const credential = await navigator.credentials.create(decodeCreationOptions(opts.data.data));
    if (!credential) throw new Error('Passkey oluşturulmadı.');
    return api.register({ credential: encodeCredential(credential), name: name || undefined });
}

/**
 * Passkey ile giriş. `api` nesnesi { authOptions(body), authenticate(body) }.
 * `conditional` modda tarayıcı kullanıcıyı rahatsız etmeden giriş alanına
 * dokununca kayıtlı passkey'i önerir.
 */
export async function loginWithPasskey(api, { email, conditional = false, signal } = {}) {
    const res = await api.authOptions(email ? { email } : {});
    const { handle, options } = res.data.data;
    const request = decodeRequestOptions(options);
    if (conditional) request.mediation = 'conditional';
    if (signal) request.signal = signal;
    const credential = await navigator.credentials.get(request);
    if (!credential) throw new Error('Passkey seçilmedi.');
    const result = await api.authenticate({ handle, credential: encodeCredential(credential), device_name: 'web' });
    return result.data.data;
}
