import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
import AskQuestionPage from './pages/AskQuestionPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import FollowersPage from './pages/FollowersPage';
import FollowingPage from './pages/FollowingPage';
import QuestionDetailPage from './pages/QuestionDetailPage';
import MessagesPage from './pages/MessagesPage';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/question/:id" element={<QuestionDetailPage />} />
          <Route path="/profile/:username" element={<ProfilePage />} />
          <Route path="/profile/:username/followers" element={<FollowersPage />} />
          <Route path="/profile/:username/following" element={<FollowingPage />} />
          <Route path="/ask" element={<AskQuestionPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/messages/:username" element={<MessagesPage />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;





