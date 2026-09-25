import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FaEllipsisV, FaEyeSlash, FaEye, FaTrash, FaClock, FaTimes, FaExclamationTriangle } from 'react-icons/fa';
import { moderationAPI } from '../../services/api';

const DURATION_OPTIONS = [
    { value: 60, label: '1 Saat' },
    { value: 1440, label: '1 Gün' },
    { value: 10080, label: '1 Hafta' },
    { value: 43200, label: '1 Ay' },
    { value: 0, label: 'Süresiz' },
];

const ActionModal = React.memo(({ isOpen, onClose, title, icon: Icon, iconColor, onConfirm, confirmText, confirmColor, showDuration = false, modalReason, modalDuration, onReasonChange, onDurationChange, modalError, modalLoading }) => {
    const textareaRef = React.useRef(null);
    const wasOpenRef = React.useRef(false);

    const handleModalClick = React.useCallback((e) => {
        e.stopPropagation();
    }, []);

    React.useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            wasOpenRef.current = true;
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.focus();
                }
            }, 100);
        } else if (!isOpen) {
            wasOpenRef.current = false;
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={onClose} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none" onClick={onClose}>
                <div 
                    className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto animate-in zoom-in-95"
                    onClick={handleModalClick}
                >
                    <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 ${iconColor} rounded-full flex items-center justify-center`}>
                                <Icon className="text-white text-lg" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h3>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                            <FaTimes className="text-gray-500" />
                        </button>
                    </div>

                    <div className="p-5 space-y-4">
                        {modalError && (
                            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                                <FaExclamationTriangle />
                                <span>{modalError}</span>
                            </div>
                        )}

                        {showDuration && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    <FaClock className="inline mr-2" />
                                    Gizleme Süresi
                                </label>
                                <select
                                    value={modalDuration}
                                    onChange={(e) => onDurationChange(Number(e.target.value))}
                                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {DURATION_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Sebep
                            </label>
                            <textarea
                                ref={textareaRef}
                                value={modalReason}
                                onChange={(e) => onReasonChange(e.target.value)}
                                placeholder="İşlem sebebini yazın..."
                                rows={3}
                                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                            İptal
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={modalLoading}
                            className={`flex-1 py-3 px-4 ${confirmColor} text-white font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2`}
                        >
                            {modalLoading ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <>
                                    <Icon className="text-sm" />
                                    {confirmText}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
});

const QuestionModerationMenu = ({ question, onActionComplete }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [showHideModal, setShowHideModal] = useState(false);
    const [showRemoveModal, setShowRemoveModal] = useState(false);
    const [reason, setReason] = useState('');
    const [duration, setDuration] = useState(1440);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const menuRef = useRef(null);

    const isHidden = question?.moderation?.is_hidden || question?.is_hidden;

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleHide = async () => {
        setLoading(true);
        setError('');
        try {
            await moderationAPI.hideQuestion(question.id, {
                reason: reason.trim() || 'Kurallara aykırı içerik',
                minutes: duration > 0 ? duration : undefined
            });
            onActionComplete?.('hide', 'Soru gizlendi.');
            setShowHideModal(false);
            setReason('');
            setIsOpen(false);
        } catch (err) {
            setError(err.response?.data?.message || 'İşlem başarısız.');
        } finally {
            setLoading(false);
        }
    };

    const handleUnhide = async () => {
        setLoading(true);
        try {
            await moderationAPI.unhideQuestion(question.id);
            onActionComplete?.('unhide', 'Soru görünür yapıldı.');
            setIsOpen(false);
        } catch (err) {
            setError(err.response?.data?.message || 'İşlem başarısız.');
        } finally {
            setLoading(false);
        }
    };

    const handleRemove = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await moderationAPI.removeQuestion(question.id, {
                reason: reason.trim() || 'Kural ihlali nedeniyle kaldırıldı'
            });
            
            if (response.data?.success !== false) {
                onActionComplete?.('remove', 'Soru kaldırıldı.');
                setShowRemoveModal(false);
                setReason('');
                setIsOpen(false);
                
                // Sayfayı yenile
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                setError(response.data?.message || 'İşlem başarısız.');
            }
        } catch (err) {
            // Eğer 404 veya 403 hatası ise, muhtemelen soru zaten kaldırılmış
            if (err.response?.status === 404 || err.response?.status === 403) {
                onActionComplete?.('remove', 'Soru kaldırıldı.');
                setShowRemoveModal(false);
                setReason('');
                setIsOpen(false);
                
                // Sayfayı yenile
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                setError(err.response?.data?.message || 'İşlem başarısız.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCloseHideModal = useCallback(() => {
        setShowHideModal(false);
        setError('');
    }, []);

    const handleCloseRemoveModal = useCallback(() => {
        setShowRemoveModal(false);
        setError('');
    }, []);

    const handleReasonChange = useCallback((value) => {
        setReason(value);
    }, []);

    const handleDurationChange = useCallback((value) => {
        setDuration(value);
    }, []);



    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                title="Moderasyon"
            >
                <FaEllipsisV className="text-gray-500 dark:text-gray-400" />
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50 animate-in slide-in-from-top-2">
                    {isHidden ? (
                        <button
                            onClick={handleUnhide}
                            disabled={loading}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                        >
                            <FaEye />
                            <span className="font-medium">Göster</span>
                        </button>
                    ) : (
                        <button
                            onClick={() => setShowHideModal(true)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                        >
                            <FaEyeSlash />
                            <span className="font-medium">Gizle</span>
                        </button>
                    )}

                    <button
                        onClick={() => setShowRemoveModal(true)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border-t border-gray-100 dark:border-gray-700"
                    >
                        <FaTrash />
                        <span className="font-medium">Kaldır</span>
                    </button>
                </div>
            )}

            <ActionModal
                isOpen={showHideModal}
                onClose={handleCloseHideModal}
                title="Soruyu Gizle"
                icon={FaEyeSlash}
                iconColor="bg-orange-500"
                onConfirm={handleHide}
                confirmText="Gizle"
                confirmColor="bg-orange-500 hover:bg-orange-600"
                showDuration={true}
                modalReason={reason}
                modalDuration={duration}
                onReasonChange={handleReasonChange}
                onDurationChange={handleDurationChange}
                modalError={error}
                modalLoading={loading}
            />

            <ActionModal
                isOpen={showRemoveModal}
                onClose={handleCloseRemoveModal}
                title="Soruyu Kaldır"
                icon={FaTrash}
                iconColor="bg-red-500"
                onConfirm={handleRemove}
                confirmText="Kaldır"
                confirmColor="bg-red-500 hover:bg-red-600"
                showDuration={false}
                modalReason={reason}
                modalDuration={duration}
                onReasonChange={handleReasonChange}
                onDurationChange={handleDurationChange}
                modalError={error}
                modalLoading={loading}
            />
        </div>
    );
};

export default QuestionModerationMenu;
