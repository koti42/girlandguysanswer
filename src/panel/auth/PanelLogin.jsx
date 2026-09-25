import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaShieldAlt, FaUserShield } from 'react-icons/fa';
import { usePanelAuth } from './PanelAuthContext';
import { Button, Field, Input } from '../ui';
import { errorMessage } from '../api/client';

/**
 * İki panelin ortak giriş ekranı; `panel` görsel kimliği ve yönlendirmeyi
 * belirler. Rolü yetmeyen hesap panele giremez, yetkili olduğu panele
 * yönlendirilir.
 */
export default function PanelLogin({ panel }) {
    const { login } = usePanelAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(location.state?.denied ? 'Bu panele erişim yetkiniz yok.' : '');

    const isMod = panel === 'mod';
    const home = isMod ? '/mod' : '/cpl-manage';

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            const user = await login(email.trim(), password);
            const roles = (user.roles || []).map((r) => r.slug);
            const isAdmin = roles.includes('admin') || roles.includes('super_admin');
            // Moderatör admin paneline giriş denerse kendi paneline gitsin.
            if (!isMod && !isAdmin) navigate('/mod', { replace: true });
            else navigate(location.state?.from && location.state.from !== `${home}/login` ? location.state.from : home, { replace: true });
        } catch (err) {
            setError(err.code === 'NO_PANEL_ACCESS' ? err.message : errorMessage(err, 'Giriş başarısız.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div data-panel={panel} className="min-h-screen grid place-items-center px-4">
            <div className="w-full max-w-sm p-fade-in">
                <div className="flex items-center gap-3 mb-6">
                    <div className="h-12 w-12 rounded-2xl p-accent-bg grid place-items-center text-xl shadow-lg">{isMod ? <FaShieldAlt /> : <FaUserShield />}</div>
                    <div>
                        <h1 className="text-lg font-bold leading-tight">{isMod ? 'Moderasyon Paneli' : 'Yönetim Paneli'}</h1>
                        <p className="text-xs p-muted">Herkesler Soruyor</p>
                    </div>
                </div>
                <form onSubmit={submit} className="p-surface rounded-2xl p-6 space-y-4">
                    <Field label="E-posta">
                        <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                    </Field>
                    <Field label="Parola">
                        <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </Field>
                    {error && <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2" role="alert">{error}</p>}
                    <Button type="submit" variant="primary" className="w-full" loading={busy}>Giriş yap</Button>
                </form>
                <p className="text-center text-[11px] p-muted mt-4">
                    {isMod ? <a href="/cpl-manage/login" className="hover:underline">Yönetim paneline git</a> : <a href="/mod/login" className="hover:underline">Moderasyon paneline git</a>}
                </p>
            </div>
        </div>
    );
}
