import React, { useState, useRef, useEffect } from 'react';
import { FaPaperPlane, FaImage, FaMicrophone, FaTimes, FaStop } from 'react-icons/fa';

const MessageInput = ({ onSendMessage, disabled = false }) => {
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

    useEffect(() => {
        return () => {
            // Cleanup on unmount
            if (recordingIntervalRef.current) {
                clearInterval(recordingIntervalRef.current);
            }
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
        };
    }, []);

    const handleFileSelect = (e, type) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file size (10MB max)
        if (file.size > 10 * 1024 * 1024) {
            alert('Dosya boyutu 10MB\'dan küçük olmalıdır.');
            return;
        }

        setSelectedFile(file);
        setFileType(type);

        // Create preview for images
        if (type === 'image') {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewUrl(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

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

                // Auto-send the recording
                onSendMessage({
                    content: '',
                    file: audioFile,
                    type: 'audio'
                });

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());

                // Reset recording state
                setIsRecording(false);
                setRecordingTime(0);
                if (recordingIntervalRef.current) {
                    clearInterval(recordingIntervalRef.current);
                }
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);

            // Start timer
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
            // Stop all tracks
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

        // Reset form
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
        <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5">
            {/* Recording State */}
            {isRecording && (
                <div className="mb-4 p-4 bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 rounded-2xl border-2 border-red-200 dark:border-red-700 flex items-center justify-between shadow-lg animate-pulse">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <FaMicrophone className="text-red-500 text-2xl animate-pulse" />
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-red-600 dark:text-red-400">Ses kaydediliyor...</p>
                            <p className="text-xl font-mono font-bold text-red-700 dark:text-red-300">{formatTime(recordingTime)}</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={stopRecording}
                            className="p-3 bg-gradient-to-br from-green-500 to-emerald-500 text-white rounded-xl hover:shadow-xl transition-all hover:scale-105 active:scale-95"
                            title="Gönder"
                        >
                            <FaStop className="text-lg" />
                        </button>
                        <button
                            onClick={cancelRecording}
                            className="p-3 bg-gradient-to-br from-gray-500 to-gray-600 text-white rounded-xl hover:shadow-xl transition-all hover:scale-105 active:scale-95"
                            title="İptal"
                        >
                            <FaTimes className="text-lg" />
                        </button>
                    </div>
                </div>
            )}

            {/* File Preview */}
            {selectedFile && (
                <div className="mb-4 p-4 bg-gradient-to-r from-gray-50 to-white dark:from-gray-700/50 dark:to-gray-700/30 rounded-2xl border border-gray-200 dark:border-gray-600 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                        {fileType === 'image' && (
                            <img src={previewUrl} alt="Preview" className="w-20 h-20 rounded-xl object-cover shadow-md" />
                        )}
                    </div>
                    <button
                        onClick={clearFile}
                        className="p-2.5 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                    >
                        <FaTimes className="text-lg" />
                    </button>
                </div>
            )}

            {/* Input Area */}
            <div className="flex items-end gap-2 sm:gap-3">
                {/* File Upload Buttons */}
                <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    onChange={(e) => handleFileSelect(e, 'image')}
                    className="hidden"
                />

                <button
                    onClick={() => imageInputRef.current?.click()}
                    disabled={disabled || selectedFile || isRecording}
                    className="p-3.5 text-gray-500 hover:text-coral hover:bg-gradient-to-br hover:from-coral/10 hover:to-coral/5 dark:hover:bg-gray-700 rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
                    title="Resim gönder"
                >
                    <FaImage className="text-xl" />
                </button>

                <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={disabled || selectedFile}
                    className={`p-3.5 rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95 ${isRecording
                            ? 'text-red-500 bg-red-100 dark:bg-red-900/30 animate-pulse'
                            : 'text-gray-500 hover:text-coral hover:bg-gradient-to-br hover:from-coral/10 hover:to-coral/5 dark:hover:bg-gray-700'
                        }`}
                    title={isRecording ? "Kaydı durdur ve gönder" : "Ses kaydı"}
                >
                    <FaMicrophone className="text-xl" />
                </button>

                {/* Text Input */}
                <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Mesaj yaz..."
                    disabled={disabled || isRecording}
                    rows={1}
                    className="flex-1 px-5 py-3.5 border border-gray-300 dark:border-gray-600 rounded-2xl bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed text-[15px] transition-all"
                    style={{ maxHeight: '120px', minHeight: '52px' }}
                />

                {/* Send Button */}
                <button
                    onClick={handleSend}
                    disabled={disabled || (!message.trim() && !selectedFile) || isRecording}
                    className="p-3.5 bg-gradient-to-br from-coral via-coral to-coral-dark text-white rounded-2xl hover:shadow-2xl hover:shadow-coral/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none hover:scale-105 active:scale-95 min-w-[52px] min-h-[52px] flex items-center justify-center"
                >
                    <FaPaperPlane className="text-xl" />
                </button>
            </div>

            {!isRecording && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 px-1">
                    <span className="font-medium">Enter</span> ile gönder, <span className="font-medium">Shift+Enter</span> ile yeni satır
                </p>
            )}
        </div>
    );
};

export default MessageInput;
