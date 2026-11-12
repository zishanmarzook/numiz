import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

const nodes=new Map(),events=new Map(),storage=new Map();
function node(selector){if(!nodes.has(selector)){const classes=new Set();nodes.set(selector,{innerHTML:'',textContent:'',value:'',open:false,dataset:{},files:[],classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},showModal(){this.open=true;},close(){this.open=false;},addEventListener(){},focus(){},setSelectionRange(){},click(){},getBoundingClientRect(){return {left:0,right:500,top:0,bottom:500};}});}return nodes.get(selector);}
globalThis.document={querySelector:node,addEventListener(name,callback){events.set(name,callback);},createElement(){return node('download');}};
globalThis.window={addEventListener(name,callback){events.set('window-'+name,callback);},scrollTo(){}};
let hash='';globalThis.location={get hash(){return hash;},set hash(value){hash=value.startsWith('#')?value:'#'+value;events.get('window-hashchange')?.();}};
globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
globalThis.setTimeout=()=>0;globalThis.clearTimeout=()=>{};
globalThis.FormData=class{constructor(form){this.data=form.values;}get(key){return this.data[key]??'';}getAll(key){const value=this.data[key];return Array.isArray(value)?value:value?[value]:[];}};
await import('../dist/app.js');
const state=()=>JSON.parse(storage.get('numiz-budget-buddy-v1'));
const click=async(action,extra={})=>events.get('click')({target:{closest:()=>({dataset:{action,...extra}})}});
const submit=(formId,values,entryId='')=>events.get('submit')({preventDefault(){},target:{id:formId,dataset:{id:entryId},values,reportValidity:()=>true}});

