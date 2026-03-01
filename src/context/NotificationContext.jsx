import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { echo } from '../services/echo';
import Toast from '../components/Toast';

const NotificationContext = createContext();

export const useNotification = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
    const { user, isAuthenticated } = useAuth();
    const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

    useEffect(() => {
        if (!isAuthenticated || !user?.id) return;

        const channelName = `user.${user.id}`;

        const showToastAndRefresh = (message) => {
            setToast({ show: true, message, type: 'info' });
            window.dispatchEvent(new Event('notification:refresh'));
        };

        const privateChannel = echo.private(channelName);
        privateChannel.listen('.notification.sent', (data) => {
            const msg = data?.message ?? data?.data?.message ?? 'Yeni bir bildiriminiz var';
            showToastAndRefresh(msg);
        });
        privateChannel.listen('notification', (data) => {
            const msg = data?.type === 'new_message' && data?.title
                ? `${data.title}: ${data.message || 'Yeni mesaj'}`
                : (data?.message || 'Yeni mesaj');
            showToastAndRefresh(msg);
        });

        return () => {
            echo.leave(channelName);
        };
    }, [isAuthenticated, user?.id]);

    return (
        <NotificationContext.Provider value={{}}>
            {children}
            {toast.show && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast({ ...toast, show: false })}
                />
            )}
        </NotificationContext.Provider>
    );
};
