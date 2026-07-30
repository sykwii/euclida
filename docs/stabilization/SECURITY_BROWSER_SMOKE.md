# SECURITY BROWSER SMOKE

Date: 2026-07-30

## Verdict

PASS.

The final test used Playwright `1.55.0` with its bundled Chromium `140` (build 1187). Each run launched its own headless browser processes and fresh persistent profiles below:

`C:\Users\НЗ\euclida-staging-tools\security-rc7\browser`

No existing Chrome profile, tab, URL, desktop window, or extension was enumerated or controlled. Only processes launched by the test were closed.

## Identity and Network Guards

- Exact frontend origin: `http://127.0.0.1:8944`
- Exact API/WebSocket origin: `http://127.0.0.1:3100`
- Final main browser requests: 1,275
- Final main browser WebSocket observations: 45
- Main browser live-port requests: 0
- Supplementary XSS browser requests: 418
- Supplementary XSS browser WebSocket observations: 6
- Supplementary live-port requests: 0
- Unknown prohibited destinations: 0

Allowed third-party traffic was limited to documented OpenStreetMap/Carto tile hosts. Credentials and JWTs were redacted from logs; none appeared in the browser console.

An initial guard run detected stale runtime configuration and stopped after two unauthenticated requests to port 3000 returned 401. No successful authentication or mutation occurred. The final static production server used only 8944/3100, and all final artifacts prove zero live-port traffic.

## Authentication

PASS:

- login page and successful staging login;
- incorrect password produced a generic error;
- invalid token produced controlled logout/401 handling;
- authenticated route navigation;
- logout removed authentication state;
- direct protected navigation after logout returned to login;
- no password/JWT in screenshots, console, or test summary.

## Routes and Layout

Main route smoke: 26/26 PASS. It covered dashboard, ServiceOrders, weapons, fire positions, map, shot configurations, depots/stock/movements, notifications, maintenance UI, Recon, air threats/assets, trips, settings/analytics, C2, units, weapon models, drone logistics, fire missions, EW, recommendations, documents, audit, and users.

Layout smoke: 8/8 PASS at 1920x1080 and 3440x1440 for ServiceOrders, weapon systems, fire positions, and map. No horizontal overflow, clipped row menu, neighboring-card overlap, blank route, mojibake, stale map layer, or inaccessible overlay was detected.

## Stored XSS

PASS, 5/5 surface groups:

- weapon callsign;
- maintenance description/reason context;
- notification text derived from the callsign;
- Recon observation note inside a Leaflet tooltip;
- ServiceOrder delivery comment and rejection reason stored round-trip, with no active unsafe sink.

The payload set included `<img ... onerror>`, `<script>...</script>`, and `javascript:alert(1)`. Results: no dialog, no executable injected image/script/link, `window.__xssTriggered` remained false, no unexpected navigation, no page error, and no server 5xx.

The prior Unit-name smoke also rendered all three payload forms as text. Together with the shared `escapeHtml` unit tests, this covers Angular interpolation and Leaflet HTML construction.

## Two-Session Realtime

PASS:

- Session A created, suggested, selected, and sent a ServiceOrder.
- Session B received frames without reload.
- Exactly one matching notification existed before and after reconnect.
- One active recipient socket remained after reload.
- No duplicate notification/mutation and no cross-unit event was observed.
- The test order was cancelled during fixture cleanup.

## Console and Network

- Uncaught page errors: 0
- Required API 5xx: 0
- Fatal console errors: 0
- Network/security violations: 0
- XSS executions: 0

## Evidence

- `browser/security-browser-smoke.json`
- `browser/security-browser-smoke-final.log`
- `browser/main.har`
- `browser/recipient.har`
- `browser/main-trace.zip`
- `browser/console.json`
- `browser/network.json`
- `browser/xss-surfaces.json`
- `browser/xss-surfaces.log`
- `browser/xss-surfaces-main.har`
- `browser/xss-surfaces-recipient.har`
- `browser/xss-surfaces-trace.zip`
- deterministic PNG files for both layout widths and XSS surfaces

Fixture cleanup succeeded: maintenance cancelled, weapon callsign/readiness restored, Recon observation archived, and the ServiceOrder reopened/cancelled for cleanup. No truncate or schema reset was used.
