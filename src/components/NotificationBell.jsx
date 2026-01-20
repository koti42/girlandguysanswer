import React, { useState, useRef, useEffect } from 'react';
import { FaBell } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import useNotifications from '../hooks/useNotifications';
import NotificationItem from './NotificationItem';

const NotificationBell = () => {
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const { notifications, unreadCount, markAsRead } = useNotifications(true, 10000);

    // Close dropdown when clicking outside
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
        console.log('🔔 Notification clicked:', notification);
        console.log('📌 Type:', notification.type);
        console.log('📦 Data:', notification.data);
        
        setIsOpen(false);

        // Mark as read
        if (!notification.is_read) {
            try {
                await markAsRead(notification.id);
            } catch (error) {
                console.error('Failed to mark as read:', error);
            }
        }

        // Navigate
        const questionSlug = notification.data?.question_slug || notification.data?.slug;
        
        switch (notification.type) {
            case 'answer_created':
                if (questionSlug) {
                    console.log('✅ Navigating to:', `/question/${questionSlug}`);
                    navigate(`/question/${questionSlug}`);
                } else {
                    console.error('❌ question_slug bulunamadı!', notification.data);
                }
                break;
            case 'answer_comment_created':
                if (questionSlug) {
                    const answerId = notification.data?.answer_id;
                    console.log('✅ Navigating to:', `/question/${questionSlug}#answer-${answerId}`);
                    navigate(`/question/${questionSlug}#answer-${answerId}`);
                } else {
                    console.error('❌ question_slug bulunamadı!', notification.data);
                }
                break;
            case 'comment_reply':
                if (questionSlug) {
                    const commentId = notification.data?.comment_id || notification.data?.id;
                    console.log('✅ Navigating to:', `/question/${questionSlug}#comment-${commentId}`);
                    navigate(`/question/${questionSlug}#comment-${commentId}`);
                } else {
                    console.error('❌ question_slug bulunamadı!', notification.data);
                }
                break;
            case 'follow_request':
                console.log('✅ Navigating to: /follow-requests');
                navigate('/follow-requests');
                break;
            case 'follow_request_accepted':
                const username = notification.data?.user?.username;
                if (username) {
                    console.log('✅ Navigating to:', `/profile/${username}`);
                    navigate(`/profile/${username}`);
                } else {
                    console.error('❌ username bulunamadı!', notification.data);
                }
                break;
            default:
                console.warn('⚠️ Bilinmeyen bildirim tipi:', notification.type);
                break;
        }
    };

    const recentNotifications = notifications.slice(0, 5);

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Icon Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
                <FaBell className="text-xl text-gray-700 dark:text-gray-300" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="font-bold text-gray-800 dark:text-white">Bildirimler</h3>
                        <button
                            onClick={() => {
                                setIsOpen(false);
                                navigate('/notifications');
                            }}
                            className="text-sm text-coral hover:underline font-medium"
                        >
                            Tümünü Gör
                        </button>
                    </div>

                    {/* Notifications List */}
                    <div className="max-h-96 overflow-y-auto">
                        {recentNotifications.length === 0 ? (
                            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                                <FaBell className="text-4xl mx-auto mb-2 opacity-50" />
                                <p className="text-sm">Henüz bildiriminiz yok</p>
                            </div>
                        ) : (
                            recentNotifications.map(notification => (
                                <NotificationItem
                                    key={notification.id}
                                    notification={notification}
                                    onClick={handleNotificationClick}
                                    compact={true}
                                />
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
