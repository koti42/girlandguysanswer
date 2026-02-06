import React, { useRef, useEffect, useState } from 'react';
import { FaBold, FaItalic, FaImage, FaPalette } from 'react-icons/fa';

const RichTextEditor = ({ value, onChange, placeholder = 'Detayları buraya yazın...', uploadImage }) => {
    const editorRef = useRef(null);
    const fileInputRef = useRef(null);
    const [selectedImg, setSelectedImg] = useState(null);
    const [overlayStyle, setOverlayStyle] = useState(null);
    const isResizing = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(0);

    useEffect(() => {
        if (editorRef.current && value !== editorRef.current.innerHTML) {
            editorRef.current.innerHTML = value || '';
        }
    }, [value]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;

        const handleClick = (e) => {
            if (e.target.tagName === 'IMG') {
                setSelectedImg(e.target);
                updateOverlayPosition(e.target);
            } else {
                if (!e.target.classList.contains('resizer-handle')) {
                    setSelectedImg(null);
                    setOverlayStyle(null);
                }
            }
        };

        const handleScroll = () => {
            if (selectedImg) updateOverlayPosition(selectedImg);
        };

        editor.addEventListener('click', handleClick);
        editor.addEventListener('keydown', () => { setSelectedImg(null); setOverlayStyle(null); });
        editor.addEventListener('scroll', handleScroll);

        return () => {
            editor.removeEventListener('click', handleClick);
            editor.removeEventListener('keydown', () => { });
            editor.removeEventListener('scroll', handleScroll);
        };
    }, [selectedImg]);

    useEffect(() => {
        if (!selectedImg) return;
        const resizeObserver = new ResizeObserver(() => {
            updateOverlayPosition(selectedImg);
        });
        resizeObserver.observe(selectedImg);
        return () => resizeObserver.disconnect();
    }, [selectedImg]);


    const updateOverlayPosition = (img) => {
        if (!editorRef.current || !img) return;
        const editorRect = editorRef.current.getBoundingClientRect();
        const imgRect = img.getBoundingClientRect();

        setOverlayStyle({
            top: imgRect.top - editorRect.top + editorRef.current.scrollTop,
            left: imgRect.left - editorRect.left + editorRef.current.scrollLeft,
            width: imgRect.width,
            height: imgRect.height
        });
    };

    const handleMouseDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing.current = true;
        startX.current = e.clientX;
        startWidth.current = selectedImg.offsetWidth;

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e) => {
        if (!isResizing.current || !selectedImg) return;
        const diff = e.clientX - startX.current;
        const newWidth = Math.max(50, startWidth.current + diff);

        selectedImg.style.width = `${newWidth}px`;
        updateOverlayPosition(selectedImg);
    };

    const handleMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        updateContent();
    };

    const execCommand = (command, cmdValue = null) => {
        document.execCommand(command, false, cmdValue);
        editorRef.current?.focus();
        setTimeout(updateContent, 0);
    };

    const handleImageUpload = async (e) => {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            if (typeof uploadImage === 'function') {
                const url = await uploadImage(file);
                if (url) execCommand('insertImage', url);
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                execCommand('insertImage', event.target?.result);
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error('Image upload failed:', err);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
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
        <div className="border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden focus-within:border-coral focus-within:ring-2 focus-within:ring-coral/20 transition-all relative">
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
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        fileInputRef.current?.click();
                    }}
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
            <div className="relative">
                <div
                    ref={editorRef}
                    contentEditable
                    onInput={updateContent}
                    onPaste={handlePaste}
                    data-placeholder={placeholder}
                    className="min-h-[200px] max-h-[600px] overflow-y-auto resize-y p-4 outline-none dark:bg-gray-800 dark:text-white prose prose-sm max-w-none"
                    suppressContentEditableWarning
                    style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                    }}
                />

                {/* Resizer Overlay */}
                {selectedImg && overlayStyle && (
                    <div
                        className="absolute border-2 border-coral pointer-events-none"
                        style={{
                            top: overlayStyle.top,
                            left: overlayStyle.left,
                            width: overlayStyle.width,
                            height: overlayStyle.height,
                            zIndex: 10
                        }}
                    >
                        {/* Right Handle */}
                        <div
                            onMouseDown={handleMouseDown}
                            className="resizer-handle absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-8 bg-coral rounded-md cursor-ew-resize pointer-events-auto shadow-md"
                        />
                    </div>
                )}
            </div>

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
                    cursor: pointer;
                }
                [contenteditable] img:hover {
                    opacity: 0.95;
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
