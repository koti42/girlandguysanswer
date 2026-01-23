import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaMars, FaVenus, FaCheck } from 'react-icons/fa';
import { usersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Toast from '../components/Toast';

const CompleteProfilePage = () => {
    const navigate = useNavigate();
    const { user, updateUser } = useAuth();
    const [selectedGender, setSelectedGender] = useState(null);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

    useEffect(() => {
        if (user && user.gender) {
            navigate('/');
        }
    }, [user, navigate]);

    const handleGenderSelect = (gender) => {
        setSelectedGender(gender);
    };

    const handleSubmit = async () => {
        if (!selectedGender) return;

        setLoading(true);
        try {
            const response = await usersAPI.updateProfile({ gender: selectedGender });
            const updatedUser = response.data.data?.user || response.data.user || response.data.data;

            updateUser(updatedUser);

            setToast({ show: true, message: 'Profiliniz tamamlandı! Yönlendiriliyorsunuz...', type: 'success' });

            setTimeout(() => {
                window.location.href = '/'; 
            }, 1000);

        } catch (error) {
            console.error('Profile Update Error:', error);
            setToast({ show: true, message: 'Bir hata oluştu. Lütfen tekrar deneyin.', type: 'error' });
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-coral/10 via-background to-gold/10 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-8 max-w-lg w-full text-center">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">Son Bir Adım! 🚀</h1>
                    <p className="text-gray-600 dark:text-gray-400">
                        Topluluğumuza katılmak için lütfen cinsiyetini seç. <br />
                        <span className="text-sm opacity-75">(Sorular ve cevaplar buna göre özelleştirilir)</span>
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-8">
                    {/* Female Option */}
                    <button
                        onClick={() => handleGenderSelect('female')}
                        className={`relative p-6 rounded-2xl border-2 transition-all group ${selectedGender === 'female'
                                ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20 shadow-lg scale-105'
                                : 'border-gray-200 dark:border-gray-700 hover:border-pink-300 hover:bg-pink-50 dark:hover:bg-gray-700'
                            }`}
                    >
                        {selectedGender === 'female' && (
                            <div className="absolute top-3 right-3 bg-pink-500 text-white p-1 rounded-full text-xs">
                                <FaCheck />
                            </div>
                        )}
                        <FaVenus className={`text-5xl mx-auto mb-3 ${selectedGender === 'female' ? 'text-pink-500' : 'text-gray-400 group-hover:text-pink-400'}`} />
                        <span className={`block font-bold text-lg ${selectedGender === 'female' ? 'text-pink-600' : 'text-gray-600 dark:text-gray-300'}`}>Kadın</span>
                    </button>

                    {/* Male Option */}
                    <button
                        onClick={() => handleGenderSelect('male')}
                        className={`relative p-6 rounded-2xl border-2 transition-all group ${selectedGender === 'male'
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg scale-105'
                                : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-gray-700'
                            }`}
                    >
                        {selectedGender === 'male' && (
                            <div className="absolute top-3 right-3 bg-blue-500 text-white p-1 rounded-full text-xs">
                                <FaCheck />
                            </div>
                        )}
                        <FaMars className={`text-5xl mx-auto mb-3 ${selectedGender === 'male' ? 'text-blue-500' : 'text-gray-400 group-hover:text-blue-400'}`} />
                        <span className={`block font-bold text-lg ${selectedGender === 'male' ? 'text-blue-600' : 'text-gray-600 dark:text-gray-300'}`}>Erkek</span>
                    </button>
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={!selectedGender || loading}
                    className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-coral to-orange-400 text-white font-bold text-lg hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                    {loading ? (
                        <span className="flex items-center justify-center gap-2">
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-b-transparent"></div>
                            Kaydediliyor...
                        </span>
                    ) : 'Tamamla ve Başla 🎉'}
                </button>
            </div>

            {toast.show && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast({ ...toast, show: false })}
                />
            )}
        </div>
    );
};

export default CompleteProfilePage;
