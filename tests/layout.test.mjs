import assert from 'node:assert/strict';
import { test } from 'node:test';
import { breakpointsOf, DEFAULT_BREAKPOINTS, htmlAttributes, layoutCss, layoutIssues, shapeOf } from '../src/core/layout.mjs';

const lang = (layout) => ({ code: 'ar', layout: { contentWidth: '74rem', measure: '40rem', ...layout } });

test('a language that says nothing gets no layout CSS and the default page shape', () => {
  assert.equal(layoutCss(lang({})), '');
  assert.deepEqual(shapeOf({}), { cards: 'outlined', header: 'classic', footer: 'columns', nav: 'underline', sticky: 'on' });
  assert.equal(htmlAttributes({}), 'data-header="classic" data-footer="columns" data-nav="underline" data-sticky="on"');
  assert.deepEqual(breakpointsOf({}), DEFAULT_BREAKPOINTS);
});

test('page shape choices are validated against the allowed lists', () => {
  assert.equal(shapeOf({ header: 'centered', footer: 'minimal', nav: 'pill', stickyHeader: false }).sticky, 'off');
  assert.equal(shapeOf({ header: 'sideways' }).header, 'classic', 'an unknown value falls back to the default');
});

test('desktop, tablet and mobile settings become base rules and max-width blocks, later rules winning', () => {
  const css = layoutCss(lang({
    breakpoints: { tablet: 900, mobile: 600 },
    devices: { desktop: { columns: 3, gap: '2rem' }, tablet: { columns: 2, sectionSpacing: '3rem' }, mobile: { columns: 1, pagePadding: '1rem' } },
  }));
  const at = (s) => css.indexOf(s);
  assert.ok(css.includes('html[lang="ar"] .grid{grid-template-columns:repeat(3,minmax(0,1fr));}'));
  assert.ok(css.includes('html[lang="ar"] .grid,html[lang="ar"] .stack{gap:2rem;}'));
  assert.ok(css.includes('@media (max-width:900px){html[lang="ar"]{--section-space:3rem;}html[lang="ar"] .grid{grid-template-columns:repeat(2,minmax(0,1fr));}}'));
  assert.ok(css.includes('@media (max-width:600px){html[lang="ar"]{--gutter:1rem;}html[lang="ar"] .grid{grid-template-columns:repeat(1,minmax(0,1fr));}}'));
  assert.ok(at('repeat(3') < at('max-width:900px') && at('max-width:900px') < at('max-width:600px'));
});

test('card styles', () => {
  assert.match(layoutCss(lang({ cards: 'flat' })), /\.card\{background:transparent;border-color:transparent;\}/);
  assert.match(layoutCss(lang({ cards: 'elevated' })), /box-shadow:var\(--card-shadow,/);
  assert.equal(layoutCss(lang({ cards: 'outlined' })), '');
});

test('values that are not plain CSS lengths or sane column counts are ignored, never written into the stylesheet', () => {
  const css = layoutCss(lang({ devices: { desktop: { columns: 9, gap: '1rem; background:url(x)', sectionSpacing: 'calc(1px)', pagePadding: 'red' } } }));
  assert.equal(css, '');
  assert.equal(layoutCss(lang({ devices: { desktop: { columns: 2.5 } } })), '');
});

test('layoutIssues: breakpoint order is an error; odd sizes are warnings', () => {
  assert.equal(layoutIssues({ breakpoints: { tablet: 600, mobile: 700 } })[0].level, 'error');
  assert.equal(layoutIssues({ breakpoints: { tablet: 640, mobile: 640 } }).length, 1);
  assert.deepEqual(layoutIssues({ contentWidth: '74rem', measure: '40rem' }), []);
  assert.equal(layoutIssues({ contentWidth: '30rem', measure: '40rem' })[0].level, 'warning');
  assert.equal(layoutIssues({ devices: { desktop: { sectionSpacing: '20rem' } } }).length, 1);
  assert.equal(layoutIssues({ devices: { mobile: { pagePadding: '4rem' } } }).length, 1);
  assert.equal(layoutIssues({ devices: { desktop: { pagePadding: '4rem' } } }).length, 0, 'wide padding is fine on a desktop');
});

import { isLength, setLayoutValue } from '../src/core/layout.mjs';

test('setLayoutValue sets nested values, prunes empty groups, and never removes the required keys', () => {
  const base = { contentWidth: '74rem', measure: '40rem' };
  const a = setLayoutValue(base, ['devices', 'tablet', 'columns'], 2);
  assert.deepEqual(a.devices, { tablet: { columns: 2 } });
  assert.deepEqual(base, { contentWidth: '74rem', measure: '40rem' }, 'the input is not modified');
  const b = setLayoutValue(a, ['devices', 'tablet', 'columns'], '');
  assert.equal(b.devices, undefined, 'an emptied group disappears');
  assert.deepEqual(setLayoutValue(base, ['devices', 'mobile', 'gap'], null), base, 'removing something that is not there changes nothing');
  assert.deepEqual(setLayoutValue(base, ['contentWidth'], ''), base);
  assert.equal(setLayoutValue(base, ['contentWidth'], '80rem').contentWidth, '80rem');
  const c = setLayoutValue(setLayoutValue(base, ['breakpoints', 'tablet'], 900), ['breakpoints', 'mobile'], 560);
  assert.deepEqual(c.breakpoints, { tablet: 900, mobile: 560 });
  assert.equal(setLayoutValue(c, ['breakpoints', 'tablet'], null).breakpoints.mobile, 560, 'a sibling stays');
  assert.equal(setLayoutValue(base, ['header'], 'centered').header, 'centered');
});

test('isLength accepts exactly what the schema accepts', () => {
  for (const ok of ['1rem', '0.5em', '72rem', '18px', '60ch', '90vw', '50%']) assert.ok(isLength(ok), ok);
  for (const bad of ['', 'rem', '1', '1 rem', 'calc(1px)', '-1rem', '1rem;', 'red']) assert.equal(isLength(bad), false, bad);
});
