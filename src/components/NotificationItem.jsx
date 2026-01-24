import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { FaComment, FaReply, FaUserPlus, FaCheckCircle, FaTimes, FaEnvelope } from 'react-icons/fa';
import UserAvatar from './UserAvatar';

const formatDate = (dateString) => {
    if (!dateString) return "Az önce";
    try {
        return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: tr });
    } catch (e) {
        return "Bilinmiyor";
    }
};

const getNotificationIcon = (type) => {
    switch (type) {
        case 'answer_created':
            return <FaComment className="text-blue-500" />;
        case 'answer_comment_created':
            return <FaReply className="text-orange-500" />;
        case 'comment_reply':
            return <FaReply className="text-green-500" />;
        case 'follow_request':
            return <FaUserPlus className="text-purple-500" />;
        case 'follow_request_accepted':
            return <FaCheckCircle className="text-green-500" />;
        case 'new_message':
            return <FaEnvelope className="text-blue-500" />;
        default:
            return <FaComment className="text-gray-500" />;
    }
};

const NotificationItem = ({ notification, onClick, onDelete, compact = false }) => {
    const handleClick = (e) => {
        if (e.target.closest('.delete-button')) return;
        onClick?.(notification);
    };

    const handleDelete = (e) => {
        e.stopPropagation();
        onDelete?.(notification.id);
    };

    if (compact) {
        return (
            <div
                onClick={handleClick}
                className={`group relative flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all ${!notification.is_read
                    ? 'bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-900/10 dark:to-purple-900/10 hover:from-blue-50 hover:to-purple-50 dark:hover:from-blue-900/20 dark:hover:to-purple-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
            >
                {!notification.is_read && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-500 to-purple-500 rounded-l-lg" />
                )}

                <div className="relative flex-shrink-0">
                    <UserAvatar
                        user={notification.data?.user}
                        size="sm"
                        className="w-10 h-10 ring-2 ring-white dark:ring-gray-800"
                    />
                    <div className="absolute -bottom-0.5 -right-0.5 bg-white dark:bg-gray-800 rounded-full p-1 shadow-sm">
                        <div className="text-xs">
                            {getNotificationIcon(notification.type)}
                        </div>
                    </div>
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 dark:text-gray-200 font-medium line-clamp-2 leading-snug">
                        {notification.data?.message || 'Yeni bildirim'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDate(notification.created_at)}
                        </span>
                        {!notification.is_read && (
                            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                        )}
                    </div>
                </div>

                {!notification.is_read && (
                    <div className="flex-shrink-0">
                        <span className="inline-block px-2 py-0.5 bg-blue-500 text-white text-xs font-bold rounded-full">
                            NEW
                        </span>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            onClick={handleClick}
            className={`group relative flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer ${!notification.is_read
                ? 'bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/10 dark:to-purple-900/10 border-blue-200 dark:border-blue-800 hover:shadow-lg hover:scale-[1.01]'
                : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:shadow-md hover:border-gray-200 dark:hover:border-gray-600'
                }`}
        >
            {/* Left colored accent */}
            {!notification.is_read && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-purple-500 rounded-l-xl" />
            )}

            <div className="relative flex-shrink-0">
                <UserAvatar
                    user={notification.data?.user}
                    size="md"
                    className="w-12 h-12 ring-2 ring-white dark:ring-gray-800"
                />
                <div className="absolute -bottom-1 -right-1 bg-white dark:bg-gray-800 rounded-full p-1.5 shadow-sm ring-2 ring-white dark:ring-gray-800">
                    {getNotificationIcon(notification.type)}
                </div>
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1.5 leading-snug">
                    {notification.data?.message || 'Yeni bildirim'}
                </p>

                {notification.data?.question_title && (
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 mb-2 border border-gray-100 dark:border-gray-600">
                        <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2 italic">
                            "{notification.data.question_title}"
                        </p>
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                        {formatDate(notification.created_at)}
                    </span>
                    {!notification.is_read && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-full">
                            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                            Yeni
                        </span>
                    )}
                </div>
            </div>

            <div className="flex items-start gap-2 flex-shrink-0">
                <button
                    onClick={handleDelete}
                    className="delete-button p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100 hover:scale-110 active:scale-95"
                    title="Bildirimi Sil"
                >
                    <FaTimes className="text-sm" />
                </button>
            </div>
        </div>
    );
};

export default NotificationItem;
