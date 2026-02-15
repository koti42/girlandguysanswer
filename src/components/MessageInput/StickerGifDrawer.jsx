import React from 'react';
import { FaSmile, FaGift } from 'react-icons/fa';
import { STICKER_URLS } from './constants';

export default function StickerGifDrawer({
    isOpen,
    activeTab,
    onTabChange,
    onCloseDrawer,
    onOpenGifPicker,
    onSendMessage,
}) {
    if (!isOpen) return null;

    return (
        <div className="mb-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/90 overflow-hidden" style={{ maxHeight: '260px' }}>
            <div className="flex border-b border-gray-200 dark:border-gray-700">
                <button
                    type="button"
                    onClick={() => onTabChange('stickers')}
                    className={`flex-1 py-2 px-3 text-sm font-medium flex items-center justify-center gap-1.5 ${activeTab === 'stickers' ? 'bg-coral/15 text-coral border-b-2 border-coral' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                    <FaSmile className="text-base" /> Çıkartmalar
                </button>
                <button
                    type="button"
                    onClick={() => onTabChange('gif')}
                    className={`flex-1 py-2 px-3 text-sm font-medium flex items-center justify-center gap-1.5 ${activeTab === 'gif' ? 'bg-coral/15 text-coral border-b-2 border-coral' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                    <FaGift className="text-base" /> GIF
                </button>
            </div>
            <div className="p-2 overflow-y-auto" style={{ maxHeight: '220px' }}>
                {activeTab === 'stickers' && (
                    <div className="grid grid-cols-5 sm:grid-cols-6 gap-1.5">
                        {STICKER_URLS.map((url, idx) => (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                    onSendMessage({ type: 'sticker', content: url });
                                    onCloseDrawer();
                                }}
                                className="aspect-square flex items-center justify-center p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                <img src={url} alt="" className="w-10 h-10 object-contain" />
                            </button>
                        ))}
                    </div>
                )}
                {activeTab === 'gif' && (
                    <div className="flex flex-col items-center justify-center py-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">GIF arayıp seçebilirsin</p>
                        <button
                            type="button"
                            onClick={onOpenGifPicker}
                            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-coral to-orange-400 text-white text-sm font-semibold shadow hover:shadow-md transition-all flex items-center gap-2"
                        >
                            <FaGift /> GIF Seç
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
