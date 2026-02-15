import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaSearch, FaTrash } from 'react-icons/fa';
import ChatWindow from '../components/ChatWindow';
import ConfirmationModal from '../components/ConfirmationModal';
import BottomNav from '../components/BottomNav';
import MainLayout from '../layouts/MainLayout';
import { messagesAPI, usersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { subscribeToUserChannel, unsubscribeFromChannel } from '../services/pusherClient';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import OnlineIndicator from '../components/OnlineIndicator';

const DEFAULT_PAGE_TITLE = 'Herkesler Soruyor';
const NEW_MESSAGE_TITLE = 'Yeni mesajınız var - Herkesler Soruyor';
const TYPING_RESET_MS = 3000;

const MessagesPage = () => {
    const { username } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [conversations, setConversations] = useState([]);
    const [activeConversation, setActiveConversation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingNewConversation, setLoadingNewConversation] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showMobileChat, setShowMobileChat] = useState(false);
    const [conversationToDelete, setConversationToDelete] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [typingByConversationId, setTypingByConversationId] = useState({});
    const typingTimeoutsRef = useRef({});
    const activeConversationRef = React.useRef(activeConversation);

    useEffect(() => {
        activeConversationRef.current = activeConversation;
    }, [activeConversation]);

    const ensureHttps = (url) => {
        if (!url) return url;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        return `https://${url}`;
    };

    useEffect(() => {
        fetchConversations();
        setupPusher();

        return () => {
            Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
            typingTimeoutsRef.current = {};
            if (user) {
                unsubscribeFromChannel(user.id);
            }
        };
    }, [user]);

    useEffect(() => {
        if (username && conversations.length > 0) {
            const conversation = conversations.find(c => c.other_user.username === username);
            if (conversation) {
                setActiveConversation(conversation);
                setShowMobileChat(true);
            } else {
                fetchUserForNewConversation(username);
            }
        } else if (username && !loading && conversations.length === 0) {
            fetchUserForNewConversation(username);
        } else if (!username) {
            setActiveConversation(null);
            setShowMobileChat(false);
        }
    }, [username, conversations, loading]);

    const setupPusher = () => {
        if (!user) return;

        subscribeToUserChannel(user.id, {
            onNewMessage: (data) => handleNewMessageEvent(data.message || data),
            onUserTyping: (data) => {
                if (data.user_id === user.id) return;
                const convId = data.conversation_id;
                if (typingTimeoutsRef.current[convId]) {
                    clearTimeout(typingTimeoutsRef.current[convId]);
                    delete typingTimeoutsRef.current[convId];
                }
                if (data.typing) {
                    const usernameTyping = data.username || null;
                    setTypingByConversationId(prev => ({ ...prev, [convId]: usernameTyping }));
                    typingTimeoutsRef.current[convId] = setTimeout(() => {
                        delete typingTimeoutsRef.current[convId];
                        setTypingByConversationId(prev => {
                            const next = { ...prev };
                            delete next[convId];
                            return next;
                        });
                    }, TYPING_RESET_MS);
                } else {
                    setTypingByConversationId(prev => {
                        const next = { ...prev };
                        delete next[convId];
                        return next;
                    });
                }
            }
        });
    };

    const fetchConversations = async () => {
        try {
            setLoading(true);
            const response = await messagesAPI.getConversations();
            const conversationsData = response.data.data || [];
            setConversations(conversationsData);
        } catch (error) {
            console.error('Error fetching conversations:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchUserForNewConversation = async (username) => {
        try {
            setLoadingNewConversation(true);
            const response = await usersAPI.getProfile(username);
            const userData = response.data.data;

            const tempConversation = {
                id: null,
                other_user: {
                    id: userData.id,
                    username: userData.username,
                    avatar: userData.avatar,
                    gender: userData.gender
                },
                latest_message: null,
                unread_count: 0
            };

            setActiveConversation(tempConversation);
            setShowMobileChat(true);
        } catch (error) {
            console.error('Error fetching user:', error);
            navigate('/messages');
        } finally {
            setLoadingNewConversation(false);
        }
    };

    useEffect(() => {
        const totalUnread = conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0);
        
        if (totalUnread > 0) {
            document.title = `(${totalUnread}) ${NEW_MESSAGE_TITLE}`;
        } else {
            document.title = DEFAULT_PAGE_TITLE;
        }
    }, [conversations]);

    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                const totalUnread = conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0);
                if (totalUnread > 0) {
                    document.title = `(${totalUnread}) ${NEW_MESSAGE_TITLE}`;
                } else {
                    document.title = DEFAULT_PAGE_TITLE;
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [conversations]);

    const handleNewMessageEvent = (message) => {
        const isActiveConversation = activeConversationRef.current?.id === message.conversation_id;
        const isOwnMessage = message.sender_id === user?.id;

        setConversations(prevConversations => {
            const conversationIndex = prevConversations.findIndex(
                c => c.id === message.conversation_id
            );

            let finalConversations;
            
            if (conversationIndex !== -1) {
                const updatedConversations = [...prevConversations];
                const currentUnread = updatedConversations[conversationIndex].unread_count || 0;
                const newUnreadCount = isActiveConversation
                    ? 0
                    : (isOwnMessage ? currentUnread : currentUnread + 1);
                
                updatedConversations[conversationIndex] = {
                    ...updatedConversations[conversationIndex],
                    latest_message: {
                        ...message,
                        is_mine: isOwnMessage
                    },
                    last_message_at: message.created_at,
                    unread_count: newUnreadCount
                };
                const [movedConv] = updatedConversations.splice(conversationIndex, 1);
                finalConversations = [movedConv, ...updatedConversations];
            } else {
                finalConversations = prevConversations;
            }
            
            const totalUnread = finalConversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0);
            if (totalUnread > 0 && !isOwnMessage) {
                document.title = `(${totalUnread}) ${NEW_MESSAGE_TITLE}`;
            } else if (totalUnread === 0) {
                document.title = DEFAULT_PAGE_TITLE;
            }
            
            return finalConversations;
        });
    };

    const handleConversationClick = (conversation) => {
        setActiveConversation(conversation);
        setShowMobileChat(true);
        navigate(`/messages/${conversation.other_user.username}`);

        setConversations(prev =>
            prev.map(conv =>
                conv.id === conversation.id
                    ? { ...conv, unread_count: 0 }
                    : conv
            )
        );
    };

    const handleBack = () => {
        setActiveConversation(null);
        setShowMobileChat(false);
        navigate('/messages');
    };

    const handleNewMessage = (newMessage, conversationData) => {
        setConversations(prevConversations => {
            const conversationIndex = prevConversations.findIndex(
                c => c.id === (conversationData?.id || activeConversation?.id)
            );

            if (conversationIndex !== -1) {
                const updatedConversations = [...prevConversations];
                updatedConversations[conversationIndex] = {
                    ...updatedConversations[conversationIndex],
                    latest_message: {
                        ...newMessage,
                        is_mine: newMessage.sender_id === user.id
                    },
                    last_message_at: newMessage.created_at
                };
                const [movedConv] = updatedConversations.splice(conversationIndex, 1);
                return [movedConv, ...updatedConversations];
            } else if (conversationData) {
                return [{
                    id: conversationData.id,
                    other_user: conversationData.other_user || activeConversation.other_user,
                    latest_message: {
                        ...newMessage,
                        is_mine: newMessage.sender_id === user.id
                    },
                    last_message_at: newMessage.created_at,
                    unread_count: 0
                }, ...prevConversations];
            }
            return prevConversations;
        });

        if (conversationData && !activeConversation?.id) {
            setActiveConversation({
                ...activeConversation,
                id: conversationData.id,
                latest_message: {
                    ...newMessage,
                    is_mine: newMessage.sender_id === user.id
                },
                last_message_at: newMessage.created_at
            });
        }
    };

    const filteredConversations = conversations.filter(conv =>
        conv.other_user.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const renderMessagePreview = (message) => {
        if (!message) return 'Henüz mesaj yok';

        switch (message.type) {
            case 'image':
                return '📷 Fotoğraf';
            case 'audio':
                return '🎵 Ses dosyası';
            case 'gif':
                return 'GIF';
            case 'sticker':
                return 'Çıkartma';
            default:
                return message.content || 'Mesaj';
        }
    };

    return (
        <MainLayout noMobilePadding={true}>
            <div className="flex flex-col h-[calc(100vh-80px)] bg-white dark:bg-gray-900 w-full">
                {/* Main Content Area - mobilde altta oval geçiş için yuvarlatılmış */}
                <div className="flex-1 flex overflow-hidden md:rounded-none rounded-b-2xl">
                    {/* Conversations List Sidebar */}
                    <div className={`${showMobileChat ? 'hidden' : 'flex'} md:flex flex-col w-full md:w-96 h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800`}>
                        <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-800">
                            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">
                                Mesajlar
                            </h2>

                            <div className="relative">
                                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Ara..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border-none rounded-xl text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {loading ? (
                                <div className="flex justify-center items-center h-full">
                                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-coral"></div>
                                </div>
                            ) : filteredConversations.length === 0 ? (
                                <div className="flex justify-center items-center h-full">
                                    <p className="text-gray-500">Henüz mesaj yok</p>
                                </div>
                            ) : (
                                filteredConversations.map((conversation) => {
                                    const otherGender = conversation.other_user?.gender;
                                    const isFemale = otherGender === 'female' || otherGender === 'kiz' || otherGender === 'kadın' || otherGender === 'woman';
                                    const rowAccentClass = isFemale
                                        ? 'border-l-4 border-l-pink-400 dark:border-l-pink-500'
                                        : 'border-l-4 border-l-blue-400 dark:border-l-blue-500';
                                    return (
                                    <div
                                        key={conversation.id}
                                        onClick={() => handleConversationClick(conversation)}
                                        className={`flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer border-b border-gray-100 dark:border-gray-800 transition-colors group ${rowAccentClass} ${activeConversation?.id === conversation.id ? 'bg-gray-50 dark:bg-gray-800' : ''
                                            }`}
                                    >
                                        <div className="relative">
                                            <img
                                                src={ensureHttps(conversation.other_user.avatar) || 'https://i.pravatar.cc/200?u=default'}
                                                alt={conversation.other_user.username}
                                                className="w-14 h-14 rounded-full object-cover"
                                            />
                                            <OnlineIndicator
                                                isOnline={conversation.other_user.is_online}
                                                size="md"
                                                className="absolute bottom-0 right-0"
                                            />
                                            {conversation.unread_count > 0 && (
                                                <div className="absolute -top-1 -right-1 w-6 h-6 bg-coral rounded-full flex items-center justify-center">
                                                    <span className="text-white text-xs font-bold">
                                                        {conversation.unread_count}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-baseline mb-1">
                                                <h3 className="font-semibold text-gray-800 dark:text-gray-100 truncate">
                                                    {conversation.other_user.username}
                                                </h3>
                                                {conversation.last_message_at && (
                                                    <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                                                        {formatDistanceToNow(new Date(conversation.last_message_at), {
                                                            addSuffix: false,
                                                            locale: tr
                                                        })}
                                                    </span>
                                                )}
                                            </div>
                                            <p className={`text-sm truncate ${conversation.unread_count > 0 ? 'text-gray-800 dark:text-gray-100 font-medium' : 'text-gray-500 dark:text-gray-400'
                                                }`}>
                                                {typingByConversationId[conversation.id] !== undefined ? (
                                                    <span className="italic text-coral">{(typingByConversationId[conversation.id] || conversation.other_user?.username) || 'Birisi'} yazıyor...</span>
                                                ) : (
                                                    <>
                                                        {conversation.latest_message?.is_mine && 'Siz: '}
                                                        {renderMessagePreview(conversation.latest_message)}
                                                    </>
                                                )}
                                            </p>
                                        </div>

                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setConversationToDelete(conversation);
                                                setShowDeleteModal(true);
                                            }}
                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                                            title="Sohbeti Sil"
                                        >
                                            <FaTrash className="text-sm" />
                                        </button>
                                    </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Chat Window Area */}
                    <div className={`${showMobileChat ? 'flex' : 'hidden'} md:flex flex-col flex-1 h-full bg-white dark:bg-gray-900`}>
                        <ChatWindow
                            conversation={activeConversation}
                            onBack={handleBack}
                            onNewMessage={handleNewMessage}
                        />
                    </div>
                </div>

                {/* Bottom Navigation - Sadece mobilde göster, web'de gizle; üst kenarlar oval */}
                <div className="flex-shrink-0 w-full md:hidden px-2 pb-1">
                    <BottomNav />
                </div>

                <ConfirmationModal
                    isOpen={showDeleteModal}
                    onClose={() => {
                        setShowDeleteModal(false);
                        setConversationToDelete(null);
                    }}
                    onConfirm={async () => {
                        if (!conversationToDelete) return;
                        try {
                            await messagesAPI.deleteConversation(conversationToDelete.id);
                            // Remove from local list
                            setConversations(prev => prev.filter(c => c.id !== conversationToDelete.id));
                            // If deleted conversation was active, clear it
                            if (activeConversation?.id === conversationToDelete.id) {
                                setActiveConversation(null);
                                setShowMobileChat(false);
                            }
                        } catch (error) {
                            console.error('Error deleting conversation:', error);
                            alert('Sohbet silinirken bir hata oluştu.');
                        }
                    }}
                    title="Sohbeti Sil"
                    message={`@${conversationToDelete?.other_user?.username} ile olan tüm mesajlaşma geçmişinizi silmek istediğinize emin misiniz?`}
                    confirmText="Evet, Sil"
                    cancelText="Vazgeç"
                    isDangerous={true}
                />
            </div>
        </MainLayout>
    );
};

export default MessagesPage;
