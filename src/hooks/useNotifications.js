import { useState, useEffect, useCallback, useRef } from 'react';
import { notificationsAPI } from '../services/api';

/** Backend: NotificationController limit/per_page (max 100), page + offset */
const NOTIFICATIONS_PER_PAGE = 50;

function mergeNotificationLists(existing, incoming) {
    const seen = new Set(existing.map((n) => n.id));
    const merged = [...existing];
    for (const n of incoming) {
        if (n?.id != null && !seen.has(n.id)) {
            seen.add(n.id);
            merged.push(n);
        }
    }
    return merged;
}

function pickPaginationPayload(innerData, axiosData) {
    return (
        innerData?.pagination
        ?? innerData?.meta
        ?? axiosData?.meta
        ?? axiosData?.pagination
        ?? null
    );
}

function resolveHasMore(innerData, axiosData, batchLength, requestedPerPage) {
    if (batchLength === 0) return false;

    const p = pickPaginationPayload(innerData, axiosData);
    if (p && typeof p === 'object') {
        const cur = p.current_page ?? p.currentPage ?? 1;
        const last = p.last_page ?? p.lastPage ?? p.total_pages;
        if (typeof last === 'number' && typeof cur === 'number' && last >= 1) {
            return cur < last;
        }
        const total = p.total;
        const per = p.per_page ?? p.perPage ?? requestedPerPage;
        if (typeof total === 'number' && typeof per === 'number' && per > 0) {
            const curPage = p.current_page ?? p.currentPage ?? 1;
            return (curPage - 1) * per + batchLength < total;
        }
    }

    return batchLength >= requestedPerPage;
}

const useNotifications = (autoRefresh = true, refreshInterval = 10000, enableSound = true) => {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState(null);
    const lastFetchTime = useRef(Date.now());
    const isFetchingRef = useRef(false);
    const lastPageFetchedRef = useRef(1);
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
        } catch {
            // ses çalınamıyorsa (izin yok / otomatik oynatma engeli) vazgeç
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
            } catch {
                // tarayıcı bildirimi kurulamadıysa uygulama içi liste yeterli
            }
        }
    }, []);

    const fetchNotifications = useCallback(async (unreadOnly = false, silent = false, opts = {}) => {
        const { page = 1, append = false } = opts;
        if (isFetchingRef.current) return;
        // Misafirde (token yok) istek atma: her sayfada ve her odaklanmada konsola 401 düşüyordu.
        let hasToken = false;
        try {
            hasToken = Boolean(localStorage.getItem('token'));
        } catch {
            hasToken = false;
        }
        if (!hasToken) return;

        isFetchingRef.current = true;
        if (!silent && !append) setLoading(true);
        if (append) setLoadingMore(true);
        setError(null);

        try {
            const params = {
                limit: NOTIFICATIONS_PER_PAGE,
                page,
            };

            if (unreadOnly) params.unread_only = true;

            const response = await notificationsAPI.getAll(params);
            const data = response.data.data || {};

            const newNotifications = data.notifications || [];
            const newUnreadCount = data.unread_count ?? 0;

            if (!append && previousUnreadCount.current > 0 && newUnreadCount > previousUnreadCount.current) {
                const latestNotification = newNotifications.find((n) => !n.is_read);
                if (latestNotification) {
                    playNotificationSound();
                    showBrowserNotification(latestNotification);
                }
            }

            if (append) {
                setNotifications((prev) => mergeNotificationLists(prev, newNotifications));
            } else {
                setNotifications(newNotifications);
            }
            setUnreadCount(newUnreadCount);
            if (!append) {
                previousUnreadCount.current = newUnreadCount;
            }
            lastPageFetchedRef.current = page;
            if (append && newNotifications.length === 0) {
                setHasMore(false);
            } else {
                setHasMore(resolveHasMore(data, response.data, newNotifications.length, NOTIFICATIONS_PER_PAGE));
            }
            lastFetchTime.current = Date.now();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
            setLoadingMore(false);
            isFetchingRef.current = false;
        }
    }, [playNotificationSound, showBrowserNotification]);

    const loadMoreNotifications = useCallback(async () => {
        if (!hasMore || loadingMore || isFetchingRef.current) return;
        await fetchNotifications(false, true, { page: lastPageFetchedRef.current + 1, append: true });
    }, [hasMore, loadingMore, fetchNotifications]);

    const markAsRead = useCallback(async (notificationId) => {
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
    }, []);

    const markAllAsRead = useCallback(async () => {
        await notificationsAPI.markAllAsRead();

        setNotifications(prev =>
            prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
        );
        setUnreadCount(0);

        localStorage.setItem('notifications_update', Date.now().toString());
    }, []);

    const deleteNotification = useCallback(async (notificationId) => {
        await notificationsAPI.delete(notificationId);

        const notification = notifications.find(n => n.id === notificationId);
        setNotifications(prev => prev.filter(n => n.id !== notificationId));

        if (notification && !notification.is_read) {
            setUnreadCount(prev => Math.max(0, prev - 1));
        }

        localStorage.setItem('notifications_update', Date.now().toString());
    }, [notifications]);

    const deleteAllNotifications = useCallback(async () => {
        await notificationsAPI.deleteAll();

        setNotifications([]);
        setUnreadCount(0);
        setHasMore(false);

        localStorage.setItem('notifications_update', Date.now().toString());
    }, []);

    const refresh = useCallback(() => {
        fetchNotifications(false, true);
    }, [fetchNotifications]);

    const requestNotificationPermission = useCallback(async () => {
        if ('Notification' in window && Notification.permission === 'default') {
            try {
                const permission = await Notification.requestPermission();
                return permission === 'granted';
            } catch {
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

    useEffect(() => {
        const handleRefresh = () => {
            fetchNotifications(false, true);
        };

        window.addEventListener('notification:refresh', handleRefresh);
        return () => window.removeEventListener('notification:refresh', handleRefresh);
    }, [fetchNotifications]);

    return {
        notifications,
        unreadCount,
        loading,
        loadingMore,
        hasMore,
        error,
        fetchNotifications,
        loadMoreNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        deleteAllNotifications,
        refresh,
        requestNotificationPermission,
    };
};

export default useNotifications;
