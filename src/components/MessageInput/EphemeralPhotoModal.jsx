import React from 'react';
import { FaImage } from 'react-icons/fa';

export default function EphemeralPhotoModal({
    isOpen,
    chosenOption,
    onChooseOption,
    onOpenPhotoPicker,
    onClose,
}) {
    if (!isOpen) return null;

    return (
        <>
            <div
                className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
                onClick={onClose}
                aria-hidden="true"
            />
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
                <div
                    className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="p-6">
                        <div className="flex items-center justify-center w-12 h-12 mx-auto bg-pink-100 dark:bg-pink-900/30 rounded-full mb-4">
                            <FaImage className="text-xl text-pink-600 dark:text-pink-400" />
                        </div>
                        <h3 className="text-lg font-bold text-center text-gray-900 dark:text-gray-100 mb-2">
                            Fotoğraf gönder
                        </h3>
                        <p className="text-sm text-center text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                            {chosenOption == null
                                ? 'Önce nasıl göndermek istediğini seç, sonra fotoğrafı seç.'
                                : 'Seçimin hazır. Aşağıdan fotoğrafı seç.'}
                        </p>
                        <div className="space-y-2 mb-4">
                            <button
                                type="button"
                                onClick={() => onChooseOption('normal')}
                                className={`w-full px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${chosenOption === 'normal'
                                    ? 'border-coral bg-coral/10 text-coral dark:bg-coral/20 dark:text-coral'
                                    : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                    }`}
                            >
                                Normal fotoğraf
                            </button>
                            <button
                                type="button"
                                onClick={() => onChooseOption('one')}
                                className={`w-full px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${chosenOption === 'one'
                                    ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400'
                                    : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                    }`}
                            >
                                Tek bakmalık (1 görüntüleme, 10 sn)
                            </button>
                            <button
                                type="button"
                                onClick={() => onChooseOption('two')}
                                className={`w-full px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${chosenOption === 'two'
                                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                                    : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                    }`}
                            >
                                İki bakmalık (2 görüntüleme, her biri 10 sn)
                            </button>
                        </div>
                        {chosenOption != null && (
                            <div className="mb-4 pt-3 border-t border-gray-200 dark:border-gray-600">
                                <button
                                    type="button"
                                    onClick={onOpenPhotoPicker}
                                    className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-coral to-orange-400 text-white text-sm font-semibold shadow-lg hover:shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                >
                                    <FaImage className="text-base" />
                                    Fotoğraf seç
                                </button>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition-colors"
                        >
                            Vazgeç
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
