import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { setResultGuardDefault } from '../components/game/useResultGuard';

// Sonuç ekranı dokunuş koruması (600 ms) akış testlerinde kapalı; kendi testi
// (ResultGuard.test.jsx) süreyi açıkça 600'e çeker.
setResultGuardDefault(0);

afterEach(() => cleanup());
