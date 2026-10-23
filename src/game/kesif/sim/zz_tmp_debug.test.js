import { it } from 'vitest';
import { allStructures } from './structures.js';
import { DEBUG, clearLayoutCache } from './structuresLayout.js';
import { heightAt, legacySpawnPoint } from './worldgen.js';

it('dbg', () => {
  clearLayoutCache();
  DEBUG.on = true;
  DEBUG.reasons = {};
  const sd = 1989858;
  const all = allStructures(sd);
  console.log(all.filter((s) => s.zone === 0).map((s) => s.type + ':' + s.id).join(' | '));
  console.log(JSON.stringify(DEBUG.reasons));
  const sp = legacySpawnPoint(sd);
  console.log('spawn', sp.x, sp.z);
  // zone 0 heights ring
  const row = [];
  for (let a = 0; a < 16; a++) { const x = Math.round(Math.cos(a * 0.39) * 60); const z = Math.round(Math.sin(a * 0.39) * 60); row.push(heightAt(sd, x, z)); }
  console.log(row.join(','));
});
