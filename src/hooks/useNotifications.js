import { useState, useEffect, useCallback, useRef } from 'react';
import { notificationsAPI } from '../services/api';

const useNotifications = (autoRefresh = true, refreshInterval = 10000, enableSound = true) => {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const lastFetchTime = useRef(Date.now());
    const isFetchingRef = useRef(false);
    const previousUnreadCount = useRef(0);
    const audioRef = useRef(null);

    const playNotificationSound = useCallback(() => {
        if (!enableSound) return;

        try {
            if (!audioRef.current) {
                audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjtS4+/XiSUFIHHH8N2UQAoUXbPo7aJYFAg+m9vvwHAiAytT3u3YjCYEHG/D7d6XQAkSW6/l6qRcFAg6ltjuxnQiAytT3+/ZiCQEGm7C7N+XQAkRWrHm6aJeEgg7ldbuvnQjAitS3+/Xhi==');
            }
            audioRef.current.volume = 0.3;
            audioRef.current.play().catch(() => { });
        } catch (err) {
        }
    }, [enableSound]);

    const showBrowserNotification = useCallback((notification) => {
        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                const d = notification.data;
                const isNewMessage = notification.type === 'new_message';
                const title = isNewMessage && d?.sender_username
                    ? `${d.sender_username}'den mesaj`
                    : 'Yeni Bildirim';
                const body = isNewMessage && d?.sender_username
                    ? (d.message || 'Yeni mesaj')
                    : (d?.message || 'Yeni bir bildiriminiz var');
                const icon = d?.sender_avatar || d?.user?.avatar || '/vite.svg';
                const notif = new Notification(title, {
                    body,
                    icon,
                    badge: '/vite.svg',
                    tag: notification.id,
                    requireInteraction: false,
                    silent: false
                });

                notif.onclick = () => {
                    window.focus();
                    notif.close();
                };

                setTimeout(() => notif.close(), 5000);
            } catch (err) {
            }
        }
    }, []);

    const fetchNotifications = useCallback(async (unreadOnly = false, silent = false) => {
        if (isFetchingRef.current) return;

        isFetchingRef.current = true;
        if (!silent) setLoading(true);
        setError(null);

        try {
            const params = {};
            if (unreadOnly) params.unread_only = true;

            const response = await notificationsAPI.getAll(params);
            const data = response.data.data;

            const newNotifications = data.notifications || [];
            const newUnreadCount = data.unread_count || 0;

            if (previousUnreadCount.current > 0 && newUnreadCount > previousUnreadCount.current) {
                const latestNotification = newNotifications.find(n => !n.is_read);
                if (latestNotification) {
                    playNotificationSound();
                    showBrowserNotification(latestNotification);
                }
            }

            setNotifications(newNotifications);
            setUnreadCount(newUnreadCount);
            previousUnreadCount.current = newUnreadCount;
            lastFetchTime.current = Date.now();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
            isFetchingRef.current = false;
        }
    }, [playNotificationSound, showBrowserNotification]);

    const markAsRead = useCallback(async (notificationId) => {
        try {
            await notificationsAPI.markAsRead(notificationId);

            setNotifications(prev =>
                prev.map(n =>
                    n.id === notificationId
                        ? { ...n, is_read: true, read_at: new Date().toISOString() }
                        : n
                )
            );
            setUnreadCount(prev => Math.max(0, prev - 1));

            localStorage.setItem('notifications_update', Date.now().toString());
        } catch (err) {
            throw err;
        }
    }, []);

    const markAllAsRead = useCallback(async () => {
        try {
            await notificationsAPI.markAllAsRead();

            setNotifications(prev =>
                prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
            );
            setUnreadCount(0);

            localStorage.setItem('notifications_update', Date.now().toString());
        } catch (err) {
            throw err;
        }
    }, []);

    const deleteNotification = useCallback(async (notificationId) => {
        try {
            await notificationsAPI.delete(notificationId);

            const notification = notifications.find(n => n.id === notificationId);
            setNotifications(prev => prev.filter(n => n.id !== notificationId));

            if (notification && !notification.is_read) {
                setUnreadCount(prev => Math.max(0, prev - 1));
            }

            localStorage.setItem('notifications_update', Date.now().toString());
        } catch (err) {
            throw err;
        }
    }, [notifications]);

    const deleteAllNotifications = useCallback(async () => {
        try {
            await notificationsAPI.deleteAll();

            setNotifications([]);
            setUnreadCount(0);

            localStorage.setItem('notifications_update', Date.now().toString());
        } catch (err) {
            throw err;
        }
    }, []);

    const refresh = useCallback(() => {
        fetchNotifications(false, true);
    }, [fetchNotifications]);

    const requestNotificationPermission = useCallback(async () => {
        if ('Notification' in window && Notification.permission === 'default') {
            try {
                const permission = await Notification.requestPermission();
                return permission === 'granted';
            } catch (err) {
                return false;
            }
        }
        return Notification.permission === 'granted';
    }, []);

    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            fetchNotifications(false, true);
        }, refreshInterval);

        return () => clearInterval(interval);
    }, [autoRefresh, refreshInterval, fetchNotifications]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                const timeSinceLastFetch = Date.now() - lastFetchTime.current;
                if (timeSinceLastFetch > 5000) {
                    fetchNotifications(false, true);
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [fetchNotifications]);

    useEffect(() => {
        const handleFocus = () => {
            const timeSinceLastFetch = Date.now() - lastFetchTime.current;
            if (timeSinceLastFetch > 5000) {
                fetchNotifications(false, true);
            }
        };

        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [fetchNotifications]);

    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === 'notifications_update') {
                fetchNotifications(false, true);
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [fetchNotifications]);

    // Listen for Pusher/Global refresh events
    useEffect(() => {
        const handleRefresh = () => {
            fetchNotifications(false, true); // Silent fetch
        };

        window.addEventListener('notification:refresh', handleRefresh);
        return () => window.removeEventListener('notification:refresh', handleRefresh);
    }, [fetchNotifications]);

    return {
        notifications,
        unreadCount,
        loading,
        error,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        deleteAllNotifications,
        refresh,
        requestNotificationPermission,
    };
};

export default useNotifications;
