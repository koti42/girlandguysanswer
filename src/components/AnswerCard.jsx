import React from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { FaHeart, FaCheckCircle } from 'react-icons/fa';

const formatDate = (dateString) => {
    if (!dateString) return "Az önce";
    try {
        return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: tr });
    } catch (e) {
        return "Bilinmiyor";
    }
};

const AnswerCard = ({ answer }) => {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft hover:shadow-md transition-all border border-gray-100 dark:border-gray-700">
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
                    <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                        <FaHeart className="text-coral" />
                        <span className="font-medium">{answer.likes_count || 0}</span>
                    </div>

                    {/* Accepted Badge */}
                    {answer.is_accepted && (
                        <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                            <FaCheckCircle />
                            <span className="font-medium">Kabul Edildi</span>
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
