import React, { useEffect } from 'react';
import { FaTimes } from 'react-icons/fa';

const ImageLightbox = ({ imageUrl, alt = 'Büyüt', onClose }) => {
    useEffect(() => {
        const handleEscape = (e) => e.key === 'Escape' && onClose?.();
        document.addEventListener('keydown', handleEscape);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = '';
        };
    }, [onClose]);

    if (!imageUrl) return null;

    return (
        <>
            <div
                className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4"
                onClick={onClose}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onClose()}
                aria-label="Kapat"
            >
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                    aria-label="Kapat"
                >
                    <FaTimes className="text-xl" />
                </button>
                <img
                    src={imageUrl}
                    alt={alt}
                    className="max-w-full max-h-[90vh] w-auto h-auto object-contain rounded-lg shadow-2xl cursor-default"
                    onClick={(e) => e.stopPropagation()}
                    draggable={false}
                />
            </div>
        </>
    );
};

export default ImageLightbox;
