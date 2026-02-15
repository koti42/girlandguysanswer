import React, { useState, useRef, useEffect } from 'react';
import { FaImage, FaMicrophone, FaTimes, FaStop, FaPaperPlane } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';

const MessageInput = ({ onSendMessage, disabled = false, replyingTo, onCancelReply, onTyping }) => {
    const { user } = useAuth();
    const [message, setMessage] = useState('');
    const typingTimeoutRef = useRef(null);
    const typingStopRef = useRef(null);
    const onTypingRef = useRef(onTyping);
    onTypingRef.current = onTyping;
    const [selectedFile, setSelectedFile] = useState(null);
    const [fileType, setFileType] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isEphemeral, setIsEphemeral] = useState(false);
    const [ephemeralMaxViews, setEphemeralMaxViews] = useState(null); // 1 veya 2
    const [showEphemeralModal, setShowEphemeralModal] = useState(false);
    const [ephemeralModalChosenOption, setEphemeralModalChosenOption] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [volumeWave, setVolumeWave] = useState([]);
    const WAVE_LENGTH = 52;
    const imageInputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const streamRef = useRef(null);
    const cancelRequestedRef = useRef(false);
    const audioChunksRef = useRef([]);
    const recordingIntervalRef = useRef(null);
    const inputRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const volumeAnimationRef = useRef(null);

    const MAX_CHARS = 1000;

    // Focus input when replying starts
    useEffect(() => {
        if (replyingTo && inputRef.current) {
            inputRef.current.focus();
        }
    }, [replyingTo]);

    useEffect(() => {
        const fn = onTypingRef.current;
        if (!fn) return;
        
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        if (typingStopRef.current) clearTimeout(typingStopRef.current);
        
        if (message.trim().length === 0) {
            return;
        }
        
        onTypingRef.current(true);
        typingStopRef.current = setTimeout(() => onTypingRef.current?.(false), 2000);
        
        return () => {
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            if (typingStopRef.current) clearTimeout(typingStopRef.current);
        };
    }, [message]);

    const handleFocus = () => {
        if (!onTypingRef.current) return;
        
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        if (typingStopRef.current) clearTimeout(typingStopRef.current);
        
        onTypingRef.current(true);
        typingStopRef.current = setTimeout(() => {
            if (message.trim().length === 0) {
                onTypingRef.current?.(false);
            }
        }, 2000);
    };

    useEffect(() => {
        return () => {
            if (recordingIntervalRef.current) {
                clearInterval(recordingIntervalRef.current);
            }
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
        };
    }, []);

    const ensureHttps = (url) => {
        if (!url) return url;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        return `https://${url}`;
    };

    const handleFileSelect = (e, type) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
            alert('Dosya boyutu 10MB\'dan küçük olmalıdır.');
            return;
        }

        // Görsel için: seçilir seçilmez otomatik gönder
        if (type === 'image') {
            onSendMessage({
                content: '',
                file,
                type: 'image',
                is_ephemeral: isEphemeral,
                ephemeral_max_views: isEphemeral ? ephemeralMaxViews : null,
            });

            // Temizlik
            if (imageInputRef.current) imageInputRef.current.value = '';
            setSelectedFile(null);
            setFileType(null);
            setPreviewUrl(null);
            setIsEphemeral(false);
            setEphemeralMaxViews(null);
            setShowEphemeralModal(false);
            setEphemeralModalChosenOption(null);

            return;
        }

        // Diğer dosya tipleri için eski davranış
        setSelectedFile(file);
        setFileType(type);
        setIsEphemeral(false);
        setEphemeralMaxViews(null);
    };

    // ... (rest of functions)

    // NOTE: Since I am replacing the top part, I need to be careful with preserving the rest of the functions if I were using replace_file_content on a large block, but let's use a smaller targeted replacement.

    // Wait, the instruction says "Add replyingTo logic and UI". To do this cleanly, I should probably do two replacements. 
    // 1. Update component signature and add useEffect for focus. 
    // 2. Add the UI rendering part.

    // Let's restart the tool call strategy to be safer.
    // First, update signature and add hooks.




    const stopVolumeVisualization = () => {
        if (volumeAnimationRef.current != null) {
            cancelAnimationFrame(volumeAnimationRef.current);
            volumeAnimationRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
        }
        analyserRef.current = null;
        setVolumeWave([]);
    };

    const startVolumeVisualization = (stream) => {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioContextRef.current = audioContext;
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 128;
            analyser.smoothingTimeConstant = 0.5;
            source.connect(analyser);
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const updateVolume = () => {
                if (!analyserRef.current || !audioContextRef.current) return;
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                const level = Math.min(1, (sum / dataArray.length / 255) * 2.2);

                setVolumeWave((prev) => {
                    const next = [...prev, level];
                    if (next.length > WAVE_LENGTH) return next.slice(-WAVE_LENGTH);
                    return next;
                });
                volumeAnimationRef.current = requestAnimationFrame(updateVolume);
            };
            updateVolume();
        } catch (e) {
            setVolumeWave(Array(WAVE_LENGTH).fill(0.15));
        }
    };

    const startRecording = async () => {
        try {
            cancelRequestedRef.current = false;
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                stopVolumeVisualization();
                if (cancelRequestedRef.current) {
                    cancelRequestedRef.current = false;
                    streamRef.current?.getTracks().forEach(track => track.stop());
                    streamRef.current = null;
                    setIsRecording(false);
                    setRecordingTime(0);
                    if (recordingIntervalRef.current) {
                        clearInterval(recordingIntervalRef.current);
                        recordingIntervalRef.current = null;
                    }
                    audioChunksRef.current = [];
                    return;
                }
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
                onSendMessage({
                    content: '',
                    file: audioFile,
                    type: 'audio'
                });
                streamRef.current?.getTracks().forEach(track => track.stop());
                streamRef.current = null;
                setIsRecording(false);
                setRecordingTime(0);
                if (recordingIntervalRef.current) {
                    clearInterval(recordingIntervalRef.current);
                    recordingIntervalRef.current = null;
                }
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            startVolumeVisualization(stream);

            recordingIntervalRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Mikrofon erişimi reddedildi veya kullanılamıyor.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
    };

    const cancelRecording = () => {
        cancelRequestedRef.current = true;
        stopVolumeVisualization();
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setIsRecording(false);
        setRecordingTime(0);
        audioChunksRef.current = [];
        if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
            recordingIntervalRef.current = null;
        }
    };

    const handleSend = () => {
        if (!message.trim() && !selectedFile) return;

        onSendMessage({
            content: message.trim(),
            file: selectedFile,
            type: selectedFile ? fileType : 'text',
            is_ephemeral: isEphemeral,
            ephemeral_max_views: isEphemeral ? ephemeralMaxViews : null,
        });

        setMessage('');
        setSelectedFile(null);
        setFileType(null);
        setPreviewUrl(null);
        setIsEphemeral(false);
        setEphemeralMaxViews(null);
        setShowEphemeralModal(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }, [message]);

    const clearFile = () => {
        setSelectedFile(null);
        setFileType(null);
        setPreviewUrl(null);
        setIsEphemeral(false);
        setEphemeralMaxViews(null);
        if (imageInputRef.current) imageInputRef.current.value = '';
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const setPhotoOptionInModal = (mode) => {
        if (mode === 'normal') {
            setIsEphemeral(false);
            setEphemeralMaxViews(null);
        } else if (mode === 'one') {
            setIsEphemeral(true);
            setEphemeralMaxViews(1);
        } else if (mode === 'two') {
            setIsEphemeral(true);
            setEphemeralMaxViews(2);
        }
        setEphemeralModalChosenOption(mode);
    };

    const openPhotoPickerFromModal = () => {
        if (imageInputRef.current) imageInputRef.current.click();
    };

    const closeEphemeralModal = () => {
        setShowEphemeralModal(false);
        setEphemeralModalChosenOption(null);
    };

    return (
        <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-2 min-w-0 overflow-hidden">
            {/* Ephemeral seçenek modalı */}
            {showEphemeralModal && (
                <>
                    <div
                        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
                        onClick={closeEphemeralModal}
                        aria-hidden="true"
                    />
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
                        <div
                            className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-6">
                                <div className="flex items-center justify-center w-12 h-12 mx-auto bg-pink-100 dark:bg-pink-900/30 rounded-full mb-4">
                                    <FaImage className="text-xl text-pink-600 dark:text-pink-400" />
                                </div>
                                <h3 className="text-lg font-bold text-center text-gray-900 dark:text-gray-100 mb-2">
                                    Fotoğraf gönder
                                </h3>
                                <p className="text-sm text-center text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                                    {ephemeralModalChosenOption == null
                                        ? 'Önce nasıl göndermek istediğini seç, sonra fotoğrafı seç.'
                                        : 'Seçimin hazır. Aşağıdan fotoğrafı seç.'}
                                </p>
                                <div className="space-y-2 mb-4">
                                    <button
                                        type="button"
                                        onClick={() => setPhotoOptionInModal('normal')}
                                        className={`w-full px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${ephemeralModalChosenOption === 'normal'
                                            ? 'border-coral bg-coral/10 text-coral dark:bg-coral/20 dark:text-coral'
                                            : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                            }`}
                                    >
                                        Normal fotoğraf
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPhotoOptionInModal('one')}
                                        className={`w-full px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${ephemeralModalChosenOption === 'one'
                                            ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400'
                                            : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                            }`}
                                    >
                                        Tek bakmalık (1 görüntüleme, 10 sn)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPhotoOptionInModal('two')}
                                        className={`w-full px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${ephemeralModalChosenOption === 'two'
                                            ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                                            : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                            }`}
                                    >
                                        İki bakmalık (2 görüntüleme, her biri 10 sn)
                                    </button>
                                </div>
                                {ephemeralModalChosenOption != null && (
                                    <div className="mb-4 pt-3 border-t border-gray-200 dark:border-gray-600">
                                        <button
                                            type="button"
                                            onClick={openPhotoPickerFromModal}
                                            className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-coral to-orange-400 text-white text-sm font-semibold shadow-lg hover:shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                        >
                                            <FaImage className="text-base" />
                                            Fotoğraf seç
                                        </button>
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={closeEphemeralModal}
                                    className="w-full px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition-colors"
                                >
                                    Vazgeç
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
            {replyingTo && (
                <div className="mb-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg border-l-4 border-pink-500 flex justify-between items-start gap-2 min-w-0 max-h-[72px]">
                    <div className="flex flex-col overflow-hidden min-w-0 flex-1">
                        <span className="text-xs font-bold text-pink-600 dark:text-pink-400 truncate shrink-0">
                            {replyingTo.sender_id === user.id ? 'Kendine yanıt veriyorsun' : `${replyingTo.sender?.username || 'Kullanıcı'} kullanıcısına yanıt veriyorsun`}
                        </span>
                        <span className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 break-words overflow-hidden min-w-0" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                            {replyingTo.type === 'image' ? '📷 Fotoğraf' : replyingTo.type === 'audio' ? '🎤 Sesli Mesaj' : replyingTo.content}
                        </span>
                    </div>
                    <button
                        onClick={onCancelReply}
                        className="p-1.5 text-gray-500 hover:text-red-500 flex-shrink-0"
                    >
                        <FaTimes className="text-sm" />
                    </button>
                </div>
            )}
            {isRecording && (
                <div className="mb-2 px-3 py-2 sm:px-4 sm:py-3 rounded-xl sm:rounded-2xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <div className="flex-shrink-0 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-coral/10 dark:bg-coral/20 flex items-center justify-center ring-2 ring-coral/30 dark:ring-coral/40">
                            <FaMicrophone className="text-coral text-sm sm:text-base animate-pulse" />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5 sm:gap-1.5 overflow-hidden min-w-0">
                            <p className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">Ses kaydediliyor</p>
                            <div className="flex items-end justify-start gap-[2px] h-4 sm:h-6 min-h-[16px] sm:min-h-[24px] overflow-x-auto overflow-y-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
                                {volumeWave.length === 0 ? (
                                    <div className="flex items-end gap-[2px]">
                                        {Array.from({ length: 20 }).map((_, i) => (
                                            <div
                                                key={i}
                                                className="w-0.5 rounded-full bg-coral/40 dark:bg-coral/50"
                                                style={{ height: `${3 + (i % 3) * 3}px` }}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    volumeWave.map((level, i) => (
                                        <div
                                            key={i}
                                            className="w-[2px] min-w-[2px] sm:w-[3px] sm:min-w-[3px] rounded-full bg-coral/80 dark:bg-coral transition-[height] duration-75 ease-out flex-shrink-0"
                                            style={{ height: `${Math.max(2, 3 + level * 12)}px` }}
                                        />
                                    ))
                                )}
                            </div>
                            <p className="text-sm sm:text-base font-mono font-semibold text-gray-600 dark:text-gray-400 tabular-nums">{formatTime(recordingTime)}</p>
                        </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 flex-shrink-0 border-t border-gray-200 dark:border-gray-700 pt-2 sm:border-0 sm:pt-0">
                        <button
                            type="button"
                            onClick={cancelRecording}
                            className="px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5"
                        >
                            <FaTimes className="text-[10px]" />
                            İptal
                        </button>
                        <button
                            type="button"
                            onClick={stopRecording}
                            className="px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-coral hover:bg-coral/90 text-white text-xs font-semibold shadow-sm hover:shadow transition-all flex items-center gap-1.5"
                        >
                            <FaStop className="text-[10px]" />
                            Gönder
                        </button>
                    </div>
                </div>
            )}

            {selectedFile && (
                <div className="mb-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center justify-between">
                    {fileType === 'image' && (
                        <img src={previewUrl} alt="Preview" className="w-12 h-12 rounded-lg object-cover" />
                    )}
                    <button
                        onClick={clearFile}
                        className="p-1.5 text-gray-500 hover:text-red-500 rounded-full"
                    >
                        <FaTimes className="text-sm" />
                    </button>
                </div>
            )}

            <div className="flex items-end gap-1 sm:gap-1.5 mb-1 min-w-0">
                {/* Avatar - Hidden on mobile */}
                <img
                    src={ensureHttps(user?.avatar) || 'https://i.pravatar.cc/200?u=default'}
                    alt="You"
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0 hidden md:block"
                />

                <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    onChange={(e) => handleFileSelect(e, 'image')}
                    className="hidden"
                />

                {/* Image Button */}
                <button
                    onClick={() => {
                        setEphemeralModalChosenOption(null);
                        setShowEphemeralModal(true);
                    }}
                    disabled={disabled || isRecording}
                    className="p-1 sm:p-1.5 text-gray-500 hover:text-coral disabled:opacity-50 flex-shrink-0"
                >
                    <FaImage className="text-base" />
                </button>

                {/* Microphone Button */}
                <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={disabled || selectedFile}
                    className={`p-1 sm:p-1.5 disabled:opacity-50 flex-shrink-0 ${isRecording ? 'text-coral' : 'text-gray-500 hover:text-coral'
                        }`}
                >
                    <FaMicrophone className="text-base" />
                </button>

                {/* Input Field - textarea aşağı doğru genişler */}
                <textarea
                    ref={inputRef}
                    value={message}
                    rows={1}
                    onChange={(e) => {
                        if (e.target.value.length <= MAX_CHARS) {
                            setMessage(e.target.value);
                            if (onTypingRef.current && e.target.value.trim().length > 0) {
                                if (typingStopRef.current) clearTimeout(typingStopRef.current);
                                onTypingRef.current(true);
                                typingStopRef.current = setTimeout(() => onTypingRef.current?.(false), 2000);
                            }
                        }
                    }}
                    onKeyDown={handleKeyDown}
                    onFocus={handleFocus}
                    onBlur={() => {
                        if (typingStopRef.current) clearTimeout(typingStopRef.current);
                        onTypingRef.current?.(false);
                    }}
                    placeholder={replyingTo ? "Yanıt..." : "Mesaj..."}
                    disabled={disabled || isRecording}
                    className="flex-1 min-w-0 px-2 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-base md:text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-400 disabled:opacity-50 resize-none overflow-y-auto min-h-[38px] max-h-[120px]"
                />

                {/* Send Button - Icon on mobile, Text on desktop */}
                <button
                    onClick={handleSend}
                    disabled={disabled || (!message.trim() && !selectedFile) || isRecording}
                    className="p-1.5 sm:p-2 md:px-4 md:py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0 flex items-center justify-center min-w-[32px] sm:min-w-[36px]"
                >
                    <FaPaperPlane className="text-sm md:hidden" />
                    <span className="hidden md:inline text-xs font-bold">GÖNDER</span>
                </button>
            </div>

            {/* Character Counter */}
            <div className="text-right text-[10px] text-gray-500">
                {message.length}/{MAX_CHARS}
            </div>
        </div>
    );
};

export default MessageInput;
