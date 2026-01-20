import React from 'react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { FaCheck, FaCheckDouble } from 'react-icons/fa';

const MessageBubble = ({ message, isMine }) => {
    const renderContent = () => {
        switch (message.type) {
            case 'text':
                return <p className="whitespace-pre-wrap break-words">{message.content}</p>;

            case 'image':
                return (
                    <div className="space-y-2">
                        <img
                            src={message.file_url}
                            alt="Image message"
                            className="rounded-lg max-w-xs cursor-pointer hover:opacity-90 transition-opacity"
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
                        <audio controls className="max-w-xs">
                            <source src={message.file_url} />
                            Your browser does not support the audio element.
                        </audio>
                        {message.content && (
                            <p className="text-sm mt-2">{message.content}</p>
                        )}
                    </div>
                );

            default:
                return <p>{message.content}</p>;
        }
    };

    return (
        <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-4`}>
            <div className={`max-w-[70%] ${isMine ? 'order-2' : 'order-1'}`}>
                <div
                    className={`rounded-2xl px-4 py-2.5 ${isMine
                            ? 'bg-gradient-to-br from-coral to-coral-dark text-white rounded-br-sm'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-sm'
                        } shadow-sm`}
                >
                    {renderContent()}
                </div>

                {/* Timestamp and Read Status */}
                <div className={`flex items-center gap-1 mt-1 px-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        {format(new Date(message.created_at), 'HH:mm', { locale: tr })}
                    </span>
                    {isMine && (
                        <span className="text-xs">
                            {message.is_read ? (
                                <FaCheckDouble className="text-blue-500" />
                            ) : (
                                <FaCheck className="text-gray-400" />
                            )}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MessageBubble;