test('sample workspace renders honest monthly totals and actual category charts',()=>{
 assert.equal(state().demo,true);assert.match(node('#main').innerHTML,/sample budget/);assert.match(node('#main').innerHTML,/Money in, money out/);assert.match(node('#main').innerHTML,/Cumulative monthly income/);assert.match(node('#mobile-nav').innerHTML,/Split/);
});
test('starting fresh clears sample records and selects an explicit currency',async()=>{
 node('#fresh-currency').value='INR';await click('confirm-fresh');assert.equal(state().demo,false);assert.equal(state().currency,'INR');assert.equal(state().transactions.length,0);assert.equal(state().goals.length,0);
});
test('expense and income forms store exact cents and edit without duplicating',async()=>{
 submit('transaction-form',{type:'expense',name:'Groceries',amount:'12.34',category:'Groceries',date:'2026-11-12'});assert.equal(state().transactions[0].amountCents,1234);const entryId=state().transactions[0].id;
 submit('transaction-form',{type:'expense',name:'Groceries updated',amount:'20.01',category:'Groceries',date:'2026-11-12'},entryId);assert.equal(state().transactions.length,1);assert.equal(state().transactions[0].amountCents,2001);
 submit('transaction-form',{type:'income',name:'Pay',amount:'100.00',category:'Salary',date:'2026-11-01'});assert.equal(state().transactions.length,2);
});
test('invalid fractions and zero amounts cannot create transactions',()=>{
 const before=state().transactions.length;submit('transaction-form',{type:'expense',name:'Bad input',amount:'0.001',category:'Other',date:'2026-11-12'});assert.equal(state().transactions.length,before);assert.match(node('#form-error').textContent,/decimal/);submit('transaction-form',{type:'expense',name:'Zero',amount:'0',category:'Other',date:'2026-11-12'});assert.equal(state().transactions.length,before);
});
test('category budgets reject duplicates and savings contributions update a separate goal record',()=>{
 submit('budget-form',{category:'Groceries',amount:'200.00'});assert.equal(state().budgets[0].limitCents,20000);submit('budget-form',{category:'Groceries',amount:'300.00'});assert.equal(state().budgets.length,1);
 submit('goal-form',{name:'Rainy day',target:'1000.00',saved:'50.00',targetDate:'2027-01-01'});const goalId=state().goals[0].id,beforeTx=state().transactions.length;submit('contribute-form',{amount:'5.25'},goalId);assert.equal(state().goals[0].savedCents,5525);assert.equal(state().transactions.length,beforeTx);
});
test('shared bills record payer and selected participants without adding personal expenses',()=>{
 submit('person-form',{name:'Alex'});submit('person-form',{name:'Sam'});const people=state().participants;assert.equal(people.length,2);const before=state().transactions.length;
 submit('bill-form',{title:'Dinner',amount:'10.01',paidBy:people[0].id,participant:people.map(p=>p.id),date:'2026-11-12'});assert.equal(state().bills[0].amountCents,1001);assert.equal(state().bills[0].participants.length,2);assert.equal(state().transactions.length,before);
});
test('people referenced by a bill cannot be removed, and deletions support undo',async()=>{
 const personId=state().participants[0].id;await click('delete-person',{id:personId});assert.equal(state().participants.length,2);assert.match(node('#toast').innerHTML,/recorded bill/);
 const tx=state().transactions[0],count=state().transactions.length;await click('delete-transaction',{id:tx.id});assert.equal(state().transactions.length,count-1);await click('undo');assert.equal(state().transactions.length,count);assert.equal(state().transactions[0].id,tx.id);
});
test('currency cannot silently relabel an existing personal budget',async()=>{
 const currency=state().currency;node('#currency-setting').value='EUR';await events.get('change')({target:{id:'currency-setting',value:'EUR'}});assert.equal(state().currency,currency);
 await click('settings');assert.match(node('#main').innerHTML,/Currency changes do not convert amounts/);assert.match(node('#main').innerHTML,/id="currency-setting"[^>]*disabled/);
});
test('all six screens render from live saved records without runtime errors',()=>{
 for(const route of ['overview','transactions','budgets','savings','split','settings']){location.hash=route;assert.match(node('#main').innerHTML,/<h1>/);assert.doesNotMatch(node('#main').innerHTML,/NaN|undefined/);}
});
test('invalid backups leave the current saved workspace untouched',async()=>{
 const before=storage.get('numiz-budget-buddy-v1');await events.get('change')({target:{id:'import-file',files:[{size:20,text:async()=>JSON.stringify({version:1,currency:'FAKE'})}]}});assert.equal(storage.get('numiz-budget-buddy-v1'),before);assert.match(node('#toast').innerHTML,/could not be imported/);
});
test('imported category names cannot read inherited object properties in budget cards',async()=>{
 const backup=state();backup.transactions=[];backup.budgets=[{id:'special-budget',category:'constructor',limitCents:1000},{id:'special-budget-two',category:'__proto__',limitCents:2000}];backup.goals=[];backup.bills=[];backup.participants=[];
 await events.get('change')({target:{id:'import-file',files:[{size:100,text:async()=>JSON.stringify(backup)}]}});await click('confirm-import');location.hash='budgets';assert.match(node('#main').innerHTML,/constructor/);assert.match(node('#main').innerHTML,/__proto__/);assert.doesNotMatch(node('#main').innerHTML,/NaN|undefined/);
});
test('changing currency after deleting the last record invalidates old-currency undo',async()=>{
 node('#fresh-currency').value='USD';await click('confirm-fresh');submit('transaction-form',{type:'expense',name:'Coffee',amount:'5.00',category:'Food & dining',date:'2026-11-12'});const entryId=state().transactions[0].id;await click('delete-transaction',{id:entryId});assert.equal(state().transactions.length,0);
 await events.get('change')({target:{id:'currency-setting',value:'EUR'}});assert.equal(state().currency,'EUR');await click('undo');assert.equal(state().transactions.length,0);
});
test('failed device persistence stays visible and never reports a saved record',()=>{
 const setItem=localStorage.setItem;const before=storage.get('numiz-budget-buddy-v1');localStorage.setItem=()=>{throw Error('Storage quota exceeded');};
 submit('transaction-form',{type:'expense',name:'Session only',amount:'1.23',category:'Other',date:'2026-11-12'});assert.equal(storage.get('numiz-budget-buddy-v1'),before);assert.match(node('#main').innerHTML,/Device storage is unavailable/);assert.match(node('#toast').innerHTML,/in this session only/);assert.doesNotMatch(node('#toast').innerHTML,/record has been saved/);
 localStorage.setItem=setItem;
});
