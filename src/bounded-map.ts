/** Run independent I/O tasks with a bounded number of in-flight calls.
 * Results retain input order. A failure rejects rather than returning
 * incomplete data (especially important for permission/credential status).
 */
export async function mapConcurrent<T,U>(
    input:readonly T[],limit:number,task:(value:T,index:number)=>Promise<U>
):Promise<U[]>{
    if(!Number.isSafeInteger(limit)||limit<1){
        throw new Error('Concurrency limit must be a positive integer.');
    }
    if(!input.length){return [];}
    const result=new Array<U>(input.length);
    let cursor=0;
    let failed=false;
    async function worker():Promise<void>{
        while(!failed){
            const index=cursor++;
            if(index>=input.length){return;}
            try{result[index]=await task(input[index],index);}
            catch(error){failed=true;throw error;}
        }
    }
    await Promise.all(Array.from({length:Math.min(input.length,limit)},()=>worker()));
    return result;
}
