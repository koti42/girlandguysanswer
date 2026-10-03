/*
 * Mesaj Bileti (SPEC_V2 §F.6) — kural metinleri ve yanıt normalizasyonu.
 * Kurallar sunucuda uygulanır; burası yalnızca anlatır.
 */

/*
 * Mesaj Bileti öğe anahtarı. game/shop'taki TICKET_MESSAGE_KEY ile aynı
 * değer (testle eşitliği doğrulanır); oradan içe aktarılmaz çünkü o modül
 * yüklenirken 41 tasarımlık kayıt defterini kurar ve bu dosya her sayfadaki
 * sohbet penceresi yolunda.
 */
export const TICKET_MESSAGE_KEY = 'ticket:message';

export const TICKET_MAX_LEN = 500;
export const TICKET_SHOP_URL = `/oyun/magaza?kategori=consumable&urun=${encodeURIComponent(TICKET_MESSAGE_KEY)}`;

export const TICKET_RULES = [
    'Bilet yalnızca kişi mesajlarını kapatmışsa ya da sana kapalıysa kullanılır; kullanınca 1 bilet düşer.',
    'Yalnızca metin, en fazla 500 karakter. Bağlantı ve iletişim bilgisi kuralları normal mesajlarla aynıdır.',
    'Mesajın, alıcıya “Mesaj Bileti ile gönderildi” etiketiyle mesaj isteği olarak gider.',
    'Alıcı yanıtlarsa sohbet açılır; yanıtlamazsa aynı kişiye ikinci bir mesaj gönderemezsin.',
    'Alıcı mesajını yok sayabilir, şikâyet edebilir ya da seni engelleyebilir. Lütfen saygılı ol.',
];

/** Kullanılamama nedenlerinin kullanıcı metni. */
export function ticketReasonText(reason, username) {
    const who = username ? `@${username}` : 'Bu kişi';
    switch (reason) {
        case 'blocked':
            return 'Aranızda engelleme olduğu için Mesaj Bileti ile de mesaj gönderilemez.';
        case 'not_needed':
            return `${who} mesajlara açık; bilet gerekmez, doğrudan yazabilirsin.`;
        case 'recipient_opted_out':
            return `${who}, Mesaj Bileti ile gelen mesajları kabul etmiyor. Biletin harcanmaz.`;
        case 'already_used':
            return `${who} kişisine son 90 gün içinde Mesaj Bileti ile yazdın. Yanıt verirse sohbet açılır; o zamana kadar ikinci bir mesaj gönderilemez.`;
        case 'daily_limit':
            return 'Bugünkü Mesaj Bileti hakkını doldurdun (günde en fazla 2). Yarın tekrar deneyebilirsin.';
        case 'account_too_new':
            return 'Mesaj Bileti kullanabilmek için hesabının en az 7 günlük olması gerekiyor.';
        case 'recipient_unavailable':
            return 'Bu kişiye şu an ulaşılamıyor.';
        case 'no_ticket':
            return 'Hiç Mesaj Biletin yok. Mağazadan jetonla alabilirsin.';
        default:
            return 'Mesaj Bileti şu an kullanılamıyor.';
    }
}

export function normalizeTicketCheck(data) {
    const n = (v) => {
        const x = Number(v);
        return Number.isFinite(x) ? Math.max(0, Math.trunc(x)) : 0;
    };
    return {
        needs_ticket: !!data?.needs_ticket,
        can_use: !!data?.can_use,
        reason: typeof data?.reason === 'string' ? data.reason : null,
        tickets: n(data?.tickets),
        price: n(data?.price),
        recipient: data?.recipient && typeof data.recipient === 'object'
            ? { username: String(data.recipient.username || ''), avatar: data.recipient.avatar || null }
            : null,
    };
}
