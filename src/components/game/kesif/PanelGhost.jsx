import React from 'react';
import PanelItemIcon from './PanelItemIcon.jsx';

/* Sürüklenen yığının parmağı/imleci izleyen hayaleti (konumu useSlotDrag ref ile günceller). */
const PanelGhost = ({ slot, ghostRef }) => {
    if (!slot) return null;
    return (
        <div ref={ghostRef} className="kp-ghost" aria-hidden="true" data-testid="drag-ghost">
            <PanelItemIcon item={slot.item} size={64} ench={!!slot.ench} />
            {slot.count > 1 ? <span className="kp-count">{slot.count}</span> : null}
        </div>
    );
};

export default PanelGhost;
