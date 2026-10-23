/*
 * Keşif görünümü × tutucular (gerçek three, GL yok): karakter, birinci şahıs kol ve sırt jetpack'i skin kümesini canlı uygular;
 * aynı küme ikinci kez modeli yeniden kurmaz; null varsayılan renkleri BİREBİR geri getirir; atılan modeller sızdırmaz.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ITEM_LIST } from '../sim/items.js';
import { itemSpec } from './itemPalette.js';
import { createCharacter } from './character.js';
import { createFirstPerson } from './firstPerson.js';
import { createBackpack } from './techBackpack.js';
import { resolveSkinSet } from './skins.js';
import { disposeHeldItemCache } from './heldItems.js';
import { defaultAvatar } from '../../avatar/catalog.js';

const keyOf = (kind) => ITEM_LIST.find((i) => itemSpec(i).kind === kind).key;
const colors = (m) => { const c = []; m.traverse((o) => { if (o.isMesh && o.material.color) c.push(o.material.color.getHex()); }); return c; };
const SET = resolveSkinSet({ portal: 'portal:neon-sokak', alet: 'alet:neon-serit', asa: 'asa:gokkusagi-isigi', jet: 'jet:altin-kivilcim' }, { tier: 'high' });
const SET_LOW = resolveSkinSet({ portal: 'portal:neon-sokak', alet: 'alet:neon-serit', asa: 'asa:gokkusagi-isigi', jet: 'jet:altin-kivilcim' }, { tier: 'low' });

describe('character.setSkins', () => {
  it('elde tutulan eşya yeniden kurulur ve skin\'lenir; aynı küme tekrar → aynı model; null → varsayılan renkler BİREBİR', () => {
    const ch = createCharacter(defaultAvatar('male'), { detail: 'low' });
    ['portalgun', 'pick', 'staff', 'jetpack'].forEach((kind) => {
      ch.setHeld(keyOf(kind));
      const base = colors(ch.held);
      const m0 = ch.held;
      ch.setSkins(SET);
      expect(ch.held, kind).not.toBe(m0);
      expect(ch.held.userData.skinKey, kind).not.toBe('');
      expect(colors(ch.held), kind).not.toEqual(base);
      const m1 = ch.held;
      ch.setSkins(SET); // aynı anahtar → yeniden kurma yok
      expect(ch.held).toBe(m1);
      ch.setSkins(SET_LOW); // anim değişti → yeniden kurulur
      expect(ch.held).not.toBe(m1);
      ch.setSkins(null);
      expect(ch.held.userData.skinKey).toBe('');
      expect(colors(ch.held), kind).toEqual(base);
      ch.setSkins(null); // zaten varsayılan
    });
    // eşya değişince yeni eşya da skin'li gelir
    ch.setSkins(SET);
    ch.setHeld(keyOf('shovel'));
    expect(ch.held.userData.skinKey).not.toBe('');
    // elde eşya yokken skin değiştirmek hata vermez
    ch.setHeld(null);
    expect(() => ch.setSkins(null)).not.toThrow();
    expect(() => ch.setSkins(SET)).not.toThrow();
    ch.dispose();
    expect(() => ch.setSkins(null)).not.toThrow();
    disposeHeldItemCache();
  });
});

describe('firstPerson.setSkins', () => {
  it('birinci şahıs eşyası skin\'lenir; ton döngüsü kapalı (viewmodel malzemeleri klonlanır); null geri alır', () => {
    const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 100);
    const fp = createFirstPerson(THREE, cam, { avatarConfig: defaultAvatar('male') });
    fp.setHeld(keyOf('staff'));
    const base = colors(fp.held);
    fp.setSkins(SET);
    expect(fp.held.userData.skinKey).not.toBe('');
    expect(fp.held.userData.skinKey).not.toContain('+a');
    expect((fp.held.userData.owned || []).length).toBe(0); // klon yok: viewmodel zaten kendi klonunu kullanır
    const m = fp.held;
    fp.setSkins(SET_LOW); // fp için anim zaten kapalı → aynı anahtar → yeniden kurma yok
    expect(fp.held).toBe(m);
    fp.setSkins(null);
    expect(fp.held.userData.skinKey).toBe('');
    expect(colors(fp.held)).toEqual(base);
    fp.dispose();
    disposeHeldItemCache();
  });
});

describe('techBackpack.setSkins', () => {
  it('jetpack modeli skin\'lenir; G.cosmetics kurulurken okunur; null geri alır', () => {
    const ch = createCharacter(defaultAvatar('male'), { detail: 'low' });
    const G = { character: ch, cosmetics: { skins: SET } };
    const bp = createBackpack(THREE, G);
    bp.update(true, false, 0);
    const chest = ch.rig.chest;
    const find = () => chest.children.find((o) => o.name === 'held:jetpack');
    expect(find().userData.skinKey).not.toBe('');
    const base = (() => { const b2 = createBackpack(THREE, { character: ch, cosmetics: null }); b2.update(true, false, 0); const cs = colors(chest.children[chest.children.length - 1]); b2.dispose(); return cs; })();
    expect(base).not.toEqual(colors(find()));
    bp.setSkins(null);
    expect(find().userData.skinKey).toBe('');
    expect(find().visible).toBe(true);
    expect(colors(find())).toEqual(base);
    bp.setSkins(SET);
    expect(find().userData.skinKey).not.toBe('');
    bp.dispose();
    ch.dispose();
    disposeHeldItemCache();
  });
});
