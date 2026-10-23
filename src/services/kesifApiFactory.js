/*
 * Herkesler Keşfediyor istemci fabrikası.
 *
 * Sözleşme: girlsandguys-api-v10/docs/GAME_API.md ("Herkesler Keşfediyor").
 * towerApi.js ile aynı zarf: her fonksiyon `{ success, message, data }`
 * içindeki `data`'yı döndürür, hata olduğu gibi fırlatılır (durum kodu,
 * metin ve `data.reason` için gameErrors.js).
 *
 * Bu dosya `services/api.js`'i (site oturumu, localStorage jetonu) İÇE
 * AKTARMAZ: mobil gömme (embed) kendi bellek jetonlu axios örneğini
 * `createKesifApi(http)`'ye verebilsin. Site için hazır örnek kesifApi.js'te.
 * `http` yalnızca `get/post/put/delete(url, [data], config)` sunmalı (axios).
 *
 * Değiştiren her çağrı taze Idempotency-Key alır: api.js aynı gövdeye 15 sn
 * boyunca aynı anahtarı veriyor, sunucudaki ara katman da hata yanıtlarını
 * anahtarla saklıyor. "Hak al"a art arda iki bilinçli basış aynı gövdedir;
 * her çağrı kendi anahtarıyla gider (çift dokunmayı arayüz kilitler, sunucu
 * profil satırı kilidiyle sıraya sokar).
 *
 * İstek başına zaman aşımı: mobil ağda askıda kalan bağlantı arayüzü
 * kilitlemesin; zaman aşımında `response` olmadığı için hata "ağ" sayılır.
 */

const unwrap = (res) => res?.data?.data ?? {};

/**
 * Neon Meridyen jeton talepleri (tek-seferlik; tutar sunucuda sabit: 20/40/60/30). Anahtar listesi motorun cityEvents.NEON_CLAIMS ve API config/game_kesif.php
 * `rewards.neon` ile birebir aynıdır (kesif/sim/city/cityEvents.test.js çapraz denetler). Kredi (şehir-yerel para) hiçbir zaman jetona çevrilmez.
 */
export const NEON_CLAIM_KEYS = Object.freeze(['neon:firstjob', 'neon:goldrace', 'neon:chips60', 'neon:easter']);

