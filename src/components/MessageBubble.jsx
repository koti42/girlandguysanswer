import React from 'react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { FaCheck, FaCheckDouble } from 'react-icons/fa';

const MessageBubble = ({ message, isMine }) => {
    const renderContent = () => {
        switch (message.type) {
            case 'text':
                return <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{message.content}</p>;

            case 'image':
                return (
                    <div className="space-y-2">
                        <img
                            src={message.file_url}
                            alt="Image message"
                            className="rounded-xl max-w-sm cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => window.open(message.file_url, '_blank')}
                        />
                        {message.content && (
                            <p className="text-sm mt-2">{message.content}</p>
                        )}
                    </div>
                );

            case 'audio':
                return (
                    <div className="space-y-2">
                        <audio controls className="max-w-sm">
                            <source src={message.file_url} />
                            Your browser does not support the audio element.
                        </audio>
                        {message.content && (
                            <p className="text-sm mt-2">{message.content}</p>
                        )}
                    </div>
                );

            default:
                return <p className="text-[15px] leading-relaxed">{message.content}</p>;
        }
    };

    return (
        <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-4 px-2 sm:px-4 animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            <div className={`max-w-[85%] sm:max-w-[75%] md:max-w-[70%] ${isMine ? 'order-2' : 'order-1'}`}>
                <div
                    className={`rounded-2xl px-5 py-3.5 ${isMine
                            ? 'bg-gradient-to-br from-coral via-coral to-coral-dark text-white rounded-br-md shadow-lg shadow-coral/20'
                            : 'bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-700 dark:to-gray-700/80 text-gray-800 dark:text-gray-100 rounded-bl-md shadow-md'
                        } transition-all hover:shadow-xl`}
                >
                    {renderContent()}
                </div>

                {/* Timestamp and Read Status */}
                <div className={`flex items-center gap-1.5 mt-1.5 px-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                        {format(new Date(message.created_at), 'HH:mm', { locale: tr })}
                    </span>
                    {isMine && (
                        <span className="text-xs">
                            {message.is_read ? (
                                <FaCheckDouble className="text-blue-500" />
                            ) : (
                                <FaCheck className="text-gray-400 dark:text-gray-500" />
                            )}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MessageBubble;
