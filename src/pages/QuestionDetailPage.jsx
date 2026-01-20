import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FaHeart, FaComment, FaEye, FaMars, FaVenus, FaShare, FaReply, FaUserSecret } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import { questions } from '../data/mockData';
import { TrendsWidget, TopUsersWidget, AnnouncementsWidget } from '../components/Widgets';

const QuestionDetailPage = () => {
    const { id } = useParams();
    const [commentText, setCommentText] = useState('');
    const [isCommentAnonymous, setIsCommentAnonymous] = useState(false);
    const [replyingTo, setReplyingTo] = useState([]); // Array to support multiple replies
    const [replyTexts, setReplyTexts] = useState({}); // Object to store reply text for each answer
    const [replyAnonymous, setReplyAnonymous] = useState({}); // Anonymous state for each reply
    const [genderFilter, setGenderFilter] = useState('all'); // 'all' | 'female' | 'male'
    const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest' | 'likes' | 'replies'

    // Find question by ID
    const question = questions.find(q => q.id === parseInt(id));

    if (!question) {
        return (
            <MainLayout>
                <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-2xl p-12 text-center">
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Soru Bulunamadı</h2>
                    <p className="text-gray-600 mb-6">Aradığınız soru mevcut değil veya silinmiş olabilir.</p>
                    <Link to="/" className="text-coral hover:underline font-semibold">Ana Sayfaya Dön</Link>
                </div>
            </MainLayout>
        );
    }

    // Mock answers data with replies
    const answers = [
        {
            id: 1,
            user: {
                name: 'Elif_Mavi',
                avatar: 'https://i.pravatar.cc/150?u=a1',
                gender: 'female'
            },
            content: 'Bence pastel tonlar bu sezon çok moda! Özellikle pudra pembesi ve lavanta renkleri düğünlerde çok şık duruyor. Ayrıca uzun tül etekli modeller çok popüler.',
            likes: 24,
            createdAt: '2 saat önce',
            replies: [
                {
                    id: 101,
                    user: {
                        name: 'Zeynep_Yildiz',
                        avatar: 'https://i.pravatar.cc/150?u=r1',
                        gender: 'female'
                    },
                    content: 'Çok teşekkürler! Pastel tonları deneyeceğim kesinlikle 💕',
                    createdAt: '1 saat önce'
                }
            ]
        },
        {
            id: 2,
            user: {
                name: 'Ayşe_K',
                avatar: 'https://i.pravatar.cc/150?u=a2',
                gender: 'female'
            },
            content: 'Kesinlikle midi boydaki elbiseler çok trend! Şifon kumaşlar da hem şık hem rahat. Ben geçen hafta bir düğüne mint yeşili bir elbise ile gittim, herkes beğendi 😊',
            likes: 18,
            createdAt: '3 saat önce',
            replies: [
                {
                    id: 201,
                    user: {
                        name: 'Can_Yilmaz',
                        avatar: 'https://i.pravatar.cc/150?u=r2',
                        gender: 'male'
                    },
                    content: 'Mint yeşili çok güzel bir seçim! Fotoğraf var mı? 😄',
                    createdAt: '2 saat önce'
                },
                {
                    id: 202,
                    user: {
                        name: 'Ayşe_K',
                        avatar: 'https://i.pravatar.cc/150?u=a2',
                        gender: 'female'
                    },
                    content: '@Can_Yilmaz Profilimde paylaştım, bakabilirsin!',
                    createdAt: '1 saat önce'
                }
            ]
        }
    ];

    const handleSubmitComment = (e) => {
        e.preventDefault();
        if (commentText.trim()) {
            console.log('Cevap gönderildi:', {
                text: commentText,
                anonymous: isCommentAnonymous
            });
            setCommentText('');
            setIsCommentAnonymous(false);
        }
    };

    const handleSubmitReply = (e, answerId) => {
        e.preventDefault();
        const replyText = replyTexts[answerId];
        if (replyText && replyText.trim()) {
            console.log('Yanıt gönderildi:', {
                text: replyText,
                answerId: answerId,
                anonymous: replyAnonymous[answerId] || false
            });
            setReplyTexts(prev => ({ ...prev, [answerId]: '' }));
            setReplyAnonymous(prev => ({ ...prev, [answerId]: false }));
            setReplyingTo(prev => prev.filter(id => id !== answerId));
        }
    };

    const toggleReply = (answerId) => {
        setReplyingTo(prev => {
            if (prev.includes(answerId)) {
                return prev.filter(id => id !== answerId);
            } else {
                return [...prev, answerId];
            }
        });
    };

    const handleReplyTextChange = (answerId, text) => {
        setReplyTexts(prev => ({ ...prev, [answerId]: text }));
    };

    const SidebarContent = (
        <>
            <TrendsWidget />
            <TopUsersWidget />
            <AnnouncementsWidget />
        </>
    );

    // Filter and sort answers
    const getFilteredAndSortedAnswers = () => {
        let filtered = answers.filter(answer => {
            if (genderFilter === 'all') return true;
            return answer.user.gender === genderFilter;
        });

        return filtered.sort((a, b) => {
            switch (sortBy) {
                case 'newest':
                    return b.id - a.id; // Assuming higher ID means newer
                case 'oldest':
                    return a.id - b.id;
                case 'likes':
                    return b.likes - a.likes;
                case 'replies':
                    return b.replies.length - a.replies.length;
                default:
                    return 0;
            }
        });
    };

    const filteredAnswers = getFilteredAndSortedAnswers();

    return (
        <MainLayout sidebar={SidebarContent}>
            <div className="flex flex-col gap-6">
                {/* Question Card */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft">
                    {/* User Header */}
                    <div className="flex items-center gap-3 mb-4">
                        <Link to={`/profile/${question.user.name}`}>
                            <img
                                src={question.user.avatar}
                                alt={question.user.name}
                                className="w-12 h-12 rounded-full border border-gray-100 dark:border-gray-700 hover:border-coral transition-colors"
                            />
                        </Link>
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <Link to={`/profile/${question.user.name}`} className="font-bold text-gray-800 dark:text-white hover:underline">
                                    {question.user.name}
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
                                <span>5 saat önce</span>
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
                                <span className="font-semibold">{question.stats.likes}</span>
                            </button>
                            <button className="flex items-center gap-2 text-gray-500 hover:text-blue-500 transition-colors">
                                <FaComment className="text-lg" />
                                <span className="font-semibold">{question.stats.comments}</span>
                            </button>
                            <div className="flex items-center gap-2 text-gray-500">
                                <FaEye />
                                <span>{question.stats.views}</span>
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
                    <form onSubmit={handleSubmitComment}>
                        <textarea
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            placeholder="Cevabınızı buraya yazın..."
                            rows={4}
                            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all resize-none mb-4"
                        />
                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setIsCommentAnonymous(!isCommentAnonymous)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${isCommentAnonymous
                                    ? 'bg-purple-100 text-purple-700 border-2 border-purple-300'
                                    : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:border-gray-300'
                                    }`}
                            >
                                <FaUserSecret className="text-lg" />
                                <span className="text-sm">{isCommentAnonymous ? 'Anonim cevap' : 'Anonim olarak cevapla'}</span>
                            </button>
                            <button
                                type="submit"
                                disabled={!commentText.trim()}
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
                                {answers.filter(a => genderFilter === 'all' || a.user.gender === genderFilter).length} Cevap
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
                                <option value="replies">💬 En Çok Yanıtlanan</option>
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
                                <FaVenus /> Kadınlar ({answers.filter(a => a.user.gender === 'female').length})
                            </button>
                            <button
                                onClick={() => setGenderFilter('male')}
                                className={`px-4 py-2 rounded-xl font-medium transition-all text-sm flex items-center gap-2 ${genderFilter === 'male'
                                    ? 'bg-gradient-to-r from-blue-500 to-blue-400 text-white shadow-lg'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                            >
                                <FaMars /> Erkekler ({answers.filter(a => a.user.gender === 'male').length})
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {filteredAnswers.map(answer => {
                            // Gender-based gradient colors
                            const gradientClass = answer.user.gender === 'female'
                                ? 'bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-900/20 dark:to-pink-800/20 border-pink-200 dark:border-pink-800/50'
                                : 'bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-900/20 dark:to-cyan-800/20 border-cyan-200 dark:border-cyan-800/50';

                            return (
                                <div key={answer.id} className={`${gradientClass} rounded-2xl p-5 shadow-md hover:shadow-lg transition-all border-2`}>
                                    <div className="flex gap-4">
                                        {/* Avatar with gender badge */}
                                        <div className="relative">
                                            <Link to={`/profile/${answer.user.name}`}>
                                                <img
                                                    src={answer.user.avatar}
                                                    alt={answer.user.name}
                                                    className="w-14 h-14 rounded-full border-2 border-white dark:border-gray-700 shadow-md hover:border-coral transition-colors"
                                                />
                                            </Link>
                                            <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center ${answer.user.gender === 'female' ? 'bg-pink-500' : 'bg-blue-500'
                                                }`}>
                                                {answer.user.gender === 'female' ? (
                                                    <FaVenus className="text-white text-xs" />
                                                ) : (
                                                    <FaMars className="text-white text-xs" />
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex-1">
                                            {/* User info header */}
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <Link to={`/profile/${answer.user.name}`} className="font-bold text-gray-800 dark:text-white hover:text-coral dark:hover:text-coral transition-colors">
                                                        {answer.user.name}
                                                    </Link>
                                                    <span className="text-gray-400 dark:text-gray-500 text-sm">• {answer.createdAt}</span>
                                                </div>
                                            </div>

                                            {/* Answer content */}
                                            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                                                {answer.content}
                                            </p>

                                            {/* Action buttons */}
                                            <div className="flex items-center gap-4 mb-3">
                                                <button className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-coral dark:hover:text-coral transition-colors group">
                                                    <FaHeart className="text-lg group-hover:scale-110 transition-transform" />
                                                    <span className="font-semibold">{answer.likes}</span>
                                                </button>
                                                <button
                                                    onClick={() => toggleReply(answer.id)}
                                                    className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-coral dark:hover:text-coral transition-colors"
                                                >
                                                    <FaReply className="text-lg" />
                                                    <span className="font-semibold">{answer.replies.length} Yanıt</span>
                                                </button>
                                            </div>

                                            {/* Replies Section */}
                                            {answer.replies && answer.replies.length > 0 && (
                                                <div className="mt-4 space-y-3">
                                                    {answer.replies.map(reply => {
                                                        // Gender-based gradient for replies (softer/lighter versions)
                                                        const replyGradientClass = reply.user.gender === 'female'
                                                            ? 'bg-gradient-to-br from-pink-100/60 to-pink-50/40 dark:from-pink-900/15 dark:to-pink-800/10 border-pink-300 dark:border-pink-700/40'
                                                            : 'bg-gradient-to-br from-cyan-100/60 to-cyan-50/40 dark:from-cyan-900/15 dark:to-cyan-800/10 border-cyan-300 dark:border-cyan-700/40';

                                                        return (
                                                            <div key={reply.id} className={`${replyGradientClass} rounded-xl p-4 ml-6 border-l-4 shadow-sm`}>
                                                                <div className="flex gap-3">
                                                                    <Link to={`/profile/${reply.user.name}`}>
                                                                        <img
                                                                            src={reply.user.avatar}
                                                                            alt={reply.user.name}
                                                                            className="w-10 h-10 rounded-full border-2 border-white dark:border-gray-700 shadow-sm hover:border-coral transition-colors"
                                                                        />
                                                                    </Link>
                                                                    <div className="flex-1">
                                                                        <div className="flex items-center gap-2 mb-1">
                                                                            <Link to={`/profile/${reply.user.name}`} className="font-semibold text-sm text-gray-800 dark:text-white hover:underline">
                                                                                {reply.user.name}
                                                                            </Link>
                                                                            {reply.user.gender === 'female' ? (
                                                                                <FaVenus className="text-pink-500 text-xs" />
                                                                            ) : (
                                                                                <FaMars className="text-cyan-500 text-xs" />
                                                                            )}
                                                                            <span className="text-gray-500 dark:text-gray-400 text-xs">• {reply.createdAt}</span>
                                                                        </div>
                                                                        <p className="text-gray-700 dark:text-gray-200 text-sm leading-relaxed">
                                                                            {reply.content}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* Reply Form */}
                                            {replyingTo.includes(answer.id) && (
                                                <div className="mt-4 ml-4 pl-4 border-l-2 border-blue-200">
                                                    <form onSubmit={(e) => handleSubmitReply(e, answer.id)}>
                                                        <textarea
                                                            value={replyTexts[answer.id] || ''}
                                                            onChange={(e) => handleReplyTextChange(answer.id, e.target.value)}
                                                            placeholder={`${answer.user.name} kullanıcısına yanıt yazın...`}
                                                            rows={3}
                                                            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all resize-none mb-3"
                                                            autoFocus
                                                        />
                                                        <div className="mb-3">
                                                            <button
                                                                type="button"
                                                                onClick={() => setReplyAnonymous(prev => ({ ...prev, [answer.id]: !prev[answer.id] }))}
                                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all text-sm ${replyAnonymous[answer.id]
                                                                    ? 'bg-purple-100 text-purple-700 border-2 border-purple-300'
                                                                    : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:border-gray-300'
                                                                    }`}
                                                            >
                                                                <FaUserSecret />
                                                                <span className="text-xs">{replyAnonymous[answer.id] ? 'Anonim yanıt' : 'Anonim olarak yanıtla'}</span>
                                                            </button>
                                                        </div>
                                                        <div className="flex gap-2 justify-end">
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleReply(answer.id)}
                                                                className="py-2 px-4 rounded-xl text-gray-600 hover:bg-gray-100 transition-all text-sm"
                                                            >
                                                                İptal
                                                            </button>
                                                            <button
                                                                type="submit"
                                                                disabled={!replyTexts[answer.id] || !replyTexts[answer.id].trim()}
                                                                className="bg-coral text-white font-semibold py-2 px-4 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                                            >
                                                                Yanıtla
                                                            </button>
                                                        </div>
                                                    </form>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </MainLayout >
    );
};

export default QuestionDetailPage;
