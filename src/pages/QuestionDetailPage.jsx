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

    return (
        <MainLayout sidebar={SidebarContent}>
            <div className="flex flex-col gap-6">
                {/* Question Card */}
                <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-2xl p-6 shadow-soft">
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
                                <Link to={`/profile/${question.user.name}`} className="font-bold text-gray-800 hover:underline">
                                    {question.user.name}
                                </Link>
                                {question.user.gender === 'female' ? (
                                    <FaVenus className="text-pink-500" />
                                ) : (
                                    <FaMars className="text-blue-500" />
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span className="bg-gray-100 px-2 py-0.5 rounded">{question.category}</span>
                                <span>•</span>
                                <span>5 saat önce</span>
                            </div>
                        </div>
                    </div>

                    {/* Question Title */}
                    <h1 className="text-2xl font-bold text-gray-800 mb-4 leading-snug">
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
                <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-2xl p-6 shadow-soft">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Cevap Yaz</h3>
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
                <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-2xl p-6 shadow-soft">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">
                        {answers.length} Cevap
                    </h2>

                    <div className="space-y-6">
                        {answers.map(answer => (
                            <div key={answer.id} className="border-b border-gray-100 dark:border-gray-700 last:border-0 pb-6 last:pb-0">
                                <div className="flex gap-4">
                                    <Link to={`/profile/${answer.user.name}`}>
                                        <img
                                            src={answer.user.avatar}
                                            alt={answer.user.name}
                                            className="w-10 h-10 rounded-full border border-gray-100 dark:border-gray-700 hover:border-coral transition-colors"
                                        />
                                    </Link>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Link to={`/profile/${answer.user.name}`} className="font-bold text-gray-800 hover:underline">
                                                {answer.user.name}
                                            </Link>
                                            {answer.user.gender === 'female' ? (
                                                <FaVenus className="text-pink-500 text-sm" />
                                            ) : (
                                                <FaMars className="text-blue-500 text-sm" />
                                            )}
                                            <span className="text-gray-400 text-sm">• {answer.createdAt}</span>
                                        </div>
                                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-3">
                                            {answer.content}
                                        </p>
                                        <div className="flex items-center gap-4">
                                            <button className="flex items-center gap-2 text-gray-500 hover:text-coral transition-colors text-sm">
                                                <FaHeart /> {answer.likes}
                                            </button>
                                            <button
                                                onClick={() => toggleReply(answer.id)}
                                                className={`flex items-center gap-2 transition-colors text-sm ${replyingTo.includes(answer.id) ? 'text-blue-600' : 'text-gray-500 hover:text-blue-500'
                                                    }`}
                                            >
                                                <FaReply /> {replyingTo.includes(answer.id) ? 'İptal' : 'Cevapla'}
                                            </button>
                                        </div>

                                        {/* Existing Replies */}
                                        {answer.replies && answer.replies.length > 0 && (
                                            <div className="mt-4 ml-4 space-y-3">
                                                {answer.replies.map(reply => (
                                                    <div key={reply.id} className="flex gap-3 pl-4 border-l-2 border-gray-200">
                                                        <Link to={`/profile/${reply.user.name}`}>
                                                            <img
                                                                src={reply.user.avatar}
                                                                alt={reply.user.name}
                                                                className="w-8 h-8 rounded-full border border-gray-100 dark:border-gray-700 hover:border-coral transition-colors"
                                                            />
                                                        </Link>
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <Link to={`/profile/${reply.user.name}`} className="font-semibold text-sm text-gray-800 hover:underline">
                                                                    {reply.user.name}
                                                                </Link>
                                                                {reply.user.gender === 'female' ? (
                                                                    <FaVenus className="text-pink-500 text-xs" />
                                                                ) : (
                                                                    <FaMars className="text-blue-500 text-xs" />
                                                                )}
                                                                <span className="text-gray-400 text-xs">• {reply.createdAt}</span>
                                                            </div>
                                                            <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                                                                {reply.content}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
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
                        ))}
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default QuestionDetailPage;
