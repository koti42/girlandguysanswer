import React, { useState } from 'react';
import { LuHand } from 'react-icons/lu';
import IslandPoster from './IslandPoster';
import { a11yDomOn, islandSupported, useIslandScene } from './islandUtils';
import './island.css';

/*
 * Satın alma penceresi için küçük canlı ada önizlemesi. Aynı motoru ve aynı
 * yedekleri kullanır: WebGL2 yok / erişilebilirlik modu / yükleme hatası
 * durumunda afiş ve kısa bir açıklama görünür, kutu hiç boş kalmaz. Hareket
 * azaltma açıksa motor sahneyi durağan çizer (animasyonsuz).
 */
const IslandPreview = ({ avatar = null, gender = null, className = '' }) => {
    const [eligible] = useState(() => !a11yDomOn() && islandSupported());
    const { hostRef, phase } = useIslandScene({ enabled: eligible, avatar, gender });
    const unavailable = !eligible || phase === 'failed';

    return (
        <div
            className={`ih-preview ${className}`}
            data-testid="island-preview"
            data-phase={unavailable ? 'poster' : phase}
        >
            <IslandPoster hidden={!unavailable && phase === 'ready'} />
            {!unavailable && (
                <div
                    ref={hostRef}
                    className="ih-stage"
                    role="img"
                    aria-label="Ada profili canlı önizlemesi. Adayı döndürmek için sürükleyebilirsin."
                />
            )}
            {!unavailable && phase === 'loading' && (
                <div className="ih-shimmer" role="status">
                    <span className="sr-only">Önizleme yükleniyor</span>
                </div>
            )}
            {unavailable && (
                <p className="ih-hint ih-hint--center" role="status">
                    Canlı önizleme bu cihazda kullanılamıyor.
                </p>
            )}
            {!unavailable && phase === 'ready' && (
                <p className="ih-hint" aria-hidden="true">
                    <LuHand aria-hidden="true" /> Döndürmek için sürükle
                </p>
            )}
        </div>
    );
};

export default IslandPreview;
