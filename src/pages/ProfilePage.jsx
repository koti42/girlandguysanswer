import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { FaMapMarkerAlt, FaCalendarAlt, FaHeart, FaComment, FaEye } from 'react-icons/fa';
import { questions } from '../data/mockData';
import QuestionCard from '../components/QuestionCard';

const ProfilePage = () => {
    const { username } = useParams();
    const [activeTab, setActiveTab] = useState('questions');

    // Mock user data - normally would fetch from API
    const user = {
        username: username || 'Zeynep_Yildiz',
        name: 'Zeynep Yıldız',
        avatar: 'https://i.pravatar.cc/200?u=4',
        bio: 'Moda ve güzellik konularına meraklı bir kadın. Sorularınızı yanıtlamaktan mutluluk duyuyorum!',
        location: 'İstanbul, Türkiye',
        joinedDate: 'Ocak 2024',
        stats: {
            questions: 142,
            answers: 1283,
            followers: 5420,
            following: 892,
            likes: 12450
        }
    };

    // Filter questions by user
    const userQuestions = questions.filter(q => q.user.name === user.username).slice(0, 5);

    return (
        <div className="min-h-screen bg-background pb-12">
            {/* Header Section */}
            <div className="bg-gradient-to-r from-coral to-orange-400 h-48"></div>

            <div className="max-w-5xl mx-auto px-4 md:px-6">
                {/* Profile Card */}
                <div className="bg-white rounded-2xl shadow-soft p-6 -mt-20 relative z-10">
                    <div className="flex flex-col md:flex-row gap-6">
                        {/* Avatar */}
                        <div className="flex-shrink-0">
                            <img
                                src={user.avatar}
                                alt={user.name}
                                className="w-32 h-32 rounded-full border-4 border-white shadow-lg mx-auto md:mx-0"
                            />
                        </div>

                        {/* Info */}
                        <div className="flex-1">
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                                <div>
                                    <h1 className="text-3xl font-bold text-gray-800">{user.name}</h1>
                                    <p className="text-gray-500">@{user.username}</p>
                                    <p className="text-gray-700 mt-3 max-w-2xl">{user.bio}</p>

                                    <div className="flex flex-wrap gap-4 mt-4 text-sm text-gray-500">
                                        <div className="flex items-center gap-1">
                                            <FaMapMarkerAlt />
                                            <span>{user.location}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <FaCalendarAlt />
                                            <span>Katıldı {user.joinedDate}</span>
                                        </div>
                                    </div>
                                </div>

                                <button className="bg-coral text-white font-semibold py-2 px-6 rounded-2xl hover:scale-105 transition-all shadow-md">
                                    Takip Et
                                </button>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 pt-6 border-t border-gray-100">
                                <div className="text-center">
                                    <div className="font-bold text-2xl text-gray-800">{user.stats.questions}</div>
                                    <div className="text-sm text-gray-500">Sorular</div>
                                </div>
                                <div className="text-center">
                                    <div className="font-bold text-2xl text-gray-800">{user.stats.answers}</div>
                                    <div className="text-sm text-gray-500">Cevaplar</div>
                                </div>
                                <div className="text-center">
                                    <div className="font-bold text-2xl text-gray-800">{user.stats.followers}</div>
                                    <div className="text-sm text-gray-500">Takipçi</div>
                                </div>
                                <div className="text-center">
                                    <div className="font-bold text-2xl text-gray-800">{user.stats.following}</div>
                                    <div className="text-sm text-gray-500">Takip</div>
                                </div>
                                <div className="text-center">
                                    <div className="font-bold text-2xl text-coral">{user.stats.likes}</div>
                                    <div className="text-sm text-gray-500">Beğeni</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="mt-8 flex gap-6 border-b border-gray-200">
                    <button
                        onClick={() => setActiveTab('questions')}
                        className={`pb-3 px-2 font-semibold border-b-2 transition-colors ${activeTab === 'questions'
                                ? 'text-coral border-coral'
                                : 'text-gray-500 border-transparent hover:text-gray-700'
                            }`}
                    >
                        Sorular
                    </button>
                    <button
                        onClick={() => setActiveTab('answers')}
                        className={`pb-3 px-2 font-semibold border-b-2 transition-colors ${activeTab === 'answers'
                                ? 'text-coral border-coral'
                                : 'text-gray-500 border-transparent hover:text-gray-700'
                            }`}
                    >
                        Cevaplar
                    </button>
                    <button
                        onClick={() => setActiveTab('liked')}
                        className={`pb-3 px-2 font-semibold border-b-2 transition-colors ${activeTab === 'liked'
                                ? 'text-coral border-coral'
                                : 'text-gray-500 border-transparent hover:text-gray-700'
                            }`}
                    >
                        Beğenilenler
                    </button>
                </div>

                {/* Content */}
                <div className="mt-6 flex flex-col gap-6">
                    {activeTab === 'questions' && (
                        <>
                            {userQuestions.length > 0 ? (
                                userQuestions.map(q => <QuestionCard key={q.id} question={q} />)
                            ) : (
                                <div className="bg-white rounded-2xl p-12 text-center text-gray-400">
                                    Henüz soru sorulmamış
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === 'answers' && (
                        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">
                            Cevaplar yakında eklenecek
                        </div>
                    )}

                    {activeTab === 'liked' && (
                        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">
                            Beğenilen içerikler yakında eklenecek
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;
