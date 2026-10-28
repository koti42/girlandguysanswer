import React, { useEffect, useRef } from 'react';
import { createGlobe } from '../../../game/protocolZero/globe';

/**
 * Three.js küresini bağlayan tuval katmanı. `onReady(globe)` ile üst bileşen küre API'sini alır
 * (update/setSelected/focusNode/setPaused). Sökülünce dispose.
 */
const GlobeStage = ({ onReady, onSelect, lowPower = false, reducedMotion = false, onError }) => {
    const hostRef = useRef(null);
    const labelsRef = useRef(null);
    const cbRef = useRef({ onReady, onSelect, onError });

    useEffect(() => {
        cbRef.current = { onReady, onSelect, onError };
    }, [onReady, onSelect, onError]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return undefined;
        let globe = null;
        try {
            globe = createGlobe(host, {
                labelsEl: labelsRef.current,
                onSelect: (id) => cbRef.current.onSelect?.(id),
                lowPower,
                reducedMotion,
            });
            cbRef.current.onReady?.(globe);
        } catch (err) {
            cbRef.current.onError?.(err);
        }
        return () => {
            cbRef.current.onReady?.(null);
            globe?.dispose();
        };
    }, [lowPower, reducedMotion]);

    return (
        <div className="pz-stage" aria-hidden="true">
            <div ref={hostRef} className="absolute inset-0" />
            <div ref={labelsRef} className="pz-labels" />
        </div>
    );
};

export default GlobeStage;
