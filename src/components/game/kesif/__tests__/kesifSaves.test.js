// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { loadLocalSaves } from '../kesifSaves';
import { createBestAdapter, saveToSlot } from '../../../../game/kesif/sim/saveStorage.js';
import { serializeGame } from '../../../../game/kesif/sim/save.js';
import { mergeSaves, entryForSave } from '../kesifUtils';

describe('loadLocalSaves', () => {
    it('boş depoda boş liste, hata atmaz', async () => {
        await expect(loadLocalSaves()).resolves.toEqual([]);
    });

    it('sim kayıt deposundaki macera kaydını lobi biçimine çevirir; Devam girişi slot adını taşır', async () => {
        const adapter = createBestAdapter();
        const save = serializeGame({ mode: 'macera', seed: 'ABCD1234', name: 'Ormanım', playTime: 90, savedAt: Date.now() });
        const r = await saveToSlot(adapter, 'otomatik', save);
        expect(r.ok).toBe(true);
        const list = await loadLocalSaves();
        expect(list.length).toBe(1);
        expect(list[0]).toMatchObject({ id: 'otomatik', name: 'Ormanım', mode: 'macera' });
        const [s] = mergeSaves(list, null);
        expect(s).toMatchObject({ id: 'otomatik', name: 'Ormanım', source: 'local' });
        expect(entryForSave(s)).toMatchObject({ mode: 'macera', saveId: 'otomatik' });
    });
});
