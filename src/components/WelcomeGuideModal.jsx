import React from 'react';
import { FaBook, FaTimes } from 'react-icons/fa';

const WelcomeGuideModal = ({ isOpen, onClose, onGoToGuide }) => {
    if (!isOpen) return null;

    const handleGoToGuide = () => {
        onGoToGuide();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
                aria-hidden="true"
            />
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Kapat"
                >
                    <FaTimes className="text-lg" />
                </button>
                <div className="p-6 pt-10">
                    <div className="flex justify-center w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-coral to-orange-400 rounded-full items-center">
                        <FaBook className="text-2xl text-white" />
                    </div>
                    <h2 className="text-xl font-bold text-center text-gray-900 dark:text-white mb-2">
                        Hoş geldiniz!
                    </h2>
                    <p className="text-sm text-center text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                        Sitede soru sormaktan mesajlaşmaya, cevap ve yorum yazmaya kadar tüm adımları anlatan bir kullanım kılavuzumuz var. İsterseniz hemen inceleyebilir veya daha sonra menüden &quot;Kullanım Kılavuzu&quot; linkine tıklayarak ulaşabilirsiniz.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            type="button"
                            onClick={handleGoToGuide}
                            className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-coral to-orange-400 rounded-xl hover:shadow-lg transition-all"
                        >
                            Kılavuza git
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                            Şimdi kapat
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WelcomeGuideModal;
