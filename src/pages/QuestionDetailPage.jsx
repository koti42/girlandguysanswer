import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { FaHeart, FaComment, FaEye, FaMars, FaVenus, FaShare, FaReply, FaUserSecret } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import { TrendsWidget, TopUsersWidget, AnnouncementsWidget } from '../components/Widgets';
import { questionsAPI, commentsAPI } from '../services/api';
import UserAvatar from '../components/UserAvatar';
import Toast from '../components/Toast';

// Helper function for formatting
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
    const [question, setQuestion] = useState(null);
    const [answers, setAnswers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [answerText, setAnswerText] = useState('');
    const [isAnswerAnonymous, setIsAnswerAnonymous] = useState(false);
    const [commentingOn, setCommentingOn] = useState([]); // Array for answerId being commented on
    const [commentTexts, setCommentTexts] = useState({}); // Object to store comment text for each answer
    const [commentAnonymous, setCommentAnonymous] = useState({}); // Anonymous state for each comment
    const [genderFilter, setGenderFilter] = useState('all'); // 'all' | 'female' | 'male'
    const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest' | 'likes' | 'replies'

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
                console.error("Soru detayı yüklenirken hata:", err);
                setError("Soru bulunamadı veya yüklenirken bir hata oluştu.");
            } finally {
                setLoading(false);
            }
        };

        if (slug) {
            fetchQuestionDetail();
        }
    }, [slug]);

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
    }, [loading, answers]);

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

    const handleSubmitAnswer = async (e) => {
        e.preventDefault();
        if (!answerText.trim()) return;

        try {
            const response = await questionsAPI.createAnswer(question.id, {
                content: answerText
            });

            const newAnswer = response.data.data.answer;

            setAnswers(prev => [newAnswer, ...prev]);
            setAnswerText('');
            setIsAnswerAnonymous(false);
            displayToast('Cevabınız başarıyla gönderildi! 🎉', 'success');
        } catch (err) {
            console.error("Cevap gönderilirken hata:", err);
            const errorMsg = err.response?.data?.message || "Cevap gönderilemedi. Lütfen tekrar deneyin.";
            displayToast(errorMsg, 'error');
        }
    };

    const handleSubmitComment = async (e, answerId) => {
        e.preventDefault();
        const commentText = commentTexts[answerId];
        if (!commentText || !commentText.trim()) return;

        try {
            const response = await commentsAPI.create({
                content: commentText,
                commentable_type: 'answer',
                commentable_id: answerId
            });

            const newComment = response.data.data.comment;

            setAnswers(prev => prev.map(answer => {
                if (answer.id === answerId) {
                    return {
                        ...answer,
                        comments: [newComment, ...(answer.comments || [])]
                    };
                }
                return answer;
            }));

            setCommentTexts(prev => ({ ...prev, [answerId]: '' }));
            setCommentAnonymous(prev => ({ ...prev, [answerId]: false }));
            setCommentingOn(prev => prev.filter(id => id !== answerId));

            displayToast('Yorumunuz başarıyla gönderildi! 🎉', 'success');
        } catch (err) {
            console.error("Yorum gönderilirken hata:", err);
            const errorMsg = err.response?.data?.message || "Yorum gönderilemedi. Lütfen tekrar deneyin.";
            displayToast(errorMsg, 'error');
        }
    };


    const toggleComment = (answerId) => {
        setCommentingOn(prev => {
            if (prev.includes(answerId)) {
                return prev.filter(id => id !== answerId);
            } else {
                return [...prev, answerId];
            }
        });
    };

    const handleCommentTextChange = (answerId, text) => {
        setCommentTexts(prev => ({ ...prev, [answerId]: text }));
    };

    const SidebarContent = (
        <>
            <TrendsWidget />
            <TopUsersWidget />
            <AnnouncementsWidget />
        </>
    );

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
                        {/* Question User Header */}
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

                        {/* Question Title */}
                        <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4 leading-snug">
                            {question.title}
                        </h1>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-2 mb-4">
                            {question.tags.map((tag, idx) => (
                                <span key={idx} className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-medium hover:bg-gray-200 transition-colors cursor-pointer">
                                    {tag}
                                </span>
                            ))}
                        </div>

                        {/* Question Image */}
                        {question.image && (
                            <div className="rounded-xl overflow-hidden mb-6 shadow-sm">
                                <img src={question.image} alt="Question" className="w-full h-auto object-cover" />
                            </div>
                        )}

                        {/* Stats & Actions */}
                        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                            <div className="flex gap-6">
                                <button className="flex items-center gap-2 text-gray-500 hover:text-coral transition-colors">
                                    <FaHeart className="text-lg" />
                                    <span className="font-semibold">{question.stats?.likes || 0}</span>
                                </button>
                                <button className="flex items-center gap-2 text-gray-500 hover:text-blue-500 transition-colors">
                                    <FaComment className="text-lg" />
                                    <span className="font-semibold">{question.stats?.comments || 0}</span>
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

                    {/* Answer Form - Right after question */}
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
                        {/* Filter & Sort Bar */}
                        <div className="mb-6">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                                <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                                    {filteredAnswers.length} Cevap
                                </h2>

                                {/* Sort Dropdown */}
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

                            {/* Gender Filters */}
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

                        {/* Answers List */}
                        <div className="space-y-6">
                            {filteredAnswers.length > 0 ? (
                                filteredAnswers.map((answer) => (
                                    <div 
                                        key={answer.id} 
                                        id={`answer-${answer.id}`}
                                        className={`p-4 md:p-6 rounded-2xl border transition-all scroll-mt-20 ${answer.user?.gender === 'female'
                                        ? 'bg-pink-50/50 dark:bg-pink-900/10 border-pink-100 dark:border-pink-800/30'
                                        : 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/30'
                                        }`}>
                                        {/* Answer Header */}
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

                                        {/* Answer Content */}
                                        <div className="prose prose-sm dark:prose-invert max-w-none mb-4 text-gray-700 dark:text-gray-300">
                                            <p>{answer.content}</p>
                                        </div>

                                        {/* Answer Actions */}
                                        <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
                                            <button className="flex items-center gap-2 hover:text-coral transition-colors">
                                                <FaHeart />
                                                <span>{answer.likes_count || 0}</span>
                                            </button>
                                            <button
                                                onClick={() => toggleComment(answer.id)}
                                                className="flex items-center gap-2 hover:text-blue-500 transition-colors"
                                            >
                                                <FaComment />
                                                <span>Yorum Yap</span>
                                            </button>
                                        </div>

                                        {/* Comments on Answer */}
                                        {answer.comments && answer.comments.length > 0 && (
                                            <div className="mt-6 space-y-3">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <FaComment className="text-coral text-sm" />
                                                    <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                                                        {answer.comments.length} Yorum
                                                    </span>
                                                </div>
                                                {answer.comments.map(comment => {
                                                    const commentGradientClass = comment.user?.gender === 'female'
                                                        ? 'bg-gradient-to-br from-pink-100 to-pink-50 dark:from-pink-900/25 dark:to-pink-800/20 border-pink-400 dark:border-pink-600'
                                                        : 'bg-gradient-to-br from-cyan-100 to-cyan-50 dark:from-cyan-900/25 dark:to-cyan-800/20 border-cyan-400 dark:border-cyan-600';

                                                    return (
                                                        <div key={comment.id} className={`${commentGradientClass} rounded-xl p-4 ml-8 border-l-4 shadow-sm hover:shadow-md transition-all`}>
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
                                                                    <p className="text-gray-800 dark:text-gray-100 text-sm leading-relaxed">
                                                                        {comment.content}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Comment Form */}
                                        {commentingOn.includes(answer.id) && (
                                            <div className="mt-4 ml-4 pl-4 border-l-2 border-coral dark:border-coral/50">
                                                <form onSubmit={(e) => handleSubmitComment(e, answer.id)}>
                                                    <textarea
                                                        value={commentTexts[answer.id] || ''}
                                                        onChange={(e) => handleCommentTextChange(answer.id, e.target.value)}
                                                        placeholder={`${answer.user?.username || 'Bu cevaba'} yorum yazın...`}
                                                        rows={3}
                                                        className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all resize-none mb-3"
                                                        autoFocus
                                                    />
                                                    <div className="mb-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => setCommentAnonymous(prev => ({ ...prev, [answer.id]: !prev[answer.id] }))}
                                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all text-sm ${commentAnonymous[answer.id]
                                                                ? 'bg-purple-100 text-purple-700 border-2 border-purple-300'
                                                                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border-2 border-transparent hover:border-gray-300'
                                                                }`}
                                                        >
                                                            <FaUserSecret />
                                                            <span className="text-xs">{commentAnonymous[answer.id] ? 'Anonim yorum' : 'Anonim olarak yorum yap'}</span>
                                                        </button>
                                                    </div>
                                                    <div className="flex gap-2 justify-end">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleComment(answer.id)}
                                                            className="py-2 px-4 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all text-sm"
                                                        >
                                                            İptal
                                                        </button>
                                                        <button
                                                            type="submit"
                                                            disabled={!commentTexts[answer.id] || !commentTexts[answer.id].trim()}
                                                            className="bg-coral text-white font-semibold py-2 px-4 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                                        >
                                                            Yorum Gönder
                                                        </button>
                                                    </div>
                                                </form>
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                                    <p>Henüz cevap yok. İlk cevabı sen yaz!</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div >
            </MainLayout>
        </>
    );
};

export default QuestionDetailPage;
