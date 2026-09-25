// Landing walkthrough tests for the MahalleCoop static demo. Node, zero deps.
// Loads walkthrough-scenes.js through the same UMD entry the browser uses,
// then checks the frozen scene contract from site/SPEC.md.
import { readFileSync } from 'node:fs';

const scenesUrl = new URL('../js/walkthrough-scenes.js', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);
const engineTestUrl = new URL('./engine.test.mjs', import.meta.url);

let passed = 0;
let failed = 0;

function ok(cond, label) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error('FAIL: ' + label);
  }
}
function eq(got, want, label) {
  ok(
    Object.is(got, want),
    label + ' (got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want) + ')',
  );
}
function has(str, sub, label) {
  ok(String(str).indexOf(sub) !== -1, label + ' (missing ' + JSON.stringify(sub) + ')');
}

const DASH = /[\u2013\u2014]/;
const BANNED = [
  'delve',
  'unpack',
  'journey',
  'landscape',
  'tapestry',
  'blueprint',
  'toolkit',
  'robust',
  'leverage',
  'seamlessly',
  'elevate',
  'empower',
  'navigate',
];

const FROZEN_IDS = [
  'kvkk-gate',
  'menu-pages',
  'catalog-list',
  'command-add',
  'not-found',
  'tier-price',
  'cart-remove',
  'addons',
  'confirm-note',
  'payment-code',
  'delivery-notice',
  'suggest-demand',
  'vote-round',
  'convert-pano',
];

const REQUIRED_FEATURES = [
  'KVKK',
  'MENU',
  'CATALOG',
  'COMMAND',
  'NOT_FOUND',
  'TIER_PRICE',
  'CART',
  'ADDONS',
  'CONFIRM',
  'PAYMENT',
  'DELIVERY',
  'SUGGEST',
  'VOTE',
  'CONVERT_PANO',
];

/* Capture the engine suite's own "OK <n> asserts" line so the combined total
   printed on the landing page can be checked against reality below. */
let engineCount = null;
const realLog = console.log;
console.log = function () {
  const line = Array.prototype.join.call(arguments, ' ');
  const m = /^OK (\d+) asserts$/.exec(line);
  if (m) {
    engineCount = Number(m[1]);
    return;
  }
  realLog.apply(console, arguments);
};
try {
  await import(engineTestUrl.href);
} finally {
  console.log = realLog;
}
ok(Number.isInteger(engineCount) && engineCount > 0, 'engine suite reported its assert count');

const mod = await import(scenesUrl.href);
const MC_WALK = mod && mod.default && mod.default.scenes ? mod.default : globalThis.MC_WALK;
const scenes = (MC_WALK && MC_WALK.scenes) || [];
const html = readFileSync(indexUrl, 'utf8');

// ── 1. Module shape and frozen order ───────────────────────────────────
ok(MC_WALK && typeof MC_WALK === 'object', 'module exports an object');
ok(Array.isArray(MC_WALK && MC_WALK.scenes), 'scenes is an array');
eq(scenes.length, 14, 'scene count');
ok(scenes.length >= 14, 'scene count at least 14');

// ── 2. Per scene: ids, fields, messages, copy hygiene ──────────────────
const seenIds = new Set();
let messageCount = 0;
let buttonCount = 0;
let delayCount = 0;

