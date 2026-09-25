import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PanelAuthProvider } from '../panel/auth/PanelAuthContext';
import RequireRole from '../panel/auth/RequireRole';
import PanelLogin from '../panel/auth/PanelLogin';
import { ToastProvider } from '../panel/hooks/useToast';
import AdminShell from './AdminShell';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));
const Content = lazy(() => import('./pages/Content.jsx'));
const Complaints = lazy(() => import('./pages/Complaints.jsx'));
const Communities = lazy(() => import('./pages/Communities.jsx'));
const Catalog = lazy(() => import('./pages/Catalog.jsx'));
const Gamification = lazy(() => import('./pages/Gamification.jsx'));
const Roles = lazy(() => import('./pages/Roles.jsx'));
const SpecialDays = lazy(() => import('./pages/SpecialDays.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Broadcast = lazy(() => import('./pages/Broadcast.jsx'));
const AuditLog = lazy(() => import('./pages/AuditLog.jsx'));
const System = lazy(() => import('./pages/System.jsx'));
const Security = lazy(() => import('../panel/features/SecurityPage.jsx'));

const Fallback = () => <div className="py-16 grid place-items-center"><div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-[var(--p-accent)] animate-spin" /></div>;

/** Admin paneli: /cpl-manage/* - admin ve super_admin. */
export default function AdminApp() {
    return (
        <PanelAuthProvider>
            <ToastProvider>
                <Routes>
                    <Route path="/login" element={<PanelLogin panel="admin" />} />
                    <Route element={<RequireRole panel="admin" loginPath="/cpl-manage/login"><AdminShell /></RequireRole>}>
                        <Route index element={<Suspense fallback={<Fallback />}><Dashboard /></Suspense>} />
                        <Route path="users" element={<Suspense fallback={<Fallback />}><Users /></Suspense>} />
                        <Route path="users/:id" element={<Suspense fallback={<Fallback />}><Users /></Suspense>} />
                        <Route path="content" element={<Suspense fallback={<Fallback />}><Content /></Suspense>} />
                        <Route path="complaints" element={<Suspense fallback={<Fallback />}><Complaints /></Suspense>} />
                        <Route path="communities" element={<Suspense fallback={<Fallback />}><Communities /></Suspense>} />
                        <Route path="catalog" element={<Suspense fallback={<Fallback />}><Catalog /></Suspense>} />
                        <Route path="gamification" element={<Suspense fallback={<Fallback />}><Gamification /></Suspense>} />
                        <Route path="roles" element={<Suspense fallback={<Fallback />}><Roles /></Suspense>} />
                        <Route path="special-days" element={<Suspense fallback={<Fallback />}><SpecialDays /></Suspense>} />
                        <Route path="settings" element={<Suspense fallback={<Fallback />}><Settings /></Suspense>} />
                        <Route path="broadcast" element={<Suspense fallback={<Fallback />}><Broadcast /></Suspense>} />
                        <Route path="audit" element={<Suspense fallback={<Fallback />}><AuditLog /></Suspense>} />
                        <Route path="system" element={<Suspense fallback={<Fallback />}><System /></Suspense>} />
                        <Route path="security" element={<Suspense fallback={<Fallback />}><Security /></Suspense>} />
                    </Route>
                    <Route path="*" element={<Navigate to="/cpl-manage" replace />} />
                </Routes>
            </ToastProvider>
        </PanelAuthProvider>
    );
}
