import React, { useState, useEffect, useRef } from 'react';
import { FaArrowLeft, FaCircle } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import { messagesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { subscribeToUserChannel, unsubscribeFromChannel } from '../services/pusherClient';
import { format, isToday, isYesterday } from 'date-fns';
import { tr } from 'date-fns/locale';

const ChatWindow = ({ conversation, onBack, onNewMessage }) => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const { user } = useAuth();
    const messagesEndRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        if (conversation && conversation.id) {
            fetchMessages();
            markAsRead();
        } else if (conversation && !conversation.id) {
            setMessages([]);
            setLoading(false);
        }
    }, [conversation?.id]);

    // Pusher real-time message listener
    useEffect(() => {
        if (!user) return;

        console.log('💬 ChatWindow: Setting up Pusher listener for user:', user.id, 'conversation:', conversation?.id);

        const channel = subscribeToUserChannel(user.id, {
            onNewMessage: (data) => {
                console.log('💬 ChatWindow: Message received, conversation_id:', data.message.conversation_id, 'current conversation:', conversation?.id);

                // Only add message if it's for the current conversation
                if (conversation && data.message.conversation_id === conversation.id) {
                    console.log('✅ ChatWindow: Message is for current conversation, adding to chat');
                    setMessages(prev => {
                        // Check if message already exists to avoid duplicates
                        const exists = prev.some(msg => msg.id === data.message.id);
                        if (exists) {
                            console.log('⚠️ ChatWindow: Duplicate message detected, ignoring');
                            return prev;
                        }
                        return [...prev, data.message];
                    });

                    // Mark as read since we're in the chat
                    if (conversation.id) {
                        markAsRead();
                    }
                } else {
                    console.log('ℹ️ ChatWindow: Message is for different conversation, ignoring');
                }
            }
        });

        return () => {
            console.log('🔌 ChatWindow: Cleaning up Pusher listener');
            unsubscribeFromChannel(user.id);
        };
    }, [conversation?.id, user]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const fetchMessages = async () => {
        try {
            setLoading(true);
            const response = await messagesAPI.getMessages(conversation.id);
            setMessages(response.data.data.messages || []);
        } catch (error) {
            console.error('Error fetching messages:', error);
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async () => {
        try {
            await messagesAPI.markAsRead(conversation.id);
        } catch (error) {
            console.error('Error marking as read:', error);
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleSendMessage = async ({ content, file, type }) => {
        if (!conversation) return;

        try {
            setSending(true);
            let response;

            if (type === 'text') {
                response = await messagesAPI.sendMessage({
                    receiver_id: conversation.other_user.id,
                    content,
                    type: 'text'
                });
            } else {
                const formData = new FormData();
                formData.append('receiver_id', conversation.other_user.id);
                formData.append('type', type);
                formData.append('file', file);
                if (content) formData.append('content', content);

                response = await messagesAPI.sendFile(formData);
            }

            const newMessage = response.data.data.message;
            const conversationData = response.data.data.conversation;

            setMessages(prev => [...prev, newMessage]);

            if (onNewMessage) {
                onNewMessage(newMessage, conversationData);
            }

            if (!conversation.id && conversationData) {
            }
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Mesaj gönderilemedi. Lütfen tekrar deneyin.');
        } finally {
            setSending(false);
        }
    };

    const getDateSeparator = (date) => {
        const messageDate = new Date(date);
        if (isToday(messageDate)) return 'Bugün';
        if (isYesterday(messageDate)) return 'Dün';
        return format(messageDate, 'd MMMM yyyy', { locale: tr });
    };

    const renderMessages = () => {
        let currentDate = null;
        return messages.map((message, index) => {
            const messageDate = format(new Date(message.created_at), 'yyyy-MM-dd');
            const showDateSeparator = messageDate !== currentDate;
            currentDate = messageDate;

            return (
                <React.Fragment key={message.id}>
                    {showDateSeparator && (
                        <div className="flex justify-center my-4">
                            <div className="bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded-full text-xs text-gray-600 dark:text-gray-400">
                                {getDateSeparator(message.created_at)}
                            </div>
                        </div>
                    )}
                    <MessageBubble
                        message={message}
                        isMine={message.sender_id === user.id}
                    />
                </React.Fragment>
            );
        });
    };

    if (!conversation) {
        return (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                    <div className="w-24 h-24 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Mesajlarınız
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400">
                        Bir sohbet seçin veya yeni bir konuşma başlatın
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-white dark:bg-gray-800">
            {/* Header */}
            <div className="border-b border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
                <div className="flex items-center gap-3">
                    {/* Back Button (Mobile) */}
                    <button
                        onClick={onBack}
                        className="md:hidden text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-lg transition-colors"
                    >
                        <FaArrowLeft />
                    </button>

                    {/* User Avatar */}
                    <div className="relative">
                        <img
                            src={conversation.other_user.avatar || 'https://i.pravatar.cc/200?u=default'}
                            alt={conversation.other_user.username}
                            className="w-12 h-12 rounded-full object-cover"
                        />
                        <FaCircle className="absolute bottom-0 right-0 text-green-500 text-xs border-2 border-white dark:border-gray-800 rounded-full" />
                    </div>

                    {/* User Info */}
                    <div
                        className="flex-1 cursor-pointer"
                        onClick={() => navigate(`/profile/${conversation.other_user.username}`)}
                    >
                        <h3 className="font-semibold text-gray-800 dark:text-white">
                            {conversation.other_user.username}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Aktif
                        </p>
                    </div>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900">
                {loading ? (
                    <div className="flex justify-center items-center h-full">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex justify-center items-center h-full">
                        <div className="text-center">
                            <p className="text-gray-500 dark:text-gray-400">
                                Henüz mesaj yok. İlk mesajı sen gönder! 👋
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        {renderMessages()}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>

            {/* Message Input */}
            <MessageInput
                onSendMessage={handleSendMessage}
                disabled={sending}
            />
        </div>
    );
};

export default ChatWindow;
