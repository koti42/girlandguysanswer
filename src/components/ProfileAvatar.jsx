import React, { useState } from 'react';
import { FaCamera, FaTimes } from 'react-icons/fa';

const ProfileAvatar = ({ avatar, onAvatarUpload, onAvatarRemove }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState(null);

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewImage(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = () => {
        if (previewImage) {
            // Convert dataURL to file-like object
            fetch(previewImage)
                .then(res => res.blob())
                .then(blob => {
                    const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
                    onAvatarUpload(file);
                });
        }
        setPreviewImage(null);
        setIsModalOpen(false);
    };

    const handleCancel = () => {
        setPreviewImage(null);
        setIsModalOpen(false);
    };

    return (
        <>
            <div className="relative group">
                <img
                    src={avatar}
                    alt="Profile"
                    className="w-32 h-32 rounded-full border-4 border-white shadow-lg"
                />
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="absolute inset-0 w-32 h-32 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                >
                    <FaCamera className="text-white text-2xl" />
                </button>
            </div>

            {/* Modern Modal - Inspired Design */}
            {isModalOpen && (
                <>
                    <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        onClick={handleCancel}
                    ></div>
                    <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
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

                                {/* Buttons */}
                                <div className="flex gap-3">
                                    <label className="flex-1">
                                        <div className="w-full py-3 px-4 rounded-xl border-2 border-gray-300 text-gray-700 font-semibold text-center cursor-pointer hover:bg-gray-50 transition-colors">
                                            YENİ RESİM
                                        </div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleFileSelect}
                                            className="hidden"
                                        />
                                    </label>
                                    <button
                                        onClick={handleSave}
                                        className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold hover:from-purple-700 hover:to-purple-800 transition-all shadow-lg"
                                    >
                                        KAYDET
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