/** Taze Idempotency-Key başlığı (yazma çağrıları). */
export const freshKey = () => ({
    headers: {
        'Idempotency-Key':
            typeof window !== 'undefined' && window.crypto?.randomUUID
                ? window.crypto.randomUUID()
                : `kesif_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    },
});

const cfg = (ms) => ({ ...freshKey(), timeout: ms });
const read = (ms) => ({ timeout: ms });
const mapPath = (id, tail = '') => `/game/kesif/maps/${encodeURIComponent(id)}${tail ? `/${tail}` : ''}`;

/** Boş / tanımsız sorgu değerlerini at; sunucu `q=` ile `page=` istemiyor. */
export function cleanParams(params = {}) {
    const out = {};
    Object.keys(params).forEach((k) => {
        const v = params[k];
        if (v === undefined || v === null) return;
        if (typeof v === 'string' && v.trim() === '') return;
        out[k] = typeof v === 'string' ? v.trim() : v;
    });
    return out;
}

export function createKesifApi(http) {
    return {
        /** `{ profile, wallet, stats, community:{top}, claimed:[key], cloud_save:{exists,saved_at,bytes} }` */
        overview: () => http.get('/game/kesif/overview', read(15000)).then(unwrap),

        /**
         * Mağazada kuşanılan Keşif görünümlerim (özel; yalnız sahibine). `{ loadout: { portal, alet, asa, jet, arac, gecis } }`
         * Sunucu sahip olunmayan/geri alınmış öğeyi süzer; değerler anahtardır, çizim/skin istemcinin kayıt defterinden gelir
         * (normalizeKesifLoadout, game/shop). Oyun açılışında kısa zaman aşımı: yavaşsa varsayılan görünümle başlanır.
         */
        loadout: () => http.get('/game/kesif/loadout', read(2500)).then(unwrap),

        /** Herkese açık haritalar. `{ maps:[MapCard], pagination:{current_page,last_page,per_page,total} }` */
        maps: ({ sort = 'new', q, page = 1 } = {}) =>
            http.get('/game/kesif/maps', { params: cleanParams({ sort, q, page }), timeout: 15000 }).then(unwrap),
        /** Kendi haritalarım (her görünürlük/durum). `{ maps:[MapMine], profile }` */
        mine: () => http.get('/game/kesif/maps/mine', read(15000)).then(unwrap),
        /** Veri dahil tek harita. `{ map:{...MapCard, data} }` */
        map: (id) => http.get(mapPath(id), read(20000)).then(unwrap),
        /** Yeni harita (boş hak gerekir; özel başlar). `{ map, profile }` */
        // `key`: belirsiz sonuçtan (zaman aşımı/ağ) sonra AYNI form gönderimini yeniden denerken aynı Idempotency-Key;
        // sunucu ilk isteğin yanıtını tekrarlar, ikinci bir hak/harita yemez. Verilmezse her çağrı taze anahtar alır.
        createMap: ({ title, description, data, cover }, { key } = {}) =>
            http
                .post('/game/kesif/maps', cleanBody({ title, description, data, cover }), key ? { ...cfg(30000), headers: { 'Idempotency-Key': key } } : cfg(30000))
                .then(unwrap),
        /** Yalnızca verilen alanlar güncellenir. `{ map }` */
        updateMap: (id, { title, description, data, cover }) =>
            http.put(mapPath(id), cleanBody({ title, description, data, cover }), cfg(30000)).then(unwrap),
        /** Hakkı geri açar. `{ profile }` */
        deleteMap: (id) => http.delete(mapPath(id), cfg(15000)).then(unwrap),
        publish: (id) => http.post(mapPath(id, 'publish'), {}, cfg(15000)).then(unwrap),
        unpublish: (id) => http.post(mapPath(id, 'unpublish'), {}, cfg(15000)).then(unwrap),
        /** Aç/kapa. `{ liked, likes }` */
        like: (id) => http.post(mapPath(id, 'like'), {}, cfg(10000)).then(unwrap),
        /** `{ reported, duplicate, hidden }` */
        report: (id, { reason, note }) =>
            http.post(mapPath(id, 'report'), cleanBody({ reason, note: note ? String(note).trim() : undefined }), cfg(10000)).then(unwrap),
        /** Oynanma sayacı (günde bir kez sayılır). `{ counted, plays }` */
        play: (id) => http.post(mapPath(id, 'play'), {}, cfg(8000)).then(unwrap),

        /** 10.000 jeton -> +5 hak. `{ profile, wallet, purchased }` */
        buySlots: () => http.post('/game/kesif/slots/buy', {}, cfg(20000)).then(unwrap),

        /** Bulut macera kaydı. `{ save, saved_at, bytes }` */
        getSave: () => http.get('/game/kesif/save', read(20000)).then(unwrap),
        /** Kaydı üzerine yazar. `{ saved_at, bytes, stats }` */
        putSave: (save) => http.put('/game/kesif/save', { save }, cfg(30000)).then(unwrap),

        /**
         * Macera oyun oturumu (ödül kapısı). İdempotent: aynı dünya için var olan oturum döner.
         * `{ session: { world_code, mode, started_at, last_seen_at, play_seconds, elapsed_seconds, claims }, created }`
         * Idempotency-Key gerekmez (doğal idempotent).
         */
        playStart: (worldCode) =>
            http.post('/game/kesif/play/start', { world_code: String(worldCode || ''), mode: 'macera' }, read(10000)).then(unwrap),
        /**
         * Oyun süresi bildirimi: `playSeconds` = motorun toplam dünya oyun süresi (api.getStats().playTime).
         * Sunucu monoton ve makul sınırlı tutar (`clamped`). `{ session, created:false, clamped }`
         */
        playPing: (worldCode, playSeconds) =>
            http
                .post('/game/kesif/play/ping', { world_code: String(worldCode || ''), play_seconds: Math.max(0, Math.floor(Number(playSeconds) || 0)) }, read(10000))
                .then(unwrap),

        /**
         * Ödül talebi: tutar sunucuda sabit. `{ claimed, key, amount, granted, capped, wallet }`
         * Kapılar (sunucu): 422 `data.reason` = no_session | too_early (+remaining_seconds) | prerequisite (+requires) |
         * world_cap | lifetime_cap, 429 hourly_cap (+retry_after), 409 already_claimed.
         */
        claim: (key, seed) =>
            http.post('/game/kesif/claim', cleanBody({ key, seed: seed ? String(seed) : undefined }), cfg(15000)).then(unwrap),
        /**
         * Neon Meridyen talebi (yalnız NEON_CLAIM_KEYS; başka anahtar ağa çıkmadan reddedilir). Aynı yanıt ve hata sözleşmesi `claim` ile aynıdır
         * (409 already_claimed = zaten alınmış, 422 too_early/world_cap/lifetime_cap, 429 hourly_cap).
         */
        claimNeon: (key, seed) =>
            NEON_CLAIM_KEYS.includes(key)
                ? http.post('/game/kesif/claim', cleanBody({ key, seed: seed ? String(seed) : undefined }), cfg(15000)).then(unwrap)
                : Promise.reject(Object.assign(new Error('Geçersiz talep anahtarı.'), { response: { status: 400, data: { reason: 'invalid_key' } } })),
    };
}

function cleanBody(body) {
    const out = {};
    Object.keys(body).forEach((k) => {
        if (body[k] !== undefined) out[k] = body[k];
    });
    return out;
}
