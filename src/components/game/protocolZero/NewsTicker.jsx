import React, { useMemo } from 'react';

/**
 * Ekranın en üstünde sağdan sola kesintisiz kayan "SON DAKİKA" haber bandı (olay günlüğünden beslenir).
 * `alert` doluyken bant kızıl parlar. Metin iki kez yan yana dizilir: animasyon yarıda sarınca kesintisiz görünür.
 */
const NewsTicker = ({ items, alert = false }) => {
    const text = useMemo(() => {
        const list = (items && items.length ? items : [{ text: 'Küresel ağ izleniyor. Tüm veri merkezleri çevrim içi.', kind: 'info' }]).slice(0, 8);
        const icon = { alert: '⚠ ', good: '✔ ', story: '📡 ', news: '📰 ', warn: '△ ' };
        return list.map((l) => `${icon[l.kind] || '• '}${l.text}`).join('      ▪      ');
    }, [items]);
    const seconds = Math.max(18, Math.min(70, text.length * 0.16));

    return (
        <div className={`pz-ticker ${alert ? 'pz-ticker-alert' : ''}`} role="marquee" aria-live="off" aria-label="Son dakika haber bandı">
            <span className="pz-ticker-tag">
                <span className="pz-blink">●</span> SON DAKİKA
            </span>
            <div className="pz-ticker-viewport">
                <div className="pz-ticker-track" style={{ animationDuration: `${seconds}s` }}>
                    <span className="pz-ticker-text">{text}</span>
                    <span className="pz-ticker-text" aria-hidden="true">{text}</span>
                </div>
            </div>
        </div>
    );
};

export default NewsTicker;
