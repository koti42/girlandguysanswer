import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import { setResultGuardDefault } from '../components/game/useResultGuard';

// Sonuç ekranı dokunuş koruması (600 ms) akış testlerinde kapalı; kendi testi
// (ResultGuard.test.jsx) süreyi açıkça 600'e çeker.
setResultGuardDefault(0);

// waitFor/findBy varsayılan 1 sn: paralel yükte tembel yüklenen (React.lazy) ekranlar için dar.
// 5 sn yoğun makinede (paralel ajanlar) yetmedi; başarılı testi yavaşlatmaz, yalnız hata anında bekler.
configure({ asyncUtilTimeout: 15000 });

// Her testten sonra olay döngüsüne bir makro-görev turu ver. Art arda duran EŞZAMANLI testler (ör. koşu botu
// 40 seed, yapı üretimi) dosya boyunca yalnızca mikro-görev ilerletir; işçi vitest ana sürecine RPC yanıtı
// alamaz ve 60 sn sonra "Timeout calling onTaskUpdate" ile TÜM çalışmayı kırmızı (exit 1) yapardı.
// Gerçek setImmediate/setTimeout yükleme anında yakalanır: sahte zamanlayıcı (vi.useFakeTimers) bunu bozmaz.
const realImmediate = typeof globalThis.setImmediate === 'function' ? globalThis.setImmediate : null;
const realTimeout = setTimeout;
const yieldToLoop = () => new Promise((resolve) => (realImmediate ? realImmediate(resolve) : realTimeout(resolve, 0)));

afterEach(async () => {
    cleanup();
    await yieldToLoop();
});
