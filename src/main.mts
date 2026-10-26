import type { ContractTag, ITagService } from "atq-types";
import fetch from "node-fetch";

// Published Messari source B35cLTayreXTML6fXPTrFNSYx7mKyDuuV51LjVxWwWjp.
// https://github.com/messari/subgraphs/blob/master/deployment/decentralized_network_deployments.csv
const deployment = "Qmb7S3fSHij3pej9yuXyNsuK2gGv4xmhaBcbfhuWRG7NJy";
const endpoint = `https://gateway.thegraph.com/api/deployments/id/${deployment}`;
const provider = "0x416a7989a964c9ed60257b064efc3a30fe6bf2ee";
type Row = {id:string;protocol:{id:string};poolAddress:string};
type Meta = {deployment:string;hasIndexingErrors:boolean;block:{number:number;hash:string|null}};
function address(v: unknown): string {
  if (typeof v !== "string" || !/^0x[0-9a-f]{40}$/i.test(v) || /^0x0{40}$/i.test(v)) throw new Error("Invalid contract or context address");
  return v.toLowerCase();
}
function meta(v: unknown, initial?: Meta): Meta {
  const m = v as Meta;
  if (!m || m.deployment !== deployment || m.hasIndexingErrors !== false || !Number.isSafeInteger(m.block?.number) || m.block.number < 1 ||
      (m.block.hash !== null && !/^0x[0-9a-f]{64}$/i.test(m.block.hash)) || !initial && !m.block.hash ||
      initial && (m.block.number !== initial.block.number || m.block.hash !== null && m.block.hash !== initial.block.hash)) throw new Error("Unknown or changed source snapshot");
  return m;
}
async function query(text:string, key:string): Promise<Record<string,unknown>> {
  const c = new AbortController(), timer = setTimeout(() => c.abort(), 30000);
  try {
    const r = await fetch(endpoint, {method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({query:text}),signal:c.signal});
    if (!r.ok) throw new Error("Graph HTTP failure");
    const d = await r.json() as {data?:Record<string,unknown>;errors?:unknown[]};
    if (!d.data || d.errors?.length) throw new Error("Incomplete Graph response");
    return d.data;
  } finally { clearTimeout(timer); }
}
const service: ITagService = {
  async returnTags(chainId:string, apiKey:string|null): Promise<ContractTag[]> {
    if (chainId !== "43114") throw new Error(`Unsupported Chain ID: ${chainId}`);
    if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("A Graph API key is required");
    const initial = meta((await query("{_meta{deployment hasIndexingErrors block{number hash}}}",apiKey))._meta);
    const block = `block:{hash:${JSON.stringify(initial.block.hash)}}`;
    const contracts = new Map<string,string>();
    // Source address IDs have no unique sequential field. Use an ID cursor.
    let cursor = "";
    for (;;) {
      const data = await query(`{_meta(${block}){deployment hasIndexingErrors block{number hash}} liquidityPools(first:1000,orderBy:id,orderDirection:asc,where:{id_gt:${JSON.stringify(cursor)}},${block}){id protocol { id } poolAddress}}`,apiKey);
      meta(data._meta,initial);
      const rows = data.liquidityPools;
      if (!Array.isArray(rows) || rows.length > 1000) throw new Error("Invalid entity page");
      for (const row of rows as Row[]) {
        if (typeof row.id !== "string" || row.id <= cursor) throw new Error("Nonadvancing cursor");
        cursor = row.id;
        if (address(row.protocol?.id) !== provider) throw new Error("Unexpected protocol");
        // The source entity ID identifies an asset contract, not the pool.
        // poolAddress explicitly identifies the shared pool; repeated references are deduplicated.
        const contract = address(row.poolAddress);
        contracts.set(contract, "");
      }
      if (rows.length < 1000) break;
    }
    const labels = new Set<string>();
    return [...contracts].sort(([a],[b]) => a.localeCompare(b)).map(([contract,detail]) => {
      const label = `Liquidity Pool (${contract.slice(2,12)})`;
      if (labels.has(label)) throw new Error("Ambiguous address suffix");
      labels.add(label);
      return {"Contract Address":`eip155:43114:${contract}`,"Project Name":"Platypus Finance","Public Name Tag":label,"UI/Website Link":"https://platypus.finance","Public Note":`Platypus Finance pool contract on Avalanche, from the source poolAddress field. Asset receipt tokens and underlying tokens are excluded. Includes historical pools; current balances, trading and deposits are not asserted.`};
    });
  },
};
export async function returnTags(chainId:string, apiKey:string): Promise<ContractTag[]> {
  return service.returnTags(chainId,apiKey);
}
