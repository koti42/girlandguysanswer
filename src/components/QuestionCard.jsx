import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaHeart, FaComment, FaEye, FaMars, FaVenus, FaPaperPlane, FaUserSecret } from 'react-icons/fa';
import UserAvatar from './UserAvatar';
import QuestionActionsMenu from './QuestionActionsMenu';

import { questionsAPI, commentsAPI } from '../services/api';

const QuestionCard = ({ question }) => {
    const [showReplyBox, setShowReplyBox] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmitReply = async (e) => {
        e.preventDefault();
        if (!replyText.trim()) return;

        setLoading(true);
        try {
            // Create comment on question using /comments endpoint
            await commentsAPI.create({
                content: replyText,
                commentable_type: 'question',
                commentable_id: question.id
            });

            console.log('Hızlı yorum gönderildi:', {
                text: replyText
            });

            setSuccessMessage('Yorumunuz başarıyla gönderildi! 🎉');
            setReplyText('');
            setIsAnonymous(false);
            setShowReplyBox(false);

            // Hide success message after 3 seconds
            setTimeout(() => {
                setSuccessMessage('');
            }, 3000);

        } catch (error) {
            console.error('Yorum gönderme hatası:', error);
            const errorMsg = error.response?.data?.message || 'Yorum gönderilemedi. Lütfen tekrar deneyin.';
            setErrorMessage(errorMsg);
            setTimeout(() => {
                setErrorMessage('');
            }, 3000);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`rounded-2xl p-6 shadow-soft hover:shadow-soft-hover transition-all duration-300 border flex flex-col gap-4 ${question.user?.gender === 'female'
            ? 'bg-gradient-to-br from-pink-100 via-pink-200 to-rose-200 dark:from-pink-800/40 dark:via-pink-700/30 dark:to-rose-700/30 border-pink-200 dark:border-pink-700/50'
            : 'bg-gradient-to-br from-blue-100 via-sky-200 to-cyan-200 dark:from-blue-800/40 dark:via-blue-700/30 dark:to-cyan-700/30 border-blue-200 dark:border-blue-700/50'
            }`}>
            {/* Header */}
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                    <Link to={`/profile/${question.user?.username}`}>
                        <UserAvatar
                            user={question.user}
                            size="lg"
                            className="hover:border-coral transition-colors cursor-pointer"
                        />
                    </Link>
                    <div>
                        <div className="flex items-center gap-1">
                            <Link to={`/profile/${question.user?.username}`} className="font-bold text-gray-800 dark:text-gray-100 hover:underline">
                                {question.user?.username || 'Anonim'}
                            </Link>
                            {question.user?.gender === 'female' ? (
                                <FaVenus className="text-pink-500" />
                            ) : (
                                <FaMars className="text-blue-500" />
                            )}
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{question.category}</span>
                    </div>
                </div>
                <QuestionActionsMenu />
            </div>

            {/* Content */}
            <div>
                <Link to={`/question/${question.slug || question.id}`}>
                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 leading-snug hover:text-coral transition-colors cursor-pointer">
                        {question.title}
                    </h3>
                </Link>

                <div className="flex flex-wrap gap-2 mb-4">
                    {question.tags.map((tag, idx) => (
                        <span key={idx} className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-3 py-1 rounded-full text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                            {tag}
                        </span>
                    ))}
                </div>

                {question.image && (
                    <Link to={`/question/${question.slug || question.id}`}>
                        <div className="rounded-xl overflow-hidden mb-4 shadow-sm cursor-pointer">
                            <img src={question.image} alt="Question" className="w-full h-64 object-cover hover:scale-105 transition-transform duration-500" />
                        </div>
                    </Link>
                )}
            </div>

            {/* Footer / Stats */}
            <div className="pt-4 border-t border-gray-50 dark:border-gray-700">
                <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 text-sm mb-3">
                    <div className="flex gap-6">
                        <button className="flex items-center gap-2 hover:text-coral transition-colors">
                            <FaHeart /> <span>{question.stats?.likes || question.likes || 0}</span>
                        </button>
                        <Link to={`/question/${question.slug || question.id}`} className="flex items-center gap-2 hover:text-blue-500 transition-colors">
                            <FaComment /> <span>{question.stats?.comments || question.commentsCount || 0}</span>
                        </Link>
                    </div>
                    <div className="flex items-center gap-2">
                        <FaEye /> <span>{question.stats?.views || question.views || 0}</span>
                    </div>
                </div>

                {/* Reply Button */}
                <button
                    onClick={() => setShowReplyBox(!showReplyBox)}
                    className="w-full py-2 px-4 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                >
                    <FaComment />
                    {showReplyBox ? 'İptal Et' : 'Cevapla'}
                </button>
            </div>

            {/* Success Message Notification */}
            {successMessage && (
                <div className="mt-4 p-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-xl text-center text-sm font-medium animate-pulse">
                    {successMessage}
                </div>
            )}

            {/* Quick Reply Box */}
            {showReplyBox && !successMessage && (
                <form onSubmit={handleSubmitReply} className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Hızlı cevap yaz..."
                            className="flex-1 px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all text-sm"
                            autoFocus
                            disabled={loading}
                        />
                        <button
                            type="submit"
                            disabled={!replyText.trim() || loading}
                            className="bg-gradient-to-r from-coral to-orange-400 text-white p-2.5 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[44px]"
                        >
                            {loading ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-b-transparent"></div> : <FaPaperPlane />}
                        </button>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                        <button
                            type="button"
                            onClick={() => setIsAnonymous(!isAnonymous)}
                            disabled={loading}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${isAnonymous
                                ? 'bg-purple-100 text-purple-700 border-2 border-purple-300'
                                : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:border-gray-300'
                                }`}
                        >
                            <FaUserSecret className="text-lg" />
                            <span className="text-sm">{isAnonymous ? 'Anonim cevap' : 'Anonim olarak cevapla'}</span>
                        </button>
                        <p className="text-xs text-gray-500">Detaylı cevap için soruya tıklayın</p>
                    </div>
                </form>
            )}
        </div>
    );
};

export default QuestionCard;
