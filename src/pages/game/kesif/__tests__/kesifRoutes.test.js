import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/*
 * App.jsx rota kaydı dumanı: /oyun/kesif -> lobi, /oyun/kesif/oyna -> oyun; ikisi de ProtectedRoute
 * dışında (misafir oynar) ve tembel yüklenen dosyalar gerçekten var.
 */
const SRC = resolve(HERE, '../../../..');
const app = readFileSync(resolve(SRC, 'App.jsx'), 'utf8');

describe('App rotaları: Keşif', () => {
    it('lobi ve oyun rotaları kayıtlı, herkese açık', () => {
        expect(app).toMatch(/<Route path="\/oyun\/kesif" element=\{<KesifLobbyPage \/>\} \/>/);
        expect(app).toMatch(/<Route path="\/oyun\/kesif\/oyna" element=\{<KesifPlayPage \/>\} \/>/);
        expect(app).not.toMatch(/ProtectedRoute>\s*<Kesif/);
    });

    it('tembel içe aktarmalar var olan dosyalara bakar', () => {
        for (const name of ['KesifLobbyPage', 'KesifPlayPage']) {
            const line = `const ${name} = lazy(() => import('./pages/game/kesif/${name}'));`;
            expect(app.includes(line), name).toBe(true);
            expect(existsSync(resolve(SRC, `pages/game/kesif/${name}.jsx`)), name).toBe(true);
        }
    });

    it('oyun sayfası varsayılan olarak dışa aktarılır ve motor tembel yüklenir', () => {
        const play = readFileSync(resolve(HERE, '../KesifPlayPage.jsx'), 'utf8');
        expect(play).toMatch(/export default KesifPlayPage/);
        const loader = readFileSync(resolve(HERE, '../engineLoader.js'), 'utf8');
        expect(loader).toMatch(/export const loadKesifEngine = \(\) => import\('\.\.\/\.\.\/\.\.\/game\/kesif\/index\.js'\)/);
        // oyun sayfaları motoru doğrudan (statik) içe aktarmaz
        const screen = readFileSync(resolve(HERE, '../useKesifSession.js'), 'utf8');
        expect(screen).not.toMatch(/from '\.\.\/\.\.\/\.\.\/game\/kesif\/index/);
    });
});
