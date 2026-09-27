import test from 'node:test';
import assert from 'node:assert/strict';
import {computeReceiptDigests,digestObject} from '../src/canonicalization.mjs';
import {validateReceiptChain} from '../src/conformance.mjs';
function chainFor(payload={body:'Approved request'}) {
 const input_hash=digestObject(payload),common={workspace_id:'w',input_hash};
 const action={...common,execution_id:'e',target:'person@example.invalid'};
 const grant={...common,grant_id:'g',target:action.target};
 const decision={...common,schema:'mission-decision/v2',grant_id:'g'};
 const policy={};const receipt={...common,execution_id:'e',grant_id:'g',result:{message_id:'provider-result-is-not-input'}};
 const chain={action,grant,decision,policy,payload,receipt};receipt.digests=computeReceiptDigests(chain);return chain;
}
test('self-consistent receipt digests cannot hide a different approved request payload',()=>{
 const chain=chainFor();chain.payload={body:'Unauthorized replacement'};chain.receipt.digests=computeReceiptDigests(chain);
 const result=validateReceiptChain(chain);assert.equal(result.ok,false);assert.ok(result.errors.some(e=>e.keyword==='payload_commitment_mismatch'));
});
test('exact input accepts a separate provider result, including explicit null input',()=>{
 assert.equal(validateReceiptChain(chainFor()).ok,true);
 assert.equal(validateReceiptChain(chainFor(null)).ok,true);
});
test('missing raw input and divergent decision-v2 commitments fail closed',()=>{
 const missing=chainFor(null);delete missing.payload;assert.equal(validateReceiptChain(missing).ok,false);
 const changed=chainFor();changed.decision.input_hash=digestObject({body:'different approval'});changed.receipt.digests=computeReceiptDigests(changed);
 assert.ok(validateReceiptChain(changed).errors.some(e=>e.path==='/decision/input_hash'));
});
