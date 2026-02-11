import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FaCheckCircle, FaEye, FaLightbulb, FaArrowRight, FaHome, FaPlusCircle, FaStar, FaGem, FaComment, FaHeart, FaMars, FaVenus, FaUserSecret } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import SEO from '../components/SEO';
import UserAvatar from '../components/UserAvatar';
import { questionsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryIcons';

const QuestionSubmittedPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user: currentUser } = useAuth();
    const [recentQuestions, setRecentQuestions] = useState([]);
    const [loadingRecent, setLoadingRecent] = useState(true);
    const [showConfetti, setShowConfetti] = useState(true);

    const questionData = location.state?.question;
    const gamificationData = location.state?.gamification;
    const questionSlug = location.state?.slug;

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    useEffect(() => {
        if (!questionData && !questionSlug) {
            navigate('/questions');
        }
    }, [questionData, questionSlug, navigate]);

    useEffect(() => {
        const timer = setTimeout(() => setShowConfetti(false), 4000);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        const fetchRecent = async () => {
            try {
                const response = await questionsAPI.getAll({ per_page: 5, sort: 'newest' });
                const questions = response.data?.data?.questions || response.data?.data || [];
                setRecentQuestions(Array.isArray(questions) ? questions.slice(0, 5) : []);
            } catch (err) {
                console.error('Son sorular yüklenirken hata:', err);
            } finally {
                setLoadingRecent(false);
            }
        };
        fetchRecent();
    }, []);

    const formatDate = (dateString) => {
        if (!dateString) return 'Az önce';
        try {
            return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: tr });
        } catch {
            return 'Az önce';
        }
    };

    const confettiColors = ['#FF6B6B', '#E2B94C', '#6366F1', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4'];

    const SidebarContent = (
        <>
            {/* Pusula - Son Sorular */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft overflow-hidden">
                <div className="p-5 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="font-bold text-lg flex items-center gap-2 text-gray-800 dark:text-white">
                        <span className="w-1.5 h-6 bg-gradient-to-b from-coral to-orange-400 rounded-full"></span>
                        Pusula
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Cevap bekleyen sorular</p>
                </div>
                <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {loadingRecent ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-coral border-t-transparent"></div>
                        </div>
                    ) : recentQuestions.length > 0 ? (
                        recentQuestions.map((q) => (
                            <Link
                                key={q.id}
                                to={`/question/${q.slug || q.id}`}
                                className="flex gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
                            >
                                <div className="flex-shrink-0 mt-0.5">
                                    <UserAvatar user={q.is_anonymous ? null : q.user} size={36} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                            {q.is_anonymous ? 'Gizli Üye' : (q.user?.username || 'Anonim')}
                                        </span>
                                        {q.user?.gender === 'male' && !q.is_anonymous && (
                                            <FaMars className="text-blue-500 text-xs" />
                                        )}
                                        {q.user?.gender === 'female' && !q.is_anonymous && (
                                            <FaVenus className="text-pink-500 text-xs" />
                                        )}
                                        <span className="text-xs text-gray-400 dark:text-gray-500">
                                            {formatDate(q.created_at)}
                                        </span>
                                    </div>
                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-2 group-hover:text-coral transition-colors">
                                        {q.title}
                                    </p>
                                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500">
                                        <span className="flex items-center gap-1">
                                            <FaComment className="text-[10px]" />
                                            {q.answers_count || q.stats?.answers || 0}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <FaHeart className="text-[10px]" />
                                            {q.likes_count || q.stats?.likes || 0}
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        ))
                    ) : (
                        <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
                            Henüz soru bulunamadı
                        </div>
                    )}
                </div>
                <Link
                    to="/questions"
                    className="flex items-center justify-center gap-2 p-4 text-sm font-semibold text-coral hover:bg-coral/5 transition-colors border-t border-gray-100 dark:border-gray-700"
                >
                    Tüm soruları gör
                    <FaArrowRight className="text-xs" />
                </Link>
            </div>

            {/* Daha Fazla Cevap Almak İçin İpuçları */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-2xl p-5 border border-indigo-100 dark:border-indigo-800/30">
                <h3 className="font-bold text-base flex items-center gap-2 text-gray-800 dark:text-white mb-4">
                    <div className="p-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg">
                        <FaLightbulb className="text-white text-sm" />
                    </div>
                    Daha Fazla Cevap Al
                </h3>
                <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                    <li className="flex gap-2.5 items-start">
                        <span className="text-indigo-500 mt-0.5 font-bold">1.</span>
                        <span>Gelen cevaplara yorum yaparak tartışmayı canlı tut</span>
                    </li>
                    <li className="flex gap-2.5 items-start">
                        <span className="text-indigo-500 mt-0.5 font-bold">2.</span>
                        <span>En iyi cevabı seçerek topluluğa katkı sağla</span>
                    </li>
                    <li className="flex gap-2.5 items-start">
                        <span className="text-indigo-500 mt-0.5 font-bold">3.</span>
                        <span>Başkalarının sorularına cevap vererek etkileşim kazan</span>
                    </li>
                </ul>
            </div>
        </>
    );

    return (
        <MainLayout sidebar={SidebarContent}>
            <SEO
                title="Soru Soruldu! - Herkesler Soruyor"
                description="Sorunuz başarıyla yayınlandı."
            />
            <div className="flex flex-col gap-6 relative">
                {/* Confetti Animation */}
                {showConfetti && (
                    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
                        {[...Array(40)].map((_, i) => (
                            <div
                                key={i}
                                className="absolute animate-confetti"
                                style={{
                                    left: `${Math.random() * 100}%`,
                                    top: '-10px',
                                    width: `${Math.random() * 8 + 4}px`,
                                    height: `${Math.random() * 8 + 4}px`,
                                    backgroundColor: confettiColors[i % confettiColors.length],
                                    borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                                    animationDelay: `${Math.random() * 2}s`,
                                    animationDuration: `${Math.random() * 2 + 2}s`,
                                }}
                            />
                        ))}
                    </div>
                )}

                {/* Success Hero Card */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 p-8 md:p-10 text-white shadow-2xl">
                    {/* Background decoration */}
                    <div className="absolute inset-0">
                        <div className="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full -mr-36 -mt-36 blur-2xl"></div>
                        <div className="absolute bottom-0 left-0 w-56 h-56 bg-white/10 rounded-full -ml-28 -mb-28 blur-2xl"></div>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-white/5 rounded-full blur-3xl"></div>
                    </div>

                    <div className="relative z-10 flex flex-col items-center text-center">
                        {/* Success Icon */}
                        <div className="relative mb-5">
                            <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center animate-bounce-slow">
                                <FaCheckCircle className="text-4xl text-white drop-shadow-lg" />
                            </div>
                            <div className="absolute -inset-3 bg-white/10 rounded-full animate-ping opacity-30"></div>
                        </div>

                        <h1 className="text-3xl md:text-4xl font-bold mb-2 drop-shadow-lg">
                            Sorun Yayınlandı!
                        </h1>
                        <p className="text-white/90 text-lg max-w-md">
                            Harika! Sorun topluluğa ulaştı. Cevaplar gelmeye başlayacak.
                        </p>

                        {/* XP Badge */}
                        {gamificationData?.points_added > 0 && (
                            <div className="mt-5 inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-5 py-2.5 border border-white/30">
                                <FaGem className="text-yellow-300" />
                                <span className="font-bold text-lg">+{gamificationData.points_added}</span>
                                <span className="text-white/80 text-sm">Xper Puan kazandın!</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Question Preview Card */}
                {questionData && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6 border border-gray-100 dark:border-gray-700">
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0">
                                {questionData.is_anonymous ? (
                                    <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                                        <FaUserSecret className="text-purple-500 text-xl" />
                                    </div>
                                ) : (
                                    <UserAvatar user={currentUser} size={48} />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                        {questionData.is_anonymous ? 'Gizli Üye' : (currentUser?.username || 'Sen')}
                                    </span>
                                    <span className="text-xs text-gray-400">Az önce</span>
                                </div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                                    {questionData.title}
                                </h2>
                                {questionData.category && (
                                    <span
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                                        style={{
                                            backgroundColor: `${getCategoryColor(questionData.category)}15`,
                                            color: getCategoryColor(questionData.category)
                                        }}
                                    >
                                        {getCategoryIcon(questionData.category)}
                                        {typeof questionData.category === 'object' ? questionData.category.name : questionData.category}
                                    </span>
                                )}
                                {questionData.tags?.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {questionData.tags.map((tag, idx) => (
                                            <span key={idx} className="text-xs text-coral bg-coral/10 px-2 py-1 rounded-full">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                    {questionSlug && (
                        <Link
                            to={`/question/${questionSlug}`}
                            className="flex-1 flex items-center justify-center gap-2.5 px-6 py-4 bg-gradient-to-r from-coral to-orange-400 text-white rounded-2xl font-semibold text-base shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all"
                        >
                            <FaEye className="text-lg" />
                            Soruyu Gör
                        </Link>
                    )}
                    <Link
                        to="/ask"
                        className="flex-1 flex items-center justify-center gap-2.5 px-6 py-4 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-2xl font-semibold text-base border-2 border-gray-200 dark:border-gray-600 hover:border-coral hover:text-coral dark:hover:border-coral dark:hover:text-coral transition-all"
                    >
                        <FaPlusCircle />
                        Yeni Soru Sor
                    </Link>
                    <Link
                        to="/questions"
                        className="flex-1 flex items-center justify-center gap-2.5 px-6 py-4 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-2xl font-semibold text-base border-2 border-gray-200 dark:border-gray-600 hover:border-indigo-500 hover:text-indigo-500 dark:hover:border-indigo-400 dark:hover:text-indigo-400 transition-all"
                    >
                        <FaHome />
                        Ana Sayfaya Dön
                    </Link>
                </div>

                {/* Info Cards Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-soft border border-gray-100 dark:border-gray-700 flex items-start gap-4">
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex-shrink-0">
                            <FaComment className="text-blue-500 text-lg" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-800 dark:text-white text-sm mb-1">Cevapları Bekle</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Üyeler sorunuzu görüp cevap verecek. Bildirimlerden takip edebilirsin.</p>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-soft border border-gray-100 dark:border-gray-700 flex items-start gap-4">
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl flex-shrink-0">
                            <FaStar className="text-amber-500 text-lg" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-800 dark:text-white text-sm mb-1">En İyi Cevabı Seç</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Her cinsiyetten bir en iyi cevap seçerek +1 Xper puan kazan.</p>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-soft border border-gray-100 dark:border-gray-700 flex items-start gap-4">
                        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl flex-shrink-0">
                            <FaGem className="text-purple-500 text-lg" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-800 dark:text-white text-sm mb-1">Puan Kazan</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Cevap ver, yorum yap ve etkileşimde bulunarak seviye atla.</p>
                        </div>
                    </div>
                </div>

                {/* Mobile: Recent Questions */}
                <div className="lg:hidden bg-white dark:bg-gray-800 rounded-2xl shadow-soft overflow-hidden">
                    <div className="p-5 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="font-bold text-lg flex items-center gap-2 text-gray-800 dark:text-white">
                            <span className="w-1.5 h-6 bg-gradient-to-b from-coral to-orange-400 rounded-full"></span>
                            Pusula
                        </h3>
                    </div>
                    <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                        {loadingRecent ? (
                            <div className="flex justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-2 border-coral border-t-transparent"></div>
                            </div>
                        ) : recentQuestions.slice(0, 3).map((q) => (
                            <Link
                                key={q.id}
                                to={`/question/${q.slug || q.id}`}
                                className="flex gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                            >
                                <UserAvatar user={q.is_anonymous ? null : q.user} size={32} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-2">
                                        {q.title}
                                    </p>
                                    <span className="text-xs text-gray-400 dark:text-gray-500 mt-1 block">
                                        {q.is_anonymous ? 'Gizli Üye' : (q.user?.username || 'Anonim')} · {formatDate(q.created_at)}
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                    <Link
                        to="/questions"
                        className="flex items-center justify-center gap-2 p-4 text-sm font-semibold text-coral hover:bg-coral/5 transition-colors border-t border-gray-100 dark:border-gray-700"
                    >Pusula
                        Tüm soruları gör <FaArrowRight className="text-xs" />
                    </Link>
                </div>
            </div>
        </MainLayout>
    );
};

export default QuestionSubmittedPage;
