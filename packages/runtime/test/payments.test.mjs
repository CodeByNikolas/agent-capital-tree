import test from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { decodeAbiParameters, recoverTypedDataAddress } from 'viem';
import { decodePaymentSignatureHeader, encodePaymentSignatureHeader } from '@x402/core/http';
import { SEPOLIA_USDC, selectPayment, signVaultPayment, transferAuthorizationTypes, validateService } from '../dist/payments.js';
const actor = privateKeyToAccount(`0x${'11'.repeat(32)}`);
const vault = '0x1111111111111111111111111111111111111111';
const payTo = '0x2222222222222222222222222222222222222222';
const service = { id: 'research', url: 'https://service.example/research', payTo, maxAmount: '100000' };
const quote = { scheme: 'exact', network: 'eip155:11155111', asset: SEPOLIA_USDC, amount: '10000', payTo, maxTimeoutSeconds: 120, extra: { name: 'USDC', version: '2' } };
test('fixed service and exact USDC quotes reject unapproved network/payee/value/domain', () => {
  validateService(service);
  for (const url of ['http://example.com/private','file:///etc/passwd','https://user:secret@example.com']) assert.throws(() => validateService({ ...service, url }));
  assert.equal(selectPayment([quote], service, 10000n), quote);
  for (const patch of [{network:'eip155:1'}, {payTo:vault}, {amount:'10001'}, {amount:'-1'}, {asset:vault}, {extra:{name:'USDC',version:'1'}}, {maxTimeoutSeconds:0}, {extra:{...quote.extra,assetTransferMethod:'permit2'}}]) assert.throws(() => selectPayment([{...quote,...patch}],service,10000n));
});
test('ERC1271 envelope binds standard authorization and generation without exposing an agent key', async () => {
  const payload = await signVaultPayment(actor, vault, 7n, quote, 2000n, 1000);
  const decoded = decodePaymentSignatureHeader(encodePaymentSignatureHeader(payload));
  assert.deepEqual(decoded, payload);
  const [token, recipient, value, validAfter, validBefore, nonce, signature] = decodeAbiParameters([
    {type:'address'},{type:'address'},{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'bytes32'},{type:'bytes'},
  ], payload.payload.signature);
  assert.equal(token.toLowerCase(), SEPOLIA_USDC.toLowerCase()); assert.equal(recipient,payTo);
  assert.equal(value,10000n); assert.equal(validAfter,999n); assert.equal(validBefore,1120n);
  assert.equal(BigInt(nonce)>>192n,7n);
  const address = await recoverTypedDataAddress({domain:{name:'USDC',version:'2',chainId:11155111,verifyingContract:SEPOLIA_USDC},types:transferAuthorizationTypes,primaryType:'TransferWithAuthorization',message:{from:vault,to:recipient,value,validAfter,validBefore,nonce},signature});
  assert.equal(address,actor.address);
  await assert.rejects(signVaultPayment(actor,vault,0n,quote,2000n,1000));
  await assert.rejects(signVaultPayment(actor,vault,7n,quote,1001n,1000));
});
