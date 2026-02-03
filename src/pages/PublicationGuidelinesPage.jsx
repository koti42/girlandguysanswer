import React from 'react';
import MainLayout from '../layouts/MainLayout';
import { FaCheckCircle, FaTimesCircle, FaExclamationTriangle, FaGavel } from 'react-icons/fa';

const PublicationGuidelinesPage = () => {
    const guidelines = [
        {
            title: 'Saygılı İletişim',
            description: 'Tüm kullanıcılara saygılı ve nazik bir şekilde yaklaşın. Hakaret, küfür veya aşağılayıcı ifadeler kullanmayın.',
            type: 'must'
        },
        {
            title: 'Doğru Bilgi',
            description: 'Paylaştığınız bilgilerin doğru ve güncel olduğundan emin olun. Yanlış bilgi paylaşımından kaçının.',
            type: 'must'
        },
        {
            title: 'Özgün İçerik',
            description: 'Kendi özgün içeriğinizi paylaşın. Başkalarının içeriklerini izinsiz kopyalamayın veya çalmayın.',
            type: 'must'
        },
        {
            title: 'Spam ve Reklam',
            description: 'Spam içerik, tekrarlayan mesajlar veya izinsiz reklam paylaşımı yasaktır.',
            type: 'forbidden'
        },
        {
            title: 'Kişisel Bilgiler',
            description: 'Kendinizin veya başkalarının kişisel bilgilerini (telefon, adres, TC kimlik no vb.) paylaşmayın.',
            type: 'forbidden'
        },
        {
            title: 'Nefret Söylemi',
            description: 'Irk, din, cinsiyet, cinsel yönelim veya diğer özelliklere dayalı nefret söylemi kesinlikle yasaktır.',
            type: 'forbidden'
        },
        {
            title: 'Telif Hakları',
            description: 'Telif hakkı korumalı içerikleri izinsiz paylaşmayın. Müzik, görsel, video gibi içerikler için gerekli izinleri alın.',
            type: 'forbidden'
        },
        {
            title: 'Yanıltıcı İçerik',
            description: 'Sahte haber, yanıltıcı bilgi veya manipülatif içerik paylaşımı yasaktır.',
            type: 'forbidden'
        }
    ];

    return (
        <MainLayout>
            <div className="max-w-4xl mx-auto">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 md:p-10">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full mb-4">
                            <FaGavel className="text-2xl text-white" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">
                            Yayın İlkeleri
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400">
                            Platformumuzda uyulması gereken kurallar ve yayın standartları
                        </p>
                    </div>

                    <div className="space-y-6">
                        {guidelines.map((guideline, index) => (
                            <div
                                key={index}
                                className={`p-6 rounded-xl border-2 ${
                                    guideline.type === 'must'
                                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                }`}
                            >
                                <div className="flex items-start gap-4">
                                    <div className={`p-2 rounded-lg ${
                                        guideline.type === 'must'
                                            ? 'bg-green-100 dark:bg-green-900/40'
                                            : 'bg-red-100 dark:bg-red-900/40'
                                    }`}>
                                        {guideline.type === 'must' ? (
                                            <FaCheckCircle className="text-green-600 dark:text-green-400 text-xl" />
                                        ) : (
                                            <FaTimesCircle className="text-red-600 dark:text-red-400 text-xl" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                                            {guideline.title}
                                        </h3>
                                        <p className="text-gray-700 dark:text-gray-300">
                                            {guideline.description}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 p-6 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800">
                        <div className="flex items-start gap-3">
                            <FaExclamationTriangle className="text-yellow-600 dark:text-yellow-400 text-xl mt-1" />
                            <div>
                                <h3 className="font-bold text-gray-900 dark:text-white mb-2">
                                    Önemli Not
                                </h3>
                                <p className="text-sm text-gray-700 dark:text-gray-300">
                                    Bu kurallara uymayan içerikler moderasyon ekibimiz tarafından incelenir ve gerekli durumlarda kaldırılabilir. 
                                    Ciddi ihlallerde hesabınız geçici veya kalıcı olarak askıya alınabilir.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default PublicationGuidelinesPage;
