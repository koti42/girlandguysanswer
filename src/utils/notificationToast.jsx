import React from 'react';
import toast from 'react-hot-toast';
import ToastNotification from '../components/ToastNotification';

const show = (type, message, options = {}) => {
    const duration = options.duration ?? (type === 'error' ? 5000 : 4000);
    return toast.custom(
        (t) => (
            <ToastNotification
                type={type}
                message={message}
                onClose={() => toast.dismiss(t.id)}
            />
        ),
        { duration, ...options }
    );
};

export const notificationToast = {
    success: (message, options) => show('success', message, options),
    error: (message, options) => show('error', message, options),
    warning: (message, options) => show('warning', message, options),
    info: (message, options) => show('info', message, options),
};
