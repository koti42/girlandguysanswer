import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePanelAuth } from './PanelAuthContext';

/**
 * Rota kapısı. `panel` = 'mod' | 'admin'. Girişsizse login'e, girişli ama
 * yetkisizse yetkili olduğu panele (varsa) ya da login'e yönlendirir.
 */
export default function RequireRole({ panel, loginPath, children }) {
    const { user, booting, panels } = usePanelAuth();
    const location = useLocation();

    if (booting) {
        return (
            <div className="min-h-screen grid place-items-center bg-slate-950">
                <div className="h-10 w-10 rounded-full border-2 border-slate-700 border-t-amber-400 animate-spin" />
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
