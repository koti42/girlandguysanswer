/*
 * Mağaza / Mesaj Bileti hata sınıflandırması.
 *
 * Ayrı modül: useTicketCheck her sohbet penceresinde çalışır; shopUtils'i
 * içe aktarmak tasarım kayıt defterini (41 tasarım) ve gameApi'yi sohbet
 * paketine çekerdi. shopUtils bunu aynen yeniden dışa aktarır.
 */

import { gameErrorData, gameErrorMessage, gameErrorStatus } from '../../../services/gameErrors';

/** Hata sınıflandırma: { status, reason, message }. */
export function shopError(err, fallback) {
    const status = gameErrorStatus(err);
    const data = gameErrorData(err) || {};
    return {
        status,
        reason: typeof data.reason === 'string' ? data.reason : null,
        message: gameErrorMessage(err, fallback),
    };
}
