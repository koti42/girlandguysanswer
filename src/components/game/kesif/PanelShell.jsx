import React, { useEffect, useId, useRef } from 'react';
import './panels.css';
import './panelsMagic.css';
import './panelsTouch.css';

/*
 * Panel kabuğu: oyun sahnesini (konumlu üst öğe) kaplayan örtü + role="dialog" pencere.
 * Esc / arka plana dokunma kapatır, Tab pencerede döner, açılışta odak içeri taşınır ve kapanınca açana döner.
 * İç bileşen Esc'yi kendisi kullanacaksa olayda preventDefault çağırmalıdır (ör. açık çekmece).
 */
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select, textarea, [href], [tabindex]:not([tabindex="-1"])';

const PanelShell = ({
    title, subtitle, onClose, children, className = '', accessibility = false, reducedMotion = false,
    testId, size = 'lg', closeLabel = 'Kapat', headerExtra = null, footer = null,
}) => {
    const titleId = useId();
    const boxRef = useRef(null);
    const closeRef = useRef(onClose);

    useEffect(() => {
        closeRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        const opener = document.activeElement;
        const box = boxRef.current;
        const target = box && (
            box.querySelector('[data-autofocus]')
            || box.querySelector('[role="tab"][aria-selected="true"]')
            || box.querySelector('.kp-body [data-grid-item][tabindex="0"]')
            || box.querySelector('.kp-close')
        );
        if (target && target.focus) target.focus({ preventScroll: true });
        const onKey = (e) => {
            if (e.key === 'Escape' && !e.defaultPrevented) {
                e.preventDefault();
                if (closeRef.current) closeRef.current();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            if (opener && opener !== document.body && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true });
        };
    }, []);

    const onKeyDown = (e) => {
        if (e.key !== 'Tab' || !boxRef.current) return;
        const items = Array.from(boxRef.current.querySelectorAll(FOCUSABLE));
        if (!items.length) {
            e.preventDefault();
            return;
        }
        const a = items[0];
        const z = items[items.length - 1];
        const inside = boxRef.current.contains(document.activeElement);
        if (e.shiftKey && (document.activeElement === a || !inside)) {
            e.preventDefault();
            z.focus();
        } else if (!e.shiftKey && (document.activeElement === z || !inside)) {
            e.preventDefault();
            a.focus();
        }
    };

    const cls = ['kp-overlay', `kp-size-${size}`];
    if (accessibility) cls.push('kp-a11y');
    if (reducedMotion) cls.push('kp-calm');
    return (
        <div
            className={cls.join(' ')}
            data-testid={testId ? `${testId}-overlay` : undefined}
            onPointerDown={(e) => {
                if (e.target === e.currentTarget && closeRef.current) closeRef.current();
            }}
        >
            <div
                ref={boxRef}
                className={`kp-box ${className}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                data-testid={testId}
                onKeyDown={onKeyDown}
            >
                <header className="kp-head">
                    <div className="kp-head-text">
                        <h2 id={titleId} className="kp-title">{title}</h2>
                        {subtitle ? <p className="kp-sub">{subtitle}</p> : null}
                    </div>
                    {headerExtra}
                    <button type="button" className="kp-close" onClick={onClose} aria-label={closeLabel}>
                        <span aria-hidden="true">✕</span>
                    </button>
                </header>
                <div className="kp-body">{children}</div>
                {footer ? <footer className="kp-foot">{footer}</footer> : null}
            </div>
        </div>
    );
};

export default PanelShell;
