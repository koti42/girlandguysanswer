import React, { useState, useEffect, useRef } from 'react';
import { FaTimes } from 'react-icons/fa';
import MessageBubble from '../../MessageBubble';
import MessageInput from '../../MessageInput/index.jsx';
import { communityAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { useRoomContext } from '@livekit/components-react';
import { echo } from '../../../services/echo';

const InRoomChat = ({ communityId, isOpen, onClose }) => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const { user } = useAuth();
    const messagesEndRef = useRef(null);
    const room = useRoomContext();
    const [isAnimating, setIsAnimating] = useState(false);
    const channelRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setIsAnimating(true);
            fetchMessages();
        } else {
            setTimeout(() => setIsAnimating(false), 300);
        }
    }, [isOpen, communityId]);

    useEffect(() => {
        if (!communityId) return;

        const channelName = `community.${communityId}`;
        const channel = echo.private(channelName);

        channel.listen('.message.sent', (data) => {
            const newMessage = data.message || data;
            setMessages(prev => {
                if (prev.some(m => m.id === newMessage.id)) return prev;
                return [...prev, newMessage];
            });
            scrollToBottom();
        });

        channelRef.current = channel;

        return () => {
            if (channelRef.current) {
                echo.leave(channelName);
                channelRef.current = null;
            }
        };
    }, [communityId]);

    useEffect(() => {
        if (!room) return;

        const handleData = (payload, _participant, _kind) => {
            const str = new TextDecoder().decode(payload);
            try {
                const data = JSON.parse(str);
                if (data.type === 'chat') {
                    setMessages(prev => {
                        if (prev.some(m => m.id === data.message.id)) return prev;
                        return [...prev, data.message];
                    });
                    scrollToBottom();
                }
            } catch { /* oda sohbeti en iyi çaba; hata kullanıcıya gösterilmiyor */ }
        };

        room.on('dataReceived', handleData);
        return () => room.off('dataReceived', handleData);
    }, [room]);

    const fetchMessages = async () => {
        try {
            setLoading(true);
            const res = await communityAPI.getMessages(communityId);
            setMessages(res.data.data || []);
            scrollToBottom();
        } catch {
            // oda sohbeti en iyi çaba; hata kullanıcıya gösterilmiyor
        } finally {
            setLoading(false);
        }
    };

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const handleSendMessage = async ({ content }) => {
        try {
            const tempId = Date.now();
            const tempMessage = {
                id: tempId,
                content,
                type: 'text',
                sender_id: user.id,
                created_at: new Date().toISOString(),
                user: user
            };

            setMessages(prev => [...prev, tempMessage]);
            scrollToBottom();

            const res = await communityAPI.sendMessage(communityId, { content, type: 'text' });

            setMessages(prev => prev.map(m => m.id === tempId ? res.data.data : m));
        } catch {
            // oda sohbeti en iyi çaba; hata kullanıcıya gösterilmiyor
        }
    };

    if (!isOpen && !isAnimating) return null;

    return (
        <>
            <div
                className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 md:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />

            <div
                className={`fixed inset-x-0 bottom-0 top-[30%] md:top-auto md:bottom-20 md:right-4 md:left-auto md:w-[380px] md:h-[500px] z-50 bg-white dark:bg-gray-900 shadow-2xl rounded-t-2xl md:rounded-2xl flex flex-col transition-transform duration-300 transform ${isOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-10 md:opacity-0 md:pointer-events-none'}`}
            >
                <div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="font-bold text-gray-900 dark:text-white">Sohbet</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                        <FaTimes className="text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900/50">
                    {loading ? (
                        <div className="flex justify-center py-4">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-coral"></div>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="text-center text-gray-400 py-10 text-sm">
                            Henüz mesaj yok.
                        </div>
                    ) : (
                        messages.filter(msg => msg && msg.id).map(msg => (
                            <MessageBubble
                                key={msg.id}
                                message={msg}
                                isMine={msg.sender_id === user?.id}
                                senderGender={msg.sender_gender || msg.user?.gender}
                            />
                        ))
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="p-1 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <MessageInput onSendMessage={handleSendMessage} disabled={loading} />
                </div>
            </div>
        </>
    );
};

export default InRoomChat;
