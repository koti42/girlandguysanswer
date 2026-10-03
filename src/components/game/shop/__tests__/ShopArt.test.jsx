// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ShopArt from '../ShopArt';
import { FRAMES, MINIS, TITLES, getDesign } from '../../../../game/shop';

/*
 * F.2 çizici: id önekleme, url(#) yeniden yazma, iki örneğin çakışmaması,
 * animasyon sınıfları, beyaz liste, bilinmeyen anahtar.
 */

const firstWithDefs = FRAMES.find((f) => f.art.defs?.length) || MINIS.find((m) => m.art.defs?.length);

function hasAnim(nodes, anim) {
    return (nodes || []).some((n) => n.anim === anim || hasAnim(n.children, anim));
}

describe('ShopArt', () => {
    it('defs id’lerini önekler ve url(#id) başvurularını aynı önekle yeniden yazar', () => {
        const { container } = render(<ShopArt itemKey={firstWithDefs.id} />);
        const svg = container.querySelector('svg');
        const origIds = firstWithDefs.art.defs.map((d) => d.id);
        const ids = [...svg.querySelectorAll('linearGradient, radialGradient')].map((g) => g.id);
        expect(ids).toHaveLength(origIds.length);
        ids.forEach((id, i) => {
            expect(id).not.toBe(origIds[i]);
            expect(id.endsWith(origIds[i])).toBe(true);
            expect(id).toMatch(/^sa[A-Za-z0-9_-]+-/);
        });
        const refs = [...svg.querySelectorAll('[fill^="url("], [stroke^="url("]')]
            .flatMap((el) => [el.getAttribute('fill'), el.getAttribute('stroke')])
            .filter((v) => v && v.startsWith('url('));
        expect(refs.length).toBeGreaterThan(0);
        for (const ref of refs) {
            const id = ref.slice(5, -1);
            expect(ids).toContain(id); // her başvuru bu örneğin kendi gradyanına gider
        }
    });

    it('aynı tasarımın iki örneği farklı id kullanır (çakışma yok)', () => {
        const { container } = render(
            <>
                <ShopArt itemKey={firstWithDefs.id} />
                <ShopArt itemKey={firstWithDefs.id} />
            </>
        );
        const [a, b] = container.querySelectorAll('svg');
        const idsA = [...a.querySelectorAll('[id]')].map((e) => e.id);
        const idsB = [...b.querySelectorAll('[id]')].map((e) => e.id);
        expect(idsA.length).toBeGreaterThan(0);
        expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);
        expect(new Set([...container.querySelectorAll('[id]')].map((e) => e.id)).size).toBe(idsA.length + idsB.length);
    });

    it('anim alanını CSS animasyon sınıfına çevirir; twinkle grupları gecikmeli', () => {
        const spinFrame = FRAMES.find((f) => hasAnim(f.art.elements, 'spin'));
        const { container } = render(<ShopArt itemKey={spinFrame.id} />);
        expect(container.querySelector('.shop-anim.shop-anim-spin')).not.toBeNull();
        const tw = [...container.querySelectorAll('.shop-anim-twinkle')];
        if (tw.length > 1) {
            expect(tw[0].style.animationDelay).not.toBe(tw[1].style.animationDelay);
        }
        // animasyonlu öğede transform yok
        container.querySelectorAll('.shop-anim').forEach((g) => expect(g.getAttribute('transform')).toBeNull());

        const floatMini = MINIS.find((m) => hasAnim(m.art.elements, 'float'));
        const r2 = render(<ShopArt itemKey={floatMini.id} />);
        expect(r2.container.querySelector('.shop-anim-float')).not.toBeNull();
    });

    it('animate={false} statik sınıf ekler (CSS animasyonu kapatır)', () => {
        const { container } = render(<ShopArt itemKey={FRAMES[0].id} animate={false} />);
        expect(container.querySelector('svg')).toHaveClass('shop-art-static');
    });

    it('bilinmeyen anahtar / ikon hiçbir şey çizmez', () => {
        const { container } = render(
            <>
                <ShopArt itemKey="frame:yok-boyle-bir-sey" />
                <ShopArt icon="yok" />
                <ShopArt itemKey={null} />
                <ShopArt itemKey={TITLES[0].id} />
            </>
        );
        // unvanın `art`ı yok (pill olarak çizilir) → ShopArt boş
        expect(container.querySelector('svg')).toBeNull();
    });

    it('beyaz liste dışındaki etiket/prop ve yerel olmayan url(...) DOM’a ulaşmaz', () => {
        const design = {
            art: {
                viewBox: '0 0 64 64',
                defs: [
                    { tag: 'linearGradient', id: 'g', props: { x1: 0, y1: 0, x2: 1, y2: 1, href: 'javascript:alert(1)' }, stops: [{ offset: 0, color: '#fff' }] },
                    { tag: 'filter', id: 'f', props: {}, stops: [] },
                    { tag: 'radialGradient', id: 'bad id"', props: {}, stops: [] },
                ],
                elements: [
                    { tag: 'circle', props: { cx: 10, cy: 10, r: 5, fill: 'url(#g)', onClick: 'x', href: 'javascript:alert(1)', style: 'color:red' } },
                    { tag: 'rect', props: { x: 0, y: 0, width: 5, height: 5, fill: 'url(https://evil.example/x.svg#a)' } },
                    { tag: 'script', props: {}, children: [] },
                    { tag: 'image', props: { href: 'https://evil.example/a.png' } },
                    { tag: 'g', props: { transform: 'rotate(10 32 32)' }, anim: 'spin', children: [{ tag: 'path', props: { d: 'M0 0L1 1' } }] },
                ],
            },
        };
        const { container } = render(<ShopArt design={design} label="Deneme" />);
        const svg = container.querySelector('svg');
        expect(screen.getByRole('img', { name: 'Deneme' })).toBe(svg);
        expect(svg.querySelector('script, image, filter')).toBeNull();
        expect(svg.querySelectorAll('radialGradient')).toHaveLength(0);
        const circle = svg.querySelector('circle');
        expect(circle.getAttribute('href')).toBeNull();
        expect(circle.getAttribute('onclick')).toBeNull();
        expect(circle.getAttribute('style')).toBeNull();
        expect(circle.getAttribute('fill')).toMatch(/^url\(#sa.+-g\)$/);
        expect(svg.querySelector('linearGradient').getAttribute('href')).toBeNull();
        expect(svg.querySelector('rect').getAttribute('fill')).toBeNull();
        const g = svg.querySelector('g.shop-anim-spin');
        expect(g.getAttribute('transform')).toBeNull();
    });

    it('tüketilebilir tasarım (Mesaj Bileti) ICONS üzerinden çizilir', () => {
        expect(getDesign('ticket:message')).not.toBeNull();
        const { container } = render(<ShopArt itemKey="ticket:message" />);
        expect(container.querySelector('svg')).not.toBeNull();
    });
});
