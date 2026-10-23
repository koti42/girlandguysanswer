/*
 * Robot verisi (sim/city/ped/robotData.js) + mobTypes entegrasyonu: ASCII anahtarlar, aile dostu alanlar, ganimet tablosu, tavanlar, Kredi.
 */
import { describe, expect, it } from 'vitest';
import {
  ROBOT_CAPS, ROBOT_DEFS, ROBOT_INFO, ROBOT_KEYS, ROBOT_LAYERS, ROBOT_LAYER_WEIGHTS, ROBOT_LINES, ROBOT_SPAWN, isPushyKey, robotCapsFor, robotKredi,
  robotSpawnFor,
} from './robotData.js';
import {
  HOSTILE_KEYS, MOB_KEYS, MOB_TYPES, PASSIVE_KEYS, ROBOT_KEYS as TYPE_ROBOT_KEYS, ROBOT_TYPES, getMobType, isRobotKey, mobsForZone, normalizeMobKey,
} from '../../mobTypes.js';
import { itemByKey } from '../../items.js';
import { rollLoot } from '../../combat.js';
import { mulberry32 } from '../../rng.js';
import { scanText } from '../citySafeData.js';
import { ROBOT_NAMES } from '../cityNames.js';

describe('robot türleri', () => {
  it('altı tür, ASCII anahtar (^[0-9a-z]{1,10}$), cityNames.ROBOT_NAMES anahtarlarını kapsar', () => {
    expect(ROBOT_KEYS).toHaveLength(6);
    ROBOT_KEYS.forEach((k) => expect(k).toMatch(/^[0-9a-z]{1,10}$/));
    Object.keys(ROBOT_NAMES).forEach((k) => expect(ROBOT_KEYS).toContain(k));
    expect(Object.keys(ROBOT_DEFS).sort()).toEqual(ROBOT_KEYS.slice().sort());
    expect(TYPE_ROBOT_KEYS).toEqual(ROBOT_KEYS);
  });

  it('ana diyar tablosu değişmedi: MOB_KEYS = pasif + düşman + boss; robotlar MOB_TYPES/doğma bölgelerinde yok', () => {
    expect(MOB_KEYS).toHaveLength(PASSIVE_KEYS.length + HOSTILE_KEYS.length + 4);
    ROBOT_KEYS.forEach((k) => {
      expect(MOB_KEYS).not.toContain(k);
      expect(MOB_TYPES[k]).toBeUndefined();
      expect(ROBOT_TYPES[k]).toBeDefined();
    });
    for (let z = 0; z < 5; z++) {
      ROBOT_KEYS.forEach((k) => expect(mobsForZone(z).map((t) => t.key)).not.toContain(k));
    }
  });

  it('getMobType/normalizeMobKey/isRobotKey robotları çözer; bozuk girdi güvenli', () => {
    ROBOT_KEYS.forEach((k) => {
      expect(getMobType(k)).toBe(ROBOT_TYPES[k]);
      expect(normalizeMobKey(k)).toBe(k);
      expect(isRobotKey(k)).toBe(true);
    });
    expect(normalizeMobKey('Bekçi Robot')).toBe('bekcirobot');
    expect(normalizeMobKey('GÖZ DRONE')).toBe('gozdrone');
    expect(isRobotKey('golge')).toBe(false);
    expect(isRobotKey('__proto__')).toBe(false);
    expect(isRobotKey(null)).toBe(false);
  });

  it('aile dostu alanlar: hasar 0, düşman/boss değil, saldırı yok, kan yok; dost robotlar yaralanmaz', () => {
    ROBOT_KEYS.forEach((k) => {
      const t = ROBOT_TYPES[k];
      expect(t.damage).toBe(0);
      expect(t.hostile).toBe(false);
      expect(t.boss).toBe(false);
      expect(t.passive).toBe(true);
      expect(t.attack).toBeNull();
      expect(t.spawn).toBeNull();
      expect(t.family).toBe('robot');
      expect(t.robot.group === 'friendly' || t.robot.group === 'pushy').toBe(true);
      expect(t.robot.immune).toBe(t.robot.group === 'friendly');
      expect(Object.isFrozen(t)).toBe(true);
      expect(t.hitbox.w).toBeGreaterThan(0.3);
      expect(t.hp).toBeGreaterThan(0);
    });
    expect(ROBOT_TYPES.bekcirobot.hp).toBe(12);
    expect(ROBOT_TYPES.gozdrone.hp).toBe(6);
    expect(ROBOT_TYPES.hatabot.hp).toBe(4);
    expect(ROBOT_TYPES.gozdrone.movement).toBe('uç');
    expect(ROBOT_TYPES.yardimdron.movement).toBe('uç');
  });

  it('itici robotların uyarı süreleri 0,6–0,9 sn; itme ≤ 4 m/s; yavaşlama ≤ 0,9 sn', () => {
    ROBOT_KEYS.filter(isPushyKey).forEach((k) => {
      const R = ROBOT_TYPES[k].robot;
      expect(R.windup).toBeGreaterThanOrEqual(0.6);
      expect(R.windup).toBeLessThanOrEqual(0.9);
      expect(R.slow).toBeLessThanOrEqual(0.9);
      expect(R.cool).toBeGreaterThanOrEqual(3);
      expect((R.push || 0)).toBeLessThanOrEqual(4);
      expect(R.immune).toBe(false);
    });
    expect(ROBOT_TYPES.gozdrone.robot.windup).toBe(0.8);
    expect(ROBOT_TYPES.gozdrone.robot.push || 0).toBe(0);
  });

  it('ganimet: yalnız var olan eşyalar, bakır tel %50 / devre kartı %30 (itici robotlarda), dost robot ganimeti yok', () => {
    ROBOT_KEYS.forEach((k) => {
      ROBOT_TYPES[k].drops.forEach((d) => {
        expect(itemByKey(d.item), d.item).toBeTruthy();
        expect(d.min).toBeGreaterThanOrEqual(1);
        expect(d.max).toBeGreaterThanOrEqual(d.min);
        expect(d.chance).toBeGreaterThan(0);
        expect(d.chance).toBeLessThanOrEqual(1);
      });
    });
    ['bekcirobot', 'hatabot', 'gozdrone'].forEach((k) => {
      const d = ROBOT_TYPES[k].drops;
      expect(d.find((x) => x.item === 'item:bakır_tel').chance).toBe(0.5);
      expect(d.find((x) => x.item === 'item:devre_kartı').chance).toBe(0.3);
    });
    ['supurgebot', 'kuryebot', 'yardimdron'].forEach((k) => expect(ROBOT_TYPES[k].drops).toHaveLength(0));
  });

  it('rollLoot belirlenimci ve oranlar yaklaşık (bekçi: tel ~%50, kart ~%30)', () => {
    let tel = 0;
    let kart = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const l = rollLoot('bekcirobot', mulberry32(i + 1));
      if (l.some((x) => x.item === 'item:bakır_tel')) tel++;
      if (l.some((x) => x.item === 'item:devre_kartı')) kart++;
    }
    expect(tel / N).toBeGreaterThan(0.45);
    expect(tel / N).toBeLessThan(0.55);
    expect(kart / N).toBeGreaterThan(0.26);
    expect(kart / N).toBeLessThan(0.34);
    expect(rollLoot('hatabot', mulberry32(9))).toEqual(rollLoot('hatabot', mulberry32(9)));
  });
});

