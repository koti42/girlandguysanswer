import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { FaHeart, FaMedal, FaMars, FaVenus, FaUserSecret, FaComment, FaArrowRight, FaQuoteLeft } from 'react-icons/fa';
import { questionsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Toast from './Toast';
import UserAvatar from './UserAvatar';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryIcons';
import { textWithMentions } from '../utils/parseMentions';

const formatDate = (dateString) => {
    if (!dateString) return "Az önce";
    try {
        return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: tr });
    } catch (e) {
        return "Bilinmiyor";
    }
};

const AnswerCard = ({ answer, profileGender }) => {
    const { user: currentUser } = useAuth();
    const [isLiked, setIsLiked] = useState(answer.is_liked || false);
    const [likesCount, setLikesCount] = useState(answer.likes_count || 0);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const [loading, setLoading] = useState(false);

    const isFemale = profileGender === 'female' || profileGender === 'kiz' || profileGender === 'kadın' || profileGender === 'woman';
    const isMale = profileGender === 'male' || profileGender === 'erkek' || profileGender === 'man';

    useEffect(() => {
        setIsLiked(answer.is_liked || false);
        setLikesCount(answer.likes_count || 0);
    }, [answer.is_liked, answer.likes_count]);

    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
    };

    const handleLike = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!currentUser) {
            showToast('Beğenmek için giriş yapmalısınız.', 'error');
            return;
        }

        if (loading) return;
        setLoading(true);

        const oldIsLiked = isLiked;
        const oldLikesCount = likesCount;

        setIsLiked(!oldIsLiked);
        setLikesCount(prev => oldIsLiked ? prev - 1 : prev + 1);

        try {
            const response = await questionsAPI.toggleLike({
                type: 'answer',
                id: answer.id
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
        } finally {
            setLoading(false);
        }
    };

    const accentColor = isFemale ? '#EC4899' : isMale ? '#3B82F6' : '#FF6B6B';
    const accentBg = isFemale ? 'bg-pink-50 dark:bg-pink-900/15' : isMale ? 'bg-blue-50 dark:bg-blue-900/15' : 'bg-coral/5 dark:bg-coral/10';
    const accentBorder = isFemale ? 'border-pink-100 dark:border-pink-800/30' : isMale ? 'border-blue-100 dark:border-blue-800/30' : 'border-gray-100 dark:border-gray-700';
    const accentText = isFemale ? 'text-pink-500' : isMale ? 'text-blue-500' : 'text-coral';
    const accentGradient = isFemale
        ? 'from-pink-500 to-rose-400'
        : isMale
            ? 'from-blue-500 to-indigo-400'
            : 'from-coral to-orange-400';

    const questionCategory = answer.question?.category;
    const categoryColor = questionCategory ? getCategoryColor(questionCategory) : null;

    return (
        <div className={`group relative bg-white dark:bg-gray-800 rounded-2xl shadow-soft hover:shadow-lg transition-all duration-300 overflow-hidden border ${answer.is_accepted
            ? 'border-emerald-200 dark:border-emerald-800/40 ring-1 ring-emerald-100 dark:ring-emerald-900/30'
            : accentBorder
            }`}>
            {toast.show && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast({ ...toast, show: false })}
                />
            )}

            {/* Top accent line */}
            <div className={`h-1 w-full bg-gradient-to-r ${answer.is_accepted ? 'from-emerald-400 to-teal-400' : accentGradient}`}></div>

            <div className="p-5">
                {/* Question Reference */}
                <Link
                    to={`/question/${answer.question?.slug || answer.question?.id}`}
                    className="block mb-4"
                >
                    <div className={`${accentBg} rounded-xl p-4 border ${accentBorder} group-hover:border-opacity-60 transition-all`}>
                        <div className="flex items-start gap-3">
                            <div className={`flex-shrink-0 mt-0.5 ${accentText} opacity-40`}>
                                <FaQuoteLeft className="text-lg" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                    <span className={`text-xs font-bold uppercase tracking-wider ${accentText}`}>Soru</span>
                                    {questionCategory && (
                                        <span
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                            style={{
                                                backgroundColor: `${categoryColor}12`,
                                                color: categoryColor
                                            }}
                                        >
                                            {getCategoryIcon(questionCategory)}
                                            {typeof questionCategory === 'object' ? questionCategory.name : questionCategory}
                                        </span>
                                    )}
                                </div>
                                <h3 className="text-gray-800 dark:text-white font-bold text-base leading-snug group-hover:text-coral dark:group-hover:text-coral transition-colors line-clamp-2">
                                    {answer.question?.title}
                                </h3>
                                {answer.question?.user && (
                                    <div className="flex items-center gap-2 mt-2">
                                        <UserAvatar user={answer.question.is_anonymous ? null : answer.question.user} size={20} />
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                                            {answer.question.is_anonymous ? 'Gizli Üye' : answer.question.user?.username}
                                        </span>
                                        {answer.question.user?.gender === 'female' && !answer.question.is_anonymous && (
                                            <FaVenus className="text-pink-400 text-[10px]" />
                                        )}
                                        {answer.question.user?.gender === 'male' && !answer.question.is_anonymous && (
                                            <FaMars className="text-blue-400 text-[10px]" />
                                        )}
                                    </div>
                                )}
                            </div>
                            <FaArrowRight className="text-gray-300 dark:text-gray-600 group-hover:text-coral dark:group-hover:text-coral transition-colors text-sm flex-shrink-0 mt-1" />
                        </div>
                    </div>
                </Link>

                {/* Answer Content */}
                <div className="mb-4 pl-1">
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-[15px] whitespace-pre-wrap">
                        {textWithMentions(answer.content)}
                    </p>
                    {answer.gif_url && (
                        <img src={answer.gif_url} alt="GIF" className="mt-3 rounded-xl max-w-[200px] shadow-sm" />
                    )}
                </div>

                {/* Footer: Meta Info */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700/50">
                    <div className="flex items-center gap-3">
                        {/* Like Button */}
                        <button
                            onClick={handleLike}
                            disabled={loading}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${isLiked
                                ? `bg-gradient-to-r ${accentGradient} text-white shadow-sm`
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                        >
                            <FaHeart className={`text-xs ${isLiked ? 'animate-pulse' : ''}`} />
                            <span>{likesCount}</span>
                        </button>

                        {/* Comments count */}
                        {answer.comments_count > 0 && (
                            <div className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm">
                                <FaComment className="text-xs" />
                                <span>{answer.comments_count}</span>
                            </div>
                        )}

                        {/* Accepted Badge */}
                        {answer.is_accepted && (
                            <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-full border border-emerald-200 dark:border-emerald-800/40">
                                <FaMedal className="text-xs" />
                                <span className="font-bold text-xs">En İyi Cevap</span>
                            </div>
                        )}

                        {/* Owner Badge */}
                        {answer.isOwner && (
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${isFemale ? 'bg-pink-100 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400' : isMale ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'bg-coral/10 text-coral'}`}>
                                Senin Cevabın
                            </span>
                        )}
                    </div>

                    {/* Date */}
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                        {formatDate(answer.created_at)}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default AnswerCard;
