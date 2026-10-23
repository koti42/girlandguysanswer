import React, { Suspense, lazy, useEffect } from 'react';
import { applyAccessibilityAttr, isAccessibilityOn } from './utils/accessibility';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import LandingPage from './pages/LandingPage';
import { useNavigate, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorPage from './pages/ErrorPage';
import { useAuth } from './context/AuthContext';
import AppToaster from './components/AppToaster';
import usePresence from './hooks/usePresence';
import { usersAPI } from './services/api';
import ErrorBoundary from './components/game/ErrorBoundary';
import { installChunkReloadHandler } from './components/game/chunkReload';

// Yeni sürümden sonra eski sekmede parça dosyası inemezse sayfa bir kez kendini yeniler.
installChunkReloadHandler();

const GenderCheck = ({ children }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    if (!loading && user && !user.gender) {
      if (location.pathname !== '/complete-profile') {
        navigate('/complete-profile');
      }
    }
  }, [user, loading, location.pathname, navigate]);

  return children;
};

const AgeGate = () => {
  const { user, loading, updateUser } = useAuth();
  const [birthDate, setBirthDate] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  const shouldShow = Boolean(user && !loading && !user.birth_date);

  const validate = (value) => {
    if (!value) return 'Doğum tarihi zorunludur.';
    const birth = new Date(value);
    if (Number.isNaN(birth.getTime())) return 'Geçerli bir doğum tarihi girin.';
    const today = new Date();
    const min = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
    if (birth > min) return 'Kayıt olmak için en az 18 yaşında olmalısınız.';
    return '';
  };

  const handleSave = async () => {
    const msg = validate(birthDate);
    setError(msg);
    if (msg) return;

    setSubmitting(true);
    try {
      const res = await usersAPI.updateProfile({ birth_date: birthDate });
      const updated = res.data?.data?.user || res.data?.user || null;
      updateUser({
        ...(updated || {}),
        birth_date: updated?.birth_date ?? birthDate,
      });
    } catch (e) {
      const apiMsg =
        e.response?.data?.message ||
        e.response?.data?.errors?.birth_date?.[0] ||
        'Yaş bilgisi kaydedilemedi.';
      setError(apiMsg);
    } finally {
      setSubmitting(false);
    }
  };

  React.useEffect(() => {
    if (!shouldShow) {
      setBirthDate('');
      setError('');
      setSubmitting(false);
    }
  }, [shouldShow]);

  if (!shouldShow) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Yaş Doğrulaması</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">
            Platformu kullanabilmek için doğum tarihini girmen gerekiyor. Bu bilgi daha sonra değiştirilemez.
          </p>

          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Doğum Tarihi
          </label>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => {
              setBirthDate(e.target.value);
              if (error) setError('');
            }}
            className={`w-full px-4 py-3 rounded-xl border ${
              error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            } dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all`}
          />

          {error && <div className="mt-3 text-sm text-red-500">{error}</div>}

          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className="mt-5 w-full py-3 px-6 rounded-xl bg-gradient-to-r from-coral to-orange-400 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
};

const WelcomeGuideGate = () => {
  const { user, loading, markWelcomeGuideSeen } = useAuth();
  const navigate = useNavigate();
  const showModal = Boolean(
    user && !loading && !(user.has_seen_welcome_guide === true || localStorage.getItem('has_seen_welcome_guide'))
  );

  const handleClose = () => {
    markWelcomeGuideSeen();
  };

  const handleGoToGuide = () => {
    navigate('/kullanim-kilavuzu');
    markWelcomeGuideSeen();
  };

  return (
    <Suspense fallback={null}>
      <WelcomeGuideModal
        isOpen={showModal}
        onClose={handleClose}
        onGoToGuide={handleGoToGuide}
      />
    </Suspense>
  );
};

import { NotificationProvider } from './context/NotificationContext';

/*
 * Rota bazlı kod bölme.
 *
 * Daha önce 48 sayfanın tamamı ve admin paneli tek bundle'a giriyordu:
 * ana sayfayı açan ziyaretçi mesajlaşma, LiveKit oda arayüzü ve admin
 * ekranlarını da indiriyordu (tek parça ~1.8 MB).
 *
 * LandingPage ve ErrorPage kasten statik import: ilki en sık girilen
 * sayfa, ikincisi hata yolu - ikisinde de yükleniyor ekranı görmek
 * istemiyoruz.
 */
