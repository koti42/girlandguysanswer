import React from 'react';
import ShopArt from '../game/shop/ShopArt';
import { getDesign } from '../../game/shop';

/*
 * Profil başlığındaki fotoğrafın (ProfileAvatar, 128 px) etrafına mağaza
 * çerçevesi (F.2). Çerçeve 200×200, fotoğraf r=70 → 128 px fotoğraf için
 * çerçeve kutusu 128/0.7 ≈ 183 px; kenarlar fotoğrafın 27,5 px dışına taşar.
 * Çerçeve tıklamaları geçirir (fotoğraf büyütme / yükleme aynen çalışır).
 * Çerçeve yoksa çocuğu olduğu gibi döndürür (düzen değişmez).
 */
const PHOTO = 128;
const BOX = Math.round(PHOTO / 0.7);
const PAD = (BOX - PHOTO) / 2;

const ProfileAvatarFrame = ({ frameKey, children }) => {
    const frame = getDesign(frameKey);
    if (!frame || frame.category !== 'frame') return children;
    return (
        <div
            className="relative shrink-0 self-start"
            style={{ width: BOX, height: BOX, margin: `-${PAD - 4}px -${PAD - 4}px -${PAD - 4}px -${PAD - 4}px` }}
            data-testid="profile-frame"
            data-frame={frameKey}
        >
            <div className="absolute" style={{ left: PAD, top: PAD, width: PHOTO, height: PHOTO }}>
                {children}
            </div>
            <ShopArt
                itemKey={frameKey}
                label={`${frame.name} çerçevesi`}
                className="pointer-events-none absolute inset-0 h-full w-full"
            />
        </div>
    );
};

export default ProfileAvatarFrame;
