import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FaPaperPlane, FaArrowLeft, FaImage, FaMicrophone, FaPaperclip, FaSmile, FaTimes, FaPlay, FaPause, FaFileAlt } from 'react-icons/fa';
import Header from '../components/Header';

const MessagesPage = () => {
    const { username } = useParams();
    const [messageText, setMessageText] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [attachedFile, setAttachedFile] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [showChatOnMobile, setShowChatOnMobile] = useState(!!username);

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

    // Mock messages with different types
    const messages = [
        {
            id: 1,
            sender: 'Elif_Mavi',
            content: 'Merhaba! Düğün için elbise öneriniz için çok teşekkürler.',
            time: '10:30',
            isMine: false,
            type: 'text'
        },
        {
            id: 2,
            sender: 'me',
            content: 'Rica ederim! Beğenmene sevindim, umarım düğün çok güzel geçer 😊',
            time: '10:32',
            isMine: true,
            type: 'text'
        },
        {
            id: 3,
            sender: 'Elif_Mavi',
            content: 'https://i.pravatar.cc/400?u=dress',
            time: '10:35',
            isMine: false,
            type: 'image'
        },
        {
            id: 4,
            sender: 'me',
            content: 'Çok şık! Bu tam sana göre 💕',
            time: '10:36',
            isMine: true,
            type: 'text'
        },
        {
            id: 5,
            sender: 'Elif_Mavi',
            content: 'voice_sample.mp3',
            time: '10:38',
            isMine: false,
            type: 'voice',
            duration: '0:12'
        }
    ];

    const activeConversation = conversations.find(c => c.username === (username || 'Elif_Mavi'));

    const emojis = ['😊', '❤️', '👍', '😂', '🎉', '💕', '🔥', '✨', '🥰', '😍', '👏', '🙌'];

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (messageText.trim() || attachedFile) {
            console.log('Mesaj gönderildi:', messageText, attachedFile);
            setMessageText('');
            setAttachedFile(null);
            setShowEmojiPicker(false);
        }
    };

    const handleFileAttach = (e, type) => {
        const file = e.target.files[0];
        if (file) {
            setAttachedFile({
                name: file.name,
                type: type,
                url: URL.createObjectURL(file),
                size: (file.size / 1024).toFixed(2) + ' KB'
            });
        }
    };

    const handleVoiceRecord = () => {
        setIsRecording(!isRecording);
        // Voice recording logic would go here
        console.log(isRecording ? 'Kayıt durduruluyor...' : 'Kayıt başlıyor...');
    };

    const addEmoji = (emoji) => {
        setMessageText(prev => prev + emoji);
    };

    const renderMessageContent = (msg) => {
        switch (msg.type) {
            case 'image':
                return (
                    <div className="rounded-xl overflow-hidden max-w-xs">
                        <img src={msg.content} alt="Shared" className="w-full h-auto" />
                    </div>
                );
            case 'voice':
                return (
                    <div className="flex items-center gap-3 min-w-[200px]">
                        <button className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors">
                            <FaPlay className="text-sm" />
                        </button>
                        <div className="flex-1 h-8 bg-white/20 rounded-full flex items-center px-2">
                            <div className="h-1 bg-white/40 rounded-full w-2/3"></div>
                        </div>
                        <span className="text-xs opacity-80">{msg.duration}</span>
                    </div>
                );
            case 'file':
                return (
                    <div className="flex items-center gap-3 p-3 bg-white/10 rounded-xl min-w-[250px]">
                        <FaFileAlt className="text-2xl" />
                        <div className="flex-1">
                            <p className="text-sm font-medium">{msg.fileName}</p>
                            <p className="text-xs opacity-70">{msg.fileSize}</p>
                        </div>
                    </div>
                );
            default:
                return <p className="text-sm">{msg.content}</p>;
        }
    };

    return (
        <div className="min-h-screen bg-background dark:bg-gray-900">
            <Header />
            {/* Centered container with larger max-width for messaging */}
            <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-6">
                {/* Full screen container */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft overflow-hidden" style={{ height: 'calc(100vh - 140px)' }}>
                    <div className="flex h-full">
                        {/* Conversations List - Hidden on mobile when chat is open */}
                        <div className={`w-full md:w-1/3 lg:w-1/4 border-r border-gray-200 dark:border-gray-700 flex flex-col ${showChatOnMobile ? 'hidden md:flex' : 'flex'
                            }`}>
                            {/* Header */}
                            <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-coral/5 to-orange-400/5 dark:from-coral/10 dark:to-orange-400/10">
                                <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                    💬 Mesajlar
                                </h2>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{conversations.length} sohbet</p>
                            </div>

                            {/* Conversation List */}
                            <div className="flex-1 overflow-y-auto">
                                {conversations.map(conv => (
                                    <Link
                                        key={conv.id}
                                        to={`/messages/${conv.username}`}
                                        onClick={() => setShowChatOnMobile(true)}
                                        className={`flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700 ${conv.username === (username || 'Elif_Mavi') ? 'bg-coral/5 dark:bg-coral/10 border-l-4 border-l-coral' : ''
                                            }`}
                                    >
                                        <div className="relative">
                                            <img src={conv.avatar} alt={conv.name} className="w-14 h-14 rounded-full border-2 border-gray-100 dark:border-gray-600" />
                                            <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-gray-800"></div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <h3 className="font-semibold text-gray-800 dark:text-white truncate">{conv.name}</h3>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">{conv.time}</span>
                                            </div>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{conv.lastMessage}</p>
                                        </div>
                                        {conv.unread > 0 && (
                                            <div className="bg-coral text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                                                {conv.unread}
                                            </div>
                                        )}
                                    </Link>
                                ))}
                            </div>
                        </div>

                        {/* Chat Area - Full width on mobile when open */}
                        <div className={`flex-1 flex flex-col ${!username || !showChatOnMobile ? 'hidden md:flex' : 'flex'
                            }`}>
                            {activeConversation ? (
                                <div className="flex-1 flex flex-col">
                                    {/* Chat Header */}
                                    <div className="p-4 md:p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gradient-to-r from-coral/5 to-orange-400/5 dark:from-coral/10 dark:to-orange-400/10">
                                        <div className="flex items-center gap-3">
                                            {/* Back button for mobile */}
                                            <button
                                                onClick={() => setShowChatOnMobile(false)}
                                                className="md:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                                            >
                                                <FaArrowLeft className="text-gray-600 dark:text-gray-400" />
                                            </button>
                                            <img src={activeConversation.avatar} alt={activeConversation.name} className="w-12 h-12 rounded-full border-2 border-coral/20" />
                                            <div>
                                                <h3 className="font-bold text-gray-800 dark:text-white text-lg">{activeConversation.name}</h3>
                                                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                                    Çevrimiçi
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Messages */}
                                    <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50 dark:bg-gray-900/50">
                                        {messages.map(msg => (
                                            <div key={msg.id} className={`flex ${msg.isMine ? 'justify-end' : 'justify-start'} animate-fadeIn`}>
                                                <div
                                                    className={`max-w-[70%] rounded-2xl px-5 py-3 ${msg.isMine
                                                        ? 'bg-gradient-to-r from-coral to-orange-400 text-white shadow-lg'
                                                        : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-white shadow-md'
                                                        }`}
                                                >
                                                    {renderMessageContent(msg)}
                                                    <span className={`text-xs block mt-2 ${msg.isMine ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
                                                        {msg.time}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Attached File Preview */}
                                    {attachedFile && (
                                        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                                            <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-700 rounded-xl">
                                                {attachedFile.type === 'image' ? (
                                                    <img src={attachedFile.url} alt="Preview" className="w-16 h-16 rounded-lg object-cover" />
                                                ) : (
                                                    <div className="w-16 h-16 bg-coral/10 rounded-lg flex items-center justify-center">
                                                        <FaFileAlt className="text-2xl text-coral" />
                                                    </div>
                                                )}
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{attachedFile.name}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">{attachedFile.size}</p>
                                                </div>
                                                <button
                                                    onClick={() => setAttachedFile(null)}
                                                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                                                >
                                                    <FaTimes className="text-gray-500 dark:text-gray-400" />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Message Input */}
                                    <form onSubmit={handleSendMessage} className="p-5 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                                        <div className="flex gap-3 items-end">
                                            {/* Attachment Buttons */}
                                            <div className="flex gap-2">
                                                <label className="p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors cursor-pointer text-gray-600 dark:text-gray-400 hover:text-coral dark:hover:text-coral">
                                                    <FaImage className="text-xl" />
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={(e) => handleFileAttach(e, 'image')}
                                                        className="hidden"
                                                    />
                                                </label>
                                                <label className="p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors cursor-pointer text-gray-600 dark:text-gray-400 hover:text-coral dark:hover:text-coral">
                                                    <FaPaperclip className="text-xl" />
                                                    <input
                                                        type="file"
                                                        onChange={(e) => handleFileAttach(e, 'file')}
                                                        className="hidden"
                                                    />
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={handleVoiceRecord}
                                                    className={`p-3 rounded-xl transition-all ${isRecording
                                                        ? 'bg-red-500 text-white animate-pulse'
                                                        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-coral dark:hover:text-coral'
                                                        }`}
                                                >
                                                    <FaMicrophone className="text-xl" />
                                                </button>
                                            </div>

                                            {/* Input Area */}
                                            <div className="flex-1 relative">
                                                <input
                                                    type="text"
                                                    value={messageText}
                                                    onChange={(e) => setMessageText(e.target.value)}
                                                    placeholder="Mesajınızı yazın..."
                                                    className="w-full px-5 py-3 pr-12 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-2 focus:ring-coral/20 transition-all text-sm"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-coral transition-colors"
                                                >
                                                    <FaSmile className="text-xl" />
                                                </button>

                                                {/* Emoji Picker */}
                                                {showEmojiPicker && (
                                                    <div className="absolute bottom-full right-0 mb-2 bg-white dark:bg-gray-700 rounded-xl shadow-lg p-3 grid grid-cols-6 gap-2 border border-gray-200 dark:border-gray-600">
                                                        {emojis.map((emoji, idx) => (
                                                            <button
                                                                key={idx}
                                                                type="button"
                                                                onClick={() => addEmoji(emoji)}
                                                                className="text-2xl hover:scale-125 transition-transform"
                                                            >
                                                                {emoji}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Send Button */}
                                            <button
                                                type="submit"
                                                disabled={!messageText.trim() && !attachedFile}
                                                className="bg-gradient-to-r from-coral to-orange-400 text-white p-4 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                            >
                                                <FaPaperPlane className="text-lg" />
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            ) : (
                                <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                                    <div className="text-center">
                                        <div className="text-6xl mb-4">💬</div>
                                        <p className="text-gray-400 dark:text-gray-500 text-lg">Bir sohbet seçin</p>
                                        <p className="text-gray-300 dark:text-gray-600 text-sm mt-2">Mesajlaşmaya başlamak için soldaki listeden birini seçin</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MessagesPage;
```
