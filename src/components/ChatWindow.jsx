import React, { useState, useEffect, useRef } from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import { messagesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { subscribeToUserChannel, unsubscribeFromChannel } from '../services/pusherClient';

const ChatWindow = ({ conversation, onBack, onNewMessage }) => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const conversationRef = useRef(conversation);
    const navigate = useNavigate();

    const ensureHttps = (url) => {
        if (!url) return url;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        return `https://${url}`;
    };

    useEffect(() => {
        conversationRef.current = conversation;
        setMessages([]);
        setLoading(true);

        if (conversation && conversation.id) {
            fetchMessages();
            markAsRead();
        } else if (conversation && !conversation.id) {
            setMessages([]);
            setLoading(false);
        }
    }, [conversation?.id]);

    // Pusher real-time with duplicate check
    useEffect(() => {
        if (!user) return;

        const channel = subscribeToUserChannel(user.id, {
            onNewMessage: (data) => {
                if (conversation && data.message.conversation_id === conversation.id) {
                    setMessages(prev => {
                        // Duplicate check by ID
                        const exists = prev.some(msg => msg.id === data.message.id);
                        if (exists) return prev;
                        return [...prev, data.message];
                    });

                    if (conversation.id) {
                        markAsRead();
                    }
                }
            }
        });

        return () => {
            unsubscribeFromChannel(user.id);
        };
    }, [conversation?.id, user]);

    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container) return;

        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

        if (isNearBottom) {
            scrollToBottom();
        }
    }, [messages]);

    const fetchMessages = async () => {
        try {
            setLoading(true);
            const response = await messagesAPI.getMessages(conversation.id);
            setMessages(response.data.data.messages || []);
            setTimeout(() => scrollToBottom(true), 100);
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

    const scrollToBottom = (force = false) => {
        const container = messagesContainerRef.current;
        if (!container) return;

        if (force) {
            container.scrollTop = container.scrollHeight;
        } else {
            container.scrollTo({
                top: container.scrollHeight,
                behavior: 'smooth'
            });
        }
    };

    const handleSendMessage = async ({ content, file, type }) => {
        if (!conversation) return;

        // Optimistic UI: Create temp message
        const tempMessage = {
            id: `temp-${Date.now()}`,
            content: content || '',
            file_url: file ? URL.createObjectURL(file) : null,
            type: type,
            sender_id: user.id,
            created_at: new Date().toISOString(),
            is_temp: true
        };

        // Immediately add to UI
        setMessages(prev => [...prev, tempMessage]);
        setTimeout(() => scrollToBottom(true), 50);

        try {
            let response;

            if (type === 'text') {
                response = await messagesAPI.sendMessage({
                    receiver_id: conversationRef.current.other_user.id,
                    content,
                    type: 'text'
                });
            } else {
                const formData = new FormData();
                formData.append('receiver_id', conversationRef.current.other_user.id);
                formData.append('type', type);
                formData.append('file', file);
                if (content) formData.append('content', content);

                response = await messagesAPI.sendFile(formData);
            }

            const newMessage = response.data.data.message;
            const conversationData = response.data.data.conversation;

            // Replace temp message with real message
            setMessages(prev => prev.map(m =>
                m.id === tempMessage.id ? newMessage : m
            ));

            if (onNewMessage) {
                onNewMessage(newMessage, conversationData);
            }

            if (!conversationRef.current.id && conversationData) {
                conversationRef.current = { ...conversationRef.current, id: conversationData.id };
            }

            setTimeout(() => scrollToBottom(true), 100);
        } catch (error) {
            console.error('Error sending message:', error);
            // Remove temp message on error
            setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
            alert('Mesaj gönderilemedi. Lütfen tekrar deneyin.');
        }
    };

    if (!conversation) {
        return (
            <div className="flex flex-col items-center justify-center h-[100dvh] bg-gray-50">
                <div className="text-center">
                    <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">
                        Mesajlarınız
                    </h3>
                    <p className="text-gray-500">
                        Bir soh bet seçin veya yeni bir konuşma başlatın
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white relative">
            {/* Header - Pink Bar (Sticky Top) */}
            <div className="flex-shrink-0 bg-pink-500 p-4 w-full z-10 sticky top-0">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="text-white hover:bg-pink-600 p-2 rounded-lg transition-colors"
                    >
                        <FaArrowLeft className="text-lg" />
                    </button>

                    <div
                        className="flex-1 cursor-pointer"
                        onClick={() => navigate(`/profile/${conversation.other_user.username}`)}
                    >
                        <h3 className="font-bold text-white">
                            {conversation.other_user.username}
                        </h3>
                        <p className="text-xs text-white/80">
                            Aktif
                        </p>
                    </div>
                </div>
            </div>

            {/* Messages Area - Scrollable (Flex-1) */}
            <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto bg-white w-full"
                style={{ WebkitOverflowScrolling: 'touch' }}
            >
                {loading ? (
                    <div className="flex justify-center items-center h-full">
                        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-pink-500"></div>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex justify-center items-center h-full px-4">
                        <div className="text-center">
                            <p className="text-lg font-semibold text-gray-700 mb-2">
                                Henüz mesaj yok
                            </p>
                            <p className="text-gray-500">
                                İlk mesajı sen gönder! 👋
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="py-4 w-full">
                        {messages.map((message) => (
                            <MessageBubble
                                key={message.id}
                                message={message}
                                isMine={message.sender_id === user.id}
                                senderGender={message.sender_id === user.id ? user.gender : conversation.other_user.gender}
                            />
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Interaction Zone (Sticky Bottom) - Input Only */}
            <div className="flex-shrink-0 w-full z-20 sticky bottom-0 bg-white">
                <MessageInput
                    onSendMessage={handleSendMessage}
                    disabled={false}
                />
            </div>
        </div>
    );
};

export default ChatWindow;
