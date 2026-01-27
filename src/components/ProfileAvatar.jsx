import React, { useRef, useState } from 'react';
import { FaCamera, FaTimes } from 'react-icons/fa';
import UserAvatar from './UserAvatar';

const ProfileAvatar = ({ avatar, username, onAvatarUpload, onAvatarRemove }) => {
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
                    await onAvatarUpload?.(file);
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
            await onAvatarRemove?.();
            setIsModalOpen(false);
        } finally {
            setIsProcessing(false);
            setPreviewImage(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <>
            <div className="relative group">
                <UserAvatar
                    user={{ avatar, username }}
                    size="3xl"
                    className="w-32 h-32 rounded-full border-4 border-white shadow-lg"
                />
                {/* Only show edit button if handler is provided (own profile) */}
                {onAvatarUpload && (
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="absolute inset-0 w-32 h-32 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    >
                        <FaCamera className="text-white text-2xl" />
                    </button>
                )}
            </div>

            {/* Modern Modal - Inspired Design */}
            {isModalOpen && (
                <>
                    <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        onClick={handleCancel}
                    ></div>
                    <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
                        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                            {/* Close Button */}
                            <div className="flex justify-end p-4">
                                <button
                                    onClick={handleCancel}
                                    className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
                                >
                                    <FaTimes className="text-gray-600" />
                                </button>
                            </div>

                            {/* Image Preview */}
                            <div className="px-8 pb-6">
                                <div className="relative w-64 h-64 mx-auto mb-6">
                                    <img
                                        src={previewImage || avatar}
                                        alt="Preview"
                                        className="w-full h-full object-cover rounded-2xl shadow-lg"
                                    />
                                </div>

                                {/* Description */}
                                <p className="text-center text-gray-600 text-sm mb-6">
                                    Profilinde kullanılacak avatar resmini eklemen seni özel ve ilgi çekici kılar.
                                </p>

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />

                                {/* Buttons */}
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={handleRemove}
                                        disabled={isProcessing || !onAvatarRemove}
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

export default ProfileAvatar;
