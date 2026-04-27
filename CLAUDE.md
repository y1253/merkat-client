# Prediction Market Arbitrage System

## What This Is

Real-time arbitrage detector for Polymarket and Kalshi. Finds when the same prediction event is priced differently across both platforms and lets the user execute both trade legs in one click to lock in risk-free profit.

**Arbitrage formula:** `profit = 1.00 - price_YES_platformA - price_NO_platformB > 0`

---

## Project Structure

```
market/
├── server/          NestJS backend, port 3000
│   ├── src/
│   │   ├── markets/        Polymarket + Kalshi adapters
│   │   ├── normalization/  OpenAI GPT-4o market matching
│   │   ├── arbitrage/      Opportunity detection engine
│   │   ├── execution/      Two-leg trade placement
│   │   ├── gateway/        WebSocket (socket.io) real-time bridge
│   │   └── auth/           JWT auth (hardcoded credentials)
│   └── .env
└── client/          Vite + React + TypeScript frontend, port 5173
    └── src/
        ├── pages/          Dashboard.tsx, LoginPage
        ├── components/     TradeModal.tsx, OpportunityCard
        ├── store/          Zustand (opportunities.store.ts)
        └── api/            socket.ts, auth.api.ts
```

---

## Running the Project

```bash
# Backend
cd server && npm run start:dev

# Frontend
cd client && npm run dev
```

Open `http://localhost:5173` — login with credentials from `server/.env`.

---

## Key Configuration (server/.env)

```
PORT=3000
AUTH_USERNAME=admin
AUTH_PASSWORD=changeme123
JWT_SECRET=<long random string>
OPENAI_API_KEY=<key>
KALSHI_API_KEY_ID=<key>
KALSHI_PRIVATE_KEY=<RSA PEM — multiline, in quotes>
KALSHI_USE_SANDBOX=true
WS_CORS_ORIGIN=http://localhost:5173
MIN_PROFIT_THRESHOLD=0.005
POLL_INTERVAL_MS=30000
```

---

## Architecture Notes

### Data Flow
1. `MarketsService` polls both adapters every 30s → emits `markets.updated`
2. `NormalizationService` listens → string similarity first, then OpenAI GPT-4o for ambiguous pairs → emits `pairs.updated`
3. `ArbitrageService` listens → checks formula both directions → emits `opportunity.found`
4. `OpportunitiesGateway` broadcasts `opportunity:new` to all WS clients
5. Frontend Zustand store updates → Dashboard re-renders

### Polymarket
- Uses native Node.js `https.get` (NOT axios) to bypass the Windows network proxy
- **Demo mode**: if `clob.polymarket.com` is unreachable, falls back to 10 hardcoded mock markets with ±2% random price noise. `useDemoMode` flag is set permanently for that server run once blocked.
- Filter: only markets where `m.active && !m.closed` and prices not at extremes (≤0.01 or ≥0.99)

### Kalshi
- RSA-PSS signing via `crypto.createSign('RSA-SHA256')` with `RSA_PKCS1_PSS_PADDING`
- Production URL: `https://api.elections.kalshi.com/trade-api/v2` (migrated from trading-api.kalshi.com)
- Sandbox URL: `https://demo-api.kalshi.co/trade-api/v2`
- Auth path for signing must be `/trade-api/v2/markets` (full path, not just `/markets`)
- Uses `axios` with `httpsAgent` (`rejectUnauthorized: false`) and `proxy: false`

### Normalization (OpenAI)
- Fast path: Jaccard word similarity ≥ 0.8 (no API call)
- Slow path: GPT-4o with `response_format: { type: 'json_object' }` — prompt must request `{"matches": [...]}` object, NOT a bare array
- Only confidence ≥ 0.85 accepted
- Pairs cached in `Map<string, MarketPair>` — `polyId:kalshiId` key; already-cached pairs are skipped

### Auth
- `POST /auth/login` → returns JWT (1h expiry)
- All REST routes protected by `JwtAuthGuard`
- WebSocket: JWT passed via `socket.handshake.auth.token`, validated in `handleConnection`

### WebSocket Gateway
- `@WebSocketGateway({ cors: { origin: '*' } })` — CORS wildcard on WS
- `main.ts` `app.enableCors()` covers REST CORS (reads `WS_CORS_ORIGIN` env var)

---

## Known Issues / History

- **Polymarket API blocked on this machine**: OS-level proxy intercepts requests. Demo mode is the working solution.
- **Port is 3000** (not 3001): user changed `.env`, `socket.ts`, and `auth.api.ts`. Do not revert to 3001.
- **OpenAI `json_object` format**: requires prompt to explicitly ask for a JSON object wrapper — bare arrays are rejected by the API.
- **TLS**: `NODE_TLS_REJECT_UNAUTHORIZED=0` set in `main.ts` before imports; both adapters use `rejectUnauthorized: false` agents.
- **EventEmitter**: uses `@nestjs/event-emitter` (EventEmitter2). Event names use dot notation (`markets.updated`, `pairs.updated`, `opportunity.found`).

---

## Trade Execution

- `ExecutionService.executeTrade()` runs both legs concurrently via `Promise.all`
- If one leg fails → attempt cancel on the other → return `PARTIAL` status
- Falls back to `SIMULATED` mode when Polymarket/Kalshi credentials are not configured
- Frontend `TradeModal.tsx` sends `trade:execute` WS event, listens for `trade:result`
