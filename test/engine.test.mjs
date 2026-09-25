// Engine tests for the MahalleCoop static demo. Node, zero deps.
// Loads the UMD files as ESM side effects (package type=module) and reads
// globalThis.MC, which is the browser-facing namespace too.
import { fileURLToPath } from 'node:url';

const storeUrl = new URL('../js/store.js', import.meta.url);
const engineUrl = new URL('../js/engine.js', import.meta.url);
await import(storeUrl.href);
await import(engineUrl.href);

const MC = globalThis.MC;
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
  ok(Object.is(got, want), label + ' (got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want) + ')');
}
function has(str, sub, label) {
  ok(String(str).indexOf(sub) !== -1, label + ' (missing ' + JSON.stringify(sub) + ')');
}
function matches(str, re, label) {
  ok(re.test(String(str)), label + ' (' + re + ')');
}
function texts(msgs) {
  return msgs.map((m) => m.text).join('\n');
}
function ids(msgs) {
  return msgs.flatMap((m) => (m.buttons || []).map((b) => b.id));
}

const store = MC.createStore({ persist: false });
const engine = MC.createEngine(store);

function send(userId, type, body) {
  return engine.send(userId, { type, body });
}

// ── 1. KVKK gate ────────────────────────────────────────────────────────
let out = send('ayse', 'text', 'merhaba');
matches(texts(out), /KVKK/, 'KVKK gate on first contact');
ok(ids(out).includes('ACCEPT_KVKK'), 'ACCEPT_KVKK button offered');

out = send('ayse', 'text', 'BROWSE');
matches(texts(out), /KVKK/, 'BROWSE before consent still gated');
ok(!ids(out).includes('CATALOG_EXIT'), 'no catalog before consent');

out = send('ayse', 'button', 'ACCEPT_KVKK');
ok(ids(out).includes('BROWSE'), 'consent lands on menu');
ok(ids(out).includes('ORDERS'), 'menu has Siparişlerim entry');
ok(ids(out).includes('PAGE2'), 'menu has Topluluk entry');

// ── 2. Catalog: pages, tier hints, commands, reprice ────────────────────
out = send('ayse', 'button', 'BROWSE');
let t = texts(out);
matches(t, /sayfa 1\/2/, 'catalog page 1 of 2');
matches(t, /1\. Sızma Zeytinyağı 5 L · 895,00 TL · 3\+: 875,00 · 6\+: 855,00/, 'line 1 with tier hints');
has(t, '8. İnce Bulgur', 'page 1 ends at product 8');
ok(!t.includes('9. Toz Şeker'), 'product 9 not on page 1');
ok(ids(out).includes('CATALOG_NEXT'), 'next button on page 1');
ok(!ids(out).includes('CATALOG_PREV'), 'no prev on page 1');
ok(ids(out).includes('CATALOG_EXIT'), 'exit button present');

out = send('ayse', 'button', 'CATALOG_NEXT');
matches(texts(out), /sayfa 2\/2/, 'page 2 indicator');
has(texts(out), '15. Sofra Tuzu', 'page 2 ends at product 15');
ok(ids(out).includes('CATALOG_PREV'), 'prev on page 2');
ok(!ids(out).includes('CATALOG_NEXT'), 'no next on last page');

send('ayse', 'button', 'CATALOG_PREV');
out = send('ayse', 'text', '1');
has(texts(out), '✔ Eklendi: +1 × Sızma Zeytinyağı', 'add 1 confirm');
has(texts(out), '1 × 895,00 = 895,00 TL', 'tier1 price after first add');

out = send('ayse', 'text', '1 3');
has(texts(out), '+3 × Sızma Zeytinyağı (sepette: 4 × 875,00 = 3.500,00 TL)', 'tier2 reprice at qty 4');

out = send('ayse', 'text', 'sepet');
t = texts(out);
has(t, '× 4 @ 875,00', 'cart line repriced');
has(t, 'Toplam: 3.500,00 TL', 'cart total 3500 TL');
ok(ids(out).includes('CHECKOUT'), 'cart has checkout button');

// ── 3. Addons excluded from total, note truncation, PAY ─────────────────
out = send('ayse', 'button', 'CHECKOUT');
has(texts(out), 'Günlük bakkal ürünü', 'addons step reached');

out = send('ayse', 'button', 'ADDON:BREAD_2X');
has(texts(out), 'Eklendi: +2 Ekmek', 'bread addon added');

