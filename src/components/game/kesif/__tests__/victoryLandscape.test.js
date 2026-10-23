/*
 * Zafer ekranı alçak yatay ekranda sığar (CSS sözleşmesi). Gerçek GPU/dokunmatik ölçümü: 844×390 görünümde kart 446 px yüksekti,
 * "Keşfetmeye devam et" düğmesi görünümün altındaydı (y=396 > 390) ve dokunulamıyordu; düzeltmeden sonra kart 262 px, düğme y=267.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const src = fs.readFileSync(path.join(here, '..', 'kesifResponsive.css'), 'utf8').replace(/\r\n/g, '\n');

function landscapeBlock() {
  const i = src.indexOf('@media (max-height: 420px) and (orientation: landscape)');
  expect(i).toBeGreaterThanOrEqual(0);
  const open = src.indexOf('{', i);
  let depth = 1;
  let j = open + 1;
  while (j < src.length && depth > 0) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') depth--;
    j++;
  }
  return src.slice(open + 1, j - 1);
}

describe('zafer ekranı: alçak yatay ekran', () => {
  const body = landscapeBlock();
  it('taç gizlenir, başlık/istatistikler sıkılaşır', () => {
    expect(body).toMatch(/\.kx-victory \.kx-crown\s*\{\s*display:\s*none/);
    expect(body).toMatch(/\.kx-victory \.kx-h-win\s*\{[^}]*font-size:\s*1\.45rem/);
    expect(body).toMatch(/\.kx-victory \.kx-stats\s*\{[^}]*minmax\(5\.4rem/);
    expect(body).toMatch(/\.kx-victory \.kx-stat\s*\{[^}]*padding:\s*5px 4px/);
  });
  it('düğmeler kartın altında yapışık (alçak ekranda da erişilir)', () => {
    expect(body).toMatch(/\.kx-victory \.kx-stack\s*\{[^}]*position:\s*sticky[^}]*bottom:\s*0/);
  });
});
