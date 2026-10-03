import React from 'react';
import { LuShieldCheck } from 'react-icons/lu';
import { isUnderReview } from './resultReview';

/*
 * Sunucu oyunu otomatik kontrolde işaretlediyse (bkz. isUnderReview) sonuç
 * ekranında suçlamayan, nazik bir bilgi şeridi; işaret yoksa hiçbir şey
 * çizilmez. Sunucu metni gösterilmez: kullanıcıya hep aynı sakin açıklama.
 * Sunucu işaretli oyuna ödül vermez (XP/jeton/lig puanı/sıralama yok), metin
 * bunu "bekleyebilir" gibi yanlış bir beklenti yaratmadan söyler.
 */
const ResultReviewNote = ({ result, className = '' }) => {
    if (!isUnderReview(result)) return null;
    return (
        <p
            className={`mt-3 flex items-start gap-2 rounded-2xl bg-sky-400/15 px-3 py-2 text-left text-xs text-sky-50 ring-1 ring-sky-300/30 ${className}`}
            role="note"
            data-testid="result-review-note"
        >
            <LuShieldCheck className="mt-0.5 shrink-0 text-sm text-sky-200" aria-hidden="true" />
            <span>
                Bu oyun otomatik kontrolümüzde dikkat çekti ve kısa bir incelemeye alındı. Senin bir şey yapmana gerek yok; bu oyun
                için jeton ve sıralama puanı verilmedi.
            </span>
        </p>
    );
};

export default ResultReviewNote;
