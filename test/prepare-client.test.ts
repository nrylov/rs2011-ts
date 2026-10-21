import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareClient} from '../scripts/prepare-void-client-bridge.ts';
test('client preparation patches a separate tree and validates browser size and packet anchors',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rs2011-client-')),source=join(dir,'source'),output=join(dir,'output');
 const client='            InboundPacketHeader.aInboundPacketHeader_9456 = InboundPacketHeader.aInboundPacketHeader_3145';
 const login='                                FrameStatsReset.method1135(0)\n';
 const loader='        instance = this\n        setSize(window.innerWidth / UiScale.factor, window.innerHeight / UiScale.factor)';
 try{
  for(const path of ['src/commonMain/kotlin','src/jsMain/kotlin','src/jvmMain/kotlin'])await mkdir(join(source,path),{recursive:true});
  await writeFile(join(source,'src/commonMain/kotlin/Client.kt'),client);await writeFile(join(source,'src/commonMain/kotlin/SceneNodeDeque.kt'),login);await writeFile(join(source,'src/jsMain/kotlin/main.js.kt'),loader);await writeFile(join(source,'build.gradle.kts'),'    jvmToolchain(24)\n');
  await prepareClient(source,output,true);
  expect(await readFile(join(source,'src/commonMain/kotlin/Client.kt'),'utf8')).toBe(client);
  expect(await readFile(join(output,'src/commonMain/kotlin/Client.kt'),'utf8')).toContain('SdkBridge.packet');
  expect(await readFile(join(output,'src/jsMain/kotlin/main.js.kt'),'utf8')).toContain('host?.clientWidth');
  expect(await readFile(join(output,'src/jsMain/kotlin/main.js.kt'),'utf8')).toContain('SdkBridge.boot()');
  expect(await readFile(join(output,'src/jsMain/kotlin/SdkBridge.kt'),'utf8')).toContain('api.login');
  expect(await readFile(join(output,'build.gradle.kts'),'utf8')).not.toContain('jvmToolchain(24)');
  await expect(prepareClient(source,output)).rejects.toThrow();
  await writeFile(join(source,'src/jsMain/kotlin/main.js.kt'),'unexpected source');await expect(prepareClient(source,join(dir,'invalid'))).rejects.toThrow('browser sizing');
 }finally{await rm(dir,{recursive:true,force:true});}
});
