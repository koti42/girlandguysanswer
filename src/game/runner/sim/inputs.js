/*
 * Girdi kaydı kodlaması (şartname §3.5).
 *
 * "75J,40L,0S": virgülle ayrılmış `<delta><kod>` tokenları; delta bu girdinin
 * tick'i eksi öncekinin tick'i (ilk için eksi 0), kod ∈ L R J S. Boş string =
 * girdi yok. Sunucu aynı kuralları uygular (RunnerSim::decodeInputs); biri
 * gevşerse istemcide geçerli sayılan kayıt sunucuda reddedilir.
 */
import { C } from './constants.js';

// Tek dev regex yerine token token: anlamı ^(?:\d{1,6}[LRJS])(?:,\d{1,6}[LRJS])*$ ile aynı.
const TOKEN_RE = /^([0-9]{1,6})([LRJS])$/;

export class InputFormatError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InputFormatError';
    }
}

/**
 * String → [[tick, kod], ...] (tick'e göre sıralı).
 * Biçim ya da sınır ihlalinde InputFormatError (mesaj Türkçe).
 */
export function decodeInputs(str, endTick = C.MAX_TICKS) {
    if (!Number.isInteger(endTick) || endTick < 0 || endTick > C.MAX_TICKS) {
        throw new InputFormatError('Koşu süresi geçersiz.');
    }
    if (typeof str !== 'string') {
        throw new InputFormatError('Girdi kaydı bozuk.');
    }
    if (str === '') return [];
    if (str.length > C.MAX_INPUT_CHARS) {
        throw new InputFormatError('Girdi kaydı çok uzun.');
    }

    const tokens = str.split(',', C.MAX_INPUT_TOKENS + 1);
    if (tokens.length > C.MAX_INPUT_TOKENS) {
        throw new InputFormatError('Girdi kaydında çok fazla hamle var.');
    }

    const out = [];
    let tick = 0;
    let prevTick = -1;
    let sameTick = 0;
    for (let i = 0; i < tokens.length; i++) {
        const m = TOKEN_RE.exec(tokens[i]);
        if (m === null) {
            throw new InputFormatError('Girdi kaydı bozuk.');
        }
        tick += parseInt(m[1], 10);
        if (tick > endTick) {
            throw new InputFormatError('Girdi kaydı koşu süresini aşıyor.');
        }
        sameTick = tick === prevTick ? sameTick + 1 : 1;
        if (sameTick > C.MAX_INPUTS_PER_TICK) {
            throw new InputFormatError('Aynı anda çok fazla hamle var.');
        }
        prevTick = tick;
        out.push([tick, m[2]]);
    }
    return out;
}

/** [[tick, kod], ...] → string. Liste tick'e göre sıralı olmalı. */
export function encodeInputs(list) {
    let s = '';
    let prev = 0;
    for (let i = 0; i < list.length; i++) {
        const tick = list[i][0];
        const code = list[i][1];
        if (!Number.isInteger(tick) || tick < prev || 'LRJS'.indexOf(code) < 0 || code.length !== 1) {
            throw new InputFormatError('Girdi listesi geçersiz.');
        }
        s += (i === 0 ? '' : ',') + (tick - prev) + code;
        prev = tick;
    }
    return s;
}
