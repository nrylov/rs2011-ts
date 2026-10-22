import {beforeAll,test,expect} from 'bun:test';
import {resolve} from 'node:path';
import {collectApiReference,renderApiReference,type ApiReference} from '../scripts/api-reference.ts';
import {queryMethods,sdkActions,botActions} from '../src/gateway/protocol.ts';
const root=resolve(import.meta.dir,'..');let api:ApiReference,html:string;
beforeAll(()=>{api=collectApiReference(root);html=renderApiReference(api,root);});
test('API reference covers every gateway method and distinguishes controller-only actions',()=>{
 for(const name of queryMethods)expect(api.methods.find(m=>m.namespace==='sdk'&&m.name===name)?.availability).toBe('query');
 for(const name of sdkActions)expect(api.methods.find(m=>m.namespace==='sdk'&&m.name===name)?.availability).toBe('action');
 for(const name of botActions)expect(api.methods.find(m=>m.namespace==='bot'&&m.name===name)?.availability).toBe('action');
 expect(api.methods.find(m=>m.namespace==='bot'&&m.name==='interactNpc')?.availability).toBe('local');
 expect(api.methods.find(m=>m.name==='getStateAge')?.availability).toBe('remote');
});
test('parameter defaults, optional arguments, aliases and return types come from source',()=>{
 const shop=api.methods.find(m=>m.name==='buyFromShop')!;expect(shop.parameters).toEqual([
  {name:'item',type:'ItemSelector',optional:false,defaultValue:null,description:''},
  {name:'amount',type:'ShopAmount',optional:true,defaultValue:'1',description:''},
  {name:'timeout',type:'number',optional:true,defaultValue:'20000',description:''},
 ]);expect(shop.returns).toContain('complete: boolean');expect(shop.example).toContain("'Hammer'");
 const inspect=api.methods.find(m=>m.name==='inspectShopItem')!;expect(inspect.remoteSignature).toContain('...args:');
 const state=api.methods.find(m=>m.name==='getState')!;expect(state.returns).toBe('World');expect(state.remoteSignature).toContain('null');
 expect(api.types.find(t=>t.name==='ShopAmount')?.declaration).toContain("'all'");expect(api.types.find(t=>t.name==='World')?.declaration).toContain('containers: Map<string, Item[]>');
});
test('HTML includes deep links, searchable categories, type definitions and escaped source examples',()=>{
 expect(html).toContain('id="sdk-inspectShopItem"');expect(html).toContain('id="bot-buyFromShop"');expect(html).toContain('href="#type-ShopAmount"');expect(html).toContain('id="type-ShopAmount"');expect(html).toContain('id="search"');expect(html).toContain('navigator.clipboard.writeText');expect(html).not.toContain('<!-- METHODS -->');
 const hostile:ApiReference={methods:[{...api.methods[0],description:'<script>alert(1)</script>',example:'</code><img src=x onerror=alert(1)>',parameters:[{name:'x',type:'<img>',optional:false,defaultValue:'"hello"',description:'<bad>'}]}],types:[]};
 const safe=renderApiReference(hostile,root);expect(safe).not.toContain('<img src=x');expect(safe).not.toContain('<script>alert(1)');expect(safe).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');expect(safe).toContain('&lt;img&gt;');
});
