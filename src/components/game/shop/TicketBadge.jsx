import React from 'react';

/*
 * Sohbet balonunda `via_ticket` etiketi (F.6). Alıcıya ayrıca ne
 * yapabileceğini kısaca söyler (yanıt / yok say / şikâyet / engelle).
 */
const TicketBadge = ({ mine = false, className = '' }) => (
    <div className={`mb-1.5 ${className}`} data-testid="ticket-badge">
        <span className="inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-0.5 text-[10px] font-bold dark:bg-white/15">
            <span aria-hidden="true">🎟️</span> Mesaj Bileti ile gönderildi
        </span>
        {!mine && (
            <p className="mt-1 text-[10px] leading-snug opacity-85">
                Yanıt verirsen sohbet açılır. İstemiyorsan yok sayabilir, profilinden şikâyet edebilir ya da engelleyebilirsin.
            </p>
        )}
    </div>
);

export default TicketBadge;
