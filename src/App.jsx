import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AdminApp from './admin/AdminApp';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import LandingPage from './pages/LandingPage';
import QuestionsPage from './pages/QuestionsPage';
import ProfilePage from './pages/ProfilePage';
import AskQuestionPage from './pages/AskQuestionPage';
import QuestionSubmittedPage from './pages/QuestionSubmittedPage';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import SignupPage from './pages/SignupPage';
import FollowersPage from './pages/FollowersPage';
import FollowingPage from './pages/FollowingPage';
import QuestionDetailPage from './pages/QuestionDetailPage';
import MessagesPage from './pages/MessagesPage';
import SettingsPage from './pages/SettingsPage';
import NotificationsPage from './pages/NotificationsPage';
import FollowRequestsPage from './pages/FollowRequestsPage';
import LeaderboardPage from './pages/LeaderboardPage';
import PusherTestPage from './pages/PusherTestPage';
import CocukGuvenligiPage from './pages/CocukGuvenligiPage';
import SSSPage from './pages/SSSPage';
import YardimMerkeziPage from './pages/YardimMerkeziPage';
import CommunityPage from './pages/CommunityPage';
import RoomPage from './pages/RoomPage';
import CommunityInvitationsPage from './pages/CommunityInvitationsPage';
import { useNavigate, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import GoogleCallback from './pages/GoogleCallback';
import CompleteProfilePage from './pages/CompleteProfilePage';
import ErrorPage from './pages/ErrorPage';
import CategoryPage from './pages/CategoryPage';
import OpinionsPage from './pages/OpinionsPage';
import OpinionDetailPage from './pages/OpinionDetailPage';
import CreateOpinionPage from './pages/CreateOpinionPage';
import StoriesPage from './pages/StoriesPage';
import StoryDetailPage from './pages/StoryDetailPage';
import CreateStoryPage from './pages/CreateStoryPage';
import KullanimKilavuzuPage from './pages/KullanimKilavuzuPage';
import GizlilikPolitikasiPage from './pages/GizlilikPolitikasiPage';
import CerezPolitikasiPage from './pages/CerezPolitikasiPage';
import TermsOfServicePage from './pages/TermsOfServicePage';
import KullanimKurallariPage from './pages/KullanimKurallariPage';
import TagsPage from './pages/TagsPage';
import ContactPage from './pages/ContactPage';
import ReklamPage from './pages/ReklamPage';
import OrtaklikPage from './pages/OrtaklikPage';
import BlogPage from './pages/BlogPage';
import XperPuanPage from './pages/XperPuanPage';
import FeatureTagsPage from './pages/FeatureTagsPage';
import WelcomeGuideModal from './components/WelcomeGuideModal';
import FloatingMessagesDock from './components/FloatingMessagesDock';
import { useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';
import usePresence from './hooks/usePresence';
import { usersAPI } from './services/api';

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
    <WelcomeGuideModal
      isOpen={showModal}
      onClose={handleClose}
      onGoToGuide={handleGoToGuide}
    />
  );
};

import { NotificationProvider } from './context/NotificationContext';

const PresenceHeartbeat = () => {
  usePresence();
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
                  <Route path="/pusher-test" element={<PusherTestPage />} />
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
                  <Route path="/500" element={<ErrorPage code={500} />} />
                  <Route path="/cpl-manage/*" element={<AdminApp />} />
                  <Route path="*" element={<ErrorPage code={404} />} />
              </Routes>
              <FloatingMessagesDock />
              <AgeGate />
              <WelcomeGuideGate />
            </div>
          </GenderCheck>
          </Router>
        </NotificationProvider>
      </AuthProvider>
      <Toaster position="top-center" reverseOrder={false} />
    </ThemeProvider>
  );
}

export default App;