describe('metinler (Türkçe, güvenli)', () => {
  it('her robotun adı ve ipucu var; satırlar ≤ 60 karakter; yasak sözcük/marka taraması 0', () => {
    ROBOT_KEYS.forEach((k) => {
      expect(ROBOT_INFO[k].name.length).toBeGreaterThan(2);
      expect(ROBOT_INFO[k].hint.length).toBeGreaterThan(8);
      expect(ROBOT_TYPES[k].name).toBe(ROBOT_INFO[k].name);
      expect(scanText(ROBOT_INFO[k].name)).toEqual([]);
      expect(scanText(ROBOT_INFO[k].hint)).toEqual([]);
    });
    Object.keys(ROBOT_LINES).forEach((k) => {
      expect(ROBOT_LINES[k].length).toBeLessThanOrEqual(60);
      expect(scanText(ROBOT_LINES[k])).toEqual([]);
      expect(k).toMatch(/^(sweeper|courier|helper|guard|glitch|scanner):[a-z]+$/);
    });
    expect(ROBOT_NAMES.bekcirobot).toBe(ROBOT_INFO.bekcirobot.name);
    expect(ROBOT_NAMES.gozdrone).toBe(ROBOT_INFO.gozdrone.name);
    expect(ROBOT_NAMES.hatabot).toBe(ROBOT_INFO.hatabot.name);
  });
});

