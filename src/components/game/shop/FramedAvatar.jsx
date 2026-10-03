import React, { memo, useState } from 'react';
import ShopArt from './ShopArt';
import { getDesign } from '../../../game/shop';
import { normalizeAvatarUrl } from '../../../utils/avatarUrl';

/*
 * Profil fotoğrafı + çerçeve (F.2): çerçeve 200×200, fotoğraf merkezde r=70
 * → kutunun %70'i; çerçeve süsleri kalan halkada. Çerçeve yoksa aynı yerde
 * ince halka (önizlemede çerçeve değiştirirken boyut zıplamasın).
 * Fotoğraf yoksa/yüklenemezse baş harf.
 */

const PALETTE = ['#FF6B6B', '#F59E0B', '#10B981', '#0EA5E9', '#6366F1', '#A855F7', '#EC4899'];

function initialsOf(name) {
    const s = String(name || '?').trim();
    return (s[0] || '?').toLocaleUpperCase('tr-TR');
}

function colorOf(name) {
    let h = 0;
    const s = String(name || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
}

export const PhotoCircle = ({ src, name, className = '' }) => {
    const [failedSrc, setFailedSrc] = useState(null);
    const url = normalizeAvatarUrl(src);
    const usable = url && !String(url).includes('default') && failedSrc !== url;
    if (usable) {
        return (
            <img
                src={url}
                alt=""
                loading="lazy"
                decoding="async"
                onError={() => setFailedSrc(url)}
                className={`block h-full w-full rounded-full object-cover ${className}`}
            />
        );
    }
    // Baş harf SVG metni: kutu boyutuna kendiliğinden ölçeklenir (konteyner gerekmez)
    return (
        <svg viewBox="0 0 100 100" className={`block h-full w-full rounded-full ${className}`} aria-hidden="true" focusable="false">
            <circle cx="50" cy="50" r="50" fill={colorOf(name)} />
            <text x="50" y="52" textAnchor="middle" dominantBaseline="central" fontSize="46" fontWeight="800" fill="#FFFFFF" fontFamily="Inter, system-ui, sans-serif">
                {initialsOf(name)}
            </text>
        </svg>
    );
};

const FramedAvatar = ({ user, frameKey, size = 96, animate = true, label, className = '' }) => {
    const frame = getDesign(frameKey);
    const hasFrame = frame?.category === 'frame';
    const dim = typeof size === 'number' ? `${size}px` : size;
    const name = user?.username || user?.name || '';
    const a11y = label === false
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': label || `${name || 'Kullanıcı'} profil fotoğrafı${hasFrame ? `, ${frame.name} çerçevesi` : ''}` };

    return (
        <span
            className={`relative inline-block shrink-0 align-middle ${className}`}
            style={{ width: dim, height: dim }}
            data-testid="framed-avatar"
            data-frame={hasFrame ? frameKey : ''}
            {...a11y}
        >
            <span className={`absolute overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 ${hasFrame ? '' : 'ring-4 ring-white shadow-lg dark:ring-slate-800'}`} style={{ inset: '15%' }}>
                <PhotoCircle src={user?.avatar} name={name} />
            </span>
            {hasFrame && (
                <ShopArt itemKey={frameKey} animate={animate} className="pointer-events-none absolute inset-0 h-full w-full" />
            )}
        </span>
    );
};

export default memo(FramedAvatar);
