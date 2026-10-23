import React, { memo } from 'react';
import { renderItemIcon } from '../../../game/kesif/render/itemIcons.js';
import { itemByKey } from '../../../game/kesif/sim/items.js';
import { hexColor } from './panelUtils.js';

/*
 * Eşya simgesi: itemIcons.renderItemIcon (dataURL, önbellekli). Canvas yoksa ('' döner) eşyanın
 * rengiyle yuvarlak köşeli bir yedek rozet çizilir; simge süstür (ad yuvanın etiketindedir).
 */
const PanelItemIcon = ({ item, size = 64, className = '', ench = false }) => {
    if (!item) return null;
    const url = renderItemIcon(item, size);
    if (url && ench) {
        // büyülü eşya: simge siluetine kırpılmış mor ışıltı (CSS mask; hareket azaltmada durağan parıltı)
        return (
            <span className={`kp-icon kp-glint ${className}`} style={{ '--kp-mask': `url("${url}")` }} aria-hidden="true">
                <img src={url} alt="" draggable={false} />
            </span>
        );
    }
    if (url) {
        return <img className={`kp-icon ${className}`} src={url} alt="" draggable={false} aria-hidden="true" />;
    }
    const it = itemByKey(item);
    const letter = it && it.name ? it.name.charAt(0).toLocaleUpperCase('tr-TR') : '?';
    return (
        <span className={`kp-icon kp-icon-fallback ${className}`} style={{ background: hexColor(it ? it.color : undefined) }} aria-hidden="true">
            {letter}
        </span>
    );
};

export default memo(PanelItemIcon);
