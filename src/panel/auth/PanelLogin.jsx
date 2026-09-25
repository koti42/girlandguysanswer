import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FaArrowRight, FaBolt, FaChartLine, FaFingerprint, FaGoogle, FaLock, FaShieldAlt, FaUserShield, FaUsers } from 'react-icons/fa';
import { usePanelAuth } from './PanelAuthContext';
import { Button, Field, Input } from '../ui';
import { errorMessage } from '../api/client';
import { authApi } from '../api/endpoints';
import { conditionalUiAvailable, isUserCancel, passkeySupported } from '../lib/webauthn';
import { panelsFor } from '../lib/permissions';
import '../theme.css';

const COPY = {
    admin: {
        title: 'Yönetim Paneli',
        icon: FaUserShield,
        tagline: 'Sitenin tamamı, tek ekrandan.',
        bullets: [[FaChartLine, 'Canlı istatistikler ve 30 günlük eğilimler'], [FaUsers, 'Kullanıcı, rol, katalog ve ayar yönetimi'], [FaShieldAlt, 'Her işlem denetim kaydında']],
        home: '/cpl-manage', login: '/cpl-manage/login', other: { path: '/mod/login', label: 'Moderasyon paneli' },
    },
    mod: {
        title: 'Moderasyon Paneli',
        icon: FaShieldAlt,
        tagline: 'Kuyruğu klavyeyle bitir.',
        bullets: [[FaBolt, 'Öncelikli şikâyet kuyruğu, j/k ile gez'], [FaUsers, 'Kullanıcı risk profili ve geçmişi'], [FaLock, 'Yalnızca moderasyon; hesap ayarları yok']],
        home: '/mod', login: '/mod/login', other: { path: '/cpl-manage/login', label: 'Yönetim paneli' },
    },
};

/**
 * Panel giriş ekranı. Sol: kimlik; sağ: giriş yolları.
 *
 * Sıra önemli: ana sitede oturum varsa "devam et" en üstte tek düğme;
 * yoksa e-posta/parola, altında Google ve passkey. Şifremi unuttum aynı
 * kartta açılır, ayrı sayfa yok. Google dönüşü (?token=) burada karşılanır.
 */
