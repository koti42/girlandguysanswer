import React, { useState, useRef, useEffect } from 'react';
import { FaBell, FaCheckDouble } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import useNotifications from '../hooks/useNotifications';
import NotificationItem from './NotificationItem';

const NotificationBell = () => {
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications(false);

    const handleMarkAllRead = async () => {
        try {
            await markAllAsRead();
            setIsOpen(false);
        } catch (error) {
        }
    };




    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleNotificationClick = async (notification) => {
        setIsOpen(false);

        if (!notification.is_read) {
            try {
                await markAsRead(notification.id);
            } catch (error) {
            }
        }

        const questionSlug = notification.data?.question_slug || notification.data?.slug;

        switch (notification.type) {
            case 'answer_created':
                if (questionSlug) {
                    const answerId = notification.data?.answer_id;
                    navigate(answerId ? `/question/${questionSlug}#answer-${answerId}` : `/question/${questionSlug}`);
                }
                break;
            case 'best_answer_selected':
                if (questionSlug) {
                    const answerId = notification.data?.answer_id;
                    navigate(answerId ? `/question/${questionSlug}#answer-${answerId}` : `/question/${questionSlug}`);
                }
                break;
            case 'answer_comment_created':
                if (questionSlug) {
                    const answerId = notification.data?.answer_id;
                    navigate(`/question/${questionSlug}#answer-${answerId}`);
                }
                break;
            case 'comment_reply':
                if (questionSlug) {
                    const commentId = notification.data?.comment_id || notification.data?.id;
                    navigate(`/question/${questionSlug}#comment-${commentId}`);
                }
                break;
            case 'follow_request':
                navigate('/follow-requests');
                break;
            case 'follow_request_accepted':
                const username = notification.data?.user?.username;
                if (username) {
                    navigate(`/profile/${username}`);
                }
                break;
            case 'new_message':
                const senderUsername = notification.data?.sender_username || notification.data?.user?.username || notification.data?.sender?.username;
                if (senderUsername) {
                    navigate(`/messages/${senderUsername}`);
                }
                break;
            case 'community_invitation':
                const invitationId = notification.data?.invitation_id;
                const communityUuid = notification.data?.community_uuid || notification.data?.community_id;
                if (invitationId) {
                    navigate('/community-invitations');
                } else if (communityUuid) {
                    navigate(`/community/${communityUuid}`);
                } else {
                    navigate('/community-invitations');
                }
                break;
            case 'mention':
                if (notification.data?.question_slug) {
                    const ansId = notification.data?.answer_id;
                    navigate(ansId ? `/question/${notification.data.question_slug}#answer-${ansId}` : `/question/${notification.data.question_slug}`);
                } else if (notification.data?.opinion_slug) {
                    navigate(`/opinion/${notification.data.opinion_slug}`);
                }
                break;
            default:
                break;
        }
    };

    const recentNotifications = notifications.slice(0, 5);

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Icon Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-95"
            >
                <FaBell className={`text-xl text-gray-700 dark:text-gray-300 transition-transform ${unreadCount > 0 ? 'animate-pulse' : ''}`} />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-bounce shadow-lg">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    ></div>

                    {/* Dropdown */}
                    <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50 animate-in slide-in-from-top-2 duration-200">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2">
                                <FaBell className="text-blue-600 dark:text-blue-400" />
                                <h3 className="font-bold text-gray-900 dark:text-white">Bildirimler</h3>
                                {unreadCount > 0 && (
                                    <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
                                        {unreadCount}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    navigate('/notifications');
                                }}
                                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold flex items-center gap-1 hover:gap-2 transition-all"
                            >
                                Tümünü Gör
                                <span>→</span>
                            </button>
                        </div>

                        {/* Notifications List */}
                        <div className="max-h-[28rem] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                            {recentNotifications.length === 0 ? (
                                <div className="p-12 text-center">
                                    <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <FaBell className="text-3xl text-gray-400 dark:text-gray-500" />
                                    </div>
                                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Henüz bildiriminiz yok</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Yeni aktiviteler burada görünecek</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {recentNotifications.map(notification => (
                                        <NotificationItem
                                            key={notification.id}
                                            notification={notification}
                                            onClick={handleNotificationClick}
                                            compact={true}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        {recentNotifications.length > 0 && (
                            <div className="p-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
                                <button
                                    onClick={handleMarkAllRead}
                                    className="w-full py-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <FaCheckDouble className="text-xs" />
                                    Tümünü Okundu Olarak İşaretle
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default NotificationBell;
