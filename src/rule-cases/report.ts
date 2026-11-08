// The rule case report: one self-contained HTML page (inline CSS and JavaScript, no requests) that shows
// what the last run of the rule cases found. A pure function; it knows nothing of the app's UI.
import { DAYS, MEALS } from '@/planner';
import { defaultRules, describeSpec, parseSpec } from '@/rules';
import type { CaseGroup, CaseLibrary, CaseResult, CaseStatus } from './types';

const GROUPS: CaseGroup[] = ['Pairings', 'Days and meals', 'Variety', 'Locks and picks', 'Extras'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MEAL_LABELS = ['B', 'L', 'D'];

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const markOf = (s: CaseStatus): string => (s === 'pass' ? '✅' : s === 'known' ? '⚠️' : '❌');
const labelOf = (s: CaseStatus): string =>
  ({ pass: 'Passed', fail: 'Failed', known: 'Known issue', 'known-now-passes': 'Known issue now passes' })[s];
const slug = (id: string): string => id.replace(/[^A-Za-z0-9_-]/g, '-');

function panel(r: CaseResult, selected: boolean): string {
  const rules = r.rules.map((x) => `<li>${esc(x)}</li>`).join('') + (r.defaults ? '<li class="muted">+ the default rules (see Test library)</li>' : '');
  const dishes = r.dishes.length
    ? r.dishes.map((d) => `<strong>${esc(d.name)}</strong> (${esc(d.type)})`).join(', ')
    : null;
  const exp = r.expectations
    .map((e) => `<tr><td>${e.pass ? '✅' : '❌'}</td><td>${esc(e.says)}</td><td class="muted">${esc(e.got)}</td></tr>`)
    .join('');
  let grid = '';
  if (r.sampleWeek && r.sampleWeek.length) {
    const cell = (d: number, m: number): string => {
      const c = r.sampleWeek!.find((x) => x.slot.day === DAYS[d] && x.slot.meal_slot === MEALS[m]);
      return `<td${c?.highlight ? ' class="hl"' : ''}>${c ? esc(c.text) : ''}</td>`;
    };
    grid = `<div class="label">Sample week (seed ${r.sampleSeed}${r.sampleSeed === 1 ? '' : ', the first seed that fails'})</div><table class="grid"><tr><th></th>${DAY_LABELS.map((d) => `<th>${d}</th>`).join('')}</tr>${MEAL_LABELS.map(
      (ml, m) => `<tr><th>${ml}</th>${DAY_LABELS.map((_, d) => cell(d, m)).join('')}</tr>`,
    ).join('')}</table>`;
  }
  return `<section class="panel${selected ? '' : ' hidden'}" id="p-${slug(r.id)}">
<h2>${esc(r.name)} ${markOf(r.status)} <span class="status ${r.status}">${labelOf(r.status)}</span></h2>
<div class="muted">Why: ${esc(r.why)}</div>
${r.known ? `<div class="known"><strong>Known issue:</strong> ${esc(r.known)}</div>` : ''}
<div class="label">Dishes</div><div>${dishes ? `Shared test library · this case uses ${dishes}` : 'No dishes of its own; uses the test library'}</div>
<div class="label">Rules</div><ul>${rules}</ul>
<div class="label">Expected → got (8 weeks, seeds 1–8)</div><table class="exp">${exp}</table>
${grid}
</section>`;
}

function libraryPanel(lib: CaseLibrary): string {
  const catName = new Map(lib.categories.map((k) => [k.id, k.name]));
  const rows = lib.dishes
    .map((d) => {
      const cat =
        d.componentType === 'base' ? catName.get(d.base_category_id ?? -1)
        : d.componentType === 'extra' ? catName.get(d.extra_category_id ?? -1)
        : d.componentType === 'curry' ? d.curry_category
        : '';
      return `<tr><td>${esc(d.name)}</td><td>${esc(d.componentType)}</td><td>${esc(cat ?? '')}</td></tr>`;
    })
    .join('');
  const names = { component: () => undefined, baseCategory: () => undefined, extraCategory: () => undefined };
  const defaults = defaultRules()
    .map((r) => {
      const parsed = parseSpec(r.spec);
      return `<li>${esc(parsed.ok ? describeSpec(parsed.spec, names) : r.name)}</li>`;
    })
    .join('');
  return `<section class="panel hidden" id="p-library"><h2>Test library</h2>
<div class="muted">The shared test dishes (${lib.dishes.length}). A case adds its own on top.</div>
<table class="exp"><tr><th>Dish</th><th>Type</th><th>Category</th></tr>${rows}</table>
<div class="label">Default rules</div>
<div class="muted">Planned with every case unless it says otherwise.</div><ul>${defaults}</ul></section>`;
}

const CSS = `
:root{--bg:#fff;--fg:#1c1c1e;--muted:#6b6b70;--line:#ddd;--hl:#dde4ff;--known:#fff4d6;--knownfg:#8a5a00;--bad:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#161618;--fg:#e8e8ea;--muted:#9a9aa0;--line:#38383c;--hl:#2c3560;--known:#3d3416;--knownfg:#f2c35b;--bad:#ff8a80}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}
header{padding:10px 16px;border-bottom:1px solid var(--line)}
main{display:flex;gap:16px;padding:12px 16px}
nav{width:30%;min-width:220px;border-right:1px solid var(--line);padding-right:10px}
nav input[type=text]{width:100%;box-sizing:border-box;padding:4px;background:var(--bg);color:var(--fg);border:1px solid var(--line)}
nav a{display:block;cursor:pointer;padding:1px 0;color:inherit}nav a.sel{font-weight:600;text-decoration:underline}
nav h3{margin:10px 0 2px;font-size:14px}
article{flex:1;min-width:0}
.hidden{display:none}.muted{color:var(--muted)}
.label{margin-top:12px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.known{margin:6px 0;padding:6px 8px;background:var(--known)}
.status.fail,.status.known-now-passes{color:var(--bad)}
.status.known,nav a.known{color:var(--knownfg)}
table{border-collapse:collapse;width:100%}td,th{padding:2px 6px;text-align:left;vertical-align:top}
.exp{font-size:12px}.grid{font-size:11px}.grid td,.grid th{border:1px solid var(--line)}
.grid td.hl{background:var(--hl)}
ul{margin:2px 0 0 18px;padding:0}
`;

const JS = `
(function(){
  var links=[].slice.call(document.querySelectorAll('nav a[data-p]'));
  function show(id){
    [].forEach.call(document.querySelectorAll('.panel'),function(p){p.classList.toggle('hidden',p.id!==id)});
    links.forEach(function(a){a.classList.toggle('sel',a.getAttribute('data-p')===id)});
  }
  links.forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();show(a.getAttribute('data-p'))})});
  var q=document.getElementById('q'),f=document.getElementById('failing');
  function filter(){
    var t=q.value.toLowerCase();
    links.forEach(function(a){
      if(a.getAttribute('data-p')==='p-library')return;
      var ok=a.textContent.toLowerCase().indexOf(t)>=0&&(!f.checked||a.getAttribute('data-bad')==='1');
      a.classList.toggle('hidden',!ok);
    });
    [].forEach.call(document.querySelectorAll('nav h3[data-g]'),function(h){
      var any=links.some(function(a){return a.getAttribute('data-g')===h.getAttribute('data-g')&&!a.classList.contains('hidden')});
      h.classList.toggle('hidden',!any);
    });
  }
  q.addEventListener('input',filter);f.addEventListener('change',filter);
})();
`;

export function renderReport(results: CaseResult[], lib: CaseLibrary, runAt: Date): string {
  const ids = new Set(results.map((r) => slug(r.id)));
  if (ids.size !== results.length) throw new Error('Rule case ids must be unique');
  const count = (pred: (s: CaseStatus) => boolean): number => results.filter((r) => pred(r.status)).length;
  const passed = count((s) => s === 'pass');
  const failed = count((s) => s === 'fail' || s === 'known-now-passes');
  const known = count((s) => s === 'known');
  const ordered = GROUPS.flatMap((g) => results.filter((r) => r.group === g));
  const selected = (results.find((r) => r.status === 'fail' || r.status === 'known-now-passes') ?? ordered[0])?.id;

  const nav = GROUPS.map((g) => {
    const rs = results.filter((r) => r.group === g);
    if (!rs.length) return '';
    return `<h3 data-g="${esc(g)}">${esc(g)}</h3>` + rs
      .map((r) => `<a data-p="p-${slug(r.id)}" data-g="${esc(g)}" data-bad="${r.status === 'pass' ? 0 : 1}" href="#p-${slug(r.id)}" class="${[r.id === selected ? 'sel' : '', r.status === 'known' ? 'known' : ''].filter(Boolean).join(' ')}">${markOf(r.status)} ${esc(r.name)}</a>`)
      .join('');
  }).join('');

  const when = runAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rule case report</title><style>${CSS}</style></head><body>
<header><strong>Rule case report</strong> · run ${esc(when)} · ${passed} passed · ${failed} failed · ${known} known</header>
<main><nav><input type="text" id="q" placeholder="Filter cases"><br><label><input type="checkbox" id="failing"> Problems only</label>
${nav}
<h3>Test library</h3><a data-p="p-library" href="#p-library">Test library (shared, ${lib.dishes.length} dishes)</a></nav>
<article>${results.map((r) => panel(r, r.id === selected)).join('\n')}
${libraryPanel(lib)}</article></main>
<script>${JS}</script></body></html>`;
}
