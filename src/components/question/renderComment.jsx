import React from 'react';
import { Link } from 'react-router-dom';
import { FaHeart, FaThumbsDown, FaReply, FaUserSecret, FaImage, FaTimes, FaTrash, FaEyeSlash, FaRobot, FaMars, FaVenus } from 'react-icons/fa';
import DOMPurify from 'dompurify';
import UserAvatar from '../UserAvatar';
import UserHoverCard from '../UserHoverCard';
import AiBadge from '../common/AiBadge';
import { textWithMentions } from '../../utils/parseMentions';
import { getProfileColor, getProfileGradientStyle } from '../../utils/userColor';
import { formatDate, getYoutubeVideoLinks } from '../../utils/questionContent';

/**
 * Bir yorumu (ve ic ice yanitlarini) cizer.
 *
 * SingleQuestionView'in icinden cikarildi; orada 296 satirlik bir kapanis
 * olarak duruyor ve cevresindeki ~20 state/handler'a dogrudan uzaniyordu.
 * Modulde o baglar acikca gorunsun diye hepsi tek bir `ctx` nesnesiyle
 * geciriliyor: prop listesini yirmi parametreye yaymaktan hem daha okunur
 * hem de ozyinelemeli cagriyi (yanitin yaniti) ucuz tutuyor.
 *
 * JSX'e dokunulmadi - bu bir tasima, davranis degisikligi degil.
 */
