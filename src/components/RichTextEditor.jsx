import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
    FaBold, FaItalic, FaUnderline, FaStrikethrough,
    FaImage, FaPalette, FaListUl, FaListOl,
    FaAlignLeft, FaAlignCenter, FaAlignRight,
    FaQuoteLeft, FaLink, FaUnlink, FaUndo, FaRedo,
    FaMinus, FaHeading, FaRemoveFormat,
} from 'react-icons/fa';

const COLOR_PRESETS = [
    '#111827', '#DC2626', '#EA580C', '#CA8A04',
    '#16A34A', '#0891B2', '#2563EB', '#7C3AED',
    '#DB2777', '#6B7280',
];

const ToolbarButton = ({ onClick, title, active, children, className = '' }) => (
    <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        title={title}
        className={`p-2 rounded-lg transition-colors ${
            active
                ? 'bg-coral/15 text-coral'
                : 'hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
        } ${className}`}
    >
        {children}
    </button>
);

const Divider = () => <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-0.5 shrink-0" />;

const RichTextEditor = ({
    value,
    onChange,
    placeholder = 'Detayları buraya yazın...',
    uploadImage,
    variant = 'default',
    minHeight = 200,
}) => {
    const editorRef = useRef(null);
    const fileInputRef = useRef(null);
    const savedSelectionRef = useRef(null);
    const [selectedImg, setSelectedImg] = useState(null);
    const [overlayStyle, setOverlayStyle] = useState(null);
    const [showColors, setShowColors] = useState(false);
    const [activeFormats, setActiveFormats] = useState({});

    const isFull = variant === 'full' || variant === 'story';

    const isResizing = useRef(false);
    const activeHandle = useRef(null);
    const startX = useRef(0);
    const startY = useRef(0);
    const startWidth = useRef(0);

    useEffect(() => {
        if (editorRef.current && value !== editorRef.current.innerHTML) {
            editorRef.current.innerHTML = value || '';
        }
    }, [value]);

    const updateOverlayPosition = useCallback((img) => {
        if (!editorRef.current || !img) return;
        const editorRect = editorRef.current.getBoundingClientRect();
        const imgRect = img.getBoundingClientRect();
        setOverlayStyle({
            top: imgRect.top - editorRect.top,
            left: imgRect.left - editorRect.left,
            width: imgRect.width,
            height: imgRect.height,
        });
    }, []);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;

        const handleClick = (e) => {
            if (e.target.tagName === 'IMG') {
                setSelectedImg(e.target);
                updateOverlayPosition(e.target);
            } else if (!e.target.classList.contains('resizer-handle')) {
                setSelectedImg(null);
                setOverlayStyle(null);
            }
        };

        const handleScroll = () => {
            if (selectedImg) updateOverlayPosition(selectedImg);
        };

        const clearSelection = () => {
            setSelectedImg(null);
            setOverlayStyle(null);
        };

        editor.addEventListener('click', handleClick);
        editor.addEventListener('keydown', clearSelection);
        editor.addEventListener('scroll', handleScroll);

        return () => {
            editor.removeEventListener('click', handleClick);
            editor.removeEventListener('keydown', clearSelection);
            editor.removeEventListener('scroll', handleScroll);
        };
    }, [selectedImg, updateOverlayPosition]);

    useEffect(() => {
        if (!selectedImg) return;
        const resizeObserver = new ResizeObserver(() => updateOverlayPosition(selectedImg));
        resizeObserver.observe(selectedImg);
        return () => resizeObserver.disconnect();
    }, [selectedImg, updateOverlayPosition]);

    const handleMouseDown = (e, handle) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing.current = true;
        activeHandle.current = handle;
        startX.current = e.clientX;
        startY.current = e.clientY;
        startWidth.current = selectedImg.offsetWidth;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e) => {
        if (!isResizing.current || !selectedImg) return;
        let newWidth = startWidth.current;
        const diffX = e.clientX - startX.current;
        const diffY = e.clientY - startY.current;

        if (activeHandle.current === 'e') newWidth = startWidth.current + diffX;
        else if (activeHandle.current === 's') newWidth = startWidth.current + diffY;
        else if (activeHandle.current === 'se') {
            newWidth = startWidth.current + (Math.abs(diffX) > Math.abs(diffY) ? diffX : diffY);
        }

        newWidth = Math.max(50, newWidth);
        selectedImg.style.width = `${newWidth}px`;
        updateOverlayPosition(selectedImg);
    };

    const handleMouseUp = () => {
        isResizing.current = false;
        activeHandle.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        updateContent();
    };

    const refreshActiveFormats = () => {
        try {
            setActiveFormats({
                bold: document.queryCommandState('bold'),
                italic: document.queryCommandState('italic'),
                underline: document.queryCommandState('underline'),
                strikeThrough: document.queryCommandState('strikeThrough'),
                insertUnorderedList: document.queryCommandState('insertUnorderedList'),
                insertOrderedList: document.queryCommandState('insertOrderedList'),
                justifyLeft: document.queryCommandState('justifyLeft'),
                justifyCenter: document.queryCommandState('justifyCenter'),
                justifyRight: document.queryCommandState('justifyRight'),
            });
        } catch {
            // ignore
        }
    };

    const execCommand = (command, cmdValue = null) => {
        document.execCommand(command, false, cmdValue);
        editorRef.current?.focus();
        refreshActiveFormats();
        setTimeout(updateContent, 0);
    };

    const applyHeading = (tag) => {
        document.execCommand('formatBlock', false, tag);
        editorRef.current?.focus();
        setTimeout(updateContent, 0);
    };

    const insertLink = () => {
        const url = window.prompt('Bağlantı URL\'si:', 'https://');
        if (!url) return;
        execCommand('createLink', url);
    };

    const saveSelection = () => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
        }
    };

    const insertImageAtCursor = (url) => {
        editorRef.current?.focus();
        const sel = window.getSelection();
        if (sel && savedSelectionRef.current) {
            sel.removeAllRanges();
            sel.addRange(savedSelectionRef.current);
        }

        const img = document.createElement('img');
        img.src = url;

        const currentSel = window.getSelection();
        if (currentSel && currentSel.rangeCount > 0) {
            const range = currentSel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(img);
            range.setStartAfter(img);
            range.setEndAfter(img);
            currentSel.removeAllRanges();
            currentSel.addRange(range);
        } else {
            editorRef.current?.appendChild(img);
        }
        setTimeout(updateContent, 0);
    };

    const handleImageUpload = async (e) => {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        try {
            for (const file of files) {
                if (typeof uploadImage === 'function') {
                    const url = await uploadImage(file);
                    if (url) insertImageAtCursor(url);
                } else {
                    await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            insertImageAtCursor(event.target?.result);
                            resolve();
                        };
                        reader.readAsDataURL(file);
                    });
                }
            }
        } catch (err) {
            console.error('Image upload failed:', err);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const applyColor = (color) => {
        execCommand('foreColor', color);
        setShowColors(false);
    };

    const updateContent = () => {
        if (onChange && editorRef.current) {
            const content = editorRef.current.innerHTML;
            if (content !== value) onChange(content);
        }
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    };

    const plainText = (value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const charCount = plainText.length;
    const wordCount = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;

    return (
        <div className="border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden focus-within:border-coral focus-within:ring-2 focus-within:ring-coral/20 transition-all relative">
            {/* Toolbar */}
            <div className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 px-2 py-1.5 flex items-center gap-0.5 flex-wrap sticky top-0 z-20">
                {isFull && (
                    <>
                        <ToolbarButton onClick={() => execCommand('undo')} title="Geri al (Ctrl+Z)">
                            <FaUndo className="text-sm" />
                        </ToolbarButton>
                        <ToolbarButton onClick={() => execCommand('redo')} title="Yinele (Ctrl+Y)">
                            <FaRedo className="text-sm" />
                        </ToolbarButton>
                        <Divider />
                    </>
                )}

                <ToolbarButton onClick={() => execCommand('bold')} title="Kalın (Ctrl+B)" active={activeFormats.bold}>
                    <FaBold className="text-sm" />
                </ToolbarButton>
                <ToolbarButton onClick={() => execCommand('italic')} title="İtalik (Ctrl+I)" active={activeFormats.italic}>
                    <FaItalic className="text-sm" />
                </ToolbarButton>
                {isFull && (
                    <>
                        <ToolbarButton onClick={() => execCommand('underline')} title="Altı çizili (Ctrl+U)" active={activeFormats.underline}>
                            <FaUnderline className="text-sm" />
                        </ToolbarButton>
                        <ToolbarButton onClick={() => execCommand('strikeThrough')} title="Üstü çizili" active={activeFormats.strikeThrough}>
                            <FaStrikethrough className="text-sm" />
                        </ToolbarButton>
                    </>
                )}

                <Divider />

                {isFull && (
                    <>
                        <ToolbarButton onClick={() => applyHeading('h2')} title="Başlık 2">
                            <span className="text-xs font-bold flex items-center gap-0.5"><FaHeading className="text-[10px]" />2</span>
                        </ToolbarButton>
                        <ToolbarButton onClick={() => applyHeading('h3')} title="Başlık 3">
                            <span className="text-xs font-bold flex items-center gap-0.5"><FaHeading className="text-[10px]" />3</span>
                        </ToolbarButton>
                        <ToolbarButton onClick={() => applyHeading('p')} title="Paragraf">
                            <span className="text-xs font-semibold">P</span>
                        </ToolbarButton>
                        <Divider />
                        <ToolbarButton onClick={() => execCommand('insertUnorderedList')} title="Madde listesi" active={activeFormats.insertUnorderedList}>
                            <FaListUl className="text-sm" />
                        </ToolbarButton>
                        <ToolbarButton onClick={() => execCommand('insertOrderedList')} title="Numaralı liste" active={activeFormats.insertOrderedList}>
                            <FaListOl className="text-sm" />
                        </ToolbarButton>
                        <ToolbarButton onClick={() => applyHeading('blockquote')} title="Alıntı">
                            <FaQuoteLeft className="text-sm" />
                        </ToolbarButton>
                        <ToolbarButton onClick={() => execCommand('insertHorizontalRule')} title="Ayırıcı çizgi">
                            <FaMinus className="text-sm" />
                        </ToolbarButton>
                        <Divider />
                        <ToolbarButton onClick={() => execCommand('justifyLeft')} title="Sola hizala" active={activeFormats.justifyLeft}>
                            <FaAlignLeft className="text-sm" />
                        </ToolbarButton>
                        <ToolbarButton onClick={() => execCommand('justifyCenter')} title="Ortala" active={activeFormats.justifyCenter}>
                            <FaAlignCenter className="text-sm" />
                        </ToolbarButton>
                        <ToolbarButton onClick={() => execCommand('justifyRight')} title="Sağa hizala" active={activeFormats.justifyRight}>
                            <FaAlignRight className="text-sm" />
                        </ToolbarButton>
                        <Divider />
                        <ToolbarButton onClick={insertLink} title="Bağlantı ekle">
                            <FaLink className="text-sm" />
                        </ToolbarButton>
                        <ToolbarButton onClick={() => execCommand('unlink')} title="Bağlantıyı kaldır">
                            <FaUnlink className="text-sm" />
                        </ToolbarButton>
                        <Divider />
                    </>
                )}

                <div className="relative">
                    <ToolbarButton
                        onClick={() => setShowColors((v) => !v)}
                        title="Yazı rengi"
                    >
                        <FaPalette className="text-sm" />
                    </ToolbarButton>
                    {showColors && (
                        <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-600 z-30 flex flex-wrap gap-1.5 w-[148px]">
                            {COLOR_PRESETS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyColor(c)}
                                    className="w-6 h-6 rounded-full border border-gray-200 dark:border-gray-600 hover:scale-110 transition-transform"
                                    style={{ backgroundColor: c }}
                                    title={c}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {isFull && (
                    <ToolbarButton onClick={() => execCommand('removeFormat')} title="Biçimlendirmeyi temizle">
                        <FaRemoveFormat className="text-sm" />
                    </ToolbarButton>
                )}

                <Divider />

                <ToolbarButton
                    onClick={() => {
                        saveSelection();
                        fileInputRef.current?.click();
                    }}
                    title="Görsel ekle"
                >
                    <FaImage className="text-sm" />
                </ToolbarButton>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
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
                    onMouseUp={refreshActiveFormats}
                    onKeyUp={refreshActiveFormats}
                    data-placeholder={placeholder}
                    className="max-h-[70vh] overflow-y-auto resize-y p-4 md:p-5 outline-none dark:bg-gray-800 dark:text-white prose prose-sm md:prose-base max-w-none story-editor"
                    suppressContentEditableWarning
                    style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight,
                    }}
                />

                {selectedImg && overlayStyle && (
                    <div
                        className="absolute border-2 border-coral pointer-events-none"
                        style={{
                            top: overlayStyle.top,
                            left: overlayStyle.left,
                            width: overlayStyle.width,
                            height: overlayStyle.height,
                            zIndex: 10,
                        }}
                    >
                        <div
                            onMouseDown={(e) => handleMouseDown(e, 'e')}
                            className="resizer-handle absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-8 bg-coral rounded-md cursor-ew-resize pointer-events-auto shadow-md hover:scale-110 transition-transform"
                        />
                        <div
                            onMouseDown={(e) => handleMouseDown(e, 's')}
                            className="resizer-handle absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-8 h-4 bg-coral rounded-md cursor-ns-resize pointer-events-auto shadow-md hover:scale-110 transition-transform"
                        />
                        <div
                            onMouseDown={(e) => handleMouseDown(e, 'se')}
                            className="resizer-handle absolute right-0 bottom-0 translate-x-1/2 translate-y-1/2 w-4 h-4 bg-white border-2 border-coral rounded-full cursor-nwse-resize pointer-events-auto shadow-md hover:scale-110 transition-transform"
                        />
                    </div>
                )}
            </div>

            {isFull && (
                <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-750 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400">
                    <span>Seçili metni biçimlendirmek için araç çubuğunu kullanın</span>
                    <span>
                        {wordCount} kelime · {charCount} karakter
                    </span>
                </div>
            )}

            <style>{`
                [contenteditable]:focus { outline: none; }
                [contenteditable]:empty:before {
                    content: attr(data-placeholder);
                    color: #9CA3AF;
                    pointer-events: none;
                }
                [contenteditable] img {
                    max-width: 100%;
                    height: auto;
                    border-radius: 8px;
                    margin: 12px 0;
                    cursor: pointer;
                }
                [contenteditable] img:hover { opacity: 0.95; }
                .story-editor h2 {
                    font-size: 1.5rem;
                    font-weight: 700;
                    margin: 1rem 0 0.5rem;
                    line-height: 1.3;
                }
                .story-editor h3 {
                    font-size: 1.2rem;
                    font-weight: 700;
                    margin: 0.85rem 0 0.4rem;
                    line-height: 1.35;
                }
                .story-editor blockquote {
                    border-left: 3px solid #FF6F61;
                    padding-left: 1rem;
                    margin: 0.75rem 0;
                    color: #6B7280;
                    font-style: italic;
                }
                .story-editor ul { list-style: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
                .story-editor ol { list-style: decimal; padding-left: 1.5rem; margin: 0.5rem 0; }
                .story-editor hr {
                    border: none;
                    border-top: 1px solid #E5E7EB;
                    margin: 1.25rem 0;
                }
                .story-editor a { color: #2563EB; text-decoration: underline; }
                .story-editor p { margin: 0.4rem 0; }
                .prose strong { font-weight: 700; }
                .prose em { font-style: italic; }
            `}</style>
        </div>
    );
};

export default RichTextEditor;
