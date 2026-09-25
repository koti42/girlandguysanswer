import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import UserAvatar from '../components/UserAvatar';
import AiBadge from '../components/common/AiBadge';
import { storiesAPI, questionsAPI, commentsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FaHeart, FaThumbsDown, FaComment, FaArrowLeft, FaTrash, FaEyeSlash, FaEye } from 'react-icons/fa';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import DOMPurify from 'dompurify';
import { processHtmlWithMentions } from '../utils/parseMentions';
import { TrendsWidget, TopUsersWidget, AnnouncementsWidget, PopularQuestionsWidget } from '../components/Widgets';
import { notificationToast } from '../utils/notificationToast';
import SEO from '../components/SEO';
import { extractStoryId } from '../utils/storyUrl';
import ConfirmationModal from '../components/ConfirmationModal';

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

const StoryDetailPage = () => {
    const { slugOrId } = useParams();
    const navigate = useNavigate();
    const { user, canModerate } = useAuth();
    const [story, setStory] = useState(null);
    const [loading, setLoading] = useState(true);
    const [comments, setComments] = useState([]);
    const [, setCommentsHasMore] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);
    const [isLiked, setIsLiked] = useState(false);
    const [isDisliked, setIsDisliked] = useState(false);
    const [likesCount, setLikesCount] = useState(0);
    const [dislikesCount, setDislikesCount] = useState(0);
    const [deleteCommentModal, setDeleteCommentModal] = useState({ isOpen: false, commentId: null });
    const [hideCommentModal, setHideCommentModal] = useState({ isOpen: false, commentId: null });
    const [adultUnlocked, setAdultUnlocked] = useState(false);

    useEffect(() => {
        const fetchStory = async () => {
            try {
                setLoading(true);
                const storyId = extractStoryId(slugOrId);
                const res = await storiesAPI.getById(storyId);
                const op = res.data?.data?.story || res.data?.story;
                setStory(op);
                if (op) {
                    setIsLiked(!!op.is_liked);
                    setIsDisliked(!!op.is_disliked);
                    setLikesCount(op.likes_count ?? 0);
                    setDislikesCount(op.dislikes_count ?? 0);
                }
            } catch (err) {
                if (err.response?.status === 404) setStory(null);
            } finally {
                setLoading(false);
            }
        };
        if (slugOrId) fetchStory();
        setAdultUnlocked(false);
    }, [slugOrId]);

    useEffect(() => {
        if (!story?.id || !story.allow_comments) return;
        const fetchComments = async () => {
            try {
                const res = await storiesAPI.getComments(story.id, { page: 1, per_page: 15 });
                const data = res.data?.data;
                setComments(data?.comments || []);
                const pagination = data?.pagination || {};
                setCommentsHasMore((pagination.current_page ?? 1) < (pagination.total_pages ?? 1));
            } catch {
                setComments([]);
            }
        };
        fetchComments();
    }, [story?.id, story?.allow_comments]);

    const handleLike = async (e) => {
        e.preventDefault();
        if (!user) {
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
            const res = await questionsAPI.toggleLike({ type: 'story', id: story.id });
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
        if (!user) {
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
            const res = await questionsAPI.toggleDislike({ type: 'story', id: story.id });
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

    const handleSubmitComment = async (e) => {
        e.preventDefault();
        if (!user || !commentText.trim() || submittingComment || !story?.allow_comments) return;
        setSubmittingComment(true);
        try {
            await commentsAPI.create({
                commentable_type: 'story',
                commentable_id: story.id,
                content: commentText.trim(),
                parent_id: null,
                is_anonymous: false,
            });
            setCommentText('');
            const res = await storiesAPI.getComments(story.id, { page: 1, per_page: 15 });
            const data = res.data?.data;
            setComments(data?.comments || []);
            setStory(prev => prev ? { ...prev, comments_count: (prev.comments_count ?? 0) + 1 } : null);
            notificationToast.success('Yorum eklendi.');
        } catch (err) {
            notificationToast.error(err.response?.data?.message || 'Yorum eklenemedi.');
        } finally {
            setSubmittingComment(false);
        }
    };

    const openDeleteCommentModal = (commentId) => {
        if (!user) {
            notificationToast.warning('Yorum silmek için giriş yapın.');
            return;
        }
        setDeleteCommentModal({ isOpen: true, commentId });
    };

    const handleDeleteComment = async () => {
        const { commentId } = deleteCommentModal;
        if (!commentId) return;

        try {
            await commentsAPI.delete(commentId);
            setComments(prev => prev.filter(c => c.id !== commentId));
            setStory(prev => prev ? { ...prev, comments_count: Math.max(0, (prev.comments_count ?? 0) - 1) } : null);
            notificationToast.success('Yorum silindi.');
        } catch (err) {
            notificationToast.error(err.response?.data?.message || 'Yorum silinemedi.');
        }
    };

    const openHideCommentModal = (commentId) => {
        if (!user) {
            notificationToast.warning('Yorum gizlemek için giriş yapın.');
            return;
        }
        setHideCommentModal({ isOpen: true, commentId });
    };

    const handleHideComment = async () => {
        const { commentId } = hideCommentModal;
        if (!commentId) return;

        try {
            await commentsAPI.hide(commentId);
            setComments(prev => prev.filter(c => c.id !== commentId));
            notificationToast.success('Yorum gizlendi.');
        } catch (err) {
            notificationToast.error(err.response?.data?.message || 'Yorum gizlenemedi.');
        }
    };

    const SidebarContent = (
        <>
            <TrendsWidget />
            <TopUsersWidget />
            <AnnouncementsWidget />
            <PopularQuestionsWidget />
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

    if (!story) {
        return (
            <MainLayout sidebar={SidebarContent}>
                <div className="text-center py-20">
                    <p className="text-gray-500 text-lg">Hikaye bulunamadı.</p>
                    <Link to="/stories" className="mt-4 inline-block text-coral font-medium">Hikayelere dön</Link>
                </div>
            </MainLayout>
        );
    }

    return (
        <>
            <MainLayout sidebar={SidebarContent}>
                <SEO title={`${story.title} - Hikayeler | Herkesler Soruyor`} description={DOMPurify.sanitize(story.content, { ALLOWED_TAGS: [] }).slice(0, 160)} />
                <div className="max-w-3xl mx-auto">
                    <Link to="/stories" className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-coral mb-6">
                        <FaArrowLeft /> Hikayelere dön
                    </Link>

                    <article className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-soft">
                        <div className="p-6 md:p-8">
                            <div className="flex items-center gap-3 mb-4">
                                <Link to={`/profile/${story.user?.username}`}>
                                    <UserAvatar user={story.user} size="md" className="w-12 h-12 rounded-full border-2 border-white dark:border-gray-700" />
                                </Link>
                                <div>
                                    <Link to={`/profile/${story.user?.username}`} className="font-bold text-gray-900 dark:text-white hover:underline">
                                        {story.user?.username || 'Kullanıcı'}
                                    </Link>
                                    {story.user?.age_range && (
                                        <span className="ml-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                                            (Yaş: {story.user.age_range})
                                        </span>
                                    )}
                                    {story.user?.level && (
                                        <span
                                            className="ml-2 inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                                            style={story.user?.level_color ? { color: story.user.level_color, backgroundColor: `${story.user.level_color}20` } : {}}
                                        >
                                            {typeof story.user.level === 'object' ? story.user.level?.name : story.user.level}
                                        </span>
                                    )}
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {story.created_at ? formatDistanceToNow(new Date(story.created_at), { addSuffix: true, locale: tr }) : ''}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                {story.category?.name && (
                                    <span
                                        className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                                        style={{
                                            color: story.category.color || '#059669',
                                            backgroundColor: `${story.category.color || '#059669'}18`,
                                        }}
                                    >
                                        {story.category.name}
                                    </span>
                                )}
                                {story.is_adult && (
                                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                                        +18
                                    </span>
                                )}
                            </div>

                            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4">{story.title}</h1>

                            {story.is_adult && !adultUnlocked ? (
                                <div className="relative mb-6 rounded-2xl overflow-hidden border border-rose-200 dark:border-rose-800/50">
                                    <div className="blur-md select-none pointer-events-none p-6 opacity-40 max-h-48 overflow-hidden">
                                        <p className="text-gray-600 dark:text-gray-300">
                                            {DOMPurify.sanitize(story.content || '', { ALLOWED_TAGS: [] }).slice(0, 280)}…
                                        </p>
                                    </div>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-6 text-center">
                                        <FaEye className="text-3xl text-rose-500 mb-3" />
                                        <h2 className="font-bold text-lg text-gray-900 dark:text-white mb-1">+18 içerik</h2>
                                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 max-w-sm">
                                            Bu hikaye yetişkin içerik barındırıyor. Devam etmek için 18 yaşından büyük olduğunuzu onaylayın.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setAdultUnlocked(true)}
                                            className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-semibold transition-colors"
                                        >
                                            18 yaşından büyüğüm, göster
                                        </button>
                                    </div>
                                </div>
                            ) : (
                            <div
                                className="prose prose-gray dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 mb-6 break-words [&>div]:mb-2 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:mt-5 [&_h3]:mb-2 [&_blockquote]:border-l-4 [&_blockquote]:border-coral [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-500 [&_hr]:my-6 [&_hr]:border-gray-200 dark:[&_hr]:border-gray-700 [&_b]:font-semibold [&_strong]:font-semibold [&_.mention-link]:font-semibold [&_.mention-link]:text-coral [&_.mention-link]:hover:text-coral-dark [&_.mention-link]:hover:underline [&_.mention-link]:cursor-pointer"
                                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(processHtmlWithMentions(story.content || ''), { ALLOWED_TAGS: ['div', 'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'h2', 'h3', 'blockquote', 'hr', 'ul', 'ol', 'li', 'a', 'span', 'img'], ALLOWED_ATTR: ['href', 'target', 'src', 'alt', 'class', 'style'] }) }}
                                onClick={(e) => {
                                    const a = e.target.closest('a[href^="/profile/"]');
                                    if (a) {
                                        e.preventDefault();
                                        navigate(a.getAttribute('href'));
                                    }
                                }}
                            />
                            )}

                            {story.images?.length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                                    {story.images.map((src, idx) => (
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
                                <button
                                    type="button"
                                    onClick={handleDislike}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-colors ${isDisliked ? 'text-slate-600 bg-slate-100 dark:bg-slate-700/40 dark:text-slate-200' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                                >
                                    <FaThumbsDown /> <span>{dislikesCount}</span>
                                </button>
                                <span className="flex items-center gap-2 text-gray-500">
                                    <FaComment /> {story.comments_count ?? 0} yorum
                                </span>
                            </div>
                        </div>

                        {story.allow_comments && (
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
                                        <div
                                            className={`flex gap-3 p-4 rounded-xl ${(c.user?.is_ai || c.user?.is_bot) ? 'bg-gradient-to-r from-indigo-50 via-sky-50 to-cyan-50 dark:from-indigo-950/40 dark:via-sky-950/30 dark:to-cyan-950/40' : 'bg-gray-50 dark:bg-gray-700/50'}`}
                                        >
                                            <UserAvatar user={c.user} size="sm" className="w-10 h-10 rounded-full flex-shrink-0" />
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 text-sm">
                                                        <Link to={`/profile/${c.user?.username}`} className="font-bold text-gray-900 dark:text-white hover:underline">
                                                            {c.user?.username || 'Kullanıcı'}
                                                        </Link>
                                                    {c.user?.age_range && (
                                                        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                                                            (Yaş: {c.user.age_range})
                                                        </span>
                                                    )}
                                                    {c.user?.level && (
                                                        <span
                                                            className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                                                            style={c.user?.level_color ? { color: c.user.level_color, backgroundColor: `${c.user.level_color}20` } : {}}
                                                        >
                                                            {typeof c.user.level === 'object' ? c.user.level?.name : c.user.level}
                                                        </span>
                                                    )}
                                                    {(c.user?.is_ai || c.user?.is_bot) && (
                                                        <AiBadge />
                                                    )}
                                                        <span className="text-gray-500 text-xs">
                                                            {c.created_at ? formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: tr }) : ''}
                                                        </span>
                                                    </div>
                                                    {(user?.id === c.user_id || canModerate) && (
                                                        <button
                                                            onClick={() => openDeleteCommentModal(c.id)}
                                                            className="text-gray-400 hover:text-red-500 transition-colors"
                                                            title="Yorumu sil"
                                                        >
                                                            <FaTrash className="text-xs" />
                                                        </button>
                                                    )}
                                                    {user && user.id !== c.user_id && (
                                                        <button
                                                            onClick={() => openHideCommentModal(c.id)}
                                                            className="text-gray-400 hover:text-orange-500 transition-colors ml-2"
                                                            title="Yorumu gizle (sadece sen görmezsin)"
                                                        >
                                                            <FaEyeSlash className="text-xs" />
                                                        </button>
                                                    )}
                                                </div>
                                                <p className="text-gray-700 dark:text-gray-300 text-sm mt-1">{c.content}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {comments.length === 0 && <p className="text-gray-500 text-sm">Henüz yorum yok.</p>}
                                </div>
                            </div>
                        )}

                        {!story.allow_comments && (
                            <div className="border-t border-gray-100 dark:border-gray-700 p-6 text-center text-gray-500 text-sm">
                                Yorumlar bu yazı için kapatılmış.
                            </div>
                        )}
                    </article>
                </div>
            </MainLayout>

            <ConfirmationModal
                isOpen={deleteCommentModal.isOpen}
                onClose={() => setDeleteCommentModal({ isOpen: false, commentId: null })}
                onConfirm={handleDeleteComment}
                title="Yorumu Sil"
                message="Bu yorumu silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
                confirmText="Sil"
                cancelText="Vazgeç"
                isDangerous={true}
            />

            <ConfirmationModal
                isOpen={hideCommentModal.isOpen}
                onClose={() => setHideCommentModal({ isOpen: false, commentId: null })}
                onConfirm={handleHideComment}
                title="Yorumu Gizle"
                message="Bu yorumu gizlemek istediğinize emin misiniz? Sadece siz görmezsiniz, diğer kullanıcılar etkilenmez."
                confirmText="Gizle"
                cancelText="Vazgeç"
                isDangerous={false}
            />
        </>
    );
};

export default StoryDetailPage;
