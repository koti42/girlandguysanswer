import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaSearch, FaCircle } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import ChatWindow from '../components/ChatWindow';
import { messagesAPI, usersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { subscribeToUserChannel, unsubscribeFromChannel } from '../services/pusherClient';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';

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

    // Helper to ensure HTTPS
    const ensureHttps = (url) => {
        if (!url) return url;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        return `https://${url}`;
    };

    useEffect(() => {
        fetchConversations();
        setupPusher();

        return () => {
            if (user) {
                unsubscribeFromChannel(user.id);
            }
        };
    }, [user]);

    useEffect(() => {
        if (username && conversations.length > 0) {
            const conversation = conversations.find(
                c => c.other_user.username === username
            );
            if (conversation) {
                setActiveConversation(conversation);
                setShowMobileChat(true);
            } else {
                // No existing conversation, fetch user info to start new conversation
                fetchUserForNewConversation(username);
            }
        } else if (username && !loading && conversations.length === 0) {
            // No conversations at all, fetch user info
            fetchUserForNewConversation(username);
        }
    }, [username, conversations, loading]);

    const fetchUserForNewConversation = async (targetUsername) => {
        try {
            setLoadingNewConversation(true);
            const response = await usersAPI.getProfile(targetUsername);
            const userData = response.data.data;

            // Create a temporary conversation object
            const tempConversation = {
                id: null, // No conversation ID yet
                other_user: {
                    id: userData.id,
                    username: userData.username,
                    avatar: userData.avatar || 'https://i.pravatar.cc/200?u=default'
                },
                latest_message: null,
                unread_count: 0,
                last_message_at: null
            };

            setActiveConversation(tempConversation);
            setShowMobileChat(true);
        } catch (error) {
            console.error('Error fetching user for new conversation:', error);
            // User not found, redirect back to messages
            navigate('/messages');
        } finally {
            setLoadingNewConversation(false);
        }
    };

    const setupPusher = () => {
        if (!user) return;

        subscribeToUserChannel(user.id, {
            onNewMessage: (data) => {
                handleNewMessageEvent(data.message);
            }
        });
    };

    const fetchConversations = async () => {
        try {
            setLoading(true);
            const response = await messagesAPI.getConversations();
            setConversations(response.data.data || []);
        } catch (error) {
            console.error('Error fetching conversations:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleNewMessageEvent = (message) => {
        // Update the conversation list with new message
        setConversations(prevConversations => {
            const conversationIndex = prevConversations.findIndex(
                c => c.id === message.conversation_id
            );

            if (conversationIndex !== -1) {
                const updatedConversations = [...prevConversations];
                updatedConversations[conversationIndex] = {
                    ...updatedConversations[conversationIndex],
                    latest_message: {
                        ...message,
                        is_mine: message.sender_id === user.id
                    },
                    last_message_at: message.created_at,
                    unread_count: activeConversation?.id === message.conversation_id
                        ? 0
                        : (updatedConversations[conversationIndex].unread_count || 0) + 1
                };
                // Move updated conversation to top
                const [movedConv] = updatedConversations.splice(conversationIndex, 1);
                return [movedConv, ...updatedConversations];
            }

            return prevConversations;
        });
    };

    const handleConversationClick = (conversation) => {
        setActiveConversation(conversation);
        setShowMobileChat(true);
        navigate(`/messages/${conversation.other_user.username}`);

        // Mark as read
        setConversations(prev =>
            prev.map(conv =>
                conv.id === conversation.id
                    ? { ...conv, unread_count: 0 }
                    : conv
            )
        );
    };

    const handleBack = () => {
        setShowMobileChat(false);
        navigate('/messages');
    };

    const handleNewMessage = (newMessage, conversationData) => {
        // Update conversations list with the new message
        setConversations(prevConversations => {
            const conversationIndex = prevConversations.findIndex(
                c => c.id === (conversationData?.id || activeConversation?.id)
            );

            if (conversationIndex !== -1) {
                // Update existing conversation
                const updatedConversations = [...prevConversations];
                updatedConversations[conversationIndex] = {
                    ...updatedConversations[conversationIndex],
                    latest_message: {
                        ...newMessage,
                        is_mine: newMessage.sender_id === user.id
                    },
                    last_message_at: newMessage.created_at
                };
                // Move to top
                const [movedConv] = updatedConversations.splice(conversationIndex, 1);
                return [movedConv, ...updatedConversations];
            } else if (conversationData) {
                // Add new conversation to the list
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

        // Update active conversation if it exists
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
            default:
                return message.content || 'Mesaj';
        }
    };

    return (
        <MainLayout sidebar={null}>
            <div className="flex h-[calc(100vh-80px)] md:h-[calc(100vh-100px)] bg-white dark:bg-gray-900 rounded-2xl shadow-lg overflow-hidden">
                {/* Conversations List */}
                <div className={`w-full md:w-96 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col ${showMobileChat ? 'hidden md:flex' : 'flex'}`}>
                    {/* Header */}
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">
                            Mesajlar
                        </h2>

                        {/* Search */}
                        <div className="relative">
                            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Ara..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-700 border-none rounded-xl text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-coral"
                            />
                        </div>
                    </div>

                    {/* Conversations */}
                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex justify-center items-center h-full">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div>
                            </div>
                        ) : filteredConversations.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                                <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                                    <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    {searchQuery ? 'Sonuç bulunamadı' : 'Henüz mesaj yok'}
                                </h3>
                                <p className="text-gray-500 dark:text-gray-400 text-sm">
                                    {searchQuery ? 'Farklı bir arama deneyin' : 'Bir kullanıcının profilinden mesaj göndererek başlayın'}
                                </p>
                            </div>
                        ) : (
                            filteredConversations.map(conversation => (
                                <div
                                    key={conversation.id}
                                    onClick={() => handleConversationClick(conversation)}
                                    className={`p-4 border-b border-gray-100 dark:border-gray-700 cursor-pointer transition-colors ${activeConversation?.id === conversation.id
                                        ? 'bg-coral/10 dark:bg-coral/20'
                                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                        }`}
                                >
                                    <div className="flex items-start gap-3">
                                        {/* Avatar */}
                                        <div className="relative flex-shrink-0">
                                            <img
                                                src={ensureHttps(conversation.other_user.avatar) || 'https://i.pravatar.cc/200?u=default'}
                                                alt={conversation.other_user.username}
                                                className="w-14 h-14 rounded-full object-cover"
                                            />
                                            <FaCircle className="absolute bottom-0 right-0 text-green-500 text-xs border-2 border-white dark:border-gray-800 rounded-full" />
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <h3 className="font-semibold text-gray-800 dark:text-white truncate">
                                                    {conversation.other_user.username}
                                                </h3>
                                                {conversation.latest_message && (
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">
                                                        {formatDistanceToNow(new Date(conversation.latest_message.created_at), {
                                                            locale: tr,
                                                            addSuffix: true
                                                        })}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <p className={`text-sm truncate ${conversation.unread_count > 0
                                                    ? 'text-gray-800 dark:text-gray-200 font-semibold'
                                                    : 'text-gray-500 dark:text-gray-400'
                                                    }`}>
                                                    {conversation.latest_message?.is_mine && 'Siz: '}
                                                    {renderMessagePreview(conversation.latest_message)}
                                                </p>
                                                {conversation.unread_count > 0 && (
                                                    <span className="ml-2 bg-coral text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                                                        {conversation.unread_count}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Chat Window */}
                <div className={`flex-1 ${showMobileChat ? 'flex' : 'hidden md:flex'}`}>
                    <ChatWindow
                        conversation={activeConversation}
                        onBack={handleBack}
                        onNewMessage={handleNewMessage}
                    />
                </div>
            </div>
        </MainLayout>
    );
};

export default MessagesPage;
