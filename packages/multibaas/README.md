# MultiBaas history adapter

Server-only, read-only Sepolia activity client. Construct it with an explicit HTTPS MultiBaas deployment origin, a restricted DApp User API key from the server's secret source, the registered controller address, and its MultiBaas contract label. The key is sent only as `Authorization: Bearer …`; it is never returned or included in errors.

`getCapitalActivity(rootId, cursor)` posts a controller-address- and root-filtered Event Query to `/api/v0/queries`. The SDK's EventQuery rows do not include a log index, so each returned transaction hash is enriched through the read-only `/api/v0/events` endpoint. Results use `chainId:txHash:logIndex` identity and sort by block, transaction, then log index. A page includes all matching logs in its selected transactions, so adjacent pages may overlap; use `mergeActivityPages` to deduplicate them. Start a new page window on refresh, replacing the old window so orphaned events disappear. Cursors are root-bound and use the Event Query's offset/limit. Indexing and chain status are fetched from MultiBaas on every page; any failed or malformed request fails the call. There is no RPC or synthetic-history fallback.

The current map covers the eight capital-core events in the controller ABI: `NodeCreated`, `RootFunded`, `CapitalAllocated`, `CapitalReclaimed`, `EmergencyRecovered`, `PolicyTightened`, `OperatorChanged`, and `NodeRevoked`. Swap/LP activity stays unsupported until those events exist and their fields are explicitly mapped. Event presence means indexed by MultiBaas; this adapter does not establish transaction finality or independently reconcile reorgs.

Before a live call, MultiBaas must have the controller ABI registered, the deployed controller linked under the configured label, event indexing enabled from the deployment block, and a restricted DApp User key with Event Query/read access. No live query was run for this package because that key is pending.

Offset pages are provisional indexer snapshots. Changes to indexed history can shift offsets; restart pagination from the first page when refreshing. Finality and canonical receipts must be verified separately before decisions; the indexer is never an authorization source.

Wire fields were verified against the [official MultiBaas TypeScript API](https://github.com/curvegrid/multibaas-sdk-typescript/blob/main/api.ts). Requests reject redirects; only the event emitter must be the controller, allowing smart-wallet transaction targets.
