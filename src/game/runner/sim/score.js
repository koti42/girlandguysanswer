/*
 * Puanlama (şartname §3.7). Sunucu otoritedir; istemci HUD'u aynı fonksiyonu
 * kullanır. correct[k] === true doğru, === false yanlış; null/eksik = sonucu
 * henüz bilinmiyor → çarpan değişmemiş sayılır (sonuç gelince puan geriye
 * dönük düzelir).
 *
 *   mult_0 = 1; kapı sonrası: doğru → min(mult + 1, 5), yanlış → 1
 *   distPoints = floor(Σ segMm[i] × mult_i / 1000)
 *   coinPoints = coins × 10
 *   gatePoints = Σ_{doğru k} 200 × (k sonrası çarpan)
 */
import { C } from './constants.js';

export function computeScore({ segMm, coins, gates, correct }) {
    const ok = correct || [];
    let mult = 1;
    let maxMult = 1;
    let gatePoints = 0;
    const multipliers = [1];
    for (let i = 0; i < gates.length; i++) {
        const k = gates[i].index;
        const c = ok[k];
        if (c === true) {
            mult = mult + 1 < C.MULT_MAX ? mult + 1 : C.MULT_MAX;
            gatePoints += C.GATE_POINTS * mult;
        } else if (c === false) {
            mult = 1;
        }
        if (mult > maxMult) maxMult = mult;
        multipliers.push(mult);
    }

    // segMm[i] i kapı geçildikten sonraki parça; segMm.length = gates.length + 1.
    let sum = 0;
    for (let i = 0; i < segMm.length; i++) {
        sum += segMm[i] * (i < multipliers.length ? multipliers[i] : mult);
    }
    const distPoints = Math.floor(sum / 1000);
    const coinPoints = coins * C.COIN_POINTS;

    return {
        score: distPoints + coinPoints + gatePoints,
        distPoints,
        coinPoints,
        gatePoints,
        multipliers,
        finalMult: mult,
        maxMult,
    };
}
