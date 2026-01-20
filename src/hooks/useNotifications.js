import { useState, useEffect, useCallback } from 'react';
import { notificationsAPI } from '../services/api';

const useNotifications = (autoRefresh = true, refreshInterval = 30000) => {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchNotifications = useCallback(async (unreadOnly = false) => {
        setLoading(true);
        setError(null);

        try {
            const params = {};
            if (unreadOnly) params.unread_only = true;

            const response = await notificationsAPI.getAll(params);
            const data = response.data.data;

            setNotifications(data.notifications || []);
            setUnreadCount(data.unread_count || 0);
        } catch (err) {
            console.error('Bildirimler yüklenemedi:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const markAsRead = useCallback(async (notificationId) => {
        try {
            await notificationsAPI.markAsRead(notificationId);

            // Optimistic update
            setNotifications(prev =>
                prev.map(n =>
                    n.id === notificationId
                        ? { ...n, is_read: true, read_at: new Date().toISOString() }
                        : n
                )
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (err) {
            console.error('Bildirim işaretlenemedi:', err);
            throw err;
        }
    }, []);

    const markAllAsRead = useCallback(async () => {
        try {
            await notificationsAPI.markAllAsRead();

            // Optimistic update
            setNotifications(prev =>
                prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
            );
            setUnreadCount(0);
        } catch (err) {
            console.error('Bildirimler işaretlenemedi:', err);
            throw err;
        }
    }, []);

    const deleteNotification = useCallback(async (notificationId) => {
        try {
            await notificationsAPI.delete(notificationId);

            // Optimistic update
            const notification = notifications.find(n => n.id === notificationId);
            setNotifications(prev => prev.filter(n => n.id !== notificationId));

            if (notification && !notification.is_read) {
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
        } catch (err) {
            console.error('Bildirim silinemedi:', err);
            throw err;
        }
    }, [notifications]);

    const deleteAllNotifications = useCallback(async () => {
        try {
            await notificationsAPI.deleteAll();

            // Clear all
            setNotifications([]);
            setUnreadCount(0);
        } catch (err) {
            console.error('Bildirimler silinemedi:', err);
            throw err;
        }
    }, []);

    const refresh = useCallback(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    // Initial fetch
    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    // Auto-refresh
    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            fetchNotifications();
        }, refreshInterval);

        return () => clearInterval(interval);
    }, [autoRefresh, refreshInterval, fetchNotifications]);

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
    };
};

export default useNotifications;