out = send('ayse', 'button', 'SKIP_ADDONS');
t = texts(out);
has(t, 'Toplam: 3.500,00 TL', 'total unchanged by addon');
has(t, 'Bakkal kasasında öde: +2 Ekmek', 'addon listed as counter-paid');
ok(!/Toplam:.*Ekmek/.test(t), 'addon outside total line');

send('ayse', 'button', 'BACK');
out = send('ayse', 'button', 'NOTE');
has(texts(out), '250 karakter', 'note prompt shown');
out = send('ayse', 'text', '   ');
has(texts(out), 'Not boş olamaz', 'empty note rejected');
out = send('ayse', 'text', 'x'.repeat(300));
let st = store.get();
let note = st.sessions.ayse.note;
eq(note.length, 251, 'note truncated to 250 plus ellipsis');
ok(note.endsWith('…'), 'note ends with ellipsis');

out = send('ayse', 'button', 'SKIP_ADDONS');
has(texts(out), '📝 Not: xxx', 'saved note appears in confirm summary');
out = send('ayse', 'button', 'PAY');
t = texts(out);
matches(t, /Alış kodu: [A-HJ-NP-Z2-9]{6}/, 'pickup code bubble shape');

st = store.get();
const order2 = st.orders.find((o) => o.id === 2);
ok(!!order2, 'order 2 created');
eq(order2.status, 'PAID', 'PAY flow lands PAID');
eq(order2.totalKurus, 350000, 'order total is cart sum in kurus');
eq(JSON.stringify(order2.addons), JSON.stringify(['BREAD_2X']), 'order keeps addon codes');
ok(order2.note.length <= 251, 'order note truncated');
matches(order2.pickupCode, /^[A-HJ-NP-Z2-9]{6}$/, 'pickup code alphabet');
eq(order2.items[0].tier, 2, 'order item carries tier 2');
eq(order2.items[0].unitPriceKurus, 87500, 'order item unit price');

// ── 4. Clear, unknown number, search fallback ───────────────────────────
send('ayse', 'button', 'HOME');
send('ayse', 'button', 'BROWSE');
send('ayse', 'text', '1 1');
out = send('ayse', 'text', '0 0 0');
has(texts(out), '🗑️ Sepet boşaltıldı.', '0 0 0 clears cart');
out = send('ayse', 'text', '0 0 0');
has(texts(out), 'Sepet zaten boş', 'clear on empty cart');

out = send('ayse', 'text', '99');
has(texts(out), '99 listede yok. Listeyi tekrar göndereyim mi?', 'unknown number message');
ok(ids(out).includes('RESEND_LIST'), 'resend button offered');
out = send('ayse', 'button', 'RESEND_LIST');
matches(texts(out), /sayfa 1\/2/, 'RESEND_LIST re-shows catalog');

out = send('ayse', 'text', 'rize');
t = texts(out);
has(t, 'Bulunanlar:', 'search fallback header');
has(t, '4. Rize Çayı 1 kg', 'search finds Rize Çayı with its number');

out = send('ayse', 'text', 'zzqqxx');
has(texts(out), 'Anlamadım', 'search miss falls back to hint copy');

// ── 4b. -N remove (partial + full) and temizle alias ───────────────────
send('ayse', 'text', '1 2');
out = send('ayse', 'text', '-1');
const partialRemoval = texts(out);
out = send('ayse', 'text', '-1');
const fullRemoval = texts(out);
ok(
  partialRemoval.includes('kalan: 1') && fullRemoval.includes('sepette kalmadı'),
  '-N partial then full removal',
);
send('ayse', 'text', '1 1');
out = send('ayse', 'text', 'temizle');
has(texts(out), '🗑️ Sepet boşaltıldı.', 'temizle alias clears cart');

// ── 5. Order history + reorder ──────────────────────────────────────────
send('ayse', 'text', 'menü');
out = send('ayse', 'button', 'ORDERS');
t = texts(out);
has(t, '#2 ·', 'history lists paid order 2');
has(t, '✅ Teslim edildi', 'history shows delivered seed order');
ok(ids(out).includes('REORDER:2'), 'reorder button for order 2');

out = send('ayse', 'button', 'REORDER:2');
has(texts(out), 'sepete yüklendi', 'reorder refills cart');
t = texts(out);
has(t, '× 4 @ 875,00', 'reordered cart repriced at current tier');
has(t, 'Toplam: 3.500,00 TL', 'reordered cart total');
send('ayse', 'button', 'CLEAR');

