/*
 * Kule girdi kaydı kodlaması (şartname §B.1, koşu §3.5 ile aynı biçim).
 *
 * "80T,95T,0A": virgülle ayrılmış `<delta><kod>` tokenları; delta bu girdinin
 * tick'i eksi öncekinin tick'i (ilk için eksi 0), kod ∈ T A B. Boş string =
 * girdi yok. En fazla 6000 token, tick başına en fazla 2 girdi. Sunucu aynı
 * kuralları uygular (TowerSim::decodeInputs); biri gevşerse istemcide geçerli
 * sayılan kayıt sunucuda reddedilir.
 */
import { TC } from './constants.js';

// Anlamı ^(?:\d{1,6}[TAB])(?:,\d{1,6}[TAB])*$ ile aynı; token token denetlenir.
const TOKEN_RE = /^([0-9]{1,6})([TAB])$/;

export class TowerInputError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TowerInputError';
    }
}

/**
 * String → [[tick, kod], ...] (tick'e göre sıralı).
 * Biçim ya da sınır ihlalinde TowerInputError (mesaj Türkçe).
 */
export function decodeTowerInputs(str, endTick = TC.MAX_TICKS) {
    if (!Number.isInteger(endTick) || endTick < 0 || endTick > TC.MAX_TICKS) {
        throw new TowerInputError('Oyun süresi geçersiz.');
    }
    if (typeof str !== 'string') {
        throw new TowerInputError('Girdi kaydı bozuk.');
    }
    if (str === '') return [];
    if (str.length > TC.MAX_INPUT_CHARS) {
        throw new TowerInputError('Girdi kaydı çok uzun.');
    }

    const tokens = str.split(',', TC.MAX_INPUT_TOKENS + 1);
    if (tokens.length > TC.MAX_INPUT_TOKENS) {
        throw new TowerInputError('Girdi kaydında çok fazla hamle var.');
    }

    const out = [];
    let tick = 0;
    let prevTick = -1;
    let sameTick = 0;
    for (let i = 0; i < tokens.length; i++) {
        const m = TOKEN_RE.exec(tokens[i]);
        if (m === null) {
            throw new TowerInputError('Girdi kaydı bozuk.');
        }
        tick += parseInt(m[1], 10);
        if (tick > endTick) {
            throw new TowerInputError('Girdi kaydı oyun süresini aşıyor.');
        }
        sameTick = tick === prevTick ? sameTick + 1 : 1;
        if (sameTick > TC.MAX_INPUTS_PER_TICK) {
            throw new TowerInputError('Aynı anda çok fazla hamle var.');
        }
        prevTick = tick;
        out.push([tick, m[2]]);
    }
    return out;
}

/** [[tick, kod], ...] → string. Liste tick'e göre sıralı olmalı. */
export function encodeTowerInputs(list) {
    let s = '';
    let prev = 0;
    for (let i = 0; i < list.length; i++) {
        const tick = list[i][0];
        const code = list[i][1];
        if (!Number.isInteger(tick) || tick < prev || (code !== 'T' && code !== 'A' && code !== 'B')) {
            throw new TowerInputError('Girdi listesi geçersiz.');
        }
        s += (i === 0 ? '' : ',') + (tick - prev) + code;
        prev = tick;
    }
    return s;
}
