import test from 'node:test';
import assert from 'node:assert/strict';
import {storageRecordFields,storageValue,storageFieldLabel} from '../../src/lib/storage-records.ts';
test('storage records use readable ordered labels and preserve redacted values',()=>{
 assert.deepEqual(storageRecordFields({id:'r1',party_size:2,code:'BB-TEST',email:'[redacted]',name:'Example'}),[{label:'Name',value:'Example'},{label:'Email',value:'[redacted]'},{label:'Guests',value:'2'},{label:'Confirmation code',value:'BB-TEST'},{label:'Record ID',value:'r1'}]);
 assert.equal(storageFieldLabel('delivery_address'),'Delivery address');assert.equal(storageFieldLabel('firstName'),'First Name');
});
test('non-object, missing, nested and boolean values are readable without raw JSON',()=>{
 assert.equal(storageValue({city:'Example',active:true}),'City: Example; Active: Yes');assert.equal(storageValue([1,2]),'1 • 2');assert.equal(storageValue(null),'Not provided');assert.equal(storageValue(false),'No');assert.deepEqual(storageRecordFields('hello'),[{label:'Value',value:'hello'}]);assert.deepEqual(storageRecordFields({}),[]);
});
