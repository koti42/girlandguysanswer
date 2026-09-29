import React, { useEffect, useRef } from 'react';
import useNow from './useNow';
import { formatCountdown } from './gameUtils';

/** Hedef zamana (ms, epoch) kalan süreyi canlı gösterir. */
const Countdown = ({ target, onDone, className = '' }) => {
    const now = useNow(1000);
    const left = Math.max(0, target - now);
    const doneRef = useRef(false);

    useEffect(() => {
        if (left <= 0 && !doneRef.current) {
            doneRef.current = true;
            onDone?.();
        }
    }, [left, onDone]);

    return (
        <time className={`tabular-nums ${className}`} aria-label={`Kalan süre ${formatCountdown(left)}`}>
            {formatCountdown(left)}
        </time>
    );
};

export default Countdown;
