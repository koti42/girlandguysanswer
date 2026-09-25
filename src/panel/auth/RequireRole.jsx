import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePanelAuth } from './PanelAuthContext';
import { currentTheme } from '../hooks/usePanelTheme';
import '../theme.css';

/**
 * Rota kapısı. `panel` = 'mod' | 'admin'. Girişsizse login'e, girişli ama
 * yetkisizse yetkili olduğu panele (varsa) ya da login'e yönlendirir.
 */
export default function RequireRole({ panel, loginPath, children }) {
    const { user, booting, panels } = usePanelAuth();
    const location = useLocation();

    if (booting) {
        return (
            <div data-panel={panel} data-theme={currentTheme()} className="min-h-screen grid place-items-center bg-[var(--p-bg)]">
                <div className="h-10 w-10 rounded-full border-2 border-[var(--p-border)] border-t-[var(--p-accent)] animate-spin" />
            </div>
        );
    }

    if (!user) {
        return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
    }

    if (!panels.includes(panel)) {
        const fallback = panels.includes('admin') ? '/cpl-manage' : panels.includes('mod') ? '/mod' : loginPath;
        return <Navigate to={fallback} replace state={{ denied: panel }} />;
    }

    return children;
}
