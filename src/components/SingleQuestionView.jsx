import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { FaHeart, FaComment, FaEye, FaMars, FaVenus, FaShare, FaReply, FaUserSecret } from 'react-icons/fa';
import { questionsAPI, commentsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import UserAvatar from '../components/UserAvatar';
import Toast from '../components/Toast';
import LikersModal from '../components/LikersModal';

const formatDate = (dateString) => {
    if (!dateString) return "Az önce";
    try {
        return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: tr });
    } catch (e) {
        return "Bilinmiyor";
    }
};

const SingleQuestionView = ({ initialQuestion, slug }) => {
    const { user: currentUser } = useAuth();
    const [question, setQuestion] = useState(initialQuestion || null);
    const [answers, setAnswers] = useState(initialQuestion?.answers || []);
    const [loading, setLoading] = useState(!initialQuestion);
    const [error, setError] = useState(null);

    const [answerText, setAnswerText] = useState('');
    const [isAnswerAnonymous, setIsAnswerAnonymous] = useState(currentUser?.last_action_is_anonymous || false);

    const [commentingOn, setCommentingOn] = useState(null);
    const [commentTexts, setCommentTexts] = useState({});
    const [commentAnonymous, setCommentAnonymous] = useState({});

    const [replyingTo, setReplyingTo] = useState(null);
    const [replyTexts, setReplyTexts] = useState({});
    const [replyAnonymous, setReplyAnonymous] = useState({});

    const [genderFilter, setGenderFilter] = useState('all');
    const [sortBy, setSortBy] = useState('newest');

    const [questionCommentsPage, setQuestionCommentsPage] = useState(1);
    const [questionCommentsHasMore, setQuestionCommentsHasMore] = useState(false);
    const [loadingQuestionComments, setLoadingQuestionComments] = useState(false);
    const [answerCommentsPagination, setAnswerCommentsPagination] = useState({});
    const [repliesPagination, setRepliesPagination] = useState({});

    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState('success');

    const displayToast = (message, type = 'success') => {
        setToastMessage(message);
        setToastType(type);
        setShowToast(true);
    };

    const [likersModal, setLikersModal] = useState({ isOpen: false, type: null, id: null });

    const openLikersModal = (type, id) => {
        if (!currentUser) {
            displayToast('Beğenenleri görmek için giriş yapmalısınız.', 'error');
            return;
        }
        setLikersModal({ isOpen: true, type, id });
    };

    const closeLikersModal = () => {
        setLikersModal({ ...likersModal, isOpen: false });
    };

    useEffect(() => {
        if (initialQuestion) {
            setLoading(false);
            setQuestion(initialQuestion);
            setAnswers(initialQuestion.answers || []);
            // Initial hasMore checks
            checkInitialPagination(initialQuestion);
            return;
        }

        const fetchQuestionDetail = async () => {
            setLoading(true);
            try {
                const response = await questionsAPI.getById(slug);
                const questionData = response.data.data.question;

                setQuestion(questionData);
                setAnswers(questionData.answers || []);
                checkInitialPagination(questionData);
            } catch (err) {
                setError("Soru bulunamadı veya yüklenirken bir hata oluştu.");
            } finally {
                setLoading(false);
            }
        };

        if (slug) {
            fetchQuestionDetail();
        }
    }, [slug, initialQuestion]);

    const checkInitialPagination = (data) => {
        const questionTotalComments = data.stats?.comments || data.comments_count || 0;
        const questionLoadedComments = data.comments?.length || 0;
        if (questionLoadedComments > 0 && (questionLoadedComments < questionTotalComments || questionLoadedComments >= 8)) {
            setQuestionCommentsHasMore(true);
        }

        const answersPagination = {};
        (data.answers || []).forEach(answer => {
            const answerTotalComments = answer.comments_count || 0;
            const answerLoadedComments = answer.comments?.length || 0;
            answersPagination[answer.id] = {
                page: 1,
                hasMore: answerLoadedComments > 0 && (answerLoadedComments < answerTotalComments || answerLoadedComments >= 8),
                loading: false
            };
        });
        setAnswerCommentsPagination(answersPagination);
    };

    const handleLike = async (e, type, id) => {
        e.preventDefault();
        e.stopPropagation();

        if (!currentUser) {
            displayToast('Beğenmek için giriş yapmalısınız.', 'error');
            return;
        }

        const toggleLikeInState = (state, setState) => {
            if (type === 'question') {
                setState(prev => {
                    const isLiked = prev.is_liked;
                    return {
                        ...prev,
                        is_liked: !isLiked,
                        likes_count: isLiked ? (prev.likes_count - 1) : (prev.likes_count + 1),
                        stats: {
                            ...prev.stats,
                            likes: isLiked ? (prev.stats?.likes - 1) : (prev.stats?.likes + 1)
                        }
                    };
                });
            } else if (type === 'answer') {
                setState(prev => prev.map(item => {
                    if (item.id === id) {
                        const isLiked = item.is_liked;
                        return {
                            ...item,
                            is_liked: !isLiked,
                            likes_count: isLiked ? (item.likes_count - 1) : (item.likes_count + 1)
                        };
                    }
                    return item;
                }));
            } else if (type === 'comment') {
                const updateCommentTree = (comments) => {
                    return comments.map(comment => {
                        if (comment.id === id) {
                            const isLiked = comment.is_liked;
                            return {
                                ...comment,
                                is_liked: !isLiked,
                                likes_count: isLiked ? (comment.likes_count - 1) : (comment.likes_count + 1)
                            };
                        }
                        if (comment.replies) {
                            return { ...comment, replies: updateCommentTree(comment.replies) };
                        }
                        return comment;
                    });
                };

                if (question?.comments) {
                    setQuestion(prev => ({ ...prev, comments: updateCommentTree(prev.comments || []) }));
                }

                setAnswers(prevAnswers => prevAnswers.map(ans => ({
                    ...ans,
                    comments: updateCommentTree(ans.comments || [])
                })));
            }
        };

        if (type === 'question') toggleLikeInState(question, setQuestion);
        else if (type === 'answer') toggleLikeInState(answers, setAnswers);
        else if (type === 'comment') toggleLikeInState(null, null); // Comment updates handle both states internally

        try {
            const response = await questionsAPI.toggleLike({ type, id });



        } catch (error) {
            console.error('Like toggle error:', error);
            if (type === 'question') toggleLikeInState(question, setQuestion);
            else if (type === 'answer') toggleLikeInState(answers, setAnswers);
            else if (type === 'comment') toggleLikeInState(null, null);

            displayToast('Beğeni işlemi başarısız.', 'error');
        }
    };

    const handleSubmitAnswer = async (e) => {
        e.preventDefault();
        if (!answerText.trim()) return;
        try {
            const response = await questionsAPI.createAnswer(question.id, {
                content: answerText,
                is_anonymous: isAnswerAnonymous
            });
            let newAnswer = response.data.data.answer;
            if (isAnswerAnonymous) {
                newAnswer = { ...newAnswer, user: { name: 'Gizli Üye', username: 'anonim', avatar: null, gender: newAnswer.user?.gender } };
            }
            setAnswers(prev => [newAnswer, ...prev]);
            setAnswerText('');
            setIsAnswerAnonymous(false);
            displayToast('Cevabınız başarıyla gönderildi! 🎉', 'success');
        } catch (err) {
            displayToast(err.response?.data?.message || "Cevap gönderilemedi.", 'error');
        }
    };

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
                parent_id: null,
                is_anonymous: commentAnonymous[commentKey] || false
            });
            let newComment = response.data.data.comment;
            if (commentAnonymous[commentKey]) {
                newComment = { ...newComment, user: { name: 'Gizli Üye', username: 'anonim', avatar: null, gender: newComment.user?.gender } };
            }

            if (commentingOn.type === 'question') {
                setQuestion(prev => ({ ...prev, comments: [newComment, ...(prev.comments || [])] }));
            } else if (commentingOn.type === 'answer') {
                setAnswers(prev => prev.map(a => a.id === commentingOn.id ? { ...a, comments: [newComment, ...(a.comments || [])] } : a));
            }
            setCommentTexts(prev => ({ ...prev, [commentKey]: '' }));
            setCommentAnonymous(prev => ({ ...prev, [commentKey]: false }));
            setCommentingOn(null);
            displayToast('Yorumunuz başarıyla gönderildi! 🎉', 'success');
        } catch (err) {
            displayToast(err.response?.data?.message || "Yorum gönderilemedi.", 'error');
        }
    };

    // Submit Reply
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
                parent_id: replyingTo.mainCommentId,
                is_anonymous: replyAnonymous[replyingTo.commentId] || false
            });
            let newReply = response.data.data.comment;
            if (replyAnonymous[replyingTo.commentId]) {
                newReply = { ...newReply, user: { name: 'Gizli Üye', username: 'anonim', avatar: null, gender: newReply.user?.gender } };
            }

            if (replyingTo.type === 'question') {
                setQuestion(prev => ({ ...prev, comments: updateCommentsWithReply(prev.comments || [], replyingTo.mainCommentId, newReply) }));
            } else if (replyingTo.type === 'answer') {
                setAnswers(prev => prev.map(a => a.id === replyingTo.targetId ? { ...a, comments: updateCommentsWithReply(a.comments || [], replyingTo.mainCommentId, newReply) } : a));
            }
            setReplyTexts(prev => ({ ...prev, [replyingTo.commentId]: '' }));
            setReplyAnonymous(prev => ({ ...prev, [replyingTo.commentId]: false }));
            setReplyingTo(null);
            displayToast('Yanıtınız başarıyla gönderildi! 🎉', 'success');
        } catch (err) {
            displayToast(err.response?.data?.message || "Yanıt gönderilemedi.", 'error');
        }
    };

    const updateCommentsWithReply = (comments, parentId, newReply) => {
        return comments.map(comment => {
            if (comment.id === parentId) return { ...comment, replies: [...(comment.replies || []), newReply] };
            if (comment.replies?.length > 0) return { ...comment, replies: updateCommentsWithReply(comment.replies, parentId, newReply) };
            return comment;
        });
    };

    // Load More Functions
    const loadMoreQuestionComments = async () => {
        if (!question?.id || loadingQuestionComments) return;
        setLoadingQuestionComments(true);
        try {
            const response = await questionsAPI.getQuestionComments(question.id, { page: questionCommentsPage + 1, per_page: 8 });
            const newComments = response.data.data.comments || [];
            const pagination = response.data.data.pagination;
            setQuestion(prev => ({ ...prev, comments: [...(prev.comments || []), ...newComments] }));
            setQuestionCommentsPage(pagination.currentPage);
            setQuestionCommentsHasMore(pagination.hasNextPage);
        } catch (err) { displayToast('Yorumlar yüklenirken hata oluştu', 'error'); }
        finally { setLoadingQuestionComments(false); }
    };

    const loadMoreAnswerComments = async (answerId) => {
        const paginationState = answerCommentsPagination[answerId];
        if (!paginationState || paginationState.loading) return;
        setAnswerCommentsPagination(prev => ({ ...prev, [answerId]: { ...prev[answerId], loading: true } }));
        try {
            const response = await questionsAPI.getAnswerComments(answerId, { page: paginationState.page + 1, per_page: 8 });
            const newComments = response.data.data.comments || [];
            const pagination = response.data.data.pagination;
            setAnswers(prev => prev.map(a => a.id === answerId ? { ...a, comments: [...(a.comments || []), ...newComments] } : a));
            setAnswerCommentsPagination(prev => ({ ...prev, [answerId]: { page: pagination.currentPage, hasMore: pagination.hasNextPage, loading: false } }));
        } catch (err) {
            displayToast('Yorumlar yüklenirken hata oluştu', 'error');
            setAnswerCommentsPagination(prev => ({ ...prev, [answerId]: { ...prev[answerId], loading: false } }));
        }
    };

    const loadMoreReplies = async (commentId) => {
        const paginationState = repliesPagination[commentId] || { page: 1, loading: false };
        if (paginationState.loading) return;
        setRepliesPagination(prev => ({ ...prev, [commentId]: { ...paginationState, loading: true } }));
        try {
            const response = await commentsAPI.getCommentReplies(commentId, { page: paginationState.page + 1, per_page: 5 });
            const newReplies = response.data.data.replies || [];
            const pagination = response.data.data.pagination;
            const appendRepliesToComment = (comments) => {
                return comments.map(c => {
                    if (c.id === commentId) return { ...c, replies: [...(c.replies || []), ...newReplies] };
                    if (c.replies?.length > 0) return { ...c, replies: appendRepliesToComment(c.replies) };
                    return c;
                });
            };
            setQuestion(prev => ({ ...prev, comments: appendRepliesToComment(prev.comments || []) }));
            setAnswers(prev => prev.map(a => ({ ...a, comments: appendRepliesToComment(a.comments || []) })));
            setRepliesPagination(prev => ({ ...prev, [commentId]: { page: pagination.current_page || pagination.currentPage, hasMore: pagination.total > (pagination.current_page * pagination.per_page), loading: false } }));
        } catch (err) {
            displayToast('Yanıtlar yüklenirken hata oluştu', 'error');
            setRepliesPagination(prev => ({ ...prev, [commentId]: { ...paginationState, loading: false } }));
        }
    };

    // Render Helpers
    const renderComment = (comment, type, targetId, level = 0, mainCommentId = null) => {
        const currentMainCommentId = mainCommentId || comment.id;
        const commentGradientClass = comment.user?.gender === 'female'
            ? 'bg-gradient-to-br from-pink-100 to-pink-50 dark:from-pink-900/30 dark:to-pink-900/20 border-pink-400 dark:border-pink-600'
            : 'bg-gradient-to-br from-cyan-100 to-cyan-50 dark:from-cyan-900/30 dark:to-cyan-900/20 border-cyan-400 dark:border-cyan-600';
        const marginClasses = ['ml-0', 'ml-6', 'ml-12', 'ml-16'];
        const marginLeft = marginClasses[Math.min(level, 3)];
        const isReplyingToThis = replyingTo?.commentId === comment.id;

        return (
            <div key={comment.id} className="space-y-3">
                <div id={`comment-${comment.id}`} className={`${commentGradientClass} rounded-xl p-4 ${marginLeft} border-l-4 shadow-sm hover:shadow-md transition-all scroll-mt-20`}>
                    <div className="flex gap-3">
                        {comment.user?.username === 'anonim' ? (
                            <div className="cursor-default">
                                <UserAvatar user={comment.user} size="sm" className="w-10 h-10 border-2 border-white dark:border-gray-600 shadow-sm" />
                            </div>
                        ) : (
                            <Link to={`/profile/${comment.user?.username}`}>
                                <UserAvatar user={comment.user} size="sm" className="w-10 h-10 border-2 border-white dark:border-gray-600 shadow-sm hover:border-coral transition-colors" />
                            </Link>
                        )}
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                {comment.user?.username === 'anonim' ? (
                                    <span className="font-bold text-sm text-gray-800 dark:text-white cursor-default">Gizli Üye</span>
                                ) : (
                                    <Link to={`/profile/${comment.user?.username}`} className="font-bold text-sm text-gray-800 dark:text-white hover:underline">{comment.user?.username}</Link>
                                )}
                                {comment.user?.gender === 'female' ? <FaVenus className="text-pink-600 text-xs" /> : <FaMars className="text-cyan-600 text-xs" />}
                                <span className="text-gray-500 text-xs">• {formatDate(comment.created_at)}</span>
                            </div>
                            <p className="text-gray-800 dark:text-gray-100 text-sm leading-relaxed mb-2">{comment.content}</p>
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
                                <button
                                    onClick={() => setReplyingTo(isReplyingToThis ? null : { commentId: comment.id, mainCommentId: currentMainCommentId, type, targetId })}
                                    className="text-xs text-gray-600 dark:text-gray-400 hover:text-coral transition-colors flex items-center gap-1"
                                >
                                    <FaReply className="text-xs" /> <span>{isReplyingToThis ? 'İptal' : 'Cevapla'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    {isReplyingToThis && (
                        <div className="mt-3 pl-12 border-l-2 border-coral dark:border-coral/50">
                            <form onSubmit={handleSubmitReply}>
                                <textarea
                                    value={replyTexts[comment.id] || ''}
                                    onChange={(e) => setReplyTexts(prev => ({ ...prev, [comment.id]: e.target.value }))}
                                    placeholder={`@${comment.user?.username === 'anonim' ? 'Gizli Üye' : comment.user?.username} kullanıcısına cevap yazın...`}
                                    rows={3}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all resize-none mb-2 text-sm"
                                    autoFocus
                                />
                                <div className="flex justify-between items-center">
                                    <button
                                        type="button"
                                        onClick={() => setReplyAnonymous(prev => ({ ...prev, [comment.id]: !prev[comment.id] }))}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all text-xs ${replyAnonymous[comment.id] ? 'bg-purple-100 text-purple-700 border-2 border-purple-300' : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:border-gray-300'}`}
                                    >
                                        <FaUserSecret /> <span>{replyAnonymous[comment.id] ? 'Gizli yanıt' : 'Gizli Üye olarak yanıtla'}</span>
                                    </button>
                                    <button type="submit" disabled={!replyTexts[comment.id]?.trim()} className="bg-coral text-white font-semibold py-1.5 px-3 rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xs">Yanıtla</button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
                {comment.replies && comment.replies.length > 0 && (
                    <div className="space-y-3">
                        {comment.replies.map(reply => renderComment(reply, type, targetId, level + 1, currentMainCommentId))}
                        {(repliesPagination[comment.id]?.hasMore || (!repliesPagination[comment.id] && comment.replies.length >= 5)) && (
                            <div className={`${marginClasses[Math.min(level + 1, 3)]} pt-1`}>
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

    const getFilteredAndSortedAnswers = () => {
        let filtered = answers.filter(answer => genderFilter === 'all' || answer.user?.gender === genderFilter);
        return filtered.sort((a, b) => {
            switch (sortBy) {
                case 'newest': return new Date(b.created_at) - new Date(a.created_at);
                case 'oldest': return new Date(a.created_at) - new Date(b.created_at);
                case 'likes': return (b.likes_count || 0) - (a.likes_count || 0);
                case 'replies': return (b.comments?.length || 0) - (a.comments?.length || 0);
                default: return 0;
            }
        });
    };

    const filteredAnswers = getFilteredAndSortedAnswers();

    if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div></div>;
    if (error || !question) return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Soru Bulunamadı</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{error || "Aradığınız soru mevcut değil veya silinmiş olabilir."}</p>
            <Link to="/" className="text-coral hover:underline font-semibold">Ana Sayfaya Dön</Link>
        </div>
    );

    const commentKey = commentingOn ? `${commentingOn.type}_${commentingOn.id}` : '';
    const isCommentingOnQuestion = commentingOn?.type === 'question';

    return (
        <div className="pb-10 border-b-8 border-gray-100 dark:border-gray-800 last:border-0 last:pb-0">
            {showToast && <Toast message={toastMessage} type={toastType} onClose={() => setShowToast(false)} />}

            <div className="flex flex-col gap-6">
                {/* Question Card */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft">
                    <div className="flex items-center gap-3 mb-4">
                        {question.user.username === 'anonim' ? (
                            <div className="cursor-default"><UserAvatar user={question.user} size="lg" className="border-2 border-white" /></div>
                        ) : (
                            <Link to={`/profile/${question.user.username}`}><UserAvatar user={question.user} size="lg" className="hover:border-coral transition-colors" /></Link>
                        )}
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                {question.user.username === 'anonim' ? (
                                    <span className="font-bold text-gray-800 dark:text-white cursor-default">Gizli Üye</span>
                                ) : (
                                    <Link to={`/profile/${question.user.username}`} className="font-bold text-gray-800 dark:text-white hover:underline">{question.user.username}</Link>
                                )}
                                {question.user.gender === 'female' ? <FaVenus className="text-pink-500" /> : <FaMars className="text-blue-500" />}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <span className="bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">{question.category}</span>
                                <span>•</span>
                                <span>{formatDate(question.created_at)}</span>
                            </div>
                        </div>
                    </div>

                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4 leading-snug">{question.title}</h1>
                    {question.description && <p className="text-gray-700 dark:text-gray-300 mb-4">{question.description}</p>}

                    <div className="flex flex-wrap gap-2 mb-4">
                        {question.tags?.map((tag, idx) => (
                            <span key={idx} className="bg-gray-100 dark:bg-gray-700 dark:text-gray-300 px-3 py-1 rounded-full text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors cursor-pointer">{tag}</span>
                        ))}
                    </div>

                    {question.image && (
                        <div className="rounded-xl overflow-hidden mb-6 shadow-sm">
                            <img src={question.image} alt="Question" className="w-full h-auto object-cover" />
                        </div>
                    )}

                    <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
                        <div className="flex gap-6">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(e) => handleLike(e, 'question', question.id)}
                                    className={`flex items-center gap-1 transition-colors ${question.is_liked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}
                                >
                                    <FaHeart className="text-lg" />
                                </button>
                                <button
                                    onClick={() => openLikersModal('question', question.id)}
                                    className="font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:underline cursor-pointer"
                                >
                                    {question.likes_count || 0}
                                </button>
                            </div>
                            <button onClick={() => setCommentingOn(isCommentingOnQuestion ? null : { type: 'question', id: question.id })} className="flex items-center gap-2 text-gray-500 hover:text-blue-500 transition-colors">
                                <FaComment className="text-lg" /><span className="font-semibold">{question.answers_count || question.comments?.length || 0}</span>
                            </button>
                            <div className="flex items-center gap-2 text-gray-500"><FaEye /><span>{question.views_count !== undefined ? question.views_count : (question.stats?.views || 0)}</span></div>
                        </div>
                        <button className="flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:text-gray-300 transition-colors"><FaShare /> Paylaş</button>
                    </div>
                </div>

                {/* Question Comments Section */}
                {((question.comments && question.comments.length > 0) || isCommentingOnQuestion) && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Yorumlar ({question.comments?.length || 0})</h3>
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
                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all text-sm ${commentAnonymous[commentKey] ? 'bg-purple-100 text-purple-700 border-2 border-purple-300' : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:border-gray-300'}`}
                                    >
                                        <FaUserSecret /><span>{commentAnonymous[commentKey] ? 'Gizli yorum' : 'Gizli Üye olarak yorum yap'}</span>
                                    </button>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setCommentingOn(null)} className="px-4 py-2 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all text-sm">İptal</button>
                                        <button type="submit" disabled={!commentTexts[commentKey]?.trim()} className="bg-gradient-to-r from-coral to-orange-400 text-white font-semibold py-2 px-6 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm">Gönder</button>
                                    </div>
                                </div>
                            </form>
                        )}
                        <div className="space-y-4">
                            {question.comments?.map(comment => renderComment(comment, 'question', question.id, 0, null))}
                        </div>
                        {questionCommentsHasMore && (
                            <div
                                ref={(el) => {
                                    if (el && !loadingQuestionComments) {
                                        const observer = new IntersectionObserver(
                                            ([entry]) => {
                                                if (entry.isIntersecting) {
                                                    loadMoreQuestionComments();
                                                    observer.disconnect();
                                                }
                                            },
                                            { threshold: 0.1 }
                                        );
                                        observer.observe(el);
                                        return () => observer.disconnect();
                                    }
                                }}
                                className="h-10 flex items-center justify-center mt-2"
                            >
                                {loadingQuestionComments && (
                                    <div className="flex items-center gap-2 text-gray-500 text-sm">
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-coral border-t-transparent"></div>
                                        <span>Yorumlar yükleniyor...</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Answer Form - Only if not owner */}
                {!question.isOwner && (
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
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${isAnswerAnonymous ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-2 border-purple-300 dark:border-purple-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600'}`}
                                >
                                    <FaUserSecret className="text-lg" /><span className="text-sm">{isAnswerAnonymous ? 'Gizli cevap' : 'Gizli Üye olarak cevapla'}</span>
                                </button>
                                <button type="submit" disabled={!answerText.trim()} className="bg-gradient-to-r from-coral to-orange-400 text-white font-semibold py-2 px-6 rounded-2xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">Cevap Gönder</button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Answers Section */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 md:p-6 shadow-soft">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                            <span className="bg-coral/10 text-coral p-2 rounded-lg"><FaComment /></span>
                            Cevaplar <span className="text-gray-500 text-lg font-normal">({answers.length})</span>
                        </h2>
                        <div className="flex flex-wrap gap-3">
                            {/* Filters - Keeping it simple for SingleView */}
                        </div>
                    </div>

                    <div className="space-y-6">
                        {filteredAnswers.length > 0 ? (
                            filteredAnswers.map((answer) => {
                                const answerCommentKey = `answer_${answer.id}`;
                                return (
                                    <div key={answer.id} id={`answer-${answer.id}`} className="p-4 md:p-6 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 scroll-mt-24 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex gap-4">
                                            {answer.user?.username === 'anonim' ? (
                                                <div className="cursor-default"><UserAvatar user={answer.user} size="md" className="border-2 border-white" /></div>
                                            ) : (
                                                <Link to={`/profile/${answer.user?.username}`}><UserAvatar user={answer.user} size="md" className="hover:border-coral transition-colors" /></Link>
                                            )}
                                            <div className="flex-1">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            {answer.user?.username === 'anonim' ? (
                                                                <span className="font-bold text-gray-800 dark:text-white cursor-default">Gizli Üye</span>
                                                            ) : (
                                                                <Link to={`/profile/${answer.user?.username}`} className="font-bold text-gray-800 dark:text-white hover:underline">{answer.user?.username}</Link>
                                                            )}
                                                            {answer.user?.gender === 'female' ? <FaVenus className="text-pink-500" /> : <FaMars className="text-blue-500" />}
                                                        </div>
                                                        <span className="text-xs text-gray-500">{formatDate(answer.created_at)}</span>
                                                    </div>
                                                </div>
                                                <div className="mt-3 text-gray-800 dark:text-gray-100 leading-relaxed whitespace-pre-wrap">{answer.content}</div>

                                                <div className="flex items-center gap-6 mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={(e) => handleLike(e, 'answer', answer.id)}
                                                            className={`flex items-center gap-1 transition-colors ${answer.is_liked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}
                                                        >
                                                            <FaHeart />
                                                        </button>
                                                        <button
                                                            onClick={() => openLikersModal('answer', answer.id)}
                                                            className="font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:underline cursor-pointer"
                                                        >
                                                            {answer.likes_count || 0}
                                                        </button>
                                                    </div>
                                                    <button onClick={() => setCommentingOn(commentingOn?.id === answer.id ? null : { type: 'answer', id: answer.id })} className="flex items-center gap-2 text-gray-500 hover:text-blue-500 transition-colors">
                                                        <FaComment /><span>{answer.comments_count || answer.comments?.length || 0} Yorum</span>
                                                    </button>
                                                </div>

                                                {commentingOn?.type === 'answer' && commentingOn?.id === answer.id && (
                                                    <form onSubmit={handleSubmitComment} className="mt-4">
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
                                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all text-xs ${commentAnonymous[answerCommentKey] ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-2 border-purple-300 dark:border-purple-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600'}`}
                                                            >
                                                                <FaUserSecret /><span>{commentAnonymous[answerCommentKey] ? 'Gizli yorum' : 'Gizli Üye olarak yorum yap'}</span>
                                                            </button>
                                                            <div className="flex gap-2">
                                                                <button type="button" onClick={() => setCommentingOn(null)} className="py-2 px-4 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all text-sm">İptal</button>
                                                                <button type="submit" disabled={!commentTexts[answerCommentKey]?.trim()} className="bg-coral text-white font-semibold py-1.5 px-4 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm">Gönder</button>
                                                            </div>
                                                        </div>
                                                    </form>
                                                )}

                                                {answer.comments && answer.comments.length > 0 && (
                                                    <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                                                        <div className="flex items-center gap-2 mb-4">
                                                            <FaComment className="text-coral text-sm" /><span className="text-sm font-semibold text-gray-600 dark:text-gray-400">{answer.comments.length} Yorum</span>
                                                        </div>
                                                        <div className="space-y-4">{answer.comments.map(comment => renderComment(comment, 'answer', answer.id, 0, null))}</div>
                                                        {/* Infinite Scroll Sentinel for Answer Comments */}
                                                        {answerCommentsPagination[answer.id]?.hasMore && (
                                                            <div className="mt-4 text-center">
                                                                <button onClick={() => loadMoreAnswerComments(answer.id)} disabled={answerCommentsPagination[answer.id]?.loading} className="px-6 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-all disabled:opacity-50">
                                                                    {answerCommentsPagination[answer.id]?.loading ? <span className="flex items-center gap-2"><div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-600 dark:border-gray-400 border-t-transparent"></div> Yükleniyor...</span> : 'Daha fazla göster'}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="text-center py-10 text-gray-500">Henüz cevap yok. İlk cevabı sen yaz!</div>
                        )}
                    </div>
                </div>
            </div>

            <LikersModal
                isOpen={likersModal.isOpen}
                onClose={closeLikersModal}
                type={likersModal.type}
                id={likersModal.id}
            />
        </div>
    );
};

export default SingleQuestionView;
