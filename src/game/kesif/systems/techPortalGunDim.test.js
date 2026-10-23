/*
 * qa_p1 G5: Portal Tabancası boyut değişince YENİ boyutun TechState'ine yazar (G.tech = ctx.tech; tech sistemi onDimension'da T.tech'i yeniler).
 * Önceden techPortalGun TechState'i oluşturulurken önbelleğe alıyordu: şehirde açılan portallar ana diyarın TechState'ine yazılır, şehir G.tech'inde görünmez,
 * ana diyara dönünce hayalet portallar çıkardı.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createTech } from '../sim/tech.js';
import { PORTAL_GUN_ITEM } from '../sim/techData.js';
import { chargeInventory } from '../sim/techCharge.js';
import { B, makeTechG } from './techGameTestKit.js';

const GROUND = 40;

describe('portal tabancası + boyut değişimi', () => {
  it('boyut değişince portallar yeni G.tech üzerine kurulur, eski TechState temiz kalır', () => {
    const k = makeTechG();
    const G = k.G;
    G.grantAbility && G.grantAbility('portalGun');
    G.abilities.portalGun = true;
    G.inventory.add(PORTAL_GUN_ITEM, 1);
    chargeInventory(G.inventory, 1000);
    for (let y = GROUND + 1; y <= GROUND + 3; y++) for (let z = 7; z <= 11; z++) k.place(14, y, z, B.STONE);
    const oldTech = G.tech;
    // boyut değişimi: yeni TechState + tech sisteminin onDimension kancası
    const next = createTech(G.seed);
    G.tech = next;
    k.sys.onDimension(G, {}, {});
    k.moveTo(8.5, GROUND + 1, 9.5);
    // slot: tabanca ele
    for (let i = 0; i < G.inventory.slots.length; i++) if (G.inventory.slots[i] && G.inventory.slots[i].item === PORTAL_GUN_ITEM) G.inventory.selected = i < 9 ? i : 0;
    const ok = G.techPortalShoot('mavi', {
      x: 14, y: GROUND + 1, z: 9, face: { nx: -1, ny: 0, nz: 0 },
    });
    expect(ok).toBe(true);
    expect(next.portals.mavi).toBeTruthy();
    expect(oldTech.portals.mavi).toBeFalsy();
  });
});

describe('TechState önbellek denetimi (statik)', () => {
  it('systems/tech*.js: create… fabrikalarının başında TechState (G.tech / T.tech) yerel değişkene ÖNBELLEKLENMEZ (boyut değişince bayat kalırdı)', () => {
    const dir = new URL('.', import.meta.url);
    const bad = [];
    readdirSync(dir).filter((f) => /^tech.*\.js$/.test(f) && !/\.test\.js$/.test(f) && !/TestKit/.test(f)).forEach((f) => {
      const lines = readFileSync(new URL(f, dir), 'utf8').split(/\r?\n/);
      let fn = null;
      lines.forEach((ln, i) => {
        const m = /^(?:export )?function (\w+)\(/.exec(ln);
        if (m) fn = m[1];
        if (fn && /^create/.test(fn) && /^ {2}(?:const|let) \w+ = (?:T|G)\.tech;\s*$/.test(ln)) bad.push(f + ':' + (i + 1) + ' ' + ln.trim());
      });
    });
    expect(bad).toEqual([]);
  });
});
