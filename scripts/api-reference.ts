import ts from 'typescript';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {queryMethods,sdkActions,botActions} from '../src/gateway/protocol.ts';
export interface ApiParameter {name:string;type:string;optional:boolean;defaultValue:string|null;description:string;}
export interface ApiMethod {name:string;namespace:'sdk'|'bot';category:string;description:string;parameters:ApiParameter[];returns:string;signature:string;remoteSignature:string|null;availability:'query'|'action'|'local'|'remote';source:string;line:number;example:string|null;}
export interface ApiReference {methods:ApiMethod[];types:{name:string;declaration:string}[];}
const tips:Record<string,string>={
 'sdk.getState':'Local SDK returns the mutable World. The gateway returns the latest serialized snapshot, or null before receiving one. Prefer getStateSummary for compact diagnostics.',
 'sdk.getStateSummary':'Compact player, inventory, region and recent-message diagnostics.',
 'sdk.getInventory':'Current inventory slots. This query does not open the inventory tab.',
 'sdk.findInventoryItem':'Find an inventory item by definition ID, exact name or RegExp; explicit objects validate their current slot.',
 'sdk.selectGameTab':'Select an available game tab in the attached client. Inspect getGameTabStatus if a tab is unavailable.',
 'sdk.sendItemOption':'Dispatch a revision-634 interface option index. A successful dispatch does not confirm a server effect.',
 'sdk.getShopState':'Read the current shop title, currency, paid stock and free samples. Check ready before trading.',
 'sdk.cancelAction':'Cancel the pending cooperative action and later batches or route legs. An accepted game packet cannot be undone.',
 'sdk.getItemStats':'Read named cache bonuses and equipment requirements. Server overrides and set effects are excluded.',
 'sdk.compareItems':'Compare candidate minus reference bonuses; a negative speed delta is faster.',
 'sdk.canReach':'Inspect walking geometry and blocking doors without moving; this does not prove spell line of sight or quest permission.',
 'sdk.getQuestState':'Read known quest progress; unknown variables remain unknown rather than being treated as unstarted.',
 'sdk.toSourceCoords':'Map an instanced tile to its source coordinates. Send actions in game coordinates, not source coordinates.',
 'sdk.castSpellOnNpc':'Cast a combat spell and wait for method-specific evidence; inspect fresh refusal messages on failure.',
 'sdk.setAutocast':'Select or clear autocast and observe the server selection. Revision 634 permits staff-free autocasting.',
 'sdk.inspectShopItem':'Open the shop item-info panel and observe its server-supplied quote. Free samples require sample:true. The default observation timeout is 5000 ms.',
 'sdk.call':'Advanced remote dispatch: invoke an allowlisted sdk.* or bot.* method. Observer and controller permissions are still enforced.',
 'sdk.receive':'Internal gateway protocol hook; normal scripts receive state automatically and should not call this directly.',
 'sdk.end':'Close this remote SDK connection and reject its pending calls; it does not log the game account out.',
 'sdk.getShopItemInfo':'Read the currently open item-info quote; returns null when that panel is closed.',
 'bot.openShop':'Approach a nearby Trade/Shop NPC and wait for fresh shop stock. Custom shop dialogues require the dialogue API.',
 'bot.buyFromShop':'Buy supported quantities in sequential batches. Check observed amount, complete and reason for partial fills.',
 'bot.sellToShop':'Sell from inventory, restoring the shop inventory panel if needed. Positive amounts and all are supported.',
 'bot.takeShopSample':'Take explicit free stock, separately from paid items. Inspect returned quantities before retrying.',
 'bot.closeShop':'Close the shop and its side panels before normal inventory actions.',
 'bot.walkTo':'Walk an observed route and handle supported doors. Stairs and other floor changes remain explicit interactions.',
 'bot.talkTo':'Approach an NPC, handle supported doors, and wait for dialogue or a fresh server refusal.',
 'bot.depositItem':'Deposit the requested quantity and observe inventory/bank changes; amounts accept positive integers or all.',
 'bot.withdrawItem':'Withdraw by definition ID, name, RegExp or current bank item; numeric selectors are not slot numbers.',
 'bot.create':'Select a supported production product and quantity from the current creation interface.',
 'bot.chopTree':'Wait for the first new log in inventory; this does not wait for the tree to deplete. XP gain is optional and may be zero on Tutorial Island.',
 'bot.burnLogs':'Wait for log consumption and a fresh game message confirming the fire caught. Inventory removal alone can mean logs were placed on the ground; XP gain is optional.',
 'bot.closeInterface':'Close a supported modal, including shop, bank, equipment stats or production interfaces.',
};
const examples:Record<string,string>={
 'sdk.getStateSummary':'await sdk.getStateSummary()', 'sdk.getInventory':'sdk.getInventory()',
 'sdk.findInventoryItem':"await sdk.findInventoryItem('Tinderbox')",'sdk.getShopState':'await sdk.getShopState()',
 'sdk.findShopItem':"await sdk.findShopItem('Hammer')",'sdk.getShopItems':'await sdk.getShopItems({sample: true})',
 'sdk.inspectShopItem':"await sdk.inspectShopItem('Hammer')",'sdk.getShopItemInfo':'await sdk.getShopItemInfo()',
 'sdk.itemDefinition':'await sdk.itemDefinition(2347)', 'sdk.getItemStats':'await sdk.getItemStats(1277)',
 'sdk.compareItems':'await sdk.compareItems(1279, 1277)', 'sdk.getMessages':'await sdk.getMessages({afterSequence: 0})',
 'sdk.selectGameTab':"await sdk.selectGameTab('Inventory')",'sdk.setRunning':'await sdk.setRunning(true)',
 'sdk.performEmote':"await sdk.performEmote('Wave')",'sdk.getGameTabs':'await sdk.getGameTabs()',
 'sdk.getQuestState':`await sdk.getQuestState("Cook's Assistant")`,
 'sdk.setAutoRetaliate':'await sdk.setAutoRetaliate(true)', 'sdk.setAutocast':"await sdk.setAutocast('Wind Strike')",
 'sdk.setPrayer':"await sdk.setPrayer('Thick Skin', true)", 'sdk.homeTeleport':'await sdk.homeTeleport()',
 'sdk.cancelAction':'await sdk.cancelAction()', 'bot.openShop':'await bot.openShop()',
 'bot.buyFromShop':"await bot.buyFromShop('Hammer', 1)",'bot.sellToShop':"await bot.sellToShop('Logs', 'all')",
 'bot.takeShopSample':"await bot.takeShopSample('Bronze hatchet', 1)",'bot.closeShop':'await bot.closeShop()',
 'bot.depositItem':"await bot.depositItem('Logs', 'all')",'bot.withdrawItem':'await bot.withdrawItem(590, 5)',
 'bot.openBank':'await bot.openBank()', 'bot.chopTree':"const tree = await sdk.findNearbyObject(/^tree$/i);\nif (tree) await bot.chopTree(tree)",
 'bot.burnLogs':"const logs = await sdk.findInventoryItem('Logs');\nif (logs) await bot.burnLogs(logs)",
 'bot.closeInterface':'await bot.closeInterface()',
 'bot.walkTo':'await bot.walkTo(3222, 3218, {tolerance: 2, timeout: 120000})',
 'bot.create':"await bot.create('Ball of wool', 'all')",
};
function category(name:string){
 if(/Shop/.test(name))return 'Shops';if(/Bank|deposit|withdraw/.test(name))return 'Banking';
 if(/Spell|Autocast|Teleport|Magic/.test(name))return 'Magic';if(/Prayer/.test(name))return 'Prayer';
 if(/Health|Combat|Retaliate|EquipmentStats/.test(name))return 'Combat';if(/Quest/.test(name))return 'Quests';
 if(/Dialog|Appearance/.test(name))return 'Dialogue';if(/Route|Reach|walk|SourceCoords|RegionLayout|Running|RunState/.test(name))return 'Movement';
 if(/Creation|Recipe|create|Number|craft|burn|chop|useItem/.test(name))return 'Skills and crafting';
 if(/Inventory|Item|Equipment|equip|drop|pickup|count/.test(name))return 'Items and equipment';
 if(/Npc|Object|Ground/.test(name))return 'Nearby entities';if(/Tab|Interface|Emote/.test(name))return 'Interfaces';
 return 'Session and state';
}
export function collectApiReference(root:string):ApiReference{
 const paths=['src/core/sdk.ts','src/gateway/remote.ts'].map(p=>resolve(root,p));
 const config=ts.readConfigFile(resolve(root,'tsconfig.json'),ts.sys.readFile);if(config.error)throw new Error('Cannot read TypeScript configuration');
 const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root),program=ts.createProgram(paths,parsed.options),checker=program.getTypeChecker();
 const flags=ts.TypeFormatFlags.NoTruncation|ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;
 const methods:ApiMethod[]=[],remote=new Map<string,{signature:string;node:ts.MethodDeclaration}>();
 const publicMethod=(node:ts.ClassElement):node is ts.MethodDeclaration=>ts.isMethodDeclaration(node)&&!!node.name&&!ts.isPrivateIdentifier(node.name)&&!node.modifiers?.some(m=>m.kind===ts.SyntaxKind.PrivateKeyword||m.kind===ts.SyntaxKind.ProtectedKeyword);
 function describe(node:ts.MethodDeclaration,namespace:'sdk'|'bot',availability:ApiMethod['availability']):ApiMethod{
  const source=node.getSourceFile(),signature=checker.getSignatureFromDeclaration(node)!;
  const parameters=node.parameters.map(p=>({name:(p.dotDotDotToken?'...':'')+p.name.getText(source),type:checker.typeToString(checker.getTypeAtLocation(p),p,flags),optional:!!p.questionToken||!!p.initializer,defaultValue:p.initializer?.getText(source)??null,description:ts.displayPartsToString(checker.getSymbolAtLocation(p.name)?.getDocumentationComment(checker)??[])}));
  const name=node.name.getText(source),returns=checker.typeToString(checker.getReturnTypeOfSignature(signature),node,flags),key=`${namespace}.${name}`;
  const printed=`${key}(${parameters.map(p=>`${p.name}${p.optional?'?':''}: ${p.type}${p.defaultValue!==null?` = ${p.defaultValue}`:''}`).join(', ')}): ${returns}`;
  return {name,namespace,category:category(name),description:tips[key]??ts.displayPartsToString(signature.getDocumentationComment(checker)),parameters,returns,signature:printed,remoteSignature:null,availability,source:relative(root,source.fileName),line:source.getLineAndCharacterOfPosition(node.getStart()).line+1,example:examples[key]??(parameters.every(p=>p.optional)?`await ${key}()`:null)};
 }
 const gateway=program.getSourceFile(paths[1])!;for(const c of gateway.statements)if(ts.isClassDeclaration(c)&&c.name?.text==='GatewaySDK')for(const m of c.members)if(publicMethod(m)){const entry=describe(m,'sdk','remote');remote.set(entry.name,{signature:entry.signature,node:m});}
 const sdk=program.getSourceFile(paths[0])!;for(const c of sdk.statements)if(ts.isClassDeclaration(c)&&['BotSDK','BotActions'].includes(c.name?.text??'')){
  const namespace=c.name!.text==='BotActions'?'bot':'sdk';for(const m of c.members)if(publicMethod(m)){
   const name=m.name.getText(sdk),availability=namespace==='bot'?(botActions as readonly string[]).includes(name)?'action':'local':(queryMethods as readonly string[]).includes(name)?'query':(sdkActions as readonly string[]).includes(name)?'action':remote.has(name)?'query':'local';
   const entry=describe(m,namespace,availability);if(namespace==='sdk'&&remote.has(name)){entry.remoteSignature=remote.get(name)!.signature;remote.delete(name);}methods.push(entry);
  }
 }
 for(const {node} of remote.values())methods.push(describe(node,'sdk','remote'));
 methods.sort((a,b)=>a.category.localeCompare(b.category)||a.namespace.localeCompare(b.namespace)||a.name.localeCompare(b.name));
 const declarations=new Map<string,string>();for(const source of program.getSourceFiles()){
  if(!source.fileName.startsWith(resolve(root,'src')+'/'))continue;
  for(const node of source.statements)if(ts.isClassDeclaration(node)&&node.name&&node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)){
   const members=node.members.filter(m=>!ts.isConstructorDeclaration(m)&&!(ts.canHaveModifiers(m)&&ts.getModifiers(m)?.some(x=>x.kind===ts.SyntaxKind.PrivateKeyword||x.kind===ts.SyntaxKind.ProtectedKeyword))).flatMap(m=>{if(!m.name||ts.isPrivateIdentifier(m.name))return [];const name=m.name.getText(source);if(ts.isMethodDeclaration(m)){const sig=checker.getSignatureFromDeclaration(m);return sig?[`  ${name}${checker.signatureToString(sig,m,flags,ts.SignatureKind.Call)};`]:[];}return [`  ${name}: ${checker.typeToString(checker.getTypeAtLocation(m),m,flags)};`];});
   declarations.set(node.name.text,`export declare class ${node.name.text} {\n${members.join('\n')}\n}`);
  }
  for(const node of source.statements)if((ts.isInterfaceDeclaration(node)||ts.isTypeAliasDeclaration(node))&&node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))declarations.set(node.name.text,node.getText(source));
 }
 const selected=new Map<string,string>();function include(text:string){for(const token of text.match(/[A-Za-z_$][\w$]*/g)??[]){const declaration=declarations.get(token);if(declaration&&!selected.has(token)){selected.set(token,declaration);include(declaration);}}}
 for(const method of methods)include(method.signature+' '+(method.remoteSignature??''));
 return {methods,types:[...selected].sort(([a],[b])=>a.localeCompare(b)).map(([name,declaration])=>({name,declaration}))};
}
const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function renderApiReference(api:ApiReference,root:string){
 const template=readFileSync(resolve(root,'docs/api-reference.html'),'utf8');
 const badges={query:'Read-only · gateway',action:'Control · gateway',local:'Local SDK only',remote:'Remote client helper'};
 const types=new Set(api.types.map(t=>t.name));const linked=(text:string)=>text.split(/([A-Za-z_$][\w$]*)/).map(part=>types.has(part)?`<a href="#type-${part}">${escape(part)}</a>`:escape(part)).join('');
 const cards=api.methods.map(m=>{const key=`${m.namespace}.${m.name}`,id=key.replace('.','-');return `<details class="method" id="${id}" data-category="${escape(m.category)}" data-namespace="${m.namespace}" data-availability="${m.availability}"><summary><span class="method-name">${key}</span><span class="badge ${m.availability}">${badges[m.availability]}</span><span class="preview">${escape(m.parameters.map(p=>p.name+(p.optional?'?':'')).join(', ')||'No parameters')}</span></summary><div class="method-body"><div class="method-heading"><span>${escape(m.category)}</span><a class="permalink" href="#${id}" aria-label="Link to ${key}">Permalink</a></div>${m.description?`<p>${escape(m.description)}</p>`:''}<pre class="signature"><code>${linked(m.signature)}</code></pre>${m.remoteSignature&&m.remoteSignature!==m.signature?`<details><summary>Remote signature</summary><pre><code>${linked(m.remoteSignature)}</code></pre></details>`:''}<h3>Parameters</h3>${m.parameters.length?`<div class="table-scroll"><table><thead><tr><th>Name</th><th>Type</th><th>Required</th><th>Default</th></tr></thead><tbody>${m.parameters.map(p=>`<tr><td><code>${escape(p.name)}</code>${p.description?`<p>${escape(p.description)}</p>`:''}</td><td><code>${linked(p.type)}</code></td><td>${p.optional?'Optional':'Required'}</td><td><code>${p.defaultValue===null?'—':escape(p.defaultValue)}</code></td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">No parameters.</p>'}<h3>Returns</h3><pre><code>${linked(m.returns)}</code></pre>${m.example?`<h3>Example</h3><div class="example"><button type="button" class="copy">Copy</button><pre><code>${escape(m.example)}</code></pre></div>`:''}<p class="source">Source: <code>${escape(m.source)}:${m.line}</code></p></div></details>`;}).join('\n');
 const categories=[...new Set(api.methods.map(m=>m.category))];
 return template.replace('<!-- CATEGORY_OPTIONS -->',categories.map(c=>`<option>${escape(c)}</option>`).join('')).replace('<!-- METHODS -->',cards).replace('<!-- NAVIGATION -->',api.methods.map(m=>`<a href="#${m.namespace}-${m.name}">${m.namespace}.${m.name}</a>`).join('')).replace('<!-- TYPES -->',api.types.map(t=>`<details class="type" id="type-${t.name}"><summary>${escape(t.name)}</summary><pre><code>${linked(t.declaration)}</code></pre></details>`).join('')).replace('<!-- METHOD_COUNT -->',String(api.methods.length));
}
export function buildApiReference(root:string){return renderApiReference(collectApiReference(root),root);}
if(import.meta.main){const root=resolve(import.meta.dir,'..'),out=resolve(root,'dist/api');mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'index.html'),buildApiReference(root));console.log('Generated dist/api/index.html from SDK and gateway types.');}
