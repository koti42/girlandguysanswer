import React from 'react';
import { FaTimes } from 'react-icons/fa';

export default function ReplyBar({ replyingTo, currentUserId, onScrollToQuotedMessage, onCancelReply }) {
    if (!replyingTo) return null;

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
        <div className="mb-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg border-l-4 border-pink-500 flex justify-between items-center gap-2 min-w-0 max-h-[72px]">
            <div className="flex flex-col overflow-hidden min-w-0 flex-1 select-none" style={{ WebkitUserSelect: 'none', userSelect: 'none' }}>
                <span className="text-xs font-bold text-pink-600 dark:text-pink-400 truncate shrink-0">
                    {label}
                </span>
                <span className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 break-words overflow-hidden min-w-0" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                    {previewText}
                </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
                {replyingTo.id && onScrollToQuotedMessage && (
                    <button
                        type="button"
                        onClick={() => onScrollToQuotedMessage(replyingTo.id)}
                        onMouseDown={(e) => e.preventDefault()}
                        className="text-xs font-semibold text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 whitespace-nowrap px-2 py-1 rounded hover:bg-pink-50 dark:hover:bg-pink-900/20 transition-colors"
                    >
                        Mesaja git
                    </button>
                )}
                <button
                    type="button"
                    onClick={onCancelReply}
                    className="p-1.5 text-gray-500 hover:text-red-500 flex-shrink-0"
                >
                    <FaTimes className="text-sm" />
                </button>
            </div>
        </div>
    );
}
