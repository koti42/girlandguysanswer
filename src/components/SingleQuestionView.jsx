import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { formatDistanceToNow, differenceInHours } from 'date-fns';
import { tr } from 'date-fns/locale';
import { FaHeart, FaThumbsDown, FaComment, FaEye, FaMars, FaVenus, FaShare, FaReply, FaUserSecret, FaImage, FaTimes, FaMedal, FaCheckCircle, FaCheck, FaFlag, FaQuestionCircle, FaHome, FaArrowLeft, FaTrash, FaEyeSlash, FaEdit, FaRobot } from 'react-icons/fa';
import { questionsAPI, commentsAPI, answersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import UserAvatar from '../components/UserAvatar';
import UserHoverCard from '../components/UserHoverCard';
import AiBadge from '../components/common/AiBadge';
import Toast from '../components/Toast';
import LikersModal from '../components/LikersModal';
import GifPickerModal from '../components/GifPickerModal';
import XPToast from '../components/Gamification/XPToast';
import LevelUpModal from '../components/Gamification/LevelUpModal';
import ReportModal from '../components/ReportModal';
import QuestionModerationMenu from '../components/Moderation/QuestionModerationMenu';
import ConfirmationModal from '../components/ConfirmationModal';
import PollWidget from '../components/PollWidget';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryIcons';
import { processHtmlWithMentions, textWithMentions } from '../utils/parseMentions';
import { getProfileColor, getProfileColorStyle, getProfileGradientStyle, getViewerPrefs } from '../utils/userColor';
import DOMPurify from 'dompurify';

const YOUTUBE_URL_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|music\.youtube\.com\/watch\?v=)([A-Za-z0-9_-]{11})/gi;

const getYoutubeVideoLinks = (content) => {
    if (!content || typeof content !== 'string') return [];
    const seen = new Set();
    const result = [];
    let m;
    const re = new RegExp(YOUTUBE_URL_REGEX.source, 'gi');
    while ((m = re.exec(content)) !== null) {
        const videoId = m[1];
        const raw = m[0];
        const fullUrl = raw.startsWith('http') ? raw : `https://${raw}`;
        const isMusic = /music\.youtube\.com/i.test(raw);
        if (!seen.has(videoId)) {
            seen.add(videoId);
            result.push({ url: fullUrl, videoId, isMusic });
        }
    }
    return result;
};

const formatDate = (dateString) => {
    if (!dateString) return "Az önce";
    try {
        return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: tr });
    } catch (e) {
        return "Bilinmiyor";
    }
};

