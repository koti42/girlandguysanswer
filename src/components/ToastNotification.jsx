import React from 'react';
import { FaCheckCircle, FaExclamationCircle, FaInfoCircle, FaTimes } from 'react-icons/fa';

const config = {
    success: {
        gradient: 'from-emerald-500 to-green-600',
        light: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
        icon: FaCheckCircle,
        iconColor: 'text-emerald-500',
        title: 'Başarılı',
    },
    error: {
        gradient: 'from-red-500 to-rose-600',
        light: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
        icon: FaExclamationCircle,
        iconColor: 'text-red-500',
        title: 'Hata',
    },
    warning: {
        gradient: 'from-amber-500 to-orange-500',
        light: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
        icon: FaExclamationCircle,
        iconColor: 'text-amber-500',
        title: 'Uyarı',
    },
    info: {
        gradient: 'from-blue-500 to-indigo-600',
        light: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
        icon: FaInfoCircle,
        iconColor: 'text-blue-500',
        title: 'Bilgi',
    },
};

const ToastNotification = ({ type = 'info', message, onClose }) => {
    const c = config[type] || config.info;
    const Icon = c.icon;

    return (
        <div
            className={`
                flex items-start gap-4 p-4 rounded-2xl shadow-xl border min-w-[320px] max-w-md
                bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700
                transition-all duration-300
            `}
        >
            <div className={`flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br ${c.gradient} flex items-center justify-center`}>
                <Icon className="text-white text-lg" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
                <p className="font-semibold text-gray-900 dark:text-white text-sm">{c.title}</p>
                <p className="text-gray-600 dark:text-gray-300 text-sm mt-0.5 leading-relaxed">{message}</p>
            </div>
            <button
                type="button"
                onClick={onClose}
                className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Kapat"
            >
                <FaTimes className="text-sm" />
            </button>
        </div>
    );
};

export default ToastNotification;