// ── 6. Governance full loop: suggest, publish, vote, close, results,
//       convert, catalog shows the product ───────────────────────────────
send('mehmet', 'text', 'selam');
send('mehmet', 'button', 'ACCEPT_KVKK');
send('mehmet', 'button', 'PAGE2');
send('mehmet', 'button', 'DEMAND');
out = send('mehmet', 'button', 'SUGGEST');
has(texts(out), '140 karakter', 'suggest prompt shown');
out = send('mehmet', 'text', 'Közlenmiş Biber');
has(texts(out), 'Önerin alındı', 'proposal accepted into PENDING');

st = store.get();
const round = st.rounds.find((r) => r.kind === 'DEMAND');
eq(round.proposals.length, 3, 'third proposal created');
const prop3 = round.proposals.find((p) => p.text === 'Közlenmiş Biber');
eq(prop3.status, 'PENDING', 'new proposal starts PENDING');
prop3.status = 'PUBLISHED';
store.set(st);

// Vote queue per user: unvoted published proposals in id order.
out = send('ayse', 'button', 'PAGE2');
send('ayse', 'button', 'DEMAND');
out = send('ayse', 'button', 'VOTE_NEXT');
matches(texts(out), /Öneri 1\/2/, 'vote progress shows 1/2');
send('ayse', 'button', 'VOTE:2:DISAGREE');
out = send('ayse', 'button', 'VOTE:3:AGREE');
has(texts(out), 'Oylama bitti', 'ayse vote queue finished');

send('mehmet', 'button', 'VOTE_NEXT');
send('mehmet', 'button', 'VOTE:1:DISAGREE');
out = send('mehmet', 'button', 'VOTE:3:AGREE');
has(texts(out), 'Oylama bitti', 'mehmet vote queue finished');

send('fatma', 'text', 'merhaba');
send('fatma', 'button', 'ACCEPT_KVKK');
send('fatma', 'button', 'PAGE2');
send('fatma', 'button', 'DEMAND');
send('fatma', 'button', 'VOTE_NEXT');
send('fatma', 'button', 'VOTE:1:DISAGREE');
out = send('fatma', 'button', 'VOTE:3:AGREE');
has(texts(out), 'Oylama bitti', 'fatma vote queue finished');

st = store.get();
const round2 = st.rounds.find((r) => r.kind === 'DEMAND');
const p3 = round2.proposals.find((p) => p.text === 'Közlenmiş Biber');
eq(Object.keys(p3.votes).length, 3, 'proposal 3 collected 3 votes');
eq(p3.votes.ayse, 'AGREE', 'ayse agreed on proposal 3');
eq(p3.votes.mehmet, 'AGREE', 'mehmet agreed on proposal 3');
eq(p3.votes.fatma, 'AGREE', 'fatma agreed on proposal 3');
round2.status = 'CLOSED';
store.set(st);

out = send('ayse', 'button', 'VOTE_RESULTS');
t = texts(out);
has(t, 'Ekim Talep Turu: 1 kabul edildi:', 'results accept exactly one proposal');
has(t, 'Közlenmiş Biber · %100 👍 (3/3)', 'winning proposal tallied at 100 percent');
has(t, 'Çekimserler dahil 9 oy.', 'total vote count in results');

// Convert via store (portal action): accepted proposal becomes product 16.
st = store.get();
const round3 = st.rounds.find((r) => r.kind === 'DEMAND');
const p3b = round3.proposals.find((p) => p.text === 'Közlenmiş Biber');
eq(round3.status, 'CLOSED', 'round closed before convert');
st.products.push({
  id: 16,
  name: 'Közlenmiş Biber',
  unit: '500 g',
  category: 'Dayanışma',
  tiers: [4500, 4300, 4100],
  thresholds: [3, 6],
  active: true,
});
p3b.convertedProductId = 16;
store.set(st);

out = send('ayse', 'button', 'BROWSE');
matches(texts(out), /sayfa 1\/2/, 'catalog still two pages after convert');
out = send('ayse', 'button', 'CATALOG_NEXT');
t = texts(out);
has(t, '16. Közlenmiş Biber 500 g', 'converted product appears as number 16');
has(t, '45,00 TL · 3+: 43,00 · 6+: 41,00', 'converted product tier hints');
send('ayse', 'button', 'CATALOG_EXIT');

