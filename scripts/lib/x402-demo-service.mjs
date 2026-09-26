import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
const require = createRequire(new URL('../../packages/runtime/package.json', import.meta.url));
const { encodePaymentRequiredHeader, decodePaymentSignatureHeader, encodePaymentResponseHeader } = require('@x402/core/http');

/** A deliberately bounded local research seller, not a public general-purpose facilitator. */
export async function startX402DemoService({ facilitator, payTo, allowedPayers, directory, port = 0 }) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const requirement = { scheme: 'exact', network: 'eip155:11155111', asset: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    amount: '10000', payTo, maxTimeoutSeconds: 120, extra: { name: 'USDC', version: '2' } };
  let url;
  let queue = Promise.resolve();
  const server = createServer((req, res) => {
    // ponytail: one local seller queue bounds facilitator nonce use; a distributed seller needs shared durable locking.
    queue = queue.catch(() => undefined).then(async () => {
      const send = (status, value, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(value)); };
      if (req.method !== 'GET' || req.url !== '/research') return send(404, { error: 'Not found' });
      const required = { x402Version: 2, resource: { url, description: 'Demo research report on delegated agent capital', mimeType: 'application/json' }, accepts: [requirement] };
      const header = req.headers['payment-signature'];
      if (!header) return send(402, required, { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader(required) });
      if (typeof header !== 'string' || header.length > 16000) return send(400, { error: 'Invalid payment header' });
      const payload = decodePaymentSignatureHeader(header);
      if (payload.x402Version !== 2 || JSON.stringify(payload.accepted) !== JSON.stringify(requirement) ||
          !allowedPayers.some(a => a.toLowerCase() === payload.payload.authorization?.from?.toLowerCase()) ||
          typeof payload.payload.signature !== 'string' || payload.payload.signature.length > 4000) return send(403, { error: 'Payment outside demo scope' });
      const key = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      const path = join(directory, `${key}.json`);
      let record;
      try { record = JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (record?.settlement?.success) return send(200, record.content, { 'PAYMENT-RESPONSE': encodePaymentResponseHeader(record.settlement) });
      if (record) return send(409, { error: 'Settlement outcome needs reconciliation; do not create a replacement payment', transaction: record.settlement?.transaction });
      const verified = await facilitator.verify(payload, requirement);
      if (!verified.isValid) return send(402, { error: verified.invalidReason });
      // A crash cannot trigger a fresh settlement attempt with an unknown prior outcome.
      await writeFile(path, JSON.stringify({ status: 'settling' }), { mode: 0o600, flag: 'wx' });
      const settlement = await facilitator.settle(payload, requirement);
      const content = { title: 'Delegated capital: research brief', demo: true, conclusions: [
        'Separate vault balances bound each worker’s available capital.',
        'ENS access-control roles authorize actions; the controller applies ancestor policy limits.',
        'Service quality and cumulative profit are not guaranteed by payment authorization.'
      ] };
      await writeFile(`${path}.tmp`, JSON.stringify({ settlement, content }), { mode: 0o600 });
      await rename(`${path}.tmp`, path);
      return send(settlement.success ? 200 : 409, settlement.success ? content : { error: settlement.errorReason }, { 'PAYMENT-RESPONSE': encodePaymentResponseHeader(settlement) });
    }).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok); });
  url = `http://127.0.0.1:${server.address().port}/research`;
  return { url, server, requirement, close: () => new Promise(resolve => server.close(resolve)) };
}
