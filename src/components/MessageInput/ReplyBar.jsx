import React from 'react';
import { FaTimes } from 'react-icons/fa';

export default function ReplyBar({ replyingTo, currentUserId, onScrollToQuotedMessage, onCancelReply, theme = 'default' }) {
    if (!replyingTo) return null;
    const isAdultTheme = theme === 'adult';

    const previewText = replyingTo.type === 'image'
        ? '📷 Fotoğraf'
        : replyingTo.type === 'audio'
            ? '🎤 Sesli Mesaj'
            : replyingTo.type === 'gif'
                ? 'GIF'
                : replyingTo.type === 'sticker'
                    ? 'Çıkartma'
                    : replyingTo.content;

    const label = replyingTo.sender_id === currentUserId
        ? 'Kendine yanıt veriyorsun'
        : `${replyingTo.sender?.username || 'Kullanıcı'} kullanıcısına yanıt veriyorsun`;

    return (
        <div className={`mb-2 p-2 rounded-lg border-l-4 flex justify-between items-center gap-2 min-w-0 max-h-[72px] ${isAdultTheme ? 'bg-white/10 border-fuchsia-400 text-white' : 'bg-gray-100 dark:bg-gray-800 border-pink-500'}`}>
            <div className="flex flex-col overflow-hidden min-w-0 flex-1 select-none" style={{ WebkitUserSelect: 'none', userSelect: 'none' }}>
                <span className={`text-xs font-bold truncate shrink-0 ${isAdultTheme ? 'text-fuchsia-200' : 'text-pink-600 dark:text-pink-400'}`}>
                    {label}
                </span>
                <span className={`text-xs line-clamp-2 break-words overflow-hidden min-w-0 ${isAdultTheme ? 'text-white/80' : 'text-gray-600 dark:text-gray-300'}`} style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                    {previewText}
                </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
                {replyingTo.id && onScrollToQuotedMessage && (
                    <button
                        type="button"
                        onClick={() => onScrollToQuotedMessage(replyingTo.id)}
                        onMouseDown={(e) => e.preventDefault()}
                        className={`text-xs font-semibold whitespace-nowrap px-2 py-1 rounded transition-colors ${isAdultTheme ? 'text-fuchsia-200 hover:text-white hover:bg-white/10' : 'text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 hover:bg-pink-50 dark:hover:bg-pink-900/20'}`}
                    >
                        Mesaja git
                    </button>
                )}
                <button
                    type="button"
                    onClick={onCancelReply}
                    className={`p-1.5 flex-shrink-0 ${isAdultTheme ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-red-500'}`}
                >
                    <FaTimes className="text-sm" />
                </button>
            </div>
        </div>
    );
}
