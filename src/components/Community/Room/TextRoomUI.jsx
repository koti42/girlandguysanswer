import React, { useState, useEffect, useRef } from 'react';
import { FaSignOutAlt } from 'react-icons/fa';
import { communityAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { echo } from '../../../services/echo';
import { normalizeAvatarUrl } from '../../../utils/avatarUrl';
import { getProfileColor } from '../../../utils/userColor';
import MessageInput from '../../MessageInput/index.jsx';
import { toast } from 'react-hot-toast';

const CommunityMessageBubble = ({ message, isMine }) => {
    const sender = message.user || {};
    const accent = getProfileColor(sender) || '#f97316';
    const avatar = normalizeAvatarUrl(sender.avatar);

    return (
        <div className={`flex gap-2 mb-3 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
            {!isMine && (
                <div className="flex-shrink-0">
                    {avatar ? (
                        <img
                            src={avatar}
                            alt={sender.username || ''}
                            className="w-8 h-8 rounded-full object-cover"
                        />
                    ) : (
                        <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                            style={{ backgroundColor: accent }}
                        >
                            {(sender.username || '?')[0]?.toUpperCase()}
                        </div>
                    )}
                </div>
            )}
            <div className={`max-w-[75%] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                {!isMine && (
                    <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-0.5 px-1">
                        {sender.username}
                    </span>
                )}
                <div
                    className={`px-3 py-2 rounded-2xl text-sm break-words ${
                        isMine
                            ? 'bg-coral text-white rounded-br-md'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md'
                    }`}
                >
                    {message.content}
                </div>
                {message.created_at && (
                    <span className="text-[10px] text-gray-400 mt-0.5 px-1">
                        {new Date(message.created_at).toLocaleTimeString('tr-TR', {
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                    </span>
                )}
            </div>
        </div>
    );
};

const TextRoomUI = ({ community, onLeave, participantsCount }) => {
    const { user } = useAuth();
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef(null);
    const communityId = community?.uuid || community?.id;

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
    };

    const isMineMessage = (msg) => {
        const senderId = msg.user_id ?? msg.user?.id ?? msg.sender_id;
        if (!user?.id || senderId == null) {
            return false;
        }
        return String(senderId) === String(user.id);
    };

    useEffect(() => {
        if (!communityId) {
            return;
        }

        let cancelled = false;

        const fetchMessages = async () => {
            try {
                setLoading(true);
                const res = await communityAPI.getMessages(communityId);
                if (cancelled) {
                    return;
                }
                setMessages(res.data?.data || []);
                scrollToBottom();
            } catch {
                if (!cancelled) {
                    toast.error('Mesajlar yüklenemedi.');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchMessages();

        const channelName = `community.${communityId}`;
        const channel = echo.private(channelName);

        const onMessageSent = (data) => {
            const newMessage = data?.message || data;
            if (!newMessage?.id) {
                return;
            }
            setMessages((prev) => {
                if (prev.some((m) => m.id === newMessage.id)) {
                    return prev;
                }
                const withoutTemp = prev.filter((m) => {
                    if (typeof m.id === 'string' && String(m.id).startsWith('temp-')) {
                        return !(
                            isMineMessage(m) &&
                            m.content === newMessage.content
                        );
                    }
                    return true;
                });
                return [...withoutTemp, newMessage];
            });
            scrollToBottom();
        };

        channel.listen('.message.sent', onMessageSent);

        return () => {
            cancelled = true;
            channel.stopListening('.message.sent');
        };
    }, [communityId]);

    const handleSendMessage = async ({ content }) => {
        if (!content?.trim() || !communityId) {
            return;
        }

        const tempId = `temp-${Date.now()}`;
        const tempMessage = {
            id: tempId,
            content: content.trim(),
            type: 'text',
            user_id: user.id,
            created_at: new Date().toISOString(),
            user: {
                id: user.id,
                username: user.username,
                avatar: user.avatar,
                gender: user.gender,
            },
        };

        setMessages((prev) => [...prev, tempMessage]);
        scrollToBottom();

        try {
            const res = await communityAPI.sendMessage(communityId, {
                content: content.trim(),
                type: 'text',
            });
            const saved = res.data?.data || res.data;
            setMessages((prev) =>
                prev.map((m) => (m.id === tempId ? saved : m))
            );
        } catch (err) {
            setMessages((prev) => prev.filter((m) => m.id !== tempId));
            toast.error(err.response?.data?.message || 'Mesaj gönderilemedi.');
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-xl border border-gray-100 dark:border-gray-700">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                <div className="min-w-0">
                    <h2 className="font-bold text-lg text-gray-900 dark:text-white truncate">
                        {community.title || community.name}
                    </h2>
                    <p className="text-xs text-gray-500">
                        {typeof participantsCount === 'number'
                            ? `${participantsCount} kişi bu odada · Yazılı Sohbet`
                            : 'Yazılı Sohbet Odası'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onLeave}
                    className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors flex-shrink-0"
                    title="Ayrıl"
                >
                    <FaSignOutAlt />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900/40">
                {loading ? (
                    <div className="flex justify-center py-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-coral" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="text-center text-gray-400 py-16 text-sm">
                        <p className="font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Henüz mesaj yok
                        </p>
                        <p>İlk mesajı sen yaz, sohbet başlasın.</p>
                    </div>
                ) : (
                    messages
                        .filter((msg) => msg && msg.id)
                        .map((msg) => (
                            <CommunityMessageBubble
                                key={msg.id}
                                message={msg}
                                isMine={isMineMessage(msg)}
                            />
                        ))
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
                <MessageInput onSendMessage={handleSendMessage} disabled={loading} />
            </div>
        </div>
    );
};

export default TextRoomUI;
