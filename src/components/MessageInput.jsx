import React, { useState, useRef, useEffect } from 'react';
import { FaImage, FaMicrophone, FaTimes, FaStop, FaPaperPlane } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';

const MessageInput = ({ onSendMessage, disabled = false, replyingTo, onCancelReply }) => {
    const { user } = useAuth();
    const [message, setMessage] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [fileType, setFileType] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const imageInputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const recordingIntervalRef = useRef(null);
    const inputRef = useRef(null);

    const MAX_CHARS = 1000;

    // Focus input when replying starts
    useEffect(() => {
        if (replyingTo && inputRef.current) {
            inputRef.current.focus();
        }
    }, [replyingTo]);

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
        // ... (rest of the function)
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
            alert('Dosya boyutu 10MB\'dan küçük olmalıdır.');
            return;
        }

        setSelectedFile(file);
        setFileType(type);

        if (type === 'image') {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewUrl(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    // ... (rest of functions)

    // NOTE: Since I am replacing the top part, I need to be careful with preserving the rest of the functions if I were using replace_file_content on a large block, but let's use a smaller targeted replacement.

    // Wait, the instruction says "Add replyingTo logic and UI". To do this cleanly, I should probably do two replacements. 
    // 1. Update component signature and add useEffect for focus. 
    // 2. Add the UI rendering part.

    // Let's restart the tool call strategy to be safer.
    // First, update signature and add hooks.




    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });

                onSendMessage({
                    content: '',
                    file: audioFile,
                    type: 'audio'
                });

                stream.getTracks().forEach(track => track.stop());
                setIsRecording(false);
                setRecordingTime(0);
                if (recordingIntervalRef.current) {
                    clearInterval(recordingIntervalRef.current);
                }
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);

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
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }

        setIsRecording(false);
        setRecordingTime(0);
        audioChunksRef.current = [];

        if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
        }
    };

    const handleSend = () => {
        if (!message.trim() && !selectedFile) return;

        onSendMessage({
            content: message.trim(),
            file: selectedFile,
            type: selectedFile ? fileType : 'text'
        });

        setMessage('');
        setSelectedFile(null);
        setFileType(null);
        setPreviewUrl(null);
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const clearFile = () => {
        setSelectedFile(null);
        setFileType(null);
        setPreviewUrl(null);
        if (imageInputRef.current) imageInputRef.current.value = '';
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="bg-white border-t border-gray-200 p-2">
            {replyingTo && (
                <div className="mb-2 p-2 bg-gray-100 rounded-lg border-l-4 border-pink-500 flex justify-between items-center">
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-xs font-bold text-pink-600">
                            {replyingTo.sender_id === user.id ? 'Kendine yanıt veriyorsun' : `${replyingTo.sender?.username || 'Kullanıcı'} kullanıcısına yanıt veriyorsun`}
                        </span>
                        <span className="text-xs text-gray-600 truncate">
                            {replyingTo.type === 'image' ? '📷 Fotoğraf' : replyingTo.type === 'audio' ? '🎤 Sesli Mesaj' : replyingTo.content}
                        </span>
                    </div>
                    <button
                        onClick={onCancelReply}
                        className="p-1 text-gray-500 hover:text-red-500"
                    >
                        <FaTimes />
                    </button>
                </div>
            )}
            {isRecording && (
                <div className="mb-2 p-2 bg-red-50 rounded-lg border border-red-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <FaMicrophone className="text-red-500 animate-pulse" />
                        <div>
                            <p className="text-xs font-bold text-red-600">Kaydediliyor...</p>
                            <p className="text-sm font-mono font-bold text-red-700">{formatTime(recordingTime)}</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={stopRecording}
                            className="p-1.5 bg-green-500 text-white rounded-full hover:bg-green-600"
                        >
                            <FaStop className="text-xs" />
                        </button>
                        <button
                            onClick={cancelRecording}
                            className="p-1.5 bg-gray-500 text-white rounded-full hover:bg-gray-600"
                        >
                            <FaTimes className="text-xs" />
                        </button>
                    </div>
                </div>
            )}

            {selectedFile && (
                <div className="mb-2 p-2 bg-gray-50 rounded-lg flex items-center justify-between">
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

            <div className="flex items-center gap-1.5 mb-1">
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
                    onClick={() => imageInputRef.current?.click()}
                    disabled={disabled || selectedFile || isRecording}
                    className="p-1.5 text-gray-500 hover:text-coral disabled:opacity-50 flex-shrink-0"
                >
                    <FaImage className="text-base" />
                </button>

                {/* Microphone Button */}
                <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={disabled || selectedFile}
                    className={`p-1.5 disabled:opacity-50 flex-shrink-0 ${isRecording ? 'text-red-500' : 'text-gray-500 hover:text-coral'
                        }`}
                >
                    <FaMicrophone className="text-base" />
                </button>

                {/* Input Field */}
                <input
                    ref={inputRef}
                    value={message}
                    onChange={(e) => {
                        if (e.target.value.length <= MAX_CHARS) {
                            setMessage(e.target.value);
                        }
                    }}
                    onKeyPress={handleKeyPress}
                    placeholder={replyingTo ? "Yanıtın..." : "Mesaj yaz..."}
                    disabled={disabled || isRecording}
                    className="flex-1 min-w-0 px-2 py-1.5 bg-gray-100 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-400 disabled:opacity-50"
                />

                {/* Send Button - Icon on mobile, Text on desktop */}
                <button
                    onClick={handleSend}
                    disabled={disabled || (!message.trim() && !selectedFile) || isRecording}
                    className="p-2 md:px-4 md:py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
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
