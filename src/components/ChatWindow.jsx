import React, { useState, useEffect, useRef } from 'react';
import { FaArrowLeft, FaTrash } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { notificationToast } from '../utils/notificationToast';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import ConfirmationModal from './ConfirmationModal';
import { messagesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { subscribeToUserChannel, unsubscribeFromChannel } from '../services/pusherClient';

const ChatWindow = ({ conversation, onBack, onNewMessage }) => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [replyingTo, setReplyingTo] = useState(null); // State for the message being replied to
    const [showDeleteModal, setShowDeleteModal] = useState(false); // State for delete confirmation modal
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

        const abortController = new AbortController();

        if (conversation && conversation.id) {
            const convId = conversation.id;

            (async () => {
                try {
                    const response = await messagesAPI.getMessages(convId);
                    if (abortController.signal.aborted) return;
                    if (conversationRef.current?.id !== convId) return;
                    setMessages(response.data.data.messages || []);
                    setTimeout(() => scrollToBottom(true), 100);
                } catch (error) {
                    if (!abortController.signal.aborted) {
                        console.error('Error fetching messages:', error);
                    }
                } finally {
                    if (!abortController.signal.aborted) {
                        setLoading(false);
                    }
                }
            })();

            messagesAPI.markAsRead(convId)
                .then(() => window.dispatchEvent(new Event('notification:refresh')))
                .catch(() => {});
        } else if (conversation && !conversation.id) {
            setMessages([]);
            setLoading(false);
        }

        return () => abortController.abort();
    }, [conversation?.id]);

    useEffect(() => {
        if (!user) return;

        const channel = subscribeToUserChannel(user.id, {
            onNewMessage: (data) => {
                if (conversationRef.current && data.message.conversation_id === conversationRef.current.id) {
                    setMessages(prev => {
                        const exists = prev.some(msg => msg.id === data.message.id);
                        if (exists) return prev;
                        return [...prev, data.message];
                    });

                    if (conversationRef.current.id && data.message.sender_id !== user.id) {
                        messagesAPI.markAsRead(conversationRef.current.id)
                            .then(() => window.dispatchEvent(new Event('notification:refresh')))
                            .catch(() => {});
                    }
                }
            },
            onMessagesRead: (data) => {
                if (conversationRef.current &&
                    data.conversation_id === conversationRef.current.id &&
                    data.reader_id === conversationRef.current.other_user.id) {

                    setMessages(prev => prev.map(msg => {
                        if (msg.sender_id === user.id && !msg.read_at) {
                            return { ...msg, read_at: data.read_at };
                        }
                        return msg;
                    }));
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

        const tempMessage = {
            id: `temp-${Date.now()}`,
            content: content || '',
            file_url: file ? URL.createObjectURL(file) : null,
            type: type,
            sender_id: user.id,
            created_at: new Date().toISOString(),
            read_at: null, // Explicitly null for single checkmark
            is_temp: true
        };

        setMessages(prev => [...prev, tempMessage]);
        setTimeout(() => scrollToBottom(true), 50);

        try {
            let response;

            if (type === 'text') {
                response = await messagesAPI.sendMessage({
                    receiver_id: conversationRef.current.other_user.id,
                    content,
                    type: 'text',
                    reply_to_message_id: replyingTo?.id // Include reply ID if exists
                });
            } else {
                const formData = new FormData();
                formData.append('receiver_id', conversationRef.current.other_user.id);
                formData.append('type', type);
                formData.append('file', file);
                if (content) formData.append('content', content);
                if (replyingTo?.id) formData.append('reply_to_message_id', replyingTo.id); // Include reply ID

                response = await messagesAPI.sendFile(formData);
            }

            if (response.data?.success === false) {
                setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
                notificationToast.error(response.data?.message || 'Mesaj gönderilemedi.');
                setReplyingTo(null);
                return;
            }

            setReplyingTo(null);

            const newMessage = response.data.data.message;
            const conversationData = response.data.data.conversation;

            console.log('Backend response - newMessage:', newMessage);
            console.log('read_at value:', newMessage.read_at);

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
            setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
            const errorMsg = error.response?.data?.message || 'Mesaj gönderilemedi. Lütfen tekrar deneyin.';
            notificationToast.error(errorMsg);
        }
    };

    if (!conversation) {
        return (
            <div className="flex flex-col items-center justify-center h-[100dvh] bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                    <div className="w-24 h-24 bg-gray-200 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-12 h-12 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-2">
                        Mesajlarınız
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400">
                        Bir soh bet seçin veya yeni bir konuşma başlatın
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-900 relative w-full overflow-hidden">
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
                    {/* Delete History Button */}
                    <button
                        onClick={() => setShowDeleteModal(true)}
                        className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                        title="Sohbeti Temizle"
                    >
                        <FaTrash className="text-lg" />
                    </button>
                </div>
            </div>

            <ConfirmationModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={async () => {
                    try {
                        await messagesAPI.deleteConversation(conversation.id);
                        setMessages([]); // Clear local messages
                    } catch (error) {
                        console.error('Error clearing history:', error);
                        alert('Geçmiş silinirken bir hata oluştu.');
                    }
                }}
                title="Sohbeti Temizle"
                message="Bu konuşma geçmişini silmek istediğinize emin misiniz? Bu işlem geri alınamaz ancak karşı taraf mesajları görmeye devam eder."
                confirmText="Evet, Sil"
                cancelText="Vazgeç"
                isDangerous={true}
            />

            {/* Messages Area - Scrollable (Flex-1) */}
            <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 w-full"
                style={{ WebkitOverflowScrolling: 'touch' }}
            >
                {loading ? (
                    <div className="flex justify-center items-center h-full">
                        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-pink-500"></div>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex justify-center items-center h-full px-4">
                        <div className="text-center">
                            <p className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">
                                Henüz mesaj yok
                            </p>
                            <p className="text-gray-500 dark:text-gray-400">
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
                                onReply={(msg) => setReplyingTo(msg)}
                            />
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Interaction Zone (Sticky Bottom) - Input Only */}
            <div className="flex-shrink-0 w-full z-20 sticky bottom-0 bg-white dark:bg-gray-900">
                <MessageInput
                    onSendMessage={handleSendMessage}
                    disabled={false}
                    replyingTo={replyingTo}
                    onCancelReply={() => setReplyingTo(null)}
                />
            </div>
        </div>
    );
};

export default ChatWindow;
