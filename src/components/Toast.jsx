import React, { useEffect } from 'react';
import { FaCheckCircle, FaExclamationCircle, FaInfoCircle, FaTimes } from 'react-icons/fa';

const Toast = ({ type = 'success', message, onClose, duration = 3000 }) => {
    useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(() => {
                onClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [duration, onClose]);

    const getConfig = () => {
        switch (type) {
            case 'success':
                return {
                    bgClass: 'bg-gradient-to-r from-green-500 to-emerald-500',
                    icon: <FaCheckCircle className="text-2xl" />,
                    title: 'Başarılı!'
                };
            case 'error':
                return {
                    bgClass: 'bg-gradient-to-r from-red-500 to-rose-500',
                    icon: <FaExclamationCircle className="text-2xl" />,
                    title: 'Hata!'
                };
            case 'warning':
                return {
                    bgClass: 'bg-gradient-to-r from-orange-500 to-amber-500',
                    icon: <FaExclamationCircle className="text-2xl" />,
                    title: 'Uyarı!'
                };
            case 'info':
                return {
                    bgClass: 'bg-gradient-to-r from-blue-500 to-cyan-500',
                    icon: <FaInfoCircle className="text-2xl" />,
                    title: 'Bilgi'
                };
            default:
                return {
                    bgClass: 'bg-gradient-to-r from-gray-500 to-slate-500',
                    icon: <FaInfoCircle className="text-2xl" />,
                    title: 'Bilgi'
                };
        }
    };

    const config = getConfig();

    return (
        <div className="fixed top-20 right-4 z-50 animate-slideInRight">
            <div className={`${config.bgClass} text-white rounded-2xl shadow-2xl p-4 pr-12 min-w-[320px] max-w-md`}>
                <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                        {config.icon}
                    </div>
                    <div className="flex-1">
                        <h4 className="font-bold text-lg mb-1">{config.title}</h4>
                        <p className="text-sm text-white/95">{message}</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-1.5 hover:bg-white/20 rounded-full transition-colors"
                >
                    <FaTimes className="text-sm" />
                </button>
            </div>
        </div>
    );
};

export default Toast;
