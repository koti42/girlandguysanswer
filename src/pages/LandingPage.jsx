import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaHeart, FaComment, FaEye, FaMars, FaVenus, FaArrowRight, FaUserSecret, FaUsers, FaComments, FaQuestionCircle, FaFire, FaShieldAlt, FaGem, FaBookOpen, FaThumbsDown } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import SEO from '../components/SEO';
import UserAvatar from '../components/UserAvatar';
import LandingHero from '../components/landing/LandingHero';
import WeeklyTopicsMindMap from '../components/landing/WeeklyTopicsMindMap';
import ProtocolZeroBanner from '../components/game/protocolZero/ProtocolZeroBanner';
import { useAuth } from '../context/AuthContext';
import { questionsAPI, storiesAPI } from '../services/api';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryIcons';
import { getThemeStyles, getViewerPrefs } from '../utils/userColor';
import { buildStoryPath } from '../utils/storyUrl';
import DOMPurify from 'dompurify';

const formatDate = (dateString) => {
    if (!dateString) return 'Az önce';
    try {
        return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: tr });
    } catch {
        return 'Az önce';
    }
};

const stripHtml = (html) => (html ? DOMPurify.sanitize(html, { ALLOWED_TAGS: [] }) : '');

const LandingPage = () => {
    const { user } = useAuth();
    const viewerPrefs = getViewerPrefs(user);
    const [popularQuestions, setPopularQuestions] = useState([]);
    const [loadingPopular, setLoadingPopular] = useState(true);
    const [latestStories, setLatestStories] = useState([]);
    const [loadingStories, setLoadingStories] = useState(true);

    useEffect(() => {
        const fetchPopular = async () => {
            try {
                const response = await questionsAPI.getAll({ sort: 'popular', limit: 6 });
                const questions = response.data?.data?.questions || response.data?.data || [];
                setPopularQuestions(Array.isArray(questions) ? questions.slice(0, 6) : []);
            } catch (err) {
                console.error('Popüler sorular yüklenirken hata:', err);
            } finally {
                setLoadingPopular(false);
            }
        };

        const fetchStories = async () => {
            try {
                const response = await storiesAPI.getAll({ page: 1, per_page: 6 });
                const list = response.data?.data?.stories || [];
                setLatestStories(Array.isArray(list) ? list : []);
            } catch (err) {
                console.error('Hikayeler yüklenirken hata:', err);
                setLatestStories([]);
            } finally {
                setLoadingStories(false);
            }
        };

        fetchPopular();
        fetchStories();
    }, []);

    const QuestionShowcaseCard = ({ question, viewerPrefs }) => {
        const contentCreator = question.user || {};
        const themeStyles = getThemeStyles(contentCreator, viewerPrefs);
        const isAnon = !question.user?.username || question.user?.username === 'anonim' || question.is_anonymous;

        const categoryColor = question.category?.color ? getCategoryColor(question.category.color) : null;
        const CategoryIcon = question.category?.name ? getCategoryIcon(question.category.name) : null;

        return (
            <Link
                to={`/question/${question.slug || question.id}`}
                className="group relative bg-white dark:bg-gray-800 rounded-2xl border shadow-soft hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col"
                style={{ borderColor: `${themeStyles.accentColor}50` }}
            >
                <div className="h-1 w-full" style={{ background: themeStyles.headerBg }}></div>
                <div className="p-4 md:p-5 flex-1 flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                            {isAnon ? (
                                <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                                    <FaUserSecret className="text-purple-500 text-xs" />
                                </div>
                            ) : (
                                <UserAvatar user={question.user} size={32} />
                            )}
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                        {isAnon ? 'Gizli Üye' : question.user?.username}
                                    </span>
                                    {question.user?.gender === 'female' && <FaVenus className="text-xs" style={{ color: themeStyles.accentColor }} />}
                                    {question.user?.gender === 'male' && <FaMars className="text-xs" style={{ color: themeStyles.accentColor }} />}
                                </div>
                                <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatDate(question.created_at)}</span>
                            </div>
                        </div>
                        {question.category?.name && categoryColor && (
                            <span
                                className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                                style={{ backgroundColor: categoryColor }}
                            >
                                {CategoryIcon && <CategoryIcon className="text-[9px]" />}
                                {question.category.name}
                            </span>
                        )}
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-bold text-gray-800 dark:text-white leading-snug mb-3 line-clamp-2 group-hover:text-coral transition-colors flex-1">
                        {question.title}
                    </h3>

                    {/* Tags */}
                    {question.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {question.tags.slice(0, 3).map((tag, idx) => {
                                const displayTag = tag.startsWith('#') ? tag : `#${tag}`;
                                return (
                                    <span key={idx} className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: themeStyles.bgColorStrong, color: themeStyles.accentColor }}>
                                        {displayTag}
                                    </span>
                                );
                            })}
                        </div>
                    )}

                    {/* Stats */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700/50 text-xs text-gray-400 dark:text-gray-500 mt-auto">
                        <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1">
                                <FaHeart className="text-[10px] text-red-400" />
                                {question.likes_count || question.stats?.likes || 0}
                            </span>
                            <span className="flex items-center gap-1">
                                <FaComment className="text-[10px] text-blue-400" />
                                {question.answers_count || question.stats?.answers || 0}
                            </span>
                        </div>
                        <span className="flex items-center gap-1">
                            <FaEye className="text-[10px]" />
                            {question.views_count || question.stats?.views || 0}
                        </span>
                    </div>
                </div>
            </Link>
        );
    };

    const SkeletonCard = () => (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-soft overflow-hidden animate-pulse">
            <div className="h-1 w-full bg-gray-200 dark:bg-gray-700"></div>
            <div className="p-5">
                <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700"></div>
                    <div>
                        <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-1"></div>
                        <div className="h-2 w-14 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    </div>
                </div>
                <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
                <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
                <div className="flex gap-2 mb-3">
                    <div className="h-5 w-14 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
                    <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
                </div>
                <div className="flex justify-between pt-3 border-t border-gray-100 dark:border-gray-700/50">
                    <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    <div className="h-3 w-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </div>
            </div>
        </div>
    );

    const StoryShowcaseCard = ({ story, viewerPrefs }) => {
        const contentCreator = story.user || {};
        const themeStyles = getThemeStyles(contentCreator, viewerPrefs);
        const excerpt = stripHtml(story.content).slice(0, 120);

        return (
            <Link
                to={buildStoryPath(story)}
                className="group relative bg-white dark:bg-gray-800 rounded-2xl border shadow-soft hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col"
                style={{ borderColor: `${themeStyles.accentColor}40` }}
            >
                <div className="h-1 w-full bg-gradient-to-r from-teal-500 via-emerald-500 to-cyan-500" />
                <div className="p-4 md:p-5 flex-1 flex flex-col">
                    <div className="flex items-center gap-2.5 mb-3">
                        <UserAvatar user={story.user} size={32} />
                        <div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                    {story.user?.username || 'Kullanıcı'}
                                </span>
                                {story.user?.gender === 'female' && <FaVenus className="text-xs" style={{ color: themeStyles.accentColor }} />}
                                {story.user?.gender === 'male' && <FaMars className="text-xs" style={{ color: themeStyles.accentColor }} />}
                            </div>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatDate(story.created_at)}</span>
                        </div>
                    </div>

                    <h3 className="text-base font-bold text-gray-800 dark:text-white leading-snug mb-2 line-clamp-2 group-hover:text-emerald-600 transition-colors">
                        {story.title}
                    </h3>
                    {excerpt && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3 mb-3 flex-1">
                            {excerpt}{stripHtml(story.content).length > 120 ? '…' : ''}
                        </p>
                    )}

                    <div className="flex items-center gap-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 text-xs text-gray-400 dark:text-gray-500 mt-auto">
                        <span className="flex items-center gap-1">
                            <FaHeart className="text-[10px] text-red-400" />
                            {story.likes_count ?? 0}
                        </span>
                        <span className="flex items-center gap-1">
                            <FaThumbsDown className="text-[10px]" />
                            {story.dislikes_count ?? 0}
                        </span>
                        <span className="flex items-center gap-1">
                            <FaComment className="text-[10px] text-blue-400" />
                            {story.comments_count ?? 0}
                        </span>
                    </div>
                </div>
            </Link>
        );
    };

    return (
        <MainLayout fullWidth={true} showMobileFooter={true}>
            <SEO
                title="Herkesler Soruyor | Kadınlar ve Erkekler Soruyor, Cevaplıyor"
                description="Anonim soru sor, kadın ve erkek bakış açısından samimi cevaplar al. İlişkiler, aile, kariyer, sağlık ve daha fazlası: binlerce soru ve cevap seni bekliyor."
            />

            <div className="min-h-screen bg-background dark:bg-gray-900">
                {/* HERO SECTION */}
                <LandingHero user={user} />

                {/* PROTOCOL: ZERO - "Yapay Zeka Saldırısını Durdurabilir Misin?" canlı simülasyon banner'ı (üyeliksiz oyun) */}
                <ProtocolZeroBanner className="pt-6 md:pt-8" />

                {/* HAFTANIN GÜNDEM KONULARI */}
                <WeeklyTopicsMindMap />

                {/* POPULAR QUESTIONS - VITRIN */}
                <section className="max-w-7xl mx-auto px-4 md:px-6 py-12 md:py-16">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-1.5 bg-gradient-to-r from-coral to-orange-400 rounded-lg">
                                    <FaFire className="text-white text-sm" />
                                </div>
                                <h2 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">Gündemdekiler</h2>
                            </div>
                            <p className="text-gray-500 dark:text-gray-400 text-sm md:text-base">Toplulukta en çok konuşulan sorular</p>
                        </div>
                        <Link
                            to="/questions?sort=popular"
                            className="hidden sm:flex items-center gap-2 text-coral font-semibold hover:underline text-sm"
                        >
                            Tümünü Gör <FaArrowRight className="text-xs" />
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
                        {loadingPopular
                            ? [...Array(6)].map((_, i) => <SkeletonCard key={i} />)
                            : popularQuestions.map(q => <QuestionShowcaseCard key={q.id} question={q} viewerPrefs={viewerPrefs} />)
                        }
                    </div>

                    <Link
                        to="/questions?sort=popular"
                        className="sm:hidden flex items-center justify-center gap-2 mt-6 text-coral font-semibold text-sm"
                    >
                        Tümünü Gör <FaArrowRight className="text-xs" />
                    </Link>
                </section>

                {/* HİKAYELER — yalnızca hikaye varsa */}
                {!loadingStories && latestStories.length > 0 && (
                    <section className="max-w-7xl mx-auto px-4 md:px-6 pb-12 md:pb-16">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-1.5 bg-gradient-to-r from-teal-500 to-emerald-500 rounded-lg">
                                        <FaBookOpen className="text-white text-sm" />
                                    </div>
                                    <h2 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">Hikayeler</h2>
                                </div>
                                <p className="text-gray-500 dark:text-gray-400 text-sm md:text-base">Topluluktan taze anlatılar</p>
                            </div>
                            <Link
                                to="/stories"
                                className="hidden sm:flex items-center gap-2 text-emerald-600 font-semibold hover:underline text-sm"
                            >
                                Tümünü Gör <FaArrowRight className="text-xs" />
                            </Link>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
                            {latestStories.map((story) => (
                                <StoryShowcaseCard key={story.id} story={story} viewerPrefs={viewerPrefs} />
                            ))}
                        </div>

                        <Link
                            to="/stories"
                            className="sm:hidden flex items-center justify-center gap-2 mt-6 text-emerald-600 font-semibold text-sm"
                        >
                            Tümünü Gör <FaArrowRight className="text-xs" />
                        </Link>
                    </section>
                )}

                {/* HOW IT WORKS */}
                <section className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-900 py-16 md:py-20">
                    <div className="max-w-5xl mx-auto px-4 md:px-6">
                        <div className="text-center mb-12">
                            <h2 className="text-3xl md:text-4xl font-bold text-gray-800 dark:text-white mb-3">Nasıl Çalışır?</h2>
                            <p className="text-gray-500 dark:text-gray-400 text-lg">3 basit adımda başla</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6">
                            <div className="text-center group">
                                <div className="relative inline-block mb-5">
                                    <div className="w-20 h-20 bg-gradient-to-br from-coral to-orange-400 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                        <FaQuestionCircle className="text-3xl text-white" />
                                    </div>
                                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-gray-800 dark:bg-white text-white dark:text-gray-800 rounded-full flex items-center justify-center font-bold text-sm shadow-md">1</div>
                                </div>
                                <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Soru Sor</h3>
                                <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">Merak ettiğin konuyu paylaş. İster açık, ister anonim.</p>
                            </div>

                            <div className="text-center group">
                                <div className="relative inline-block mb-5">
                                    <div className="w-20 h-20 bg-gradient-to-br from-pink-500 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                        <div className="flex gap-1">
                                            <FaVenus className="text-xl text-white" />
                                            <FaMars className="text-xl text-white" />
                                        </div>
                                    </div>
                                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-gray-800 dark:bg-white text-white dark:text-gray-800 rounded-full flex items-center justify-center font-bold text-sm shadow-md">2</div>
                                </div>
                                <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Cevapları Al</h3>
                                <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">Kadın ve erkek perspektiflerinden farklı bakış açıları keşfet.</p>
                            </div>

                            <div className="text-center group">
                                <div className="relative inline-block mb-5">
                                    <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                        <FaGem className="text-3xl text-white" />
                                    </div>
                                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-gray-800 dark:bg-white text-white dark:text-gray-800 rounded-full flex items-center justify-center font-bold text-sm shadow-md">3</div>
                                </div>
                                <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Puan Kazan</h3>
                                <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">Cevapla, beğen, tartış. Uzmanlık puanı kazan ve seviye atla.</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* FEATURES */}
                <section className="max-w-7xl mx-auto px-4 md:px-6 py-12 md:py-16">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft border border-gray-100 dark:border-gray-700 hover:shadow-lg transition-all group">
                            <div className="w-12 h-12 bg-pink-50 dark:bg-pink-900/20 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <FaUsers className="text-xl text-pink-500" />
                            </div>
                            <h3 className="font-bold text-gray-800 dark:text-white mb-1.5">Farklı Perspektifler</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Kadın ve erkek bakış açılarını bir arada gör</p>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft border border-gray-100 dark:border-gray-700 hover:shadow-lg transition-all group">
                            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <FaComments className="text-xl text-blue-500" />
                            </div>
                            <h3 className="font-bold text-gray-800 dark:text-white mb-1.5">Aktif Topluluk</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Her gün binlerce soru ve cevap paylaşılıyor</p>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft border border-gray-100 dark:border-gray-700 hover:shadow-lg transition-all group">
                            <div className="w-12 h-12 bg-purple-50 dark:bg-purple-900/20 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <FaShieldAlt className="text-xl text-purple-500" />
                            </div>
                            <h3 className="font-bold text-gray-800 dark:text-white mb-1.5">Güvenli Ortam</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Anonim sor, kimliğin tamamen gizli kalsın</p>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft border border-gray-100 dark:border-gray-700 hover:shadow-lg transition-all group">
                            <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/20 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <FaGem className="text-xl text-amber-500" />
                            </div>
                            <h3 className="font-bold text-gray-800 dark:text-white mb-1.5">Uzmanlık Sistemi</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Puan kazan, rozet topla, liderlik tablosunda yüksel</p>
                        </div>
                    </div>
                </section>

                {/* FINAL CTA - Sadece giriş yapmamış kullanıcılar için */}
                {!user && (
                    <section className="max-w-7xl mx-auto px-4 md:px-6 pb-16 md:pb-20">
                        <div className="relative overflow-hidden bg-gradient-to-r from-coral via-orange-400 to-pink-400 rounded-3xl p-10 md:p-16 text-center text-white shadow-2xl">
                            <div className="absolute inset-0">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                                <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24 blur-3xl"></div>
                            </div>
                            <div className="relative z-10">
                                <h2 className="text-3xl md:text-4xl font-bold mb-4">Sende Topluluğa Katıl!</h2>
                                <p className="text-white/90 text-lg mb-8 max-w-xl mx-auto">
                                    Soru sor, cevap ver, tartışmalara katıl. Farklı perspektiflerle dünyaya bak.
                                </p>
                                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                    <Link
                                        to="/signup"
                                        className="bg-white text-coral font-bold py-4 px-8 rounded-2xl shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all text-lg"
                                    >
                                        Hesap Oluştur
                                    </Link>
                                    <Link
                                        to="/questions"
                                        className="bg-white/20 backdrop-blur-sm text-white border-2 border-white/30 font-bold py-4 px-8 rounded-2xl hover:bg-white/30 hover:scale-105 active:scale-95 transition-all text-lg"
                                    >
                                        Soruları Gör
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </MainLayout>
    );
};

export default LandingPage;