export const renderComment = (ctx, comment, type, targetId, level = 0, mainCommentId = null) => {
    const {
        answers,
        canModerate,
        clearReplyGif,
        currentUser,
        handleDislike,
        handleLike,
        handleSubmitReply,
        highlightedCommentId,
        loadMoreReplies,
        openDeleteCommentModal,
        openGifPicker,
        openHideCommentModal,
        openLikersModal,
        question,
        repliesPagination,
        replyAnonymous,
        replyGifUrls,
        replyTexts,
        replyingTo,
        setReplyAnonymous,
        setReplyTexts,
        setReplyingTo,
        viewerPrefs,
    } = ctx;
    const currentMainCommentId = mainCommentId || comment.id;
    const commentColorStyle = getProfileGradientStyle(comment.user, viewerPrefs, 0.12);
    const marginClasses = ['ml-0', 'ml-0', 'ml-0', 'ml-0'];
    const marginLeft = marginClasses[Math.min(level, 3)];
    const isReplyingToThis = replyingTo?.commentId === comment.id;

    const isHighlighted = highlightedCommentId && String(comment.id) === String(highlightedCommentId);
    const commentHighlightClasses = isHighlighted
        ? ' ring-2 ring-amber-400 border-amber-300 bg-amber-50/80 dark:bg-amber-900/30'
        : '';

    const youtubeLinks = getYoutubeVideoLinks(comment.content);

    const isMainComment = level === 0;
    const commentUserId = comment.user_id || comment.user?.id;
    const isCommentOwner = Boolean(currentUser?.id) && Boolean(commentUserId) && currentUser.id === commentUserId;
    const isQuestionOwner = type === 'question' && (question?.isOwner || question?.user?.id === currentUser?.id);
    const answer = type === 'answer' ? answers.find(a => a.id === targetId) : null;
    const isAnswerOwner =
        type === 'answer' &&
        Boolean(currentUser?.id) &&
        Boolean(answer?.user?.id) &&
        answer.user.id === currentUser.id;
    const canDeleteComment = isCommentOwner || canModerate || (isMainComment && (isQuestionOwner || isAnswerOwner));

    return (
        <div key={comment.id} className="space-y-3">
            <div
                id={`comment-${comment.id}`}
                className={`rounded-xl p-4 ${marginLeft} border-l-4 shadow-sm hover:shadow-md transition-all scroll-mt-20${commentHighlightClasses}${(comment.user?.is_ai || comment.user?.is_bot) ? ' bg-gradient-to-r from-indigo-50 via-sky-50 to-cyan-50 dark:from-indigo-950/40 dark:via-sky-950/30 dark:to-cyan-950/40 border-indigo-300/70' : ''}`}
                style={commentColorStyle}
            >
                <div className="flex gap-3">
                    {comment.user?.username === 'anonim' ? (
                        <div className="cursor-default">
                            <UserAvatar user={comment.user} size="sm" className="w-10 h-10 border-2 border-white dark:border-gray-600 shadow-sm" />
                        </div>
                    ) : (
                        <Link to={`/profile/${comment.user?.username}`}>
                            <div className="relative inline-flex">
                                {comment.user?.feature_tag && comment.user.feature_tag.color && (
                                    <div
                                        className="feature-tag-ring"
                                        style={{ borderColor: comment.user.feature_tag.color, boxShadow: `${comment.user.feature_tag.color}66 0 0 18px` }}
                                    />
                                )}
                                <UserAvatar
                                    user={comment.user}
                                    size="sm"
                                    className="w-10 h-10 border-2 border-white dark:border-gray-600 shadow-sm hover:border-coral transition-colors relative"
                                />
                            </div>
                        </Link>
                    )}
                    <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-1 flex-wrap mb-1">
                            {comment.user?.username === 'anonim' ? (
                                <span className="font-bold text-sm text-gray-800 dark:text-white cursor-default">Gizli Üye</span>
                            ) : (
                                <Link to={`/profile/${comment.user?.username}`} className="font-bold text-sm text-gray-800 dark:text-white hover:underline truncate max-w-[120px]">{comment.user?.username}</Link>
                            )}
                            {comment.is_question_owner && (
                                <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md shrink-0" style={{ backgroundColor: getProfileColor(comment.user, viewerPrefs) + '20', color: getProfileColor(comment.user, viewerPrefs) }}>
                                    {comment.user?.username === 'anonim' ? '(Soru Sahibi)' : 'Soru Sahibi'}
                                </span>
                            )}
                            {comment.user?.age_range && (
                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 shrink-0">(Yaş: {comment.user.age_range})</span>
                            )}
                            {comment.user?.level && (
                                <span
                                    className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0"
                                    style={comment.user?.level_color ? { color: comment.user.level_color, backgroundColor: `${comment.user.level_color}20` } : {}}
                                >
                                    {typeof comment.user.level === 'object' ? comment.user.level?.name : comment.user.level}
                                </span>
                            )}
                            {(comment.user?.is_ai || comment.user?.is_bot) && (
                                <AiBadge />
                            )}
                            {comment.user?.feature_tag && (
                                <span
                                    className="text-xs font-semibold px-1.5 py-0.5 rounded-md border shrink-0"
                                    style={{
                                        color: comment.user.feature_tag.color || '#FACC15',
                                        borderColor: comment.user.feature_tag.color || '#FACC15',
                                        backgroundColor: `${(comment.user.feature_tag.color || '#FACC15')}14`,
                                    }}
                                >
                                    {comment.user.feature_tag.name}
                                </span>
                            )}
                            <span className="text-xs shrink-0" style={{ color: getProfileColor(comment.user, viewerPrefs) }}>{comment.user?.gender === 'female' ? <FaVenus /> : <FaMars />}</span>
                            <span className="text-gray-400 text-xs shrink-0 truncate max-w-[160px] sm:max-w-none">• {formatDate(comment.created_at)}</span>
                        </div>
                        {comment.content && (
                            <p className="text-gray-800 dark:text-gray-100 text-sm leading-relaxed mb-2 whitespace-pre-wrap break-words">
                                {textWithMentions(comment.content)}
                            </p>
                        )}
                        {youtubeLinks.length > 0 && (
                            <div className="space-y-3 mb-2">
                                {youtubeLinks.map(({ videoId, isMusic, url }) => (
                                    <div
                                        key={videoId}
                                        className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-black/5 dark:bg-gray-900/60"
                                    >
                                        <div className="relative w-full pb-[56.25%] bg-black">
                                            <iframe
                                                src={`https://www.youtube.com/embed/${videoId}`}
                                                title="YouTube video"
                                                className="absolute inset-0 w-full h-full"
                                                frameBorder="0"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                                allowFullScreen
                                            />
                                        </div>
                                        <div className="px-3 py-2 flex items-center justify-between gap-2 bg-white/80 dark:bg-gray-900/80">
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">
                                                    {isMusic ? 'YouTube Music' : 'YouTube'}
                                                </span>
                                                <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                                                    Videoyu yorumdan oynat
                                                </span>
                                            </div>
                                            <a
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[11px] font-semibold text-coral hover:text-coral-dark whitespace-nowrap"
                                            >
                                                YouTube’da aç
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {comment.gif_url && (
                            <div className="mb-2 rounded-lg overflow-hidden">
                                <img
                                    src={comment.gif_url}
                                    alt="GIF"
                                    className="max-w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={() => window.open(comment.gif_url, '_blank')}
                                />
                            </div>
                        )}
                        <div className="flex items-center gap-4 mt-2">
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={(e) => handleLike(e, 'comment', comment.id)}
                                    className={`text-xs flex items-center gap-1 transition-colors ${comment.is_liked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}
                                >
                                    <FaHeart />
                                </button>
                                <button
                                    onClick={() => openLikersModal('comment', comment.id)}
                                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:underline cursor-pointer"
                                >
                                    {comment.likes_count || 0}
                                </button>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={(e) => handleDislike(e, 'comment', comment.id)}
                                    className={`text-xs flex items-center gap-1 transition-colors ${comment.is_disliked ? 'text-slate-600 dark:text-slate-300' : 'text-gray-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                >
                                    <FaThumbsDown />
                                </button>
                                <span className="text-xs text-gray-500">{comment.dislikes_count || 0}</span>
                            </div>
                            <button
                                onClick={() => {
                                    if (question.is_anonymous && question.isOwner) {
                                        setReplyAnonymous(prev => ({ ...prev, [comment.id]: true }));
                                    }
                                    setReplyingTo(isReplyingToThis ? null : { commentId: comment.id, mainCommentId: currentMainCommentId, type, targetId });
                                }}
                                className="text-xs text-gray-600 dark:text-gray-400 hover:text-coral transition-colors flex items-center gap-1"
                            >
                                <FaReply className="text-xs" /> <span>{isReplyingToThis ? 'İptal' : 'Cevapla'}</span>
                            </button>
                            {canDeleteComment && (
                                <button
                                    onClick={() => openDeleteCommentModal(comment.id, type, targetId)}
                                    className="text-xs text-gray-500 hover:text-red-500 transition-colors flex items-center gap-1"
                                    title="Yorumu sil"
                                >
                                    <FaTrash className="text-xs" /> <span>Sil</span>
                                </button>
                            )}
                            {currentUser && currentUser.id !== commentUserId && (
                                <button
                                    onClick={() => openHideCommentModal(comment.id, type, targetId)}
                                    className="text-xs text-gray-500 hover:text-orange-500 transition-colors flex items-center gap-1"
                                    title="Yorumu gizle (sadece sen görmezsin)"
                                >
                                    <FaEyeSlash className="text-xs" /> <span>Gizle</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                {isReplyingToThis && (
                    <div className="mt-3 pt-3 border-t border-coral/20">
                        {/* Replying to badge */}
                        <div className="flex items-center gap-1.5 mb-2 ml-0 sm:ml-10">
                            <FaReply className="text-coral text-[10px]" />
                            <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                <span className="font-semibold text-coral">@{comment.user?.username === 'anonim' ? 'Gizli Üye' : comment.user?.username}</span>'ya yanıtlanıyor
                            </span>
                        </div>
                        <form onSubmit={handleSubmitReply} className="sm:ml-10">
                            {replyGifUrls[comment.id] && (
                                <div className="mb-2 relative inline-block">
                                    <img src={replyGifUrls[comment.id]} alt="GIF" className="max-w-[160px] sm:max-w-xs h-auto rounded-xl shadow-sm" />
                                    <button
                                        type="button"
                                        onClick={() => clearReplyGif(comment.id)}
                                        className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
                                    >
                                        <FaTimes className="text-[10px]" />
                                    </button>
                                </div>
                            )}
                            <textarea
                                value={replyTexts[comment.id] || ''}
                                onChange={(e) => setReplyTexts(prev => ({ ...prev, [comment.id]: e.target.value }))}
                                placeholder="Yanıtınızı yazın..."
                                rows={2}
                                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/80 dark:text-white focus:outline-none focus:border-coral focus:ring-2 focus:ring-coral/20 transition-all resize-none text-sm"
                                autoFocus
                            />
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                <button
                                    type="button"
                                    onClick={() => openGifPicker('reply', comment.id)}
                                    className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-coral dark:hover:text-coral hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex-shrink-0"
                                    title="GIF Ekle"
                                >
                                    <FaImage className="text-xs" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setReplyAnonymous(prev => ({ ...prev, [comment.id]: !prev[comment.id] }))}
                                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg font-medium transition-all text-xs flex-shrink-0 ${
                                        replyAnonymous[comment.id]
                                            ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 ring-1 ring-purple-300 dark:ring-purple-700'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    <FaUserSecret className="text-[11px]" />
                                    <span>{replyAnonymous[comment.id] ? 'Gizli' : 'Gizli'}</span>
                                </button>
                                <div className="flex-1" />
                                <button
                                    type="button"
                                    onClick={() => setReplyingTo(null)}
                                    className="px-3 py-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-medium"
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    disabled={!replyTexts[comment.id]?.trim() && !replyGifUrls[comment.id]}
                                    className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-coral text-white hover:bg-coral/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                                >
                                    Yanıtla
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
            {comment.replies && comment.replies.length > 0 && (
                <div className="ml-1 pl-3 border-l-2 border-coral/40 dark:border-coral/25 space-y-3">
                    {comment.replies.map(reply => renderComment(ctx, reply, type, targetId, level + 1, currentMainCommentId))}
                    {(repliesPagination[comment.id]?.hasMore || (!repliesPagination[comment.id] && comment.replies.length >= 5)) && (
                        <div className="pt-1">
                            <button onClick={() => loadMoreReplies(comment.id)} disabled={repliesPagination[comment.id]?.loading} className="text-xs font-semibold text-coral hover:text-coral-dark flex items-center gap-1 transition-colors">
                                {repliesPagination[comment.id]?.loading ? (
                                    <><div className="animate-spin rounded-full h-3 w-3 border-2 border-coral border-t-transparent"></div> Yükleniyor...</>
                                ) : (
                                    <><FaReply className="transform rotate-180" /> Diğer yanıtları gör</>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default renderComment;
