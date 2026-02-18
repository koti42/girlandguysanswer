import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FaArrowLeft, FaTrash, FaSearch, FaFilePdf, FaBook } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { notificationToast } from '../utils/notificationToast';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput/index.jsx';
import ConfirmationModal from './ConfirmationModal';
import { messagesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { subscribeToUserChannel, unsubscribeFromChannel } from '../services/pusherClient';

const TYPING_RESET_MS = 3000;

const ChatWindow = ({ conversation, onBack, onNewMessage }) => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [hasMoreOlder, setHasMoreOlder] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearchInput, setShowSearchInput] = useState(false);
    const [replyingTo, setReplyingTo] = useState(null);
    const [highlightedMessageId, setHighlightedMessageId] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showNotebook, setShowNotebook] = useState(false);
    const [notes, setNotes] = useState([]);
    const [loadingNotes, setLoadingNotes] = useState(false);
    const [noteContent, setNoteContent] = useState('');
    const [noteVisibleToOther, setNoteVisibleToOther] = useState(false);
    const [editingNoteId, setEditingNoteId] = useState(null);
    const [editContent, setEditContent] = useState('');
    const [editVisibleToOther, setEditVisibleToOther] = useState(false);
    const [otherUserTyping, setOtherUserTyping] = useState(null);
    const typingResetRef = useRef(null);
    const loadingOlderRef = useRef(false);
    const prependScrollRef = useRef(null);
    const { user, permissions } = useAuth();
    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const conversationRef = useRef(conversation);
    const navigate = useNavigate();

    const canExportPdf = user?.username === 'Koti42' || permissions?.is_super_admin;

    const ensureHttps = (url) => {
        if (!url) return url;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        return `https://${url}`;
    };

    useEffect(() => {
        conversationRef.current = conversation;
        setMessages([]);
        setLoading(true);
        setReplyingTo(null);
        setOtherUserTyping(null);

        const abortController = new AbortController();

        if (conversation && conversation.id) {
            const convId = conversation.id;

            (async () => {
                try {
                    const response = await messagesAPI.getMessages(convId);
                    if (abortController.signal.aborted) return;
                    if (conversationRef.current?.id !== convId) return;
                    const data = response.data?.data || {};
                    setMessages(data.messages || []);
                    setHasMoreOlder(data.has_more !== false);
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
                .catch(() => { });
        } else if (conversation && !conversation.id) {
            setMessages([]);
            setLoading(false);
        }

        return () => abortController.abort();
    }, [conversation?.id]);

    const loadOlderMessages = useCallback(async () => {
        if (!conversation?.id || loadingOlderRef.current || !hasMoreOlder || messages.length === 0) return;
        loadingOlderRef.current = true;
        setLoadingOlder(true);
        const container = messagesContainerRef.current;
        const oldHeight = container?.scrollHeight ?? 0;
        const oldTop = container?.scrollTop ?? 0;
        const oldestId = messages[0]?.id;
        try {
            const response = await messagesAPI.getMessages(conversation.id, { before: oldestId });
            const data = response.data?.data || {};
            const older = data.messages || [];
            setHasMoreOlder(data.has_more !== false);
            setMessages(prev => [...older, ...prev]);
            prependScrollRef.current = { oldHeight, oldTop };
        } catch (err) {
            if (!err.response?.status === 404) console.error('Load older messages:', err);
        } finally {
            setLoadingOlder(false);
            loadingOlderRef.current = false;
        }
    }, [conversation?.id, hasMoreOlder, messages.length, messages[0]?.id]);

    useEffect(() => {
        if (!prependScrollRef.current || !messagesContainerRef.current) return;
        const container = messagesContainerRef.current;
        const { oldHeight, oldTop } = prependScrollRef.current;
        prependScrollRef.current = null;
        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight - oldHeight + oldTop;
        });
    }, [messages.length]);

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
                            .catch(() => { });
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
            },
            onUserTyping: (data) => {
                if (!conversationRef.current || data.conversation_id !== conversationRef.current.id) return;
                if (data.user_id === user.id) return;
                if (typingResetRef.current) clearTimeout(typingResetRef.current);
                setOtherUserTyping(data.typing ? (data.username || conversationRef.current.other_user?.username) : null);
                if (data.typing) {
                    typingResetRef.current = setTimeout(() => setOtherUserTyping(null), TYPING_RESET_MS);
                }
            },
            onMessageUpdated: (data) => {
                if (!conversationRef.current || data.message?.conversation_id !== conversationRef.current.id) return;
                setMessages(prev => prev.map(m =>
                    m.id === data.message.id
                        ? { ...m, content: data.message.content, edited_at: data.message.edited_at }
                        : m
                ));
            },
            onMessageDeleted: (data) => {
                if (!conversationRef.current || data.message?.conversation_id !== conversationRef.current.id) return;
                setMessages(prev => prev.map(m =>
                    m.id === data.message.id
                        ? { ...m, user_deleted_at: data.message.user_deleted_at }
                        : m
                ));
            },
            onMessageReaction: (data) => {
                if (!conversationRef.current || data.message?.conversation_id !== conversationRef.current.id) return;
                setMessages(prev => prev.map(m =>
                    m.id === data.message.id ? { ...m, reactions: data.message.reactions || [] } : m
                ));
            }
        });

        return () => {
            if (typingResetRef.current) clearTimeout(typingResetRef.current);
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

    const handleSendMessage = async ({ content, file, type, is_ephemeral, ephemeral_max_views }) => {
        if (!conversation) return;

        const replyToId = replyingTo?.id;
        setReplyingTo(null);

        const isGifOrSticker = type === 'gif' || type === 'sticker';
        const tempMessage = {
            id: `temp-${Date.now()}`,
            content: content || '',
            file_url: file ? URL.createObjectURL(file) : (isGifOrSticker ? content || null : null),
            type: type,
            sender_id: user.id,
            created_at: new Date().toISOString(),
            read_at: null,
            is_temp: true,
            is_ephemeral: is_ephemeral || false,
            ephemeral_max_views: ephemeral_max_views || null,
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
                    reply_to_message_id: replyToId
                });
            } else if (isGifOrSticker) {
                response = await messagesAPI.sendMessage({
                    receiver_id: conversationRef.current.other_user.id,
                    content,
                    type,
                    reply_to_message_id: replyToId
                });
            } else {
                const formData = new FormData();
                formData.append('receiver_id', conversationRef.current.other_user.id);
                formData.append('type', type);
                formData.append('file', file);
                if (content) formData.append('content', content);
                if (replyToId) formData.append('reply_to_message_id', replyToId);
                if (is_ephemeral) formData.append('is_ephemeral', '1');
                if (ephemeral_max_views) formData.append('ephemeral_max_views', ephemeral_max_views);

                response = await messagesAPI.sendFile(formData);
            }

            if (response.data?.success === false) {
                setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
                notificationToast.error(response.data?.message || 'Mesaj gönderilemedi.');
                return;
            }

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

    const handleDeleteMessage = useCallback(async (msg) => {
        try {
            const res = await messagesAPI.deleteMessage(msg.id);
            const updated = res.data?.data?.message;
            if (updated) {
                setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, user_deleted_at: updated.user_deleted_at } : m));
            }
        } catch (err) {
            const msgText = err.response?.data?.message || 'Mesaj silinemedi.';
            notificationToast.error(msgText);
        }
    }, []);

    const handleReaction = useCallback(async (msg, emoji) => {
        try {
            const res = await messagesAPI.setReaction(msg.id, { emoji });
            const reactions = res.data?.data?.reactions ?? res.data?.data?.message?.reactions;
            if (reactions) {
                setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, reactions } : m));
            }
        } catch (err) {
            notificationToast.error(err.response?.data?.message || 'Reaksiyon eklenemedi.');
        }
    }, []);

    const handleEditMessage = useCallback(async (msg, newContent) => {
        if (!newContent || newContent === (msg.content || '')) return;
        try {
            const res = await messagesAPI.updateMessage(msg.id, { content: newContent });
            const updated = res.data?.data?.message;
            if (updated) {
                setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: updated.content, edited_at: updated.edited_at } : m));
            }
        } catch (err) {
            const msgText = err.response?.data?.message || 'Mesaj güncellenemedi.';
            notificationToast.error(msgText);
        }
    }, []);

    const handleExportPdf = useCallback(async () => {
        if (!conversation?.id) {
            notificationToast.error('Konuşma bulunamadı.');
            return;
        }
        try {
            const res = await messagesAPI.getConversationPdf(conversation.id);
            const contentType = res.headers?.['content-type'] || '';
            if (contentType.includes('application/json')) {
                const text = await res.data.text();
                const data = JSON.parse(text);
                notificationToast.error(data?.message || 'PDF alınamadı.');
                return;
            }
            const blob = res.data;
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const disposition = res.headers?.['content-disposition'];
            const filenameMatch = disposition && /filename="?([^";]+)"?/.exec(disposition);
            a.download = filenameMatch ? filenameMatch[1].trim() : `konusma-${conversation.other_user?.username || 'kullanici'}-${new Date().toISOString().slice(0, 10)}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            notificationToast.success('PDF indirildi.');
        } catch (err) {
            if (err.response?.data instanceof Blob) {
                try {
                    const text = await err.response.data.text();
                    const data = JSON.parse(text);
                    notificationToast.error(data?.message || 'PDF oluşturulurken hata oluştu.');
                } catch (_) {
                    notificationToast.error('PDF oluşturulurken hata oluştu.');
                }
            } else {
                notificationToast.error(err.response?.data?.message || 'PDF oluşturulurken hata oluştu.');
            }
        }
    }, [conversation]);

    const fetchNotes = useCallback(async () => {
        if (!conversation?.id) return;
        setLoadingNotes(true);
        try {
            const res = await messagesAPI.getNotes(conversation.id);
            setNotes(res.data?.data?.notes ?? []);
        } catch (err) {
            notificationToast.error(err.response?.data?.message || 'Notlar yüklenemedi.');
        } finally {
            setLoadingNotes(false);
        }
    }, [conversation?.id]);

    useEffect(() => {
        if (showNotebook && conversation?.id) fetchNotes();
    }, [showNotebook, conversation?.id, fetchNotes]);

    const handleAddNote = useCallback(async () => {
        const content = noteContent.trim();
        if (!content || !conversation?.id) return;
        try {
            const res = await messagesAPI.createNote(conversation.id, { content, is_visible_to_other: noteVisibleToOther });
            setNotes(prev => [res.data?.data?.note, ...prev]);
            setNoteContent('');
            setNoteVisibleToOther(false);
            notificationToast.success('Not eklendi.');
        } catch (err) {
            notificationToast.error(err.response?.data?.message || 'Not eklenemedi.');
        }
    }, [conversation?.id, noteContent, noteVisibleToOther]);

    const handleUpdateNote = useCallback(async () => {
        if (editingNoteId == null || !editContent.trim()) return;
        try {
            const res = await messagesAPI.updateNote(editingNoteId, { content: editContent.trim(), is_visible_to_other: editVisibleToOther });
            setNotes(prev => prev.map(n => n.id === editingNoteId ? (res.data?.data?.note ?? n) : n));
            setEditingNoteId(null);
            setEditContent('');
            setEditVisibleToOther(false);
            notificationToast.success('Not güncellendi.');
        } catch (err) {
            notificationToast.error(err.response?.data?.message || 'Not güncellenemedi.');
        }
    }, [editingNoteId, editContent, editVisibleToOther]);

    const handleDeleteNote = useCallback(async (noteId) => {
        try {
            await messagesAPI.deleteNote(noteId);
            setNotes(prev => prev.filter(n => n.id !== noteId));
            if (editingNoteId === noteId) setEditingNoteId(null);
            notificationToast.success('Not silindi.');
        } catch (err) {
            notificationToast.error(err.response?.data?.message || 'Not silinemedi.');
        }
    }, [editingNoteId]);

    const startEditNote = useCallback((note) => {
        setEditingNoteId(note.id);
        setEditContent(note.content || '');
        setEditVisibleToOther(note.is_visible_to_other || false);
    }, []);

    const scrollToMessageId = useCallback((messageId) => {
        if (messageId == null) return;
        const id = String(messageId);
        const container = messagesContainerRef.current;
        if (!container) return;
        const el = container.querySelector(`[data-message-id="${id}"]`);
        if (!el) return;
        setHighlightedMessageId(messageId);
        window.setTimeout(() => setHighlightedMessageId(null), 2200);
        requestAnimationFrame(() => {
            const elRect = el.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const elTopRelativeToContainer = elRect.top - containerRect.top + container.scrollTop;
            const scrollTarget = elTopRelativeToContainer - container.clientHeight / 2 + el.clientHeight / 2;
            container.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
        });
    }, []);

    const otherGender = conversation?.other_user?.gender;
    const isFemale = otherGender === 'female' || otherGender === 'kiz' || otherGender === 'kadın' || otherGender === 'woman';
    const themeHeaderClass = isFemale
        ? 'bg-gradient-to-r from-pink-500 to-rose-500'
        : 'bg-gradient-to-r from-blue-500 to-indigo-600';
    const themeBorderClass = isFemale
        ? 'border-pink-400 dark:border-pink-500'
        : 'border-blue-400 dark:border-blue-500';
    const themeBgClass = isFemale
        ? 'bg-pink-50/30 dark:bg-pink-900/10'
        : 'bg-blue-50/30 dark:bg-blue-900/10';
    const themeSpinnerClass = isFemale ? 'border-pink-500' : 'border-blue-500';

    const filteredMessages = useMemo(() => {
        if (!searchQuery.trim()) return messages;
        const q = searchQuery.trim().toLowerCase();
        return messages.filter((m) => {
            const content = (m.content || '').toLowerCase();
            const senderName = (m.sender?.username || '').toLowerCase();
            return content.includes(q) || senderName.includes(q);
        });
    }, [messages, searchQuery]);

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
                        Bir sohbet seçin veya yeni bir konuşma başlatın.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-900 relative w-full overflow-hidden">
            {/* Header - cinsiyete göre renk (kadın: pembe, erkek: mavi) */}
            <div className={`flex-shrink-0 ${themeHeaderClass} p-4 w-full z-10 sticky top-0`}>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="text-white/90 hover:bg-white/20 p-2 rounded-lg transition-colors"
                    >
                        <FaArrowLeft className="text-lg" />
                    </button>

                    <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => navigate(`/profile/${conversation.other_user.username}`)}
                    >
                        <h3 className="font-bold text-white truncate">
                            {conversation.other_user.username}
                        </h3>
                        <p className="text-xs text-white/80">
                            {otherUserTyping ? (
                                <span className="italic">{otherUserTyping} yazıyor...</span>
                            ) : conversation.other_user.is_online ? (
                                '🟢 Çevrimiçi'
                            ) : (
                                'Çevrimdışı'
                            )}
                        </p>
                    </div>
                    {conversation?.id && (
                        <button
                            type="button"
                            onClick={() => setShowNotebook(v => !v)}
                            className={`p-2 rounded-full transition-colors ${showNotebook ? 'bg-white/25 text-white' : 'text-white/80 hover:text-white hover:bg-white/10'}`}
                            title="Not Defteri"
                        >
                            <FaBook className="text-lg" />
                        </button>
                    )}
                    {!loading && messages.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setShowSearchInput((v) => !v)}
                            className={`p-2 rounded-full transition-colors ${showSearchInput ? 'bg-white/25 text-white' : 'text-white/80 hover:text-white hover:bg-white/10'}`}
                            title="Mesajlarda ara"
                        >
                            <FaSearch className="text-lg" />
                        </button>
                    )}
                    {canExportPdf && (
                        <button
                            type="button"
                            onClick={handleExportPdf}
                            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                            title="Konuşmayı PDF indir"
                        >
                            <FaFilePdf className="text-lg" />
                        </button>
                    )}
                    <button
                        onClick={() => setShowDeleteModal(true)}
                        className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                        title="Sohbeti Temizle"
                    >
                        <FaTrash className="text-lg" />
                    </button>
                </div>
                {showSearchInput && !loading && messages.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-white/20">
                        <div className="relative flex items-center">
                            <FaSearch className="absolute left-4 text-white/70 text-sm pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Mesajlarda ara..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-11 pr-11 py-2.5 rounded-xl bg-white/15 text-white placeholder-white/60 text-sm border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/30 transition-all"
                                autoFocus
                            />
                            {searchQuery ? (
                                <button
                                    type="button"
                                    onClick={() => { setSearchQuery(''); setShowSearchInput(false); }}
                                    className="absolute right-3 p-1 rounded-full text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                                    title="Temizle ve kapat"
                                >
                                    ×
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setShowSearchInput(false)}
                                    className="absolute right-3 text-white/70 hover:text-white text-xs font-medium"
                                    title="Kapat"
                                >
                                    Kapat
                                </button>
                            )}
                        </div>
                        {searchQuery.trim() && (
                            <p className="text-xs text-white/70 mt-1.5 pl-1">
                                {filteredMessages.length} mesaj bulundu
                            </p>
                        )}
                    </div>
                )}
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

            {/* Not Defteri - çizgili defter */}
            {showNotebook && (
                <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/80 dark:bg-gray-950/90" onClick={() => setShowNotebook(false)}>
                    <div className="flex-1 flex flex-col min-h-0 m-4 rounded-2xl overflow-hidden shadow-2xl bg-amber-50/95 dark:bg-stone-900/95 border border-amber-200/80 dark:border-stone-700 max-w-2xl w-full mx-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-amber-200/80 dark:border-stone-700 bg-amber-100/80 dark:bg-stone-800/80">
                            <h3 className="font-semibold text-amber-900 dark:text-amber-100 flex items-center gap-2">
                                <FaBook className="text-amber-700 dark:text-amber-300" />
                                Not Defteri
                            </h3>
                            <button type="button" onClick={() => setShowNotebook(false)} className="p-2 rounded-lg text-amber-700 dark:text-amber-300 hover:bg-amber-200/50 dark:hover:bg-stone-700">×</button>
                        </div>
                        <div
                            className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 pt-4"
                            style={{
                                backgroundImage: 'repeating-linear-gradient(transparent, transparent 0px, transparent 27px, rgba(180,140,80,0.22) 27px, rgba(180,140,80,0.22) 28px)',
                                backgroundAttachment: 'local',
                            }}
                        >
                            <div className="pl-8 relative" style={{ borderLeft: '3px solid rgba(180,100,60,0.5)' }}>
                                <div className="mb-6">
                                    <textarea
                                        value={noteContent}
                                        onChange={e => setNoteContent(e.target.value)}
                                        placeholder="Yeni not yaz..."
                                        rows={3}
                                        className="w-full resize-none bg-transparent border-0 text-amber-900 dark:text-amber-100 placeholder-amber-500/70 focus:ring-0 focus:outline-none text-sm leading-7"
                                    />
                                    <label className="flex items-center gap-2 mt-2 text-amber-800 dark:text-amber-200 text-sm cursor-pointer">
                                        <input type="checkbox" checked={noteVisibleToOther} onChange={e => setNoteVisibleToOther(e.target.checked)} className="rounded border-amber-400 text-amber-600 focus:ring-amber-500" />
                                        Karşı tarafa göster
                                    </label>
                                    <button type="button" onClick={handleAddNote} disabled={!noteContent.trim() || loadingNotes} className="mt-2 px-4 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50">Ekle</button>
                                </div>
                                {loadingNotes ? (
                                    <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-400 border-t-transparent" /></div>
                                ) : notes.length === 0 ? (
                                    <p className="text-amber-600 dark:text-amber-400 text-sm py-4">Henüz not yok. Yukarıdan ekleyebilirsin.</p>
                                ) : (
                                    <div className="space-y-6">
                                        {notes.map((note) => (
                                            <div key={note.id} className="py-2 border-b border-amber-200/50 dark:border-stone-600/50 last:border-0">
                                                {editingNoteId === note.id ? (
                                                    <div>
                                                        <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={3} className="w-full resize-none bg-amber-50/50 dark:bg-stone-800/50 border border-amber-200 dark:border-stone-600 rounded-lg p-2 text-amber-900 dark:text-amber-100 text-sm focus:ring-2 focus:ring-amber-400" />
                                                        <label className="flex items-center gap-2 mt-2 text-amber-800 dark:text-amber-200 text-sm cursor-pointer">
                                                            <input type="checkbox" checked={editVisibleToOther} onChange={e => setEditVisibleToOther(e.target.checked)} className="rounded border-amber-400 text-amber-600 focus:ring-amber-500" />
                                                            Karşı tarafa göster
                                                        </label>
                                                        <div className="flex gap-2 mt-2">
                                                            <button type="button" onClick={handleUpdateNote} className="px-3 py-1 rounded bg-amber-600 text-white text-sm">Kaydet</button>
                                                            <button type="button" onClick={() => { setEditingNoteId(null); setEditContent(''); setEditVisibleToOther(false); }} className="px-3 py-1 rounded bg-gray-400 text-white text-sm">İptal</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <p className="text-amber-900 dark:text-amber-100 text-sm whitespace-pre-wrap leading-7">{note.content}</p>
                                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                            <span className="text-xs text-amber-600 dark:text-amber-400">{note.user?.username || 'Kullanıcı'}</span>
                                                            <span className="text-xs text-amber-500 dark:text-amber-500">{new Date(note.created_at).toLocaleDateString('tr-TR')}</span>
                                                            {note.is_visible_to_other && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-200/80 dark:bg-amber-800/50 text-amber-800 dark:text-amber-200">Karşı tarafa göster</span>}
                                                            {note.user_id === user?.id && (
                                                                <span className="flex gap-1 ml-auto">
                                                                    <button type="button" onClick={() => startEditNote(note)} className="text-xs text-amber-700 dark:text-amber-300 hover:underline">Düzenle</button>
                                                                    <button type="button" onClick={() => handleDeleteNote(note.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">Sil</button>
                                                                </span>
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Messages Area - Scrollable (Flex-1) */}
            <div
                ref={messagesContainerRef}
                className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto bg-white dark:bg-gray-900 w-full"
                style={{ WebkitOverflowScrolling: 'touch' }}
                onScroll={(e) => {
                    if (e.target.scrollTop < 150 && hasMoreOlder && !loadingOlder && messages.length > 0) {
                        loadOlderMessages();
                    }
                }}
            >
                {loading ? (
                    <div className="flex justify-center items-center h-full">
                        <div className={`animate-spin rounded-full h-16 w-16 border-b-4 ${themeSpinnerClass}`}></div>
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
                    <div className="py-4 w-full min-w-0 max-w-full">
                        {loadingOlder && (
                            <div className="flex justify-center py-3">
                                <div className={`animate-spin rounded-full h-8 w-8 border-2 border-t-transparent ${themeSpinnerClass}`} />
                            </div>
                        )}
                        {!hasMoreOlder && messages.length > 0 && (
                            <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-2">En eski mesajlar</p>
                        )}
                        {(searchQuery ? filteredMessages : messages).map((message) => (
                            <div key={message.id} data-message-id={String(message.id)}>
                                <MessageBubble
                                    message={message}
                                    isMine={message.sender_id === user.id}
                                    currentUserId={user?.id}
                                    senderGender={message.sender_id === user.id ? user.gender : conversation.other_user.gender}
                                    onReply={(msg) => setReplyingTo(msg)}
                                    onEdit={handleEditMessage}
                                    onDelete={handleDeleteMessage}
                                    onReaction={handleReaction}
                                    isHighlighted={highlightedMessageId === message.id}
                                    onScrollToMessage={scrollToMessageId}
                                />
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Mesaj kutusu - karşı tarafın cinsiyetine göre renk teması */}
            <div className={`flex-shrink-0 w-full min-w-0 z-20 sticky bottom-0 border-t-2 ${themeBorderClass} ${themeBgClass}`}>
                <MessageInput
                    onSendMessage={handleSendMessage}
                    disabled={false}
                    replyingTo={replyingTo}
                    onCancelReply={() => setReplyingTo(null)}
                    onTyping={conversation?.id ? (typing) => messagesAPI.sendTyping(conversation.id, typing).catch(() => { }) : undefined}
                    onScrollToQuotedMessage={scrollToMessageId}
                />
            </div>
        </div>
    );
};

export default ChatWindow;
