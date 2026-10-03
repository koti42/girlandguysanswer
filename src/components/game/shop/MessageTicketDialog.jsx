import React, { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCheck, LuMessageCircle, LuRotateCcw, LuShoppingBag } from 'react-icons/lu';
import GameDialog from '../avatar/GameDialog';
import ShopArt from './ShopArt';
import JetonAmount from './Jeton';
import { PhotoCircle } from './FramedAvatar';
import useTicketCheck from './useTicketCheck';
import { shopApi } from '../../../services/shopApi';
import { shopError } from './shopUtils';
import { TICKET_MAX_LEN, TICKET_RULES, TICKET_SHOP_URL, ticketReasonText } from './ticketUtils';
import { formatNumber } from '../gameUtils';

/*
 * Mesaj Bileti akışı (F.6): açılınca kurallar sunucuya sorulur (check) →
 *  - kullanılabilir: kurallar + metin alanı (≤ 500) → POST → "iletildi"
 *  - bilet yok: fiyat + mağaza bağlantısı
 *  - gerekmiyor: doğrudan sohbet bağlantısı
 *  - diğer nedenler: açıklama (bilet harcanmaz)
 * Gönderim tek seferlik (sendingRef); hata data.reason taşıyorsa ilgili
 * açıklamaya geçilir, yoksa metin pencerede kalır.
 *
 * Pencere her açılışta kuralları tazeler; çağıran taraf yalnızca açıkken
 * bağlar (`open && <MessageTicketDialog … />`) ki durum her seferinde sıfırlansın.
 */
