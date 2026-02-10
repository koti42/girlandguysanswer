import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const QuestionsPage = lazy(() => import('./pages/QuestionsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const AskQuestionPage = lazy(() => import('./pages/AskQuestionPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const FollowersPage = lazy(() => import('./pages/FollowersPage'));
const FollowingPage = lazy(() => import('./pages/FollowingPage'));
const QuestionDetailPage = lazy(() => import('./pages/QuestionDetailPage'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const FollowRequestsPage = lazy(() => import('./pages/FollowRequestsPage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));
const PusherTestPage = lazy(() => import('./pages/PusherTestPage'));
const CommunityPage = lazy(() => import('./pages/CommunityPage'));
const RoomPage = lazy(() => import('./pages/RoomPage'));
const CommunityInvitationsPage = lazy(() => import('./pages/CommunityInvitationsPage'));
const GoogleCallback = lazy(() => import('./pages/GoogleCallback'));
const CompleteProfilePage = lazy(() => import('./pages/CompleteProfilePage'));
const ErrorPage = lazy(() => import('./pages/ErrorPage'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
const PublicationGuidelinesPage = lazy(() => import('./pages/PublicationGuidelinesPage'));
const TermsOfServicePage = lazy(() => import('./pages/TermsOfServicePage'));
const KVKKPage = lazy(() => import('./pages/KVKKPage'));
const KullanimKurallariPage = lazy(() => import('./pages/KullanimKurallariPage'));
const YardimMerkeziPage = lazy(() => import('./pages/YardimMerkeziPage'));
const BlogPage = lazy(() => import('./pages/BlogPage'));
const GizlilikPolitikasiPage = lazy(() => import('./pages/GizlilikPolitikasiPage'));
const CerezPolitikasiPage = lazy(() => import('./pages/CerezPolitikasiPage'));
const ReklamPage = lazy(() => import('./pages/ReklamPage'));
const OrtaklikPage = lazy(() => import('./pages/OrtaklikPage'));
const TagsPage = lazy(() => import('./pages/TagsPage'));
const OpinionsPage = lazy(() => import('./pages/OpinionsPage'));
const CreateOpinionPage = lazy(() => import('./pages/CreateOpinionPage'));
const OpinionDetailPage = lazy(() => import('./pages/OpinionDetailPage'));
const QuestionSubmittedPage = lazy(() => import('./pages/QuestionSubmittedPage'));
const AdminApp = lazy(() => import('./admin/AdminApp'));

const RouteFallback = () => <div className="min-h-screen bg-[var(--bg)]" aria-hidden="true" />;

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

import { NotificationProvider } from './context/NotificationContext';
import DomainRedirect from './components/DomainRedirect';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <Router>
            <DomainRedirect>
              <GenderCheck>
                <div className="overflow-x-hidden">
                  <Suspense fallback={<RouteFallback />}>
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
                  <Route path="/signup" element={<SignupPage />} />
                  <Route path="/auth/google/callback" element={<GoogleCallback />} />
                  <Route path="/complete-profile" element={<CompleteProfilePage />} />
                  <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
                  <Route path="/messages/:username" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
                  <Route path="/search" element={<ProtectedRoute><QuestionsPage /></ProtectedRoute>} />
                  <Route path="/leaderboard" element={<LeaderboardPage />} />
                  <Route path="/communities" element={<ProtectedRoute><CommunityPage /></ProtectedRoute>} />
                  <Route path="/community/:uuid" element={<ProtectedRoute><RoomPage /></ProtectedRoute>} />
                  <Route path="/community-invitations" element={<ProtectedRoute><CommunityInvitationsPage /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                  <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
                  <Route path="/follow-requests" element={<ProtectedRoute><FollowRequestsPage /></ProtectedRoute>} />
                  <Route path="/iletisim" element={<ContactPage />} />
                  <Route path="/yayin-ilkeleri" element={<PublicationGuidelinesPage />} />
                  <Route path="/site-sozlesmesi" element={<TermsOfServicePage />} />
                  <Route path="/kvkk-aydinlatma" element={<KVKKPage />} />
                  <Route path="/kullanim-kurallari" element={<KullanimKurallariPage />} />
                  <Route path="/yardim-merkezi" element={<YardimMerkeziPage />} />
                  <Route path="/blog" element={<BlogPage />} />
                  <Route path="/gizlilik-politikasi" element={<GizlilikPolitikasiPage />} />
                  <Route path="/cerez-politikasi" element={<CerezPolitikasiPage />} />
                  <Route path="/reklam" element={<ReklamPage />} />
                  <Route path="/ortaklik" element={<OrtaklikPage />} />
                  <Route path="/etiketler" element={<TagsPage />} />
                  <Route path="/opinions" element={<OpinionsPage />} />
                  <Route path="/opinions/yaz" element={<ProtectedRoute><CreateOpinionPage /></ProtectedRoute>} />
                  <Route path="/opinion/:slugOrId" element={<OpinionDetailPage />} />
                  <Route path="/pusher-test" element={<PusherTestPage />} />
                  <Route path="/cpl-manage/*" element={<AdminApp />} />
                  <Route path="/500" element={<ErrorPage code={500} />} />
                  <Route path="*" element={<ErrorPage code={404} />} />
                </Routes>
                  </Suspense>
              </div>
            </GenderCheck>
            </DomainRedirect>
          </Router>
        </NotificationProvider>
      </AuthProvider>
      <Toaster
        position="top-center"
        reverseOrder={false}
        gutter={12}
        containerStyle={{ top: 24 }}
        toastOptions={{
          duration: 4000,
          style: {
            borderRadius: '1rem',
            padding: '1rem 1.25rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
            maxWidth: '420px',
            background: 'var(--toast-bg, #fff)',
            color: 'var(--toast-fg, #1f2937)',
            border: '1px solid var(--toast-border, #e5e7eb)',
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: '#fff' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#fff' },
          },
        }}
      />
    </ThemeProvider>
  );
}

export default App;





