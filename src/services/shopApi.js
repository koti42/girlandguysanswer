import api from './api';

/*
 * Jeton Mağazası ve Mesaj Bileti istemcisi (SPEC_V2 §F.5, §F.6).
 *
 * gameApi.js ile aynı zarf: her fonksiyon `{ success, message, data }`
 * içindeki `data`'yı döndürür; hata olduğu gibi fırlatılır (durum kodu,
 * metin ve `data.reason` için gameApi'nin `gameErrorStatus` /
 * `gameErrorMessage` / `gameErrorData` yardımcıları).
 *
 * Satın alma / kuşanma / bilet gönderimi her çağrıda taze Idempotency-Key
 * alır: api.js aynı gövdeye 15 sn boyunca aynı anahtarı veriyor; art arda
 * iki Mesaj Bileti satın almak (aynı gövde, bilerek iki ayrı işlem) ikinci
 * isteğin eski yanıtın tekrarını almasına yol açardı. Çift tıklamayı arayüz
 * kilitler, kozmetik çift alımı sunucu 409 ile reddeder.
 *
 * İstek başına zaman aşımı: mobil ağda askıda kalan bağlantı "Satın
 * alınıyor" durumunda arayüzü kilitlemesin.
 */

const unwrap = (res) => res?.data?.data ?? {};

const freshKey = () => ({
    headers: {
        'Idempotency-Key': window.crypto?.randomUUID
            ? window.crypto.randomUUID()
            : `shop_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    },
});

const cfg = (ms) => ({ ...freshKey(), timeout: ms });

export const shopApi = {
    /** `{ wallet, featured, categories, equipped, tickets, player }` */
    get: () => api.get('/game/shop', { timeout: 15000 }).then(unwrap),
    /** `{ wallet, item, tickets }` */
    buy: (item) => api.post('/game/shop/buy', { item }, cfg(15000)).then(unwrap),
    /**
     * `{ equipped, kesif_loadout? }` — gövde yalnız değişen yuvaları taşır (key ya da null).
     * Keşif görünümleri iç içe gider: `{ kesif: { portal: 'portal:neon-sokak' } }` (null = varsayılana dön).
     */
    equip: (slots) => api.put('/game/shop/equip', slots, cfg(15000)).then(unwrap),
    /** `{ loadout: { portal, alet, asa, jet, arac, gecis } }` — Keşif oyun görünümlerim (yalnız kendi verim). */
    kesifLoadout: () => api.get('/game/kesif/loadout', { timeout: 8000 }).then(unwrap),
    /** `{ transactions, pagination }` */
    transactions: (page = 1) =>
        api.get('/game/wallet/transactions', { params: { page }, timeout: 15000 }).then(unwrap),

    /** `{ needs_ticket, can_use, reason, tickets, price, recipient }` */
    checkMessageTicket: (username) =>
        api.get('/game/shop/tickets/message/check', { params: { username }, timeout: 15000 }).then(unwrap),
    /** `{ message, conversation_id?, tickets }` */
    sendTicketMessage: ({ username, body }) =>
        api.post('/game/shop/tickets/message', { username, body }, cfg(20000)).then(unwrap),
};

export default shopApi;
