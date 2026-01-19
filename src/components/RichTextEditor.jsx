import React, { useState, useRef } from 'react';
import { FaBold, FaItalic, FaListUl, FaImage } from 'react-icons/fa';

const RichTextEditor = ({ value, onChange, placeholder = 'Detayları buraya yazın...' }) => {
    const editorRef = useRef(null);
    const [imageUrl, setImageUrl] = useState('');

    const applyFormat = (command) => {
        document.execCommand(command, false, null);
        editorRef.current?.focus();
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImageUrl(reader.result);
                // Insert image into editor
                document.execCommand('insertImage', false, reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleInput = () => {
        if (onChange) {
            onChange(editorRef.current?.innerHTML || '');
        }
    };

    return (
        <div className="border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden focus-within:border-coral focus-within:ring-1 focus-within:ring-coral/20 transition-all">
            {/* Toolbar */}
            <div className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 px-3 py-2 flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => applyFormat('bold')}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                    title="Kalın"
                >
                    <FaBold className="text-gray-700 dark:text-gray-300" />
                </button>
                <button
                    type="button"
                    onClick={() => applyFormat('italic')}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                    title="İtalik"
                >
                    <FaItalic className="text-gray-700 dark:text-gray-300" />
                </button>
                <button
                    type="button"
                    onClick={() => applyFormat('insertUnorderedList')}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                    title="Liste"
                >
                    <FaListUl className="text-gray-700 dark:text-gray-300" />
                </button>

                <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1"></div>

                <label className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors cursor-pointer" title="Görsel Ekle">
                    <FaImage className="text-gray-700 dark:text-gray-300" />
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                    />
                </label>
            </div>

            {/* Editor Area */}
            <div
                ref={editorRef}
                contentEditable
                onInput={handleInput}
                className="min-h-[150px] p-4 outline-none prose prose-sm max-w-none dark:bg-gray-800 dark:text-white"
                dangerouslySetInnerHTML={{ __html: value }}
                data-placeholder={placeholder}
                style={{
                    ':empty::before': {
                        content: 'attr(data-placeholder)',
                        color: '#9CA3AF'
                    }
                }}
            />

            <style>{`
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
      `}</style>
        </div>
    );
};

export default RichTextEditor;
