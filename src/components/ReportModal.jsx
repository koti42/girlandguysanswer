import React, { useState } from 'react';
import { FaTimes, FaFlag, FaExclamationTriangle } from 'react-icons/fa';
import { reportsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const REPORT_REASONS = [
    { value: 'spam', label: 'Spam / Reklam' },
    { value: 'hate_speech', label: 'Nefret Söylemi' },
    { value: 'sexual_content', label: 'Cinsel İçerik' },
    { value: 'misinformation', label: 'Sahte Bilgi' },
    { value: 'harassment', label: 'Kişisel Hakaret' },
    { value: 'other', label: 'Diğer' },
];

const ReportModal = ({ isOpen, onClose, reportableType, reportableId, onSuccess }) => {
    const { isAuthenticated } = useAuth();
    const [selectedReason, setSelectedReason] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!isAuthenticated) {
            setError('Şikayet göndermek için giriş yapmalısınız.');
            return;
        }

        if (!selectedReason) {
            setError('Lütfen bir şikayet nedeni seçin.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            await reportsAPI.create({
                type: reportableType,
                target_id: reportableId,
                reason: selectedReason,
                description: description.trim() || null,
            });

            onSuccess?.();
            onClose();
            setSelectedReason('');
            setDescription('');
        } catch (err) {
            const message = err.response?.data?.message || 'Şikayet gönderilirken bir hata oluştu.';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setSelectedReason('');
        setDescription('');
        setError('');
        onClose();
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                <div
                    className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto animate-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                                <FaFlag className="text-red-500 text-lg" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">İçeriği Şikayet Et</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Bu içeriği neden şikayet ediyorsunuz?</p>
                            </div>
                        </div>
                        <button
                            onClick={handleClose}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                        >
                            <FaTimes className="text-gray-500" />
                        </button>
                    </div>

                    {/* Body */}
                    <form onSubmit={handleSubmit} className="p-5">
                        {/* Error Message */}
                        {error && (
                            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                                <FaExclamationTriangle />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Reason Selection */}
                        <div className="space-y-2 mb-4">
                            {REPORT_REASONS.map((reason) => (
                                <label
                                    key={reason.value}
                                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedReason === reason.value
                                            ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                        }`}
                                >
                                    <input
                                        type="radio"
                                        name="reason"
                                        value={reason.value}
                                        checked={selectedReason === reason.value}
                                        onChange={(e) => setSelectedReason(e.target.value)}
                                        className="w-4 h-4 text-red-500 border-gray-300 focus:ring-red-500"
                                    />
                                    <span className={`font-medium ${selectedReason === reason.value
                                            ? 'text-red-600 dark:text-red-400'
                                            : 'text-gray-700 dark:text-gray-300'
                                        }`}>
                                        {reason.label}
                                    </span>
                                </label>
                            ))}
                        </div>

                        {/* Description */}
                        <div className="mb-5">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Ek Açıklama (Opsiyonel)
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Daha fazla detay eklemek isterseniz..."
                                rows={3}
                                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={handleClose}
                                className="flex-1 py-3 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                İptal
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !selectedReason}
                                className="flex-1 py-3 px-4 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Gönderiliyor...
                                    </>
                                ) : (
                                    <>
                                        <FaFlag />
                                        Şikayet Et
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
};

export default ReportModal;
