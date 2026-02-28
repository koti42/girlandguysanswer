import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import LandingPage from './pages/LandingPage';
import QuestionsPage from './pages/QuestionsPage';
import ProfilePage from './pages/ProfilePage';
import AskQuestionPage from './pages/AskQuestionPage';
import LoginPage from './pages/LoginPage';
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
import { useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';

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
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/questions" element={<QuestionsPage />} />
                  <Route path="/questions/:slug" element={<CategoryPage />} />
                  <Route path="/question/:slug" element={<QuestionDetailPage />} />
                  <Route path="/profile/:username" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                  <Route path="/profile/:username/followers" element={<ProtectedRoute><FollowersPage /></ProtectedRoute>} />
                  <Route path="/profile/:username/following" element={<ProtectedRoute><FollowingPage /></ProtectedRoute>} />
                  <Route path="/ask" element={<ProtectedRoute><AskQuestionPage /></ProtectedRoute>} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/signup" element={<SignupPage />} />
                  <Route path="/auth/google/callback" element={<GoogleCallback />} />
                  <Route path="/complete-profile" element={<CompleteProfilePage />} />
                  <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
                  <Route path="/messages/:username" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
                  <Route path="/search" element={<ProtectedRoute><QuestionsPage /></ProtectedRoute>} />
                  <Route path="/leaderboard" element={<LeaderboardPage />} />
                  <Route path="/opinions" element={<OpinionsPage />} />
                  <Route path="/opinion/:slugOrId" element={<OpinionDetailPage />} />
                  <Route path="/communities" element={<ProtectedRoute><CommunityPage /></ProtectedRoute>} />
                  <Route path="/community/:uuid" element={<ProtectedRoute><RoomPage /></ProtectedRoute>} />
                  <Route path="/community-invitations" element={<ProtectedRoute><CommunityInvitationsPage /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                  <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
                  <Route path="/follow-requests" element={<ProtectedRoute><FollowRequestsPage /></ProtectedRoute>} />
                  <Route path="/pusher-test" element={<PusherTestPage />} />
                  <Route path="/cocuk-guvenligi" element={<CocukGuvenligiPage />} />
                  <Route path="/500" element={<ErrorPage code={500} />} />
                  <Route path="*" element={<ErrorPage code={404} />} />
                </Routes>
              </div>
            </GenderCheck>
            </DomainRedirect>
          </Router>
        </NotificationProvider>
      </AuthProvider>
      <Toaster position="top-center" reverseOrder={false} />
    </ThemeProvider>
  );
}

export default App;





