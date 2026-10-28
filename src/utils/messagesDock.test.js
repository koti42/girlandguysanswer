import { describe, expect, it } from 'vitest';
import { isDockHiddenPath } from './messagesDock';

describe('isDockHiddenPath', () => {
    it('mesajlar, yönetim ve moderasyon panellerinde dock gizlenir', () => {
        for (const p of ['/messages', '/messages/ayse', '/cpl-manage', '/cpl-manage/game', '/mod', '/mod/reports']) {
            expect(isDockHiddenPath(p)).toBe(true);
        }
    });

    it('tam ekran oyun sahnelerinde dock gizlenir, lobilerde görünür', () => {
        for (const p of ['/oyun/protocol-zero/oyna', '/oyun/kule/oyna', '/oyun/kesif/oyna/']) expect(isDockHiddenPath(p)).toBe(true);
        for (const p of ['/oyun/protocol-zero', '/oyun/kule', '/oyun/oynayan']) expect(isDockHiddenPath(p)).toBe(false);
    });

    it('diğer sayfalarda dock görünür', () => {
        for (const p of ['/', '/questions', '/profile/ayse', '/oyun/magaza', '/models', '/moderation-rules', '/cpl-manager', '']) {
            expect(isDockHiddenPath(p)).toBe(false);
        }
    });
});
