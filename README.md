# Quantrade

A family crypto dashboard: live prices, charts, a watchlist, and each family member's own Bitcoin wallet. **Buy BTC** shows their wallet address (QR code + copy) so they can buy in Cash App and send it there. Quantrade never holds anyone's money or crypto.

## How it works

- **Static site** (`index.html`, `app.js`, `styles.css`): no build step.
- **Sign in with Google.** Google's button gives the browser a signed ID token. `api/login.js` asks Google to verify it, checks it was issued for this app and that the Gmail is verified, then returns a 30-day session signed with `SESSION_SECRET`.
- **`api/wallet.js`** returns the Bitcoin address for the email *inside that signed session*. Nobody can look up another person's wallet by typing their email.
- **`api/config.js`** gives the browser the (public) Google Client ID.
- **Wallet balance**: read-only, from public block explorers (mempool.space, with blockstream.info as backup).
- **Prices**: Binance live stream where it's reachable, otherwise CoinGecko, refreshed about every minute.
- **Demo account**: live prices and charts only, no wallet.

## Settings (environment variables)

| Name | What it is | Secret? |
| --- | --- | --- |
| `FAMILY_WALLETS` | JSON list of Gmail → Bitcoin address, e.g. `{"name@gmail.com": "bc1q..."}` | Yes, keep private |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console, ends in `.apps.googleusercontent.com` | No |
| `SESSION_SECRET` | Random string of 32+ characters used to sign sessions | Yes |

Invalid Bitcoin addresses in `FAMILY_WALLETS` are ignored (logged on the server), so a typo can't become a payment destination.

Generate a `SESSION_SECRET` with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**Locally**, these come from git-ignored files: `.env.local` (`GOOGLE_CLIENT_ID=...` and `SESSION_SECRET=...`) and `family-wallets.json` (see `family-wallets.example.json`).

## Google sign-in setup (one time)

1. Go to https://console.cloud.google.com and create a project.
2. Open **APIs & Services → OAuth consent screen**. Choose **External**, then fill in the app name and your email.
3. Open **Credentials → Create credentials → OAuth client ID**. Choose **Web application**.
4. Under **Authorized JavaScript origins**, add `http://localhost`, `http://localhost:5173` and your Vercel address (e.g. `https://quantrade-xxxx.vercel.app`), plus your family domain later.
5. Copy the Client ID into `GOOGLE_CLIENT_ID`.

Google only allows `localhost` or `https://` addresses, so Google sign-in won't work from a phone using this computer's Wi-Fi address (e.g. http://192.168.0.231:5173). Use the Vercel link on phones.

## Run locally

```
node serve.mjs
```

Then open http://localhost:5173.

## Deploy on Vercel

1. Push this folder to a **private** GitHub repository.
2. In Vercel: **Add New → Project**, then import the repository. Leave the framework as **Other**, with no build command.
3. Add `FAMILY_WALLETS`, `GOOGLE_CLIENT_ID` and `SESSION_SECRET` under **Settings → Environment Variables**, then deploy.
4. Add the Vercel address to the Google Client ID's authorized origins.
5. Later, add your family domain under **Settings → Domains**, and to the Google authorized origins as well.
