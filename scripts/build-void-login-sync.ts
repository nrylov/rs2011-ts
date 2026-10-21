/** Build an optional Void classpath overlay; never modify the original server JAR. */
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
const server=process.env.VOID_SERVER_JAR,compiler=process.env.VOID_KOTLIN_COMPILER_CLASSPATH;
if(!server||!compiler)throw new Error('Set VOID_SERVER_JAR and VOID_KOTLIN_COMPILER_CLASSPATH (compiler and its dependencies)');
const java=process.env.VOID_JAVA??'java',root=resolve(import.meta.dir,'..'),out=resolve(process.env.VOID_LOGIN_SYNC_OUT??join(root,'dist/void-login-sync.jar'));
const temporary=await mkdtemp(join(tmpdir(),'void-login-sync-'));
try{
 const classes=join(temporary,'classes');
 const sources=[join(root,'compat/void/LoginStateSync.kt')];if(process.env.VOID_TUTORIAL_DOOR_FIX==='1')sources.push(join(root,'compat/void/TutorialObjects.kt'));
 const compile=Bun.spawn([java,'-cp',compiler,'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-Xskip-metadata-version-check','-Xskip-prerelease-check','-Xallow-unstable-dependencies','-jvm-target','21','-classpath',resolve(server),'-d',classes,...sources],{stdout:'inherit',stderr:'inherit'});
 if(await compile.exited)throw new Error('Login-state listener compilation failed');
 await mkdir(resolve(out,'..'),{recursive:true});
 const pack=Bun.spawn(['python3','-c',`
import pathlib,zipfile,hashlib,sys
server,classes,output=sys.argv[1:]
with zipfile.ZipFile(server) as original:
    registry=original.read('scripts.txt').decode()
name='content.sdk.LoginStateSync'
if name not in [line.split('|')[-1] for line in registry.splitlines()]:registry=registry.rstrip()+'\\n'+name+'\\n'
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as overlay:
    overlay.writestr('scripts.txt',registry)
    overlay.writestr('server-sha256.txt',hashlib.sha256(pathlib.Path(server).read_bytes()).hexdigest()+'\\n')
    for file in pathlib.Path(classes).rglob('*'):
        if file.is_file():overlay.write(file,file.relative_to(classes).as_posix())
`,resolve(server),classes,out],{stdout:'inherit',stderr:'inherit'});
 if(await pack.exited)throw new Error('Login-state overlay packaging failed');
 console.log(`Built ${out}\nRun Java with this overlay first on the classpath, followed by the matching server JAR.`);
}finally{await rm(temporary,{recursive:true,force:true});}
