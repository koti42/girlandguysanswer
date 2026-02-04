import React from 'react';
import { Link } from 'react-router-dom';
import { FaHeart, FaComment } from 'react-icons/fa';
import UserAvatar from './UserAvatar';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import DOMPurify from 'dompurify';

const stripHtml = (html) => (html ? DOMPurify.sanitize(html, { ALLOWED_TAGS: [] }) : '');

const OpinionCard = ({ opinion }) => {
    const excerpt = stripHtml(opinion.content).slice(0, 160);
    const imageUrl = opinion.images?.[0];
    const ensureHttps = (url) => {
        if (!url) return url;
        if (url.startsWith('http://') || url.startsWith('https://')) {
            try {
                const parsed = new URL(url);
                const host = parsed.host;
                if (parsed.pathname.startsWith(`/${host}/`)) {
                    parsed.pathname = parsed.pathname.replace(`/${host}`, '');
                    return parsed.toString();
                }
            } catch {
                // ignore
            }
            return url;
        }
        if (url.startsWith('//')) return `https:${url}`;
        if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(url)) return `https://${url}`;
        const base = typeof window !== 'undefined' ? window.location.origin : (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');
        return `${base}/${url.replace(/^\//, '')}`;
    };

    return (
        <Link
            to={`/opinion/${opinion.id}`}
            className="block bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-soft hover:shadow-md transition-all"
        >
            <div className="p-5 md:p-6">
                <div className="flex items-center gap-3 mb-3">
                    <UserAvatar user={opinion.user} size="md" className="w-10 h-10 rounded-full border-2 border-white dark:border-gray-700 shadow-sm" />
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white truncate">{opinion.user?.username || 'Kullanıcı'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {opinion.created_at ? formatDistanceToNow(new Date(opinion.created_at), { addSuffix: true, locale: tr }) : ''}
                        </p>
                    </div>
                </div>
                <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2 line-clamp-2">{opinion.title}</h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed line-clamp-3 mb-3">{excerpt}{stripHtml(opinion.content).length > 160 ? '…' : ''}</p>
                {imageUrl && (
                    <div className="rounded-xl overflow-hidden mb-3 h-40 bg-gray-100 dark:bg-gray-700">
                        <img src={ensureHttps(imageUrl)} alt="" className="w-full h-full object-cover" />
                    </div>
                )}
                <div className="flex items-center gap-4 text-gray-500 dark:text-gray-400 text-sm">
                    <span className="flex items-center gap-1.5">
                        <FaHeart className="text-red-400" /> {opinion.likes_count ?? 0}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <FaComment className="text-blue-400" /> {opinion.comments_count ?? 0}
                    </span>
                </div>
            </div>
        </Link>
    );
};

export default OpinionCard;
