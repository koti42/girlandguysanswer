import React, { memo } from 'react';
import { FaCut, FaGem, FaGlasses, FaTshirt } from 'react-icons/fa';
import ShopArt from '../../../components/game/shop/ShopArt';
import TitlePill from '../../../components/game/shop/TitlePill';
import ItemIcon from '../../../components/game/avatar/ItemIcon';
import { getDesign } from '../../../game/shop';
import { designOf } from './shopUtils';

const HEX = /^#[0-9a-f]{3,8}$/i;

/*
 * Admin listeleri için küçük mağaza önizlemesi. Çizimi oyuncu tarafıyla aynı
 * ShopArt/TitlePill yapar (beyaz listeli etiket/özellik, örnek başına önekli
 * defs id'leri; veri yalnızca koddaki tasarım dosyalarından). Admin
 * tablosunda animasyon kapalı: onlarca satırda gereksiz hareket ve işlem yükü.
 * Bilinmeyen anahtar → nötr yer tutucu (çökme yok, sunucudan SVG alınmaz).
 */

const SLOT_ICONS = { hair: FaCut, top: FaTshirt, acc: FaGlasses };

function ShopItemPreview({ itemKey, size = 40, className = '' }) {
    const key = typeof itemKey === 'string' ? itemKey : '';
    const design = designOf(key);
    const box = `inline-grid place-items-center shrink-0 ${className}`;
    const dims = { width: size, height: size };
    const label = `Önizleme: ${design?.name || key || 'bilinmeyen'}`;

    if (design?.category === 'frame') {
        return (
            <span className={`${box} relative`} style={dims}>
                {/* Fotoğraf alanını (r=70) nötr bir diskle doldur: çerçeve boşlukta kaybolmasın. */}
                <span className="absolute rounded-full p-fill-strong" style={{ inset: '15%' }} aria-hidden />
                <ShopArt itemKey={key} size={size} label={label} animate={false} className="relative" />
            </span>
        );
    }
    if (design?.category === 'mini_avatar' || design?.category === 'consumable') {
        return <span className={box} style={dims}><ShopArt itemKey={key} size={size} label={label} animate={false} /></span>;
    }
    if (design?.category === 'title' && size < 64) {
        // Dar tablo hücresi: pill sığmaz → unvan renklerinde yuvarlak rozet + ikon (tam pill pencerede).
        const st = getDesign(key)?.style || {};
        const colors = (Array.isArray(st.colors) ? st.colors : []).filter((c) => HEX.test(c));
        const bg = colors.length > 1 ? `linear-gradient(135deg, ${colors.join(', ')})` : colors[0] || '#475569';
        return (
            <span className={`${box} rounded-full ring-1 ring-black/10`} style={{ ...dims, background: bg }} title={st.text || design.name}>
                {st.icon ? <ShopArt icon={st.icon} size={Math.round(size * 0.6)} label={label} animate={false} /> : <span className="sr-only">{label}</span>}
            </span>
        );
    }
    if (design?.category === 'title') {
        return (
            <span className={`${box} max-w-[220px]`} style={{ minHeight: size }} role="img" aria-label={label}>
                <TitlePill itemKey={key} size={size >= 80 ? "md" : "sm"} animate={false} srPrefix="" />
            </span>
        );
    }

    const tile = `${box} rounded-xl p-fill border border-[var(--p-border)]`;
    const slot = key.split(':')[0];
    const SlotIcon = SLOT_ICONS[slot];
    if (design?.category === 'avatar_part' && SlotIcon) {
        return <span className={`${tile} p-muted`} style={dims} role="img" aria-label={label}><SlotIcon style={{ fontSize: size * 0.42 }} aria-hidden /></span>;
    }
    if (design?.category === 'avatar_part') {
        return <span className={tile} style={dims} role="img" aria-label={label}><ItemIcon itemKey={key} color="#64748B" className="w-4/5 h-4/5" /></span>;
    }
    return <span className={`${tile} p-muted`} style={dims} role="img" aria-label="Önizleme yok"><FaGem style={{ fontSize: size * 0.38 }} aria-hidden /></span>;
}

export default memo(ShopItemPreview);
