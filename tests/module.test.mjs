import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../dist/main.mjs',import.meta.url),'utf8');
const deployment='Qmb7S3fSHij3pej9yuXyNsuK2gGv4xmhaBcbfhuWRG7NJy',hash='0x'+'ab'.repeat(32),provider='0x416a7989a964c9ed60257b064efc3a30fe6bf2ee';
const address=n=>'0x'+n.toString(16).padStart(10,'0')+'0'.repeat(30);
const asset=n=>({id:address(n),protocol:{id:provider},createdBlockNumber:'50'});
async function fixture(rows,opts={}){
 const requests=[],meta={deployment,hasIndexingErrors:false,block:{number:100,hash}},historical={deployment,hasIndexingErrors:false,block:{number:50,hash:null}};
 const fetch=async(url,options)=>{
  assert.equal(url,'https://gateway.thegraph.com/api/deployments/id/'+deployment);assert.equal(options.headers.Authorization,'Bearer synthetic-key');
  const q=JSON.parse(options.body).query;requests.push(q);let data;
  if(q.includes('liquidityPools(')){
   const cursor=JSON.parse(/id_gt:("[^"]*")/.exec(q)[1]);
   data={_meta:meta,liquidityPools:opts.page??rows.filter(r=>typeof r.id!=='string'||r.id>cursor).slice(0,1000)};
  }else if(q.includes('liquidityPool(')){
   assert.match(q,/block:\{number:50\}/);const id=JSON.parse(/id:("[^"]*")/.exec(q)[1]);
   data={_meta:{...historical,...opts.historyMeta},liquidityPool:opts.missingHistory?null:{id,protocol:{id:provider},poolAddress:opts.pool??id,_ignore:opts.ignored??false,...opts.historyRow}};
  }else data={_meta:{...meta,...(requests.length===1?opts.initialMeta:opts.finalMeta)}};
  if(opts.httpError)return{ok:false};if(opts.graphError)return{ok:true,json:async()=>({errors:[{message:'failed'}]})};
  return{ok:true,json:async()=>({data})};
 };
 const context=vm.createContext({AbortController,setTimeout,clearTimeout}),m=new vm.SourceTextModule(source,{context});
 await m.link(async name=>{assert.equal(name,'node-fetch');return new vm.SyntheticModule(['default'],function(){this.setExport('default',fetch)},{context})});await m.evaluate();return{run:m.namespace.returnTags,requests};
}
test('uses original historical pools and deduplicates shared references',async()=>{
 const {run,requests}=await fixture([asset(1),asset(2)],{pool:address(99)});const tags=await run('43114','synthetic-key');
 assert.equal(tags.length,1);assert.equal(tags[0]['Contract Address'],'eip155:43114:'+address(99));assert.match(tags[0]['Public Note'],/Original/);
 assert.equal(requests.filter(q=>q.includes('liquidityPool(')).length,2);assert.match(requests.at(-1),new RegExp(hash));
});
test('a full page uses the ID cursor and includes a final empty page',async()=>{
 const rows=Array.from({length:1000},(_,i)=>asset(i+1)),f=await fixture(rows);assert.equal((await f.run('43114','synthetic-key')).length,1000);
 const pages=f.requests.filter(q=>q.includes('liquidityPools('));assert.equal(pages.length,2);assert.ok(pages[1].includes(rows.at(-1).id));
});
test('unsupported networks and missing credentials make no requests',async()=>{
 const f=await fixture([asset(1)]);for(const chain of ['1',43114])await assert.rejects(f.run(chain,'synthetic-key'),/Unsupported/);
 await assert.rejects(f.run('43114',' '),/API key/);assert.equal(f.requests.length,0);
});
test('missing or inconsistent historical snapshots cannot produce partial tags',async()=>{
 for(const opts of [{missingHistory:true},{historyMeta:{deployment:'wrong'}},{historyMeta:{hasIndexingErrors:true}},{historyMeta:{block:{number:51,hash:null}}},{historyRow:{id:address(98)}},{historyRow:{protocol:{id:address(99)}}},{historyRow:{_ignore:null}},{pool:address(0)}]){
  const f=await fixture([asset(1),asset(2)],opts);await assert.rejects(f.run('43114','synthetic-key'));
 }
});
test('current snapshot must retain its hash through final seal',async()=>{
 for(const opts of [{initialMeta:{block:{number:100,hash:null}}},{finalMeta:{block:{number:101,hash}}},{finalMeta:{block:{number:100,hash:null}}}]){
  const f=await fixture([asset(1)],opts);await assert.rejects(f.run('43114','synthetic-key'),/snapshot/);
 }
});
test('bad creation blocks, asset addresses, protocols and cursor regressions fail',async()=>{
 for(const row of [{...asset(1),createdBlockNumber:'101'},{...asset(1),createdBlockNumber:'0'},{...asset(1),createdBlockNumber:'1.5'},{...asset(1),id:address(0)},{...asset(1),protocol:{id:address(88)}}]){
  const f=await fixture([row]);await assert.rejects(f.run('43114','synthetic-key'));
 }
 const f=await fixture([asset(1)],{page:[asset(1),asset(1)]});await assert.rejects(f.run('43114','synthetic-key'),/cursor/);
});
test('ignored original controllers are excluded and source failures do not become empty sets',async()=>{
 const f=await fixture([asset(1)],{ignored:true});assert.equal((await f.run('43114','synthetic-key')).length,0);
 for(const opts of [{httpError:true},{graphError:true}]){const f=await fixture([asset(1)],opts);await assert.rejects(f.run('43114','synthetic-key'));}
});
