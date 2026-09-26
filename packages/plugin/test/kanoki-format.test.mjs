import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resultMarkdown, treeText, usdc } from '../kanoki-format.mjs';
const tree={rootId:'1',generation:'1',source:{timestamp:'100',blockNumber:'42'},nodes:[{id:'1',parentId:'0',ensName:'capital.agentcapitalusdc.eth',balances:['750000','0'],effectivePolicy:{expiry:'1000'},authorizedActions:['delegate'],generation:'1'},{id:'2',parentId:'1',ensName:'a.capital.agentcapitalusdc.eth',balances:['5','10'],effectivePolicy:{expiry:'1000'},authorizedActions:['pay'],generation:'1'}]};
test('Kanoki header, status order, precise amounts and aligned hierarchy',()=>{
 const result=resultMarkdown('getTree',{},tree);assert.match(result,/^\*\*kanoki\*\* · sepolia · capital.agentcapitalusdc.eth\n\n0.750000 USDC · capabilities DELEGATE — — — · expires in 0h 15m · active/);
 const rows=treeText(tree).split('\n').slice(1,-1);assert.equal(rows[0].indexOf('active'),rows[1].indexOf('active'));assert.match(rows[1],/└─ a\./);assert.match(result,/0.000010 DEMO-USD \(test asset\)/);assert.equal(usdc('1'),'0.000001');
});
test('revocation propagates visually without claiming a transfer or active roles',()=>{
 const revoked=structuredClone(tree);revoked.nodes[0].revoked=true;const result=treeText(revoked);assert.equal((result.match(/revoked/g)??[]).length,2);assert.doesNotMatch(result,/DELEGATE|PAY/);
});
test('errors preserve the header and do not fabricate balances',()=>{
 const result=resultMarkdown('purchaseService',{},'This node has no PAY role.',{isError:true});assert.match(result,/^\*\*kanoki\*\*/);assert.match(result,/— USDC/);assert.match(result,/Cannot purchase: this node has no PAY role\./);
});
