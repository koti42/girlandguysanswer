import React from 'react';
import { Link } from 'react-router-dom';
import { LuShoppingBag } from 'react-icons/lu';
import { TICKET_SHOP_URL, ticketReasonText } from './ticketUtils';
import { formatNumber } from '../gameUtils';

/*
 * Sohbet alt şeridi: alıcı mesaj almıyorsa (check.needs_ticket) mesaj kutusu
 * yerine bu çıkar. Bilet kullanılabiliyorsa "Mesaj Bileti kullan (x adet)",
 * bilet yoksa mağaza bağlantısı, kullanılamıyorsa nedeni.
 */
const MessageTicketBanner = ({ check, username, onUse }) => {
    if (!check?.needs_ticket) return null;
    const { can_use: canUse, reason, tickets } = check;

    return (
        <div
            className="mx-2 mb-2 rounded-2xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100"
            role="region"
            aria-label="Mesaj Bileti"
            data-testid="ticket-banner"
        >
            <p className="font-bold">Bu kişi şu an mesaj almıyor.</p>
            {canUse ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs opacity-90">Mesaj Bileti ile tek bir saygılı mesaj gönderebilirsin.</p>
                    <button
                        type="button"
                        onClick={onUse}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-coral px-4 text-sm font-bold text-slate-950 shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
                    >
                        <span aria-hidden="true">🎟️</span> Mesaj Bileti kullan ({formatNumber(tickets)} adet)
                    </button>
                </div>
            ) : reason === 'no_ticket' ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs opacity-90">{ticketReasonText('no_ticket', username)}</p>
                    <Link
                        to={TICKET_SHOP_URL}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-coral px-4 text-sm font-bold text-slate-950 shadow"
                    >
                        <LuShoppingBag aria-hidden="true" /> Mağazadan bilet al
                    </Link>
                </div>
            ) : (
                <p className="mt-1 text-xs opacity-90">{ticketReasonText(reason, username)}</p>
            )}
        </div>
    );
};

export default MessageTicketBanner;
