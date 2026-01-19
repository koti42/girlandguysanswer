import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FaPaperPlane, FaArrowLeft } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';

const MessagesPage = () => {
    const { username } = useParams();
    const [messageText, setMessageText] = useState('');

    // Mock conversations
    const conversations = [
        {
            id: 1,
            username: 'Elif_Mavi',
            name: 'Elif Mavi',
            avatar: 'https://i.pravatar.cc/150?u=m1',
            lastMessage: 'Teşekkürler, çok yardımcı oldun!',
            time: '5 dk önce',
            unread: 2
        },
        {
            id: 2,
            username: 'Ahmet_K',
            name: 'Ahmet Kaya',
            avatar: 'https://i.pravatar.cc/150?u=m2',
            lastMessage: 'Yarın buluşalım mı?',
            time: '1 saat önce',
            unread: 0
        },
        {
            id: 3,
            username: 'Zeynep_Yildiz',
            name: 'Zeynep Yıldız',
            avatar: 'https://i.pravatar.cc/150?u=m3',
            lastMessage: 'Elbise harikaydı!',
            time: '3 saat önce',
            unread: 1
        }
    ];

    // Mock messages
    const messages = [
        {
            id: 1,
            sender: 'Elif_Mavi',
            content: 'Merhaba! Düğün için elbise öneriniz için çok teşekkürler.',
            time: '10:30',
            isMine: false
        },
        {
            id: 2,
            sender: 'me',
            content: 'Rica ederim! Beğenmene sevindim, umarım düğün çok güzel geçer 😊',
            time: '10:32',
            isMine: true
        },
        {
            id: 3,
            sender: 'Elif_Mavi',
            content: 'Daha fazla bilgi için senden tekrar danışabilir miyim?',
            time: '10:35',
            isMine: false
        },
        {
            id: 4,
            sender: 'me',
            content: 'Tabii ki! Her zaman yardımcı olmaktan mutluluk duyarım.',
            time: '10:36',
            isMine: true
        }
    ];

    const activeConversation = conversations.find(c => c.username === (username || 'Elif_Mavi'));

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (messageText.trim()) {
            console.log('Mesaj gönderildi:', messageText);
            setMessageText('');
        }
    };

    return (
        <MainLayout>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft overflow-hidden" style={{ height: 'calc(100vh - 200px)' }}>
                <div className="flex h-full">
                    {/* Conversations List */}
                    <div className="w-full md:w-1/3 border-r border-gray-200 dark:border-gray-700 flex flex-col">
                        {/* Header */}
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-xl font-bold text-gray-800 dark:text-white">Mesajlar</h2>
                        </div>

                        {/* Conversation List */}
                        <div className="flex-1 overflow-y-auto">
                            {conversations.map(conv => (
                                <Link
                                    key={conv.id}
                                    to={`/messages/${conv.username}`}
                                    className={`flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700 ${conv.username === (username || 'Elif_Mavi') ? 'bg-coral/5 dark:bg-coral/10' : ''
                                        }`}
                                >
                                    <img src={conv.avatar} alt={conv.name} className="w-12 h-12 rounded-full" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <h3 className="font-semibold text-gray-800 dark:text-white truncate">{conv.name}</h3>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">{conv.time}</span>
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{conv.lastMessage}</p>
                                    </div>
                                    {conv.unread > 0 && (
                                        <div className="bg-coral text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                            {conv.unread}
                                        </div>
                                    )}
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Chat Area */}
                    {activeConversation ? (
                        <div className="flex-1 flex flex-col">
                            {/* Chat Header */}
                            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
                                <Link to="/messages" className="md:hidden text-gray-600 dark:text-gray-400">
                                    <FaArrowLeft />
                                </Link>
                                <img src={activeConversation.avatar} alt={activeConversation.name} className="w-10 h-10 rounded-full" />
                                <div>
                                    <h3 className="font-semibold text-gray-800 dark:text-white">{activeConversation.name}</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">@{activeConversation.username}</p>
                                </div>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {messages.map(msg => (
                                    <div key={msg.id} className={`flex ${msg.isMine ? 'justify-end' : 'justify-start'}`}>
                                        <div
                                            className={`max-w-[70%] rounded-2xl px-4 py-2 ${msg.isMine
                                                ? 'bg-gradient-to-r from-coral to-orange-400 text-white'
                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white'
                                                }`}
                                        >
                                            <p className="text-sm">{msg.content}</p>
                                            <span className={`text-xs block mt-1 ${msg.isMine ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
                                                {msg.time}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Message Input */}
                            <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 dark:border-gray-700">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={messageText}
                                        onChange={(e) => setMessageText(e.target.value)}
                                        placeholder="Mesajınızı yazın..."
                                        className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!messageText.trim()}
                                        className="bg-gradient-to-r from-coral to-orange-400 text-white p-3 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <FaPaperPlane />
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                            <p className="text-gray-400 dark:text-gray-500">Bir sohbet seçin</p>
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
};

export default MessagesPage;
