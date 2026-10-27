# Platypus Finance original pool contract tags

Returns the unique original poolAddress values recorded when each asset was first indexed by the current published Messari Platypus Avalanche deployment Qmb7S3fSHij3pej9yuXyNsuK2gGv4xmhaBcbfhuWRG7NJy (source B35cLTayreXTML6fXPTrFNSYx7mKyDuuV51LjVxWwWjp). LiquidityPool.id identifies an asset receipt, not the pool itself.

Enumerates every asset at a single sealed current source hash, using ascending ID cursor pagination. For each asset, reads that same deployment at its createdBlockNumber and emits its nonignored poolAddress. The source's current poolAddress can point to a treasury or withdrawal helper after an admin changes the asset controller; it is deliberately not the tagged field. No contract list, age, activity, balance or output cap is hardcoded. Receipt and underlying token addresses are excluded. Historical pool identity does not imply current operation.

Validates source deployment, protocol, block, entity identity and error state on all reads, and seals the current snapshot after all historical queries. Number-bound historical metadata may have a null hash; current metadata must match its initial hash. Any missing history, malformed record, cursor regression or source failure throws without returning partial tags. Shared original pools are deduplicated.

Official source explanation: https://github.com/messari/subgraphs/blob/master/subgraphs/platypus-finance/README.md

Exact execution is a count diagnostic; deployed contract and role proof, current source and policy, complete live overlap, applicable month and two independent reviews remain required. No filing authority.

Names use the historical asset-name pool component, with three display aliases matching project-published pool names: Main USD Pool, Alt Pool BTC, and the USDC-USX factory pair. No address suffixes are added. Conflicting, missing, unsafe or overlong names fail the whole run. All addresses still come from the source poolAddress field; no contract list is embedded.

Project name references:
- https://github.com/platypus-finance/paraswap-dex-lib/blob/f32cdbaa8ef528b41fbfcfc167f86f117b499f33/src/dex/platypus/config.ts
- https://github.com/platypus-finance/paraswap-dex-lib/blob/6199da59c1d61c91bf3f787f2ebd2049fde83f6a/src/dex/platypus/config.ts
- https://github.com/platypus-finance/DefiLlama-Adapters/blob/9abb9e6a706b51da23f19800fe511ca1c98c797d/projects/platypus-finance/constants.js

The original Main USD Pool is qualified as Deprecated to distinguish the replaced address from the later Main USD Pool in the project's updated configuration. Historical labels do not assert present operation.
