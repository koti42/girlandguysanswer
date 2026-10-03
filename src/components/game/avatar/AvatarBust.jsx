import React, { memo, useMemo } from 'react';
import { buildBust } from '../../../game/avatar/bust';

/*
 * Oyun karakterinin 2D portresi: bust.js'in saf veri ağacını DOM SVG'ye
 * çevirir. Prop'lar bust.js'te sınırlı kümede (strokeWidth React DOM'da da
 * camelCase), etiketler yalnızca path/circle/ellipse/rect/g; bilinmeyen etiket
 * çizilmez.
 *
 * `size` px (sayı) ya da CSS uzunluğu; verilmezse kapsayıcıyı doldurur
 * (className ile boyutlandırılır). `label` verilmezse süs sayılır (aria-hidden).
 */

const TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'g']);

function renderNodes(nodes) {
    return nodes.map((node, i) => {
        if (!TAGS.has(node.tag)) return null;
        const Tag = node.tag;
        return (
            <Tag key={i} {...node.props}>
                {node.children ? renderNodes(node.children) : null}
            </Tag>
        );
    });
}

const AvatarBust = ({ config, gender, size, label, className = '' }) => {
    // Yapılandırma her render'da yeni nesne olabilir (sunucu yanıtı, editör
    // taslağı); içeriğe göre önbelleğe alınır.
    const key = JSON.stringify(config ?? null);
    const bust = useMemo(() => buildBust(key === 'null' ? null : JSON.parse(key), gender), [key, gender]);
    const dim = size == null ? undefined : size;
    const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true, focusable: 'false' };

    return (
        <svg
            viewBox={bust.viewBox}
            width={dim}
            height={dim}
            className={className}
            xmlns="http://www.w3.org/2000/svg"
            data-testid="avatar-bust"
            {...a11y}
        >
            {renderNodes(bust.elements)}
        </svg>
    );
};

export default memo(AvatarBust);
