import React, { useState, useRef, useEffect } from 'react';
import { FaImage, FaMicrophone, FaTimes, FaPaperPlane, FaSmile } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import GifPickerModal from '../GifPickerModal';
import EphemeralPhotoModal from './EphemeralPhotoModal';
import ReplyBar from './ReplyBar';
import StickerGifDrawer from './StickerGifDrawer';
import RecordingBar from './RecordingBar';
import { MAX_CHARS, WAVE_LENGTH } from './constants';

export default function MessageInput({ onSendMessage, disabled = false, replyingTo, onCancelReply, onTyping, onScrollToQuotedMessage }) {
    const { user } = useAuth();
    const canSendImages = (user?.allow_image_messages ?? user?.detail?.allow_image_messages ?? true) !== false;
    const canSendAudio = (user?.allow_audio_messages ?? user?.detail?.allow_audio_messages ?? true) !== false;
    const [message, setMessage] = useState('');
    const typingTimeoutRef = useRef(null);
    const typingStopRef = useRef(null);
    const onTypingRef = useRef(onTyping);
    // Ref'i çizim sırasında değil efektte tazeliyoruz. Çizim sırasında
    // ref yazmak React'in eşzamanlı çizimlerinde yarım kalan bir render'ın
    // değeri sızdırmasına yol açabiliyor (react-hooks/refs).
    useEffect(() => {
        onTypingRef.current = onTyping;
    }, [onTyping]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [fileType, setFileType] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isEphemeral, setIsEphemeral] = useState(false);
    const [ephemeralMaxViews, setEphemeralMaxViews] = useState(null);
    const [showEphemeralModal, setShowEphemeralModal] = useState(false);
    const [ephemeralModalChosenOption, setEphemeralModalChosenOption] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [volumeWave, setVolumeWave] = useState([]);
    const [showStickerGifDrawer, setShowStickerGifDrawer] = useState(false);
    const [stickerGifTab, setStickerGifTab] = useState('stickers');
    const [showGifPicker, setShowGifPicker] = useState(false);
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

    useEffect(() => {
        if (replyingTo && inputRef.current) inputRef.current.focus();
    }, [replyingTo]);

    useEffect(() => {
        const fn = onTypingRef.current;
        if (!fn) return;
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        if (typingStopRef.current) clearTimeout(typingStopRef.current);
        if (message.trim().length === 0) return;
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
            if (message.trim().length === 0) onTypingRef.current?.(false);
        }, 2000);
    };

    useEffect(() => {
        return () => {
            if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
            if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
        };
    }, []);

    const ensureHttps = (url) => {
        if (!url) return url;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        return `https://${url}`;
    };

    const handleFileSelect = (e, type) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        if (type === 'image') {
            for (const file of files) {
                if (file.size > 10 * 1024 * 1024) {
                    alert('Her bir dosya boyutu 10MB\'dan küçük olmalıdır.');
                    continue;
                }
                onSendMessage({
                    content: '',
                    file,
                    type: 'image',
                    is_ephemeral: isEphemeral,
                    ephemeral_max_views: isEphemeral ? ephemeralMaxViews : null,
                });
            }

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

        const file = files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
            alert('Dosya boyutu 10MB\'dan küçük olmalıdır.');
            return;
        }
        setSelectedFile(file);
        setFileType(type);
        setIsEphemeral(false);
        setEphemeralMaxViews(null);
    };

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
                analyserRef.current.getByteFrequencyData(dataArray);
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
        } catch {
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
                if (event.data.size > 0) audioChunksRef.current.push(event.data);
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
                onSendMessage({ content: '', file: audioFile, type: 'audio' });
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
            recordingIntervalRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Mikrofon erişimi reddedildi veya kullanılamıyor.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    };

    const cancelRecording = () => {
        cancelRequestedRef.current = true;
        stopVolumeVisualization();
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
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

    return (
        <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-2 sm:p-3 min-w-0 overflow-hidden">
            <EphemeralPhotoModal
                isOpen={showEphemeralModal}
                chosenOption={ephemeralModalChosenOption}
                onChooseOption={setPhotoOptionInModal}
                onOpenPhotoPicker={() => imageInputRef.current?.click()}
                onClose={() => {
                    setShowEphemeralModal(false);
                    setEphemeralModalChosenOption(null);
                }}
            />

            <ReplyBar
                replyingTo={replyingTo}
                currentUserId={user?.id}
                onScrollToQuotedMessage={onScrollToQuotedMessage}
                onCancelReply={onCancelReply}
            />

            <StickerGifDrawer
                isOpen={showStickerGifDrawer}
                activeTab={stickerGifTab}
                onTabChange={setStickerGifTab}
                onCloseDrawer={() => setShowStickerGifDrawer(false)}
                onOpenGifPicker={() => setShowGifPicker(true)}
                onSendMessage={onSendMessage}
            />

            <GifPickerModal
                isOpen={showGifPicker}
                onClose={() => setShowGifPicker(false)}
                onSelect={(url) => {
                    if (url) {
                        onSendMessage({ type: 'gif', content: url });
                        setShowStickerGifDrawer(false);
                    }
                    setShowGifPicker(false);
                }}
                title="GIF Seç"
            />

            {isRecording && (
                <RecordingBar
                    volumeWave={volumeWave}
                    recordingTime={recordingTime}
                    onCancel={cancelRecording}
                    onStop={stopRecording}
                />
            )}

            {selectedFile && (
                <div className="mb-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center justify-between">
                    {fileType === 'image' && <img src={previewUrl} alt="Preview" className="w-12 h-12 rounded-lg object-cover" />}
                    <button onClick={clearFile} className="p-1.5 text-gray-500 hover:text-red-500 rounded-full">
                        <FaTimes className="text-sm" />
                    </button>
                </div>
            )}

            <div className="flex items-end gap-1 sm:gap-2 min-w-0">
                <img
                    src={ensureHttps(user?.avatar) || 'https://i.pravatar.cc/200?u=default'}
                    alt="You"
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover flex-shrink-0 hidden md:block"
                />
                <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    multiple
                    onChange={(e) => handleFileSelect(e, 'image')}
                    className="hidden"
                />
                <button
                    type="button"
                    onClick={() => setShowStickerGifDrawer(prev => !prev)}
                    disabled={disabled || isRecording}
                    className={`p-1.5 sm:p-2 flex-shrink-0 transition-colors ${showStickerGifDrawer ? 'text-coral' : 'text-gray-500 hover:text-coral'} disabled:opacity-50`}
                    title="Çıkartma ve GIF"
                >
                    <FaSmile className="text-base sm:text-lg" />
                </button>
                <button
                    onClick={() => {
                        if (!canSendImages) {
                            alert('Fotoğraf gönderme ayarınız kapalı.');
                            return;
                        }
                        setEphemeralModalChosenOption(null);
                        setShowEphemeralModal(true);
                    }}
                    disabled={disabled || isRecording || !canSendImages}
                    className="p-1.5 sm:p-2 disabled:opacity-50 flex-shrink-0 text-gray-500 hover:text-coral"
                    title={canSendImages ? 'Fotoğraf gönder' : 'Fotoğraf gönderme ayarı kapalı'}
                >
                    <FaImage className="text-base sm:text-lg" />
                </button>
                <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={disabled || selectedFile || !canSendAudio}
                    className={`p-1.5 sm:p-2 disabled:opacity-50 flex-shrink-0 ${isRecording ? 'text-coral' : 'text-gray-500 hover:text-coral'}`}
                    title={canSendAudio ? 'Ses kaydı gönder' : 'Ses kaydı gönderme ayarı kapalı'}
                >
                    <FaMicrophone className="text-base sm:text-lg" />
                </button>
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
                    placeholder={replyingTo ? 'Yanıt...' : 'Mesaj...'}
                    disabled={disabled || isRecording}
                    className="flex-1 min-w-0 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-sm sm:text-base focus:outline-none focus:ring-1 disabled:opacity-50 resize-none overflow-y-auto min-h-[36px] max-h-[100px] sm:max-h-[120px] bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-purple-400"
                />
                <button
                    onClick={handleSend}
                    disabled={disabled || (!message.trim() && !selectedFile) || isRecording}
                    className="p-2 sm:p-2.5 md:px-4 md:py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0 flex items-center justify-center min-w-[40px] sm:min-w-[44px] bg-purple-600 hover:bg-purple-700"
                >
                    <FaPaperPlane className="text-sm sm:text-base md:hidden" />
                    <span className="hidden md:inline text-sm font-medium">Gönder</span>
                </button>
            </div>
            <div className="text-right text-[10px] sm:text-xs text-gray-500 mt-1">
                {message.length}/{MAX_CHARS}
            </div>
        </div>
    );
}
