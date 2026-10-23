import React, { memo } from 'react';
import ShopArt from './ShopArt';
import TitlePill from './TitlePill';
import FramedAvatar from './FramedAvatar';
import AvatarBust from '../avatar/AvatarBust';
import ItemIcon from '../avatar/ItemIcon';
import { withStyle } from '../avatar/avatarUtils';
import { getDesign } from '../../../game/shop';
import { normalizeAvatar } from '../../../game/avatar/catalog';

/*
 * Kategoriye göre öğe önizlemesi (kart ve çekmece):
 *  frame       → çerçeve + nötr silüet (çekmecede kullanıcının fotoğrafı)
 *  mini_avatar → mini avatar
 *  title       → unvan rozeti
 *  kesif       → şablondan üretilmiş 2B önizleme (portal tabancası, aletler, asa, jetpack, araç, geçiş)
 *  avatar_part → karakter portresi (saç/üst/aksesuar) ya da parça simgesi
 *  consumable  → bilet ikonu
 * Kodda tasarımı olmayan anahtar → kategori ikonu (asla sunucudan SVG değil).
 */

const BUST_SLOTS = new Set(['hair', 'top', 'acc']);
const FALLBACK_ICON = { frame: 'frame', mini_avatar: 'mini', title: 'title', kesif: 'compass', avatar_part: 'avatar', consumable: 'ticket' };

const Silhouette = () => (
    <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" aria-hidden="true" focusable="false">
        <circle cx="100" cy="100" r="70" fill="#3B3466" />
        <circle cx="100" cy="86" r="22" fill="#6C6499" />
        <path d="M56 158c4-26 22-40 44-40s40 14 44 40a70 70 0 0 1-88 0z" fill="#6C6499" />
    </svg>
);

const ShopItemPreview = ({ item, variant = 'card', user = null, avatar = null, gender = null, animate = true }) => {
    const key = item?.key;
    const design = getDesign(key);
    const big = variant === 'big';

    if (design?.category === 'frame') {
        if (big && user) {
            return <FramedAvatar user={user} frameKey={key} size="100%" animate={animate} label={false} />;
        }
        return (
            <span className="relative block aspect-square w-full">
                <Silhouette />
                <ShopArt itemKey={key} animate={animate} className="absolute inset-0 h-full w-full" />
            </span>
        );
    }
    if (design?.category === 'mini_avatar') {
        return <ShopArt itemKey={key} animate={animate} className={`block ${big ? 'h-[78%] w-[78%]' : 'h-[72%] w-[72%]'}`} />;
    }
    if (design?.category === 'title') {
        return <TitlePill itemKey={key} size={big ? 'lg' : 'sm'} animate={animate} srPrefix="" className="max-w-[94%]" />;
    }
    if (design?.category === 'kesif') {
        return <ShopArt itemKey={key} animate={animate} className={`block ${big ? 'h-[88%] w-[88%]' : 'h-[82%] w-[82%]'} drop-shadow-lg`} />;
    }
    if (design?.category === 'consumable') {
        return <ShopArt itemKey={key} animate={animate} className={`block ${big ? 'h-[62%] w-[62%]' : 'h-[58%] w-[58%]'} drop-shadow-lg`} />;
    }
    if (item?.category === 'avatar_part' && typeof key === 'string') {
        const [slot, style] = key.split(':');
        if (BUST_SLOTS.has(slot)) {
            const config = withStyle(normalizeAvatar(avatar, gender), slot, style);
            return <AvatarBust config={config} gender={gender} className={`block ${big ? 'h-[86%] w-[86%]' : 'h-[84%] w-[84%]'}`} />;
        }
        // alt giysi / ayakkabı / koşu izi portrede görünmez → parça simgesi
        return <ItemIcon itemKey={key} color="#E2E8F0" className={`block ${big ? 'h-[64%] w-[64%]' : 'h-[60%] w-[60%]'}`} />;
    }
    return <ShopArt icon={FALLBACK_ICON[item?.category] || 'shop'} className="block h-1/2 w-1/2 opacity-80" />;
};

export default memo(ShopItemPreview);
