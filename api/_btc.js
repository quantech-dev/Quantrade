// Bitcoin mainnet address check: legacy/P2SH (Base58Check) and SegWit/Taproot (bech32/bech32m).
// Files starting with "_" in /api are helpers, not Vercel routes.
import { createHash } from 'node:crypto';

const sha256 = b => createHash('sha256').update(b).digest();

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function checkBase58(s) {
  if (!/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(s)) return false;
  let n = 0n; for (const ch of s) n = n * 58n + BigInt(B58.indexOf(ch));
  const bytes = []; while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n; }
  for (const ch of s) { if (ch !== '1') break; bytes.unshift(0); }
  if (bytes.length !== 25 || (bytes[0] !== 0 && bytes[0] !== 5)) return false;
  const sum = sha256(sha256(Buffer.from(bytes.slice(0, 21))));
  return [0, 1, 2, 3].every(i => sum[i] === bytes[21 + i]);
}

const BECH = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function checkBech32(s) {
  if (!/^bc1[02-9ac-hj-np-z]{8,87}$/.test(s)) return false;
  const data = [...s.slice(3)].map(ch => BECH.indexOf(ch));
  let chk = 1;
  for (const v of [3, 3, 0, 2, 3, ...data]) { // hrp "bc" expanded, then the data part
    const top = chk >>> 25; chk = ((chk & 0x1ffffff) << 5) ^ v;
    [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3].forEach((g, i) => { if ((top >> i) & 1) chk ^= g; });
  }
  const ver = data[0];
  if (ver > 16 || chk !== (ver === 0 ? 1 : 0x2bc830a3)) return false;
  let acc = 0, bits = 0, len = 0; // 5-bit groups → witness program bytes
  for (const v of data.slice(1, -6)) { acc = (acc << 5) | v; bits += 5; while (bits >= 8) { bits -= 8; len++; } acc &= (1 << bits) - 1; }
  if (bits >= 5 || acc) return false;
  return ver === 0 ? len === 20 || len === 32 : len >= 2 && len <= 40;
}

// Returns a cleaned mainnet address, or null if it isn't one
export function parseBtcAddr(raw) {
  let s = String(raw || '').trim().replace(/^bitcoin:/i, '').split('?')[0];
  if (/^bc1/i.test(s)) { if (s !== s.toLowerCase() && s !== s.toUpperCase()) return null; s = s.toLowerCase(); return checkBech32(s) ? s : null; }
  return checkBase58(s) ? s : null;
}
