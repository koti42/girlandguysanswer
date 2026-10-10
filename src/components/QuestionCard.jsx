import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { FaHeart, FaThumbsDown, FaComment, FaEye, FaMars, FaVenus, FaPaperPlane, FaUserSecret, FaEyeSlash, FaPoll, FaCheckCircle, FaArrowRight } from 'react-icons/fa';
import UserAvatar from './UserAvatar';
import UserHoverCard from './UserHoverCard';
import QuestionActionsMenu from './QuestionActionsMenu';
import ReportModal from './ReportModal';
import QuestionModerationMenu from './Moderation/QuestionModerationMenu';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryIcons';
import { getThemeStyles, getViewerPrefs } from '../utils/userColor';

import { questionsAPI } from '../services/api';

const formatQuestionDate = (dateString) => {
    if (!dateString) return null;
    try {
        return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: tr });
    } catch {
        return null;
    }
};
import { useAuth } from '../context/AuthContext';
import Toast from './Toast';

const QuestionCard = ({ question, onModerationAction }) => {
    const { user: currentUser, canModerate } = useAuth();
    const isQuestionOwner = Boolean(
        question.isOwner ||
        (currentUser?.id != null && question.user?.id != null && String(question.user.id) === String(currentUser.id))
    );
    const [showReplyBox, setShowReplyBox] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [isAnonymous, setIsAnonymous] = useState(currentUser?.last_action_is_anonymous || false);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const [showReportModal, setShowReportModal] = useState(false);
    const [hasAnswered, setHasAnswered] = useState(question.user_has_answered || isQuestionOwner || false);

    const [isLiked, setIsLiked] = useState(question.is_liked || false);
    const [isDisliked, setIsDisliked] = useState(question.is_disliked || false);
    const [likesCount, setLikesCount] = useState(question.likes_count || question.stats?.likes || question.likes || 0);
    const [dislikesCount, setDislikesCount] = useState(question.dislikes_count || 0);
    // Beğeni ikonundaki tek seferlik geri bildirim; yalnızca kullanıcı beğendiğinde tetiklenir.
    const [likeBump, setLikeBump] = useState(false);

    useEffect(() => {
        setIsLiked(question.is_liked || false);
        setIsDisliked(question.is_disliked || false);
        setLikesCount(question.likes_count || question.stats?.likes || question.likes || 0);
        setDislikesCount(question.dislikes_count || 0);
    }, [question.is_liked, question.is_disliked, question.likes_count, question.dislikes_count, question.stats?.likes, question.likes]);

    useEffect(() => {
        if (currentUser?.last_action_is_anonymous !== undefined) {
            setIsAnonymous(currentUser.last_action_is_anonymous);
        }
    }, [currentUser?.last_action_is_anonymous]);

    useEffect(() => {
        setHasAnswered(question.user_has_answered || isQuestionOwner || false);
    }, [question.user_has_answered, isQuestionOwner]);

    const handleLike = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!currentUser) {
            showToast('Beğenmek için giriş yapmalısınız.', 'error');
            return;
        }
        if (isDisliked) {
            showToast('Beğenmek için önce beğenmemenizi geri almalısınız.', 'error');
            return;
        }

        const oldIsLiked = isLiked;
        const oldLikesCount = likesCount;

        setIsLiked(!oldIsLiked);
        setLikesCount(prev => oldIsLiked ? prev - 1 : prev + 1);
        if (!oldIsLiked) setLikeBump(true);

        try {
            const response = await questionsAPI.toggleLike({
                type: 'question',
                id: question.id
            });

            if (response.data?.data) {
                setLikesCount(response.data.data.likes_count);
                setIsLiked(response.data.data.is_liked);
                if (response.data.data.dislikes_count != null) setDislikesCount(response.data.data.dislikes_count);
                if (response.data.data.is_disliked != null) setIsDisliked(response.data.data.is_disliked);
            }
        } catch (error) {
            setIsLiked(oldIsLiked);
            setLikesCount(oldLikesCount);
            console.error('Like error:', error);

            if (error.response?.status === 401) {
                showToast('Oturumunuz sonlanmış olabilir.', 'error');
            } else {
                showToast(error.response?.data?.message || 'Bir hata oluştu.', 'error');
            }
        }
    };

    const handleDislike = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!currentUser) {
            showToast('Beğenmemek için giriş yapmalısınız.', 'error');
            return;
        }
        if (isLiked) {
            showToast('Beğenmemek için önce beğeninizi geri almalısınız.', 'error');
            return;
        }

        const oldIsDisliked = isDisliked;
        const oldDislikesCount = dislikesCount;

        setIsDisliked(!oldIsDisliked);
        setDislikesCount(prev => oldIsDisliked ? prev - 1 : prev + 1);

        try {
            const response = await questionsAPI.toggleDislike({
                type: 'question',
                id: question.id
            });

            if (response.data?.data) {
                setDislikesCount(response.data.data.dislikes_count);
                setIsDisliked(response.data.data.is_disliked);
                if (response.data.data.likes_count != null) setLikesCount(response.data.data.likes_count);
                if (response.data.data.is_liked != null) setIsLiked(response.data.data.is_liked);
            }
        } catch (error) {
            setIsDisliked(oldIsDisliked);
            setDislikesCount(oldDislikesCount);
            showToast(error.response?.data?.message || 'Bir hata oluştu.', 'error');
        }
    };

    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
    };

    const handleSubmitReply = async (e) => {
        e.preventDefault();
        if (!replyText.trim()) return;

        setLoading(true);
        try {


            await questionsAPI.createAnswer(question.id, {
                content: replyText,
                is_anonymous: isAnonymous
            });

            showToast('Cevabınız başarıyla gönderildi! 🎉', 'success');
            setReplyText('');
            setIsAnonymous(false);
            setHasAnswered(true);

        } catch (error) {
            console.error('QuestionCard - Answer error:', error.response?.data);
            const errorMsg = error.response?.data?.message || 'Cevap gönderilemedi. Lütfen tekrar deneyin.';
            showToast(errorMsg, 'error');
        } finally {
            setLoading(false);
        }
    };

    const userForTheme = question.user || {};
    const viewerPrefs = getViewerPrefs(currentUser);
    const themeStyles = getThemeStyles(userForTheme, viewerPrefs);
    const isOwnerAnonymous = !question.user?.username || question.user?.username === 'anonim';
    const displayName = isOwnerAnonymous ? 'Gizli Üye' : question.user.username;
    const ageRange = question.user?.age_range;
    const rawLevel = question.user?.level;
    const levelName = typeof rawLevel === 'object' ? rawLevel?.name : rawLevel;
    const levelColor = typeof rawLevel === 'object' ? rawLevel?.color : (question.user?.level_color || '#6B7280');
    const featureTag = question.user?.feature_tag;
    const featureColor = featureTag?.color || '#FACC15';
    const answerRestriction = question.answer_gender_restriction || null;
    const canAnswerByRestriction = !answerRestriction || currentUser?.gender === answerRestriction;
    const answerRestrictionLabel = answerRestriction === 'female'
        ? 'Sadece kadınlar cevaplayabilir'
        : answerRestriction === 'male'
            ? 'Sadece erkekler cevaplayabilir'
            : null;

    return (
        <article
            className="relative overflow-hidden flex flex-col gap-4 p-5 md:p-6 rounded-[20px] md:rounded-[24px] bg-white dark:bg-gray-800 border border-line dark:border-gray-700 shadow-card hover:shadow-card-hover transition-shadow duration-200 motion-reduce:transition-none"
        >
            {/* İnce üst vurgu çizgisi: kart yüzeyi nötr kalır, kimlik rengi yalnızca burada */}
            <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-[3px] pointer-events-none"
                style={{ background: `linear-gradient(to right, ${themeStyles.accentColor}, ${themeStyles.accentColor}99 70%, transparent)` }}
            />

            {/* Header */}
            <div className="flex items-start gap-3">
                {/* [&>div]:w-full: UserHoverCard'ın inline-flex sarmalayıcısı içerik genişliğine
                    göre büyümesin; uzun kullanıcı adları böylece kart içinde kırpılır. */}
                <div className="min-w-0 flex-1 [&>div]:w-full">
                    <UserHoverCard
                        username={question.user?.username}
                        categoryName={question.category?.name}
                        categoryColor={question.category?.color}
                        user={question.user}
                    >
                        <div className="flex items-start gap-3 min-w-0">
                            <Link
                                to={isOwnerAnonymous ? '#' : `/profile/${question.user?.username}`}
                                className={`shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 ${isOwnerAnonymous ? 'cursor-default' : ''}`}
                                aria-label={isOwnerAnonymous ? 'Gizli Üye' : `${displayName} profili`}
                            >
                                <div className="relative inline-flex">
                                    {featureTag && (
                                        <div
                                            className="feature-tag-ring"
                                            style={{ borderColor: featureColor, boxShadow: `${featureColor}66 0 0 18px` }}
                                        />
                                    )}
                                    <UserAvatar
                                        user={question.user}
                                        size="md"
                                        className="relative w-11 h-11 md:w-12 md:h-12 text-base border-2 border-white dark:border-gray-700 shadow-sm"
                                    />
                                </div>
                            </Link>

                            <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="font-bold text-[15px] md:text-base text-ink dark:text-white leading-tight truncate">
                                        {displayName}
                                    </span>
                                    {question.user?.gender === 'female' ? (
                                        <FaVenus className="shrink-0 text-sm" style={{ color: themeStyles.accentColor }} aria-label="Kadın" />
                                    ) : (
                                        <FaMars className="shrink-0 text-sm" style={{ color: themeStyles.accentColor }} aria-label="Erkek" />
                                    )}
                                </div>

                                {(ageRange || levelName || featureTag) && (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {ageRange && (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                                Yaş: {ageRange}
                                            </span>
                                        )}
                                        {levelName && (
                                            <span
                                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 whitespace-nowrap max-w-full truncate"
                                                style={levelColor ? { color: levelColor, backgroundColor: `${levelColor}1F` } : {}}
                                            >
                                                {levelName}
                                            </span>
                                        )}
                                        {featureTag && (
                                            <span
                                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap max-w-full truncate"
                                                style={{ color: featureColor, backgroundColor: `${featureColor}1F` }}
                                            >
                                                {featureTag.name}
                                            </span>
                                        )}
                                    </div>
                                )}

                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted dark:text-gray-400 min-w-0">
                                    {question.category?.name && (() => {
                                        const categoryName = question.category.name;
                                        const categoryColor = question.category.color;
                                        const IconComponent = getCategoryIcon(categoryName);
                                        const hexColor = getCategoryColor(categoryColor);
                                        return (
                                            <span
                                                style={{ color: hexColor, backgroundColor: `${hexColor}1A` }}
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold max-w-full"
                                            >
                                                <IconComponent className="shrink-0 text-[13px]" />
                                                <span className="truncate">{categoryName}</span>
                                            </span>
                                        );
                                    })()}
                                    {formatQuestionDate(question.created_at) && (
                                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                            <span aria-hidden="true" className="w-1 h-1 rounded-full bg-current opacity-60" />
                                            <span>Sorulma: {formatQuestionDate(question.created_at)}</span>
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </UserHoverCard>
                </div>

                <div className="flex items-center shrink-0 -mr-2 -mt-1">
                    {(canModerate || question.canModerate) && (
                        <QuestionModerationMenu
                            question={question}
                            onActionComplete={(action, message) => {
                                showToast(message, 'success');
                                onModerationAction?.(action, question.id);
                            }}
                        />
                    )}
                    <QuestionActionsMenu questionId={question.id} onReport={() => setShowReportModal(true)} />
                </div>
            </div>

            {/* Content */}
            <div className="flex flex-col gap-3 min-w-0">
                {((question.moderation?.is_hidden || question.is_hidden) || (question.has_poll || question.poll) || answerRestrictionLabel) && (
                    <div className="flex items-center gap-2 flex-wrap">
                        {(question.moderation?.is_hidden || question.is_hidden) && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs font-semibold">
                                <FaEyeSlash />
                                Gizlendi
                            </span>
                        )}
                        {(question.has_poll || question.poll) && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-soft dark:bg-blue-900/30 text-brand-blue dark:text-blue-300 text-xs font-semibold">
                                <FaPoll />
                                Anket
                            </span>
                        )}
                        {answerRestrictionLabel && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-soft dark:bg-blue-900/30 text-brand-blue dark:text-blue-300 text-xs font-semibold">
                                {answerRestrictionLabel}
                            </span>
                        )}
                    </div>
                )}

                <Link
                    to={`/question/${question.slug || question.id}`}
                    className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
                >
                    <h3 className="text-[22px] md:text-2xl font-bold leading-[1.35] tracking-[-0.01em] text-ink dark:text-gray-50 break-words [overflow-wrap:anywhere] hover:text-brand-blue dark:hover:text-blue-300 transition-colors motion-reduce:transition-none line-clamp-4 md:line-clamp-none">
                        {question.title}
                    </h3>
                </Link>

                {question.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 md:gap-2 min-w-0">
                        {question.tags.map((tag, idx) => {
                            const displayTag = tag.startsWith('#') ? tag : `#${tag}`;
                            return (
                                <span
                                    key={idx}
                                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold max-w-full truncate"
                                    style={{ backgroundColor: themeStyles.bgColorStrong, color: themeStyles.accentColor }}
                                >
                                    {displayTag}
                                </span>
                            );
                        })}
                    </div>
                )}

                {question.image && (
                    <Link
                        to={`/question/${question.slug || question.id}`}
                        className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
                    >
                        <div className="rounded-2xl overflow-hidden border border-line dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                            <img
                                src={question.image}
                                alt="Soru görseli"
                                loading="lazy"
                                decoding="async"
                                className="w-full h-56 md:h-72 object-cover"
                            />
                        </div>
                    </Link>
                )}
            </div>

            {/* Footer / Stats */}
            <div className="pt-3.5 md:pt-4 border-t border-line dark:border-gray-700 flex flex-col gap-3.5 md:gap-4">
                <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-1 -ml-2">
                        <button
                            type="button"
                            onClick={handleLike}
                            disabled={loading}
                            aria-pressed={isLiked}
                            aria-label={isLiked ? 'Beğeniyi geri al' : 'Beğen'}
                            className={`inline-flex items-center gap-1.5 h-10 px-2.5 rounded-xl font-semibold tabular-nums transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink/60 disabled:opacity-60 disabled:cursor-not-allowed ${isLiked
                                ? 'text-brand-pink'
                                : 'text-ink-muted dark:text-gray-400 hover:text-brand-pink hover:bg-pink-soft dark:hover:bg-pink-900/20'
                                }`}
                        >
                            <FaHeart className={`text-[17px] ${likeBump ? 'q-like-pop' : ''}`} onAnimationEnd={() => setLikeBump(false)} />
                            <span>{likesCount}</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleDislike}
                            disabled={loading}
                            aria-pressed={isDisliked}
                            aria-label={isDisliked ? 'Beğenmemeyi geri al' : 'Beğenme'}
                            className={`inline-flex items-center gap-1.5 h-10 px-2.5 rounded-xl font-semibold tabular-nums transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 disabled:opacity-60 disabled:cursor-not-allowed ${isDisliked
                                ? 'text-slate-700 dark:text-slate-200'
                                : 'text-ink-muted dark:text-gray-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-gray-700/60'
                                }`}
                        >
                            <FaThumbsDown className="text-[17px]" />
                            <span>{dislikesCount}</span>
                        </button>
                        <Link
                            to={`/question/${question.slug || question.id}`}
                            aria-label="Cevapları gör"
                            className="inline-flex items-center gap-1.5 h-10 px-2.5 rounded-xl font-semibold tabular-nums text-ink-muted dark:text-gray-400 hover:text-brand-blue hover:bg-blue-soft dark:hover:bg-blue-900/20 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/60"
                        >
                            <FaComment className="text-[17px] text-brand-blue" />
                            <span>{question.answers_count !== undefined ? question.answers_count : (question.stats?.comments || question.commentsCount || 0)}</span>
                        </Link>
                    </div>
                    <div className="inline-flex items-center gap-1.5 shrink-0 text-ink-muted dark:text-gray-400 tabular-nums" title="Görüntülenme">
                        <FaEye className="text-[17px]" aria-hidden="true" />
                        <span>{question.views_count !== undefined ? question.views_count : (question.stats?.views || question.views || 0)}</span>
                        <span className="sr-only">görüntülenme</span>
                    </div>
                </div>

                {/* Reply Button - Only if not owner */}
                {!isQuestionOwner && canAnswerByRestriction && (
                    <button
                        type="button"
                        onClick={() => setShowReplyBox(!showReplyBox)}
                        aria-expanded={showReplyBox}
                        className="w-full h-12 px-4 rounded-2xl bg-brand-pink text-white font-semibold text-[15px] md:text-base inline-flex items-center justify-center gap-2 shadow-sm hover:bg-[#D63C8A] active:bg-[#C5347E] active:scale-[0.99] transition-[background-color,transform] duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        <FaComment className="text-base" />
                        <span>{showReplyBox ? 'Vazgeç' : 'Cevapla'}</span>
                        {!showReplyBox && <FaArrowRight className="text-sm opacity-90" aria-hidden="true" />}
                    </button>
                )}
                {!isQuestionOwner && !canAnswerByRestriction && answerRestrictionLabel && (
                    <div className="w-full h-12 px-4 rounded-2xl bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 text-sm font-medium inline-flex items-center justify-center text-center">
                        {answerRestrictionLabel}
                    </div>
                )}
            </div>

            {/* Toast Notification */}
            {toast.show && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast({ ...toast, show: false })}
                />
            )}

            {/* Report Modal */}
            <ReportModal
                isOpen={showReportModal}
                onClose={() => setShowReportModal(false)}
                reportableType="question"
                reportableId={question.id}
                onSuccess={() => showToast('Şikayetiniz başarıyla gönderildi.', 'success')}
            />

            {/* Quick Reply Box */}
            {showReplyBox && !isQuestionOwner && canAnswerByRestriction && (
                <form onSubmit={handleSubmitReply} className="pt-4 border-t border-line dark:border-gray-700">
                    {hasAnswered ? (
                        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/60 border border-line dark:border-gray-600">
                            <FaCheckCircle className="text-success shrink-0" />
                            <p className="text-sm text-gray-600 dark:text-gray-300">Daha önce yorum yaptınız.</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    placeholder="Hızlı cevap yaz..."
                                    aria-label="Hızlı cevap"
                                    className="flex-1 min-w-0 h-11 px-4 rounded-xl border border-line dark:border-gray-600 bg-white dark:bg-gray-700 text-ink dark:text-white placeholder:text-ink-muted/80 focus:outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 transition-colors motion-reduce:transition-none text-sm disabled:opacity-60"
                                    autoFocus
                                    disabled={loading}
                                />
                                <button
                                    type="submit"
                                    disabled={!replyText.trim() || loading}
                                    aria-label="Cevabı gönder"
                                    className="shrink-0 w-11 h-11 rounded-xl bg-brand-pink text-white inline-flex items-center justify-center hover:bg-[#D63C8A] active:bg-[#C5347E] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-b-transparent"></div> : <FaPaperPlane />}
                                </button>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-2.5">
                                <button
                                    type="button"
                                    onClick={() => setIsAnonymous(!isAnonymous)}
                                    disabled={loading}
                                    aria-pressed={isAnonymous}
                                    className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs md:text-sm font-medium border transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/60 disabled:opacity-60 ${isAnonymous
                                        ? 'bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                                        : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-line dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                                        }`}
                                >
                                    <FaUserSecret className="text-sm" />
                                    <span>{isAnonymous ? 'Gizli' : 'Gizli Üye ol'}</span>
                                </button>
                                <p className="text-xs text-ink-muted dark:text-gray-400 hidden md:block">Detaylı cevap için soruya tıklayın</p>
                            </div>
                        </>
                    )}
                </form>
            )}
        </article>
    );
};

/**
 * React.memo: listede yüz karta kadar çıkılıyor ve sonsuz kaydırma her yeni
 * sayfada questions dizisini değiştiriyor. Memo olmadan her ek sayfa, o ana
 * kadarki BÜTÜN kartları yeniden çiziyordu - mobilde kaydırmayı donduran tek
 * uzun görev buydu. Kartın kendi state'i var; memo yalnızca dışarıdan gelen
 * props aynı kaldığında çizimi atlar, iç etkileşimi etkilemez.
 *
 * Bunun işe yaraması için ebeveynin `onModerationAction`'ı her çizimde yeniden
 * üretmemesi şart (bkz. QuestionsPage > handleModerationAction).
 */
export default React.memo(QuestionCard);
