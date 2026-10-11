# Quantrade

A family crypto dashboard: live prices, charts, a watchlist, and **Buy BTC** that sends Bitcoin straight to each family member's own wallet. Quantrade never holds anyone's money or crypto.

## How it works

- **Static site** (`index.html`, `app.js`, `styles.css`): no build step.
- **`/api/wallet`** (`api/wallet.js`): a small serverless function. When someone signs in, the app asks it for the Bitcoin address linked to their email. The family list is kept in the `FAMILY_WALLETS` environment variable, so it never appears in the site files or on GitHub.
- **Wallet balance**: read-only, from public block explorers (mempool.space, with blockstream.info as backup).
- **Prices**: Binance live stream where it's reachable, otherwise CoinGecko, refreshed about every minute.
- **Buy BTC**: shows the person's own wallet address with a QR code and a Copy button, plus steps to buy in Cash App and send it there. No payment processing happens in Quantrade.

## The family list

It's a JSON object of email → Bitcoin address:

```json
{
  "name@gmail.com": "bc1q...",
  "other@gmail.com": "1..."
}
```

- **On Vercel:** Project → Settings → Environment Variables → add `FAMILY_WALLETS` with the JSON above, then redeploy.
- **Locally:** put the same JSON in `family-wallets.json` (git-ignored). See `family-wallets.example.json`.

Invalid addresses are ignored (logged on the server), so a typo can't become a payment destination.

## Run locally

```
node serve.mjs
```

Then open http://localhost:5173. On another device on the same Wi-Fi, use this computer's IP, for example http://192.168.0.231:5173.

## Deploy on Vercel

1. Push this folder to a **private** GitHub repository.
2. In Vercel: **Add New → Project**, then import the repository. Leave the framework as **Other**, with no build command.
3. Add the `FAMILY_WALLETS` environment variable, then deploy.
4. Later, add your family domain under **Settings → Domains**.

## Notes

- Sign-in accounts (name, email, watchlist) are stored in each browser, so people sign up once per device.
- Sign-up doesn't verify email ownership yet. Someone who knows a family member's email could see that person's address and balance, but can't move their funds. Adding Google sign-in would close this.
