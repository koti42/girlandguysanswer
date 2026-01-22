import React from 'react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { FaEllipsisV, FaCheck, FaCheckDouble } from 'react-icons/fa';

const MessageBubble = ({ message, isMine, senderGender }) => {
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
                return <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>;
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

    return (
        <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-3 px-3`}>
            <div
                className={`max-w-[75%] px-4 py-3 rounded-lg shadow-sm ${bubbleClass}`}
            >
                {/* Time + Menu */}
                <div className="flex justify-between items-start mb-1.5 opacity-80 gap-2">
                    <div className="flex items-center gap-1">
                        <span className="text-[10px]">
                            {format(new Date(message.created_at), 'HH:mm', { locale: tr })}
                        </span>
                        {isMine && (
                            <span className="text-xs">
                                {message.read_at ? (
                                    <FaCheckDouble className="text-blue-200" title={`Okundu: ${format(new Date(message.read_at), 'HH:mm')}`} />
                                ) : (
                                    <FaCheck className="text-white/70" title="Gönderildi" />
                                )}
                            </span>
                        )}
                    </div>
                    <button className="text-white hover:text-white/80 transition-colors">
                        <FaEllipsisV className="text-xs" />
                    </button>
                </div>

                {/* Content */}
                {renderContent()}
            </div>
        </div>
    );
};

export default MessageBubble;
