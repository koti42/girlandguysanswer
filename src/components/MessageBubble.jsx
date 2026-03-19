import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { format, isToday, isYesterday } from 'date-fns';
import { tr } from 'date-fns/locale';
import { FaEllipsisV, FaCheck, FaCheckDouble, FaEye, FaLock, FaImage, FaMicrophone, FaTimes, FaPlay, FaPause, FaEdit, FaTrash, FaSmile } from 'react-icons/fa';
import { messagesAPI } from '../services/api';
import { getProfileColor } from '../utils/userColor';
import LinkRedirectModal from './LinkRedirectModal';

const EPHEMERAL_DURATION = 10; // seconds
const EDIT_DELETE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const REACTION_EMOJIS = ['😠', '😂', '❤️', '😢']; // kızgın, gülme, kalp, üzgün
const REACTION_PICKER_WIDTH = 220;
const REACTION_PICKER_HEIGHT = 48;

function canEditOrDeleteMessage(message, isMine) {
    if (!isMine || message.user_deleted_at) return false;
    const sentAt = new Date(message.created_at).getTime();
    return sentAt + EDIT_DELETE_WINDOW_MS > Date.now();
}

const YOUTUBE_URL_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|music\.youtube\.com\/watch\?v=)([A-Za-z0-9_-]{11})/gi;
const INSTAGRAM_URL_REGEX = /https?:\/\/(?:www\.)?instagram\.com\/[^\s]+/gi;
const GENERAL_URL_REGEX = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi;
const MENTION_REGEX = /@([\p{L}\p{N}_]+)/gu;

function linkifyText(text, onLinkClick) {
    if (!text) return text;
    const tokens = [];
    let m;
    const urlRe = new RegExp(GENERAL_URL_REGEX.source, 'gi');
    while ((m = urlRe.exec(text)) !== null) {
        tokens.push({ type: 'url', start: m.index, end: m.index + m[0].length, value: m[0] });
    }
    const mentionRe = new RegExp(MENTION_REGEX.source, 'gu');
    while ((m = mentionRe.exec(text)) !== null) {
        tokens.push({ type: 'mention', start: m.index, end: m.index + m[0].length, value: m[0], username: m[1] });
    }
    tokens.sort((a, b) => a.start - b.start);
    const filtered = tokens.filter((t, i) => i === 0 || t.start >= tokens[i - 1].end);
    const parts = [];
    let lastIndex = 0;
    for (const token of filtered) {
        if (token.start > lastIndex) {
            parts.push(text.slice(lastIndex, token.start));
        }
        if (token.type === 'url') {
            const fullUrl = token.value.startsWith('http') ? token.value : `https://${token.value}`;
            parts.push(
                <button
                    key={`url-${token.start}`}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onLinkClick(fullUrl); }}
                    className="underline underline-offset-2 opacity-90 hover:opacity-100 break-all text-left"
                >
                    {token.value}
                </button>
            );
        } else {
            parts.push(
                <Link
                    key={`mention-${token.start}`}
                    to={`/profile/${token.username}`}
                    onClick={(e) => e.stopPropagation()}
                    className="underline underline-offset-2 opacity-90 hover:opacity-100 font-semibold"
                >
                    {token.value}
                </Link>
            );
        }
        lastIndex = token.end;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts.length > 0 ? parts : text;
}

function getYoutubeVideoLinks(content) {
    if (!content || typeof content !== 'string') return [];
    const seen = new Set();
    const result = [];
    let m;
    const re = new RegExp(YOUTUBE_URL_REGEX.source, 'gi');
    while ((m = re.exec(content)) !== null) {
        const videoId = m[1];
        const fullUrl = m[0].startsWith('http') ? m[0] : `https://${m[0]}`;
        const isMusic = /music\.youtube\.com/i.test(m[0]);
        if (!seen.has(videoId)) {
            seen.add(videoId);
            result.push({ url: fullUrl, videoId, isMusic });
        }
    }
    return result;
}

