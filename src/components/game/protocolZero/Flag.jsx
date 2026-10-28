import React from 'react';
import { AU, BR, DE, EG, GB, IN, IS, JP, KR, RU, SG, TR, US } from 'country-flag-icons/react/3x2';

/*
 * SVG bayrak (Windows'ta bayrak emojileri çizilmez; "TR" harfleri görünürdü). Düğüm ülke kodu → bileşen.
 * Yuvarlak avatar olarak çizilir (referans tasarımdaki bayrak listesi gibi).
 */
const FLAGS = { TR, EU: DE, 'US-E': US, 'US-W': US, UK: GB, RU, JP, SG, AU, BR, EG, IN, KR, IS };

const Flag = ({ code, size = 28, className = '', title }) => {
    const Cmp = FLAGS[code];
    const style = { width: size, height: size };
    if (!Cmp) {
        return (
            <span className={`inline-flex items-center justify-center rounded-full bg-white/10 text-[10px] font-black text-white ${className}`} style={style} aria-hidden="true">
                {String(code || '?').slice(0, 2)}
            </span>
        );
    }
    return (
        <span className={`inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-white/30 shadow-[0_0_10px_rgba(0,0,0,0.5)] ${className}`} style={style} title={title} aria-hidden="true">
            <Cmp style={{ width: '150%', height: '100%', marginLeft: '-25%' }} />
        </span>
    );
};

export default Flag;
