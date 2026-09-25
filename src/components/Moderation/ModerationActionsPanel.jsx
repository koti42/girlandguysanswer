import React, { useState, useCallback } from 'react';
import { FaBan, FaSnowflake, FaUnlock, FaFire, FaExclamationTriangle, FaTimes, FaClock } from 'react-icons/fa';
import { moderationAPI } from '../../services/api';

const DURATION_OPTIONS = [
    { value: 60, label: '1 Saat' },
    { value: 1440, label: '1 Gün' },
    { value: 10080, label: '1 Hafta' },
    { value: 43200, label: '1 Ay' },
    { value: 0, label: 'Süresiz' },
];

const ActionModal = React.memo(({ isOpen, onClose, title, icon: _Icon, iconColor, onConfirm, confirmText, confirmColor, modalReason, modalDuration, onReasonChange, onDurationChange, modalError, modalLoading }) => {
    const textareaRef = React.useRef(null);
    const wasOpenRef = React.useRef(false);

    const handleModalClick = React.useCallback((e) => {
        e.stopPropagation();
    }, []);

    const handleReasonChange = React.useCallback((e) => {
        onReasonChange(e.target.value);
    }, [onReasonChange]);

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
                    {/* Header */}
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

                    {/* Body */}
                    <div className="p-5 space-y-4">
                        {modalError && (
                            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                                <FaExclamationTriangle />
                                <span>{modalError}</span>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                <FaClock className="inline mr-2" />
                                Süre
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

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Sebep
                            </label>
                            <textarea
                                ref={textareaRef}
                                value={modalReason}
                                onChange={handleReasonChange}
                                placeholder="İşlem sebebini yazın..."
                                rows={3}
                                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            />
                        </div>
                    </div>

                    {/* Footer */}
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

const ModerationActionsPanel = ({ targetUser, onActionComplete }) => {
    const [showBanModal, setShowBanModal] = useState(false);
    const [showFreezeModal, setShowFreezeModal] = useState(false);
    const [reason, setReason] = useState('');
    const [duration, setDuration] = useState(1440);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const checkIsBanned = () => {
        if (targetUser?.accountStatus?.status === 'banned') {
            const until = targetUser.accountStatus.until;
            if (!until) return true; // Süresiz ban
            return new Date(until) > new Date(); 
        }
        const bannedAt = targetUser?.banned_at;
        if (!bannedAt) return false;
        const bannedUntil = targetUser?.banned_until;
        if (!bannedUntil) return true; // Süresiz ban
        const untilDate = new Date(bannedUntil);
        const now = new Date();
        return untilDate > now; 
    };
    const isBanned = checkIsBanned();
    
    const checkIsFrozen = () => {
        if (targetUser?.accountStatus?.status === 'frozen') {
            const until = targetUser.accountStatus.until;
            if (!until) return true; 
            return new Date(until) > new Date(); 
        }
        const frozenAt = targetUser?.frozen_at;
        if (!frozenAt) return false;
        const frozenUntil = targetUser?.frozen_until;
        if (!frozenUntil) return true;
        const untilDate = new Date(frozenUntil);
        const now = new Date();
        return untilDate > now; 
    };
    const isFrozen = checkIsFrozen();
    


    const handleBan = async () => {
        setLoading(true);
        setError('');
        try {
            await moderationAPI.banUser(targetUser.id, {
                reason: reason.trim() || 'Kurallara aykırı davranış',
                minutes: duration > 0 ? duration : undefined
            });
            onActionComplete?.('ban', 'Kullanıcı banlandı.');
            setShowBanModal(false);
            setReason('');
        } catch (err) {
            setError(err.response?.data?.message || 'İşlem başarısız.');
        } finally {
            setLoading(false);
        }
    };

    const handleUnban = async () => {
        setLoading(true);
        try {
            await moderationAPI.unbanUser(targetUser.id);
            onActionComplete?.('unban', 'Ban kaldırıldı.');
        } catch (err) {
            setError(err.response?.data?.message || 'İşlem başarısız.');
        } finally {
            setLoading(false);
        }
    };

    const handleFreeze = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await moderationAPI.freezeUser(targetUser.id, {
                reason: reason.trim() || 'İnceleme için donduruldu',
                minutes: duration > 0 ? duration : undefined
            });
            
            if (response.data?.success !== false) {
                onActionComplete?.('freeze', 'Kullanıcı donduruldu.');
                setShowFreezeModal(false);
                setReason('');
            } else {
                setError(response.data?.message || 'İşlem başarısız.');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'İşlem başarısız.');
        } finally {
            setLoading(false);
        }
    };

    const handleUnfreeze = async () => {
        setLoading(true);
        try {
            await moderationAPI.unfreezeUser(targetUser.id);
            onActionComplete?.('unfreeze', 'Dondurma kaldırıldı.');
        } catch (err) {
            setError(err.response?.data?.message || 'İşlem başarısız.');
        } finally {
            setLoading(false);
        }
    };

    const handleCloseBanModal = useCallback(() => {
        setShowBanModal(false);
        setError('');
    }, []);

    const handleCloseFreezeModal = useCallback(() => {
        setShowFreezeModal(false);
        setError('');
    }, []);

    const handleReasonChange = useCallback((value) => {
        setReason(value);
    }, []);

    const handleDurationChange = useCallback((value) => {
        setDuration(value);
    }, []);

    return (
        <div className="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/10 dark:to-orange-900/10 rounded-2xl p-5 border border-red-200 dark:border-red-800/50">
            <div className="flex items-center gap-2 mb-4">
                <FaExclamationTriangle className="text-red-500" />
                <h3 className="font-bold text-gray-900 dark:text-white">Moderasyon Aksiyonları</h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {/* Ban/Unban */}
                {isBanned ? (
                    <button
                        onClick={handleUnban}
                        disabled={loading}
                        className="flex items-center justify-center gap-2 py-3 px-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
                    >
                        <FaUnlock />
                        Ban Kaldır
                    </button>
                ) : (
                    <button
                        onClick={() => setShowBanModal(true)}
                        className="flex items-center justify-center gap-2 py-3 px-4 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors"
                    >
                        <FaBan />
                        Banla
                    </button>
                )}

                {/* Freeze/Unfreeze */}
                {isFrozen ? (
                    <button
                        onClick={handleUnfreeze}
                        disabled={loading}
                        className="flex items-center justify-center gap-2 py-3 px-4 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
                    >
                        <FaFire />
                        Çöz
                    </button>
                ) : (
                    <button
                        onClick={() => setShowFreezeModal(true)}
                        className="flex items-center justify-center gap-2 py-3 px-4 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors"
                    >
                        <FaSnowflake />
                        Dondur
                    </button>
                )}
            </div>

            {/* Status Indicators */}
            {(isBanned || isFrozen) && (
                <div className="mt-4 space-y-2">
                    {isBanned && (
                        <div className="flex items-center gap-2 p-3 bg-red-100 dark:bg-red-900/30 rounded-xl text-red-600 dark:text-red-400 text-sm">
                            <FaBan />
                            <span>Bu kullanıcı şu an <strong>banlı</strong></span>
                            {(targetUser.accountStatus?.until || targetUser.banned_until) && (
                                <span className="ml-auto text-xs">
                                    {new Date(targetUser.accountStatus?.until || targetUser.banned_until).toLocaleString('tr-TR')}
                                </span>
                            )}
                        </div>
                    )}
                    {isFrozen && (
                        <div className="flex items-center gap-2 p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400 text-sm">
                            <FaSnowflake />
                            <span>Bu kullanıcı şu an <strong>donmuş</strong></span>
                            {(targetUser.accountStatus?.until || targetUser.frozen_until) && (
                                <span className="ml-auto text-xs">
                                    {new Date(targetUser.accountStatus?.until || targetUser.frozen_until).toLocaleString('tr-TR')}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Modals */}
    <ActionModal
        isOpen={showBanModal}
        onClose={handleCloseBanModal}
        title="Kullanıcıyı Banla"
        icon={FaBan}
        iconColor="bg-red-500"
        onConfirm={handleBan}
        confirmText="Banla"
        confirmColor="bg-red-500 hover:bg-red-600"
        modalReason={reason}
        modalDuration={duration}
        onReasonChange={handleReasonChange}
        onDurationChange={handleDurationChange}
        modalError={error}
        modalLoading={loading}
    />

    <ActionModal
        isOpen={showFreezeModal}
        onClose={handleCloseFreezeModal}
        title="Kullanıcıyı Dondur"
        icon={FaSnowflake}
        iconColor="bg-blue-500"
        onConfirm={handleFreeze}
        confirmText="Dondur"
        confirmColor="bg-blue-500 hover:bg-blue-600"
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

export default ModerationActionsPanel;
