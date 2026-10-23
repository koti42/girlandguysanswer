import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PanelAuthProvider } from '../panel/auth/PanelAuthContext';
import RequireRole from '../panel/auth/RequireRole';
import PanelLogin from '../panel/auth/PanelLogin';
import { ToastProvider } from '../panel/hooks/useToast';
import ModShell from './ModShell';

const Home = lazy(() => import('./pages/Home.jsx'));
const Queue = lazy(() => import('./pages/Queue.jsx'));
const Content = lazy(() => import('./pages/Content.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));
const Activity = lazy(() => import('./pages/Activity.jsx'));
const Feedback = lazy(() => import('./pages/Feedback.jsx'));
const KesifMaps = lazy(() => import('./pages/KesifMaps.jsx'));
const Security = lazy(() => import('../panel/features/SecurityPage.jsx'));

const Fallback = () => <div className="py-16 grid place-items-center"><div className="h-8 w-8 rounded-full border-2 border-[var(--p-border)] border-t-[var(--p-accent)] animate-spin" /></div>;
const S = ({ children }) => <Suspense fallback={<Fallback />}>{children}</Suspense>;

/** Moderasyon paneli: /mod/* - moderator, admin, super_admin. */
export default function ModApp() {
    return (
        <PanelAuthProvider>
            <ToastProvider>
                <Routes>
                    <Route path="/login" element={<PanelLogin panel="mod" />} />
                    <Route element={<RequireRole panel="mod" loginPath="/mod/login"><ModShell /></RequireRole>}>
                        <Route index element={<S><Home /></S>} />
                        <Route path="queue" element={<S><Queue /></S>} />
                        <Route path="content" element={<S><Content /></S>} />
                        <Route path="users" element={<S><Users /></S>} />
                        <Route path="users/:id" element={<S><Users /></S>} />
                        <Route path="activity" element={<S><Activity /></S>} />
                        <Route path="feedback" element={<S><Feedback /></S>} />
                        <Route path="kesif" element={<S><KesifMaps /></S>} />
                        <Route path="security" element={<S><Security /></S>} />
                    </Route>
                    <Route path="*" element={<Navigate to="/mod" replace />} />
                </Routes>
            </ToastProvider>
        </PanelAuthProvider>
    );
}
