# Run the controlled Sepolia x402 seller

This optional seller runs on the **same Linux host as the companion**. It serves one loopback endpoint, `http://127.0.0.1:43827/research`, priced at **0.01 official Sepolia test USDC** (`10000` raw units). Its merchant wallet receives the test tokens and pays settlement gas. These tokens are not real dollars. The seller is a controlled demo, not a public merchant or a general facilitator.

From a built checkout, create a separate merchant wallet and fund its printed **public address** with enough Sepolia ETH for a Circle USDC settlement. Keep this wallet separate from the owner and child keys:

```sh
pnpm wallet:create seller
install -d -m 700 "$HOME/.agent-capital-tree/x402-demo"
(umask 077; touch "$HOME/.agent-capital-tree/x402-demo/config.json")
${EDITOR:-vi} "$HOME/.agent-capital-tree/x402-demo/config.json"
```

Set the config file to mode `0600` and use absolute paths. Copy your root's numeric ID and vault address from the current dashboard. Set `childLabel` to the exact child name you will request through MCP `spawnChild`. The seller polls that one root on the configured controller and accepts only its direct child with that label and current PAY authority. Keep `allowedPayers` empty while the child does not exist; after creation, you may pin the discovered **child vault contract address** there and restart the seller. A payer is a vault, not the child operator address. The keystore and password created by `wallet:create` stay outside the checkout.

```json
{
  "rpcUrl": "https://your-sepolia-rpc.example",
  "controller": "0xCURRENT_USDC_CONTROLLER",
  "rootId": "YOUR_NUMERIC_ROOT_ID",
  "rootVault": "0xYOUR_ROOT_VAULT",
  "childLabel": "jury-researcher",
  "keystoreFile": "/home/YOU/.agent-capital-tree/keys/seller.keystore.json",
  "passwordFile": "/home/YOU/.agent-capital-tree/keys/seller.password",
  "allowedPayers": [],
  "journalDirectory": "/home/YOU/.agent-capital-tree/x402-demo/transactions",
  "sellerDirectory": "/home/YOU/.agent-capital-tree/x402-demo/responses"
}
```

```sh
chmod 600 "$HOME/.agent-capital-tree/x402-demo/config.json"
node scripts/start-x402-demo-seller.mjs "$HOME/.agent-capital-tree/x402-demo/config.json"
```

The startup line prints the loopback URL, merchant `payTo` address, Sepolia network and raw price; it prints no key or password. In the companion's private config, approve only that returned URL and merchant address:

```json
"paymentServices": [{
  "id": "research",
  "url": "http://127.0.0.1:43827/research",
  "payTo": "0xMERCHANT_ADDRESS_PRINTED_BY_SELLER",
  "maxAmount": "10000"
}]
```

Start the companion with Sepolia writes enabled after setting a current PAY mandate and funding the root vault with official Sepolia test USDC. The approved `spawnChild` allocation funds the selected child; the seller discovers its vault from the chosen root before accepting a payment. The child calls `getPaymentServices`, then `purchaseService` with `serviceId: "research"`, `maxAmount: "10000"` and a fresh 32-byte operation key. A read-only check is `curl -i http://127.0.0.1:43827/research`; it should return HTTP 402 and cannot spend funds.

The seller accepts only the selected child vault, the fixed Circle USDC amount and a typed `transferWithAuthorization` to its own address. It clears its in-memory payer allowlist if its chain refresh fails; current PAY authority is also checked onchain during settlement. It writes the signed settlement transaction to the private journal before broadcasting. If a request ends ambiguously, preserve both private directories and reconcile the Circle authorization nonce, merchant response and transaction receipt before any new payment; an uncertain stored request returns HTTP 409. The seller binds only to loopback and supports no arbitrary recipient or transaction.
