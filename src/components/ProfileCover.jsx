import React, { useRef, useState } from 'react';
import { FaCamera, FaTimes } from 'react-icons/fa';

const ProfileCover = ({ coverPhoto, onCoverUpload, onCoverRemove }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewImage(reader.result);
            };
            reader.readAsDataURL(file);

            (async () => {
                try {
                    setIsProcessing(true);
                    await onCoverUpload?.(file);
                    setIsModalOpen(false);
                } finally {
                    setIsProcessing(false);
                    setPreviewImage(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                }
            })();
        }
    };

    const handleCancel = () => {
        setPreviewImage(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setIsModalOpen(false);
    };

    const handleRemove = async () => {
        try {
            setIsProcessing(true);
            await onCoverRemove?.();
            setIsModalOpen(false);
        } finally {
            setIsProcessing(false);
            setPreviewImage(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <>
            <div className="relative h-48 bg-gradient-to-r from-coral to-orange-400 rounded-t-2xl overflow-hidden group">
                <img
                    src={coverPhoto}
                    alt="Cover"
                    className="w-full h-full object-cover"
                />
                {/* Only show edit button if handler is provided (own profile) */}
                {onCoverUpload && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="bg-white/90 backdrop-blur-sm p-4 rounded-2xl hover:bg-white transition-all shadow-lg"
                        >
                            <FaCamera className="text-gray-700 text-xl" />
                        </button>
                    </div>
                )}
            </div>

            {/* Modern Modal */}
            {isModalOpen && (
                <>
                    <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        onClick={handleCancel}
                    ></div>
                    <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
                        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
                            <div className="flex justify-end p-4">
                                <button
                                    onClick={handleCancel}
                                    className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
                                >
                                    <FaTimes className="text-gray-600" />
                                </button>
                            </div>

                            <div className="px-8 pb-6">
                                <div className="relative w-full h-64 mx-auto mb-6 rounded-2xl overflow-hidden">
                                    <img
                                        src={previewImage || coverPhoto}
                                        alt="Preview"
                                        className="w-full h-full object-cover"
                                    />
                                </div>

                                <p className="text-center text-gray-600 text-sm mb-6">
                                    Kapak fotoğrafın profilini öne çıkarır ve kişiliğini yansıtır.
                                </p>

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />

                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={handleRemove}
                                        disabled={isProcessing || !onCoverRemove}
                                        className="flex-1 py-3 px-4 rounded-xl bg-red-50 text-red-600 font-semibold hover:bg-red-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Resmi Kaldır
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isProcessing}
                                        className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold hover:from-purple-700 hover:to-purple-800 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Yeni Resim Yükle
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </>
    );
};

export default ProfileCover;
