import React, { useState } from 'react';
import { FaMicrophone, FaKeyboard, FaTimes } from 'react-icons/fa';
import { communityAPI } from '../../services/api';
import { useNavigate } from 'react-router-dom';

const CreateRoomModal = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        type: 'voice',
        privacy: 'public'
    });

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const response = await communityAPI.create(formData);
            const communityUuid = response.data.data.uuid || response.data.data.id;
            onClose();
            navigate(`/community/${communityUuid}`);
        } catch (error) {
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-0">
            <div className="w-full sm:w-[500px] bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden animate-slide-up sm:animate-fade-in">
                <div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Yeni Oda Oluştur</h3>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                        <FaTimes />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-6">
                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={() => setFormData({ ...formData, type: 'voice' })}
                            className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${formData.type === 'voice'
                                    ? 'border-coral bg-orange-50 dark:bg-orange-900/20 text-coral'
                                    : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'
                                }`}
                        >
                            <FaMicrophone size={24} />
                            <span className="font-semibold">Sesli Sohbet</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setFormData({ ...formData, type: 'text' })}
                            className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${formData.type === 'text'
                                    ? 'border-coral bg-orange-50 dark:bg-orange-900/20 text-coral'
                                    : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'
                                }`}
                        >
                            <FaKeyboard size={24} />
                            <span className="font-semibold">Yazılı Sohbet</span>
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Oda Başlığı
                            </label>
                            <input
                                type="text"
                                maxLength={60}
                                required
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                placeholder="Örn: Fenerbahçe Maç Sonu"
                                className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-900 border-none ring-1 ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-coral transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Konu / Açıklama
                            </label>
                            <textarea
                                rows={3}
                                maxLength={200}
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Örn: Maçın kritiğini yapıyoruz, herkesi bekleriz..."
                                className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-900 border-none ring-1 ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-coral transition-all resize-none"
                            />
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Gizlilik: {formData.privacy === 'public' ? 'Herkese Açık' : 'Davetiye ile'}
                            </span>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.privacy === 'private'}
                                    onChange={(e) => setFormData({ ...formData, privacy: e.target.checked ? 'private' : 'public' })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-coral"></div>
                            </label>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-coral hover:bg-orange-600 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Oluşturuluyor...' : 'Odayı Başlat'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default CreateRoomModal;
