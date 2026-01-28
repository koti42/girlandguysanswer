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
        if (isAuthenticated && user?.id) {
            console.log('🔌 NotificationService: Connecting to private channel...', user.id);


            echo.private(`user.${user.id}`)
                .listen('.notification.sent', (data) => {
                    console.log('🔔 Yeni Bildirim Geldi:', data);

                    const message = data.message || data.data?.message || 'Yeni bir bildiriminiz var';

                    setToast({
                        show: true,
                        message: message,
                        type: 'info' 
                    });

                    window.dispatchEvent(new Event('notification:refresh'));


                });

            return () => {
                console.log('🔌 NotificationService: Disconnecting...');
                echo.leave(`user.${user.id}`);
            };
        }
    }, [isAuthenticated, user]);

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
