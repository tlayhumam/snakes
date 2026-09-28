# Snakes API

FastAPI is the authoritative source for accounts, wallets, roulette, referrals, matchmaking, and game simulation. MySQL stores durable events and balances; live positions stay in a single process.

## Run locally

From the project root:

```bash
docker compose up --build
```

The API is available at `http://localhost:8000`, documentation at `/api/docs`, and MySQL on local port `3307`.

The frontend uses demo-local behavior unless `NEXT_PUBLIC_API_URL=http://localhost:8000` is provided before its build.

All amounts are simulated. Internally, balances use integer millionths of a dollar so a $0.01 entry can be split into exact $0.005 shares.
