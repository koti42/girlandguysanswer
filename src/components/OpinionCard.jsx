import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaHeart, FaThumbsDown, FaComment } from 'react-icons/fa';
import UserAvatar from './UserAvatar';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import DOMPurify from 'dompurify';
import { buildOpinionPath } from '../utils/opinionUrl';
import { getProfileColor } from '../utils/userColor';
import { useAuth } from '../context/AuthContext';
import { questionsAPI } from '../services/api';
import { notificationToast } from '../utils/notificationToast';

const stripHtml = (html) => (html ? DOMPurify.sanitize(html, { ALLOWED_TAGS: [] }) : '');

const OpinionCard = ({ opinion, viewerPrefs }) => {
    const { user: currentUser } = useAuth();
    const excerpt = stripHtml(opinion.content).slice(0, 160);
    const imageUrl = opinion.images?.[0];
    const ageRange = opinion.user?.age_range;
    const rawLevel = opinion.user?.level;
    const levelName = typeof rawLevel === 'object' ? rawLevel?.name : rawLevel;
    const levelColor = typeof rawLevel === 'object' ? rawLevel?.color : (opinion.user?.level_color || '#6B7280');
    const featureTag = opinion.user?.feature_tag;
    const featureColor = featureTag?.color || '#FACC15';

    const [isLiked, setIsLiked] = useState(!!opinion.is_liked);
    const [isDisliked, setIsDisliked] = useState(!!opinion.is_disliked);
    const [likesCount, setLikesCount] = useState(opinion.likes_count ?? 0);
    const [dislikesCount, setDislikesCount] = useState(opinion.dislikes_count ?? 0);

    useEffect(() => {
        setIsLiked(!!opinion.is_liked);
        setIsDisliked(!!opinion.is_disliked);
        setLikesCount(opinion.likes_count ?? 0);
        setDislikesCount(opinion.dislikes_count ?? 0);
    }, [opinion.is_liked, opinion.is_disliked, opinion.likes_count, opinion.dislikes_count]);

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

    const handleLike = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!currentUser) {
            notificationToast.warning('Beğenmek için giriş yapın.');
            return;
        }
        if (isDisliked) {
            notificationToast.warning('Beğenmek için önce beğenmemenizi geri almalısınız.');
            return;
        }
        const prevLiked = isLiked;
        const prevCount = likesCount;
        setIsLiked(!prevLiked);
        setLikesCount(prevLiked ? prevCount - 1 : prevCount + 1);
        try {
            const res = await questionsAPI.toggleLike({ type: 'opinion', id: opinion.id });
            if (res.data?.data) {
                setIsLiked(!!res.data.data.is_liked);
                setLikesCount(res.data.data.likes_count ?? likesCount);
                if (res.data.data.is_disliked != null) setIsDisliked(!!res.data.data.is_disliked);
                if (res.data.data.dislikes_count != null) setDislikesCount(res.data.data.dislikes_count);
            }
        } catch (err) {
            setIsLiked(prevLiked);
            setLikesCount(prevCount);
            notificationToast.error(err.response?.data?.message || 'İşlem başarısız.');
        }
    };

    const handleDislike = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!currentUser) {
            notificationToast.warning('Beğenmemek için giriş yapın.');
            return;
        }
        if (isLiked) {
            notificationToast.warning('Beğenmemek için önce beğeninizi geri almalısınız.');
            return;
        }
        const prevDisliked = isDisliked;
        const prevCount = dislikesCount;
        setIsDisliked(!prevDisliked);
        setDislikesCount(prevDisliked ? prevCount - 1 : prevCount + 1);
        try {
            const res = await questionsAPI.toggleDislike({ type: 'opinion', id: opinion.id });
            if (res.data?.data) {
                setIsDisliked(!!res.data.data.is_disliked);
                setDislikesCount(res.data.data.dislikes_count ?? dislikesCount);
                if (res.data.data.is_liked != null) setIsLiked(!!res.data.data.is_liked);
                if (res.data.data.likes_count != null) setLikesCount(res.data.data.likes_count);
            }
        } catch (err) {
            setIsDisliked(prevDisliked);
            setDislikesCount(prevCount);
            notificationToast.error(err.response?.data?.message || 'İşlem başarısız.');
        }
    };

    return (
        <Link
            to={buildOpinionPath(opinion)}
            className="list-card-skip block bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-soft hover:shadow-md transition-all border-l-4"
            style={{ borderLeftColor: opinion.user ? getProfileColor(opinion.user, viewerPrefs) : undefined }}
        >
            <div className="p-5 md:p-6">
                <div className="flex items-center gap-3 mb-3">
                    <div className="relative inline-flex">
                        {featureTag && (
                            <div
                                className="feature-tag-ring"
                                style={{ borderColor: featureColor, boxShadow: `${featureColor}66 0 0 18px` }}
                            />
                        )}
                        <UserAvatar
                            user={opinion.user}
                            size="md"
                            className="w-10 h-10 rounded-full border-2 border-white dark:border-gray-700 shadow-sm relative"
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <p className="font-bold text-gray-900 dark:text-white truncate">{opinion.user?.username || 'Kullanıcı'}</p>
                            {ageRange && (
                                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                                    (Yaş: {ageRange})
                                </span>
                            )}
                            {levelName && (
                                <span
                                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                                    style={levelColor ? { color: levelColor, backgroundColor: `${levelColor}20` } : {}}
                                >
                                    {levelName}
                                </span>
                            )}
                            {featureTag && (
                                <span
                                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md border"
                                    style={{ color: featureColor, borderColor: featureColor, backgroundColor: `${featureColor}14` }}
                                >
                                    {featureTag.name}
                                </span>
                            )}
                        </div>
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
                    <button
                        type="button"
                        onClick={handleLike}
                        className={`flex items-center gap-1.5 transition-colors ${isLiked ? 'text-red-500' : 'hover:text-red-500'}`}
                    >
                        <FaHeart className={isLiked ? 'text-red-400' : 'text-red-400/70'} /> {likesCount}
                    </button>
                    <button
                        type="button"
                        onClick={handleDislike}
                        className={`flex items-center gap-1.5 transition-colors ${isDisliked ? 'text-slate-600 dark:text-slate-300' : 'hover:text-slate-600 dark:hover:text-slate-300'}`}
                    >
                        <FaThumbsDown /> {dislikesCount}
                    </button>
                    <span className="flex items-center gap-1.5">
                        <FaComment className="text-blue-400" /> {opinion.comments_count ?? 0}
                    </span>
                </div>
            </div>
        </Link>
    );
};

/**
 * React.memo: sonsuz kaydırmada her yeni sayfa, o ana kadar çizilmiş BÜTÜN
 * kartları yeniden çizdiriyordu. Memo aynı props geldiğinde çizimi atlar.
 * Ebeveynin callback prop'ları useCallback ile sabitlenmediyse etkisi olmaz.
 */
export default React.memo(OpinionCard);
