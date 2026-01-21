import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { FaHeart, FaComment, FaEye, FaMars, FaVenus, FaShare, FaReply, FaUserSecret } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import { TrendsWidget, TopUsersWidget, AnnouncementsWidget } from '../components/Widgets';
import { questionsAPI, commentsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import UserAvatar from '../components/UserAvatar';
import Toast from '../components/Toast';

const formatDate = (dateString) => {
    if (!dateString) return "Az önce";
    try {
        return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: tr });
    } catch (e) {
        return "Bilinmiyor";
    }
};

const QuestionDetailPage = () => {
    const { slug } = useParams();
    const { user: currentUser } = useAuth();
    const [question, setQuestion] = useState(null);
    const [answers, setAnswers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Answer state
    const [answerText, setAnswerText] = useState('');
    const [isAnswerAnonymous, setIsAnswerAnonymous] = useState(currentUser?.last_action_is_anonymous || false);

    // Comment state (for both question and answer comments)
    const [commentingOn, setCommentingOn] = useState(null); // { type: 'question'|'answer', id: 'uuid' }
    const [commentTexts, setCommentTexts] = useState({});
    const [commentAnonymous, setCommentAnonymous] = useState({});

    // Reply state (for flat replies - all replies use main comment ID as parent)
    const [replyingTo, setReplyingTo] = useState(null); // { commentId: 'uuid', mainCommentId: 'uuid', type: 'question'|'answer', targetId: 'uuid' }
    const [replyTexts, setReplyTexts] = useState({});
    const [replyAnonymous, setReplyAnonymous] = useState({});

    // Filter & Sort
    const [genderFilter, setGenderFilter] = useState('all');
    const [sortBy, setSortBy] = useState('newest');

    // Toast
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState('success');

    const displayToast = (message, type = 'success') => {
        setToastMessage(message);
        setToastType(type);
        setShowToast(true);
    };

    useEffect(() => {
        const fetchQuestionDetail = async () => {
            setLoading(true);
            try {
                const response = await questionsAPI.getById(slug);
                const questionData = response.data.data.question;

                setQuestion(questionData);
                setAnswers(questionData.answers || []);
            } catch (err) {
                setError("Soru bulunamadı veya yüklenirken bir hata oluştu.");
            } finally {
                setLoading(false);
            }
        };

        if (slug) {
            fetchQuestionDetail();
        }
    }, [slug]);

    // Scroll to hash element
    useEffect(() => {
        if (!loading && window.location.hash) {
            setTimeout(() => {
                const element = document.querySelector(window.location.hash);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    element.classList.add('ring-2', 'ring-coral', 'ring-offset-2');
                    setTimeout(() => {
                        element.classList.remove('ring-2', 'ring-coral', 'ring-offset-2');
                    }, 2000);
                }
            }, 300);
        }
    }, [loading, answers, question?.comments]);

    // Submit Answer (to question)
    const handleSubmitAnswer = async (e) => {
        e.preventDefault();
        if (!answerText.trim()) return;

        try {
            const response = await questionsAPI.createAnswer(question.id, {
                content: answerText,
                is_anonymous: isAnswerAnonymous
            });

            let newAnswer = response.data.data.answer;

            // If posting anonymously, immediately mask user data
            if (isAnswerAnonymous) {
                newAnswer = {
                    ...newAnswer,
                    user: {
                        name: 'Anonim Kullanıcı',
                        username: 'anonim',
                        avatar: null,
                        gender: newAnswer.user?.gender // Preserve gender for UI coloring
                    }
                };
            }

            setAnswers(prev => [newAnswer, ...prev]);
            setAnswerText('');
            setIsAnswerAnonymous(false);
            displayToast('Cevabınız başarıyla gönderildi! 🎉', 'success');
        } catch (err) {
            const errorMsg = err.response?.data?.message || "Cevap gönderilemedi. Lütfen tekrar deneyin.";
            displayToast(errorMsg, 'error');
        }
    };

    // Submit Comment (to question or answer)
    const handleSubmitComment = async (e) => {
        e.preventDefault();
        if (!commentingOn) return;

        const commentKey = `${commentingOn.type}_${commentingOn.id}`;
        const commentText = commentTexts[commentKey];
        if (!commentText?.trim()) return;

        try {
            const response = await commentsAPI.create({
                content: commentText,
                commentable_type: commentingOn.type,
                commentable_id: commentingOn.id,
                parent_id: null, // Ana yorum
                is_anonymous: commentAnonymous[commentKey] || false
            });

            let newComment = response.data.data.comment;

            // If posting anonymously, immediately mask user data
            if (commentAnonymous[commentKey]) {
                newComment = {
                    ...newComment,
                    user: {
                        name: 'Anonim Kullanıcı',
                        username: 'anonim',
                        avatar: null,
                        gender: newComment.user?.gender // Preserve gender for UI coloring
                    }
                };
            }

            if (commentingOn.type === 'question') {
                setQuestion(prev => ({
                    ...prev,
                    comments: [newComment, ...(prev.comments || [])]
                }));
            } else if (commentingOn.type === 'answer') {
                setAnswers(prev => prev.map(answer => {
                    if (answer.id === commentingOn.id) {
                        return {
                            ...answer,
                            comments: [newComment, ...(answer.comments || [])]
                        };
                    }
                    return answer;
                }));
            }

            setCommentTexts(prev => ({ ...prev, [commentKey]: '' }));
            setCommentAnonymous(prev => ({ ...prev, [commentKey]: false }));
            setCommentingOn(null);

            displayToast('Yorumunuz başarıyla gönderildi! 🎉', 'success');
        } catch (err) {
            const errorMsg = err.response?.data?.message || "Yorum gönderilemedi. Lütfen tekrar deneyin.";
            displayToast(errorMsg, 'error');
        }
    };

    // Submit Reply (to comment) - FLAT REPLY: Always use main comment ID as parent
    const handleSubmitReply = async (e) => {
        e.preventDefault();
        if (!replyingTo) return;

        const replyText = replyTexts[replyingTo.commentId];
        if (!replyText?.trim()) return;

        try {
            const response = await commentsAPI.create({
                content: replyText,
                commentable_type: replyingTo.type,
                commentable_id: replyingTo.targetId,
                parent_id: replyingTo.mainCommentId, // ✅ HER ZAMAN ANA YORUMUN ID'Sİ (FLAT REPLY)
                is_anonymous: replyAnonymous[replyingTo.commentId] || false
            });

            let newReply = response.data.data.comment;

            // If posting anonymously, immediately mask user data
            if (replyAnonymous[replyingTo.commentId]) {
                newReply = {
                    ...newReply,
                    user: {
                        name: 'Anonim Kullanıcı',
                        username: 'anonim',
                        avatar: null,
                        gender: newReply.user?.gender // Preserve gender for UI coloring
                    }
                };
            }

            // Update nested comments (add to main comment's replies)
            if (replyingTo.type === 'question') {
                setQuestion(prev => ({
                    ...prev,
                    comments: updateCommentsWithReply(prev.comments || [], replyingTo.mainCommentId, newReply)
                }));
            } else if (replyingTo.type === 'answer') {
                setAnswers(prev => prev.map(answer => {
                    if (answer.id === replyingTo.targetId) {
                        return {
                            ...answer,
                            comments: updateCommentsWithReply(answer.comments || [], replyingTo.mainCommentId, newReply)
                        };
                    }
                    return answer;
                }));
            }

            setReplyTexts(prev => ({ ...prev, [replyingTo.commentId]: '' }));
            setReplyAnonymous(prev => ({ ...prev, [replyingTo.commentId]: false }));
            setReplyingTo(null);

            displayToast('Yanıtınız başarıyla gönderildi! 🎉', 'success');
        } catch (err) {
            const errorMsg = err.response?.data?.message || "Yanıt gönderilemedi. Lütfen tekrar deneyin.";
            displayToast(errorMsg, 'error');
        }
    };

    // Helper: Update nested comments with reply
    const updateCommentsWithReply = (comments, parentId, newReply) => {
        return comments.map(comment => {
            if (comment.id === parentId) {
                return {
                    ...comment,
                    replies: [...(comment.replies || []), newReply]
                };
            }
            if (comment.replies && comment.replies.length > 0) {
                return {
                    ...comment,
                    replies: updateCommentsWithReply(comment.replies, parentId, newReply)
                };
            }
            return comment;
        });
    };

    // Render Comment (Recursive) - FLAT REPLY: Track main comment ID
    const renderComment = (comment, type, targetId, level = 0, mainCommentId = null) => {
        // Ana yorumun ID'sini bul (eğer bu bir reply ise parent'ı kullan, değilse kendi ID'si)
        const currentMainCommentId = mainCommentId || comment.id;

        const commentGradientClass = comment.user?.gender === 'female'
            ? 'bg-gradient-to-br from-pink-100 to-pink-50 dark:from-pink-900/25 dark:to-pink-800/20 border-pink-400 dark:border-pink-600'
            : 'bg-gradient-to-br from-cyan-100 to-cyan-50 dark:from-cyan-900/25 dark:to-cyan-800/20 border-cyan-400 dark:border-cyan-600';

        const marginClasses = ['ml-0', 'ml-6', 'ml-12', 'ml-16'];
        const marginLeft = marginClasses[Math.min(level, 3)];

        const isReplyingToThis = replyingTo?.commentId === comment.id;

        return (
            <div key={comment.id} className="space-y-3">
                <div id={`comment-${comment.id}`} className={`${commentGradientClass} rounded-xl p-4 ${marginLeft} border-l-4 shadow-sm hover:shadow-md transition-all scroll-mt-20`}>
                    <div className="flex gap-3">
                        <Link to={`/profile/${comment.user?.username}`}>
                            <UserAvatar
                                user={comment.user}
                                size="sm"
                                className="w-10 h-10 border-2 border-white dark:border-gray-600 shadow-sm hover:border-coral transition-colors"
                            />
                        </Link>
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <Link to={`/profile/${comment.user?.username}`} className="font-bold text-sm text-gray-800 dark:text-white hover:underline">
                                    {comment.user?.username || 'Anonim'}
                                </Link>
                                {comment.user?.gender === 'female' ? (
                                    <FaVenus className="text-pink-600 dark:text-pink-400 text-xs" />
                                ) : (
                                    <FaMars className="text-cyan-600 dark:text-cyan-400 text-xs" />
                                )}
                                <span className="text-gray-500 dark:text-gray-400 text-xs">• {formatDate(comment.created_at)}</span>
                            </div>
                            <p className="text-gray-800 dark:text-gray-100 text-sm leading-relaxed mb-2">
                                {comment.content}
                            </p>

                            <button
                                onClick={() => setReplyingTo(isReplyingToThis ? null : {
                                    commentId: comment.id,
                                    mainCommentId: currentMainCommentId, // ✅ Ana yorumun ID'si
                                    type,
                                    targetId
                                })}
                                className="text-xs text-gray-600 dark:text-gray-400 hover:text-coral dark:hover:text-coral transition-colors flex items-center gap-1"
                            >
                                <FaReply className="text-xs" />
                                <span>{isReplyingToThis ? 'İptal' : 'Cevapla'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Reply Form */}
                    {isReplyingToThis && (
                        <div className="mt-3 pl-12 border-l-2 border-coral dark:border-coral/50">
                            <form onSubmit={handleSubmitReply}>
                                <textarea
                                    value={replyTexts[comment.id] || ''}
                                    onChange={(e) => setReplyTexts(prev => ({ ...prev, [comment.id]: e.target.value }))}
                                    placeholder={`@${comment.user?.username} kullanıcısına cevap yazın...`}
                                    rows={3}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all resize-none mb-2 text-sm"
                                    autoFocus
                                />
                                <div className="mb-2">
                                    <button
                                        type="button"
                                        onClick={() => setReplyAnonymous(prev => ({ ...prev, [comment.id]: !prev[comment.id] }))}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all text-xs ${replyAnonymous[comment.id]
                                            ? 'bg-purple-100 text-purple-700 border-2 border-purple-300'
                                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border-2 border-transparent hover:border-gray-300'
                                            }`}
                                    >
                                        <FaUserSecret />
                                        <span>{replyAnonymous[comment.id] ? 'Anonim yanıt' : 'Anonim olarak yanıtla'}</span>
                                    </button>
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setReplyingTo(null)}
                                        className="py-1.5 px-3 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all text-xs"
                                    >
                                        İptal
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!replyTexts[comment.id]?.trim()}
                                        className="bg-coral text-white font-semibold py-1.5 px-3 rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                                    >
                                        Yanıtla
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>

                {/* Nested Replies */}
                {comment.replies && comment.replies.length > 0 && (
                    <div className="space-y-3">
                        {comment.replies.map(reply => renderComment(reply, type, targetId, level + 1, currentMainCommentId))}
                    </div>
                )}
            </div>
        );
    };

    // Filter and sort answers
    const getFilteredAndSortedAnswers = () => {
        let filtered = answers.filter(answer => {
            if (genderFilter === 'all') return true;
            return answer.user?.gender === genderFilter;
        });

        return filtered.sort((a, b) => {
            switch (sortBy) {
                case 'newest':
                    return new Date(b.created_at) - new Date(a.created_at);
                case 'oldest':
                    return new Date(a.created_at) - new Date(b.created_at);
                case 'likes':
                    return (b.likes_count || 0) - (a.likes_count || 0);
                case 'replies':
                    return (b.comments?.length || 0) - (a.comments?.length || 0);
                default:
                    return 0;
            }
        });
    };

    const filteredAnswers = getFilteredAndSortedAnswers();

    const SidebarContent = (
        <>
            <TrendsWidget />
            <TopUsersWidget />
            <AnnouncementsWidget />
        </>
    );

    if (loading) {
        return (
            <MainLayout>
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div>
                </div>
            </MainLayout>
        );
    }

    if (error || !question) {
        return (
            <MainLayout>
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Soru Bulunamadı</h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">{error || "Aradığınız soru mevcut değil veya silinmiş olabilir."}</p>
                    <Link to="/" className="text-coral hover:underline font-semibold">Ana Sayfaya Dön</Link>
                </div>
            </MainLayout>
        );
    }

    const commentKey = commentingOn ? `${commentingOn.type}_${commentingOn.id}` : '';
    const isCommentingOnQuestion = commentingOn?.type === 'question';

    return (
        <>
            {showToast && (
                <Toast
                    message={toastMessage}
                    type={toastType}
                    onClose={() => setShowToast(false)}
                />
            )}
            <MainLayout sidebar={SidebarContent}>
                <div className="flex flex-col gap-6">
                    {/* Question Card */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft">
                        <div className="flex items-center gap-3 mb-4">
                            <Link to={`/profile/${question.user.username}`}>
                                <UserAvatar
                                    user={question.user}
                                    size="lg"
                                    className="hover:border-coral transition-colors"
                                />
                            </Link>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <Link to={`/profile/${question.user.username}`} className="font-bold text-gray-800 dark:text-white hover:underline">
                                        {question.user.username}
                                    </Link>
                                    {question.user.gender === 'female' ? (
                                        <FaVenus className="text-pink-500" />
                                    ) : (
                                        <FaMars className="text-blue-500" />
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                    <span className="bg-gray-100 dark:bg-gray-700 dark:text-gray-300 px-2 py-0.5 rounded">{question.category}</span>
                                    <span>•</span>
                                    <span>{formatDate(question.created_at)}</span>
                                </div>
                            </div>
                        </div>

                        <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4 leading-snug">
                            {question.title}
                        </h1>

                        {question.description && (
                            <p className="text-gray-700 dark:text-gray-300 mb-4">
                                {question.description}
                            </p>
                        )}

                        <div className="flex flex-wrap gap-2 mb-4">
                            {question.tags?.map((tag, idx) => (
                                <span key={idx} className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-medium hover:bg-gray-200 transition-colors cursor-pointer">
                                    {tag}
                                </span>
                            ))}
                        </div>

                        {question.image && (
                            <div className="rounded-xl overflow-hidden mb-6 shadow-sm">
                                <img src={question.image} alt="Question" className="w-full h-auto object-cover" />
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
                            <div className="flex gap-6">
                                <button className="flex items-center gap-2 text-gray-500 hover:text-coral transition-colors">
                                    <FaHeart className="text-lg" />
                                    <span className="font-semibold">{question.stats?.likes || 0}</span>
                                </button>
                                <button
                                    onClick={() => setCommentingOn(isCommentingOnQuestion ? null : { type: 'question', id: question.id })}
                                    className="flex items-center gap-2 text-gray-500 hover:text-blue-500 transition-colors"
                                >
                                    <FaComment className="text-lg" />
                                    <span className="font-semibold">{question.comments?.length || 0}</span>
                                </button>
                                <div className="flex items-center gap-2 text-gray-500">
                                    <FaEye />
                                    <span>{question.stats?.views || 0}</span>
                                </div>
                            </div>
                            <button className="flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:text-gray-300 transition-colors">
                                <FaShare /> Paylaş
                            </button>
                        </div>
                    </div>

                    {/* Question Comments Section */}
                    {((question.comments && question.comments.length > 0) || isCommentingOnQuestion) && (
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
                                Yorumlar ({question.comments?.length || 0})
                            </h3>

                            {/* Comment Form */}
                            {isCommentingOnQuestion && (
                                <form onSubmit={handleSubmitComment} className="mb-6">
                                    <textarea
                                        value={commentTexts[commentKey] || ''}
                                        onChange={(e) => setCommentTexts(prev => ({ ...prev, [commentKey]: e.target.value }))}
                                        placeholder="Soruya yorum yazın..."
                                        rows={3}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all resize-none mb-3"
                                    />
                                    <div className="flex items-center justify-between">
                                        <button
                                            type="button"
                                            onClick={() => setCommentAnonymous(prev => ({ ...prev, [commentKey]: !prev[commentKey] }))}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all text-sm ${commentAnonymous[commentKey]
                                                ? 'bg-purple-100 text-purple-700 border-2 border-purple-300'
                                                : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:border-gray-300'
                                                }`}
                                        >
                                            <FaUserSecret />
                                            <span>{commentAnonymous[commentKey] ? 'Anonim yorum' : 'Anonim olarak yorum yap'}</span>
                                        </button>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setCommentingOn(null)}
                                                className="px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-all text-sm"
                                            >
                                                İptal
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={!commentTexts[commentKey]?.trim()}
                                                className="bg-gradient-to-r from-coral to-orange-400 text-white font-semibold py-2 px-6 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                            >
                                                Gönder
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            )}

                            {/* Comments List */}
                            <div className="space-y-4">
                                {question.comments?.map(comment => renderComment(comment, 'question', question.id, 0, null))}
                            </div>
                        </div>
                    )}

                    {/* Answer Form */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Cevap Yaz</h3>
                        <form onSubmit={handleSubmitAnswer}>
                            <textarea
                                value={answerText}
                                onChange={(e) => setAnswerText(e.target.value)}
                                placeholder="Cevabınızı buraya yazın..."
                                rows={4}
                                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all resize-none mb-4"
                            />
                            <div className="flex items-center justify-between">
                                <button
                                    type="button"
                                    onClick={() => setIsAnswerAnonymous(!isAnswerAnonymous)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${isAnswerAnonymous
                                        ? 'bg-purple-100 text-purple-700 border-2 border-purple-300'
                                        : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:border-gray-300'
                                        }`}
                                >
                                    <FaUserSecret className="text-lg" />
                                    <span className="text-sm">{isAnswerAnonymous ? 'Anonim cevap' : 'Anonim olarak cevapla'}</span>
                                </button>
                                <button
                                    type="submit"
                                    disabled={!answerText.trim()}
                                    className="bg-gradient-to-r from-coral to-orange-400 text-white font-semibold py-2 px-6 rounded-2xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Cevap Gönder
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Answers Section */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 md:p-6 shadow-soft">
                        <div className="mb-6">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                                <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                                    {filteredAnswers.length} Cevap
                                </h2>

                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all text-sm font-medium"
                                >
                                    <option value="newest">🆕 En Yeni</option>
                                    <option value="oldest">📅 En Eski</option>
                                    <option value="likes">⭐ En Beğenilen</option>
                                    <option value="replies">💬 En Çok Yorumlanan</option>
                                </select>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setGenderFilter('all')}
                                    className={`px-4 py-2 rounded-xl font-medium transition-all text-sm ${genderFilter === 'all'
                                        ? 'bg-gradient-to-r from-coral to-orange-400 text-white shadow-lg'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                        }`}
                                >
                                    Tümü ({answers.length})
                                </button>
                                <button
                                    onClick={() => setGenderFilter('female')}
                                    className={`px-4 py-2 rounded-xl font-medium transition-all text-sm flex items-center gap-2 ${genderFilter === 'female'
                                        ? 'bg-gradient-to-r from-pink-500 to-pink-400 text-white shadow-lg'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                        }`}
                                >
                                    <FaVenus /> Kadınlar ({answers.filter(a => a.user?.gender === 'female').length})
                                </button>
                                <button
                                    onClick={() => setGenderFilter('male')}
                                    className={`px-4 py-2 rounded-xl font-medium transition-all text-sm flex items-center gap-2 ${genderFilter === 'male'
                                        ? 'bg-gradient-to-r from-blue-500 to-blue-400 text-white shadow-lg'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                        }`}
                                >
                                    <FaMars /> Erkekler ({answers.filter(a => a.user?.gender === 'male').length})
                                </button>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {filteredAnswers.length > 0 ? (
                                filteredAnswers.map((answer) => {
                                    const answerCommentKey = `answer_${answer.id}`;
                                    const isCommentingOnAnswer = commentingOn?.type === 'answer' && commentingOn?.id === answer.id;

                                    return (
                                        <div
                                            key={answer.id}
                                            id={`answer-${answer.id}`}
                                            className={`p-4 md:p-6 rounded-2xl border transition-all scroll-mt-20 ${answer.user?.gender === 'female'
                                                ? 'bg-pink-50/50 dark:bg-pink-900/10 border-pink-100 dark:border-pink-800/30'
                                                : 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/30'
                                                }`}
                                        >
                                            <div className="flex justify-between items-start mb-4">
                                                <Link to={`/profile/${answer.user?.username}`} className="flex items-center gap-3 group">
                                                    <UserAvatar
                                                        user={answer.user}
                                                        size="md"
                                                        className="group-hover:border-coral transition-colors"
                                                    />
                                                    <div>
                                                        <div className="flex items-center gap-1">
                                                            <span className="font-bold text-gray-800 dark:text-gray-200 group-hover:text-coral transition-colors">
                                                                {answer.user?.username || 'Anonim'}
                                                            </span>
                                                            {answer.user?.gender === 'female' ? (
                                                                <FaVenus className="text-pink-500 text-sm" />
                                                            ) : (
                                                                <FaMars className="text-blue-500 text-sm" />
                                                            )}
                                                            {answer.is_accepted && (
                                                                <span className="ml-2 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-2 py-0.5 rounded text-xs font-semibold">
                                                                    ✓ Kabul Edildi
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                                            {formatDate(answer.created_at)}
                                                        </span>
                                                    </div>
                                                </Link>
                                            </div>

                                            <div className="prose prose-sm dark:prose-invert max-w-none mb-4 text-gray-700 dark:text-gray-300">
                                                <p>{answer.content}</p>
                                            </div>

                                            <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
                                                <button className="flex items-center gap-2 hover:text-coral transition-colors">
                                                    <FaHeart />
                                                    <span>{answer.likes_count || 0}</span>
                                                </button>
                                                <button
                                                    onClick={() => setCommentingOn(isCommentingOnAnswer ? null : { type: 'answer', id: answer.id })}
                                                    className="flex items-center gap-2 hover:text-blue-500 transition-colors"
                                                >
                                                    <FaComment />
                                                    <span>Yorum Yap</span>
                                                </button>
                                            </div>

                                            {/* Comment Form for Answer */}
                                            {isCommentingOnAnswer && (
                                                <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                                                    <form onSubmit={handleSubmitComment}>
                                                        <textarea
                                                            value={commentTexts[answerCommentKey] || ''}
                                                            onChange={(e) => setCommentTexts(prev => ({ ...prev, [answerCommentKey]: e.target.value }))}
                                                            placeholder="Cevaba yorum yazın..."
                                                            rows={3}
                                                            className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all resize-none mb-3"
                                                            autoFocus
                                                        />
                                                        <div className="flex items-center justify-between">
                                                            <button
                                                                type="button"
                                                                onClick={() => setCommentAnonymous(prev => ({ ...prev, [answerCommentKey]: !prev[answerCommentKey] }))}
                                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all text-xs ${commentAnonymous[answerCommentKey]
                                                                    ? 'bg-purple-100 text-purple-700 border-2 border-purple-300'
                                                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border-2 border-transparent hover:border-gray-300'
                                                                    }`}
                                                            >
                                                                <FaUserSecret />
                                                                <span>{commentAnonymous[answerCommentKey] ? 'Anonim yorum' : 'Anonim olarak yorum yap'}</span>
                                                            </button>
                                                            <div className="flex gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setCommentingOn(null)}
                                                                    className="py-2 px-4 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all text-sm"
                                                                >
                                                                    İptal
                                                                </button>
                                                                <button
                                                                    type="submit"
                                                                    disabled={!commentTexts[answerCommentKey]?.trim()}
                                                                    className="bg-coral text-white font-semibold py-2 px-4 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                                                >
                                                                    Yorum Gönder
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </form>
                                                </div>
                                            )}

                                            {/* Comments on Answer */}
                                            {answer.comments && answer.comments.length > 0 && (
                                                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                                                    <div className="flex items-center gap-2 mb-4">
                                                        <FaComment className="text-coral text-sm" />
                                                        <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                                                            {answer.comments.length} Yorum
                                                        </span>
                                                    </div>
                                                    <div className="space-y-4">
                                                        {answer.comments.map(comment => renderComment(comment, 'answer', answer.id, 0, null))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                                    <p>Henüz cevap yok. İlk cevabı sen yaz!</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </MainLayout>
        </>
    );
};

export default QuestionDetailPage;
