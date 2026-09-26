import { SetupError } from './capital-session.mjs';
import { parseEventLogs } from 'viem';
import { capitalControllerAbi } from '../sdk/dist/index.js';

export async function continueCapitalSetup(session, execute, waitSeconds = 20) {
  const {client,controller} = session;
  let setup = await session.inspect();
  const end = Date.now() + waitSeconds * 1000;
  while (!setup.writeReady && setup.status !== 'blocked' && Date.now() < end) {
    await new Promise(resolve => setTimeout(resolve, Math.min(3000, end-Date.now())));
    setup = await session.inspect();
  }
  if (!setup.writeReady && setup.status === 'blocked') return setup;
  if (!setup.writeReady) return {...setup,status:setup.writesEnabled === false ? 'blocked' : 'awaiting_wallet',next:setup.writesEnabled === false ? 'Enable the authorized write connection before continuation.' : (setup.next ?? 'Continue polling this same setup automatically. Only the missing wallet steps need user interaction.')};
  const state = await session.onboarding.read();
  if (!state?.test) return {...setup,status:'ready',next:'No child test was saved. Continue only the test explicitly authorized in the current user request.'};
  if (session.runtimeRoot !== session.onboarding.directory) throw new SetupError('WRONG_TARGET_ROOT','The active root is not the saved onboarding root. No saved test was forwarded.');
  const binding = {controller:controller.toLowerCase(),rootId:session.rootId,generation:String(setup.authorityGeneration)};
  if (state.testBinding && JSON.stringify(state.testBinding)!==JSON.stringify(binding)) throw new SetupError('SETUP_CONFLICT','Saved test authority changed. No allocation was forwarded under a new generation.');
  if (!state.testBinding) {state.testBinding=binding;await session.onboarding.save(state);}
  const autonomous = typeof state.test.task === 'string' && typeof state.test.model === 'string';
  const result = await execute(autonomous?'spawnChild':'createChildVault',{...state.test,expectedRootId:session.rootId});
  if (result.status === 'unavailable' || result.status === 'blocked') return result;
  const tree = await session.tree(session.rootId);
  const child = tree.nodes.find(node=>String(node.id)===String(result.childId));
  if (!child || String(child.rootId ?? tree.rootId)!==session.rootId || String(child.parentId)!==session.rootId) throw new SetupError('TEST_UNVERIFIED','Child result does not match the saved root. Reconcile the same operation key.');
  const txHash = result.txHash ?? result.transactionHash;
  if (!txHash) throw new SetupError('TEST_UNVERIFIED','Allocation exists, but its receipt hash is missing from the durable transaction record. No second allocation was requested.');
  const receipt = await client.rpc.getTransactionReceipt({hash:txHash});
  if (receipt.status !== 'success' || receipt.to?.toLowerCase() !== controller.toLowerCase()) throw new SetupError('TEST_UNVERIFIED','Child receipt did not confirm the intended controller.');
  const creations = parseEventLogs({abi:capitalControllerAbi,eventName:'NodeCreated',logs:receipt.logs ?? []});
  if (!creations.some(log=>log.address.toLowerCase()===controller.toLowerCase() && String(log.args.rootId)===session.rootId && String(log.args.nodeId)===String(child.id) && String(log.args.parentId)===session.rootId)) throw new SetupError('TEST_UNVERIFIED','Receipt does not contain the expected child creation event.');
  const allocations = parseEventLogs({abi:capitalControllerAbi,eventName:'CapitalAllocated',logs:receipt.logs ?? []});
  if (autonomous && !allocations.some(log=>log.address.toLowerCase()===controller.toLowerCase() && String(log.args.childId)===String(child.id) && log.args.token.toLowerCase()===state.test.asset.toLowerCase() && log.args.amount===BigInt(state.test.amount))) throw new SetupError('TEST_UNVERIFIED','Worker allocation receipt does not match the requested capital.');
  if (tree.totalBalances[0] > BigInt(state.budgetRaw) || (!autonomous && child.balances[0] !== BigInt(state.test.amount))) throw new SetupError('TEST_UNVERIFIED','Observed balances differ from the authorized child test or exceed the shared limit.');
  state.testCompletion={transactionHash:txHash,childId:String(child.id),blockNumber:String(receipt.blockNumber),dispatchStatus:result.dispatchStatus ?? 'not_requested'};
  await session.onboarding.save(state);
  return {...result,status:autonomous && result.dispatchStatus!=='started' ? 'partial' : 'confirmed',transactionHash:txHash,blockNumber:receipt.blockNumber,verifiedTree:tree,source:tree.source,setupId:state.setupId,next:`Show getTree and report the confirmed receipt, shared balances and effective child policy. Worker dispatch: ${result.dispatchStatus ?? 'not_requested'}.`};
}