describe('tavanlar ve doğma ayarları', () => {
  it('kademe tavanları: yüksek 4/12, düşük 3/6 (itici); dost robotlar ayrı sınıf; monoton azalır', () => {
    expect(ROBOT_CAPS.high.pushyNear).toBe(4);
    expect(ROBOT_CAPS.high.pushyWorld).toBe(12);
    expect(ROBOT_CAPS.low.pushyNear).toBe(3);
    expect(ROBOT_CAPS.low.pushyWorld).toBe(6);
    ['pushyNear', 'pushyWorld', 'friendNear', 'friendWorld'].forEach((f) => {
      expect(ROBOT_CAPS.high[f]).toBeGreaterThanOrEqual(ROBOT_CAPS.medium[f]);
      expect(ROBOT_CAPS.medium[f]).toBeGreaterThanOrEqual(ROBOT_CAPS.low[f]);
    });
    expect(robotCapsFor('yok')).toBe(ROBOT_CAPS.medium);
    expect(robotCapsFor('high')).toBe(ROBOT_CAPS.high);
    expect(Object.isFrozen(ROBOT_CAPS.high)).toBe(true);
  });

  it('doğma ayarları: en az 22 blok, kademe düşükte menzil kısalır', () => {
    expect(ROBOT_SPAWN.minDist).toBeGreaterThanOrEqual(22);
    expect(robotSpawnFor('low').maxDist).toBeLessThan(ROBOT_SPAWN.maxDist);
    expect(robotSpawnFor('low').despawn).toBeLessThan(ROBOT_SPAWN.despawn);
    expect(robotSpawnFor('high')).toBe(ROBOT_SPAWN);
  });

  it('katman tabloları yalnız geçerli robot anahtarları içerir; ağırlıklar pozitif', () => {
    Object.keys(ROBOT_LAYERS).forEach((layer) => {
      expect(ROBOT_LAYERS[layer].length).toBeGreaterThan(2);
      ROBOT_LAYERS[layer].forEach(([key, w]) => {
        expect(ROBOT_KEYS).toContain(key);
        expect(w).toBeGreaterThan(0);
      });
    });
    expect(ROBOT_LAYER_WEIGHTS.map((x) => x[0]).sort()).toEqual(Object.keys(ROBOT_LAYERS).sort());
  });
});

describe('robotKredi', () => {
  it('aralık içinde, belirlenimci; dost robot 0', () => {
    for (const k of ['bekcirobot', 'hatabot', 'gozdrone']) {
      const R = ROBOT_TYPES[k].robot;
      for (let id = 1; id < 200; id++) {
        const v = robotKredi(ROBOT_TYPES[k], 77, id, 0);
        expect(v).toBeGreaterThanOrEqual(R.kredi[0]);
        expect(v).toBeLessThanOrEqual(R.kredi[1]);
        expect(robotKredi(ROBOT_TYPES[k], 77, id, 0)).toBe(v);
      }
    }
    ['supurgebot', 'kuryebot', 'yardimdron'].forEach((k) => expect(robotKredi(ROBOT_TYPES[k], 1, 1, 0)).toBe(0));
    expect(robotKredi(null, 1, 1, 0)).toBe(0);
  });

  it('art arda dağıtmada azalır (6 sonrası yarım, en az 2): Kredi çiftliği yok', () => {
    const d = ROBOT_TYPES.bekcirobot;
    let full = 0;
    let half = 0;
    for (let id = 1; id <= 100; id++) {
      full += robotKredi(d, 5, id, 0);
      half += robotKredi(d, 5, id, 9);
    }
    expect(half).toBeLessThan(full * 0.6);
    expect(robotKredi(d, 5, 1, 99)).toBeGreaterThanOrEqual(2);
  });

  it('farklı tohum/kimlik farklı değer verebilir (sabit değil)', () => {
    const set = new Set();
    for (let id = 1; id < 60; id++) set.add(robotKredi(ROBOT_TYPES.bekcirobot, 3, id, 0));
    expect(set.size).toBeGreaterThan(5);
  });
});