const AdminApp = lazy(() => import('./admin/AdminApp'));
const ModApp = lazy(() => import('./mod/ModApp'));

// Rota dışı ağır parçalar.
//
// Dock, ChatWindow'u ve Pusher aboneliğini birlikte getiriyor; giriş yapmamış
// ziyaretçi bunların hiçbirini kullanmıyor. Karşılama modalı da ilk boyamada
// gerekmiyor. İkisi de fallback'siz (null) askıya alınır: geç gelmeleri
// sayfanın görünümünü bozmaz.
const FloatingMessagesDock = lazy(() => import('./components/FloatingMessagesDock'));
const WelcomeGuideModal = lazy(() => import('./components/WelcomeGuideModal'));
const QuestionsPage = lazy(() => import('./pages/QuestionsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const AskQuestionPage = lazy(() => import('./pages/AskQuestionPage'));
const QuestionSubmittedPage = lazy(() => import('./pages/QuestionSubmittedPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const FollowersPage = lazy(() => import('./pages/FollowersPage'));
const FollowingPage = lazy(() => import('./pages/FollowingPage'));
const QuestionDetailPage = lazy(() => import('./pages/QuestionDetailPage'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const FollowRequestsPage = lazy(() => import('./pages/FollowRequestsPage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));
const CocukGuvenligiPage = lazy(() => import('./pages/CocukGuvenligiPage'));
const SSSPage = lazy(() => import('./pages/SSSPage'));
const YardimMerkeziPage = lazy(() => import('./pages/YardimMerkeziPage'));
const CommunityPage = lazy(() => import('./pages/CommunityPage'));
const RoomPage = lazy(() => import('./pages/RoomPage'));
const CommunityInvitationsPage = lazy(() => import('./pages/CommunityInvitationsPage'));
const GoogleCallback = lazy(() => import('./pages/GoogleCallback'));
const CompleteProfilePage = lazy(() => import('./pages/CompleteProfilePage'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const OpinionsPage = lazy(() => import('./pages/OpinionsPage'));
const OpinionDetailPage = lazy(() => import('./pages/OpinionDetailPage'));
const CreateOpinionPage = lazy(() => import('./pages/CreateOpinionPage'));
const StoriesPage = lazy(() => import('./pages/StoriesPage'));
const StoryDetailPage = lazy(() => import('./pages/StoryDetailPage'));
const CreateStoryPage = lazy(() => import('./pages/CreateStoryPage'));
const KullanimKilavuzuPage = lazy(() => import('./pages/KullanimKilavuzuPage'));
const GizlilikPolitikasiPage = lazy(() => import('./pages/GizlilikPolitikasiPage'));
const CerezPolitikasiPage = lazy(() => import('./pages/CerezPolitikasiPage'));
const TermsOfServicePage = lazy(() => import('./pages/TermsOfServicePage'));
const KullanimKurallariPage = lazy(() => import('./pages/KullanimKurallariPage'));
const TagsPage = lazy(() => import('./pages/TagsPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
const ReklamPage = lazy(() => import('./pages/ReklamPage'));
const OrtaklikPage = lazy(() => import('./pages/OrtaklikPage'));
const BlogPage = lazy(() => import('./pages/BlogPage'));
const XperPuanPage = lazy(() => import('./pages/XperPuanPage'));
const FeatureTagsPage = lazy(() => import('./pages/FeatureTagsPage'));

// Oyun Merkezi - ayrı parçalar; hub dışındakiler giriş ister.
const GameHubPage = lazy(() => import('./pages/game/GameHubPage'));
const GameArenaPage = lazy(() => import('./pages/game/ArenaPage'));
const GamePlayPage = lazy(() => import('./pages/game/GamePlayPage'));
const GameResultPage = lazy(() => import('./pages/game/GameResultPage'));
const GameDailyPage = lazy(() => import('./pages/game/DailyPage'));
const GameDuelsPage = lazy(() => import('./pages/game/DuelsPage'));
const GameDuelDetailPage = lazy(() => import('./pages/game/DuelDetailPage'));
const GameDilemmaPage = lazy(() => import('./pages/game/DilemmaPage'));
const GameLeaderboardPage = lazy(() => import('./pages/game/GameLeaderboardPage'));
const GameProfilePage = lazy(() => import('./pages/game/GameProfilePage'));
// Herkesler Koşuyor: lobi ve oyun ekranı herkese açık (misafir antrenman oynar).
// 3D motor (three.js) oyun ekranının içinden ayrıca dinamik yükleniyor.
const RunnerLobbyPage = lazy(() => import('./pages/game/runner/RunnerLobbyPage'));
const RunnerPlayPage = lazy(() => import('./pages/game/runner/RunnerPlayPage'));
// Herkesler Yükseliyor (kule): lobi ve oyun misafire açık (antrenman).
const TowerLobbyPage = lazy(() => import('./pages/game/tower/TowerLobbyPage'));
const TowerPlayPage = lazy(() => import('./pages/game/tower/TowerPlayPage'));
// Herkesler Keşfediyor (voxel macera + inşa): lobi ve oyun misafire açık; 3D motor oyun ekranından ayrıca yüklenir.
const KesifLobbyPage = lazy(() => import('./pages/game/kesif/KesifLobbyPage'));
const KesifPlayPage = lazy(() => import('./pages/game/kesif/KesifPlayPage'));
// Karakter editörü ve mağaza: ProtectedRoute YOK - sayfalar misafire kendi
// giriş çağrısını gösteriyor (vitrin/önizleme görülebilsin).
const AvatarEditorPage = lazy(() => import('./pages/game/AvatarEditorPage'));
const ShopPage = lazy(() => import('./pages/game/ShopPage'));


/*
 * Rota içeriği için hata sınırı: yüklenemeyen sayfa parçası ya da çizim
 * hatası bütün uygulamayı beyaz ekrana çevirmesin. Adres değişince sıfırlanır.
 */
const RouteErrorBoundary = ({ children }) => {
  const location = useLocation();
  return <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>;
};

const PresenceHeartbeat = () => {
  usePresence();
  return null;
};

/**
 * Parça inerken görünen ara ekran.
 *
 * Kasten sade ve yüksekliği sabit: iskelet çizmek yerine boş bir alan tutmak,
 * hızlı bağlantıda göz kırpması gibi görünen bir parlamayı önlüyor.
 */
const RouteFallback = () => (
  <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-live="polite">
    <span className="sr-only">Sayfa yükleniyor</span>
    <div className="h-8 w-8 rounded-full border-2 border-current border-t-transparent animate-spin opacity-40" />
  </div>
);

/* Erişilebilirlik modu açık üyede <html data-a11y="1">: büyük yazı, belirgin odak (index.css). */
const AccessibilityModeSync = () => {
  const { user } = useAuth();
  useEffect(() => {
    applyAccessibilityAttr(isAccessibilityOn(user));
  }, [user]);
  return null;
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <PresenceHeartbeat />
          <Router>
            <GenderCheck>
              <div className="overflow-x-hidden">
              <a href="#icerik" className="skip-link">İçeriğe atla</a>
              <AccessibilityModeSync />
              <RouteErrorBoundary>
              <Suspense fallback={<RouteFallback />}>
              <main id="icerik" tabIndex={-1} className="outline-none">
              <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/questions" element={<QuestionsPage />} />
                  <Route path="/questions/:slug" element={<CategoryPage />} />
                  <Route path="/question/:slug" element={<QuestionDetailPage />} />
                  <Route path="/profile/:username" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                  <Route path="/profile/:username/followers" element={<ProtectedRoute><FollowersPage /></ProtectedRoute>} />
                  <Route path="/profile/:username/following" element={<ProtectedRoute><FollowingPage /></ProtectedRoute>} />
                  <Route path="/ask" element={<ProtectedRoute><AskQuestionPage /></ProtectedRoute>} />
                  <Route path="/question-submitted" element={<ProtectedRoute><QuestionSubmittedPage /></ProtectedRoute>} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route path="/signup" element={<SignupPage />} />
                  <Route path="/auth/google/callback" element={<GoogleCallback />} />
                  <Route path="/complete-profile" element={<CompleteProfilePage />} />
                  <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
                  <Route path="/messages/:username" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
                  <Route path="/search" element={<ProtectedRoute><QuestionsPage /></ProtectedRoute>} />
                  <Route path="/leaderboard" element={<LeaderboardPage />} />
                  <Route path="/opinions" element={<OpinionsPage />} />
                  <Route path="/opinions/yaz" element={<ProtectedRoute><CreateOpinionPage /></ProtectedRoute>} />
                  <Route path="/opinion/:slugOrId" element={<OpinionDetailPage />} />
                  <Route path="/stories" element={<StoriesPage />} />
                  <Route path="/stories/yaz" element={<ProtectedRoute><CreateStoryPage /></ProtectedRoute>} />
                  <Route path="/story/:slugOrId" element={<StoryDetailPage />} />
                  <Route path="/communities" element={<ProtectedRoute><CommunityPage /></ProtectedRoute>} />
                  <Route path="/community/:uuid" element={<ProtectedRoute><RoomPage /></ProtectedRoute>} />
                  <Route path="/community-invitations" element={<ProtectedRoute><CommunityInvitationsPage /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                  <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
                  <Route path="/follow-requests" element={<ProtectedRoute><FollowRequestsPage /></ProtectedRoute>} />
                  <Route path="/cocuk-guvenligi" element={<CocukGuvenligiPage />} />
                  <Route path="/sss" element={<SSSPage />} />
                  <Route path="/yardim-merkezi" element={<YardimMerkeziPage />} />
                  <Route path="/kullanim-kilavuzu" element={<KullanimKilavuzuPage />} />
                  <Route path="/gizlilik-politikasi" element={<GizlilikPolitikasiPage />} />
                  <Route path="/cerez-politikasi" element={<CerezPolitikasiPage />} />
                  <Route path="/site-sozlesmesi" element={<TermsOfServicePage />} />
                  <Route path="/kullanim-kurallari" element={<KullanimKurallariPage />} />
                  <Route path="/etiketler" element={<TagsPage />} />
                  <Route path="/iletisim" element={<ContactPage />} />
                  <Route path="/reklam" element={<ReklamPage />} />
                  <Route path="/ortaklik" element={<OrtaklikPage />} />
                  <Route path="/blog" element={<BlogPage />} />
                  <Route path="/xper-puan" element={<XperPuanPage />} />
                  <Route path="/feature-tags" element={<FeatureTagsPage />} />
                  <Route path="/oyun" element={<GameHubPage />} />
                  <Route path="/oyun/arena" element={<ProtectedRoute><GameArenaPage /></ProtectedRoute>} />
                  <Route path="/oyun/oyna/:sessionId" element={<ProtectedRoute><GamePlayPage /></ProtectedRoute>} />
                  <Route path="/oyun/sonuc/:sessionId" element={<ProtectedRoute><GameResultPage /></ProtectedRoute>} />
                  <Route path="/oyun/gunluk" element={<ProtectedRoute><GameDailyPage /></ProtectedRoute>} />
                  <Route path="/oyun/duello" element={<ProtectedRoute><GameDuelsPage /></ProtectedRoute>} />
                  <Route path="/oyun/duello/:id" element={<ProtectedRoute><GameDuelDetailPage /></ProtectedRoute>} />
                  <Route path="/oyun/ikilem" element={<ProtectedRoute><GameDilemmaPage /></ProtectedRoute>} />
                  <Route path="/oyun/liderlik" element={<ProtectedRoute><GameLeaderboardPage /></ProtectedRoute>} />
                  <Route path="/oyun/profil/:username" element={<ProtectedRoute><GameProfilePage /></ProtectedRoute>} />
                  <Route path="/oyun/kosu" element={<RunnerLobbyPage />} />
                  <Route path="/oyun/kosu/oyna" element={<RunnerPlayPage />} />
                  <Route path="/oyun/kule" element={<TowerLobbyPage />} />
                  <Route path="/oyun/kule/oyna" element={<TowerPlayPage />} />
                  <Route path="/oyun/kesif" element={<KesifLobbyPage />} />
                  <Route path="/oyun/kesif/oyna" element={<KesifPlayPage />} />
                  <Route path="/oyun/karakter" element={<AvatarEditorPage />} />
                  <Route path="/oyun/magaza" element={<ShopPage />} />
                  <Route path="/500" element={<ErrorPage code={500} />} />
                  <Route path="/cpl-manage/*" element={<AdminApp />} />
                  <Route path="/mod/*" element={<ModApp />} />
                  <Route path="*" element={<ErrorPage code={404} />} />
              </Routes>
              </main>
              </Suspense>
              </RouteErrorBoundary>
              <Suspense fallback={null}>
                <FloatingMessagesDock />
              </Suspense>
              <AgeGate />
              <WelcomeGuideGate />
            </div>
          </GenderCheck>
          </Router>
        </NotificationProvider>
      </AuthProvider>
      <AppToaster />
    </ThemeProvider>
  );
}

export default App;