const MessageTicketDialog = ({ open, username, onClose, onSent, showChatLink = true }) => {
    const textId = useId();
    const { status, data, error, refresh } = useTicketCheck(username, open);
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);
    const sendingRef = useRef(false);
    const [sendError, setSendError] = useState(null);
    const [failReason, setFailReason] = useState(null);
    const [sent, setSent] = useState(null);

    const trimmed = body.trim();
    const tooLong = body.length > TICKET_MAX_LEN;
    const reason = failReason || data?.reason || null;
    const canUse = !!data?.can_use && !failReason;

    const close = () => {
        if (sendingRef.current) return;
        onClose?.();
    };

    const submit = async (e) => {
        e?.preventDefault?.();
        if (sendingRef.current || !canUse || !trimmed || tooLong) return;
        sendingRef.current = true;
        setSending(true);
        setSendError(null);
        try {
            const res = await shopApi.sendTicketMessage({ username, body: trimmed });
            setSent(res || {});
            setBody('');
            onSent?.(res || {});
        } catch (err) {
            const info = shopError(err, 'Mesaj gönderilemedi. Lütfen tekrar dene.');
            if (info.reason) setFailReason(info.reason);
            setSendError(info.message);
        } finally {
            sendingRef.current = false;
            setSending(false);
        }
    };

    const recipient = data?.recipient?.username ? data.recipient : { username, avatar: null };

    let content;
    if (sent) {
        content = (
            <div className="space-y-4 text-center" data-testid="ticket-sent">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-3xl text-emerald-600 dark:text-emerald-300">
                    <LuCheck aria-hidden="true" />
                </div>
                <p className="font-bold" role="status">Mesajın @{recipient.username} kişisine iletildi.</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                    Yanıt verirse sohbetiniz açılır. Kalan biletin: {formatNumber(sent.tickets ?? Math.max(0, (data?.tickets ?? 1) - 1))}
                </p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
                    <button type="button" onClick={close} data-autofocus={showChatLink ? undefined : true} className="min-h-[48px] rounded-2xl px-5 font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">
                        {showChatLink ? 'Kapat' : 'Tamam'}
                    </button>
                    {showChatLink && (
                        <Link
                            to={`/messages/${encodeURIComponent(recipient.username)}`}
                            onClick={close}
                            data-autofocus
                            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-6 font-bold text-white game-press"
                        >
                            <LuMessageCircle aria-hidden="true" /> Sohbete git
                        </Link>
                    )}
                </div>
            </div>
        );
    } else if (status === 'loading' && !data) {
        content = (
            <div className="flex flex-col items-center gap-3 py-8" role="status" aria-live="polite">
                <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-coral border-t-transparent" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Kurallar kontrol ediliyor…</span>
            </div>
        );
    } else if (status === 'error' && !data) {
        content = (
            <div className="space-y-3 text-center" role="alert">
                <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>
                <button type="button" onClick={refresh} className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-slate-100 px-4 font-bold dark:bg-white/10">
                    <LuRotateCcw aria-hidden="true" /> Tekrar dene
                </button>
            </div>
        );
    } else if (canUse) {
        content = (
            <form onSubmit={submit} className="space-y-4" data-testid="ticket-compose">
                <div className="flex items-center gap-3 rounded-2xl bg-slate-100 p-3 dark:bg-white/5">
                    <span className="block h-11 w-11 shrink-0 overflow-hidden rounded-full">
                        <PhotoCircle src={recipient.avatar} name={recipient.username} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">@{recipient.username}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Mesajları kapalı · bilet ile tek mesaj</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-extrabold text-amber-700 dark:text-amber-300">
                        <span aria-hidden="true">🎟️</span> {formatNumber(data.tickets)} adet
                    </span>
                </div>

                <ul className="space-y-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {TICKET_RULES.map((rule) => (
                        <li key={rule} className="flex gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" aria-hidden="true" />
                            {rule}
                        </li>
                    ))}
                </ul>

                <div>
                    <label htmlFor={textId} className="mb-1 block text-sm font-bold">
                        Mesajın
                    </label>
                    <textarea
                        id={textId}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={4}
                        maxLength={TICKET_MAX_LEN + 50}
                        data-autofocus
                        aria-describedby={`${textId}-count`}
                        aria-invalid={tooLong || undefined}
                        placeholder="Kısa ve saygılı bir mesaj yaz…"
                        className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30 dark:border-white/15 dark:bg-white/5 dark:text-white"
                    />
                    <p id={`${textId}-count`} className={`mt-1 text-right text-xs tabular-nums ${tooLong ? 'font-bold text-rose-600' : 'text-slate-500 dark:text-slate-400'}`}>
                        {body.length}/{TICKET_MAX_LEN}
                    </p>
                </div>

                {sendError && (
                    <p className="rounded-2xl bg-rose-500/10 px-3 py-2.5 text-sm font-semibold text-rose-600 dark:text-rose-300" role="alert">
                        {sendError}
                    </p>
                )}

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={close} disabled={sending} className="min-h-[48px] rounded-2xl px-5 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10">
                        Vazgeç
                    </button>
                    <button
                        type="submit"
                        disabled={sending || !trimmed || tooLong}
                        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-coral px-6 font-bold text-slate-950 shadow-lg game-press disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <span aria-hidden="true">🎟️</span> {sending ? 'Gönderiliyor…' : 'Bileti kullan ve gönder'}
                    </button>
                </div>
            </form>
        );
    } else {
        const noTicket = reason === 'no_ticket';
        const notNeeded = reason === 'not_needed' || (data && !data.needs_ticket && !reason);
        content = (
            <div className="space-y-4" data-testid={`ticket-reason-${notNeeded ? 'not_needed' : reason || 'unknown'}`}>
                <div className="flex items-start gap-3">
                    <ShopArt icon="ticket" className="h-12 w-12 shrink-0" />
                    <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200" role="status">
                        {sendError && failReason ? sendError : ticketReasonText(notNeeded ? 'not_needed' : reason, recipient.username)}
                    </p>
                </div>
                {noTicket && data?.price > 0 && (
                    <p className="flex items-center gap-2 rounded-2xl bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
                        Mesaj Bileti fiyatı: <JetonAmount value={data.price} className="font-extrabold" />
                    </p>
                )}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={close} className="min-h-[48px] rounded-2xl px-5 font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">
                        Kapat
                    </button>
                    {noTicket && (
                        <Link
                            to={TICKET_SHOP_URL}
                            onClick={close}
                            data-autofocus
                            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-coral px-6 font-bold text-slate-950 game-press"
                        >
                            <LuShoppingBag aria-hidden="true" /> Mağazadan bilet al
                        </Link>
                    )}
                    {notNeeded && (
                        <Link
                            to={`/messages/${encodeURIComponent(recipient.username)}`}
                            onClick={close}
                            data-autofocus
                            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-6 font-bold text-white game-press"
                        >
                            <LuMessageCircle aria-hidden="true" /> Mesaj gönder
                        </Link>
                    )}
                </div>
            </div>
        );
    }

    return (
        <GameDialog open={open} title="Mesaj Bileti" onClose={close} dismissable={!sending}>
            {content}
        </GameDialog>
    );
};

export default MessageTicketDialog;
