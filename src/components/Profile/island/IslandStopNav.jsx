import React, { useEffect, useRef, useState } from 'react';
import { LuChevronLeft, LuChevronRight, LuEye, LuEyeOff } from 'react-icons/lu';
import { wrapIndex } from './islandUtils';

/*
 * Durak gezintisi: önceki/sonraki düğmeleri, nokta göstergeleri ve kartı
 * gizle/göster düğmesi. Düğmeler 44px hedef, klavyeyle gezilir. Durak
 * değişince (atalet sırasında geçilen duraklar susturulsun diye kısa
 * gecikmeyle) ekran okuyucuya "Durak 2 / 5: Sorular" bildirilir.
 */
const ANNOUNCE_DELAY_MS = 350;

const IslandStopNav = ({ stops, index, onSelect, cardOpen, onToggleCard, cardId }) => {
    const n = stops.length;
    const current = stops[index] || stops[0];
    const [announce, setAnnounce] = useState('');

    // İlk açılışta duyuru yok; yalnız durak değişince.
    const prevIndex = useRef(index);
    useEffect(() => {
        if (prevIndex.current === index) return undefined;
        prevIndex.current = index;
        const t = setTimeout(() => setAnnounce(`Durak ${index + 1} / ${n}: ${current.label}`), ANNOUNCE_DELAY_MS);
        return () => clearTimeout(t);
        // yalnız index değişimine tepki
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [index]);

    return (
        <nav className="ih-nav" aria-label="Ada durakları">
            <button
                type="button"
                className="ih-iconbtn"
                onClick={() => onSelect(wrapIndex(index - 1, n))}
                aria-label="Önceki durak"
            >
                <LuChevronLeft aria-hidden="true" />
            </button>

            <ol className="ih-dots">
                {stops.map((s, i) => (
                    <li key={s.key}>
                        <button
                            type="button"
                            className="ih-dot"
                            onClick={() => onSelect(i)}
                            aria-label={`${s.label} durağına git`}
                            aria-current={i === index ? 'step' : undefined}
                            data-active={i === index ? 'true' : 'false'}
                        >
                            <span className="ih-dot__mark" aria-hidden="true" />
                        </button>
                    </li>
                ))}
            </ol>

            <button
                type="button"
                className="ih-iconbtn"
                onClick={() => onSelect(wrapIndex(index + 1, n))}
                aria-label="Sonraki durak"
            >
                <LuChevronRight aria-hidden="true" />
            </button>

            {onToggleCard && (
                <button
                    type="button"
                    className="ih-iconbtn ih-iconbtn--ghost"
                    onClick={onToggleCard}
                    aria-expanded={cardOpen}
                    aria-controls={cardId}
                    aria-label={cardOpen ? 'Bilgi kartını gizle' : 'Bilgi kartını göster'}
                >
                    {cardOpen ? <LuEyeOff aria-hidden="true" /> : <LuEye aria-hidden="true" />}
                </button>
            )}

            <p className="sr-only" role="status" aria-live="polite" data-testid="island-live">
                {announce}
            </p>
        </nav>
    );
};

export default IslandStopNav;
