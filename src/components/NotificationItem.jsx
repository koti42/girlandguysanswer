import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { FaComment, FaReply, FaUserPlus, FaCheckCircle, FaTimes } from 'react-icons/fa';
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
                className={`flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors ${!notification.is_read ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                    }`}
            >
                <div className="relative flex-shrink-0">
                    <UserAvatar
                        user={notification.data.user}
                        size="sm"
                        className="w-10 h-10"
                    />
                    <div className="absolute -bottom-1 -right-1 bg-white dark:bg-gray-800 rounded-full p-0.5">
                        {getNotificationIcon(notification.type)}
                    </div>
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2">
                        {notification.data.message}
                    </p>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(notification.created_at)}
                    </span>
                </div>

                {!notification.is_read && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                )}
            </div>
        );
    }

    return (
        <div
            onClick={handleClick}
            className={`flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer ${!notification.is_read
                    ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 hover:shadow-md'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
        >
            <div className="relative flex-shrink-0">
                <UserAvatar
                    user={notification.data.user}
                    size="md"
                    className="w-12 h-12"
                />
                <div className="absolute -bottom-1 -right-1 bg-white dark:bg-gray-800 rounded-full p-1 border-2 border-white dark:border-gray-800">
                    {getNotificationIcon(notification.type)}
                </div>
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
                    {notification.data.message}
                </p>

                {notification.data.question_title && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1 mb-2">
                        "{notification.data.question_title}"
                    </p>
                )}

                <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(notification.created_at)}
                </span>
            </div>

            <div className="flex items-center gap-2">
                {!notification.is_read && (
                    <div className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
                )}

                <button
                    onClick={handleDelete}
                    className="delete-button p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Bildirimi Sil"
                >
                    <FaTimes />
                </button>
            </div>
        </div>
    );
};

export default NotificationItem;
