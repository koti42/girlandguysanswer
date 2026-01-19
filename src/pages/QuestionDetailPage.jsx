import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FaHeart, FaComment, FaEye, FaMars, FaVenus, FaShare, FaReply } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import { questions } from '../data/mockData';
import { TrendsWidget, TopUsersWidget, AnnouncementsWidget } from '../components/Widgets';

const QuestionDetailPage = () => {
    const { id } = useParams();
    const [commentText, setCommentText] = useState('');
    const [replyingTo, setReplyingTo] = useState(null);
    const [replyText, setReplyText] = useState('');

    // Find question by ID
    const question = questions.find(q => q.id === parseInt(id));

    if (!question) {
        return (
            <MainLayout>
                <div className="bg-white rounded-2xl p-12 text-center">
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Soru Bulunamadı</h2>
                    <p className="text-gray-600 mb-6">Aradığınız soru mevcut değil veya silinmiş olabilir.</p>
                    <Link to="/" className="text-coral hover:underline font-semibold">Ana Sayfaya Dön</Link>
                </div>
            </MainLayout>
        );
    }

    // Mock answers data
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
            createdAt: '2 saat önce'
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
            createdAt: '3 saat önce'
        }
    ];

    const handleSubmitComment = (e) => {
        e.preventDefault();
        if (commentText.trim()) {
            console.log('Cevap gönderildi:', commentText);
            setCommentText('');
        }
    };

    const handleSubmitReply = (e, answerId) => {
        e.preventDefault();
        if (replyText.trim()) {
            console.log('Yanıt gönderildi:', replyText, 'Cevap ID:', answerId);
            setReplyText('');
            setReplyingTo(null);
        }
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
                <div className="bg-white rounded-2xl p-6 shadow-soft">
                    {/* User Header */}
                    <div className="flex items-center gap-3 mb-4">
                        <Link to={`/profile/${question.user.name}`}>
                            <img
                                src={question.user.avatar}
                                alt={question.user.name}
                                className="w-12 h-12 rounded-full border border-gray-100 hover:border-coral transition-colors"
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
                        <button className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors">
                            <FaShare /> Paylaş
                        </button>
                    </div>
                </div>

                {/* Answer Form - Moved here, right after question */}
                <div className="bg-white rounded-2xl p-6 shadow-soft">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Cevap Yaz</h3>
                    <form onSubmit={handleSubmitComment}>
                        <textarea
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            placeholder="Cevabınızı buraya yazın..."
                            rows={4}
                            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all resize-none mb-4"
                        />
                        <div className="flex justify-end">
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
                <div className="bg-white rounded-2xl p-6 shadow-soft">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">
                        {answers.length} Cevap
                    </h2>

                    <div className="space-y-6">
                        {answers.map(answer => (
                            <div key={answer.id} className="border-b border-gray-100 last:border-0 pb-6 last:pb-0">
                                <div className="flex gap-4">
                                    <Link to={`/profile/${answer.user.name}`}>
                                        <img
                                            src={answer.user.avatar}
                                            alt={answer.user.name}
                                            className="w-10 h-10 rounded-full border border-gray-100 hover:border-coral transition-colors"
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
                                        <p className="text-gray-700 leading-relaxed mb-3">
                                            {answer.content}
                                        </p>
                                        <div className="flex items-center gap-4">
                                            <button className="flex items-center gap-2 text-gray-500 hover:text-coral transition-colors text-sm">
                                                <FaHeart /> {answer.likes}
                                            </button>
                                            <button
                                                onClick={() => setReplyingTo(replyingTo === answer.id ? null : answer.id)}
                                                className="flex items-center gap-2 text-gray-500 hover:text-blue-500 transition-colors text-sm"
                                            >
                                                <FaReply /> Cevapla
                                            </button>
                                        </div>

                                        {/* Reply Form */}
                                        {replyingTo === answer.id && (
                                            <div className="mt-4 ml-4 pl-4 border-l-2 border-gray-200">
                                                <form onSubmit={(e) => handleSubmitReply(e, answer.id)}>
                                                    <textarea
                                                        value={replyText}
                                                        onChange={(e) => setReplyText(e.target.value)}
                                                        placeholder={`${answer.user.name} kullanıcısına yanıt yazın...`}
                                                        rows={3}
                                                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all resize-none mb-3"
                                                        autoFocus
                                                    />
                                                    <div className="flex gap-2 justify-end">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setReplyingTo(null);
                                                                setReplyText('');
                                                            }}
                                                            className="py-2 px-4 rounded-xl text-gray-600 hover:bg-gray-100 transition-all text-sm"
                                                        >
                                                            İptal
                                                        </button>
                                                        <button
                                                            type="submit"
                                                            disabled={!replyText.trim()}
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
