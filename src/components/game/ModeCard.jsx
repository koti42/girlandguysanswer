import React from 'react';
import { Link } from 'react-router-dom';
import { LuLock, LuChevronRight } from 'react-icons/lu';

/** Oyun Merkezi'ndeki mod kartı. Kilitliyse girişe yönlendirir. */
const ModeCard = ({ to, title, description, icon: Icon, gradient, badge, children, locked = false, cta = 'Oyna' }) => (
    <Link
        to={locked ? '/login' : to}
        className="group game-card game-press relative flex flex-col overflow-hidden rounded-3xl p-4 sm:p-5 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral"
    >
        <div className="flex items-start gap-3">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white text-2xl shadow-lg ${gradient}`}>
                <Icon aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
                <h3 className="font-extrabold text-slate-900 dark:text-white">{title}</h3>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{description}</p>
            </div>
            {badge}
        </div>
        {children && <div className="mt-3 flex-1">{children}</div>}
        <span className="mt-3 inline-flex items-center gap-1 self-end text-sm font-bold text-coral">
            {locked ? (
                <>
                    <LuLock aria-hidden="true" /> Giriş yap ve oyna
                </>
            ) : (
                <>
                    {cta} <LuChevronRight className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </>
            )}
        </span>
    </Link>
);

export default ModeCard;
