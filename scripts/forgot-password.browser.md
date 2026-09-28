# Local forgot-password regression

Start the current working tree with `npm run dev -- --hostname 127.0.0.1 --port 3000`.
Do not leave `npm start` serving a `.next` directory while rebuilding that same
production output: its in-memory manifests can reference removed chunks.

Install the test browser once with `npx playwright install chromium`, then run:

```sh
npm run test:browser:forgot-password
```

Optional variables:

- `BLOOMWISE_BROWSER_URL`: local HTTP origin (localhost or 127.0.0.1 only).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE`: use an existing compatible Chromium binary.
- `BLOOMWISE_BROWSER_EVIDENCE_DIR`: save safe JSON metadata and screenshots.

The test uses a fresh browser context without sessions or service workers. Every
`/auth/v1/recover` call is fulfilled or aborted locally; other external traffic
and local non-GET requests are blocked. It sends no real email and never reads
keys or tokens. Do not remove interception to turn this into a delivery test.

Four cases: neutral success, HTTP error, network failure, unavailable JavaScript.
Each hydrated submission must produce one mocked request and no document reload.
Without JavaScript the input/button remain disabled with a visible explanation.
This is a browser regression, separate from `npm test` and DB integration.
