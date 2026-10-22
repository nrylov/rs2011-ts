import{open}from'node:fs/promises';
export const CLIENT_ERROR_PREFIX='RS2011_CLIENT_ERROR ';
/** Read only the current launch's bounded structured failure; never echo credentials or arbitrary logs. */
export async function clientFailure(path:string,offset:number,secrets:Record<string,string>){
 let file;try{file=await open(path,'r');const size=(await file.stat()).size,start=Math.max(offset,size-8192),bytes=Buffer.alloc(Math.max(0,size-start));await file.read(bytes,0,bytes.length,start);
  for(const line of bytes.toString().split(/\r?\n/).reverse())if(line.startsWith(CLIENT_ERROR_PREFIX)){let value;try{value=JSON.parse(line.slice(CLIENT_ERROR_PREFIX.length));}catch{continue;}if(typeof value?.message!=='string')continue;let message=value.message;for(const [key,secret]of Object.entries(secrets))if(/PASSWORD|TOKEN|SECRET/i.test(key)&&secret)message=message.replaceAll(secret,'[redacted]');return message.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,1024);}
 }catch{return undefined;}finally{await file?.close();}return undefined;
}
