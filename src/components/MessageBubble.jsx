import React from 'react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { FaEllipsisV } from 'react-icons/fa';

const MessageBubble = ({ message, isMine }) => {
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

    return (
        <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-3 px-3`}>
            <div
                className={`max-w-[75%] px-4 py-3 rounded-lg ${isMine
                        ? 'bg-gradient-to-br from-coral to-pink-400 text-white'
                        : 'bg-blue-700 text-white'
                    }`}
            >
                {/* Time + Menu */}
                <div className="flex justify-between items-start mb-1.5">
                    <span className="text-[10px] opacity-70">
                        {format(new Date(message.created_at), 'HH:mm', { locale: tr })}
                    </span>
                    <button className="text-white/70 hover:text-white transition-colors">
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
