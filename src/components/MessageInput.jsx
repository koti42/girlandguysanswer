import React, { useState, useRef } from 'react';
import { FaPaperPlane, FaImage, FaMicrophone, FaTimes } from 'react-icons/fa';

const MessageInput = ({ onSendMessage, disabled = false }) => {
    const [message, setMessage] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [fileType, setFileType] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const imageInputRef = useRef(null);
    const audioInputRef = useRef(null);

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
        } else {
            setPreviewUrl(file.name);
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
        if (audioInputRef.current) audioInputRef.current.value = '';
    };

    return (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5">
            {/* File Preview */}
            {selectedFile && (
                <div className="mb-4 p-4 bg-gradient-to-r from-gray-50 to-white dark:from-gray-700/50 dark:to-gray-700/30 rounded-2xl border border-gray-200 dark:border-gray-600 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                        {fileType === 'image' ? (
                            <img src={previewUrl} alt="Preview" className="w-20 h-20 rounded-xl object-cover shadow-md" />
                        ) : (
                            <div className="flex items-center gap-3 bg-white dark:bg-gray-800 px-4 py-2 rounded-xl">
                                <FaMicrophone className="text-coral text-xl" />
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{previewUrl}</span>
                            </div>
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
                <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/mp3,audio/wav,audio/ogg,audio/m4a,audio/webm"
                    onChange={(e) => handleFileSelect(e, 'audio')}
                    className="hidden"
                />

                <button
                    onClick={() => imageInputRef.current?.click()}
                    disabled={disabled || selectedFile}
                    className="p-3.5 text-gray-500 hover:text-coral hover:bg-gradient-to-br hover:from-coral/10 hover:to-coral/5 dark:hover:bg-gray-700 rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
                    title="Resim gönder"
                >
                    <FaImage className="text-xl" />
                </button>

                <button
                    onClick={() => audioInputRef.current?.click()}
                    disabled={disabled || selectedFile}
                    className="p-3.5 text-gray-500 hover:text-coral hover:bg-gradient-to-br hover:from-coral/10 hover:to-coral/5 dark:hover:bg-gray-700 rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
                    title="Ses dosyası gönder"
                >
                    <FaMicrophone className="text-xl" />
                </button>

                {/* Text Input */}
                <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Mesaj yaz..."
                    disabled={disabled}
                    rows={1}
                    className="flex-1 px-5 py-3.5 border border-gray-300 dark:border-gray-600 rounded-2xl bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed text-[15px] transition-all"
                    style={{ maxHeight: '120px', minHeight: '52px' }}
                />

                {/* Send Button */}
                <button
                    onClick={handleSend}
                    disabled={disabled || (!message.trim() && !selectedFile)}
                    className="p-3.5 bg-gradient-to-br from-coral via-coral to-coral-dark text-white rounded-2xl hover:shadow-2xl hover:shadow-coral/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none hover:scale-105 active:scale-95 min-w-[52px] min-h-[52px] flex items-center justify-center"
                >
                    <FaPaperPlane className="text-xl" />
                </button>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 px-1">
                <span className="font-medium">Enter</span> ile gönder, <span className="font-medium">Shift+Enter</span> ile yeni satır
            </p>
        </div>
    );
};

export default MessageInput;
