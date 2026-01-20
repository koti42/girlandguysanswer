import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBell, FaCheckDouble, FaTrash, FaFilter } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import { TrendsWidget, TopUsersWidget } from '../components/Widgets';
import NotificationItem from '../components/NotificationItem';
import useNotifications from '../hooks/useNotifications';

const NotificationsPage = () => {
    const navigate = useNavigate();
    const [filter, setFilter] = useState('all'); 
    const {
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        deleteAllNotifications,
    } = useNotifications();

    const handleNotificationClick = async (notification) => {
        console.log('🔔 Notification clicked:', notification);
        console.log('📌 Type:', notification.type);
        console.log('📦 Data:', notification.data);
        
        if (!notification.is_read) {
            try {
                await markAsRead(notification.id);
            } catch (error) {
                console.error('Failed to mark as read:', error);
            }
        }

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

    const handleMarkAllAsRead = async () => {
        try {
            await markAllAsRead();
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    };

    const handleDeleteAll = async () => {
        if (!window.confirm('Tüm bildirimleri silmek istediğinize emin misiniz?')) return;

        try {
            await deleteAllNotifications();
        } catch (error) {
            console.error('Failed to delete all:', error);
        }
    };

    const filteredNotifications = filter === 'unread'
        ? notifications.filter(n => !n.is_read)
        : notifications;

    return (
        <MainLayout sidebar={<><TrendsWidget /><TopUsersWidget /></>}>
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                                <FaBell className="text-2xl text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
                                    Bildirimler
                                </h1>
                                {unreadCount > 0 && (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        {unreadCount} okunmamış bildirim
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                            {unreadCount > 0 && (
                                <button
                                    onClick={handleMarkAllAsRead}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-xl hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors text-sm font-medium"
                                    title="Tümünü Okundu İşaretle"
                                >
                                    <FaCheckDouble />
                                    <span className="hidden sm:inline">Tümünü Okundu İşaretle</span>
                                </button>
                            )}

                            {notifications.length > 0 && (
                                <button
                                    onClick={handleDeleteAll}
                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                                    title="Tümünü Sil"
                                >
                                    <FaTrash />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => setFilter('all')}
                            className={`flex-1 py-2 px-4 rounded-xl font-medium transition-all text-sm ${filter === 'all'
                                    ? 'bg-coral text-white shadow-md'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                        >
                            Tümü ({notifications.length})
                        </button>
                        <button
                            onClick={() => setFilter('unread')}
                            className={`flex-1 py-2 px-4 rounded-xl font-medium transition-all text-sm ${filter === 'unread'
                                    ? 'bg-coral text-white shadow-md'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                        >
                            Okunmamış ({unreadCount})
                        </button>
                    </div>
                </div>

                {/* Notifications List */}
                {loading ? (
                    <div className="flex justify-center p-10">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div>
                    </div>
                ) : filteredNotifications.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-12 text-center">
                        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FaBell className="text-4xl text-gray-400" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
                            {filter === 'unread' ? 'Okunmamış Bildirim Yok' : 'Henüz Bildiriminiz Yok'}
                        </h3>
                        <p className="text-gray-500 dark:text-gray-400">
                            {filter === 'unread'
                                ? 'Tüm bildirimlerinizi okudunuz.'
                                : 'Yeni bildirimler burada görünecek.'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredNotifications.map(notification => (
                            <NotificationItem
                                key={notification.id}
                                notification={notification}
                                onClick={handleNotificationClick}
                                onDelete={deleteNotification}
                            />
                        ))}
                    </div>
                )}
            </div>
        </MainLayout>
    );
};

export default NotificationsPage;