scenes.forEach((scene, i) => {
  const where = 'scene ' + (i + 1);
  ok(scene && typeof scene === 'object', where + ' is an object');
  eq(scene.id, FROZEN_IDS[i], where + ' id is frozen and in order');
  ok(!seenIds.has(scene.id), where + ' id is unique');
  seenIds.add(scene.id);
  ok(typeof scene.feature === 'string' && scene.feature.length > 0, where + ' has feature');
  ok(typeof scene.title === 'string' && scene.title.length > 0, where + ' has title');
  ok(typeof scene.caption === 'string' && scene.caption.length > 0, where + ' has caption');
  ok(!DASH.test(scene.title), where + ' title has no em/en dash');
  ok(!DASH.test(scene.caption), where + ' caption has no em/en dash');
  ok(!/https?:\/\//.test(scene.title + scene.caption), where + ' has no external URL');
  ok(
    Array.isArray(scene.messages) && scene.messages.length > 0,
    where + ' has at least one message',
  );

  scene.messages.forEach((m, j) => {
    const at = where + ' message ' + (j + 1);
    messageCount += 1;
    ok(m && typeof m === 'object', at + ' is an object');
    ok(m.from === 'bot' || m.from === 'user', at + ' from is bot or user');
    ok(m.type === 'text' || m.type === 'buttons', at + ' type is text or buttons');
    ok(typeof m.text === 'string' && m.text.trim().length > 0, at + ' has text');
    ok(!DASH.test(m.text), at + ' text has no em/en dash');
    ok(!/https?:\/\//.test(m.text), at + ' text has no external URL');
    if (m.from === 'bot' && m.delay !== undefined) {
      delayCount += 1;
      ok(typeof m.delay === 'number' && m.delay > 0, at + ' delay is a positive number');
    } else if (m.from === 'user') {
      ok(m.delay === undefined, at + ' user message carries no delay');
    }
    if (m.type === 'buttons') {
      ok(Array.isArray(m.buttons) && m.buttons.length > 0, at + ' has buttons');
      (m.buttons || []).forEach((btn, k) => {
        buttonCount += 1;
        ok(btn && typeof btn.id === 'string' && btn.id.length > 0, at + ' button ' + k + ' has id');
        ok(
          typeof btn.label === 'string' && btn.label.length > 0,
          at + ' button ' + k + ' has label',
        );
        ok(!DASH.test(btn.label), at + ' button ' + k + ' has no em/en dash');
      });
    } else {
      ok(m.buttons === undefined, at + ' text message carries no buttons');
    }
  });
});

// ── 3. Feature coverage ────────────────────────────────────────────────
const covered = new Set(scenes.map((s) => s.feature));
REQUIRED_FEATURES.forEach((f) => ok(covered.has(f), 'feature covered: ' + f));
eq(covered.size, REQUIRED_FEATURES.length, 'no unlisted features');

// ── 4. Command strings from the frozen spec ────────────────────────────
const allCopy = scenes
  .map((s) =>
    [s.title, s.caption]
      .concat(s.messages.map((m) => m.text))
      .concat(s.messages.flatMap((m) => (m.buttons || []).map((b) => b.label)))
      .join('\n'),
  )
  .join('\n');

has(allCopy, '4 2', 'command "4 2" appears in scene copy');
has(allCopy, '-3', 'command "-3" appears in scene copy');
has(allCopy, '0 0 0', 'command "0 0 0" appears in scene copy');
has(
  scenes.find((s) => s.id === 'command-add').messages[0].text,
  '4 2',
  'command-add scene opens with "4 2"',
);
has(
  scenes.find((s) => s.id === 'cart-remove').messages.map((m) => m.text).join('\n'),
  '-3',
  'cart-remove scene issues "-3"',
);
has(
  scenes.find((s) => s.id === 'cart-remove').caption,
  '0 0 0',
  'cart-remove scene documents "0 0 0"',
);
ok(messageCount >= 40, 'scene copy is substantial (' + messageCount + ' messages)');
ok(buttonCount >= 30, 'reply buttons are covered (' + buttonCount + ' buttons)');
ok(delayCount >= 10, 'typing delays are used (' + delayCount + ' delayed bot messages)');

// ── 5. Writing bans in scene copy ──────────────────────────────────────
ok(!DASH.test(allCopy), 'scene copy has no em/en dashes');
BANNED.forEach((word) => {
  ok(!new RegExp('\\b' + word + '\\b', 'i').test(allCopy), 'banned word absent: ' + word);
});

// ── 6. index.html wiring ───────────────────────────────────────────────
has(html, 'js/walkthrough-scenes.js', 'index.html loads walkthrough-scenes.js');
ok(
  html.indexOf('js/walkthrough-scenes.js') < html.indexOf('js/walkthrough.js'),
  'scene data is placed before the player',
);
has(html, 'js/walkthrough.js', 'index.html loads walkthrough.js');
ok(
  html.indexOf('js/walkthrough-scenes.js') < html.indexOf('js/landing.js'),
  'walkthrough scripts are placed before landing.js',
);
ok(
  html.indexOf('js/walkthrough.js') < html.indexOf('js/landing.js'),
  'walkthrough player is placed before landing.js',
);

// ── 7. Count-churn: the landing copy carries a stable phrase, never a total
function readText(fileUrl, label) {
  try {
    return readFileSync(fileUrl, 'utf8');
  } catch (err) {
    ok(false, label + ' exists');
    return '';
  }
}

const STABLE_TOTAL = "1000'den fazla otomatik kontrol";
const STABLE_TOTALS = html.split(STABLE_TOTAL).length - 1;
eq(STABLE_TOTALS, 2, 'index.html states the stable control-count phrase twice');
ok(html.indexOf('1008 otomatik kontrol') === -1, 'index.html pins no exact control count');

// ── 8. Privacy hardening: noindex, no referrer, robots.txt, soft code gate
const demoHtml = readText(new URL('../demo.html', import.meta.url), 'demo.html');
const gateJs = readText(new URL('../js/access-gate.js', import.meta.url), 'js/access-gate.js');
const robotsTxt = readText(new URL('../robots.txt', import.meta.url), 'robots.txt');
const NOINDEX_META = '<meta name="robots" content="noindex, nofollow, noarchive">';
const NOREFERRER_META = '<meta name="referrer" content="no-referrer">';

has(html, NOINDEX_META, 'index.html carries the noindex meta');
has(demoHtml, NOINDEX_META, 'demo.html carries the noindex meta');
has(html, NOREFERRER_META, 'index.html carries the no-referrer meta');
has(demoHtml, NOREFERRER_META, 'demo.html carries the no-referrer meta');
has(robotsTxt, 'User-agent: *', 'robots.txt names every agent');
has(robotsTxt, 'Disallow: /', 'robots.txt disallows the whole site');
has(gateJs, 'var ACCESS_CODE', 'access-gate.js defines the ACCESS_CODE constant');
has(gateJs, 'mc_access', 'access-gate.js stores the pass in mc_access');
has(html, 'js/access-gate.js', 'index.html loads the access gate');
has(demoHtml, 'js/access-gate.js', 'demo.html loads the access gate');
ok(
  html.indexOf('js/landing.js') < html.indexOf('js/access-gate.js'),
  'index.html loads the gate after the walkthrough scripts',
);
ok(
  demoHtml.indexOf('js/portal.js') < demoHtml.indexOf('js/access-gate.js'),
  'demo.html loads the gate after the app scripts',
);

// ── 9. Animated tour player: machine-checkable hooks ──────────────────
const walkJs = readText(new URL('../js/walkthrough.js', import.meta.url), 'js/walkthrough.js');
const siteCss = readText(new URL('../css/site.css', import.meta.url), 'css/site.css');

const dotTags = html.match(/<button[^>]*class="walk-dot"[^>]*>/g) || [];
eq(dotTags.length, scenes.length, 'static dot count equals scene count');
eq(dotTags.length, 14, 'index.html renders 14 scene dots');
const dotIndexes = dotTags.map((tag) => Number(/data-scene="(\d+)"/.exec(tag)[1]));
eq(
  dotIndexes.join(','),
  scenes.map((_, i) => i).join(','),
  'dots carry data-scene indices 0..13 in order',
);
has(html, 'data-scene-count="14"', 'player root declares data-scene-count');
const declared = Number(/data-scene-count="(\d+)"/.exec(html)[1]);
eq(declared, scenes.length, 'declared scene count matches the scene data');

has(html, 'data-autoplay="true"', 'autoplay default is on in markup');
ok(/wanted:\s*true/.test(walkJs), 'player starts with autoplay intent on');
has(html, 'id="walk-play"', 'play/pause control is present');
has(walkJs, "getElementById('walk-play')", 'player wires the play/pause control');
has(walkJs, "getElementById('walk-dots')", 'player wires the dot scrubber');
has(html, 'id="walk-progress"', 'progress element is present');
has(html, 'id="walk-progress-fill"', 'progress fill element is present');
has(walkJs, "getElementById('walk-progress-fill')", 'player drives the progress fill');
has(walkJs, 'IntersectionObserver', 'autoplay waits for the player to scroll into view');
has(walkJs, 'mouseenter', 'hover pauses the tour');
has(walkJs, 'ArrowRight', 'keyboard arrows stay wired');
has(walkJs, 'ArrowLeft', 'keyboard arrows stay wired');

has(walkJs, 'prefers-reduced-motion', 'player reads the reduced motion preference');
ok(/state\.wanted = false/.test(walkJs), 'reduced motion turns autoplay off');
ok(/els\.play\.disabled = true/.test(walkJs), 'reduced motion disables the play button');
has(siteCss, '@media (prefers-reduced-motion: reduce)', 'site.css carries a reduced motion block');

const dotCss = /\.walk-dot\s*\{[^}]*\}/.exec(siteCss);
ok(
  !!dotCss && /width:\s*44px/.test(dotCss[0]) && /height:\s*44px/.test(dotCss[0]),
  'scene dots keep a 44px tap target',
);
ok(!/text-overflow:\s*ellipsis/.test(siteCss), 'landing styles never truncate copy with an ellipsis');

[
  ['fx-cart', 'cart counter chip'],
  ['fx-tag', 'tier price drop chip'],
  ['fx-pay', 'pickup code and QR reveal'],
  ['fx-vote', 'vote bars with the threshold line'],
  ['fx-flip', 'product conversion flip'],
  ['fx-badge', 'pano match badge'],
  ['fx-note', 'delivery notification slide'],
  ['cat-line', 'catalog line cascade'],
].forEach(([hook, label]) => {
  ok(walkJs.indexOf(hook) !== -1, 'player builds the ' + label);
  ok(siteCss.indexOf('.' + hook) !== -1, 'site.css styles the ' + label);
});

ok(!DASH.test(html), 'index.html copy has no em/en dash');
ok(!DASH.test(walkJs), 'player copy has no em/en dash');
BANNED.forEach((word) => {
  const re = new RegExp('\\b' + word + '\\b', 'i');
  ok(!re.test(html), 'banned word absent from index.html: ' + word);
  ok(!re.test(walkJs), 'banned word absent from player: ' + word);
});

if (failed > 0) {
  console.error('FAILED ' + failed + ' of ' + (passed + failed) + ' asserts');
  process.exit(1);
}
console.log('OK ' + passed + ' asserts');
