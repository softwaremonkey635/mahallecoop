# MahalleCoop Static Demo — BUILD SPEC (frozen interfaces, 2026-08-15)

GOAL: a 100% static, GitHub Pages-hostable interactive demo of MahalleCoop.
It must look and feel like real WhatsApp (light theme), contain ALL system
features, and work both from `file://` (double-click) and on Pages.
No frameworks, no build step, no external network at runtime.

## File ownership (exclusive; never write outside your list)
| File | Owner | Notes |
| ---- | ----- | ----- |
| site/SPEC.md | main | this file |
| site/index.html | S2 | landing page |
| site/demo.html | S1 | interactive app shell (mounts BOTH apps) |
| site/css/site.css | S2 | landing + shared tokens |
| site/css/phone.css | S1 | WhatsApp phone styling |
| site/css/portal.css | S2 | portal + shell chrome styling |
| site/js/store.js | S1 | UMD store (localStorage + seed) |
| site/js/engine.js | S1 | UMD chat engine (DOM-free, testable in Node) |
| site/js/ui.js | S1 | renders phone chat into #phone-app |
| site/js/portal.js | S2 | renders bakkal portal into #portal-app |
| site/js/landing.js | S2 | landing interactions (optional) |
| site/vendor/qrcode.min.js | S2 | MIT qrcode-generator (license header kept) |
| site/manifest.webmanifest, site/sw.js | S2 | PWA (relative paths, cache-first) |
| site/test/engine.test.mjs | S1 | node, zero deps, prints "OK <n> asserts" |
| site/README.md | S2 | hosting + Pages steps + license notes |

HARD CONSTRAINTS: classic `<script src>` tags ONLY (no `type="module"`), so
`file://` works; UMD pattern for store/engine (`module.exports` in Node,
`window.MC.*` in browser); no external runtime resources (no CDN scripts,
fonts, or images); navigation links to the GitHub repo are
allowed on the landing only. Turkish copy obeys
the global writing bans (zero em/en dashes, no banned words).

demo.html script order (frozen): store.js, engine.js, ui.js, portal.js.
Links: css/site.css, css/phone.css, css/portal.css.

## Frozen data model (localStorage key `mc_demo_v1`)
```js
{
  meta: { resetAt: ISO, version: 1 },
  products: [{ id, name, unit, category, tiers: [p1,p2,p3] /*kuruş*/, thresholds: [3,6], active }],
  users: [{ id, name, role: 'CUSTOMER'|'BAKKAL' }],
  transcripts: { [userId]: Message[] },
  sessions: { [userId]: { state, catalogPage, cart: [{productId, qty}], addons: ['BREAD_2X'|'MILK_1L'], note } },
  orders: [{ id, userId, items: [{productId, qty, unitPriceKurus, lineTotalKurus, tier}], totalKurus,
             addons: [], note, status: 'PENDING'|'PAID'|'DELIVERED', pickupCode, createdAt }],
  windows: [{ id, status: 'OPEN'|'CLOSED', closesAt: ISO }],
  rounds: [{ id, kind: 'DEMAND'|'SURPLUS', title, status: 'OPEN'|'CLOSED', closesAt,
             proposals: [{ id, authorId, text, status: 'PENDING'|'PUBLISHED'|'REJECTED',
                           convertedProductId: null, votes: { [userId]: 'AGREE'|'DISAGREE'|'PASS' } }] }],
  aidPosts: [{ id, userId, kind: 'REQUEST'|'OFFER', text, status: 'PENDING'|'PUBLISHED'|'REJECTED'|'MATCHED', responderId }],
  events: [{ id, ts, text }]   // feed for the "son hareketler" strip
}
```
Seed: 15 products (same names/units/tiers/thresholds as prisma/seed.ts), users
Ayşe/Mehmet/Fatma (CUSTOMER) + Hasan (BAKKAL), 1 OPEN window (+3 days), 1 OPEN
DEMAND round with 2 PUBLISHED proposals and 3 votes total, 2 PUBLISHED aid
posts, 1 DELIVERED past order (order history demo), commission starts 0.

