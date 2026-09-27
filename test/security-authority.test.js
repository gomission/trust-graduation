import test from 'node:test';
import assert from 'node:assert/strict';
import {createProviderGate,createApprovalGrant,createMemoryGrantStore,TrustGraduation} from '../src/index.js';
const time=new Date('2026-09-27T10:00:00Z');
const action={actionClass:'email.send.external',workspace:'audit',principal:'audit-user',tenant:'audit',requestedBy:'agent',target:'person@example.invalid',input:{body:'Approved content'}};
const grantFor=binding=>createApprovalGrant({binding,grantId:'signed-grant',issuer:'approved-issuer',issuedAt:time.toISOString()});

test('caller grant mutation cannot turn a consumed authenticated identity into a new grant',async()=>{
 let releaseAuth,started;let calls=0;
 const reached=new Promise(r=>started=r);const store=createMemoryGrantStore();
 const gate=createProviderGate({store,now:()=>time,authenticateGrant:async({approval})=>{
  assert.equal(Object.isFrozen(approval),true);const verified=approval.grantId==='signed-grant';
  started();await new Promise(r=>releaseAuth=r);return verified;
 },provider:async()=>({id:++calls}),writeReceipt:async()=>true});
 const binding=gate.prepare(action),approval=grantFor(binding);await store.consume(approval);
 const pending=gate.execute({binding,approval,action});await reached;
 approval.grantId='unverified-new-grant';releaseAuth();
 const result=await pending;assert.equal(result.ok,false);assert.equal(result.reason,'grant_already_consumed');assert.equal(calls,0);
});

for(const phase of ['issuer','store']) test(`grant expiry during ${phase} check prevents provider invocation`,async()=>{
 let clock=time,calls=0;const realStore=createMemoryGrantStore();
 const expire=()=>clock=new Date(time.getTime()+11*60_000);
 const gate=createProviderGate({now:()=>clock,
  store:{consume:async id=>{const r=await realStore.consume(id);if(phase==='store')expire();return r;}},
  authenticateGrant:async()=>{if(phase==='issuer')expire();return true;},
  provider:async()=>({id:++calls}),writeReceipt:async()=>true});
 const binding=gate.prepare(action),approval=grantFor(binding);
 const result=await gate.execute({binding,approval,action});
 assert.equal(result.ok,false);assert.equal(result.reason,'grant_expired');assert.equal(calls,0);
});

test('explicit policy approval cannot skip single-use consumption at medium risk',()=>{
 const tg=new TrustGraduation({workspace:'audit',now:()=>time,policies:[{actionClass:'custom.change',riskClass:'medium',minimumLevel:1,requiresApproval:true,externalSideEffects:'external_write'}]});
 const request={actionClass:'custom.change',context:{target:'example.invalid',input:{body:'approved'}}};
 const decision=tg.canExecute(request);const approval=grantFor(decision.actionBinding);
 const checked=tg.canExecute({...request,approval});assert.equal(checked.allowed,false);assert.equal(checked.mode,'pending_atomic_consumption');assert.equal(checked.requiresAtomicConsumption,true);
});

test('zero-weight evidence retains audit counts but cannot graduate authority',async()=>{
 const {summarizeEvidence,tierFromEvidence}=await import('../src/index.js');
 const evidence=Array.from({length:10},()=>({actionClass:'email.send.internal',type:'approved',provenanceWeight:0}));
 const summary=summarizeEvidence(evidence,'email.send.internal');
 assert.equal(summary.positive,10);assert.equal(summary.approvals,10);assert.equal(summary.weightedPositive,0);
 assert.equal(summary.graduationPositive,0);assert.equal(summary.graduationApprovals,0);assert.equal(tierFromEvidence(summary),'gated');
 const gate=new TrustGraduation({workspace:'audit',now:()=>time,evidence});
 assert.equal(gate.canExecute({actionClass:'email.send.internal'}).allowed,false);
});

test('positive evidence still graduates and zero-weight padding does not satisfy thresholds',async()=>{
 const {summarizeEvidence,tierFromEvidence}=await import('../src/index.js');
 const positive=Array.from({length:5},()=>({actionClass:'draft.response',type:'approved',sourceType:'principal'}));
 const padding=Array.from({length:50},()=>({actionClass:'draft.response',type:'approved',evidenceWeight:0}));
 const summary=summarizeEvidence([...positive,...padding],'draft.response');
 assert.equal(summary.positive,55);assert.equal(summary.graduationPositive,5);assert.equal(tierFromEvidence(summary),'supervised');
 assert.equal(tierFromEvidence(summarizeEvidence([...positive,...positive],'draft.response')),'auto_capped');
});