const SingleQuestionView = ({ initialQuestion, slug }) => {
    const { user: currentUser, canModerate } = useAuth();
    const viewerPrefs = getViewerPrefs(currentUser);
    const navigate = useNavigate();
    const location = useLocation();
    const [question, setQuestion] = useState(initialQuestion || null);
    const [answers, setAnswers] = useState(initialQuestion?.answers || []);
    const [loading, setLoading] = useState(!initialQuestion);
    const [error, setError] = useState(null);

    const [answerText, setAnswerText] = useState('');
    const [isAnswerAnonymous, setIsAnswerAnonymous] = useState(currentUser?.last_action_is_anonymous || false);

    const [commentingOn, setCommentingOn] = useState(null);
    const [commentTexts, setCommentTexts] = useState({});
    const [commentAnonymous, setCommentAnonymous] = useState({});
    const [commentGifUrls, setCommentGifUrls] = useState({});

    const [replyingTo, setReplyingTo] = useState(null);
    const [replyTexts, setReplyTexts] = useState({});
    const [replyAnonymous, setReplyAnonymous] = useState({});
    const [replyGifUrls, setReplyGifUrls] = useState({});

    const [answerGifUrl, setAnswerGifUrl] = useState(null);

    const [showGifPicker, setShowGifPicker] = useState(false);
    const [gifPickerContext, setGifPickerContext] = useState(null);

    const [xpNotification, setXpNotification] = useState(null);
    const [levelNotification, setLevelNotification] = useState(null);

    const [genderFilter, setGenderFilter] = useState('all');
    const [sortBy, setSortBy] = useState('newest');

    const [highlightedAnswerId, setHighlightedAnswerId] = useState(null);
    const [highlightedCommentId, setHighlightedCommentId] = useState(null);
    const [isFromNotification, setIsFromNotification] = useState(false);

    const [questionCommentsPage, setQuestionCommentsPage] = useState(1);
    const [questionCommentsHasMore, setQuestionCommentsHasMore] = useState(false);
    const [loadingQuestionComments, setLoadingQuestionComments] = useState(false);
    const loadingQuestionCommentsRef = useRef(false);
    const [answerCommentsPagination, setAnswerCommentsPagination] = useState({});
    const [repliesPagination, setRepliesPagination] = useState({});

    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState('success');

    const [likersModal, setLikersModal] = useState({ isOpen: false, type: null, id: null });
    const [showReportModal, setShowReportModal] = useState(false);
    const [deleteCommentModal, setDeleteCommentModal] = useState({ isOpen: false, commentId: null, type: null, targetId: null });
    const [hideCommentModal, setHideCommentModal] = useState({ isOpen: false, commentId: null, type: null, targetId: null });
    const [deleteAnswerModal, setDeleteAnswerModal] = useState({ isOpen: false, answerId: null });
    const [hideAnswerModal, setHideAnswerModal] = useState({ isOpen: false, answerId: null });

    const [showEditQuestionModal, setShowEditQuestionModal] = useState(false);
    const [editQuestionTitle, setEditQuestionTitle] = useState('');
    const [editQuestionDescription, setEditQuestionDescription] = useState('');
    const [savingQuestionEdit, setSavingQuestionEdit] = useState(false);

    const displayToast = (message, type = 'success') => {
        setToastMessage(message);
        setToastType(type);
        setShowToast(true);
    };

    const answerRestriction = question?.answer_gender_restriction || null;
    const canAnswerByRestriction = !answerRestriction || currentUser?.gender === answerRestriction;
    const answerRestrictionLabel = answerRestriction === 'female'
        ? 'Bu soru sadece kadın kullanıcıların cevabına açıktır.'
        : answerRestriction === 'male'
            ? 'Bu soru sadece erkek kullanıcıların cevabına açıktır.'
            : null;

    useEffect(() => {
        if (showEditQuestionModal && question) {
            setEditQuestionTitle(question.title || '');
            setEditQuestionDescription(question.description || '');
        }
    }, [showEditQuestionModal, question?.id]);

    const handleSaveQuestionEdit = async () => {
        if (!question?.id) return;
        const t = editQuestionTitle.trim();
        if (t.length < 10) {
            displayToast('Başlık en az 10 karakter olmalıdır.', 'error');
            return;
        }
        setSavingQuestionEdit(true);
        try {
            const res = await questionsAPI.updatePublished(question.id, {
                title: t,
                description: editQuestionDescription || null,
            });
            const updated = res.data?.data?.question;
            if (updated) {
                setQuestion(prev => (prev ? { ...prev, ...updated } : updated));
                setAnswers(updated.answers || []);
            }
            setShowEditQuestionModal(false);
            displayToast('Soru güncellendi.');
            if (updated?.slug && slug && updated.slug !== slug) {
                navigate(`/question/${updated.slug}`, { replace: true });
            }
        } catch (err) {
            displayToast(err.response?.data?.message || 'Güncelleme başarısız.', 'error');
        } finally {
            setSavingQuestionEdit(false);
        }
    };

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

    const openDeleteCommentModal = (commentId, type, targetId) => {
        if (!currentUser) {
            displayToast('Yorum silmek için giriş yapmalısınız.', 'error');
            return;
        }
        setDeleteCommentModal({ isOpen: true, commentId, type, targetId });
    };

    const handleDeleteComment = async () => {
        const { commentId, type, targetId } = deleteCommentModal;
        if (!commentId) return;

        try {
            await commentsAPI.delete(commentId);

            const removeCommentFromTree = (comments) => {
                return comments.filter(c => {
                    if (c.id === commentId) return false;
                    if (c.replies) {
                        c.replies = removeCommentFromTree(c.replies);
                    }
                    return true;
                });
            };

            if (type === 'question') {
                setQuestion(prev => ({
                    ...prev,
                    comments: removeCommentFromTree(prev.comments || [])
                }));
            } else if (type === 'answer') {
                setAnswers(prev => prev.map(a =>
                    a.id === targetId
                        ? { ...a, comments: removeCommentFromTree(a.comments || []) }
                        : a
                ));
            }

            displayToast('Yorum başarıyla silindi.', 'success');
        } catch (err) {
            displayToast(err.response?.data?.message || 'Yorum silinemedi.', 'error');
        }
    };

    const openHideCommentModal = (commentId, type, targetId) => {
        if (!currentUser) {
            displayToast('Yorum gizlemek için giriş yapmalısınız.', 'error');
            return;
        }
        setHideCommentModal({ isOpen: true, commentId, type, targetId });
    };

    const handleHideComment = async () => {
        const { commentId, type, targetId } = hideCommentModal;
        if (!commentId) return;

        try {
            await commentsAPI.hide(commentId);

            const removeCommentFromTree = (comments) => {
                return comments.filter(c => {
                    if (c.id === commentId) return false;
                    if (c.replies) {
                        c.replies = removeCommentFromTree(c.replies);
                    }
                    return true;
                });
            };

            if (type === 'question') {
                setQuestion(prev => ({
                    ...prev,
                    comments: removeCommentFromTree(prev.comments || [])
                }));
            } else if (type === 'answer') {
                setAnswers(prev => prev.map(a =>
                    a.id === targetId
                        ? { ...a, comments: removeCommentFromTree(a.comments || []) }
                        : a
                ));
            }

            displayToast('Yorum gizlendi.', 'success');
        } catch (err) {
            displayToast(err.response?.data?.message || 'Yorum gizlenemedi.', 'error');
        }
    };

    const openDeleteAnswerModal = (answerId) => {
        if (!currentUser) {
            displayToast('Cevap silmek için giriş yapmalısınız.', 'error');
            return;
        }
        setDeleteAnswerModal({ isOpen: true, answerId });
    };

    const handleDeleteAnswer = async () => {
        const { answerId } = deleteAnswerModal;
        if (!answerId) return;

        try {
            await answersAPI.delete(answerId);
            setAnswers(prev => prev.filter(a => a.id !== answerId));
            displayToast('Cevap başarıyla silindi.', 'success');
        } catch (err) {
            displayToast(err.response?.data?.message || 'Cevap silinemedi.', 'error');
        }
    };

    const openHideAnswerModal = (answerId) => {
        if (!currentUser) {
            displayToast('Cevap gizlemek için giriş yapmalısınız.', 'error');
            return;
        }
        setHideAnswerModal({ isOpen: true, answerId });
    };

    const handleHideAnswer = async () => {
        const { answerId } = hideAnswerModal;
        if (!answerId) return;

        try {
            await answersAPI.hide(answerId);
            setAnswers(prev => prev.filter(a => a.id !== answerId));
            displayToast('Cevap gizlendi.', 'success');
        } catch (err) {
            displayToast(err.response?.data?.message || 'Cevap gizlenemedi.', 'error');
        }
    };

    const openGifPicker = (context, key) => {
        setGifPickerContext({ context, key });
        setShowGifPicker(true);
    };

    const handleGifSelect = (url) => {
        if (!gifPickerContext) return;

        if (gifPickerContext.context === 'answer') {
            setAnswerGifUrl(url);
        } else if (gifPickerContext.context === 'comment') {
            setCommentGifUrls(prev => ({ ...prev, [gifPickerContext.key]: url }));
        } else if (gifPickerContext.context === 'reply') {
            setReplyGifUrls(prev => ({ ...prev, [gifPickerContext.key]: url }));
        }

        setShowGifPicker(false);
        setGifPickerContext(null);
    };

    const clearCommentGif = (key) => {
        setCommentGifUrls(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const clearReplyGif = (key) => {
        setReplyGifUrls(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    useEffect(() => {
        const { hash } = location;
        if (!hash) {
            setHighlightedAnswerId(null);
            setHighlightedCommentId(null);
            setIsFromNotification(false);
            return;
        }

        let matched = false;

        if (hash.startsWith('#answer-')) {
            const id = decodeURIComponent(hash.replace('#answer-', '')).trim();
            if (id) {
                setHighlightedAnswerId(id);
                matched = true;
            }
        }

        if (hash.startsWith('#comment-')) {
            const id = decodeURIComponent(hash.replace('#comment-', '')).trim();
            if (id) {
                setHighlightedCommentId(id);
                matched = true;
            }
        }

        setIsFromNotification(matched);
    }, [location]);

    useEffect(() => {
        const { hash } = location;
        if (!hash || (!hash.startsWith('#comment-') && !hash.startsWith('#answer-'))) return;

        let attempts = 0;
        const maxAttempts = 12;

        const tryScroll = () => {
            attempts += 1;
            const el = document.querySelector(hash);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            if (attempts < maxAttempts) {
                setTimeout(tryScroll, 200);
            }
        };

        setTimeout(tryScroll, 120);
    }, [location.hash, question?.id, answers.length]);

    useEffect(() => {
        if (initialQuestion) {
            setLoading(false);
            setQuestion(initialQuestion);
            setAnswers(initialQuestion.answers || []);
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
                if (err.response?.status === 404) {
                    setError("not_found");
                } else {
                    setError("Soru yüklenirken bir hata oluştu.");
                }
            } finally {
                setLoading(false);
            }
        };

        if (slug) {
            fetchQuestionDetail();
        }
    }, [slug, initialQuestion]);

    useEffect(() => {
        if (question?.isOwner && question?.is_anonymous) {
            setIsAnswerAnonymous(true);
        }
    }, [question?.id]);

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

    const findCommentById = (commentId) => {
        const search = (list) => {
            for (const item of list || []) {
                if (item.id === commentId) return item;
                const nested = search(item.replies);
                if (nested) return nested;
            }
            return null;
        };
        const fromQuestion = search(question?.comments);
        if (fromQuestion) return fromQuestion;
        for (const answer of answers || []) {
            const fromAnswer = search(answer.comments);
            if (fromAnswer) return fromAnswer;
        }
        return null;
    };

    const updateCommentTreeById = (commentId, updater) => {
        const mapTree = (list) => (list || []).map((item) => {
            if (item.id === commentId) return updater(item);
            if (item.replies?.length) {
                return { ...item, replies: mapTree(item.replies) };
            }
            return item;
        });

        if (question?.comments) {
            setQuestion(prev => ({ ...prev, comments: mapTree(prev.comments) }));
        }
        setAnswers(prev => prev.map(ans => ({
            ...ans,
            comments: mapTree(ans.comments),
        })));
    };

    const handleLike = async (e, type, id) => {
        e.preventDefault();
        e.stopPropagation();

        if (!currentUser) {
            displayToast('Beğenmek için giriş yapmalısınız.', 'error');
            return;
        }
        if (type === 'question' && question?.is_disliked) {
            displayToast('Beğenmek için önce beğenmemenizi geri almalısınız.', 'error');
            return;
        }
        if (type === 'comment') {
            const targetComment = findCommentById(id);
            if (targetComment?.is_disliked) {
                displayToast('Beğenmek için önce beğenmemenizi geri almalısınız.', 'error');
                return;
            }
        }
        if (type === 'answer') {
            const targetAnswer = answers.find((a) => a.id === id);
            if (targetAnswer?.is_disliked) {
                displayToast('Beğenmek için önce beğenmemenizi geri almalısınız.', 'error');
                return;
            }
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
            const data = response.data?.data;
            if (type === 'question' && data) {
                setQuestion(prev => ({
                    ...prev,
                    likes_count: data.likes_count ?? prev.likes_count,
                    dislikes_count: data.dislikes_count ?? prev.dislikes_count,
                    is_liked: data.is_liked ?? prev.is_liked,
                    is_disliked: data.is_disliked ?? prev.is_disliked,
                }));
            } else if (type === 'comment' && data) {
                updateCommentTreeById(id, (comment) => ({
                    ...comment,
                    likes_count: data.likes_count ?? comment.likes_count,
                    dislikes_count: data.dislikes_count ?? comment.dislikes_count,
                    is_liked: data.is_liked ?? comment.is_liked,
                    is_disliked: data.is_disliked ?? comment.is_disliked,
                }));
            } else if (type === 'answer' && data) {
                setAnswers((prev) => prev.map((a) => (a.id === id ? {
                    ...a,
                    likes_count: data.likes_count ?? a.likes_count,
                    dislikes_count: data.dislikes_count ?? a.dislikes_count,
                    is_liked: data.is_liked ?? a.is_liked,
                    is_disliked: data.is_disliked ?? a.is_disliked,
                } : a)));
            }
        } catch (error) {
            console.error('Like toggle error:', error);
            if (type === 'question') toggleLikeInState(question, setQuestion);
            else if (type === 'answer') toggleLikeInState(answers, setAnswers);
            else if (type === 'comment') toggleLikeInState(null, null);

            displayToast(error.response?.data?.message || 'Beğeni işlemi başarısız.', 'error');
        }
    };

    const handleDislike = async (e, type, id) => {
        e.preventDefault();
        e.stopPropagation();

        if (!currentUser) {
            displayToast('Beğenmemek için giriş yapmalısınız.', 'error');
            return;
        }

        if (type === 'question') {
            if (question?.is_liked) {
                displayToast('Beğenmemek için önce beğeninizi geri almalısınız.', 'error');
                return;
            }

            const prevDisliked = question.is_disliked;
            const prevDislikesCount = question.dislikes_count || 0;

            setQuestion(prev => ({
                ...prev,
                is_disliked: !prevDisliked,
                dislikes_count: prevDisliked ? Math.max(0, (prev.dislikes_count || 0) - 1) : (prev.dislikes_count || 0) + 1,
            }));

            try {
                const response = await questionsAPI.toggleDislike({ type: 'question', id: question.id });
                const data = response.data?.data;
                if (data) {
                    setQuestion(prev => ({
                        ...prev,
                        likes_count: data.likes_count ?? prev.likes_count,
                        dislikes_count: data.dislikes_count ?? prev.dislikes_count,
                        is_liked: data.is_liked ?? prev.is_liked,
                        is_disliked: data.is_disliked ?? prev.is_disliked,
                    }));
                }
            } catch (error) {
                setQuestion(prev => ({
                    ...prev,
                    is_disliked: prevDisliked,
                    dislikes_count: prevDislikesCount,
                }));
                displayToast(error.response?.data?.message || 'Beğenmeme işlemi başarısız.', 'error');
            }
            return;
        }

        if (type === 'comment') {
            const targetComment = findCommentById(id);
            if (targetComment?.is_liked) {
                displayToast('Beğenmemek için önce beğeninizi geri almalısınız.', 'error');
                return;
            }

            const snapshot = {
                is_disliked: !!targetComment?.is_disliked,
                dislikes_count: targetComment?.dislikes_count || 0,
            };

            updateCommentTreeById(id, (comment) => ({
                ...comment,
                is_disliked: !comment.is_disliked,
                dislikes_count: comment.is_disliked
                    ? Math.max(0, (comment.dislikes_count || 0) - 1)
                    : (comment.dislikes_count || 0) + 1,
            }));

            try {
                const response = await questionsAPI.toggleDislike({ type: 'comment', id });
                const data = response.data?.data;
                if (data) {
                    updateCommentTreeById(id, (comment) => ({
                        ...comment,
                        likes_count: data.likes_count ?? comment.likes_count,
                        dislikes_count: data.dislikes_count ?? comment.dislikes_count,
                        is_liked: data.is_liked ?? comment.is_liked,
                        is_disliked: data.is_disliked ?? comment.is_disliked,
                    }));
                }
            } catch (error) {
                updateCommentTreeById(id, (comment) => ({
                    ...comment,
                    is_disliked: snapshot.is_disliked,
                    dislikes_count: snapshot.dislikes_count,
                }));
                displayToast(error.response?.data?.message || 'Beğenmeme işlemi başarısız.', 'error');
            }
            return;
        }

        if (type === 'answer') {
            const targetAnswer = answers.find((a) => a.id === id);
            if (targetAnswer?.is_liked) {
                displayToast('Beğenmemek için önce beğeninizi geri almalısınız.', 'error');
                return;
            }

            const snapshot = {
                is_disliked: !!targetAnswer?.is_disliked,
                dislikes_count: targetAnswer?.dislikes_count || 0,
            };

            setAnswers((prev) => prev.map((a) => {
                if (a.id !== id) return a;
                return {
                    ...a,
                    is_disliked: !a.is_disliked,
                    dislikes_count: a.is_disliked
                        ? Math.max(0, (a.dislikes_count || 0) - 1)
                        : (a.dislikes_count || 0) + 1,
                };
            }));

            try {
                const response = await questionsAPI.toggleDislike({ type: 'answer', id });
                const data = response.data?.data;
                if (data) {
                    setAnswers((prev) => prev.map((a) => (a.id === id ? {
                        ...a,
                        likes_count: data.likes_count ?? a.likes_count,
                        dislikes_count: data.dislikes_count ?? a.dislikes_count,
                        is_liked: data.is_liked ?? a.is_liked,
                        is_disliked: data.is_disliked ?? a.is_disliked,
                    } : a)));
                }
            } catch (error) {
                setAnswers((prev) => prev.map((a) => (a.id === id ? {
                    ...a,
                    is_disliked: snapshot.is_disliked,
                    dislikes_count: snapshot.dislikes_count,
                } : a)));
                displayToast(error.response?.data?.message || 'Beğenmeme işlemi başarısız.', 'error');
            }
        }
    };

    const handleSubmitAnswer = async (e) => {
        e.preventDefault();
        if (!canAnswerByRestriction) {
            displayToast(answerRestrictionLabel || 'Bu soruya cevap veremezsiniz.', 'error');
            return;
        }
        if (!answerText.trim() && !answerGifUrl) return;
        try {
            const response = await questionsAPI.createAnswer(question.id, {
                content: answerText || '',
                is_anonymous: isAnswerAnonymous,
                gif_url: answerGifUrl || null
            });
            let newAnswer = response.data.data.answer;
            if (isAnswerAnonymous) {
                newAnswer = { ...newAnswer, user: { name: 'Gizli Üye', username: 'anonim', avatar: null, gender: newAnswer.user?.gender } };
            }
            setAnswers(prev => [newAnswer, ...prev]);
            setAnswerText('');
            setIsAnswerAnonymous(false);
            setAnswerGifUrl(null);

            const gamification = response.data.data.gamification;
            if (gamification) {
                if (gamification.points_added > 0) {
                    setXpNotification({
                        points: gamification.points_added,
                        reason: 'Cevap Yazma'
                    });
                    setTimeout(() => setXpNotification(null), 3000);
                }

                if (gamification.leveled_up) {
                    setLevelNotification({
                        level: gamification.new_level,
                        isLevelUp: true
                    });
                }
            }

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
        const gifUrl = commentGifUrls[commentKey];
        if (!commentText?.trim() && !gifUrl) return;

        try {
            const isAnon = commentAnonymous[commentKey] || false;
            const response = await commentsAPI.create({
                content: commentText || '',
                commentable_type: commentingOn.type,
                commentable_id: commentingOn.id,
                parent_id: null,
                is_anonymous: isAnon,
                gif_url: gifUrl || null
            });
            let newComment = response.data.data.comment;
            if (isAnon) {
                newComment = { ...newComment, user: { name: 'Gizli Üye', username: 'anonim', avatar: null, gender: newComment.user?.gender } };
            }

            if (commentingOn.type === 'question') {
                setQuestion(prev => ({ ...prev, comments: [newComment, ...(prev.comments || [])] }));
            } else if (commentingOn.type === 'answer') {
                setAnswers(prev => prev.map(a => a.id === commentingOn.id ? { ...a, comments: [newComment, ...(a.comments || [])] } : a));
            }
            setCommentTexts(prev => ({ ...prev, [commentKey]: '' }));
            setCommentAnonymous(prev => ({ ...prev, [commentKey]: false }));
            clearCommentGif(commentKey);
            setCommentingOn(null);
            displayToast('Yorumunuz başarıyla gönderildi! 🎉', 'success');
        } catch (err) {
            displayToast(err.response?.data?.message || "Yorum gönderilemedi.", 'error');
        }
    };

    const handleSubmitReply = async (e) => {
        e.preventDefault();
        if (!replyingTo) return;
        const replyText = replyTexts[replyingTo.commentId];
        const gifUrl = replyGifUrls[replyingTo.commentId];
        if (!replyText?.trim() && !gifUrl) return;

        try {
            const isAnon = replyAnonymous[replyingTo.commentId] || false;
            const response = await commentsAPI.create({
                content: replyText || '',
                commentable_type: replyingTo.type,
                commentable_id: replyingTo.targetId,
                parent_id: replyingTo.mainCommentId,
                is_anonymous: isAnon,
                gif_url: gifUrl || null
            });
            let newReply = response.data.data.comment;
            if (isAnon) {
                newReply = { ...newReply, user: { name: 'Gizli Üye', username: 'anonim', avatar: null, gender: newReply.user?.gender } };
            }

            if (replyingTo.type === 'question') {
                setQuestion(prev => ({ ...prev, comments: updateCommentsWithReply(prev.comments || [], replyingTo.mainCommentId, newReply) }));
            } else if (replyingTo.type === 'answer') {
                setAnswers(prev => prev.map(a => a.id === replyingTo.targetId ? { ...a, comments: updateCommentsWithReply(a.comments || [], replyingTo.mainCommentId, newReply) } : a));
            }
            setReplyTexts(prev => ({ ...prev, [replyingTo.commentId]: '' }));
            setReplyAnonymous(prev => ({ ...prev, [replyingTo.commentId]: false }));
            clearReplyGif(replyingTo.commentId);
            setReplyingTo(null);
            displayToast('Yanıtınız başarıyla gönderildi! 🎉', 'success');
        } catch (err) {
            displayToast(err.response?.data?.message || "Yanıt gönderilemedi.", 'error');
        }
    };

    const handleBestAnswer = async (answerId) => {
        try {
            const response = await answersAPI.selectBestAnswer(answerId);

            setAnswers(prev => prev.map(a =>
                a.id === answerId ? { ...a, is_accepted: true } : a
            ));

            const gamification = response.data.data?.gamification;
            if (gamification) {
                if (gamification.points_added > 0) {
                    setXpNotification({
                        points: gamification.points_added,
                        reason: 'En İyi Görüş Seçimi'
                    });
                    setTimeout(() => setXpNotification(null), 3000);
                }
            }

            displayToast('En iyi görüş seçildi! 🌟', 'success');
        } catch (err) {
            displayToast(err.response?.data?.message || "İşlem başarısız.", 'error');
        }
    };

    const updateCommentsWithReply = (comments, parentId, newReply) => {
        return comments.map(comment => {
            if (comment.id === parentId) return { ...comment, replies: [...(comment.replies || []), newReply] };
            if (comment.replies?.length > 0) return { ...comment, replies: updateCommentsWithReply(comment.replies, parentId, newReply) };
            return comment;
        });
    };

    const loadMoreQuestionComments = async () => {
        if (!question?.id || loadingQuestionComments || loadingQuestionCommentsRef.current) return;
        loadingQuestionCommentsRef.current = true;
        setLoadingQuestionComments(true);
        try {
            const response = await questionsAPI.getQuestionComments(question.id, { page: questionCommentsPage + 1, per_page: 8 });
            const newComments = response.data.data.comments || [];
            const pagination = response.data.data.pagination;
            setQuestion(prev => {
                const existingIds = new Set((prev.comments || []).map(c => String(c.id)));
                const uniqueNew = newComments.filter(c => c.id != null && !existingIds.has(String(c.id)));
                return { ...prev, comments: [...(prev.comments || []), ...uniqueNew] };
            });
            setQuestionCommentsPage(pagination.currentPage);
            setQuestionCommentsHasMore(pagination.hasNextPage);
        } catch (err) { displayToast('Yorumlar yüklenirken hata oluştu', 'error'); }
        finally {
            loadingQuestionCommentsRef.current = false;
            setLoadingQuestionComments(false);
        }
    };

    const loadMoreAnswerComments = async (answerId) => {
        const paginationState = answerCommentsPagination[answerId];
        if (!paginationState || paginationState.loading) return;
        setAnswerCommentsPagination(prev => ({ ...prev, [answerId]: { ...prev[answerId], loading: true } }));
        try {
            const response = await questionsAPI.getAnswerComments(answerId, { page: paginationState.page + 1, per_page: 8 });
            const newComments = response.data.data.comments || [];
            const pagination = response.data.data.pagination;
            setAnswers(prev => prev.map(a => {
                if (a.id !== answerId) return a;
                const existingIds = new Set((a.comments || []).map(c => String(c.id)));
                const uniqueNew = newComments.filter(c => c.id != null && !existingIds.has(String(c.id)));
                return { ...a, comments: [...(a.comments || []), ...uniqueNew] };
            }));
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
                    if (c.id === commentId) {
                        const existingIds = new Set((c.replies || []).map(r => String(r.id)));
                        const uniqueNew = newReplies.filter(r => r.id != null && !existingIds.has(String(r.id)));
                        return { ...c, replies: [...(c.replies || []), ...uniqueNew] };
                    }
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

    const renderComment = (comment, type, targetId, level = 0, mainCommentId = null) => {
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
                        {comment.replies.map(reply => renderComment(reply, type, targetId, level + 1, currentMainCommentId))}
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

    const getSortedAnswers = () => {
        return [...answers].sort((a, b) => {
            switch (sortBy) {
                case 'newest': return new Date(b.created_at) - new Date(a.created_at);
                case 'oldest': return new Date(a.created_at) - new Date(b.created_at);
                case 'likes': return (b.likes_count || 0) - (a.likes_count || 0);
                case 'replies': return (b.comments?.length || 0) - (a.comments?.length || 0);
                default: return 0;
            }
        });
    };

    const sortedAnswers = getSortedAnswers();

    const acceptedAnswers = sortedAnswers.filter((answer) => answer.is_accepted);

    const highlightedAnswer = highlightedAnswerId
        ? sortedAnswers.find((a) => String(a.id) === String(highlightedAnswerId))
        : null;

    const bestAnswers = acceptedAnswers.filter(
        (answer) => !highlightedAnswer || answer.id !== highlightedAnswer.id
    );

    const idsToExclude = new Set([
        ...acceptedAnswers.map((a) => a.id),
        ...(highlightedAnswer ? [highlightedAnswer.id] : []),
    ]);

    const remainingAnswers = sortedAnswers.filter((answer) => !idsToExclude.has(answer.id));

    const aiAnswers = remainingAnswers.filter((answer) => answer.user?.is_ai || answer.user?.is_bot);
    const maleAnswers = remainingAnswers.filter((answer) => !answer.user?.is_ai && !answer.user?.is_bot && answer.user?.gender === 'male');
    const femaleAnswers = remainingAnswers.filter((answer) => !answer.user?.is_ai && !answer.user?.is_bot && answer.user?.gender === 'female');
    const otherAnswers = remainingAnswers.filter(
        (answer) => !answer.user?.is_ai && !answer.user?.is_bot && (!answer.user?.gender || (answer.user.gender !== 'male' && answer.user.gender !== 'female'))
    );

    if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div></div>;

    if (error === "not_found" || (!question && error)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-12">
                <div className="max-w-md w-full text-center bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-soft">
                    <div className="mb-6 flex justify-center">
                        <div className="w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                            <FaQuestionCircle className="text-5xl text-gray-400 dark:text-gray-500" />
                        </div>
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                        Soru Bulunamadı
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-8 text-lg">
                        Bu soru kaldırılmış, gizlenmiş veya mevcut değil olabilir.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <Link
                            to="/"
                            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-coral to-orange-400 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
                        >
                            <FaHome />
                            Ana Sayfaya Dön
                        </Link>
                        <button
                            onClick={() => navigate(-1)}
                            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                            <FaArrowLeft />
                            Geri Git
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!question) return null;

    const commentKey = commentingOn ? `${commentingOn.type}_${commentingOn.id}` : '';
    const isCommentingOnQuestion = commentingOn?.type === 'question';

    return (
        <div className="pb-10 border-b-8 border-gray-100 dark:border-gray-800 last:border-0 last:pb-0">
            {showToast && <Toast message={toastMessage} type={toastType} onClose={() => setShowToast(false)} />}

            {/* Gamification Feedback */}
            {xpNotification && <XPToast points={xpNotification.points} reason={xpNotification.reason} />}
            {levelNotification && (
                <LevelUpModal
                    newLevel={levelNotification.level}
                    onClose={() => setLevelNotification(null)}
                />
            )}

            <div className="flex flex-col gap-6">
                {/* Question Card */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft border-l-4" style={getProfileColorStyle(question.user, viewerPrefs)}>
                    <div className="flex items-center gap-3 mb-4">
                        {question.user.username === 'anonim' ? (
                            <>
                                <div className="cursor-default">
                                    <UserAvatar user={question.user} size="lg" className="border-2 border-white" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-gray-800 dark:text-white cursor-default">Gizli Üye</span>
                                        {question.isOwner && question.is_anonymous && (
                                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">(Soru sahibi)</span>
                                        )}
                                        {question.user?.age_range && (
                                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">(Yaş: {question.user.age_range})</span>
                                        )}
                                        {question.user?.level && (
                                            <span
                                                className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                                                style={question.user?.level_color ? { color: question.user.level_color, backgroundColor: `${question.user.level_color}20` } : {}}
                                            >
                                                {typeof question.user.level === 'object' ? question.user.level?.name : question.user.level}
                                            </span>
                                        )}
                                        <span style={{ color: getProfileColor(question.user, viewerPrefs) }}>{question.user.gender === 'female' ? <FaVenus /> : <FaMars />}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                        {question.category?.name && (() => {
                                            const categoryName = question.category.name;
                                            const categoryColor = question.category.color;
                                            const IconComponent = getCategoryIcon(categoryName);
                                            const hexColor = getCategoryColor(categoryColor);
                                            return (
                                                <span style={{ backgroundColor: hexColor }} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-white text-[10px] font-bold">
                                                    <IconComponent className="text-sm" />{categoryName}
                                                </span>
                                            );
                                        })()}
                                        <span>•</span>
                                        <span>{formatDate(question.created_at)}</span>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 min-w-0">
                                <UserHoverCard
                                    username={question.user.username}
                                    categoryName={question.category?.name}
                                    categoryColor={question.category?.color}
                                    user={question.user}
                                >
                                    <div className="flex items-center gap-3">
                                        <Link to={`/profile/${question.user.username}`}>
                                            <div className="relative inline-flex">
                                                {question.user?.feature_tag && question.user.feature_tag.color && (
                                                    <div
                                                        className="feature-tag-ring"
                                                        style={{ borderColor: question.user.feature_tag.color, boxShadow: `${question.user.feature_tag.color}66 0 0 24px` }}
                                                    />
                                                )}
                                                <UserAvatar
                                                    user={question.user}
                                                    size="lg"
                                                    className="hover:border-coral transition-colors relative"
                                                />
                                            </div>
                                        </Link>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Link to={`/profile/${question.user.username}`} className="font-bold text-gray-800 dark:text-white hover:underline">{question.user.username}</Link>
                                                {(question.user?.is_ai || question.user?.is_bot) && (
                                                    <AiBadge />
                                                )}
                                                {question.isOwner && question.is_anonymous && (
                                                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">(Soru sahibi)</span>
                                                )}
                                                {question.user?.age_range && (
                                                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">(Yaş: {question.user.age_range})</span>
                                                )}
                                                {question.user?.level && (
                                                    <span
                                                        className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                                                        style={question.user?.level_color ? { color: question.user.level_color, backgroundColor: `${question.user.level_color}20` } : {}}
                                                    >
                                                        {typeof question.user.level === 'object' ? question.user.level?.name : question.user.level}
                                                    </span>
                                                )}
                                                {question.user?.feature_tag && (
                                                    <span
                                                        className="text-xs font-semibold px-1.5 py-0.5 rounded-md border"
                                                        style={{
                                                            color: question.user.feature_tag.color || '#FACC15',
                                                            borderColor: question.user.feature_tag.color || '#FACC15',
                                                            backgroundColor: `${(question.user.feature_tag.color || '#FACC15')}14`,
                                                        }}
                                                    >
                                                        {question.user.feature_tag.name}
                                                    </span>
                                                )}
                                                <span style={{ color: getProfileColor(question.user, viewerPrefs) }}>{question.user.gender === 'female' ? <FaVenus /> : <FaMars />}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                                {question.category?.name && (() => {
                                                    const categoryName = question.category.name;
                                                    const categoryColor = question.category.color;
                                                    const IconComponent = getCategoryIcon(categoryName);
                                                    const hexColor = getCategoryColor(categoryColor);
                                                    return (
                                                        <span style={{ backgroundColor: hexColor }} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-white text-[10px] font-bold">
                                                            <IconComponent className="text-sm" />{categoryName}
                                                        </span>
                                                    );
                                                })()}
                                                <span>•</span>
                                                <span>{formatDate(question.created_at)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </UserHoverCard>
                            </div>
                        )}

                        {/* Moderation Menu for Moderators */}
                        {(canModerate || question.canModerate) && (
                            <QuestionModerationMenu
                                question={question}
                                onActionComplete={(action, message) => {
                                    displayToast(message, 'success');
                                    if (action === 'remove') {
                                        setTimeout(() => {
                                            window.location.reload();
                                        }, 1000);
                                    } else {
                                        fetchQuestionDetail();
                                    }
                                }}
                            />
                        )}
                    </div>

                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                        <h1 className="text-2xl font-bold text-gray-800 dark:text-white leading-snug flex-1 min-w-0">{question.title}</h1>
                        {question.canEdit && (
                            <button
                                type="button"
                                onClick={() => setShowEditQuestionModal(true)}
                                className="flex-shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                <FaEdit /> Düzenle
                            </button>
                        )}
                    </div>
                    {question.canEdit && question.can_edit_published_until && (
                        <p className="text-xs text-amber-700 dark:text-amber-400/90 -mt-2 mb-4">
                            Başlık ve detayı düzenleme süreniz{' '}
                            {formatDistanceToNow(new Date(question.can_edit_published_until), { addSuffix: true, locale: tr })} doluyor.
                            {typeof question.published_edits_remaining === 'number' && (
                                <> Yayın sonrası en fazla 2 düzenleme; kalan hakkınız: <strong>{question.published_edits_remaining}</strong>.</>
                            )}
                        </p>
                    )}
                    {question.description && (
                        <div
                            className="text-gray-700 dark:text-gray-300 mb-4 break-words [&>div]:mb-2 [&>div:last-child]:mb-0 [&_b]:font-semibold [&_strong]:font-semibold [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-2 [&_.mention-link]:font-semibold [&_.mention-link]:text-coral [&_.mention-link]:hover:text-coral-dark [&_.mention-link]:hover:underline [&_.mention-link]:cursor-pointer"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(processHtmlWithMentions(question.description), { ALLOWED_TAGS: ['div', 'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'a', 'span', 'img'], ALLOWED_ATTR: ['href', 'target', 'src', 'alt', 'class', 'style'] }) }}
                            onClick={(e) => {
                                const a = e.target.closest('a[href^="/profile/"]');
                                if (a) {
                                    e.preventDefault();
                                    navigate(a.getAttribute('href'));
                                }
                            }}
                        />
                    )}



                    <div className="flex flex-wrap gap-2 mb-4">
                        {question.tags?.map((tag, idx) => (
                            <span key={idx} className="bg-gray-100 dark:bg-gray-700 dark:text-gray-300 px-3 py-1 rounded-full text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors cursor-pointer">{tag}</span>
                        ))}
                        {answerRestrictionLabel && (
                            <span className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-full text-xs font-semibold">
                                {answerRestriction === 'female' ? 'Sadece kadınlar cevaplayabilir' : 'Sadece erkekler cevaplayabilir'}
                            </span>
                        )}
                    </div>

                    {question.image && (
                        <div className="rounded-xl overflow-hidden mb-6 shadow-sm">
                            <img src={question.image} alt="Question" className="w-full h-auto object-cover" />
                        </div>
                    )}
                    {(question.has_poll || question.poll) && question.poll && (
                        <PollWidget
                            poll={question.poll}
                            onPollUpdate={(updatedPoll) => setQuestion(prev => prev ? { ...prev, poll: updatedPoll } : null)}
                        />
                    )}
                    {question.gif_url && (
                        <div className="rounded-xl overflow-hidden mb-6 shadow-sm">
                            <img
                                src={question.gif_url}
                                alt="GIF"
                                className="w-full h-auto object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => window.open(question.gif_url, '_blank')}
                            />
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
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(e) => handleDislike(e, 'question', question.id)}
                                    className={`flex items-center gap-1 transition-colors ${question.is_disliked ? 'text-slate-600 dark:text-slate-300' : 'text-gray-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                >
                                    <FaThumbsDown className="text-lg" />
                                </button>
                                <span className="font-semibold text-gray-500">{question.dislikes_count || 0}</span>
                            </div>
                            {false && <button onClick={() => setCommentingOn(isCommentingOnQuestion ? null : { type: 'question', id: question.id })} className="flex items-center gap-2 text-gray-500 hover:text-blue-500 transition-colors">
                                <FaComment className="text-lg" /><span className="font-semibold">{question.answers_count || question.comments?.length || 0}</span>
                            </button>}
                            <div className="flex items-center gap-2 text-gray-500"><FaEye /><span>{question.views_count !== undefined ? question.views_count : (question.stats?.views || 0)}</span></div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button className="flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:text-gray-300 transition-colors"><FaShare /> Paylaş</button>
                            {currentUser && (
                                <button
                                    onClick={() => setShowReportModal(true)}
                                    className="flex items-center gap-2 text-gray-500 hover:text-red-500 transition-colors"
                                    title="Şikayet Et"
                                >
                                    <FaFlag />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Question Comments Section - DISABLED */}
                {false && ((question.comments && question.comments.length > 0) || isCommentingOnQuestion) && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Yorumlar ({question.comments?.length || 0})</h3>
                        {isCommentingOnQuestion && (
                            <form onSubmit={handleSubmitComment} className="mb-6">
                                {commentGifUrls[commentKey] && (
                                    <div className="mb-3 relative inline-block">
                                        <img src={commentGifUrls[commentKey]} alt="GIF" className="max-w-xs rounded-xl shadow-sm" />
                                        <button
                                            type="button"
                                            onClick={() => clearCommentGif(commentKey)}
                                            className="absolute top-2 right-2 bg-black/60 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
                                        >
                                            <FaTimes className="text-xs" />
                                        </button>
                                    </div>
                                )}
                                <textarea
                                    value={commentTexts[commentKey] || ''}
                                    onChange={(e) => setCommentTexts(prev => ({ ...prev, [commentKey]: e.target.value }))}
                                    placeholder="Soruya yorum yazın..."
                                    rows={3}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all resize-none mb-3"
                                />
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => openGifPicker('comment', commentKey)}
                                            className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:text-coral hover:bg-gray-200 transition-colors"
                                            title="GIF Ekle"
                                        >
                                            <FaImage />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setCommentAnonymous(prev => ({ ...prev, [commentKey]: !prev[commentKey] }))}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all text-sm ${commentAnonymous[commentKey] ? 'bg-purple-100 text-purple-700 border-2 border-purple-300' : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:border-gray-300'}`}
                                        >
                                            <FaUserSecret /><span>{commentAnonymous[commentKey] ? 'Gizli yorum' : 'Gizli Üye olarak yorum yap'}</span>
                                        </button>
                                    </div>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setCommentingOn(null)} className="px-4 py-2 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all text-sm">İptal</button>
                                        <button type="submit" disabled={!commentTexts[commentKey]?.trim() && !commentGifUrls[commentKey]} className="bg-gradient-to-r from-coral to-orange-400 text-white font-semibold py-2 px-6 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm">Gönder</button>
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
                {!question.isOwner && canAnswerByRestriction && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Cevap Yaz</h3>
                        <form onSubmit={handleSubmitAnswer}>
                            {answerGifUrl && (
                                <div className="mb-4 relative inline-block">
                                    <img src={answerGifUrl} alt="GIF" className="max-w-xs rounded-xl shadow-sm" />
                                    <button
                                        type="button"
                                        onClick={() => setAnswerGifUrl(null)}
                                        className="absolute top-2 right-2 bg-black/60 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
                                    >
                                        <FaTimes className="text-xs" />
                                    </button>
                                </div>
                            )}
                            <textarea
                                value={answerText}
                                onChange={(e) => setAnswerText(e.target.value)}
                                placeholder="Cevabınızı buraya yazın..."
                                rows={4}
                                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all resize-none mb-4"
                            />
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => openGifPicker('answer', 'answer')}
                                        className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:text-coral transition-colors flex-shrink-0"
                                        title="GIF Ekle"
                                    >
                                        <FaImage />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsAnswerAnonymous(!isAnswerAnonymous)}
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-medium transition-all text-sm ${isAnswerAnonymous ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-2 border-purple-300 dark:border-purple-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600'}`}
                                    >
                                        <FaUserSecret className="flex-shrink-0" /><span className="hidden sm:inline">{isAnswerAnonymous ? 'Gizli cevap' : 'Gizli Üye olarak cevapla'}</span><span className="sm:hidden">{isAnswerAnonymous ? 'Gizli' : 'Gizli Üye'}</span>
                                    </button>
                                </div>
                                <button type="submit" disabled={!answerText.trim() && !answerGifUrl} className="bg-gradient-to-r from-coral to-orange-400 text-white font-semibold py-2 px-6 rounded-2xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto">Cevap Gönder</button>
                            </div>
                        </form>
                    </div>
                )}
                {!question.isOwner && !canAnswerByRestriction && answerRestrictionLabel && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft">
                        <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 px-4 py-3 text-indigo-700 dark:text-indigo-300 text-sm font-medium">
                            {answerRestrictionLabel}
                        </div>
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

                    {/* Highlighted answer from notification */}
                    {isFromNotification && highlightedAnswer && (
                        <div className="mb-8 rounded-2xl border-2 border-amber-300 bg-amber-50/70 dark:bg-amber-900/20 p-4 md:p-5 shadow-sm">
                            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-3 uppercase tracking-wide">
                                Bildirimden Gelen Cevap
                            </h3>
                            <div className="space-y-4">
                                {/* Render single highlighted answer card */}
                                {(() => {
                                    const answer = highlightedAnswer;
                                    const answerCommentKey = `answer_${answer.id}`;
                                    const isBestAnswer = answer.is_accepted;
                                    const isOwner = question.isOwner;

                                    const hoursSinceQuestion = question.created_at ? differenceInHours(new Date(), new Date(question.created_at)) : 0;
                                    const hasBestForGender = acceptedAnswers.some(
                                        (a) => a.user?.gender && a.user.gender === answer.user?.gender
                                    );
                                    const canSelectBestAnswer =
                                        isOwner &&
                                        hoursSinceQuestion >= 24 &&
                                        !hasBestForGender &&
                                        !isBestAnswer &&
                                        answer.user?.id !== currentUser?.id;

                                    const answerColorStyle = isBestAnswer ? null : getProfileGradientStyle(answer.user, viewerPrefs, 0.08);
                                    const answerBorderClass = isBestAnswer ? 'border-green-200 dark:border-green-800' : '';
                                    const answerBgClass = isBestAnswer ? 'bg-green-50 dark:bg-green-900/10 ring-1 ring-green-100 dark:ring-green-900' : '';
                                    const highlightClasses = ' ring-2 ring-amber-400';

                                    return (
                                        <div key={answer.id} id={`answer-${answer.id}`} className={`p-4 md:p-6 rounded-2xl border-l-4 border transition-all scroll-mt-24 shadow-sm hover:shadow-md ${answerBorderClass} ${answerBgClass}${highlightClasses}`} style={answerColorStyle}>
                                            <div className="flex gap-3 min-w-0">
                                                {answer.user?.username === 'anonim' ? (
                                                    <div className="cursor-default shrink-0"><UserAvatar user={answer.user} size="md" className="border-2 border-white" /></div>
                                                ) : (
                                                    <Link to={`/profile/${answer.user?.username}`} className="shrink-0"><UserAvatar user={answer.user} size="md" className="hover:border-coral transition-colors" /></Link>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                {answer.user?.username === 'anonim' ? (
                                                                    <span className="font-bold text-gray-800 dark:text-white cursor-default">Gizli Üye</span>
                                                                ) : (
                                                                    <Link to={`/profile/${answer.user?.username}`} className="font-bold text-gray-800 dark:text-white hover:underline">{answer.user?.username}</Link>
                                                                )}
                                                                {(answer.user?.is_ai || answer.user?.is_bot) && (
                                                                    <AiBadge />
                                                                )}
                                                                {answer.is_question_owner && (
                                                                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md shrink-0" style={{ backgroundColor: getProfileColor(answer.user, viewerPrefs) + '20', color: getProfileColor(answer.user, viewerPrefs) }}>
                                                                        {answer.user?.username === 'anonim' ? '(Soru Sahibi)' : 'Soru Sahibi'}
                                                                    </span>
                                                                )}
                                                                {answer.user?.age_range && (
                                                                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 shrink-0">(Yaş: {answer.user.age_range})</span>
                                                                )}
                                                                {answer.user?.level && (
                                                                    <span
                                                                        className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0"
                                                                        style={answer.user?.level_color ? { color: answer.user.level_color, backgroundColor: `${answer.user.level_color}20` } : {}}
                                                                    >
                                                                        {typeof answer.user.level === 'object' ? answer.user.level?.name : answer.user.level}
                                                                    </span>
                                                                )}
                                                                {answer.user?.feature_tag && (
                                                                    <span
                                                                        className="text-xs font-semibold px-1.5 py-0.5 rounded-md border shrink-0"
                                                                        style={{
                                                                            color: answer.user.feature_tag.color || '#FACC15',
                                                                            borderColor: answer.user.feature_tag.color || '#FACC15',
                                                                            backgroundColor: `${(answer.user.feature_tag.color || '#FACC15')}14`,
                                                                        }}
                                                                    >
                                                                        {answer.user.feature_tag.name}
                                                                    </span>
                                                                )}
                                                                <span className="shrink-0" style={{ color: getProfileColor(answer.user, viewerPrefs) }}>{answer.user?.gender === 'female' ? <FaVenus /> : <FaMars />}</span>
                                                            </div>
                                                            <span className="text-xs text-gray-500">{formatDate(answer.created_at)}</span>

                                                            {/* Select Best Answer Button - Mobile */}
                                                            {canSelectBestAnswer && (
                                                                <button
                                                                    onClick={() => handleBestAnswer(answer.id)}
                                                                    className="lg:hidden mt-2 text-xs font-semibold text-green-600 hover:bg-green-50 px-2 py-1 rounded-lg border border-green-200 transition-colors flex items-center gap-1"
                                                                >
                                                                    <FaCheckCircle /> EİG Seç
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* Select Best Answer Button - Desktop */}
                                                        {canSelectBestAnswer && (
                                                            <button
                                                                onClick={() => handleBestAnswer(answer.id)}
                                                                className="hidden lg:flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-green-600 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-3 py-1.5 rounded-xl hover:border-green-300 transition-all shadow-sm"
                                                                title="En İyi Görüş Seç"
                                                            >
                                                                <FaCheck /> Seç
                                                            </button>
                                                        )}
                                                    </div>
                                                    {answer.content && <div className="mt-3 text-gray-800 dark:text-gray-100 leading-relaxed whitespace-pre-wrap break-words">{textWithMentions(answer.content)}</div>}
                                                    {answer.gif_url && (
                                                        <div className="mt-3 rounded-lg overflow-hidden">
                                                            <img
                                                                src={answer.gif_url}
                                                                alt="GIF"
                                                                className="max-w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                                                onClick={() => window.open(answer.gif_url, '_blank')}
                                                            />
                                                        </div>
                                                    )}

                                                    <div className="flex flex-wrap items-center gap-4 md:gap-6 mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
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
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={(e) => handleDislike(e, 'answer', answer.id)}
                                                                className={`flex items-center gap-1 transition-colors ${answer.is_disliked ? 'text-slate-600 dark:text-slate-300' : 'text-gray-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                                            >
                                                                <FaThumbsDown />
                                                            </button>
                                                            <span className="font-semibold text-gray-500">{answer.dislikes_count || 0}</span>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                const key = `answer_${answer.id}`;
                                                                if (question.is_anonymous && question.isOwner) {
                                                                    setCommentAnonymous(prev => ({ ...prev, [key]: true }));
                                                                }
                                                                setCommentingOn(commentingOn?.id === answer.id ? null : { type: 'answer', id: answer.id });
                                                            }}
                                                            className="flex items-center gap-2 text-gray-500 hover:text-blue-500 transition-colors"
                                                        >
                                                            <FaComment /><span>{answer.comments_count || answer.comments?.length || 0} Yorum</span>
                                                        </button>
                                                    </div>

                                                    {commentingOn?.type === 'answer' && commentingOn?.id === answer.id && (
                                                        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-2xl border border-gray-100 dark:border-gray-700">
                                                            <div className="flex items-center gap-2 mb-3">
                                                                <UserAvatar user={currentUser} size="xs" className="w-6 h-6 flex-shrink-0" />
                                                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 truncate">
                                                                    {currentUser?.username}
                                                                </span>
                                                                <span className="text-[10px] text-gray-400">• yorum yazıyor</span>
                                                            </div>
                                                            <form onSubmit={handleSubmitComment}>
                                                                {commentGifUrls[answerCommentKey] && (
                                                                    <div className="mb-2 relative inline-block">
                                                                        <img src={commentGifUrls[answerCommentKey]} alt="GIF" className="max-w-[160px] sm:max-w-xs rounded-xl shadow-sm" />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => clearCommentGif(answerCommentKey)}
                                                                            className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
                                                                        >
                                                                            <FaTimes className="text-[10px]" />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                <textarea
                                                                    value={commentTexts[answerCommentKey] || ''}
                                                                    onChange={(e) => setCommentTexts(prev => ({ ...prev, [answerCommentKey]: e.target.value }))}
                                                                    placeholder="Yorumunuzu yazın..."
                                                                    rows={2}
                                                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-2 focus:ring-coral/20 transition-all resize-none text-sm"
                                                                    autoFocus
                                                                />
                                                                <div className="flex items-center gap-1.5 mt-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openGifPicker('comment', answerCommentKey)}
                                                                        className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-500 hover:text-coral dark:hover:text-coral hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors flex-shrink-0"
                                                                        title="GIF Ekle"
                                                                    >
                                                                        <FaImage className="text-xs" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setCommentAnonymous(prev => ({ ...prev, [answerCommentKey]: !prev[answerCommentKey] }))}
                                                                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
                                                                            commentAnonymous[answerCommentKey]
                                                                                ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 ring-1 ring-purple-300 dark:ring-purple-700'
                                                                                : 'bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-500'
                                                                        }`}
                                                                    >
                                                                        <FaUserSecret className="text-[11px]" />
                                                                        <span className="hidden xs:inline">{commentAnonymous[answerCommentKey] ? 'Gizli' : 'Gizli'}</span>
                                                                    </button>
                                                                    <div className="flex-1" />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setCommentingOn(null)}
                                                                        className="px-3 py-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors font-medium"
                                                                    >
                                                                        İptal
                                                                    </button>
                                                                    <button
                                                                        type="submit"
                                                                        disabled={!commentTexts[answerCommentKey]?.trim() && !commentGifUrls[answerCommentKey]}
                                                                        className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-coral text-white hover:bg-coral/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                                                                    >
                                                                        Gönder
                                                                    </button>
                                                                </div>
                                                            </form>
                                                        </div>
                                                    )}

                                                    {answer.comments && answer.comments.length > 0 && (
                                                        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                                                            <div className="flex items-center gap-2 mb-4">
                                                                <FaComment className="text-coral text-sm" /><span className="text-sm font-semibold text-gray-600 dark:text-gray-400">{answer.comments.length} Yorum</span>
                                                            </div>
                                                            <div className="space-y-4">{answer.comments.map(comment => renderComment(comment, 'answer', answer.id, 0, null))}</div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    )}

                    {/* En İyi Görüşler */}
                    {bestAnswers.length > 0 && (
                        <div className="mb-8 rounded-2xl border border-yellow-200 dark:border-yellow-800 bg-yellow-50/60 dark:bg-yellow-900/10 p-4 md:p-5 shadow-sm">
                            <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-3 uppercase tracking-wide">
                                En İyi Görüşler
                            </h3>
                            <div className="space-y-6">
                                {bestAnswers.map((answer) => {
                                    const answerCommentKey = `answer_${answer.id}`;
                                    const isBestAnswer = answer.is_accepted;
                                    const isOwner = question.isOwner;

                                    // En İyi Görüş: her cinsiyet için ayrı seçim yapabil (ör. 1 kadın + 1 erkek)
                                    const hasBestForGender = acceptedAnswers.some(
                                        (a) => a.user?.gender && a.user.gender === answer.user?.gender
                                    );
                                    const canSelectBestAnswer =
                                        isOwner &&
                                        !hasBestForGender &&
                                        !isBestAnswer &&
                                        answer.user?.id !== currentUser?.id;

                                    const answerColorStyle = isBestAnswer ? null : getProfileGradientStyle(answer.user, viewerPrefs, 0.08);
                                    const answerBorderClass = isBestAnswer ? 'border-green-200 dark:border-green-800' : '';
                                    const answerBgClass = isBestAnswer ? 'bg-green-50 dark:bg-green-900/10 ring-1 ring-green-100 dark:ring-green-900' : '';
                                    const youtubeLinks = getYoutubeVideoLinks(answer.content);

                                    return (
                                        <div key={answer.id} id={`answer-${answer.id}`} className={`p-4 md:p-6 rounded-2xl border-l-4 border transition-all scroll-mt-24 shadow-sm hover:shadow-md ${answerBorderClass} ${answerBgClass}`} style={answerColorStyle}>
                                            <div className="flex gap-3 min-w-0">
                                                {answer.user?.username === 'anonim' ? (
                                                    <div className="cursor-default shrink-0"><UserAvatar user={answer.user} size="md" className="border-2 border-white" /></div>
                                                ) : (
                                                    <Link to={`/profile/${answer.user?.username}`} className="shrink-0"><UserAvatar user={answer.user} size="md" className="hover:border-coral transition-colors" /></Link>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                {answer.user?.username === 'anonim' ? (
                                                                    <span className="font-bold text-gray-800 dark:text-white cursor-default">Gizli Üye</span>
                                                                ) : (
                                                                    <Link to={`/profile/${answer.user?.username}`} className="font-bold text-gray-800 dark:text-white hover:underline">{answer.user?.username}</Link>
                                                                )}
                                                                {answer.is_question_owner && (
                                                                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md shrink-0" style={{ backgroundColor: getProfileColor(answer.user, viewerPrefs) + '20', color: getProfileColor(answer.user, viewerPrefs) }}>
                                                                        {answer.user?.username === 'anonim' ? 'Gizli (Soru Sahibi)' : 'Soru Sahibi'}
                                                                    </span>
                                                                )}
                                                            {answer.user?.age_range && (
                                                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">(Yaş: {answer.user.age_range})</span>
                                                            )}
                                                            {answer.user?.level && (
                                                                <span
                                                                    className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                                                                    style={answer.user?.level_color ? { color: answer.user.level_color, backgroundColor: `${answer.user.level_color}20` } : {}}
                                                                >
                                                                    {typeof answer.user.level === 'object' ? answer.user.level?.name : answer.user.level}
                                                                </span>
                                                            )}
                                                                <span style={{ color: getProfileColor(answer.user, viewerPrefs) }}>{answer.user?.gender === 'female' ? <FaVenus /> : <FaMars />}</span>
                                                            </div>
                                                            <span className="text-xs text-gray-500">{formatDate(answer.created_at)}</span>

                                                            {/* Select Best Answer Button - Mobile */}
                                                            {canSelectBestAnswer && (
                                                                <button
                                                                    onClick={() => handleBestAnswer(answer.id)}
                                                                    className="lg:hidden mt-2 text-xs font-semibold text-green-600 hover:bg-green-50 px-2 py-1 rounded-lg border border-green-200 transition-colors flex items-center gap-1"
                                                                >
                                                                    <FaCheckCircle /> EİG Seç
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* Select Best Answer Button - Desktop */}
                                                        {canSelectBestAnswer && (
                                                            <button
                                                                onClick={() => handleBestAnswer(answer.id)}
                                                                className="hidden lg:flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-green-600 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-3 py-1.5 rounded-xl hover:border-green-300 transition-all shadow-sm"
                                                                title="En İyi Görüş Seç"
                                                            >
                                                                <FaCheck /> Seç
                                                            </button>
                                                        )}
                                                    </div>
                                                    {answer.content && <div className="mt-3 text-gray-800 dark:text-gray-100 leading-relaxed whitespace-pre-wrap">{textWithMentions(answer.content)}</div>}
                                                    {youtubeLinks.length > 0 && (
                                                        <div className="space-y-3 mt-2">
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
                                                                                Videoyu cevap içinden oynat
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
                                                    {answer.gif_url && (
                                                        <div className="mt-3 rounded-lg overflow-hidden">
                                                            <img
                                                                src={answer.gif_url}
                                                                alt="GIF"
                                                                className="max-w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                                                onClick={() => window.open(answer.gif_url, '_blank')}
                                                            />
                                                        </div>
                                                    )}

                                                    <div className="flex flex-wrap items-center gap-4 md:gap-6 mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
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
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={(e) => handleDislike(e, 'answer', answer.id)}
                                                                className={`flex items-center gap-1 transition-colors ${answer.is_disliked ? 'text-slate-600 dark:text-slate-300' : 'text-gray-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                                            >
                                                                <FaThumbsDown />
                                                            </button>
                                                            <span className="font-semibold text-gray-500">{answer.dislikes_count || 0}</span>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                const key = `answer_${answer.id}`;
                                                                if (question.is_anonymous && question.isOwner) {
                                                                    setCommentAnonymous(prev => ({ ...prev, [key]: true }));
                                                                }
                                                                setCommentingOn(commentingOn?.id === answer.id ? null : { type: 'answer', id: answer.id });
                                                            }}
                                                            className="flex items-center gap-2 text-gray-500 hover:text-blue-500 transition-colors"
                                                        >
                                                            <FaComment /><span>{answer.comments_count || answer.comments?.length || 0} Yorum</span>
                                                        </button>
                                                    </div>

                                                    {commentingOn?.type === 'answer' && commentingOn?.id === answer.id && (
                                                        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-2xl border border-gray-100 dark:border-gray-700">
                                                            <div className="flex items-center gap-2 mb-3">
                                                                <UserAvatar user={currentUser} size="xs" className="w-6 h-6 flex-shrink-0" />
                                                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 truncate">
                                                                    {currentUser?.username}
                                                                </span>
                                                                <span className="text-[10px] text-gray-400">• yorum yazıyor</span>
                                                            </div>
                                                            <form onSubmit={handleSubmitComment}>
                                                                {commentGifUrls[answerCommentKey] && (
                                                                    <div className="mb-2 relative inline-block">
                                                                        <img src={commentGifUrls[answerCommentKey]} alt="GIF" className="max-w-[160px] sm:max-w-xs rounded-xl shadow-sm" />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => clearCommentGif(answerCommentKey)}
                                                                            className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
                                                                        >
                                                                            <FaTimes className="text-[10px]" />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                <textarea
                                                                    value={commentTexts[answerCommentKey] || ''}
                                                                    onChange={(e) => setCommentTexts(prev => ({ ...prev, [answerCommentKey]: e.target.value }))}
                                                                    placeholder="Yorumunuzu yazın..."
                                                                    rows={2}
                                                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-2 focus:ring-coral/20 transition-all resize-none text-sm"
                                                                    autoFocus
                                                                />
                                                                <div className="flex items-center gap-1.5 mt-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openGifPicker('comment', answerCommentKey)}
                                                                        className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-500 hover:text-coral dark:hover:text-coral hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors flex-shrink-0"
                                                                        title="GIF Ekle"
                                                                    >
                                                                        <FaImage className="text-xs" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setCommentAnonymous(prev => ({ ...prev, [answerCommentKey]: !prev[answerCommentKey] }))}
                                                                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
                                                                            commentAnonymous[answerCommentKey]
                                                                                ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 ring-1 ring-purple-300 dark:ring-purple-700'
                                                                                : 'bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-500'
                                                                        }`}
                                                                    >
                                                                        <FaUserSecret className="text-[11px]" />
                                                                        <span className="hidden xs:inline">{commentAnonymous[answerCommentKey] ? 'Gizli' : 'Gizli'}</span>
                                                                    </button>
                                                                    <div className="flex-1" />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setCommentingOn(null)}
                                                                        className="px-3 py-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors font-medium"
                                                                    >
                                                                        İptal
                                                                    </button>
                                                                    <button
                                                                        type="submit"
                                                                        disabled={!commentTexts[answerCommentKey]?.trim() && !commentGifUrls[answerCommentKey]}
                                                                        className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-coral text-white hover:bg-coral/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                                                                    >
                                                                        Gönder
                                                                    </button>
                                                                </div>
                                                            </form>
                                                        </div>
                                                    )}

                                                    {answer.comments && answer.comments.length > 0 && (
                                                        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                                                            <div className="flex items-center gap-2 mb-4">
                                                                <FaComment className="text-coral text-sm" /><span className="text-sm font-semibold text-gray-600 dark:text-gray-400">{answer.comments.length} Yorum</span>
                                                            </div>
                                                            <div className="space-y-4">{answer.comments.map(comment => renderComment(comment, 'answer', answer.id, 0, null))}</div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="space-y-8">
                        {aiAnswers.length > 0 && (
                            <div className="rounded-2xl overflow-hidden border border-indigo-200/70 dark:border-indigo-700/40 shadow-md">
                                <div className="flex items-center gap-3 px-5 py-3.5 bg-gradient-to-r from-indigo-500 via-sky-500 to-cyan-400">
                                    <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/20 shrink-0">
                                        <FaRobot className="text-white text-base" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-bold text-sm leading-tight">Yapay Zeka Yorumcusu Cevapladı</p>
                                        <p className="text-white/75 text-xs mt-0.5">Herkesler Soruyor AI tarafından oluşturulmuş yanıt</p>
                                    </div>
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/20 text-white text-xs font-bold shrink-0">
                                        {aiAnswers.length} {aiAnswers.length === 1 ? 'Yanıt' : 'Yanıt'}
                                    </span>
                                </div>
                                <div className="space-y-3 p-4 bg-gradient-to-br from-indigo-50/60 via-sky-50/40 to-cyan-50/60 dark:from-indigo-950/25 dark:via-sky-950/20 dark:to-cyan-950/25">
                                    {aiAnswers.map((answer) => {
                                        const answerCommentKey = `answer_${answer.id}`;
                                        const isBestAnswer = answer.is_accepted;
                                        const hasBestAnswer = answers.some(a => a.is_accepted);
                                        const isOwner = question.isOwner;
                                        const canSelectBestAnswer = isOwner && !hasBestAnswer && !isBestAnswer && answer.user?.id !== currentUser?.id;
                                        const answerBorderClass = isBestAnswer ? 'border-green-200 dark:border-green-800' : 'border-indigo-200/60 dark:border-indigo-700/30';
                                        const answerBgClass = isBestAnswer ? 'bg-green-50 dark:bg-green-900/10 ring-1 ring-green-100 dark:ring-green-900' : 'bg-white/80 dark:bg-gray-800/60';
                                        const youtubeLinks = getYoutubeVideoLinks(answer.content);
                                        return (
                                            <div key={answer.id} id={`answer-${answer.id}`} className={`p-4 md:p-5 rounded-xl border-l-4 border transition-all scroll-mt-24 shadow-sm hover:shadow-md ${answerBorderClass} ${answerBgClass}`}>
                                                <div className="flex gap-3 min-w-0">
                                                    {answer.user?.username === 'anonim' ? (
                                                        <div className="cursor-default shrink-0"><UserAvatar user={answer.user} size="md" className="border-2 border-white" /></div>
                                                    ) : (
                                                        <Link to={`/profile/${answer.user?.username}`} className="shrink-0"><UserAvatar user={answer.user} size="md" className="hover:border-coral transition-colors" /></Link>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-start gap-2">
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    {answer.user?.username === 'anonim' ? (
                                                                        <span className="font-bold text-gray-800 dark:text-white cursor-default">Gizli Üye</span>
                                                                    ) : (
                                                                        <Link to={`/profile/${answer.user?.username}`} className="font-bold text-gray-800 dark:text-white hover:underline">{answer.user?.username}</Link>
                                                                    )}
                                                                    <AiBadge />
                                                                    {answer.user?.level && (
                                                                        <span
                                                                            className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0"
                                                                            style={answer.user?.level_color ? { color: answer.user.level_color, backgroundColor: `${answer.user.level_color}20` } : {}}
                                                                        >
                                                                            {typeof answer.user.level === 'object' ? answer.user.level?.name : answer.user.level}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <span className="text-xs text-gray-500">{formatDate(answer.created_at)}</span>
                                                                {canSelectBestAnswer && (
                                                                    <button
                                                                        onClick={() => handleBestAnswer(answer.id)}
                                                                        className="lg:hidden mt-2 text-xs font-semibold text-green-600 hover:bg-green-50 px-2 py-1 rounded-lg border border-green-200 transition-colors flex items-center gap-1"
                                                                    >
                                                                        <FaCheckCircle /> EİG Seç
                                                                    </button>
                                                                )}
                                                            </div>
                                                            {canSelectBestAnswer && (
                                                                <button
                                                                    onClick={() => handleBestAnswer(answer.id)}
                                                                    className="hidden lg:flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-green-600 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-3 py-1.5 rounded-xl hover:border-green-300 transition-all shadow-sm"
                                                                    title="En İyi Görüş Seç"
                                                                >
                                                                    <FaCheck /> Seç
                                                                </button>
                                                            )}
                                                        </div>
                                                        {answer.content && <div className="mt-3 text-gray-800 dark:text-gray-100 leading-relaxed whitespace-pre-wrap break-words">{textWithMentions(answer.content)}</div>}
                                                        {youtubeLinks.length > 0 && (
                                                            <div className="space-y-3 mt-2">
                                                                {youtubeLinks.map(({ videoId, isMusic, url }) => (
                                                                    <div key={videoId} className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-black/5 dark:bg-gray-900/60">
                                                                        <div className="relative w-full pb-[56.25%] bg-black">
                                                                            <iframe src={`https://www.youtube.com/embed/${videoId}`} title="YouTube video" className="absolute inset-0 w-full h-full" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
                                                                        </div>
                                                                        <div className="px-3 py-2 flex items-center justify-between gap-2 bg-white/80 dark:bg-gray-900/80">
                                                                            <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{isMusic ? 'YouTube Music' : 'YouTube'}</span>
                                                                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-coral hover:text-coral-dark whitespace-nowrap">YouTube'da aç</a>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {answer.gif_url && (
                                                            <div className="mt-3 rounded-lg overflow-hidden">
                                                                <img src={answer.gif_url} alt="GIF" className="max-w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(answer.gif_url, '_blank')} />
                                                            </div>
                                                        )}
                                                        <div className="flex flex-wrap items-center gap-4 md:gap-6 mt-4 pt-3 border-t border-indigo-100 dark:border-indigo-800/30">
                                                            <div className="flex items-center gap-2">
                                                                <button onClick={(e) => handleLike(e, 'answer', answer.id)} className={`flex items-center gap-1 transition-colors ${answer.is_liked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}><FaHeart /></button>
                                                                <button onClick={() => openLikersModal('answer', answer.id)} className="font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:underline cursor-pointer">{answer.likes_count || 0}</button>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <button onClick={(e) => handleDislike(e, 'answer', answer.id)} className={`flex items-center gap-1 transition-colors ${answer.is_disliked ? 'text-slate-600 dark:text-slate-300' : 'text-gray-500 hover:text-slate-600 dark:hover:text-slate-300'}`}><FaThumbsDown /></button>
                                                                <span className="font-semibold text-gray-500">{answer.dislikes_count || 0}</span>
                                                            </div>
                                                            <button onClick={() => setCommentingOn(commentingOn?.id === answer.id ? null : { type: 'answer', id: answer.id })} className="flex items-center gap-2 text-gray-500 hover:text-blue-500 transition-colors">
                                                                <FaComment /><span>{answer.comments_count || answer.comments?.length || 0} Yorum</span>
                                                            </button>
                                                            {((Boolean(currentUser?.id) && Boolean(answer.user?.id) && answer.user.id === currentUser.id) || canModerate) && (
                                                                <button onClick={() => openDeleteAnswerModal(answer.id)} className="flex items-center gap-1 text-gray-500 hover:text-red-500 transition-colors text-sm" title="Cevabı sil">
                                                                    <FaTrash className="text-xs" /> <span>Sil</span>
                                                                </button>
                                                            )}
                                                            {currentUser && answer.user?.id !== currentUser?.id && (
                                                                <button onClick={() => openHideAnswerModal(answer.id)} className="flex items-center gap-1 text-gray-500 hover:text-orange-500 transition-colors text-sm" title="Cevabı gizle (sadece sen görmezsin)">
                                                                    <FaEyeSlash className="text-xs" /> <span>Gizle</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                        {commentingOn?.type === 'answer' && commentingOn?.id === answer.id && (
                                                            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-2xl border border-gray-100 dark:border-gray-700">
                                                                <div className="flex items-center gap-2 mb-3">
                                                                    <UserAvatar user={currentUser} size="xs" className="w-6 h-6 flex-shrink-0" />
                                                                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 truncate">{currentUser?.username}</span>
                                                                    <span className="text-[10px] text-gray-400">• yorum yazıyor</span>
                                                                </div>
                                                                <form onSubmit={handleSubmitComment}>
                                                                    {commentGifUrls[answerCommentKey] && (
                                                                        <div className="mb-2 relative inline-block">
                                                                            <img src={commentGifUrls[answerCommentKey]} alt="GIF" className="max-w-[160px] sm:max-w-xs rounded-xl shadow-sm" />
                                                                            <button type="button" onClick={() => clearCommentGif(answerCommentKey)} className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"><FaTimes className="text-[10px]" /></button>
                                                                        </div>
                                                                    )}
                                                                    <textarea value={commentTexts[answerCommentKey] || ''} onChange={(e) => setCommentTexts(prev => ({ ...prev, [answerCommentKey]: e.target.value }))} placeholder="Yorumunuzu yazın..." rows={2} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-2 focus:ring-coral/20 transition-all resize-none text-sm" autoFocus />
                                                                    <div className="flex items-center gap-1.5 mt-2">
                                                                        <button type="button" onClick={() => openGifPicker('comment', answerCommentKey)} className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-500 hover:text-coral dark:hover:text-coral hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors flex-shrink-0" title="GIF Ekle"><FaImage className="text-xs" /></button>
                                                                        <button type="button" onClick={() => setCommentAnonymous(prev => ({ ...prev, [answerCommentKey]: !prev[answerCommentKey] }))} className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${commentAnonymous[answerCommentKey] ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 ring-1 ring-purple-300 dark:ring-purple-700' : 'bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-500'}`}><FaUserSecret className="text-[11px]" /><span className="hidden xs:inline">{commentAnonymous[answerCommentKey] ? 'Gizli' : 'Gizli'}</span></button>
                                                                        <div className="flex-1" />
                                                                        <button type="button" onClick={() => setCommentingOn(null)} className="px-3 py-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors font-medium">İptal</button>
                                                                        <button type="submit" disabled={!commentTexts[answerCommentKey]?.trim() && !commentGifUrls[answerCommentKey]} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-coral text-white hover:bg-coral/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm">Gönder</button>
                                                                    </div>
                                                                </form>
                                                            </div>
                                                        )}
                                                        {answer.comments && answer.comments.length > 0 && (
                                                            <div className="mt-6 pt-4 border-t border-indigo-100 dark:border-indigo-800/30">
                                                                <div className="flex items-center gap-2 mb-4">
                                                                    <FaComment className="text-coral text-sm" /><span className="text-sm font-semibold text-gray-600 dark:text-gray-400">{answer.comments.length} Yorum</span>
                                                                </div>
                                                                <div className="space-y-4">{answer.comments.map(comment => renderComment(comment, 'answer', answer.id, 0, null))}</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {maleAnswers.length > 0 && (
                            <div className="space-y-4">
                                <div className="relative flex items-center gap-3">
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-full shrink-0 shadow-sm">
                                        <FaMars className="text-blue-500 text-sm" />
                                        <span className="text-blue-700 dark:text-blue-300 text-sm font-bold">Erkeklerin Yorumu</span>
                                        <span className="text-xs bg-blue-100 dark:bg-blue-800/50 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-semibold">{maleAnswers.length}</span>
                                    </div>
                                    <div className="flex-1 h-px bg-blue-200 dark:bg-blue-800/50" />
                                </div>
                                {maleAnswers.map((answer) => {
                                    const answerCommentKey = `answer_${answer.id}`;
                                    const isBestAnswer = answer.is_accepted;
                                    const isOwner = question.isOwner;

                                    const hasBestForGender = acceptedAnswers.some(
                                        (a) => a.user?.gender && a.user.gender === answer.user?.gender
                                    );
                                    const canSelectBestAnswer =
                                        isOwner &&
                                        !hasBestForGender &&
                                        !isBestAnswer &&
                                        answer.user?.id !== currentUser?.id;

                                    const answerColorStyle = isBestAnswer ? null : getProfileGradientStyle(answer.user, viewerPrefs, 0.08);
                                    const answerBorderClass = isBestAnswer ? 'border-green-200 dark:border-green-800' : '';
                                    const answerBgClass = isBestAnswer ? 'bg-green-50 dark:bg-green-900/10 ring-1 ring-green-100 dark:ring-green-900' : '';
                                    const youtubeLinks = getYoutubeVideoLinks(answer.content);

                                    return (
                                    <div key={answer.id} id={`answer-${answer.id}`} className={`p-4 md:p-6 rounded-2xl border-l-4 border transition-all scroll-mt-24 shadow-sm hover:shadow-md ${answerBorderClass} ${answerBgClass}`} style={answerColorStyle}>
                                        <div className="flex gap-3 min-w-0">
                                            {answer.user?.username === 'anonim' ? (
                                                <div className="cursor-default shrink-0"><UserAvatar user={answer.user} size="md" className="border-2 border-white" /></div>
                                            ) : (
                                                <Link to={`/profile/${answer.user?.username}`} className="shrink-0"><UserAvatar user={answer.user} size="md" className="hover:border-coral transition-colors" /></Link>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {answer.user?.username === 'anonim' ? (
                                                                <span className="font-bold text-gray-800 dark:text-white cursor-default">Gizli Üye</span>
                                                            ) : (
                                                                <Link to={`/profile/${answer.user?.username}`} className="font-bold text-gray-800 dark:text-white hover:underline">{answer.user?.username}</Link>
                                                            )}
                                                            {answer.is_question_owner && (
                                                                <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md shrink-0" style={{ backgroundColor: getProfileColor(answer.user, viewerPrefs) + '20', color: getProfileColor(answer.user, viewerPrefs) }}>
                                                                    {answer.user?.username === 'anonim' ? '(Soru Sahibi)' : 'Soru Sahibi'}
                                                                </span>
                                                            )}
                                                            {answer.user?.age_range && (
                                                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 shrink-0">(Yaş: {answer.user.age_range})</span>
                                                            )}
                                                            {answer.user?.level && (
                                                                <span
                                                                    className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0"
                                                                    style={answer.user?.level_color ? { color: answer.user.level_color, backgroundColor: `${answer.user.level_color}20` } : {}}
                                                                >
                                                                    {typeof answer.user.level === 'object' ? answer.user.level?.name : answer.user.level}
                                                                </span>
                                                            )}
                                                            {(answer.user?.is_ai || answer.user?.is_bot) && (
                                                                <AiBadge />
                                                            )}
                                                            <span className="shrink-0" style={{ color: getProfileColor(answer.user, viewerPrefs) }}>{answer.user?.gender === 'female' ? <FaVenus /> : <FaMars />}</span>
                                                        </div>
                                                        <span className="text-xs text-gray-500">{formatDate(answer.created_at)}</span>

                                                        {/* Select Best Answer Button - Mobile */}
                                                        {canSelectBestAnswer && (
                                                            <button
                                                                onClick={() => handleBestAnswer(answer.id)}
                                                                className="lg:hidden mt-2 text-xs font-semibold text-green-600 hover:bg-green-50 px-2 py-1 rounded-lg border border-green-200 transition-colors flex items-center gap-1"
                                                            >
                                                                <FaCheckCircle /> EİG Seç
                                                            </button>
                                                        )}
                                                    </div>

                                                    {canSelectBestAnswer && (
                                                        <button
                                                            onClick={() => handleBestAnswer(answer.id)}
                                                            className="hidden lg:flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-green-600 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-3 py-1.5 rounded-xl hover:border-green-300 transition-all shadow-sm"
                                                            title="En İyi Görüş Seç"
                                                        >
                                                            <FaCheck /> Seç
                                                        </button>
                                                    )}
                                                </div>
                                                {answer.content && <div className="mt-3 text-gray-800 dark:text-gray-100 leading-relaxed whitespace-pre-wrap break-words">{textWithMentions(answer.content)}</div>}
                                                {youtubeLinks.length > 0 && (
                                                    <div className="space-y-3 mt-2">
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
                                                                            Videoyu cevap içinden oynat
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
                                                {answer.gif_url && (
                                                    <div className="mt-3 rounded-lg overflow-hidden">
                                                        <img
                                                            src={answer.gif_url}
                                                            alt="GIF"
                                                            className="max-w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                                            onClick={() => window.open(answer.gif_url, '_blank')}
                                                        />
                                                    </div>
                                                )}

                                                <div className="flex flex-wrap items-center gap-4 md:gap-6 mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
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
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={(e) => handleDislike(e, 'answer', answer.id)}
                                                            className={`flex items-center gap-1 transition-colors ${answer.is_disliked ? 'text-slate-600 dark:text-slate-300' : 'text-gray-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                                        >
                                                            <FaThumbsDown />
                                                        </button>
                                                        <span className="font-semibold text-gray-500">{answer.dislikes_count || 0}</span>
                                                    </div>
                                                    <button onClick={() => setCommentingOn(commentingOn?.id === answer.id ? null : { type: 'answer', id: answer.id })} className="flex items-center gap-2 text-gray-500 hover:text-blue-500 transition-colors">
                                                        <FaComment /><span>{answer.comments_count || answer.comments?.length || 0} Yorum</span>
                                                    </button>
                                                    {/* Cevap Sil/Gizle Butonları */}
                                                    {((Boolean(currentUser?.id) && Boolean(answer.user?.id) && answer.user.id === currentUser.id) || canModerate) && (
                                                        <button
                                                            onClick={() => openDeleteAnswerModal(answer.id)}
                                                            className="flex items-center gap-1 text-gray-500 hover:text-red-500 transition-colors text-sm"
                                                            title="Cevabı sil"
                                                        >
                                                            <FaTrash className="text-xs" /> <span>Sil</span>
                                                        </button>
                                                    )}
                                                    {currentUser && answer.user?.id !== currentUser?.id && (
                                                        <button
                                                            onClick={() => openHideAnswerModal(answer.id)}
                                                            className="flex items-center gap-1 text-gray-500 hover:text-orange-500 transition-colors text-sm"
                                                            title="Cevabı gizle (sadece sen görmezsin)"
                                                        >
                                                            <FaEyeSlash className="text-xs" /> <span>Gizle</span>
                                                        </button>
                                                    )}
                                                </div>

                                                {commentingOn?.type === 'answer' && commentingOn?.id === answer.id && (
                                                    <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-2xl border border-gray-100 dark:border-gray-700">
                                                        {/* Comment header */}
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <UserAvatar user={currentUser} size="xs" className="w-6 h-6 flex-shrink-0" />
                                                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 truncate">
                                                                {currentUser?.username}
                                                            </span>
                                                            <span className="text-[10px] text-gray-400">• yorum yazıyor</span>
                                                        </div>
                                                        <form onSubmit={handleSubmitComment}>
                                                            {commentGifUrls[answerCommentKey] && (
                                                                <div className="mb-2 relative inline-block">
                                                                    <img src={commentGifUrls[answerCommentKey]} alt="GIF" className="max-w-[160px] sm:max-w-xs rounded-xl shadow-sm" />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => clearCommentGif(answerCommentKey)}
                                                                        className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
                                                                    >
                                                                        <FaTimes className="text-[10px]" />
                                                                    </button>
                                                                </div>
                                                            )}
                                                            <textarea
                                                                value={commentTexts[answerCommentKey] || ''}
                                                                onChange={(e) => setCommentTexts(prev => ({ ...prev, [answerCommentKey]: e.target.value }))}
                                                                placeholder="Yorumunuzu yazın..."
                                                                rows={2}
                                                                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-2 focus:ring-coral/20 transition-all resize-none text-sm"
                                                                autoFocus
                                                            />
                                                            <div className="flex items-center gap-1.5 mt-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openGifPicker('comment', answerCommentKey)}
                                                                    className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-500 hover:text-coral dark:hover:text-coral hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors flex-shrink-0"
                                                                    title="GIF Ekle"
                                                                >
                                                                    <FaImage className="text-xs" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setCommentAnonymous(prev => ({ ...prev, [answerCommentKey]: !prev[answerCommentKey] }))}
                                                                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
                                                                        commentAnonymous[answerCommentKey]
                                                                            ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 ring-1 ring-purple-300 dark:ring-purple-700'
                                                                            : 'bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-500'
                                                                    }`}
                                                                >
                                                                    <FaUserSecret className="text-[11px]" />
                                                                    <span className="hidden xs:inline">{commentAnonymous[answerCommentKey] ? 'Gizli' : 'Gizli'}</span>
                                                                </button>
                                                                <div className="flex-1" />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setCommentingOn(null)}
                                                                    className="px-3 py-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors font-medium"
                                                                >
                                                                    İptal
                                                                </button>
                                                                <button
                                                                    type="submit"
                                                                    disabled={!commentTexts[answerCommentKey]?.trim() && !commentGifUrls[answerCommentKey]}
                                                                    className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-coral text-white hover:bg-coral/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                                                                >
                                                                    Gönder
                                                                </button>
                                                            </div>
                                                        </form>
                                                    </div>
                                                )}

                                                {answer.comments && answer.comments.length > 0 && (
                                                    <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                                                        <div className="flex items-center gap-2 mb-4">
                                                            <FaComment className="text-coral text-sm" /><span className="text-sm font-semibold text-gray-600 dark:text-gray-400">{answer.comments.length} Yorum</span>
                                                        </div>
                                                        <div className="space-y-4">{answer.comments.map(comment => renderComment(comment, 'answer', answer.id, 0, null))}</div>                                                
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            </div>
                        )}

                        {femaleAnswers.length > 0 && (
                            <div className="space-y-4">
                                <div className="relative flex items-center gap-3">
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-pink-50 dark:bg-pink-900/30 border border-pink-200 dark:border-pink-800 rounded-full shrink-0 shadow-sm">
                                        <FaVenus className="text-pink-500 text-sm" />
                                        <span className="text-pink-700 dark:text-pink-300 text-sm font-bold">Kadınların Yorumu</span>
                                        <span className="text-xs bg-pink-100 dark:bg-pink-800/50 text-pink-600 dark:text-pink-300 px-1.5 py-0.5 rounded-full font-semibold">{femaleAnswers.length}</span>
                                    </div>
                                    <div className="flex-1 h-px bg-pink-200 dark:bg-pink-800/50" />
                                </div>
                                {femaleAnswers.map((answer) => {
                                    const answerCommentKey = `answer_${answer.id}`;
                                    const isBestAnswer = answer.is_accepted;
                                    const isOwner = question.isOwner;

                                    const hasBestForGender = acceptedAnswers.some(
                                        (a) => a.user?.gender && a.user.gender === answer.user?.gender
                                    );
                                    const canSelectBestAnswer =
                                        isOwner &&
                                        !hasBestForGender &&
                                        !isBestAnswer &&
                                        answer.user?.id !== currentUser?.id;

                                    const answerColorStyle = isBestAnswer ? null : getProfileGradientStyle(answer.user, viewerPrefs, 0.08);
                                    const answerBorderClass = isBestAnswer ? 'border-green-200 dark:border-green-800' : '';
                                    const answerBgClass = isBestAnswer ? 'bg-green-50 dark:bg-green-900/10 ring-1 ring-green-100 dark:ring-green-900' : '';
                                    const youtubeLinks = getYoutubeVideoLinks(answer.content);

                                    return (
                                        <div key={answer.id} id={`answer-${answer.id}`} className={`p-4 md:p-6 rounded-2xl border-l-4 border transition-all scroll-mt-24 shadow-sm hover:shadow-md ${answerBorderClass} ${answerBgClass}`} style={answerColorStyle}>
                                            <div className="flex gap-4">
                                                {answer.user?.username === 'anonim' ? (
                                                    <div className="cursor-default shrink-0"><UserAvatar user={answer.user} size="md" className="border-2 border-white" /></div>
                                                ) : (
                                                    <Link to={`/profile/${answer.user?.username}`} className="shrink-0"><UserAvatar user={answer.user} size="md" className="hover:border-coral transition-colors" /></Link>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                {answer.user?.username === 'anonim' ? (
                                                                    <span className="font-bold text-gray-800 dark:text-white cursor-default">Gizli Üye</span>
                                                                ) : (
                                                                    <Link to={`/profile/${answer.user?.username}`} className="font-bold text-gray-800 dark:text-white hover:underline">{answer.user?.username}</Link>
                                                                )}
                                                                {answer.is_question_owner && (
                                                                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md shrink-0" style={{ backgroundColor: getProfileColor(answer.user, viewerPrefs) + '20', color: getProfileColor(answer.user, viewerPrefs) }}>
                                                                        {answer.user?.username === 'anonim' ? '(Soru Sahibi)' : 'Soru Sahibi'}
                                                                    </span>
                                                                )}
                                                                {answer.user?.age_range && (
                                                                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 shrink-0">(Yaş: {answer.user.age_range})</span>
                                                                )}
                                                                {answer.user?.level && (
                                                                    <span
                                                                        className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0"
                                                                        style={answer.user?.level_color ? { color: answer.user.level_color, backgroundColor: `${answer.user.level_color}20` } : {}}
                                                                    >
                                                                        {typeof answer.user.level === 'object' ? answer.user.level?.name : answer.user.level}
                                                                    </span>
                                                                )}
                                                                {(answer.user?.is_ai || answer.user?.is_bot) && (
                                                                    <AiBadge />
                                                                )}
                                                                <span className="shrink-0" style={{ color: getProfileColor(answer.user, viewerPrefs) }}>{answer.user?.gender === 'female' ? <FaVenus /> : <FaMars />}</span>
                                                            </div>
                                                            <span className="text-xs text-gray-500">{formatDate(answer.created_at)}</span>

                                                            {canSelectBestAnswer && (
                                                                <button
                                                                    onClick={() => handleBestAnswer(answer.id)}
                                                                    className="lg:hidden mt-2 text-xs font-semibold text-green-600 hover:bg-green-50 px-2 py-1 rounded-lg border border-green-200 transition-colors flex items-center gap-1"
                                                                >
                                                                    <FaCheckCircle /> EİG Seç
                                                                </button>
                                                            )}
                                                        </div>

                                                        {canSelectBestAnswer && (
                                                            <button
                                                                onClick={() => handleBestAnswer(answer.id)}
                                                                className="hidden lg:flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-green-600 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-3 py-1.5 rounded-xl hover:border-green-300 transition-all shadow-sm"
                                                                title="En İyi Görüş Seç"
                                                            >
                                                                <FaCheck /> Seç
                                                            </button>
                                                        )}
                                                    </div>
                                                    {answer.content && <div className="mt-3 text-gray-800 dark:text-gray-100 leading-relaxed whitespace-pre-wrap break-words">{textWithMentions(answer.content)}</div>}
                                                    {youtubeLinks.length > 0 && (
                                                        <div className="space-y-3 mt-2">
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
                                                                                Videoyu cevap içinden oynat
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
                                                    {answer.gif_url && (
                                                        <div className="mt-3 rounded-lg overflow-hidden">
                                                            <img
                                                                src={answer.gif_url}
                                                                alt="GIF"
                                                                className="max-w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                                                onClick={() => window.open(answer.gif_url, '_blank')}
                                                            />
                                                        </div>
                                                    )}

                                                    <div className="flex flex-wrap items-center gap-4 md:gap-6 mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
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
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={(e) => handleDislike(e, 'answer', answer.id)}
                                                                className={`flex items-center gap-1 transition-colors ${answer.is_disliked ? 'text-slate-600 dark:text-slate-300' : 'text-gray-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                                            >
                                                                <FaThumbsDown />
                                                            </button>
                                                            <span className="font-semibold text-gray-500">{answer.dislikes_count || 0}</span>
                                                        </div>
                                                        <button onClick={() => setCommentingOn(commentingOn?.id === answer.id ? null : { type: 'answer', id: answer.id })} className="flex items-center gap-2 text-gray-500 hover:text-blue-500 transition-colors">
                                                            <FaComment /><span>{answer.comments_count || answer.comments?.length || 0} Yorum</span>
                                                        </button>
                                                    </div>

                                                    {commentingOn?.type === 'answer' && commentingOn?.id === answer.id && (
                                                        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-2xl border border-gray-100 dark:border-gray-700">
                                                            <div className="flex items-center gap-2 mb-3">
                                                                <UserAvatar user={currentUser} size="xs" className="w-6 h-6 flex-shrink-0" />
                                                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 truncate">
                                                                    {currentUser?.username}
                                                                </span>
                                                                <span className="text-[10px] text-gray-400">• yorum yazıyor</span>
                                                            </div>
                                                            <form onSubmit={handleSubmitComment}>
                                                                {commentGifUrls[answerCommentKey] && (
                                                                    <div className="mb-2 relative inline-block">
                                                                        <img src={commentGifUrls[answerCommentKey]} alt="GIF" className="max-w-[160px] sm:max-w-xs rounded-xl shadow-sm" />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => clearCommentGif(answerCommentKey)}
                                                                            className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
                                                                        >
                                                                            <FaTimes className="text-[10px]" />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                <textarea
                                                                    value={commentTexts[answerCommentKey] || ''}
                                                                    onChange={(e) => setCommentTexts(prev => ({ ...prev, [answerCommentKey]: e.target.value }))}
                                                                    placeholder="Yorumunuzu yazın..."
                                                                    rows={2}
                                                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-2 focus:ring-coral/20 transition-all resize-none text-sm"
                                                                    autoFocus
                                                                />
                                                                <div className="flex items-center gap-1.5 mt-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openGifPicker('comment', answerCommentKey)}
                                                                        className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-500 hover:text-coral dark:hover:text-coral hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors flex-shrink-0"
                                                                        title="GIF Ekle"
                                                                    >
                                                                        <FaImage className="text-xs" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setCommentAnonymous(prev => ({ ...prev, [answerCommentKey]: !prev[answerCommentKey] }))}
                                                                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
                                                                            commentAnonymous[answerCommentKey]
                                                                                ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 ring-1 ring-purple-300 dark:ring-purple-700'
                                                                                : 'bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-500'
                                                                        }`}
                                                                    >
                                                                        <FaUserSecret className="text-[11px]" />
                                                                        <span className="hidden xs:inline">{commentAnonymous[answerCommentKey] ? 'Gizli' : 'Gizli'}</span>
                                                                    </button>
                                                                    <div className="flex-1" />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setCommentingOn(null)}
                                                                        className="px-3 py-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors font-medium"
                                                                    >
                                                                        İptal
                                                                    </button>
                                                                    <button
                                                                        type="submit"
                                                                        disabled={!commentTexts[answerCommentKey]?.trim() && !commentGifUrls[answerCommentKey]}
                                                                        className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-coral text-white hover:bg-coral/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                                                                    >
                                                                        Gönder
                                                                    </button>
                                                                </div>
                                                            </form>
                                                        </div>
                                                    )}

                                                    {answer.comments && answer.comments.length > 0 && (
                                                        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                                                            <div className="flex items-center gap-2 mb-4">
                                                                <FaComment className="text-coral text-sm" /><span className="text-sm font-semibold text-gray-600 dark:text-gray-400">{answer.comments.length} Yorum</span>
                                                            </div>
                                                            <div className="space-y-4">{answer.comments.map(comment => renderComment(comment, 'answer', answer.id, 0, null))}</div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {otherAnswers.length === 0 && maleAnswers.length === 0 && femaleAnswers.length === 0 && !highlightedAnswer && (
                            <div className="text-center py-10 text-gray-500">Henüz cevap yok. İlk cevabı sen yaz!</div>
                        )}
                    </div>
                </div>
            </div>

            {showEditQuestionModal && createPortal(
                <div
                    className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center p-0 sm:p-4"
                    onClick={() => !savingQuestionEdit && setShowEditQuestionModal(false)}
                >
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

                    {/* Modal card */}
                    <div
                        className="relative w-full sm:max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
                        role="dialog"
                        aria-modal="true"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Gradient header */}
                        <div className="relative bg-gradient-to-r from-coral to-orange-400 px-6 pt-5 pb-6 flex-shrink-0">
                            <button
                                onClick={() => !savingQuestionEdit && setShowEditQuestionModal(false)}
                                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 transition-colors flex items-center justify-center text-white"
                                disabled={savingQuestionEdit}
                            >
                                <FaTimes className="text-sm" />
                            </button>
                            <div className="flex items-center gap-3 pr-10">
                                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                                    <FaEdit className="text-white text-lg" />
                                </div>
                                <div>
                                    <h2 className="text-white font-bold text-lg leading-tight">Soruyu Düzenle</h2>
                                    <p className="text-white/80 text-xs mt-0.5 leading-snug">
                                        Yayın sonrası 30 dk ve en fazla 2 düzenleme hakkı
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Scrollable body — negatif margin yok; turuncu başlık ile form net ayrılır */}
                        <div className="relative z-10 overflow-y-auto flex-1 px-6 pt-6 pb-6 flex flex-col gap-4 bg-white dark:bg-gray-900">
                            {typeof question?.published_edits_remaining === 'number' && question.published_edits_remaining > 0 && (
                                <div className="flex justify-center -mb-1">
                                    <span className="inline-flex items-center rounded-full bg-gradient-to-r from-coral/15 to-orange-400/15 dark:from-coral/25 dark:to-orange-500/20 text-coral dark:text-orange-300 text-xs font-semibold px-4 py-1.5 border border-coral/20 dark:border-orange-500/30">
                                        Kalan düzenleme hakkı: {question.published_edits_remaining} / 2
                                    </span>
                                </div>
                            )}

                            {/* Floating inner card */}
                            <div className="bg-gray-50 dark:bg-gray-800/80 rounded-2xl shadow-md border border-gray-100 dark:border-gray-700 p-4 sm:p-5 space-y-5">

                                {/* Title field */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Başlık</label>
                                        <span className={`text-xs font-medium ${editQuestionTitle.trim().length < 10 ? 'text-orange-400' : 'text-green-500'}`}>
                                            {editQuestionTitle.length}/500
                                        </span>
                                    </div>
                                    <input
                                        type="text"
                                        value={editQuestionTitle}
                                        onChange={(e) => setEditQuestionTitle(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/60 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition text-sm"
                                        maxLength={500}
                                        disabled={savingQuestionEdit}
                                        placeholder="Sorunuzu kısaca yazın…"
                                    />
                                    {editQuestionTitle.trim().length > 0 && editQuestionTitle.trim().length < 10 && (
                                        <p className="text-xs text-orange-400 mt-1.5">{10 - editQuestionTitle.trim().length} karakter daha gerekli</p>
                                    )}
                                </div>

                                {/* Divider */}
                                <div className="border-t border-gray-100 dark:border-gray-700" />

                                {/* Description field */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Detay <span className="normal-case font-normal text-gray-400">(isteğe bağlı)</span></label>
                                    </div>
                                    <textarea
                                        value={editQuestionDescription}
                                        onChange={(e) => setEditQuestionDescription(e.target.value)}
                                        rows={8}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/60 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition text-sm resize-none leading-relaxed"
                                        disabled={savingQuestionEdit}
                                        placeholder="Sorunuzu daha ayrıntılı açıklayın…"
                                    />
                                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">Not: detay alanındaki görseller ve biçimlendirme korunur.</p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => !savingQuestionEdit && setShowEditQuestionModal(false)}
                                    disabled={savingQuestionEdit}
                                    className="flex-1 py-3 px-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                                >
                                    İptal
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveQuestionEdit}
                                    disabled={savingQuestionEdit || editQuestionTitle.trim().length < 10}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-coral to-orange-400 text-white font-bold text-sm hover:shadow-lg hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none transition-all"
                                >
                                    {savingQuestionEdit ? (
                                        <>
                                            <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                            Kaydediliyor…
                                        </>
                                    ) : (
                                        <>
                                            <FaCheck className="text-xs" />
                                            Kaydet
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <LikersModal
                isOpen={likersModal.isOpen}
                onClose={closeLikersModal}
                type={likersModal.type}
                id={likersModal.id}
            />

            <GifPickerModal
                isOpen={showGifPicker}
                onClose={() => {
                    setShowGifPicker(false);
                    setGifPickerContext(null);
                }}
                onSelect={handleGifSelect}
                title="GIF seç"
            />

            <ReportModal
                isOpen={showReportModal}
                onClose={() => setShowReportModal(false)}
                reportableType="question"
                reportableId={question?.id}
                onSuccess={() => displayToast('Şikayetiniz başarıyla gönderildi.', 'success')}
            />

            <ConfirmationModal
                isOpen={deleteCommentModal.isOpen}
                onClose={() => setDeleteCommentModal({ isOpen: false, commentId: null, type: null, targetId: null })}
                onConfirm={handleDeleteComment}
                title="Yorumu Sil"
                message="Bu yorumu silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
                confirmText="Sil"
                cancelText="Vazgeç"
                isDangerous={true}
            />

            <ConfirmationModal
                isOpen={hideCommentModal.isOpen}
                onClose={() => setHideCommentModal({ isOpen: false, commentId: null, type: null, targetId: null })}
                onConfirm={handleHideComment}
                title="Yorumu Gizle"
                message="Bu yorumu gizlemek istediğinize emin misiniz? Sadece siz görmezsiniz, diğer kullanıcılar etkilenmez."
                confirmText="Gizle"
                cancelText="Vazgeç"
                isDangerous={false}
            />

            <ConfirmationModal
                isOpen={deleteAnswerModal.isOpen}
                onClose={() => setDeleteAnswerModal({ isOpen: false, answerId: null })}
                onConfirm={handleDeleteAnswer}
                title="Cevabı Sil"
                message="Bu cevabı silmek istediğinize emin misiniz? Bu işlem geri alınamaz ve cevabın altındaki tüm yorumlar da silinecektir."
                confirmText="Sil"
                cancelText="Vazgeç"
                isDangerous={true}
            />

            <ConfirmationModal
                isOpen={hideAnswerModal.isOpen}
                onClose={() => setHideAnswerModal({ isOpen: false, answerId: null })}
                onConfirm={handleHideAnswer}
                title="Cevabı Gizle"
                message="Bu cevabı gizlemek istediğinize emin misiniz? Sadece siz görmezsiniz, diğer kullanıcılar etkilenmez."
                confirmText="Gizle"
                cancelText="Vazgeç"
                isDangerous={false}
            />
        </div>
    );
};

export default SingleQuestionView;
