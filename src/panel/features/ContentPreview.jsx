import React from 'react';
import { FaExternalLinkAlt } from 'react-icons/fa';
import DOMPurify from 'dompurify';
import { Avatar, Badge } from '../ui';
import { CONTENT_LABELS, publicPathFor } from '../lib/moderation';
import { formatDateTime } from '../lib/format';

/** Şikâyet edilen / incelenen içeriğin okunabilir görünümü. */
export default function ContentPreview({ type, item, full = false }) {
    if (!item) return <p className="text-xs p-muted italic">İçerik bulunamadı (silinmiş olabilir).</p>;

    const html = item.description ?? item.content ?? '';
    const title = item.title;
    const path = publicPathFor(type, item);
    const owner = item.user;

    return (
        <article className="rounded-xl border border-[var(--p-border)] p-inset p-4">
            <header className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge tone="info">{CONTENT_LABELS[type] || type}</Badge>
                {item.is_hidden && <Badge tone="warning">Gizli</Badge>}
                {item.is_removed && <Badge tone="danger">Kaldırılmış</Badge>}
                {owner && <span className="inline-flex items-center gap-1.5 text-xs"><Avatar user={owner} size={18} /><b>{owner.username}</b></span>}
                <time className="text-[11px] p-muted ml-auto">{formatDateTime(item.created_at)}</time>
                {path && <a href={path} target="_blank" rel="noreferrer" className="text-xs p-accent-text inline-flex items-center gap-1 hover:underline"><FaExternalLinkAlt className="text-[10px]" />Sitede aç</a>}
            </header>
            {title && <h4 className="font-semibold mb-1">{title}</h4>}
            <div
                className={`text-sm leading-relaxed break-words [&_img]:max-w-full [&_img]:rounded-lg [&_a]:underline ${full ? '' : 'max-h-64 overflow-y-auto'}`}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(String(html), { ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'a', 'span', 'img', 'div', 'blockquote'], ALLOWED_ATTR: ['href', 'src', 'alt', 'target', 'rel'] }) }}
            />
            {item.gif_url && <img src={item.gif_url} alt="GIF" className="mt-2 max-h-48 rounded-lg" loading="lazy" />}
            {Array.isArray(item.images) && item.images.length > 0 && (
                <div className="mt-2 flex gap-2 flex-wrap">{item.images.slice(0, 4).map((src, i) => <img key={i} src={src} alt="" className="h-20 w-20 object-cover rounded-lg" loading="lazy" />)}</div>
            )}
        </article>
    );
}
