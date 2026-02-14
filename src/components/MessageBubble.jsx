import React, { useState, useEffect, useRef, useCallback } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { tr } from 'date-fns/locale';
import { FaEllipsisV, FaCheck, FaCheckDouble, FaEye, FaLock, FaImage, FaMicrophone } from 'react-icons/fa';
import { messagesAPI } from '../services/api';

const EPHEMERAL_DURATION = 10; // seconds

function isEphemeralExpiredFromBackend(message, isMine) {
    if (isMine || !message?.is_ephemeral) return false;
    const maxViews = message.ephemeral_max_views;
    const viewCount = message.ephemeral_view_count ?? 0;
    if (maxViews && viewCount >= maxViews) return true;
    const firstViewed = message.ephemeral_first_viewed_at;
    if (!firstViewed) return false;
    const viewedAt = new Date(firstViewed).getTime();
    return (Date.now() - viewedAt) >= EPHEMERAL_DURATION * 1000;
}

const MessageBubble = ({ message, isMine, senderGender, onReply }) => {
    const ensureHttps = (url) => {
        if (!url) return url;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        return `https://${url}`;
    };

    const [showEphemeralViewer, setShowEphemeralViewer] = useState(false);
    const [ephemeralBlobUrl, setEphemeralBlobUrl] = useState(null);
    const [ephemeralLoading, setEphemeralLoading] = useState(false);
    const [ephemeralError, setEphemeralError] = useState(null);
    const [countdown, setCountdown] = useState(EPHEMERAL_DURATION);
    const [expired, setExpired] = useState(() => isEphemeralExpiredFromBackend(message, isMine));
    const countdownRef = useRef(null);
    const blobUrlRef = useRef(null);

    useEffect(() => {
        if (message.is_ephemeral && !isMine) {
            setExpired(isEphemeralExpiredFromBackend(message, isMine));
        }
    }, [message.id, message.is_ephemeral, message.ephemeral_first_viewed_at, message.ephemeral_view_count, message.ephemeral_max_views, isMine]);

    // Sender: load ephemeral image once so they can see it (with auth)
    useEffect(() => {
        if (!message.is_ephemeral || !isMine || message.type !== 'image') return;
        let revoked = false;
        messagesAPI.viewEphemeralFile(message.id)
            .then((res) => {
                if (revoked) return;
                const url = URL.createObjectURL(res.data);
                blobUrlRef.current = url;
                setEphemeralBlobUrl(url);
                const t = setTimeout(() => {
                    if (blobUrlRef.current) {
                        URL.revokeObjectURL(blobUrlRef.current);
                        blobUrlRef.current = null;
                        setEphemeralBlobUrl(null);
                    }
                }, EPHEMERAL_DURATION * 1000);
                return () => clearTimeout(t);
            })
            .catch(() => setEphemeralError('Yüklenemedi'));
        return () => { revoked = true; };
    }, [message.id, message.is_ephemeral, isMine, message.type]);

    // Cleanup blob URL on unmount
    useEffect(() => {
        return () => {
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
        };
    }, []);

    // Countdown timer when viewer is open
    useEffect(() => {
        if (!showEphemeralViewer || ephemeralLoading || ephemeralError) return;

        setCountdown(EPHEMERAL_DURATION);
        countdownRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(countdownRef.current);
                    setShowEphemeralViewer(false);
                    // Cleanup blob URL
                    if (blobUrlRef.current) {
                        URL.revokeObjectURL(blobUrlRef.current);
                        blobUrlRef.current = null;
                        setEphemeralBlobUrl(null);
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (countdownRef.current) {
                clearInterval(countdownRef.current);
            }
        };
    }, [showEphemeralViewer, ephemeralLoading, ephemeralError]);

    const loadEphemeralBlob = useCallback(async () => {
        setEphemeralLoading(true);
        setEphemeralError(null);
        try {
            const response = await messagesAPI.viewEphemeralFile(message.id);
            const blob = response.data;
            const url = URL.createObjectURL(blob);
            blobUrlRef.current = url;
            setEphemeralBlobUrl(url);
        } catch (err) {
            const status = err.response?.status;
            if (status === 403 || status === 410) {
                setExpired(true);
                setEphemeralError('Bu fotoğrafın görüntüleme hakkı veya süresi doldu.');
            } else {
                setEphemeralError('Fotoğraf yüklenemedi.');
            }
        } finally {
            setEphemeralLoading(false);
        }
    }, [message.id]);

    const handleOpenEphemeral = useCallback(async () => {
        if (expired) return;

        if (ephemeralBlobUrl) {
            setShowEphemeralViewer(true);
            return;
        }

        setShowEphemeralViewer(true);
        await loadEphemeralBlob();
    }, [expired, ephemeralBlobUrl, loadEphemeralBlob]);

    const handleCloseEphemeral = useCallback(() => {
        setShowEphemeralViewer(false);
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
        }
        if (blobUrlRef.current && !isMine) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
            setEphemeralBlobUrl(null);
        }
    }, [isMine]);

    const getEphemeralLabel = () => {
        if (message.ephemeral_max_views === 1) return 'Tek bakmalık • 10 sn';
        if (message.ephemeral_max_views === 2) return 'İki kere bakmalık • 10 sn';
        return 'Gizli fotoğraf';
    };

    const renderContent = () => {
        switch (message.type) {
            case 'image':
                if (message.is_ephemeral) {
                    // For ephemeral images: show a placeholder/badge instead of loading the actual image
                    return (
                        <div
                            className="relative cursor-pointer select-none"
                            onClick={handleOpenEphemeral}
                        >
                            {expired ? (
                                // Expired state
                                <div className="w-48 h-32 rounded-lg flex flex-col items-center justify-center bg-gray-800/60 gap-2">
                                    <FaLock className="text-white/60 text-2xl" />
                                    <span className="text-[11px] text-white/60 font-medium">Süresi doldu</span>
                                </div>
                            ) : isMine ? (
                                <>
                                    {ephemeralBlobUrl ? (
                                        <img
                                            src={ephemeralBlobUrl}
                                            alt="Gizli fotoğraf"
                                            className="max-w-full rounded-lg pointer-events-none"
                                            style={{ maxHeight: '300px' }}
                                            draggable={false}
                                            onContextMenu={(e) => e.preventDefault()}
                                        />
                                    ) : (
                                        <div className="w-48 h-32 rounded-lg flex flex-col items-center justify-center bg-white/10 gap-2">
                                            {ephemeralLoading ? (
                                                <span className="text-[11px] text-white/70">Yükleniyor...</span>
                                            ) : (
                                                <>
                                                    <FaEye className="text-white/70 text-xl" />
                                                    <span className="text-[10px] text-white/70">Görüntülemek için dokun</span>
                                                </>
                                            )}
                                        </div>
                                    )}
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <span className="px-2 py-1 text-[10px] font-semibold bg-black/60 text-white rounded-full">
                                            {getEphemeralLabel()}
                                        </span>
                                    </div>
                                </>
                            ) : (
                                // Receiver sees a blurred placeholder
                                <div className="w-48 h-32 rounded-lg flex flex-col items-center justify-center bg-gradient-to-br from-purple-600/40 to-pink-500/40 gap-2 backdrop-blur-sm">
                                    <FaEye className="text-white text-2xl drop-shadow" />
                                    <span className="px-2 py-1 text-[10px] font-semibold bg-black/60 text-white rounded-full">
                                        {getEphemeralLabel()}
                                    </span>
                                    <span className="text-[10px] text-white/70">Görüntülemek için dokun</span>
                                </div>
                            )}
                        </div>
                    );
                }
                return (
                    <img
                        src={ensureHttps(message.file_url)}
                        alt="Image"
                        className="max-w-full rounded-lg cursor-pointer"
                        style={{ maxHeight: '300px' }}
                        onClick={() => window.open(ensureHttps(message.file_url), '_blank')}
                    />
                );
            case 'audio':
                return (
                    <audio controls className="max-w-full">
                        <source src={ensureHttps(message.file_url)} type="audio/webm" />
                    </audio>
                );
            default:
                return <p className="whitespace-pre-wrap break-words text-sm leading-relaxed min-w-0 max-w-full" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{message.content}</p>;
        }
    };

    // Check for female gender (supports both English and Turkish)
    const isFemale = senderGender === 'female' ||
        senderGender === 'kiz' ||
        senderGender === 'woman' ||
        senderGender === 'kadın';

    const bubbleClass = isMine
        ? (isFemale
            ? 'bg-gradient-to-br from-pink-400 to-rose-400 text-white'
            : 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white')
        : (isFemale
            ? 'bg-gradient-to-br from-pink-500 to-rose-500 text-white'
            : 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white');

    const formatMessageDateTime = (dateString) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        if (Number.isNaN(d.getTime())) return '';

        const time = format(d, 'HH:mm', { locale: tr });
        if (isToday(d)) return `Bugün ${time}`;
        if (isYesterday(d)) return `Dün ${time}`;
        return `${format(d, 'd MMM', { locale: tr })} ${time}`;
    };

    return (
        <>
            {/* Ephemeral Photo Viewer Overlay */}
            {showEphemeralViewer && message.type === 'image' && message.is_ephemeral && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
                    onClick={handleCloseEphemeral}
                    style={{ userSelect: 'none' }}
                >
                    <div
                        className="relative max-w-[90%] max-h-[90%] flex flex-col items-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Loading State */}
                        {ephemeralLoading && (
                            <div className="flex flex-col items-center justify-center gap-3 py-20">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white"></div>
                                <span className="text-white/70 text-sm">Fotoğraf yükleniyor...</span>
                            </div>
                        )}

                        {/* Error State */}
                        {ephemeralError && !ephemeralLoading && (
                            <div className="flex flex-col items-center justify-center gap-3 py-20">
                                <FaLock className="text-white/50 text-4xl" />
                                <span className="text-white/70 text-sm text-center">{ephemeralError}</span>
                                <button
                                    onClick={handleCloseEphemeral}
                                    className="mt-2 px-4 py-2 bg-white/10 rounded-full text-white text-sm hover:bg-white/20 transition"
                                >
                                    Kapat
                                </button>
                            </div>
                        )}

                        {/* Image - only when we have blob URL (revoked after 10s for devtools) */}
                        {!ephemeralLoading && !ephemeralError && ephemeralBlobUrl && (
                            <>
                                {/* Countdown Progress Bar */}
                                {!isMine && (
                                    <div className="w-full max-w-md mb-4">
                                        <div className="relative w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                                            <div
                                                className="absolute left-0 top-0 h-full bg-gradient-to-r from-pink-500 to-red-500 rounded-full transition-all duration-1000 ease-linear"
                                                style={{ width: `${(countdown / EPHEMERAL_DURATION) * 100}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between items-center mt-2">
                                            <span className="text-[11px] text-white/60 font-semibold">
                                                {getEphemeralLabel()}
                                            </span>
                                            <span className="text-[13px] text-white font-bold">
                                                {countdown} sn
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <img
                                    src={ephemeralBlobUrl}
                                    alt="Gizli fotoğraf"
                                    className="max-w-full max-h-[70vh] rounded-xl"
                                    draggable={false}
                                    onContextMenu={(e) => e.preventDefault()}
                                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                                />

                                {/* Bottom Label */}
                                <div className="mt-3 px-3 py-1.5 rounded-full bg-black/70 text-[11px] text-white font-semibold flex items-center gap-2">
                                    <FaEye className="text-white/70" />
                                    {getEphemeralLabel()}
                                </div>

                                {/* Close hint */}
                                <button
                                    onClick={handleCloseEphemeral}
                                    className="mt-4 px-4 py-2 bg-white/10 rounded-full text-white/70 text-xs hover:bg-white/20 transition"
                                >
                                    Kapatmak için dokun
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-3 px-3 min-w-0`}>
                <div
                    className={`max-w-[85%] sm:max-w-[75%] min-w-0 px-4 py-3 rounded-lg shadow-sm overflow-hidden ${bubbleClass} relative group`}
                >
                    {/* Quoted Message */}
                    {message.reply_to && (
                        <div className="mb-2 p-2 min-w-0 max-w-full overflow-hidden bg-black/10 dark:bg-white/10 rounded-lg border-l-4 border-white/50 text-xs">
                            <p className="font-bold opacity-90 mb-0.5 truncate">{message.reply_to.sender?.username}</p>
                            <p className="opacity-75 break-words line-clamp-2 min-w-0" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                {message.reply_to.type === 'image' ? (
                                    <span className="inline-flex items-center gap-1.5">
                                        <FaImage className="text-sm opacity-80 shrink-0" /> Fotoğraf
                                    </span>
                                ) : message.reply_to.type === 'audio' ? (
                                    <span className="inline-flex items-center gap-1.5">
                                        <FaMicrophone className="text-sm opacity-80 shrink-0" /> Sesli Mesaj
                                    </span>
                                ) : (
                                    message.reply_to.content
                                )}
                            </p>
                        </div>
                    )}

                    {/* Time + Menu */}
                    <div className="flex justify-between items-start mb-1.5 opacity-80 gap-2">
                        <div className="flex items-center gap-1">
                            <span className="text-[10px]">
                                {formatMessageDateTime(message.created_at)}
                            </span>
                            {isMine && (
                                <span className="text-xs">
                                    {message.read_at ? (
                                        <FaCheckDouble className="text-blue-200" title={`Okundu: ${formatMessageDateTime(message.read_at)}`} />
                                    ) : (
                                        <FaCheck className="text-white/70" title="Gönderildi" />
                                    )}
                                </span>
                            )}
                        </div>
                        {/* Reply Button (visible on hover or always on mobile) */}
                        <button
                            onClick={() => onReply && onReply(message)}
                            className="text-white opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
                            title="Yanıtla"
                        >
                            <FaEllipsisV className="text-xs transform rotate-90" />
                        </button>
                    </div>

                    {/* Content */}
                    {renderContent()}
                </div>
            </div>
        </>
    );
};

export default MessageBubble;
