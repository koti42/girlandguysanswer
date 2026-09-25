import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaSearch, FaSpinner, FaTimes } from 'react-icons/fa';
import { gifsAPI } from '../services/api';

const DEFAULT_LIMIT = 20;

const pickFirst = (...values) => values.find(v => typeof v === 'string' && v.length > 0);

const getKlipyUrls = (item) => {
    const file = item?.file;
    const md = file?.md;
    const sm = file?.sm;
    const xs = file?.xs;

    const gifUrl = pickFirst(md?.gif?.url, sm?.gif?.url, xs?.gif?.url);
    const jpgUrl = pickFirst(md?.jpg?.url, sm?.jpg?.url, xs?.jpg?.url);
    const blur = item?.blur_preview;

    return { gifUrl, jpgUrl, blur };
};

const GifPickerModal = ({ isOpen, onClose, onSelect, title = 'GIF Seç' }) => {
    const [q, setQ] = useState('');
    const [items, setItems] = useState([]);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const inputRef = useRef(null);
    const debounceRef = useRef(null);

    const trimmedQ = useMemo(() => q.trim(), [q]);

    const fetchPage = async ({ nextOffset, replace }) => {
        if (loading) return;
        setLoading(true);
        setError(null);
        try {
            const res = await gifsAPI.list({
                q: trimmedQ || undefined,
                limit: DEFAULT_LIMIT,
                offset: nextOffset,
            });

            const root = res.data;
            const page = root?.data?.data;
            const data = page?.data || [];

            setItems(prev => (replace ? data : [...prev, ...data]));
            setOffset(nextOffset);

            if (typeof page?.has_next === 'boolean') {
                setHasMore(page.has_next);
            } else if (typeof page?.per_page === 'number' && typeof page?.current_page === 'number') {
                setHasMore(data.length >= page.per_page);
            } else {
                setHasMore(data.length >= DEFAULT_LIMIT);
            }
        } catch {
            setError('GIF’ler yüklenirken bir hata oluştu.');
            setHasMore(false);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        setItems([]);
        setOffset(0);
        setHasMore(true);
        setError(null);
        fetchPage({ nextOffset: 0, replace: true });

        setTimeout(() => inputRef.current?.focus(), 100);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setItems([]);
            setOffset(0);
            setHasMore(true);
            fetchPage({ nextOffset: 0, replace: true });
        }, 400);
        return () => debounceRef.current && clearTimeout(debounceRef.current);
    }, [trimmedQ, isOpen]);

    if (!isOpen) return null;

    const modalContent = (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" style={{ zIndex: 99999 }}>
            <div className="bg-white dark:bg-gray-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white">{title}</h3>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                    >
                        <FaTimes />
                    </button>
                </div>

                <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="relative">
                        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            ref={inputRef}
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="GIF ara… (boş bırak: trendler)"
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {error && (
                        <div className="text-center py-6 text-red-500 dark:text-red-400">{error}</div>
                    )}

                    {items.length === 0 && loading && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <FaSpinner className="text-3xl text-coral animate-spin mb-3" />
                            <p className="text-gray-500 dark:text-gray-400">Yükleniyor…</p>
                        </div>
                    )}

                    {items.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {items.map((gif) => {
                                const { gifUrl, jpgUrl, blur } = getKlipyUrls(gif);
                                const previewUrl = gifUrl || jpgUrl || blur;
                                if (!previewUrl) return null;

                                return (
                                    <button
                                        key={gif.id}
                                        type="button"
                                        onClick={() => onSelect?.(gifUrl || previewUrl)}
                                        className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 hover:scale-[1.02] transition-transform"
                                        title={gif.title || 'GIF'}
                                    >
                                        <img
                                            src={previewUrl}
                                            alt={gif.title || 'GIF'}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                            style={blur ? { backgroundImage: `url(${blur})`, backgroundSize: 'cover' } : undefined}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {items.length > 0 && hasMore && (
                        <div className="text-center mt-6">
                            <button
                                type="button"
                                disabled={loading}
                                onClick={() => fetchPage({ nextOffset: offset + DEFAULT_LIMIT, replace: false })}
                                className="px-6 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium transition-all disabled:opacity-50"
                            >
                                {loading ? 'Yükleniyor…' : 'Daha fazla göster'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default GifPickerModal;

