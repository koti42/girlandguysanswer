import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaHeart, FaComment, FaEye, FaMars, FaVenus, FaPaperPlane, FaUserSecret, FaEyeSlash } from 'react-icons/fa';
import UserAvatar from './UserAvatar';
import QuestionActionsMenu from './QuestionActionsMenu';
import ReportModal from './ReportModal';
import QuestionModerationMenu from './Moderation/QuestionModerationMenu';

import { questionsAPI, commentsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Toast from './Toast';

const QuestionCard = ({ question, onModerationAction }) => {
    const { user: currentUser, canModerate } = useAuth();
    const [showReplyBox, setShowReplyBox] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [isAnonymous, setIsAnonymous] = useState(currentUser?.last_action_is_anonymous || false);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const [showReportModal, setShowReportModal] = useState(false);

    const [isLiked, setIsLiked] = useState(question.is_liked || false);
    const [likesCount, setLikesCount] = useState(question.likes_count || question.stats?.likes || question.likes || 0);

    useEffect(() => {
        setIsLiked(question.is_liked || false);
        setLikesCount(question.likes_count || question.stats?.likes || question.likes || 0);
    }, [question.is_liked, question.likes_count, question.stats?.likes, question.likes]);

    useEffect(() => {
        if (currentUser?.last_action_is_anonymous !== undefined) {
            setIsAnonymous(currentUser.last_action_is_anonymous);
        }
    }, [currentUser?.last_action_is_anonymous]);

    const handleLike = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!currentUser) {
            showToast('Beğenmek için giriş yapmalısınız.', 'error');
            return;
        }

        const oldIsLiked = isLiked;
        const oldLikesCount = likesCount;

        setIsLiked(!oldIsLiked);
        setLikesCount(prev => oldIsLiked ? prev - 1 : prev + 1);

        try {
            const response = await questionsAPI.toggleLike({
                type: 'question',
                id: question.id
            });

            if (response.data?.data) {
                setLikesCount(response.data.data.likes_count);
                setIsLiked(response.data.data.is_liked);
            }
        } catch (error) {
            setIsLiked(oldIsLiked);
            setLikesCount(oldLikesCount);
            console.error('Like error:', error);

            if (error.response?.status === 401) {
                showToast('Oturumunuz sonlanmış olabilir.', 'error');
            } else {
                showToast('Bir hata oluştu.', 'error');
            }
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
            setShowReplyBox(false);

        } catch (error) {
            console.error('QuestionCard - Answer error:', error.response?.data);
            const errorMsg = error.response?.data?.message || 'Cevap gönderilemedi. Lütfen tekrar deneyin.';
            showToast(errorMsg, 'error');
        } finally {
            setLoading(false);
        }
    };

    const getCardStyle = () => {
        const gender = question.user?.gender;
        if (gender === 'female') {
            return {
                container: 'bg-gradient-to-br from-rose-50 via-white to-pink-50 border-pink-100 hover:border-pink-200 shadow-sm hover:shadow-pink-100/50 dark:from-pink-900/10 dark:via-gray-800 dark:to-rose-900/10 dark:border-pink-900/30',
                badge: 'bg-pink-100 dark:bg-pink-900/40 text-pink-600 dark:text-pink-300',
                icon: 'text-pink-500',
                button: 'from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 shadow-pink-200'
            };
        } else if (gender === 'male') {
            return {
                container: 'bg-gradient-to-br from-blue-50 via-white to-sky-50 border-blue-100 hover:border-blue-200 shadow-sm hover:shadow-blue-100/50 dark:from-blue-900/10 dark:via-gray-800 dark:to-indigo-900/10 dark:border-blue-900/30',
                badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300',
                icon: 'text-blue-500',
                button: 'from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-blue-200'
            };
        } else {
            return {
                container: 'bg-gradient-to-br from-gray-50 via-white to-gray-50 border-gray-100 hover:border-gray-200 shadow-sm dark:from-gray-800 dark:via-gray-800 dark:to-gray-800 dark:border-gray-700',
                badge: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
                icon: 'text-gray-500',
                button: 'from-gray-700 to-gray-900 hover:from-gray-800 hover:to-black shadow-gray-200 dark:from-gray-700 dark:to-gray-600'
            };
        }
    };

    const styles = getCardStyle();
    const isOwnerAnonymous = !question.user?.username || question.user?.username === 'anonim';
    const displayName = isOwnerAnonymous ? 'Gizli Üye' : question.user.username;

    return (
        <div className={`rounded-2xl md:rounded-3xl p-4 md:p-6 transition-all duration-300 border flex flex-col gap-3 md:gap-4 ${styles.container}`}>
            {/* Header */}
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                    <Link to={isOwnerAnonymous ? '#' : `/profile/${question.user?.username}`} className={isOwnerAnonymous ? 'cursor-default' : ''}>
                        <UserAvatar
                            user={question.user}
                            size="md"
                            className="shadow-sm border-2 border-white md:w-12 md:h-12 w-10 h-10"
                        />
                    </Link>
                    <div>
                        <div className="flex items-center gap-1.5 md:gap-2">
                            <span className="font-bold text-gray-900 dark:text-white text-base md:text-lg line-clamp-1">
                                {displayName}
                            </span>
                            {question.user?.gender === 'female' ? (
                                <FaVenus className={`text-base md:text-lg ${styles.icon}`} />
                            ) : (
                                <FaMars className={`text-base md:text-lg ${styles.icon}`} />
                            )}
                        </div>
                        <span className="text-[10px] md:text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">{question.category}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
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
            <div>
                <div className="flex items-center gap-2 mb-2">
                    {(question.moderation?.is_hidden || question.is_hidden) && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs font-semibold">
                            <FaEyeSlash />
                            Gizlendi
                        </span>
                    )}
                </div>
                <Link to={`/question/${question.slug || question.id}`}>
                    <h3 className="text-lg md:text-xl font-bold text-gray-800 dark:text-gray-100 mb-2 md:mb-3 leading-snug hover:text-coral transition-colors cursor-pointer line-clamp-2 md:line-clamp-none">
                        {question.title}
                    </h3>
                </Link>

                <div className="flex flex-wrap gap-1.5 md:gap-2 mb-3 md:mb-4">
                    {question.tags.map((tag, idx) => (
                        <span key={idx} className={`px-2.5 py-0.5 md:px-3 md:py-1 rounded-full text-[10px] md:text-xs font-bold transition-colors ${styles.badge}`}>
                            #{tag}
                        </span>
                    ))}
                </div>

                {question.image && (
                    <Link to={`/question/${question.slug || question.id}`}>
                        <div className="rounded-xl md:rounded-2xl overflow-hidden mb-3 md:mb-4 shadow-sm cursor-pointer group">
                            <img src={question.image} alt="Question" className="w-full h-56 md:h-72 object-cover group-hover:scale-105 transition-transform duration-700 ease-in-out" />
                        </div>
                    </Link>
                )}
            </div>

            {/* Footer / Stats */}
            <div className="pt-3 md:pt-4 border-t border-gray-100/50 dark:border-gray-700/50">
                <div className="flex items-center justify-between text-gray-500 text-xs md:text-sm mb-3 md:mb-4">
                    <div className="flex gap-4 md:gap-6">
                        <button
                            onClick={handleLike}
                            className={`flex items-center gap-1.5 md:gap-2 transition-colors group ${isLiked ? 'text-red-500' : 'hover:text-red-500'}`}
                            disabled={loading}
                        >
                            <div className={`p-1.5 md:p-2 rounded-full transition-colors ${isLiked ? 'bg-red-100 text-red-500' : 'bg-red-50 text-red-400 group-hover:bg-red-100 group-hover:text-red-500'}`}>
                                <FaHeart />
                            </div>
                            <span className="font-semibold">{likesCount}</span>
                        </button>
                        <Link to={`/question/${question.slug || question.id}`} className="flex items-center gap-1.5 md:gap-2 hover:text-blue-500 transition-colors group">
                            <div className="p-1.5 md:p-2 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-400 dark:text-blue-300 group-hover:bg-blue-100 transition-colors">
                                <FaComment />
                            </div>
                            <span className="font-semibold">{question.answers_count !== undefined ? question.answers_count : (question.stats?.comments || question.commentsCount || 0)}</span>
                        </Link>
                    </div>
                    <div className="flex items-center gap-1.5 md:gap-2 text-gray-400">
                        <FaEye /> <span>{question.views_count !== undefined ? question.views_count : (question.stats?.views || question.views || 0)}</span>
                    </div>
                </div>

                {/* Reply Button - Only if not owner */}
                {!question.isOwner && (
                    <button
                        onClick={() => setShowReplyBox(!showReplyBox)}
                        className={`w-full py-2.5 md:py-3 px-4 rounded-xl bg-gradient-to-r text-white font-bold transition-all shadow-lg hover:shadow-xl active:scale-[0.99] flex items-center justify-center gap-2 text-sm md:text-base ${styles.button}`}
                    >
                        <FaComment />
                        {showReplyBox ? 'Vazgeç' : 'Cevapla'}
                    </button>
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
            {showReplyBox && (
                <form onSubmit={handleSubmitReply} className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Hızlı cevap yaz..."
                            className="flex-1 px-3 md:px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all text-sm"
                            autoFocus
                            disabled={loading}
                        />
                        <button
                            type="submit"
                            disabled={!replyText.trim() || loading}
                            className="bg-gradient-to-r from-coral to-orange-400 text-white p-2 md:p-2.5 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[40px] md:min-w-[44px]"
                        >
                            {loading ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-b-transparent"></div> : <FaPaperPlane />}
                        </button>
                    </div>
                    <div className="flex items-center justify-between mt-2 md:mt-3">
                        <button
                            type="button"
                            onClick={() => setIsAnonymous(!isAnonymous)}
                            disabled={loading}
                            className={`flex items-center gap-1.5 md:gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-xl font-medium transition-all ${isAnonymous
                                ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-2 border-purple-300 dark:border-purple-800'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                                }`}
                        >
                            <FaUserSecret className="text-base md:text-lg" />
                            <span className="text-xs md:text-sm">{isAnonymous ? 'Gizli' : 'Gizli Üye ol'}</span>
                        </button>
                        <p className="text-[10px] md:text-xs text-gray-500 hidden md:block">Detaylı cevap için soruya tıklayın</p>
                    </div>
                </form>
            )}
        </div>
    );
};

export default QuestionCard;