// ── 7. Pano: post, publish, match, first-match-wins ─────────────────────
send('ayse', 'button', 'PAGE2');
send('ayse', 'button', 'DAYANISMA');
out = send('ayse', 'button', 'PANO_REQUEST');
has(texts(out), 'telefon/adres yazma', 'pano intake warns about contact data');
out = send('ayse', 'text', 'Çocuk bezi lazım');
has(texts(out), 'İlanın bakkala iletildi', 'pano post lands as PENDING');

st = store.get();
const newPost = st.aidPosts.find((p) => p.text === 'Çocuk bezi lazım');
eq(newPost.status, 'PENDING', 'fresh aid post is PENDING');
newPost.status = 'PUBLISHED';
store.set(st);

send('mehmet', 'button', 'VOTE_RESULTS');
send('mehmet', 'button', 'PAGE2');
send('mehmet', 'button', 'DAYANISMA');
out = send('mehmet', 'button', 'PANO_LIST');
t = texts(out);
has(t, 'Çocuk bezi lazım', 'published post listed');
ok(ids(out).includes('PANO_OFFER_MATCH:' + newPost.id), 'match button for the new post');

out = send('mehmet', 'button', 'PANO_OFFER_MATCH:' + newPost.id);
has(texts(out), 'Bakkal seni istek sahibiyle buluşturacak', 'first match wins bubble');

st = store.get();
const matched = st.aidPosts.find((p) => p.text === 'Çocuk bezi lazım');
eq(matched.responderId, 'mehmet', 'responder recorded');
eq(matched.status, 'MATCHED', 'post flips to MATCHED');

out = send('fatma', 'button', 'VOTE_RESULTS');
send('fatma', 'button', 'PAGE2');
send('fatma', 'button', 'DAYANISMA');
send('fatma', 'button', 'PANO_LIST');
out = send('fatma', 'button', 'PANO_OFFER_MATCH:' + newPost.id);
has(texts(out), 'zaten eşleşti', 'second responder rejected');

// ── 8. Broadcast to customers + surplus vote entry ──────────────────────
const stamped = engine.broadcast(null, [
  {
    from: 'bot',
    type: 'buttons',
    text: '📊 Platform fazlası için oylama başladı!',
    buttons: [{ id: 'VOTE_SURPLUS', label: '🗳️ Oyla' }],
  },
]);
eq(stamped.length, 1, 'broadcast returns stamped messages');

st = store.get();
['ayse', 'mehmet', 'fatma'].forEach((uid) => {
  const last = st.transcripts[uid][st.transcripts[uid].length - 1];
  ok(last && last.text.indexOf('Platform fazlası') !== -1, 'broadcast reached ' + uid);
});
ok(
  st.events.some((e) => e.text.indexOf('Duyuru') === 0),
  'broadcast logged an event',
);

st.rounds.push({
  id: 2,
  kind: 'SURPLUS',
  title: 'Fazla Bütçe Oylaması',
  status: 'OPEN',
  closesAt: new Date(Date.now() + 2 * 86400000).toISOString(),
  proposals: [
    {
      id: 4,
      authorId: 'hasan',
      text: 'Dayanışma fonuna aktaralım',
      status: 'PUBLISHED',
      convertedProductId: null,
      votes: {},
    },
  ],
});
store.set(st);

out = send('ayse', 'button', 'VOTE_SURPLUS');
matches(texts(out), /Öneri 1\/1/, 'surplus broadcast button enters vote machine');
out = send('ayse', 'button', 'VOTE:4:AGREE');
has(texts(out), 'Oylama bitti', 'surplus vote accepted');

// ── 9. Money helpers ────────────────────────────────────────────────────
eq(MC.fmtKurus(123456), '1.234,56 TL', 'fmtKurus format');
eq(MC.shortKurus(123456), '1.234,56', 'shortKurus format');
eq(MC.fmtKurus(89500), '895,00 TL', 'fmtKurus whole lira');

// ── 10. Portal analytics (pure metric helpers, time injected) ───────────
const DAY = 86400000;
const NOW = Date.parse('2026-09-25T12:00:00.000Z');

function isoDaysAgo(days) {
  return new Date(NOW - days * DAY).toISOString();
}

function mkOrder(id, userId, ageDays, over) {
  return Object.assign(
    {
      id,
      userId,
      items: [{ productId: 1, qty: 1, unitPriceKurus: 10000, lineTotalKurus: 10000, tier: 1 }],
      totalKurus: 10000,
      addons: [],
      note: null,
      status: 'PAID',
      pickupCode: 'AAAAAA',
      createdAt: isoDaysAgo(ageDays),
    },
    over || {},
  );
}

