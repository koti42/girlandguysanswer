import React, { memo } from 'react';
import ShopArt from './ShopArt';
import { getDesign } from '../../../game/shop';

/*
 * Mini avatar rozeti (64×64 tasarım, 16–24 px'te de okunaklı). Profilde
 * kullanıcı adının yanında, liderlik satırlarında. `label` false ise süs
 * (yanında zaten ad yazıyorsa). Bilinmeyen anahtar → null.
 */
const MiniAvatarBadge = ({ itemKey, size = 24, animate = true, label, className = '' }) => {
    const design = getDesign(itemKey);
    if (!design || design.category !== 'mini_avatar') return null;
    const a11y = label === false ? undefined : label || `Mini avatar: ${design.name}`;
    return (
        <ShopArt
            itemKey={itemKey}
            size={size}
            animate={animate}
            label={a11y}
            className={`inline-block shrink-0 align-middle drop-shadow-sm ${className}`}
        />
    );
};

export default memo(MiniAvatarBadge);
