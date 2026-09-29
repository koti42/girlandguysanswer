import React from 'react';
import useNow from './useNow';

const R = 26;
const C = 2 * Math.PI * R;

/**
 * Dairesel geri sayım.
 *
 * Son tarih (deadline) dışarıdan, sunucunun remaining_ms değerinden türetilir.
 * Saniyede 10 kez yalnızca bu bileşen yeniden çizilir; oyun ekranının geri
 * kalanı saat tıkırtısından etkilenmez. `running` kapalıyken `frozenMs`
 * (cevap anındaki kalan süre) gösterilir.
 */
const TimerRing = ({ deadline, running, frozenMs, totalMs = 15000, size = 72 }) => {
    const now = useNow(100, running);
    // `now` aşama yeni başladığında bir tık eski kalabilir: süre sınırına kırp.
    const remainingMs = Math.min(totalMs, running && deadline ? Math.max(0, deadline - now) : frozenMs ?? totalMs);
    const ratio = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
    const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
    const color = ratio > 0.5 ? '#34d399' : ratio > 0.25 ? '#fbbf24' : '#fb7185';
    const urgent = remainingMs > 0 && seconds <= 5;

    return (
        <div
            className={`relative shrink-0 ${urgent ? 'game-timer-urgent' : ''}`}
            style={{ width: size, height: size }}
            role="timer"
            aria-label={`Kalan süre ${seconds} saniye`}
        >
            <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" aria-hidden="true">
                <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="6" />
                <circle
                    cx="32"
                    cy="32"
                    r={R}
                    fill="none"
                    stroke={color}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={C}
                    strokeDashoffset={C * (1 - ratio)}
                    style={{ transition: 'stroke-dashoffset 120ms linear, stroke 300ms ease' }}
                />
            </svg>
            <span
                className="absolute inset-0 flex items-center justify-center text-xl font-extrabold tabular-nums"
                style={{ color }}
                aria-hidden="true"
            >
                {seconds}
            </span>
        </div>
    );
};

export default TimerRing;
