import React, { memo } from 'react';
import ShopArt from './ShopArt';
import { getDesign } from '../../../game/shop';

/*
 * Unvan rozeti (F.2 `style`): soldan sağa gradyan, ikon, metin. Metin koddaki
 * tasarımdan gelir (kullanıcı girdisi değil). `anim` yalnız epic/legendary
 * tasarımlarda: shimmer → kayan parıltı, pulse → hafif nabız; reduced-motion
 * ve `animate={false}` kapatır. Bilinmeyen anahtar → hiçbir şey çizilmez.
 */
const SIZES = {
    xs: { pill: 'h-5 gap-1 pl-1 pr-2 text-[10px]', icon: 'h-3.5 w-3.5' },
    sm: { pill: 'h-7 gap-1.5 pl-1.5 pr-3 text-xs', icon: 'h-5 w-5' },
    md: { pill: 'h-9 gap-2 pl-2 pr-4 text-sm', icon: 'h-6 w-6' },
    lg: { pill: 'h-12 gap-2.5 pl-2.5 pr-5 text-lg', icon: 'h-8 w-8' },
};

const TitlePill = ({ itemKey, size = 'sm', animate = true, className = '', srPrefix = 'Unvan: ' }) => {
    const design = getDesign(itemKey);
    const style = design?.category === 'title' ? design.style : null;
    if (!style || typeof style.text !== 'string') return null;
    const s = SIZES[size] || SIZES.sm;
    const colors = Array.isArray(style.colors) && style.colors.length ? style.colors : ['#6B7385', '#4B5263'];
    const anim = animate && (style.anim === 'shimmer' || style.anim === 'pulse') ? ` shop-pill-${style.anim}` : '';

    return (
        <span
            className={`shop-pill inline-flex max-w-full shrink-0 items-center rounded-full font-extrabold leading-none shadow-sm ring-1 ring-black/10 ${s.pill}${anim} ${className}`}
            style={{ backgroundImage: `linear-gradient(90deg, ${colors.join(', ')})`, color: style.textColor || '#FFFFFF' }}
            data-testid="title-pill"
            data-title-key={itemKey}
        >
            {style.icon && <ShopArt icon={style.icon} className={`shrink-0 ${s.icon}`} />}
            <span className="truncate">
                {srPrefix && <span className="sr-only">{srPrefix}</span>}
                {style.text}
            </span>
        </span>
    );
};

export default memo(TitlePill);