function mkState(orders, opts) {
  const o = opts || {};
  return {
    meta: { version: 1, commissionKurus: 0 },
    products: [
      { id: 1, name: 'Ekmek', unit: '1 adet', category: 'Temel Gıda', tiers: [10000, 9500, 9000], thresholds: [3, 6], active: true },
      { id: 2, name: 'Süt', unit: '1 L', category: 'Süt Ürünleri', tiers: [20000, 19000, 18000], thresholds: [3, 6], active: true },
    ],
    users: o.users || [
      { id: 'u1', name: 'U1', role: 'CUSTOMER' },
      { id: 'u2', name: 'U2', role: 'CUSTOMER' },
      { id: 'shop', name: 'Shop', role: 'BAKKAL' },
    ],
    orders,
    windows: o.windows || [{ id: 1, status: 'OPEN', closesAt: isoDaysAgo(-3) }],
  };
}

function metrics(state, now) {
  return MC.portalAnalytics(state, now === undefined ? NOW : now);
}

// Assumptions are exported, so the renderer cannot drift from the helper.
eq(MC.ANALYTICS_WINDOW_DAYS, 30, 'analytics window is 30 days');
eq(MC.DAILY_ORDER_GOAL, 20, 'window fill target is 20 orders');
eq(MC.DELIVERY_COST_KURUS, 3000, 'delivery estimate is 30,00 TL per order');
eq(MC.ANALYTICS_RETAIL_PROXY_RATE, 0.15, 'retail proxy rate is 15 percent');

// Thin store: zeros plus veri yok flags, never an invented ratio.
const empty = metrics(mkState([]));
eq(empty.aktifUye, 0, 'empty store active members is 0');
eq(empty.ortalamaSepetKurus, 0, 'empty store average basket is 0');
eq(empty.pencereDoluluk, 0, 'empty store window fill is 0');
ok(empty.noData.includes('aylikKayip'), 'empty store churn reads veri yok');
ok(empty.noData.includes('tekrarAlim'), 'empty store repeat reads veri yok');
ok(!empty.noData.includes('aktifUye'), 'a zero member count is real data, not veri yok');

// The shipped demo seed: one delivered order, two days old.
const demo = MC.createStore({ persist: false }).get();
const demoM = MC.portalAnalytics(demo, Date.parse(demo.orders[0].createdAt) + DAY);
eq(demoM.aktifUye, 1, 'demo seed has one active member');
eq(demoM.siparisSikligi, 1, 'demo seed frequency is one order per member');
eq(demoM.ortalamaSepetKurus, 195000, 'demo seed basket is the 195,00 TL order');
eq(demoM.kisiBasiTasarrufKurus, 31050, 'demo seed savings is 6 x 34500 x 0.15');
eq(demoM.pencereDolulukAdet, 1, 'demo seed fills one slot of the open window');
eq(demoM.pencereDoluluk, 0.05, 'demo seed fill is 1 of 20');
eq(demoM.teslimMaliyetKurus, 3000, 'demo seed carries the fixed delivery estimate');
ok(demoM.noData.includes('aylikKayip'), 'demo seed has no previous window to compare');
ok(demoM.noData.includes('tekrarAlim'), 'demo seed has no member with two orders');

// Role, cancellation and age filters match the app query.
const filtered = metrics(
  mkState([
    mkOrder(1, 'u1', 2),
    mkOrder(2, 'shop', 1),
    mkOrder(3, 'u2', 3, { status: 'CANCELLED' }),
    mkOrder(4, 'u1', 31),
  ]),
);
eq(filtered.aktifUye, 1, 'role, cancel and age filters leave one active member');
eq(filtered.ortalamaSepetKurus, 10000, 'basket averages only counted orders');
eq(filtered.siparisSikligi, 1, 'frequency is one counted order per member');
eq(filtered.aylikKayipOrani, 0, 'member from the previous window is still active');
ok(!filtered.noData.includes('aylikKayip'), 'previous window supplies real churn data');
eq(filtered.pencereDolulukAdet, 2, 'fill counts every counted order while a window is open');
eq(filtered.pencereDoluluk, 0.1, 'two counted orders is 10 percent of the target');

