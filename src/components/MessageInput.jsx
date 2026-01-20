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
        <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            {/* File Preview */}
            {selectedFile && (
                <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {fileType === 'image' ? (
                            <img src={previewUrl} alt="Preview" className="w-16 h-16 rounded object-cover" />
                        ) : (
                            <div className="flex items-center gap-2">
                                <FaMicrophone className="text-coral" />
                                <span className="text-sm text-gray-700 dark:text-gray-300">{previewUrl}</span>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={clearFile}
                        className="text-gray-500 hover:text-red-500 transition-colors"
                    >
                        <FaTimes />
                    </button>
                </div>
            )}

            {/* Input Area */}
            <div className="flex items-end gap-2">
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
                    className="p-3 text-gray-500 hover:text-coral hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Resim gönder"
                >
                    <FaImage className="text-xl" />
                </button>

                <button
                    onClick={() => audioInputRef.current?.click()}
                    disabled={disabled || selectedFile}
                    className="p-3 text-gray-500 hover:text-coral hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ maxHeight: '120px', minHeight: '48px' }}
                />

                {/* Send Button */}
                <button
                    onClick={handleSend}
                    disabled={disabled || (!message.trim() && !selectedFile)}
                    className="p-3 bg-gradient-to-r from-coral to-coral-dark text-white rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                    <FaPaperPlane className="text-xl" />
                </button>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Enter ile gönder, Shift+Enter ile yeni satır
            </p>
        </div>
    );
};

export default MessageInput;
