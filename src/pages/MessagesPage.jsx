import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaSearch } from 'react-icons/fa';
import ChatWindow from '../components/ChatWindow';
import BottomNav from '../components/BottomNav';
import MainLayout from '../layouts/MainLayout';
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
            const conversation = conversations.find(c => c.other_user.username === username);
            if (conversation) {
                setActiveConversation(conversation);
                setShowMobileChat(true);
            } else {
                fetchUserForNewConversation(username);
            }
        } else if (username && !loading && conversations.length === 0) {
            fetchUserForNewConversation(username);
        }
    }, [username, conversations, loading]);

    const setupPusher = () => {
        if (!user) return;

        subscribeToUserChannel(user.id, {
            onNewMessage: handleNewMessageEvent
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
            const response = await usersAPI.getUserProfile(username);
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

    const handleNewMessageEvent = (message) => {
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
            default:
                return message.content || 'Mesaj';
        }
    };

    return (
        <MainLayout>
            <div className="flex flex-col h-[calc(100vh-80px)] bg-white">
                {/* Main Content Area */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Conversations List Sidebar */}
                    <div className={`${showMobileChat ? 'hidden' : 'flex'} md:flex flex-col w-full md:w-96 h-full bg-white border-r border-gray-200`}>
                        <div className="flex-shrink-0 p-4 border-b border-gray-200">
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">
                                Mesajlar
                            </h2>

                            <div className="relative">
                                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Ara..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-coral"
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
                                filteredConversations.map((conversation) => (
                                    <div
                                        key={conversation.id}
                                        onClick={() => handleConversationClick(conversation)}
                                        className={`flex items-center gap-3 p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100 transition-colors ${activeConversation?.id === conversation.id ? 'bg-gray-50' : ''
                                            }`}
                                    >
                                        <div className="relative">
                                            <img
                                                src={ensureHttps(conversation.other_user.avatar) || 'https://i.pravatar.cc/200?u=default'}
                                                alt={conversation.other_user.username}
                                                className="w-14 h-14 rounded-full object-cover"
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
                                                <h3 className="font-semibold text-gray-800 truncate">
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
                                            <p className={`text-sm truncate ${conversation.unread_count > 0 ? 'text-gray-800 font-medium' : 'text-gray-500'
                                                }`}>
                                                {conversation.latest_message?.is_mine && 'Siz: '}
                                                {renderMessagePreview(conversation.latest_message)}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Chat Window Area */}
                    <div className={`${showMobileChat ? 'flex' : 'hidden'} md:flex flex-col flex-1 h-full bg-white`}>
                        <ChatWindow
                            conversation={activeConversation}
                            onBack={handleBack}
                            onNewMessage={handleNewMessage}
                        />
                    </div>
                </div>

                {/* Bottom Navigation - Fixed at bottom */}
                <div className="flex-shrink-0 w-full">
                    <BottomNav />
                </div>
            </div>
        </MainLayout>
    );
};

export default MessagesPage;