// Churn: one of two previous members lapsed. Closed window fills nothing.
const churn = metrics(
  mkState(
    [mkOrder(1, 'u1', 5), mkOrder(2, 'u2', 40), mkOrder(3, 'u1', 45)],
    { windows: [{ id: 1, status: 'CLOSED', closesAt: isoDaysAgo(1) }] },
  ),
);
eq(churn.aktifUye, 1, 'only u1 ordered inside the current window');
eq(churn.aylikKayipOrani, 0.5, 'one of two previous members lapsed');
eq(churn.pencereDolulukAdet, 0, 'a closed window books no fill');
eq(churn.pencereDoluluk, 0, 'fill ratio is 0 without an open window');

// Repeat purchase: needs two orders from the same member.
const repeat = metrics(mkState([mkOrder(1, 'u1', 5), mkOrder(2, 'u1', 3), mkOrder(3, 'u2', 4)]));
eq(repeat.tekrarAlimOrani, 1, 'u1 last two orders share a product');
eq(repeat.siparisSikligi, 1.5, 'three orders over two members is 1.5');

const noRepeat = metrics(
  mkState([
    mkOrder(1, 'u1', 5),
    mkOrder(2, 'u1', 3, {
      items: [{ productId: 2, qty: 1, unitPriceKurus: 20000, lineTotalKurus: 20000, tier: 1 }],
    }),
  ]),
);
eq(noRepeat.tekrarAlimOrani, 0, 'different products in the last two orders score 0');
ok(!noRepeat.noData.includes('tekrarAlim'), 'an eligible member makes the zero real data');

// Savings and basket, same shape as the app fixture.
const fixture = metrics(
  mkState([
    mkOrder(1, 'u1', 2, {
      totalKurus: 40000,
      items: [{ productId: 1, qty: 4, unitPriceKurus: 10000, lineTotalKurus: 40000, tier: 1 }],
    }),
    mkOrder(2, 'u1', 1, {
      totalKurus: 50000,
      items: [
        { productId: 1, qty: 3, unitPriceKurus: 10000, lineTotalKurus: 30000, tier: 1 },
        { productId: 2, qty: 1, unitPriceKurus: 20000, lineTotalKurus: 20000, tier: 1 },
      ],
    }),
    mkOrder(3, 'u2', 3, {
      totalKurus: 30000,
      items: [{ productId: 2, qty: 1, unitPriceKurus: 20000, lineTotalKurus: 20000, tier: 1 }],
    }),
  ]),
);
eq(fixture.aktifUye, 2, 'two active members in the fixture');
eq(fixture.ortalamaSepetKurus, 40000, 'basket is 120.000 kuruş over three orders');
eq(fixture.kisiBasiTasarrufKurus, 8250, 'savings is 16.500 kuruş over two members');
eq(fixture.tekrarAlimOrani, 1, 'u1 repeats bread across its two orders');

const many = [];
for (let i = 0; i < 25; i += 1) many.push(mkOrder(100 + i, 'u1', 1));
const capped = metrics(mkState(many));
eq(capped.pencereDolulukAdet, 25, 'every counted order lands in the open window');
eq(capped.pencereDoluluk, 1, 'fill ratio caps at the 20 order target');

// Empty denominators and odd inputs stay honest.
const unparsable = metrics(mkState([mkOrder(1, 'u1', 2, { createdAt: 'not-a-date' })]));
eq(unparsable.aktifUye, 0, 'unparsable timestamp is excluded from the window');
ok(unparsable.noData.includes('siparisSikligi'), 'frequency reads veri yok without members');

const unknownProduct = metrics(
  mkState([mkOrder(1, 'u1', 2, {
    items: [{ productId: 99, qty: 5, unitPriceKurus: 100, lineTotalKurus: 500, tier: 1 }],
  })]),
);
eq(unknownProduct.kisiBasiTasarrufKurus, 0, 'an unknown product contributes no savings');

const noItems = metrics(mkState([mkOrder(1, 'u1', 2, { items: [] })]));
eq(noItems.teslimMaliyetKurus, 3000, 'one counted order carries the delivery estimate');
ok(!noItems.noData.includes('ortalamaSepet'), 'one order is enough for a basket average');

eq(MC.portalAnalytics(mkState([])).aktifUye, 0, 'nowMs is optional and defaults to Date.now()');

if (failed > 0) {
  console.error('FAILED ' + failed + ' of ' + (passed + failed) + ' asserts');
  process.exit(1);
}
console.log('OK ' + passed + ' asserts');
