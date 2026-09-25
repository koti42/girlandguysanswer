import { defineConfig } from 'vitest/config';

/**
 * Test yapılandırması.
 *
 * Kapsam kasıtlı olarak saf mantıkla sınırlı: URL/slug üretimi, avatar
 * normalizasyonu, içerik ayrıştırma, renk seçimi. Bunlar bileşen ağacına
 * bağlı olmayan, sessizce bozulduğunda kullanıcıya yanlış bağlantı veya
 * kırık görsel olarak yansıyan parçalar.
 *
 * Bileşen render testleri (jsdom + testing-library) henüz yok; onlar ayrı
 * bir adım ve daha fazla kurulum istiyor.
 */
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.js'],
    },
});
