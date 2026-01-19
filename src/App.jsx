import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
import AskQuestionPage from './pages/AskQuestionPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import FollowersPage from './pages/FollowersPage';
import FollowingPage from './pages/FollowingPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/profile/:username" element={<ProfilePage />} />
        <Route path="/profile/:username/followers" element={<FollowersPage />} />
        <Route path="/profile/:username/following" element={<FollowingPage />} />
        <Route path="/ask" element={<AskQuestionPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
      </Routes>
    </Router>
  );
}

export default App;



