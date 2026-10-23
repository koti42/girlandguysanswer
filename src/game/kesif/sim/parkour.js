/*
 * KEŞİF sim — parkurlar (saf). Üretici/doğrulayıcı: parkourBuild.js. Yerleşim: structuresParkour.js (hücre planı).
 *
 *   parkourCourse(seed, cell) → {id, tier, start, end, checkpoints, blocks(setBlock), build(W), platforms, …} | null
 *       cell: {ci,cj} | {cx,cz} | [ci,cj] | "parkur:ci,cj"  (64×64 hücre indeksi; yapı hücresi)
 *   parkourCoursesInRegion(seed, x0,z0,x1,z1) → [course]
 *   validateCourse(course), parkourDynamics(course,t), applyParkourDynamics(course,t,world), parkourFallReset(course,pos,lastCp)
 */
import { getState, planById, plansInRect } from './structuresLayout.js';

export {
  JUMP, PARKOUR_TIERS, applyParkourDynamics, gapBetween, makeCourse, makeFallbackCourse, makeFnWriter, maxJumpReach,
  parkourDynamics, parkourFallReset, segmentFloorY, validateCourse,
} from './parkourBuild.js';

function parseCell(cell) {
  if (typeof cell === 'string') {
    const m = /^(?:parkur:)?(-?\d+),(-?\d+)$/.exec(cell);
    return m ? { ci: Number(m[1]), cj: Number(m[2]) } : null;
  }
  if (Array.isArray(cell)) return { ci: cell[0] | 0, cj: cell[1] | 0 };
  if (cell && typeof cell === 'object') {
    if (cell.ci !== undefined) return { ci: cell.ci | 0, cj: cell.cj | 0 };
    if (cell.cx !== undefined) return { ci: cell.cx | 0, cj: (cell.cz !== undefined ? cell.cz : cell.cj) | 0 };
  }
  return null;
}

export function parkourCourse(seed, cell) {
  const c = parseCell(cell);
  if (!c) return null;
  const plan = planById(getState(seed), 'parkur:' + c.ci + ',' + c.cj);
  return plan && plan.course ? plan.course : null;
}

export function parkourCoursesInRegion(seed, x0, z0, x1, z1) {
  const S = getState(seed);
  return plansInRect(S, Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1))
    .filter((p) => p.course)
    .map((p) => p.course);
}
