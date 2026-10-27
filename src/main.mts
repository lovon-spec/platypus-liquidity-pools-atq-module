import type { ContractTag } from "atq-types";
import fetch from "node-fetch";

// Current published Messari source B35cLTayreXTML6fXPTrFNSYx7mKyDuuV51LjVxWwWjp.
const deployment = "Qmb7S3fSHij3pej9yuXyNsuK2gGv4xmhaBcbfhuWRG7NJy";
const endpoint = `https://gateway.thegraph.com/api/deployments/id/${deployment}`;
const provider = "0x416a7989a964c9ed60257b064efc3a30fe6bf2ee";
type Meta = {deployment:string;hasIndexingErrors:boolean;block:{number:number;hash:string|null}};
type Row = {id:string;protocol:{id:string};createdBlockNumber:string};
function address(v: unknown): string {
  if (typeof v !== "string" || !/^0x[0-9a-f]{40}$/i.test(v) || /^0x0{40}$/i.test(v)) throw new Error("Invalid contract or context address");
  return v.toLowerCase();
}
function meta(v: unknown, number?: number, hash?: string): Meta {
  const m = v as Meta;
  if (!m || m.deployment !== deployment || m.hasIndexingErrors !== false || !Number.isSafeInteger(m.block?.number) || m.block.number < 1 ||
      (m.block.hash !== null && (typeof m.block.hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(m.block.hash))) ||
      (number === undefined ? !m.block.hash : m.block.number !== number) ||
      (hash !== undefined && m.block.hash !== hash)) throw new Error("Unknown or changed source snapshot");
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
export async function returnTags(chainId:string, apiKey:string): Promise<ContractTag[]> {
  if (chainId !== "43114") throw new Error(`Unsupported Chain ID: ${chainId}`);
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("A Graph API key is required");
  const initial = meta((await query("{_meta{deployment hasIndexingErrors block{number hash}}}",apiKey))._meta);
  const block = `block:{hash:${JSON.stringify(initial.block.hash)}}`, assets: Row[] = [];
  // Every asset is enumerated at one current hash, with a strictly advancing ID cursor.
  let cursor = "";
  for (;;) {
    const data = await query(`{_meta(${block}){deployment hasIndexingErrors block{number hash}} liquidityPools(first:1000,orderBy:id,orderDirection:asc,where:{id_gt:${JSON.stringify(cursor)}},${block}){id protocol{id} createdBlockNumber}}`,apiKey);
    meta(data._meta,initial.block.number,initial.block.hash!);
    const rows = data.liquidityPools;
    if (!Array.isArray(rows) || rows.length > 1000) throw new Error("Invalid entity page");
    for (const row of rows as Row[]) {
      if (typeof row.id !== "string" || row.id <= cursor) throw new Error("Nonadvancing cursor");
      cursor = row.id; address(row.id);
      if (address(row.protocol?.id) !== provider) throw new Error("Unexpected protocol");
      if (typeof row.createdBlockNumber !== "string" || !/^[1-9][0-9]*$/.test(row.createdBlockNumber) ||
          !Number.isSafeInteger(Number(row.createdBlockNumber)) || Number(row.createdBlockNumber) > initial.block.number) throw new Error("Invalid creation block");
      assets.push(row);
    }
    if (rows.length < 1000) break;
  }
  const contracts = new Set<string>();
  for (const asset of assets) {
    const number = Number(asset.createdBlockNumber), historicalBlock = `block:{number:${number}}`;
    // Asset.pool can later move to a treasury or withdrawal helper. Read its original
    // pool at the source's creation block, rather than tagging a later controller.
    const data = await query(`{_meta(${historicalBlock}){deployment hasIndexingErrors block{number hash}} liquidityPool(id:${JSON.stringify(asset.id)},${historicalBlock}){id protocol{id} poolAddress _ignore}}`,apiKey);
    meta(data._meta,number); // The Graph returns null hashes for some historical number reads.
    const row = data.liquidityPool as {id:string;protocol:{id:string};poolAddress:string;_ignore:boolean};
    if (!row || row.id !== asset.id || address(row.protocol?.id) !== provider || typeof row._ignore !== "boolean") throw new Error("Unknown original pool");
    const contract = address(row.poolAddress);
    if (!row._ignore) contracts.add(contract);
  }
  meta((await query(`{_meta(${block}){deployment hasIndexingErrors block{number hash}}}`,apiKey))._meta,initial.block.number,initial.block.hash!);
  const labels = new Set<string>();
  return [...contracts].sort().map(contract => {
    const label = `Liquidity Pool (${contract.slice(2,12)})`;
    if (labels.has(label)) throw new Error("Ambiguous address suffix");
    labels.add(label);
    return {"Contract Address":`eip155:43114:${contract}`,"Project Name":"Platypus Finance","Public Name Tag":label,"UI/Website Link":"https://platypus.finance","Public Note":"Original Platypus Finance pool recorded at an asset's creation block in the source. Asset receipt tokens and underlying tokens are excluded. Includes historical pools; current balances, trading and deposits are not asserted."};
  });
}
