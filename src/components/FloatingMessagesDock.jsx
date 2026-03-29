import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { FaPaperPlane, FaTimes, FaExternalLinkAlt } from 'react-icons/fa';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import ChatWindow from './ChatWindow';
import { useAuth } from '../context/AuthContext';
import { messagesAPI } from '../services/api';
import { subscribeToUserChannel, unsubscribeFromChannel } from '../services/pusherClient';
import OnlineIndicator from './OnlineIndicator';
import { getThemeStyles, getViewerPrefs } from '../utils/userColor';

const ensureHttps = (url) => {
    if (!url) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `https://${url}`;
};

const renderMessagePreview = (message) => {
    if (!message) return 'Henüz mesaj yok';
    switch (message.type) {
        case 'image':
            return 'Fotoğraf';
        case 'audio':
            return 'Ses dosyası';
        case 'gif':
            return 'GIF';
        case 'sticker':
            return 'Çıkartma';
        default:
            return message.content || 'Mesaj';
    }
};

const FloatingMessagesDock = () => {
    const { user } = useAuth();
    const location = useLocation();
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [activeConversation, setActiveConversation] = useState(null);
    const panelRef = useRef(null);
    const buttonRef = useRef(null);
    const activeConversationRef = useRef(null);

    useEffect(() => {
        activeConversationRef.current = activeConversation;
    }, [activeConversation]);

    const isMessagesRoute =
        location.pathname === '/messages' || location.pathname.startsWith('/messages/');

    const fetchConversations = useCallback(async () => {
        if (!user || isMessagesRoute) return;
        try {
            setLoading(true);
            const response = await messagesAPI.getConversations();
            const list = response.data?.data || [];
            setConversations(Array.isArray(list) ? list : []);
        } catch (e) {
            console.error('FloatingMessagesDock fetch:', e);
        } finally {
            setLoading(false);
        }
    }, [user, isMessagesRoute]);

    useEffect(() => {
        if (!user || isMessagesRoute) return;
        fetchConversations();
    }, [user, isMessagesRoute, fetchConversations]);

    const handleNewMessageEvent = useCallback(
        (message) => {
            if (!message?.conversation_id) return;
            const isOwnMessage = message.sender_id === user?.id;

            setConversations((prev) => {
                const idx = prev.findIndex((c) => c.id === message.conversation_id);
                if (idx === -1) {
                    fetchConversations();
                    return prev;
                }
                const next = [...prev];
                const conv = { ...next[idx] };
                const currentUnread = conv.unread_count || 0;
                const newUnread = isOwnMessage ? currentUnread : currentUnread + 1;

                conv.latest_message = { ...message, is_mine: isOwnMessage };
                conv.last_message_at = message.created_at;
                conv.unread_count = newUnread;
                next.splice(idx, 1);
                return [conv, ...next];
            });
        },
        [user?.id, fetchConversations]
    );

    const dockPusherActive = Boolean(user && !isMessagesRoute && !activeConversation);

    useEffect(() => {
        if (!dockPusherActive) return;

        subscribeToUserChannel(user.id, {
            onNewMessage: (data) => handleNewMessageEvent(data.message || data),
        });

        return () => {
            unsubscribeFromChannel(user.id);
        };
    }, [user, dockPusherActive, handleNewMessageEvent]);

    const handleDockNewMessage = useCallback(
        (newMessage, conversationData) => {
            setConversations((prevConversations) => {
                const active = activeConversationRef.current;
                const conversationIndex = prevConversations.findIndex(
                    (c) => c.id === (conversationData?.id || active?.id)
                );

                if (conversationIndex !== -1) {
                    const updatedConversations = [...prevConversations];
                    updatedConversations[conversationIndex] = {
                        ...updatedConversations[conversationIndex],
                        latest_message: {
                            ...newMessage,
                            is_mine: newMessage.sender_id === user.id,
                        },
                        last_message_at: newMessage.created_at,
                    };
                    const [movedConv] = updatedConversations.splice(conversationIndex, 1);
                    return [movedConv, ...updatedConversations];
                }
                if (conversationData) {
                    return [
                        {
                            id: conversationData.id,
                            other_user: conversationData.other_user || active?.other_user,
                            latest_message: {
                                ...newMessage,
                                is_mine: newMessage.sender_id === user.id,
                            },
                            last_message_at: newMessage.created_at,
                            unread_count: 0,
                        },
                        ...prevConversations,
                    ];
                }
                return prevConversations;
            });

            if (conversationData && !activeConversationRef.current?.id) {
                setActiveConversation((prev) =>
                    prev
                        ? {
                              ...prev,
                              id: conversationData.id,
                              latest_message: {
                                  ...newMessage,
                                  is_mine: newMessage.sender_id === user.id,
                              },
                              last_message_at: newMessage.created_at,
                          }
                        : prev
                );
            }
        },
        [user?.id]
    );

    useEffect(() => {
        const onDoc = (e) => {
            if (!expanded) return;
            const t = e.target;
            if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
            setExpanded(false);
            setActiveConversation(null);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [expanded]);

    useEffect(() => {
        if (!expanded) return;
        const onKey = (e) => {
            if (e.key === 'Escape') {
                setExpanded(false);
                setActiveConversation(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [expanded]);

    if (!user || isMessagesRoute) return null;

    const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
    const previewAvatars = conversations.slice(0, 3);

    const openThread = (conv) => {
        if (!conv?.other_user?.username) return;
        setActiveConversation(conv);
        setConversations((prev) =>
            prev.map((c) =>
                c.id === conv.id ? { ...c, unread_count: 0 } : c
            )
        );
    };

    const viewerPrefs = getViewerPrefs(user);

    const panelHeightClass = activeConversation
        ? 'h-[min(72vh,580px)] max-h-[min(72vh,580px)] w-[min(400px,calc(100vw-3rem))]'
        : 'max-h-[min(440px,calc(100vh-7rem))] w-[min(360px,calc(100vw-3rem))]';

    const closePanel = () => {
        setExpanded(false);
        setActiveConversation(null);
    };

    return (
        <div
            className="hidden md:flex fixed bottom-6 right-6 z-[90] flex-col items-end gap-2 pointer-events-none"
            aria-live="polite"
        >
            {expanded && (
                <div
                    ref={panelRef}
                    className={`pointer-events-auto flex flex-col rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl overflow-hidden ${panelHeightClass}`}
                >
                    {!activeConversation ? (
                        <>
                            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
                                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                    Mesajlar
                                </h2>
                                <div className="flex items-center gap-1">
                                    <Link
                                        to="/messages"
                                        className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                        title="Mesajlar sayfasını aç"
                                        onClick={closePanel}
                                    >
                                        <FaExternalLinkAlt className="w-4 h-4" />
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={closePanel}
                                        className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                        aria-label="Kapat"
                                    >
                                        <FaTimes className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto min-h-0">
                                {loading && conversations.length === 0 ? (
                                    <div className="flex justify-center py-12">
                                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-coral" />
                                    </div>
                                ) : conversations.length === 0 ? (
                                    <p className="text-center text-sm text-gray-500 py-10 px-4">
                                        Henüz mesaj yok. Sohbetleri buradan takip edebilirsin.
                                    </p>
                                ) : (
                                    conversations.map((conversation) => {
                                        const otherUser = conversation.other_user || {};
                                        const themeStyles = getThemeStyles(otherUser, viewerPrefs);
                                        return (
                                            <button
                                                type="button"
                                                key={conversation.id || otherUser.username}
                                                onClick={() => openThread(conversation)}
                                                className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/80 border-b border-gray-100 dark:border-gray-800/80 transition-colors border-l-4 border-transparent"
                                                style={{ borderLeftColor: themeStyles.accentColor }}
                                            >
                                                <div className="relative shrink-0">
                                                    <img
                                                        src={
                                                            ensureHttps(otherUser.avatar) ||
                                                            'https://i.pravatar.cc/200?u=default'
                                                        }
                                                        alt=""
                                                        className="w-11 h-11 rounded-full object-cover"
                                                    />
                                                    <OnlineIndicator
                                                        isOnline={otherUser.is_online}
                                                        size="sm"
                                                        className="absolute bottom-0 right-0"
                                                    />
                                                    {conversation.unread_count > 0 && (
                                                        <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 bg-coral rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                                                            {conversation.unread_count > 99
                                                                ? '99+'
                                                                : conversation.unread_count}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between gap-2 items-baseline">
                                                        <span className="font-semibold text-gray-900 dark:text-gray-100 truncate text-sm">
                                                            {conversation.nickname || otherUser.username}
                                                        </span>
                                                        {conversation.last_message_at && (
                                                            <span className="text-[10px] text-gray-400 shrink-0">
                                                                {formatDistanceToNow(
                                                                    new Date(conversation.last_message_at),
                                                                    { addSuffix: false, locale: tr }
                                                                )}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p
                                                        className={`text-xs truncate mt-0.5 ${
                                                            conversation.unread_count > 0
                                                                ? 'text-gray-800 dark:text-gray-200 font-medium'
                                                                : 'text-gray-500 dark:text-gray-400'
                                                        }`}
                                                    >
                                                        {conversation.latest_message?.is_mine && 'Siz: '}
                                                        {renderMessagePreview(conversation.latest_message)}
                                                    </p>
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>

                            <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800 shrink-0">
                                <Link
                                    to="/messages"
                                    onClick={closePanel}
                                    className="block text-center text-sm font-semibold text-coral hover:underline py-1"
                                >
                                    Tüm mesajlar sayfası
                                </Link>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden">
                            <ChatWindow
                                embeddedInDock
                                conversation={activeConversation}
                                onBack={() => setActiveConversation(null)}
                                onNewMessage={handleDockNewMessage}
                            />
                        </div>
                    )}
                </div>
            )}

            <button
                ref={buttonRef}
                type="button"
                onClick={() => {
                    setExpanded((v) => !v);
                    if (!expanded) {
                        fetchConversations();
                        setActiveConversation(null);
                    } else {
                        setActiveConversation(null);
                    }
                }}
                className="relative pointer-events-auto flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 shadow-lg hover:shadow-xl transition-shadow"
                aria-expanded={expanded}
                aria-label="Mesajlar"
            >
                <FaPaperPlane className="text-coral text-lg shrink-0" />
                <span className="font-semibold text-gray-800 dark:text-gray-100 text-sm whitespace-nowrap">
                    Mesajlar
                </span>
                {previewAvatars.length > 0 && (
                    <div className="flex items-center -space-x-2 shrink-0">
                        {previewAvatars.map((c, i) => (
                            <img
                                key={c.id || i}
                                src={
                                    ensureHttps(c.other_user?.avatar) ||
                                    'https://i.pravatar.cc/200?u=default'
                                }
                                alt=""
                                className="w-8 h-8 rounded-full object-cover border-2 border-white dark:border-gray-900 ring-1 ring-gray-200 dark:ring-gray-600"
                            />
                        ))}
                    </div>
                )}
                {totalUnread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[1.35rem] h-6 px-1.5 bg-coral text-white text-xs font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-gray-900">
                        {totalUnread > 99 ? '99+' : totalUnread}
                    </span>
                )}
            </button>
        </div>
    );
};

export default FloatingMessagesDock;