## Frozen APIs
- `MC.createStore({persist:boolean}) -> { get(), set(next), reset() }` — seed
  lives inside; Node tests use `{persist:false}`.
- `MC.createEngine(store) -> engine`
  - `engine.send(actorId, { type:'text'|'button', body }) -> Message[]` (also appends to transcript)
  - `engine.transcript(actorId) -> Message[]`
  - `engine.broadcast(userIdsOrNull, Message[])` (null = all CUSTOMERs; appends + event log)
- `Message: { from:'bot'|'user'|'system', type:'text'|'buttons'|'list', text, buttons?:[{id,label}], ts }`
- Money helpers: `MC.fmtKurus(kurus) -> "1.234,56 TL"`, `MC.shortKurus(kurus) -> "1.234,56"`.

## Chat flows (mirror the real app; same copy tone, Turkish)
KVKK gate (ACCEPT_KVKK) → menu page 1 [🛒 Katalog][🧺 Sepetim][ℹ️ Yardım][🗳️ Topluluk →]
→ menu page 2 [Talep Turu][Dayanışma][⬅️ Ana Menü].
CATALOG: numbered list, 8/page, tier hints `3+: 875,00 · 6+: 855,00`, buttons
[⬅️ Önceki][➡️ Sonraki][🚪 Çık]; commands `N`, `N Q` (Q≤10), `-N`, `-N Q`,
`0 0 0`/`temizle` (clear), `sepet`, `menü`; unknown number → "N listede yok.
Listeyi tekrar göndereyim mi?" + [Evet, Göster]; non-command text → search
fallback: match product names, reply "Bulunanlar: 4. Rize Çayı 1 kg ..." (demo
feature) else the hint copy.
CART: lines + total + [✅ Ödeme][➕ Ürün Ekle][🗑️ Sepeti Boşalt].
ADDONS: [+2 Ekmek][+1 Süt][📝 Not Yaz][Geç] (counter-paid, excluded from total).
CONFIRM: summary + [✅ Onayla ve Öde][⬅️ Geri]. PAY: mock card modal (demo.html
modal, styled card form) → order PAID + 6-char pickup code bubble.
DEMAND: SUGGEST (≤140) → bakkal publish (portal) → VOTE one proposal per
message 👍/👎/🤷 with "Öneri 3/15" progress → close (portal) → results bubble
(≥60% and ≥3 votes accepted). Convert (portal) → product appears in catalog.
SURPLUS: portal button broadcasts [🗳️ Oyla] → same vote machine → results.
PANO: post (≤250, "telefon/adres yazma") → publish (portal) → list with
[🙋 Ben Yapabilirim] → first match wins → "bakkal buluşturacak" bubble.
ORDER HISTORY (demo feature): menu entry "📦 Siparişlerim" → past orders +
[🔁 Tekrar Sipariş] (refills cart).

## Portal (js/portal.js; always visible on desktop, tab on mobile)
Orders (status chips, deliver-by-code input + button), commission strip,
rounds manager (create DEMAND, publish/reject proposals, close, results,
convert form with tier prices), pano moderation (approve/reject/redact),
surplus starter, bulletin preview (print-friendly), "Duyuru Gönder" broadcast.
Deliver action → order DELIVERED + customer gets a notification bubble.

## Demo shell (demo.html, S1)
Desktop: phone left (max 420px) + portal right. Mobile: tabs
[📱 WhatsApp][🏪 Portal]. Top bar: identity switcher (Ayşe/Mehmet/Fatma/Hasan),
window countdown chip ("Pencere kapanışına 2g 14s"), savings counter
("Bu hafta ~X TL tasarruf"), reset button (MC reset + reload).

