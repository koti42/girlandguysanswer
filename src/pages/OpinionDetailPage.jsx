import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import UserAvatar from '../components/UserAvatar';
import { opinionsAPI, questionsAPI, commentsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FaHeart, FaComment, FaArrowLeft } from 'react-icons/fa';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import DOMPurify from 'dompurify';
import { TrendsWidget, TopUsersWidget, AnnouncementsWidget } from '../components/Widgets';
import { notificationToast } from '../utils/notificationToast';
import SEO from '../components/SEO';

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
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    return `${base}/${url.replace(/^\//, '')}`;
};

const OpinionDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [opinion, setOpinion] = useState(null);
    const [loading, setLoading] = useState(true);
    const [comments, setComments] = useState([]);
    const [commentsPage, setCommentsPage] = useState(1);
    const [commentsHasMore, setCommentsHasMore] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);
    const [isLiked, setIsLiked] = useState(false);
    const [likesCount, setLikesCount] = useState(0);

    useEffect(() => {
        const fetchOpinion = async () => {
            try {
                setLoading(true);
                const res = await opinionsAPI.getById(id);
                const op = res.data?.data?.opinion || res.data?.opinion;
                setOpinion(op);
                if (op) {
                    setIsLiked(!!op.is_liked);
                    setLikesCount(op.likes_count ?? 0);
                }
            } catch (err) {
                if (err.response?.status === 404) setOpinion(null);
            } finally {
                setLoading(false);
            }
        };
        if (id) fetchOpinion();
    }, [id]);

    useEffect(() => {
        if (!opinion?.id || !opinion.allow_comments) return;
        const fetchComments = async () => {
            try {
                const res = await opinionsAPI.getComments(opinion.id, { page: 1, per_page: 15 });
                const data = res.data?.data;
                setComments(data?.comments || []);
                const pagination = data?.pagination || {};
                setCommentsHasMore((pagination.current_page ?? 1) < (pagination.total_pages ?? 1));
            } catch (e) {
                setComments([]);
            }
        };
        fetchComments();
    }, [opinion?.id, opinion?.allow_comments]);

    const handleLike = async (e) => {
        e.preventDefault();
        if (!user) {
            notificationToast.warning('Beğenmek için giriş yapın.');
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
            }
        } catch (err) {
            setIsLiked(prevLiked);
            setLikesCount(prevCount);
            notificationToast.error('İşlem başarısız.');
        }
    };

    const handleSubmitComment = async (e) => {
        e.preventDefault();
        if (!user || !commentText.trim() || submittingComment || !opinion?.allow_comments) return;
        setSubmittingComment(true);
        try {
            await commentsAPI.create({
                commentable_type: 'opinion',
                commentable_id: opinion.id,
                content: commentText.trim(),
                parent_id: null,
                is_anonymous: false,
            });
            setCommentText('');
            const res = await opinionsAPI.getComments(opinion.id, { page: 1, per_page: 15 });
            const data = res.data?.data;
            setComments(data?.comments || []);
            setOpinion(prev => prev ? { ...prev, comments_count: (prev.comments_count ?? 0) + 1 } : null);
            notificationToast.success('Yorum eklendi.');
        } catch (err) {
            notificationToast.error(err.response?.data?.message || 'Yorum eklenemedi.');
        } finally {
            setSubmittingComment(false);
        }
    };

    const SidebarContent = (
        <>
            <TrendsWidget />
            <TopUsersWidget />
            <AnnouncementsWidget />
        </>
    );

    if (loading) {
        return (
            <MainLayout sidebar={SidebarContent}>
                <div className="flex justify-center py-20">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral" />
                </div>
            </MainLayout>
        );
    }

    if (!opinion) {
        return (
            <MainLayout sidebar={SidebarContent}>
                <div className="text-center py-20">
                    <p className="text-gray-500 text-lg">Yazı bulunamadı.</p>
                    <Link to="/opinions" className="mt-4 inline-block text-coral font-medium">Görüşlere dön</Link>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout sidebar={SidebarContent}>
            <SEO title={`${opinion.title} - Görüşler | Herkesler Soruyor`} description={DOMPurify.sanitize(opinion.content, { ALLOWED_TAGS: [] }).slice(0, 160)} />
            <div className="max-w-3xl mx-auto">
                <Link to="/opinions" className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-coral mb-6">
                    <FaArrowLeft /> Görüşlere dön
                </Link>

                <article className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-soft">
                    <div className="p-6 md:p-8">
                        <div className="flex items-center gap-3 mb-4">
                            <Link to={`/profile/${opinion.user?.username}`}>
                                <UserAvatar user={opinion.user} size="md" className="w-12 h-12 rounded-full border-2 border-white dark:border-gray-700" />
                            </Link>
                            <div>
                                <Link to={`/profile/${opinion.user?.username}`} className="font-bold text-gray-900 dark:text-white hover:underline">
                                    {opinion.user?.username || 'Kullanıcı'}
                                </Link>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {opinion.created_at ? formatDistanceToNow(new Date(opinion.created_at), { addSuffix: true, locale: tr }) : ''}
                                </p>
                            </div>
                        </div>

                        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4">{opinion.title}</h1>

                        <div
                            className="prose prose-gray dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 mb-6 break-words [&>div]:mb-2 [&_b]:font-semibold [&_strong]:font-semibold"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(opinion.content || '', { ALLOWED_TAGS: ['div', 'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'a', 'span', 'img'] }) }}
                        />

                        {opinion.images?.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                                {opinion.images.map((src, idx) => (
                                    <img key={idx} src={ensureHttps(src)} alt="" className="rounded-xl w-full h-48 object-cover" />
                                ))}
                            </div>
                        )}

                        <div className="flex items-center gap-6 pt-4 border-t border-gray-100 dark:border-gray-700">
                            <button
                                type="button"
                                onClick={handleLike}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-colors ${isLiked ? 'text-red-500 bg-red-50 dark:bg-red-900/20' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                            >
                                <FaHeart /> <span>{likesCount}</span>
                            </button>
                            <span className="flex items-center gap-2 text-gray-500">
                                <FaComment /> {opinion.comments_count ?? 0} yorum
                            </span>
                        </div>
                    </div>

                    {opinion.allow_comments && (
                        <div className="border-t border-gray-100 dark:border-gray-700 p-6 md:p-8">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-4">Yorumlar</h3>
                            {user && (
                                <form onSubmit={handleSubmitComment} className="mb-6">
                                    <textarea
                                        value={commentText}
                                        onChange={(e) => setCommentText(e.target.value)}
                                        placeholder="Yorum yazın..."
                                        rows={3}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-coral focus:border-transparent resize-none"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!commentText.trim() || submittingComment}
                                        className="mt-2 px-4 py-2 bg-coral text-white font-semibold rounded-xl hover:bg-orange-600 disabled:opacity-50"
                                    >
                                        {submittingComment ? 'Gönderiliyor...' : 'Gönder'}
                                    </button>
                                </form>
                            )}
                            {!user && (
                                <p className="text-gray-500 text-sm mb-4">Yorum yapmak için giriş yapın.</p>
                            )}
                            <div className="space-y-4">
                                {comments.map((c) => (
                                    <div key={c.id} className="flex gap-3 p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50">
                                        <UserAvatar user={c.user} size="sm" className="w-10 h-10 rounded-full flex-shrink-0" />
                                        <div>
                                            <div className="flex items-center gap-2 text-sm">
                                                <Link to={`/profile/${c.user?.username}`} className="font-bold text-gray-900 dark:text-white hover:underline">
                                                    {c.user?.username || 'Kullanıcı'}
                                                </Link>
                                                <span className="text-gray-500 text-xs">
                                                    {c.created_at ? formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: tr }) : ''}
                                                </span>
                                            </div>
                                            <p className="text-gray-700 dark:text-gray-300 text-sm mt-1">{c.content}</p>
                                        </div>
                                    </div>
                                ))}
                                {comments.length === 0 && <p className="text-gray-500 text-sm">Henüz yorum yok.</p>}
                            </div>
                        </div>
                    )}

                    {!opinion.allow_comments && (
                        <div className="border-t border-gray-100 dark:border-gray-700 p-6 text-center text-gray-500 text-sm">
                            Yorumlar bu yazı için kapatılmış.
                        </div>
                    )}
                </article>
            </div>
        </MainLayout>
    );
};

export default OpinionDetailPage;
