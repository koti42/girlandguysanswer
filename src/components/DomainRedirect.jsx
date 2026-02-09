import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getCanonicalHost, getCanonicalUrl } from '../config/site';

const DomainRedirect = ({ children }) => {
    const { pathname, search } = useLocation();

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const canonicalHost = getCanonicalHost();
        const currentHost = window.location.host;
        if (currentHost !== canonicalHost) {
            const target = getCanonicalUrl(pathname, search);
            window.location.replace(target);
        }
    }, [pathname, search]);

    return children;
};

export default DomainRedirect;
