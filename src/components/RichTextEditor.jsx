import React, { useRef, useEffect } from 'react';
import { FaBold, FaItalic, FaImage, FaPalette } from 'react-icons/fa';

const RichTextEditor = ({ value, onChange, placeholder = 'Detayları buraya yazın...' }) => {
    const editorRef = useRef(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (editorRef.current && value !== editorRef.current.innerHTML) {
            editorRef.current.innerHTML = value || '';
        }
    }, [value]);

    const execCommand = (command, cmdValue = null) => {
        document.execCommand(command, false, cmdValue);
        editorRef.current?.focus();
        // Trigger update after command
        setTimeout(updateContent, 0);
    };

    const handleImageUpload = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                execCommand('insertImage', event.target?.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleColorChange = () => {
        const color = prompt('Renk kodu girin (örn: #ff0000 veya red):');
        if (color) {
            execCommand('foreColor', color);
        }
    };

    const updateContent = () => {
        if (onChange && editorRef.current) {
            const content = editorRef.current.innerHTML;
            // Only update if content actually changed
            if (content !== value) {
                onChange(content);
            }
        }
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    };

    return (
        <div className="border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden focus-within:border-coral focus-within:ring-2 focus-within:ring-coral/20 transition-all">
            {/* Toolbar */}
            <div className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 px-3 py-2 flex items-center gap-1 flex-wrap">
                <button
                    type="button"
                    onClick={() => execCommand('bold')}
                    className="p-2.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                    title="Kalın (Ctrl+B)"
                >
                    <FaBold className="text-gray-700 dark:text-gray-300" />
                </button>
                <button
                    type="button"
                    onClick={() => execCommand('italic')}
                    className="p-2.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                    title="İtalik (Ctrl+I)"
                >
                    <FaItalic className="text-gray-700 dark:text-gray-300" />
                </button>

                <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1"></div>

                <button
                    type="button"
                    onClick={handleColorChange}
                    className="p-2.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                    title="Yazı Rengi"
                >
                    <FaPalette className="text-gray-700 dark:text-gray-300" />
                </button>

                <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1"></div>

                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                    title="Görsel Ekle"
                >
                    <FaImage className="text-gray-700 dark:text-gray-300" />
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                />
            </div>

            {/* Editor */}
            <div
                ref={editorRef}
                contentEditable
                onInput={updateContent}
                onPaste={handlePaste}
                data-placeholder={placeholder}
                className="min-h-[200px] max-h-[500px] overflow-y-auto p-4 outline-none dark:bg-gray-800 dark:text-white prose prose-sm max-w-none"
                suppressContentEditableWarning
                style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                }}
            />

            <style>{`
                [contenteditable]:focus {
                    outline: none;
                }
                [contenteditable]:empty:before {
                    content: attr(data-placeholder);
                    color: #9CA3AF;
                    pointer-events: none;
                }
                [contenteditable] img {
                    max-width: 100%;
                    height: auto;
                    border-radius: 8px;
                    margin: 8px 0;
                }
                [contenteditable] p {
                    margin: 0;
                    padding: 0;
                }
                .prose strong {
                    font-weight: 700;
                }
                .prose em {
                    font-style: italic;
                }
            `}</style>
        </div>
    );
};

export default RichTextEditor;
