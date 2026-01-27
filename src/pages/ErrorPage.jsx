import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaGhost, FaHome, FaSearch, FaServer, FaRedo } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';

const ErrorPage = ({ code = 404, title, message, icon: CustomIcon }) => {
    const navigate = useNavigate();

    const config = {
        404: {
            icon: FaGhost,
            defaultTitle: "Sayfa Bulunamadı",
            defaultMessage: "Aradığınız sayfa veya içerik mevcut değil ya da kaldırılmış olabilir.",
            color: "text-coral",
            bgGlow: "bg-coral/20"
        },
        500: {
            icon: FaServer,
            defaultTitle: "Sunucu Hatası",
            defaultMessage: "Sunucularımızda beklenmedik bir hata oluştu. Teknik ekibimiz durumdan haberdar.",
            color: "text-red-500",
            bgGlow: "bg-red-500/20"
        }
    };

    const currentConfig = config[code] || config[404];
    const Icon = CustomIcon || currentConfig.icon;

    return (
        <MainLayout>
            <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
                <div className="relative mb-8 group">
                    <div className={`absolute inset-0 ${currentConfig.bgGlow} blur-3xl rounded-full group-hover:opacity-75 transition-opacity duration-500`}></div>
                    <div className="relative w-40 h-40 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-700 rounded-full flex items-center justify-center shadow-soft border-4 border-white dark:border-gray-600">
                        <Icon className={`text-7xl ${currentConfig.color} animate-bounce-slow`} />
                        <div className="absolute -bottom-2 -right-2 bg-white dark:bg-gray-800 p-3 rounded-full shadow-lg border-2 border-gray-100 dark:border-gray-600">
                            <span className="text-xl font-bold text-gray-700 dark:text-gray-300">{code}</span>
                        </div>
                    </div>
                </div>

                <h1 className="text-4xl md:text-5xl font-bold text-gray-800 dark:text-white mb-4">
                    {title || currentConfig.defaultTitle}
                </h1>

                <p className="text-lg text-gray-600 dark:text-gray-300 max-w-md mx-auto mb-8">
                    {message || currentConfig.defaultMessage}
                </p>

                <div className="flex flex-wrap gap-4 justify-center">
                    <Link to="/">
                        <button className="flex items-center gap-2 bg-gradient-to-r from-coral to-orange-400 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all">
                            <FaHome />
                            Ana Sayfaya Dön
                        </button>
                    </Link>

                    {code === 500 ? (
                        <button
                            onClick={() => window.location.reload()}
                            className="flex items-center gap-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-white border-2 border-gray-200 dark:border-gray-600 px-8 py-3 rounded-xl font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                        >
                            <FaRedo />
                            Tekrar Dene
                        </button>
                    ) : (
                        <Link to="/search">
                            <button className="flex items-center gap-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-white border-2 border-gray-200 dark:border-gray-600 px-8 py-3 rounded-xl font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
                                <FaSearch />
                                Arama Yap
                            </button>
                        </Link>
                    )}
                </div>
            </div>
        </MainLayout>
    );
};

export default ErrorPage;