## WhatsApp fidelity (S1)
Light theme: app header #008069, chat bg #EFEAE2 with subtle doodle pattern
(CSS, no image files), outgoing bubble #D9FDD3 (tail top-right), incoming
#FFFFFF, text #111B21, timestamps #667781 (11px), blue ticks #53BDEB, phone
frame with status bar (time/signal/battery), contact header with avatar+name
("MahalleCoop" / "çevrimiçi"), typing indicator before bot replies, reply
buttons rendered as stacked rounded rows with blue labels, list messages as a
card with a "Menüyü Görüntüle" style button. Font stack: system-ui/Segoe.
Emoji ok. Input bar with emoji/attach/camera placeholders + send.

## Acceptance
- `node site/test/engine.test.mjs` green (≥15 asserts: KVKK, catalog commands
  + tier repricing, cart math, addons exclusion, order+code, governance
  full loop incl. convert, pano match, clear, search, history reorder).
- `node --check` clean on every js file; no external runtime resources (only
  the documented GitHub navigation link on the landing); no em/en dashes
  in copy (grep); review PASS; live on GitHub Pages.

## Landing walkthrough — full feature showcase (2026-09-24)
The landing hero phone becomes an INTERACTIVE scene player: step forward/back
through 14 scripted scenes showing the complete feature set, with an
annotation card per scene and a persistent "Demoyu Başlat" CTA.

Files (ownership): index.html + css/site.css + js/walkthrough-scenes.js (UMD
data, node-testable) + js/walkthrough.js (DOM player) + test/landing.test.mjs.
None of these may touch store/engine/ui/portal.

Scenes (order frozen; ids stable): 1 KVKK kapısı, 2 Menü (iki sayfa),
3 Katalog listesi (numaralı + kademe ipuçları), 4 Komutla sipariş ("4 2"
eklendi onayı), 5 Hata + liste geri gelir ("99" → listede yok), 6 Kademe
fiyatı (3+ / 6+ düşüşü), 7 Sepet + çıkarma ("-3", "0 0 0"), 8 Günlük
ekstralar (ekmek/süt, kasada ödenir), 9 Not + sipariş özeti + onay,
10 Ödeme (mock kart) + teslim kodu ve QR, 11 Teslim bildirimi (bakkal
teslim edince müşteriye haber), 12 Talep turu önerisi (≤140), 13 Oylama
(%60 + en az 3 oy eşiği), 14 Ürüne dönüşüm + dayanışma panosu (kapanış
sahnesi; katalogda yeni ürün ve panoda eşleşme).

Player requirements: buttons ‹ Önceki / Sonraki ›, step counter "Adım X/14",
dot scrubber (tıklanabilir), keyboard ← → / PgUp PgDn, touch swipe on mobile,
autoplay toggle (about 4s per scene, pauses on interaction), reduced-motion
respected, aria-live for scene changes, phone visuals reuse the WhatsApp light
theme tokens from phone.css conventions. Scene copy mirrors the real app tone
(Turkish, zero em/en dashes, banned words forbidden), reusing real copy where
possible (engine.js). Scenes are deterministic (no engine dependency).

Tests: test/landing.test.mjs (node, zero deps) asserts scene count ≥14, stable
ids, per-scene fields (title, caption, ≥1 message with valid from/type/text),
feature-coverage set includes all 14 features, command strings present, and
zero em/en dashes in scene copy. The landing shows the stable phrase
"1000'den fazla otomatik kontrol" (no exact total on the page; exact counts
live in PROGRESS.md / HANDOFF.md).

## Privacy (link-only, 2026-09-24)
The site is shared by link only. Both pages carry
`<meta name="robots" content="noindex, nofollow, noarchive">` and
`<meta name="referrer" content="no-referrer">`; site/robots.txt disallows all;
js/access-gate.js is a self-contained soft gate (ACCESS_CODE constant,
pass stored in localStorage `mc_access`). sw.js precaches the gate so an
offline first open still shows it. README states plainly that a client-side
code is a curtain, not real auth; real options are the server-side
DEMO_GATE/DEMO_PIN on Render or a paid host with password/auth.
