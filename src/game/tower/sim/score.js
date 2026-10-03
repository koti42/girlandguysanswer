/*
 * Kule puanı (şartname §B.1): score = basePoints + 150 × doğru cevap.
 * Sunucu otoritedir; istemci HUD'u aynı fonksiyonu kullanır.
 *
 * correct[index] iki biçimde verilebilir:
 *  - true / false: o soru doğru mu cevaplandı (sunucu, fikstürler)
 *  - tamsayı: doğru şıkkın indeksi (istemci setAnswerResult'tan bilir) →
 *    cevabın choice'u bununla karşılaştırılır
 * null/eksik = sonucu henüz bilinmiyor → sayılmaz. Cevapsız (choice -1) hiçbir
 * zaman doğru sayılmaz.
 */
import { TC } from './constants.js';

export function computeTowerScore({ basePoints, answers, correct }) {
    const ok = correct || [];
    const list = answers || [];
    let correctCount = 0;
    for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (a.choice < 0) continue;
        const c = ok[a.index];
        if (c === true || (Number.isInteger(c) && c === a.choice)) correctCount++;
    }
    return {
        score: basePoints + TC.CORRECT_POINTS * correctCount,
        correctCount,
    };
}
