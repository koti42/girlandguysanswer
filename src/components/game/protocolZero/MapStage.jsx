import React, { useEffect, useRef, useState } from 'react';
import { LuMinus, LuPlus } from 'react-icons/lu';
import { createWorldMap } from '../../../game/protocolZero/worldMap';
import { buildWorld } from '../../../game/protocolZero/regions';

/**
 * Taktik dünya haritası tuvali. world-atlas ülke sınırları (TopoJSON) ilk açılışta tembel yüklenir;
 * `onReady(map)` ile üst bileşen harita API'sini alır (update/setSelected/focusNode/setPaused). Sökülünce dispose.
 */
const MapStage = ({ onReady, onSelect, onPopBubble, onPacketArrive, lowPower = false, reducedMotion = false, onError }) => {
    const hostRef = useRef(null);
    const cbRef = useRef({ onReady, onSelect, onPopBubble, onPacketArrive, onError });
    const [loading, setLoading] = useState(true);
    const [api, setApi] = useState(null);

    useEffect(() => {
        cbRef.current = { onReady, onSelect, onPopBubble, onPacketArrive, onError };
    }, [onReady, onSelect, onPopBubble, onPacketArrive, onError]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return undefined;
        let map = null;
        let alive = true;
        import('world-atlas/countries-110m.json')
            .then((mod) => {
                if (!alive) return;
                const world = buildWorld(mod.default || mod);
                map = createWorldMap(host, {
                    world,
                    onSelect: (id, countryId) => cbRef.current.onSelect?.(id, countryId, world),
                    onPopBubble: (id) => cbRef.current.onPopBubble?.(id),
                    onPacketArrive: (from, to) => cbRef.current.onPacketArrive?.(from, to),
                    lowPower,
                    reducedMotion,
                });
                setApi(map);
                setLoading(false);
                cbRef.current.onReady?.(map, world);
            })
            .catch((err) => {
                if (alive) cbRef.current.onError?.(err);
            });
        return () => {
            alive = false;
            cbRef.current.onReady?.(null);
            map?.dispose();
        };
    }, [lowPower, reducedMotion]);

    return (
        <div className="pz-stage">
            <div ref={hostRef} className="absolute inset-0" aria-hidden="true" />
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center" role="status" aria-live="polite">
                    <div className="pz-glass rounded-2xl px-5 py-3 text-sm font-bold text-cyan-200">
                        <span className="pz-blink">▮</span> Uydu haritası yükleniyor…
                    </div>
                </div>
            )}
            {api && (
                <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 sm:right-3" aria-label="Yakınlaştırma">
                    <button type="button" className="pz-icon-btn !h-10 !w-10" onClick={api.zoomIn} aria-label="Yakınlaştır">
                        <LuPlus aria-hidden="true" />
                    </button>
                    <button type="button" className="pz-icon-btn !h-10 !w-10" onClick={api.zoomOut} aria-label="Uzaklaştır">
                        <LuMinus aria-hidden="true" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default MapStage;
