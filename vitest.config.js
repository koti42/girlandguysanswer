import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * İki test katmanı:
 *  - *.test.js   saf mantık, node ortamı (hızlı)
 *  - *.test.jsx  bileşen testleri, jsdom + testing-library
 * Bileşen testleri dosya başında `// @vitest-environment jsdom` bildirir;
 * ayrı yapılandırma dosyası gerekmez.
 */
export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'node',
        include: ['src/**/*.test.{js,jsx}'],
        setupFiles: ['./src/test/setup.js'],
        css: false,
    },
});
