import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBell, FaCheckDouble, FaTrash, FaFilter, FaExclamationTriangle } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import { TrendsWidget, TopUsersWidget } from '../components/Widgets';
import NotificationItem from '../components/NotificationItem';
import useNotifications from '../hooks/useNotifications';
import Toast from '../components/Toast';

const NotificationsPage = () => {
    const navigate = useNavigate();
    const [filter, setFilter] = useState('all');
    const [toast, setToast] = useState({ show: false, message: '', type: 'error' });
    const {
        notifications,
        unreadCount,
        loading,
        loadingMore,
        hasMore,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        deleteAllNotifications,
        loadMoreNotifications,
    } = useNotifications(false);

    const showToast = (message, type = 'error') => {
        setToast({ show: true, message, type });
    };

    const handleNotificationClick = async (notification) => {
        if (!notification.is_read) {
            try {
                await markAsRead(notification.id);
            } catch (error) {
                if (error.response?.status === 403) {
                    const errorData = error.response?.data;
                    if (errorData?.type === 'frozen') {
                        showToast('Hesabınız donduruldu. Bildirimleri okumak için hesabınızın aktif olması gerekiyor.', 'error');
                    } else if (errorData?.type === 'banned') {
                        showToast('Hesabınız banlandı. Bildirimleri okumak için hesabınızın aktif olması gerekiyor.', 'error');
                    } else {
                        showToast('Bildirimi okundu olarak işaretleyemediniz. Hesabınızın durumunu kontrol edin.', 'error');
                    }
                } else {
                    showToast('Bildirimi okundu olarak işaretleyemediniz.', 'error');
                }
            }
        }

        const questionSlug = notification.data?.question_slug || notification.data?.slug;

        switch (notification.type) {
            case 'followed_user_question':
                if (questionSlug) navigate(`/question/${questionSlug}`);
                break;
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
            case 'follow_request_accepted': {
                const username = notification.data?.user?.username;
                if (username) {
                    navigate(`/profile/${username}`);
                }
                break;
            }
            case 'community_invitation': {
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
            }
            case 'game_duel_invite':
                // Oyun Merkezi düello daveti
                navigate(notification.data?.duel_id ? `/oyun/duello/${notification.data.duel_id}` : '/oyun/duello');
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

    const handleMarkAllAsRead = async () => {
        try {
            await markAllAsRead();
        } catch (error) {
            if (error.response?.status === 403) {
                const errorData = error.response?.data;
                if (errorData?.type === 'frozen') {
                    showToast('Hesabınız donduruldu. Bildirimleri okumak için hesabınızın aktif olması gerekiyor.', 'error');
                } else if (errorData?.type === 'banned') {
                    showToast('Hesabınız banlandı. Bildirimleri okumak için hesabınızın aktif olması gerekiyor.', 'error');
                } else {
                    showToast('Bildirimleri okundu olarak işaretleyemediniz. Hesabınızın durumunu kontrol edin.', 'error');
                }
            } else {
                showToast('Bildirimleri okundu olarak işaretleyemediniz.', 'error');
            }
        }
    };

    const handleDeleteAll = async () => {
        if (!window.confirm('Tüm bildirimleri silmek istediğinize emin misiniz?')) return;

        try {
            await deleteAllNotifications();
        } catch {
            // Failed to delete all
        }
    };

    const filteredNotifications = filter === 'unread'
        ? notifications.filter(n => !n.is_read)
        : notifications;

    return (
        <MainLayout sidebar={<><TrendsWidget /><TopUsersWidget /></>}>
            {toast.show && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast({ ...toast, show: false })}
                />
            )}
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-800/50 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6 mb-6 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-4">
                            <div className="relative p-3 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl shadow-lg">
                                <FaBell className="text-2xl text-white" />
                                {unreadCount > 0 && (
                                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                )}
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                                    Bildirimler
                                </h1>
                                {unreadCount > 0 ? (
                                    <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                                        {unreadCount} yeni bildirim var
                                    </p>
                                ) : (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        Tüm bildirimler okundu ✓
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                            {unreadCount > 0 && (
                                <button
                                    onClick={handleMarkAllAsRead}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all text-sm font-semibold shadow-md hover:shadow-lg active:scale-95"
                                    title="Tümünü Okundu İşaretle"
                                >
                                    <FaCheckDouble />
                                    <span className="hidden sm:inline">Tümünü İşaretle</span>
                                </button>
                            )}

                            {notifications.length > 0 && (
                                <button
                                    onClick={handleDeleteAll}
                                    className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all hover:scale-110 active:scale-95"
                                    title="Tümünü Sil"
                                >
                                    <FaTrash />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex gap-2 bg-gray-100 dark:bg-gray-700/50 p-1 rounded-xl">
                        <button
                            onClick={() => setFilter('all')}
                            className={`flex-1 py-2.5 px-4 rounded-lg font-semibold transition-all text-sm ${filter === 'all'
                                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-md'
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                }`}
                        >
                            Tümü <span className="text-xs opacity-75">({notifications.length})</span>
                        </button>
                        <button
                            onClick={() => setFilter('unread')}
                            className={`relative flex-1 py-2.5 px-4 rounded-lg font-semibold transition-all text-sm ${filter === 'unread'
                                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-md'
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                }`}
                        >
                            Okunmamış <span className="text-xs opacity-75">({unreadCount})</span>
                            {unreadCount > 0 && (
                                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Notifications List */}
                {loading ? (
                    <div className="flex justify-center p-10">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div>
                    </div>
                ) : filteredNotifications.length === 0 ? (
                    <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-800/50 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-16 text-center">
                        <div className="relative w-24 h-24 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                            <FaBell className="text-5xl text-gray-400 dark:text-gray-500" />
                            <div className="absolute inset-0 rounded-full border-4 border-dashed border-gray-200 dark:border-gray-600 animate-spin" style={{ animationDuration: '3s' }}></div>
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                            {filter === 'unread' ? '✨ Hepsi Okundu!' : '🔔 Henüz Bildirim Yok'}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                            {filter === 'unread'
                                ? 'Tebrikler! Tüm bildirimlerinizi okudunuz. Yeni bildirimler geldiğinde burada görünecek.'
                                : 'Şu anda hiç bildiriminiz yok. Yeni aktiviteler olduğunda burada görünecek.'}
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
                        {filter === 'all' && hasMore && (
                            <div className="flex justify-center pt-4">
                                <button
                                    type="button"
                                    onClick={() => loadMoreNotifications()}
                                    disabled={loadingMore}
                                    className="px-6 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                                >
                                    {loadingMore ? 'Yükleniyor…' : 'Daha fazla yükle'}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </MainLayout>
    );
};

export default NotificationsPage;
