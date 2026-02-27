import React from 'react';
import { createPortal } from 'react-dom';
import { FaExternalLinkAlt, FaShieldAlt, FaTimes, FaArrowLeft } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

export default function LinkRedirectModal({ url, onClose }) {
    const navigate = useNavigate();

    if (!url) return null;

    let displayUrl = url;
    let hostname = url;
    try {
        const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
        hostname = parsed.hostname.replace(/^www\./, '');
        displayUrl = parsed.href;
    } catch {
        displayUrl = url;
        hostname = url;
    }

    const handleGoToLink = () => {
        window.open(displayUrl, '_blank', 'noopener,noreferrer');
        onClose();
    };

    const handleCancel = () => {
        onClose();
        navigate('/');
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                            <FaShieldAlt className="text-yellow-500 text-sm" />
                        </div>
                        <span className="font-semibold text-gray-800 dark:text-white text-sm">Harici Bağlantı</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    >
                        <FaTimes className="text-sm" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-5 py-5">
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                        Aşağıdaki harici siteye yönlendirileceksiniz. Devam etmek istiyor musunuz?
                    </p>

                    {/* URL Preview Box */}
                    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/60 rounded-xl border border-gray-200 dark:border-gray-600 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <img
                                src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`}
                                alt=""
                                className="w-4 h-4"
                                onError={(e) => { e.target.style.display = 'none'; }}
                            />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">{hostname}</p>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{displayUrl}</p>
                        </div>
                        <FaExternalLinkAlt className="text-gray-400 text-xs flex-shrink-0" />
                    </div>

                    <p className="text-[11px] text-gray-400 dark:text-gray-500 px-1">
                        Bu site Herkesler Soruyor'a ait değildir. Dikkatli olun.
                    </p>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 px-5 pb-5">
                    <button
                        onClick={handleCancel}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        <FaArrowLeft className="text-xs" />
                        Ana Sayfaya Dön
                    </button>
                    <button
                        onClick={handleGoToLink}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors shadow-sm"
                    >
                        Devam Et
                        <FaExternalLinkAlt className="text-xs" />
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
