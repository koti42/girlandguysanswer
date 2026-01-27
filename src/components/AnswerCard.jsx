import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { FaHeart, FaCheckCircle, FaMedal } from 'react-icons/fa';
import { questionsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Toast from './Toast';

const formatDate = (dateString) => {
    if (!dateString) return "Az önce";
    try {
        return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: tr });
    } catch (e) {
        return "Bilinmiyor";
    }
};

const AnswerCard = ({ answer }) => {
    const { user: currentUser } = useAuth();
    const [isLiked, setIsLiked] = useState(answer.is_liked || false);
    const [likesCount, setLikesCount] = useState(answer.likes_count || 0);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setIsLiked(answer.is_liked || false);
        setLikesCount(answer.likes_count || 0);
    }, [answer.is_liked, answer.likes_count]);

    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
    };

    const handleLike = async (e) => {
        e.preventDefault();

        if (!currentUser) {
            showToast('Beğenmek için giriş yapmalısınız.', 'error');
            return;
        }

        if (loading) return;

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
        }
    };

    return (
        <div className={`bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft hover:shadow-md transition-all border ${answer.is_accepted
            ? 'border-green-200 dark:border-green-800 ring-1 ring-green-100 dark:ring-green-900'
            : 'border-gray-100 dark:border-gray-700'
            }`}>
            {toast.show && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast({ ...toast, show: false })}
                />
            )}
            {/* Question Link */}
            <Link
                to={`/question/${answer.question.slug}`}
                className="block mb-4 group"
            >
                <div className="flex items-start gap-2">
                    <span className="text-coral text-sm font-medium">Soru:</span>
                    <h3 className="text-gray-800 dark:text-white font-semibold group-hover:text-coral transition-colors flex-1">
                        {answer.question.title}
                    </h3>
                </div>
            </Link>

            {/* Answer Content */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-4">
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                    {answer.content}
                </p>
            </div>

            {/* Answer Meta */}
            <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                    {/* Likes */}
                    <button
                        onClick={handleLike}
                        className={`flex items-center gap-1.5 transition-colors group ${isLiked ? 'text-coral' : 'text-gray-500 dark:text-gray-400 hover:text-coral'}`}
                    >
                        <FaHeart className={isLiked ? 'text-coral' : ''} />
                        <span className="font-medium">{likesCount}</span>
                    </button>

                    {/* Accepted Badge */}
                    {answer.is_accepted && (
                        <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-1 rounded-full">
                            <FaMedal />
                            <span className="font-bold text-xs">En İyi Görüş</span>
                        </div>
                    )}

                    {/* Owner Badge */}
                    {answer.isOwner && (
                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-medium">
                            Sizin Cevabınız
                        </span>
                    )}
                </div>

                {/* Date */}
                <span className="text-gray-500 dark:text-gray-400">
                    {formatDate(answer.created_at)}
                </span>
            </div>
        </div>
    );
};

export default AnswerCard;