function contentWithShortLinks(content) {
    if (!content || typeof content !== 'string') return '';
    return content
        .replace(YOUTUBE_URL_REGEX, (match) => {
            const isMusic = /music\.youtube\.com/i.test(match);
            return isMusic ? '🔗 YouTube Music linki' : '🔗 Video linki';
        })
        // Instagram URL'lerini tamamen kaldırıyoruz, çünkü altta preview kartı var.
        .replace(INSTAGRAM_URL_REGEX, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getInstagramLinks(content) {
    if (!content || typeof content !== 'string') return [];
    const seen = new Set();
    const result = [];
    let m;
    const re = new RegExp(INSTAGRAM_URL_REGEX.source, 'gi');
    while ((m = re.exec(content)) !== null) {
        const url = m[0];
        if (!seen.has(url)) {
            seen.add(url);
            result.push(url);
        }
    }
    return result;
}

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

const MessageBubble = ({ message, isMine, senderGender, senderUser, currentUserId, viewerPrefs, onReply, onEdit, onDelete, onReaction, isHighlighted = false, onScrollToMessage }) => {
    const ensureHttps = (url) => {
        if (!url) return url;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        return `https://${url}`;
    };

    const [showEphemeralViewer, setShowEphemeralViewer] = useState(false);
    const [showImageModal, setShowImageModal] = useState(false);
    const [ephemeralBlobUrl, setEphemeralBlobUrl] = useState(null);
    const [ephemeralLoading, setEphemeralLoading] = useState(false);
    const [ephemeralError, setEphemeralError] = useState(null);
    const [countdown, setCountdown] = useState(EPHEMERAL_DURATION);
    const [expired, setExpired] = useState(() => isEphemeralExpiredFromBackend(message, isMine));
    const countdownRef = useRef(null);
    const blobUrlRef = useRef(null);
    const audioRef = useRef(null);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const [audioCurrentTime, setAudioCurrentTime] = useState(0);
    const [audioDuration, setAudioDuration] = useState(0);
    const [menuOpen, setMenuOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editContent, setEditContent] = useState('');
    const menuRef = useRef(null);
    const menuButtonRef = useRef(null);
    const menuDropdownRef = useRef(null);
    const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
    const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
    const reactionButtonRef = useRef(null);
    const reactionPickerRef = useRef(null);
    const [reactionPickerPosition, setReactionPickerPosition] = useState({ top: 0, left: 0 });

    const canEditOrDelete = canEditOrDeleteMessage(message, isMine);
    const canEdit = canEditOrDelete && message.type === 'text' && onEdit;
    const canDelete = canEditOrDelete && onDelete;

    const updateMenuPosition = useCallback(() => {
        if (menuButtonRef.current) {
            const rect = menuButtonRef.current.getBoundingClientRect();
            setMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
        }
    }, []);

    useEffect(() => {
        if (!menuOpen) return;
        updateMenuPosition();
        const handleClickOutside = (e) => {
            const inButton = menuRef.current?.contains(e.target);
            const inDropdown = menuDropdownRef.current?.contains(e.target);
            if (!inButton && !inDropdown) setMenuOpen(false);
        };
        const handleScrollOrResize = () => updateMenuPosition();
        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('scroll', handleScrollOrResize, true);
        window.addEventListener('resize', handleScrollOrResize);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', handleScrollOrResize, true);
            window.removeEventListener('resize', handleScrollOrResize);
        };
    }, [menuOpen, updateMenuPosition]);

    useEffect(() => {
        if (!reactionPickerOpen) return;
        const updateReactionPos = () => {
            if (reactionButtonRef.current) {
                const rect = reactionButtonRef.current.getBoundingClientRect();
                const left = Math.max(8, Math.min(rect.left, window.innerWidth - REACTION_PICKER_WIDTH - 8));
                const top = Math.max(8, rect.top - REACTION_PICKER_HEIGHT - 8);
                setReactionPickerPosition({ top, left });
            }
        };
        updateReactionPos();
        const handleClickOutside = (e) => {
            const inButton = reactionButtonRef.current?.contains(e.target);
            const inPicker = reactionPickerRef.current?.contains(e.target);
            if (!inButton && !inPicker) setReactionPickerOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('scroll', updateReactionPos, true);
        window.addEventListener('resize', updateReactionPos);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', updateReactionPos, true);
            window.removeEventListener('resize', updateReactionPos);
        };
    }, [reactionPickerOpen]);

    useEffect(() => {
        if (message.is_ephemeral && !isMine) {
            setExpired(isEphemeralExpiredFromBackend(message, isMine));
        }
    }, [message.id, message.is_ephemeral, message.ephemeral_first_viewed_at, message.ephemeral_view_count, message.ephemeral_max_views, isMine]);

    useEffect(() => {
        if (message.is_ephemeral && message.type === 'image') return;
        if (!message.is_ephemeral || !isMine || message.type !== 'image') return;
        if (!message.id || String(message.id).startsWith('temp-')) return;
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

    useEffect(() => {
        return () => {
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!showEphemeralViewer || ephemeralLoading || ephemeralError) return;

        setCountdown(EPHEMERAL_DURATION);
        countdownRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(countdownRef.current);
                    setShowEphemeralViewer(false);
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
        if (message.is_ephemeral && message.type === 'image') {
            throw new Error('Ephemeral image viewing is disabled on web.');
        }
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
        if (message.is_ephemeral && message.type === 'image') return;
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

    const [pendingLinkUrl, setPendingLinkUrl] = useState(null);

    const getEphemeralLabel = () => {
        if (message.ephemeral_max_views === 1) return 'Tek bakmalık • 10 sn';
        if (message.ephemeral_max_views === 2) return 'İki kere bakmalık • 10 sn';
        return 'Gizli fotoğraf';
    };

    const renderContent = () => {
        switch (message.type) {
            case 'image':
                if (message.is_ephemeral) {
                    const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.herkeslersoruyor.mobile';
                    return (
                        <div className="w-64 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                            <div className="flex items-center gap-2 text-white/80">
                                <FaLock className="text-white/60" />
                                <span className="text-xs font-semibold">{getEphemeralLabel()}</span>
                            </div>
                            <p className="mt-2 text-[11px] leading-4 text-white/70">
                                Bu fotoğrafa bakmak için Herkesler Soruyor Mobil uygulamasını indirmeniz gerekmektedir.
                            </p>
                            <div className="mt-3 flex">
                                <a
                                    href={playStoreUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-[11px] font-semibold text-white/90 hover:bg-white/15 transition-colors"
                                >
                                    <FaDownload className="text-[12px]" />
                                    Google Play’den indir
                                </a>
                            </div>
                        </div>
                    );
                }
                const imageUrl = ensureHttps(message.file_url);
                return (
                    <>
                        <img
                            src={imageUrl}
                            alt="Image"
                            className="max-w-[200px] rounded-lg cursor-pointer object-cover hover:opacity-90 transition-opacity"
                            style={{ maxHeight: '180px' }}
                            onClick={() => setShowImageModal(true)}
                        />
                        {showImageModal && (
                            <div
                                className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
                                onClick={() => setShowImageModal(false)}
                            >
                                <button
                                    type="button"
                                    onClick={() => setShowImageModal(false)}
                                    className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                                    aria-label="Kapat"
                                >
                                    <FaTimes className="text-xl" />
                                </button>
                                <img
                                    src={imageUrl}
                                    alt="Image"
                                    className="max-w-full max-h-full object-contain rounded-lg"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        )}
                    </>
                );
            case 'audio': {
                const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
                const formatSec = (s) => {
                    if (!s || !Number.isFinite(s)) return '0:00';
                    const m = Math.floor(s / 60);
                    const sec = Math.floor(s % 60);
                    return `${m}:${sec.toString().padStart(2, '0')}`;
                };
                const togglePlayPause = () => {
                    const el = audioRef.current;
                    if (!el) return;
                    if (el.paused) {
                        el.playbackRate = playbackSpeed;
                        el.play();
                    } else {
                        el.pause();
                    }
                };
                const seek = (e) => {
                    const el = audioRef.current;
                    if (!el || !audioDuration) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    el.currentTime = p * audioDuration;
                };
                return (
                    <div className="space-y-2 min-w-0 max-w-full">
                        <audio
                            ref={audioRef}
                            className="hidden"
                            onPlay={() => setIsAudioPlaying(true)}
                            onPause={() => setIsAudioPlaying(false)}
                            onEnded={() => {
                                setIsAudioPlaying(false);
                                setAudioCurrentTime(0);
                            }}
                            onTimeUpdate={() => setAudioCurrentTime(audioRef.current?.currentTime ?? 0)}
                            onLoadedMetadata={() => {
                                const el = audioRef.current;
                                if (el) {
                                    el.playbackRate = playbackSpeed;
                                    setAudioDuration(el.duration);
                                }
                            }}
                            onDurationChange={() => setAudioDuration(audioRef.current?.duration ?? 0)}
                            src={ensureHttps(message.file_url)}
                            preload="metadata"
                        />
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={togglePlayPause}
                                className="flex-shrink-0 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
                            >
                                {isAudioPlaying ? <FaPause className="text-sm" /> : <FaPlay className="text-sm ml-0.5" />}
                            </button>
                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                <div
                                    className="h-1.5 bg-white/20 rounded-full cursor-pointer overflow-hidden"
                                    onClick={seek}
                                >
                                    <div
                                        className="h-full bg-white/70 rounded-full transition-[width]"
                                        style={{ width: `${audioDuration ? (audioCurrentTime / audioDuration) * 100 : 0}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-[10px] text-white/70">
                                    <span>{formatSec(audioCurrentTime)}</span>
                                    <span>{formatSec(audioDuration)}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="text-[11px] opacity-80 mr-0.5">Hız:</span>
                            {speeds.map((speed) => (
                                <button
                                    key={speed}
                                    type="button"
                                    onClick={() => {
                                        setPlaybackSpeed(speed);
                                        if (audioRef.current) {
                                            audioRef.current.playbackRate = speed;
                                        }
                                    }}
                                    className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${playbackSpeed === speed
                                        ? 'bg-white/25 text-white'
                                        : 'bg-white/10 text-white/80 hover:bg-white/20'
                                        }`}
                                >
                                    {speed === 1 ? '1x' : `${speed}x`}
                                </button>
                            ))}
                        </div>
                    </div>
                );
            }
            case 'gif': {
                const gifUrl = ensureHttps(message.file_url || message.content);
                if (!gifUrl) return null;
                return (
                    <div className="rounded-lg overflow-hidden max-w-[200px]">
                        <img
                            src={gifUrl}
                            alt="GIF"
                            className="w-full h-auto object-contain rounded-lg cursor-pointer hover:opacity-95 transition-opacity"
                            style={{ maxHeight: '160px' }}
                            onClick={() => window.open(gifUrl, '_blank')}
                        />
                    </div>
                );
            }
            case 'sticker': {
                const stickerUrl = ensureHttps(message.file_url || message.content);
                if (!stickerUrl) return null;
                return (
                    <div className="rounded-lg overflow-hidden max-w-[120px]">
                        <img
                            src={stickerUrl}
                            alt="Çıkartma"
                            className="w-full h-auto object-contain rounded-lg"
                            style={{ maxHeight: '120px' }}
                        />
                    </div>
                );
            }
            default: {
                const content = message.content || '';
                const youtubeLinks = getYoutubeVideoLinks(content);
            const instagramLinks = getInstagramLinks(content);
                return (
                    <div className="min-w-0 max-w-full space-y-2">
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{linkifyText(contentWithShortLinks(content), setPendingLinkUrl)}</p>
                        {youtubeLinks.length > 0 && (
                            <div className="flex flex-col gap-2">
                                {youtubeLinks.map(({ url, videoId, isMusic }) => (
                                    <button
                                        key={videoId}
                                        type="button"
                                        onClick={() => setPendingLinkUrl(url)}
                                        className="flex overflow-hidden rounded-lg border border-white/20 bg-black/20 hover:bg-black/30 transition-colors no-underline text-inherit max-w-[320px] text-left"
                                    >
                                        <img
                                            src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                                            alt=""
                                            className="w-28 h-20 object-cover flex-shrink-0"
                                        />
                                        <div className="flex flex-col justify-center min-w-0 p-2">
                                            <span className="text-xs font-medium opacity-90">
                                                {isMusic ? 'YouTube Music' : 'YouTube'}
                                            </span>
                                            <span className="text-[11px] opacity-75 truncate">Videoyu izle</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                        {instagramLinks.length > 0 && (
                            <div className="flex flex-col gap-2">
                                {instagramLinks.map((url, idx) => {
                                    let displayPath = '';
                                    try {
                                        const parsed = new URL(url);
                                        displayPath = parsed.pathname.replace(/\/$/, '') || '/';
                                    } catch {
                                        displayPath = url.replace(/^https?:\/\//i, '');
                                    }
                                    return (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => setPendingLinkUrl(url)}
                                            className="flex items-stretch overflow-hidden rounded-lg border border-white/20 bg-gradient-to-r from-pink-500/40 via-rose-500/40 to-orange-400/40 hover:from-pink-500/60 hover:via-rose-500/60 hover:to-orange-400/60 transition-colors no-underline text-inherit max-w-[320px] backdrop-blur-sm text-left"
                                        >
                                            <div className="w-10 flex items-center justify-center bg-gradient-to-br from-pink-500 to-orange-400 text-white font-semibold text-xs flex-shrink-0">
                                                IG
                                            </div>
                                            <div className="flex flex-col justify-center min-w-0 p-2 bg-black/10">
                                                <span className="text-xs font-medium text-white/90">
                                                    Instagram bağlantısı
                                                </span>
                                                <span className="text-[11px] text-white/80 truncate">
                                                    {displayPath}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            }
        }
    };

    const senderForColor = senderUser || { gender: senderGender };
    const bubbleColor = getProfileColor(senderForColor, viewerPrefs);
    const bubbleClass = 'text-white';
    const bubbleStyle = { background: `linear-gradient(to bottom right, ${bubbleColor}, ${bubbleColor}dd)` };

    const formatMessageDateTime = (dateString) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        if (Number.isNaN(d.getTime())) return '';

        const time = format(d, 'HH:mm', { locale: tr });
        if (isToday(d)) return `Bugün ${time}`;
        if (isYesterday(d)) return `Dün ${time}`;
        return `${format(d, 'd MMM', { locale: tr })} ${time}`;
    };

    if (message.type === 'system') {
        return (
            <div className="flex justify-center py-2 px-4">
                <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700/50 px-4 py-1.5 rounded-full max-w-[80%]">
                    <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs text-gray-400 italic text-center">{message.content}</span>
                </div>
            </div>
        );
    }

    return (
        <>
            {/* Ephemeral Photo Viewer Overlay (web'de devre dışı) */}
            {false && showEphemeralViewer && message.type === 'image' && message.is_ephemeral && (
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

            <div className={`flex items-center gap-1 ${isMine ? 'justify-end' : 'justify-start'} mb-3 px-3 min-w-0 transition-all duration-300 group`}>
                {onReaction && !message.user_deleted_at && (
                    <div className={`flex-shrink-0 ${isMine ? 'order-1 mr-1' : 'order-2 ml-1'}`}>
                        <button
                            ref={reactionButtonRef}
                            type="button"
                            onClick={() => {
                                const next = !reactionPickerOpen;
                                setReactionPickerOpen(next);
                                if (next && reactionButtonRef.current) {
                                    const rect = reactionButtonRef.current.getBoundingClientRect();
                                    const left = Math.max(8, Math.min(rect.left, window.innerWidth - REACTION_PICKER_WIDTH - 8));
                                    const top = Math.max(8, rect.top - REACTION_PICKER_HEIGHT - 8);
                                    setReactionPickerPosition({ top, left });
                                }
                            }}
                            className="text-gray-500 dark:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 touch-manipulation"
                            title="Reaksiyon ekle"
                            aria-label="Reaksiyon ekle"
                        >
                            <FaSmile className="text-base" />
                        </button>
                    </div>
                )}
                <div
                    className={`max-w-[85%] sm:max-w-[75%] min-w-0 px-4 py-3 rounded-lg shadow-sm overflow-hidden ${bubbleClass} relative transition-all duration-300 ${isHighlighted ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900' : ''} ${isMine ? 'order-2' : 'order-1'}`}
                    style={{ ...bubbleStyle, ...(isHighlighted ? { '--tw-ring-color': bubbleColor } : {}) }}
                >
                    {message.user_deleted_at ? (
                        <>
                            <div className="flex justify-between items-center gap-2">
                                <span className="text-xs italic opacity-90">
                                    {(message.sender?.username || 'Kullanıcı')} mesajı sildi
                                </span>
                            </div>
                            <span className="text-[10px] opacity-75 mt-1 block">
                                {formatMessageDateTime(message.created_at)}
                            </span>
                        </>
                    ) : (
                        <>
                    {/* Quoted Message - tıklanınca alıntılanan mesaja gider */}
                    {message.reply_to && (() => {
                        const replyToId = message.reply_to.id ?? message.reply_to.message_id;
                        const isClickable = replyToId != null && onScrollToMessage;
                        return (
                            <div
                                role={isClickable ? 'button' : undefined}
                                tabIndex={isClickable ? 0 : undefined}
                                onClick={isClickable ? () => onScrollToMessage(replyToId) : undefined}
                                onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onScrollToMessage(replyToId); } } : undefined}
                                className={`mb-2 p-2 min-w-0 max-w-full overflow-hidden bg-black/10 dark:bg-white/10 rounded-lg border-l-4 border-white/50 text-xs select-none ${isClickable ? 'cursor-pointer hover:bg-black/15 dark:hover:bg-white/15 transition-colors' : ''}`}
                                style={isClickable ? { WebkitUserSelect: 'none', userSelect: 'none' } : undefined}
                                title={isClickable ? 'Alıntılanan mesaja git' : undefined}
                            >
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
                                    ) : message.reply_to.type === 'gif' ? (
                                        <span className="inline-flex items-center gap-1.5">GIF</span>
                                    ) : message.reply_to.type === 'sticker' ? (
                                        <span className="inline-flex items-center gap-1.5">Çıkartma</span>
                                    ) : (
                                        message.reply_to.content
                                    )}
                                </p>
                            </div>
                        );
                    })()}

                    {/* Time + Menu */}
                    <div className="flex justify-between items-start mb-1.5 opacity-80 gap-2">
                        <div className="flex items-center gap-1">
                            <span className="text-[10px]">
                                {formatMessageDateTime(message.created_at)}
                            </span>
                            {isMine && !message.user_deleted_at && (
                                <span className="text-xs">
                                    {message.read_at ? (
                                        <FaCheckDouble className="text-blue-200" title={`Okundu: ${formatMessageDateTime(message.read_at)}`} />
                                    ) : (
                                        <FaCheck className="text-white/70" title="Gönderildi" />
                                    )}
                                </span>
                            )}
                        </div>
                        <div className="relative" ref={menuRef}>
                            <button
                                ref={menuButtonRef}
                                type="button"
                                onClick={() => {
                                    const next = !menuOpen;
                                    setMenuOpen(next);
                                    if (next && menuButtonRef.current) {
                                        const rect = menuButtonRef.current.getBoundingClientRect();
                                        setMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                                    }
                                }}
                                className="text-white opacity-80 hover:opacity-100 transition-opacity focus:opacity-100 p-1 touch-manipulation"
                                title="Menü"
                                aria-label="Menü"
                            >
                                <FaEllipsisV className="text-xs transform rotate-90" />
                            </button>
                            {menuOpen && createPortal(
                                <div
                                    ref={menuDropdownRef}
                                    className="fixed py-1 min-w-[120px] bg-gray-800 dark:bg-gray-700 rounded-lg shadow-xl border border-gray-600 z-[9999]"
                                    style={{ top: menuPosition.top, right: menuPosition.right }}
                                >
                                    {onReply && (
                                        <button
                                            type="button"
                                            onClick={() => { onReply(message); setMenuOpen(false); }}
                                            className="w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600 flex items-center gap-2"
                                        >
                                            Yanıtla
                                        </button>
                                    )}
                                    {canEdit && (
                                        <button
                                            type="button"
                                            onClick={() => { setEditContent(message.content || ''); setEditing(true); setMenuOpen(false); }}
                                            className="w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600 flex items-center gap-2"
                                        >
                                            <FaEdit className="text-sm" /> Düzenle
                                        </button>
                                    )}
                                    {canDelete && (
                                        <button
                                            type="button"
                                            onClick={() => { onDelete(message); setMenuOpen(false); }}
                                            className="w-full px-3 py-2 text-left text-sm text-red-300 hover:bg-gray-700 dark:hover:bg-gray-600 flex items-center gap-2"
                                        >
                                            <FaTrash className="text-sm" /> Sil
                                        </button>
                                    )}
                                </div>,
                                document.body
                            )}
                        </div>
                    </div>

                    {/* Edit mode */}
                    {editing && message.type === 'text' && (
                        <div className="mt-2 space-y-2">
                            <textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                className="w-full min-h-[60px] px-3 py-2 rounded-lg bg-white/20 text-white placeholder-white/60 text-sm resize-none border border-white/30 focus:outline-none focus:ring-1 focus:ring-white/50"
                                placeholder="Mesaj..."
                                rows={3}
                                autoFocus
                            />
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => { onEdit(message, editContent.trim()); setEditing(false); }}
                                    className="px-3 py-1.5 rounded-lg bg-white/25 text-white text-sm font-medium hover:bg-white/30"
                                >
                                    Kaydet
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setEditing(false); setEditContent(''); }}
                                    className="px-3 py-1.5 rounded-lg bg-white/10 text-white/90 text-sm hover:bg-white/20"
                                >
                                    İptal
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Content */}
                    {!editing && renderContent()}
                    {message.edited_at && !editing && (
                        <p className="text-[10px] opacity-75 mt-1 italic">düzenlendi</p>
                    )}

                    {/* Reactions summary – atılan emojiler mesajın altında */}
                    {!message.user_deleted_at && (() => {
                        const reactionsList = message.reactions || [];
                        const byEmoji = {};
                        reactionsList.forEach((r) => {
                            if (!byEmoji[r.emoji]) byEmoji[r.emoji] = [];
                            byEmoji[r.emoji].push(r.user_id);
                        });
                        const summary = Object.entries(byEmoji).map(([emoji, userIds]) => ({
                            emoji,
                            count: userIds.length,
                            includesMe: currentUserId && userIds.includes(currentUserId),
                        }));
                        if (summary.length === 0) return null;
                        return (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                {summary.map(({ emoji, count, includesMe }) => (
                                    <span
                                        key={emoji}
                                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs ${includesMe ? 'bg-white/25 ring-1 ring-white/40' : 'bg-black/15'}`}
                                        title={count > 1 ? `${count} kişi` : ''}
                                    >
                                        <span>{emoji}</span>
                                        {count > 1 && <span className="opacity-90">{count}</span>}
                                    </span>
                                ))}
                            </div>
                        );
                    })()}
                        </>
                    )}
                </div>
                {reactionPickerOpen && createPortal(
                    <div
                        ref={reactionPickerRef}
                        className="fixed flex items-center gap-1 p-1.5 rounded-xl bg-gray-800 dark:bg-gray-700 shadow-xl border border-gray-600 z-[9999]"
                        style={{
                            top: reactionPickerPosition.top,
                            left: reactionPickerPosition.left,
                        }}
                    >
                        {REACTION_EMOJIS.map((emoji) => (
                            <button
                                key={emoji}
                                type="button"
                                onClick={() => {
                                    onReaction(message, emoji);
                                    setReactionPickerOpen(false);
                                }}
                                className="p-2 rounded-lg text-lg leading-none hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors hover:scale-110"
                                title={emoji === '😠' ? 'Kızgın' : emoji === '😂' ? 'Gülme' : emoji === '❤️' ? 'Kalp' : 'Üzgün'}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>,
                    document.body
                )}
            </div>
            {pendingLinkUrl && (
                <LinkRedirectModal url={pendingLinkUrl} onClose={() => setPendingLinkUrl(null)} />
            )}
        </>
    );
};

export default MessageBubble;
