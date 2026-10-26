import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderGate, createApprovalGrant, createMemoryGrantStore } from '../src/index.js';
const start = Date.parse('2026-10-26T12:00:00Z');
function fixture({stage, expire=false, mutate=false}={}) {
  let time=start, calls=0, consumes=0, seen;
  const action={actionClass:'email.send.external',workspace:'w',principal:'p',tenant:'t',requestedBy:'a',target:'ok@example.com',input:{body:'reviewed',nested:{to:'ok@example.com'}},constraints:{scope:'once'}};
  const memory=createMemoryGrantStore();
  const change=()=>{ if(expire) time=start+1000; if(mutate){action.input.nested.to='changed@example.com';action.input.body='changed';action.target='changed@example.com';} };
  const gate=createProviderGate({now:()=>new Date(time),grantLifetimeMs:1000,
    authenticateGrant:async()=>{if(stage==='auth')change();return true;},
    store:{consume:async identity=>{consumes++;if(stage==='store')change();return memory.consume(identity);}},
    provider:async(input,context)=>{calls++;seen={input,action:context.action};return {id:'effect'};},writeReceipt:async()=>true});
  const binding=gate.prepare(action), approval=createApprovalGrant({binding,grantId:'g',issuer:'i',issuedAt:new Date(start).toISOString()});
  return {run:()=>gate.execute({binding,approval,action}),state:()=>({calls,consumes,seen})};
}
for(const stage of ['auth','store']) {
 test(`expiry during ${stage} prevents dispatch at exact expiry`,async()=>{
   const f=fixture({stage,expire:true});const result=await f.run();
   assert.equal(result.reason,'grant_expired');assert.equal(result.providerCalled,false);assert.equal(f.state().calls,0);
   assert.equal(f.state().consumes,stage==='auth'?0:1);
 });
 test(`caller mutation during ${stage} cannot change reviewed provider input`,async()=>{
   const f=fixture({stage,mutate:true});const result=await f.run();assert.equal(result.ok,true);
   assert.deepEqual(f.state().seen.input,{body:'reviewed',nested:{to:'ok@example.com'}});
   assert.equal(f.state().seen.action.target,'ok@example.com');
 });
}
test('unchanged action dispatches once and replay stays blocked',async()=>{
 const f=fixture();assert.equal((await f.run()).ok,true);assert.equal((await f.run()).reason,'grant_already_consumed');assert.equal(f.state().calls,1);
});

test('authentication receives deeply immutable JSON snapshots, not caller references',async()=>{
 let callerAction,callerApproval;
 const gate=createProviderGate({store:createMemoryGrantStore(),now:()=>new Date(start),
  authenticateGrant:async({action,approval,binding})=>{
   assert.notEqual(action,callerAction);assert.notEqual(approval,callerApproval);
   assert.throws(()=>{action.input.nested.value='changed';},TypeError);
   assert.throws(()=>{binding.constraints.scope='all';},TypeError);
   assert.throws(()=>{approval.issuer='other';},TypeError);
   callerApproval.issuer='other';callerApproval.grantId='other';
   return true;
  },provider:async(input,context)=>{assert.equal(input.nested.value,'reviewed');assert.equal(context.approval.issuer,'i');return {id:'ok'};},writeReceipt:async()=>true});
 callerAction={actionClass:'email.send.external',workspace:'w',principal:'p',target:'t',input:{nested:{value:'reviewed'}},constraints:{scope:'once'}};
 const binding=gate.prepare(callerAction);callerApproval=createApprovalGrant({binding,grantId:'g',issuer:'i',issuedAt:new Date(start).toISOString()});
 const result=await gate.execute({binding,approval:callerApproval,action:callerAction});
 assert.equal(result.ok,true);assert.equal(result.receipt.grantId,'g');
});

test('expiry after consumption does not refund the single-use grant',async()=>{
 let clock=start, calls=0;const memory=createMemoryGrantStore();
 const gate=createProviderGate({store:{consume:async id=>{const r=await memory.consume(id);clock=start+1000;return r;}},now:()=>new Date(clock),grantLifetimeMs:1000,
 authenticateGrant:async()=>true,provider:async()=>{calls++;return {};},writeReceipt:async()=>true});
 const action={actionClass:'email.send.external',principal:'p',target:'t',input:{body:'reviewed'}};
 const binding=gate.prepare(action),approval=createApprovalGrant({binding,grantId:'g',issuer:'i',issuedAt:new Date(start).toISOString()});
 assert.equal((await gate.execute({binding,approval,action})).reason,'grant_expired');
 clock=start; // Test-only rewind exposes the consumed identity rather than expiry.
 assert.equal((await gate.execute({binding,approval,action})).reason,'grant_already_consumed');assert.equal(calls,0);
});

test('a changed input supplied before execute is rejected, not silently restored',async()=>{
 let calls=0;const gate=createProviderGate({store:createMemoryGrantStore(),now:()=>new Date(start),authenticateGrant:async()=>true,provider:async()=>{calls++;},writeReceipt:async()=>true});
 const action={actionClass:'email.send.external',principal:'p',target:'t',input:{body:'reviewed'}};
 const binding=gate.prepare(action),approval=createApprovalGrant({binding,grantId:'g',issuer:'i',issuedAt:new Date(start).toISOString()});
 action.input.body='changed';assert.equal((await gate.execute({binding,approval,action})).reason,'action_hash_mismatch');assert.equal(calls,0);
});
