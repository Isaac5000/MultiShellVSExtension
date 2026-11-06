'use strict';
const assert=require('node:assert/strict');
const {mapConcurrent}=require('../out/bounded-map.js');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 let active=0,peak=0;
 const result=await Promise.race([
  mapConcurrent(Array.from({length:24},(_,i)=>i),6,async (item,i)=>{
   assert.equal(item,i);
   active++;peak=Math.max(peak,active);
   await sleep(10);
   active--;
   return item*2;
  }),
  sleep(1800).then(()=>{throw Error('Possible serial execution / stalled concurrency');})
 ]);
 assert.deepEqual(result,Array.from({length:24},(_,i)=>i*2));
 assert.ok(peak>=2,'Independent tasks must overlap; peak='+peak);
 assert.ok(peak<=6,'Concurrency must be bounded to six tasks; peak='+peak);
 assert.deepEqual(await mapConcurrent([],6,async()=>{throw Error('unexpected');}),[]);
 await assert.rejects(mapConcurrent([1],0,async()=>1),/limit|concurrency/i);
 let calls=0;
 await assert.rejects(mapConcurrent([1,2],2,async()=>{calls++;throw Error('secret unavailable');}),
  /secret unavailable/);
 assert.equal(calls,2);
 console.log('PASS bounded async mapper preserves order, overlaps work, limits concurrency, handles failures');
})().catch(error=>{console.error(error);process.exitCode=1;});
