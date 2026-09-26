# MultiBaas free-plan indexing limits

Checked 26 September 2026.

## Finding

Yes. Curvegrid's current public pricing FAQ places the 100-block event-indexing lookback in its free offering. It says MultiBaas is “free to use for most features within defined limits,” including 30,000 API calls per month, and that event indexing is capped at 2 events per second, “starting up to 100 blocks back from the chain head.” The `/pricing` URL currently redirects to Curvegrid's [Blockchain Application Platform page](https://www.curvegrid.com/blockchain-platform), which contains that FAQ. A test tree that starts indexing near the current chain head can use this allowance without a paid upgrade.

The user's authenticated `GET /api/v0/plan` response independently reports `Default Plan`, `past_logs_max_depth: 100`, `events_per_sec: 2`, `api_calls_per_month: 30000`, `event_monitor_feature: true`, and `historical_blocks_feature: false`. It also reports `linked_contracts: 10`, `contracts: 1000`, and `retention: 72h`. The public FAQ separately says “5 active contracts”; its label differs from the instance field `linked_contracts`, so use the authenticated plan response for this instance's limits.

The 100-block allowance is a recent lookback, not full historical backfill. With `historical_blocks_feature: false`, registering the existing older deployment will not recover events outside that window. A new live test tree can be indexed from a recent block and exercised under the free plan's rate and API-call limits.

## Sources

- Curvegrid, [Pricing](https://www.curvegrid.com/pricing) (redirects to the current official [Blockchain Application Platform FAQ](https://www.curvegrid.com/blockchain-platform)); accessed 26 September 2026.
- User's MultiBaas instance, authenticated first-party response to `GET /api/v0/plan`, read 26 September 2026. No credentials are recorded here.
