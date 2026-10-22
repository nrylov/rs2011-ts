import {patchBackgroundLoop} from './client-background-loop.ts';
import{cp,mkdir,readFile,writeFile}from'node:fs/promises';
import{resolve,join,basename}from'node:path';
import{createHash}from'node:crypto';
export async function prepareClient(source:string,output:string,currentJvm=false){
 source=resolve(source);output=resolve(output);if(output===source||output.startsWith(source+'/'))throw new Error('Use a separate output directory outside the source checkout');
 const files=['src/commonMain/kotlin/Client.kt','src/commonMain/kotlin/SceneNodeDeque.kt','build.gradle.kts','src/jsMain/kotlin/main.js.kt','src/jsMain/kotlin/PlatformLoop.js.kt'];const text=await Promise.all(files.map(path=>readFile(join(source,path),'utf8')));
 const packet='            InboundPacketHeader.aInboundPacketHeader_9456 = InboundPacketHeader.aInboundPacketHeader_3145',login='                                FrameStatsReset.method1135(0)\n';
 if(text[0].split(packet).length!==2||text[1].split(login).length!==2||text[0].includes('SdkBridge.packet')||text[1].includes('SdkBridge.login'))throw new Error('Unexpected or already-patched client source; review this revision before building');
 if(text[3].split('        instance = this\n').length!==2||text[3].split('        setSize(window.innerWidth / UiScale.factor, window.innerHeight / UiScale.factor)').length!==2)throw new Error('Unexpected browser sizing/boot source; review this revision before building');
 const backgroundLoop=patchBackgroundLoop(text[4]);
 await mkdir(output);await cp(source,output,{recursive:true,filter:path=>!['.git','.gradle','build','node_modules'].includes(basename(path))});
 for(const[folder,suffix]of [['commonMain','common'],['jvmMain','jvm'],['jsMain','js']])await cp(resolve(import.meta.dir,`../compat/void-client/SdkBridge.${suffix}.kt`),join(output,`src/${folder}/kotlin/SdkBridge.kt`));
 await writeFile(join(output,files[0]),text[0].replace(packet,'            SdkBridge.packet(InboundPacketHeader.aInboundPacketHeader_6584!!.method1058(127.toByte()), CircleRasterizer.aClass348_Sub49_Sub2_3813!!.aByteArray7154!!, RadialTextureNode.anInt9341)\n'+packet));
 await writeFile(join(output,files[1]),text[1].replace(login,login+'                                SdkBridge.login(QuickChatType.anInt9591, InboundPacketHeader.aInboundPacketHeader_6584!!.method1058(127.toByte()), CircleRasterizer.aClass348_Sub49_Sub2_3813!!.aByteArray7154!!, RadialTextureNode.anInt9341)\n'));
 await writeFile(join(output,files[3]),text[3].replace('        instance = this\n','        instance = this\n        SdkBridge.boot()\n').replace('        setSize(window.innerWidth / UiScale.factor, window.innerHeight / UiScale.factor)','        val host = document.getElementById("client")\n        setSize((host?.clientWidth ?: window.innerWidth) / UiScale.factor, (host?.clientHeight ?: window.innerHeight) / UiScale.factor)'));
 await writeFile(join(output,files[4]),backgroundLoop);
 if(currentJvm)await writeFile(join(output,'build.gradle.kts'),text[2].replace(/^[ \t]*jvmToolchain\(24\)[ \t]*$/m,'    // JS-only SDK build uses the current Gradle JVM.'));
 await writeFile(join(output,'sdk-bridge-source.json'),JSON.stringify({source,files:Object.fromEntries(files.map((path,i)=>[path,createHash('sha256').update(text[i]).digest('hex')]))},null,2)+'\n');return output;
}
if(import.meta.main){const[source,output,...flags]=process.argv.slice(2);if(!source||!output||flags.some(f=>f!=='--current-jvm'))throw new Error('Usage: bun scripts/prepare-void-client-bridge.ts /path/to/void-client /new/output [--current-jvm]');console.log('Prepared bridge source:',await prepareClient(source,output,flags.includes('--current-jvm')));}
