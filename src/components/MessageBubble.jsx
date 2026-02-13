import React from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { tr } from 'date-fns/locale';
import { FaEllipsisV, FaCheck, FaCheckDouble } from 'react-icons/fa';

const MessageBubble = ({ message, isMine, senderGender, onReply }) => {
    const ensureHttps = (url) => {
        if (!url) return url;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        return `https://${url}`;
    };

    const renderContent = () => {
        switch (message.type) {
            case 'image':
                return (
                    <img
                        src={ensureHttps(message.file_url)}
                        alt="Image"
                        className="max-w-full rounded-lg cursor-pointer"
                        style={{ maxHeight: '300px' }}
                        onClick={() => window.open(ensureHttps(message.file_url), '_blank')}
                    />
                );
            case 'audio':
                return (
                    <audio controls className="max-w-full">
                        <source src={ensureHttps(message.file_url)} type="audio/webm" />
                    </audio>
                );
            default:
                return <p className="whitespace-pre-wrap break-words text-sm leading-relaxed min-w-0 max-w-full" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{message.content}</p>;
        }
    };



    // Check for female gender (supports both English and Turkish)
    const isFemale = senderGender === 'female' ||
        senderGender === 'kiz' ||
        senderGender === 'woman' ||
        senderGender === 'kadın';

    const bubbleClass = isMine
        ? (isFemale
            ? 'bg-gradient-to-br from-pink-400 to-rose-400 text-white'
            : 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white')
        : (isFemale
            ? 'bg-gradient-to-br from-pink-500 to-rose-500 text-white'
            : 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white');

    const formatMessageDateTime = (dateString) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        if (Number.isNaN(d.getTime())) return '';

        const time = format(d, 'HH:mm', { locale: tr });
        if (isToday(d)) return `Bugün ${time}`;
        if (isYesterday(d)) return `Dün ${time}`;
        return `${format(d, 'd MMM', { locale: tr })} ${time}`;
    };

    return (
        <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-3 px-3 min-w-0`}>
            <div
                className={`max-w-[85%] sm:max-w-[75%] min-w-0 px-4 py-3 rounded-lg shadow-sm overflow-hidden ${bubbleClass} relative group`}
            >
                {/* Quoted Message */}
                {message.reply_to && (
                    <div className="mb-2 p-2 min-w-0 max-w-full overflow-hidden bg-black/10 dark:bg-white/10 rounded-lg border-l-4 border-white/50 text-xs">
                        <p className="font-bold opacity-90 mb-0.5 truncate">{message.reply_to.sender?.username}</p>
                        <p className="opacity-75 break-words line-clamp-2 min-w-0" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                            {message.reply_to.type === 'image' ? '📷 Fotoğraf' :
                                message.reply_to.type === 'audio' ? '🎤 Sesli Mesaj' :
                                    message.reply_to.content}
                        </p>
                    </div>
                )}

                {/* Time + Menu */}
                <div className="flex justify-between items-start mb-1.5 opacity-80 gap-2">
                    <div className="flex items-center gap-1">
                        <span className="text-[10px]">
                            {formatMessageDateTime(message.created_at)}
                        </span>
                        {isMine && (
                            <span className="text-xs">
                                {message.read_at ? (
                                    <FaCheckDouble className="text-blue-200" title={`Okundu: ${formatMessageDateTime(message.read_at)}`} />
                                ) : (
                                    <FaCheck className="text-white/70" title="Gönderildi" />
                                )}
                            </span>
                        )}
                    </div>
                    {/* Reply Button (visible on hover or always on mobile) */}
                    <button
                        onClick={() => onReply && onReply(message)}
                        className="text-white opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
                        title="Yanıtla"
                    >
                        <FaEllipsisV className="text-xs transform rotate-90" /> {/* Rotating to look different or just use Reply icon if available, but staying consistent with requested menu idea, simplifying to direct action for now */}
                    </button>
                </div>

                {/* Content */}
                {renderContent()}
            </div>
        </div>
    );
};

export default MessageBubble;
