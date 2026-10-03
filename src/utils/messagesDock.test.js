import { describe, expect, it } from 'vitest';
import { isDockHiddenPath } from './messagesDock';

describe('isDockHiddenPath', () => {
    it('mesajlar, yönetim ve moderasyon panellerinde dock gizlenir', () => {
        for (const p of ['/messages', '/messages/ayse', '/cpl-manage', '/cpl-manage/game', '/mod', '/mod/reports']) {
            expect(isDockHiddenPath(p)).toBe(true);
        }
    });

    it('diğer sayfalarda dock görünür', () => {
        for (const p of ['/', '/questions', '/profile/ayse', '/oyun/magaza', '/models', '/moderation-rules', '/cpl-manager', '']) {
            expect(isDockHiddenPath(p)).toBe(false);
        }
    });
});