export default function PanelLogin({ panel }) {
    const c = COPY[panel];
    const { login, loginWithPasskey, startGoogle, adoptToken, mainSession, user } = usePanelAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [sp, setSp] = useSearchParams();

    const [mode, setMode] = useState('login'); // login | forgot | forgot-sent
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(null); // 'password' | 'google' | 'passkey' | 'continue' | 'forgot'
    const [error, setError] = useState(location.state?.denied ? 'Bu panele erişim yetkiniz yok.' : sp.get('error') === 'google_auth_failed' ? 'Google ile giriş başarısız oldu.' : '');
    const [canPasskey, setCanPasskey] = useState(false);
    const passkeyAbort = useRef(null);

    const target = () => (location.state?.from && location.state.from !== c.login ? location.state.from : c.home);
    const finish = (u) => {
        const roles = panelsFor(u);
        if (panel === 'admin' && !roles.includes('admin')) navigate('/mod', { replace: true });
        else navigate(target(), { replace: true });
    };

    // Zaten girişliyse (devralma dahil) doğrudan içeri.
    useEffect(() => { if (user && panelsFor(user).includes(panel)) navigate(c.home, { replace: true }); }, [user, panel, navigate, c.home]);

    // Google dönüşü: ?token=... - adresten hemen temizlenir ki yenilemede tekrar denenmesin.
    useEffect(() => {
        const token = sp.get('token');
        if (!token) return;
        setSp({}, { replace: true });
        setBusy('google');
        adoptToken(token, 'own').then(finish).catch((e) => setError(e.code === 'NO_PANEL_ACCESS' ? e.message : errorMessage(e))).finally(() => setBusy(null));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Passkey: destek varsa düğme; conditional UI varsa giriş alanına dokununca öner.
    useEffect(() => {
        setCanPasskey(passkeySupported());
        let alive = true;
        conditionalUiAvailable().then((ok) => {
            if (!ok || !alive) return;
            passkeyAbort.current = new AbortController();
            loginWithPasskey({ conditional: true, signal: passkeyAbort.current.signal }).then(finish).catch(() => { /* sessiz mod: iptal/yok normal */ });
        });
        return () => { alive = false; passkeyAbort.current?.abort(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const run = async (kind, fn) => {
        setBusy(kind); setError('');
        try { await fn(); }
        catch (e) {
            if (isUserCancel(e)) return;
            setError(e.code === 'NO_PANEL_ACCESS' ? e.message : errorMessage(e, 'Giriş başarısız.'));
        } finally { setBusy(null); }
    };

    const submitPassword = (e) => { e.preventDefault(); run('password', async () => finish(await login(email.trim(), password))); };
    const submitForgot = (e) => { e.preventDefault(); run('forgot', async () => { await authApi.forgotPassword(email.trim()); setMode('forgot-sent'); }); };
    const clickPasskey = () => { passkeyAbort.current?.abort(); run('passkey', async () => finish(await loginWithPasskey({ email: email.trim() || undefined }))); };
    const clickGoogle = () => run('google', () => startGoogle(c.login));

    const Icon = c.icon;

    return (
        <div data-panel={panel} className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
            {/* Sol: kimlik */}
            <aside className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden">
                <div className="absolute inset-0 opacity-[0.35]" style={{ background: 'radial-gradient(60% 50% at 20% 20%, var(--p-accent) 0%, transparent 60%), radial-gradient(50% 40% at 80% 80%, var(--p-accent-2) 0%, transparent 60%)' }} aria-hidden />
                <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)', backgroundSize: '40px 40px' }} aria-hidden />
                <div className="relative flex items-center gap-3">
                    <span className="h-11 w-11 rounded-2xl p-accent-bg grid place-items-center text-lg shadow-lg"><Icon /></span>
                    <div><div className="font-bold leading-tight">Herkesler Soruyor</div><div className="text-xs p-muted">{c.title}</div></div>
                </div>
                <div className="relative">
                    <h1 className="text-4xl font-bold tracking-tight leading-tight max-w-md">{c.tagline}</h1>
                    <ul className="mt-8 space-y-4">
                        {c.bullets.map(([BIcon, text]) => (
                            <li key={text} className="flex items-center gap-3 text-sm"><span className="h-8 w-8 rounded-lg bg-white/[0.08] grid place-items-center p-accent-text"><BIcon /></span>{text}</li>
                        ))}
                    </ul>
                </div>
                <p className="relative text-xs p-muted">Bu alan yalnızca yetkili hesaplar içindir. Tüm işlemler kayıt altına alınır.</p>
            </aside>

            {/* Sağ: giriş */}
            <main className="flex items-center justify-center p-6 sm:p-10">
                <div className="w-full max-w-md p-fade-in">
                    <div className="lg:hidden flex items-center gap-3 mb-8">
                        <span className="h-11 w-11 rounded-2xl p-accent-bg grid place-items-center text-lg"><Icon /></span>
                        <div><div className="font-bold leading-tight">{c.title}</div><div className="text-xs p-muted">Herkesler Soruyor</div></div>
                    </div>

                    {/* Ana sitede oturum var ama yetki yok */}
                    {mainSession && !mainSession.hasAccess && mode === 'login' && (
                        <p className="mb-4 text-xs rounded-xl bg-white/[0.05] border border-[var(--p-border)] px-4 py-3">Ana sitede <b>@{mainSession.username}</b> olarak girişlisiniz ama bu hesabın panel yetkisi yok. Yetkili bir hesapla giriş yapın.</p>
                    )}

                    <div className="p-surface rounded-2xl p-6 sm:p-8 space-y-5">
                        {mode === 'forgot-sent' ? (
                            <div className="text-center py-4">
                                <div className="mx-auto h-12 w-12 rounded-2xl bg-emerald-500/15 text-emerald-300 grid place-items-center text-xl">✓</div>
                                <h2 className="mt-4 font-semibold">E-postanı kontrol et</h2>
                                <p className="text-sm p-muted mt-1">Bu adrese kayıtlı bir hesap varsa sıfırlama bağlantısı gönderildi.</p>
                                <Button className="mt-5" variant="secondary" onClick={() => setMode('login')}>Girişe dön</Button>
                            </div>
                        ) : mode === 'forgot' ? (
                            <form onSubmit={submitForgot} className="space-y-4">
                                <div><h2 className="text-lg font-semibold">Parolanı sıfırla</h2><p className="text-sm p-muted mt-1">E-postana bir bağlantı göndereceğiz.</p></div>
                                <Field label="E-posta"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
                                {error && <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2" role="alert">{error}</p>}
                                <Button type="submit" variant="primary" className="w-full" loading={busy === 'forgot'}>Bağlantı gönder</Button>
                                <button type="button" onClick={() => setMode('login')} className="w-full text-xs p-muted hover:text-[var(--p-text)]">Vazgeç</button>
                            </form>
                        ) : (
                            <>
                                <div><h2 className="text-lg font-semibold">Giriş yap</h2><p className="text-sm p-muted mt-1">Yetkili hesabınla devam et.</p></div>

                                <form onSubmit={submitPassword} className="space-y-4">
                                    <Field label="E-posta"><Input type="email" autoComplete="username webauthn" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus data-testid="login-email" /></Field>
                                    <Field label={<span className="flex items-center justify-between w-full">Parola<button type="button" onClick={() => { setError(''); setMode('forgot'); }} className="text-xs p-accent-text hover:underline font-normal">Şifremi unuttum</button></span>}>
                                        <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="login-password" />
                                    </Field>
                                    {error && <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2" role="alert">{error}</p>}
                                    <Button type="submit" variant="primary" className="w-full" loading={busy === 'password'} disabled={!!busy && busy !== 'password'} icon={FaArrowRight} data-testid="login-submit">Giriş yap</Button>
                                </form>

                                <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider p-muted"><span className="flex-1 h-px bg-[var(--p-border)]" />veya<span className="flex-1 h-px bg-[var(--p-border)]" /></div>

                                <div className="grid gap-2">
                                    <Button variant="secondary" className="w-full" icon={FaGoogle} loading={busy === 'google'} disabled={!!busy && busy !== 'google'} onClick={clickGoogle} data-testid="login-google">Google ile giriş</Button>
                                    {canPasskey && <Button variant="secondary" className="w-full" icon={FaFingerprint} loading={busy === 'passkey'} disabled={!!busy && busy !== 'passkey'} onClick={clickPasskey} data-testid="login-passkey">Passkey ile giriş</Button>}
                                </div>
                            </>
                        )}
                    </div>

                    <p className="text-center text-xs p-muted mt-5">
                        <a href={c.other.path} className="hover:underline">{c.other.label} →</a>
                        <span className="mx-2">·</span>
                        <a href="/" className="hover:underline">Siteye dön</a>
                    </p>
                </div>
            </main>
        </div>
    );
}
