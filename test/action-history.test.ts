import {test,expect} from 'bun:test';
import {ActionHistory,traceActions} from '../src/browser/action-history.ts';
test('history observes sync and async actions without changing receivers or promise identity',async()=>{
 let now=100;const history=new ActionHistory(200,()=>now);const promise=Promise.resolve('arrived');
 const raw={x:7,walk(){return promise;},select(){return this.x;},getState(){return this.x;}};
 const traced=traceActions(raw,'bot',history,['walk','select']);
 expect(traced.select()).toBe(7);expect(traced.getState()).toBe(7);expect(history.entries.length).toBe(1);
 const pending=traced.walk();expect(pending).toBe(promise);expect(history.entries[0].status).toBe('running');now=150;await pending;
 expect(history.entries[0]).toMatchObject({method:'bot.walk',status:'returned',duration:50,result:'"arrived"'});
});
test('history records sync and async errors and leaves them visible to the caller',async()=>{
 const history=new ActionHistory();const error=new Error('No matching action');
 const traced=traceActions({sync(){throw error;},async async(){throw error;}},'sdk',history,['sync','async']);
 expect(()=>traced.sync()).toThrow(error);await expect(traced.async()).rejects.toThrow(error);
 expect(history.entries.every(e=>e.status==='error'&&e.result?.includes('No matching action'))).toBe(true);
});
test('history is bounded, clears safely during a running action and redacts structured credentials',()=>{
 const history=new ActionHistory(2);const first=history.start('sdk.a',[{token:'private',nested:{password:'private'}},/^net$/i]);
 expect(history.entries[0].args).not.toContain('private');expect(history.entries[0].args).toContain('/^net$/i');
 history.start('sdk.b',[]);history.start('sdk.c',[]);expect(history.entries.length).toBe(2);history.finish(first,'old');expect(history.entries.length).toBe(2);
 const current=history.entries[0].id;history.clear();history.finish(current,'late');expect(history.entries).toEqual([]);
});
test('broken log subscribers cannot interrupt actions and nested implementation calls are not duplicated',()=>{
 const history=new ActionHistory();history.subscribe(()=>{throw Error('UI failed');});const raw={inner(){return 1;},outer(){return this.inner();}};
 const traced=traceActions(raw,'bot',history,['outer','inner']);expect(traced.outer()).toBe(1);expect(history.entries.map(e=>e.method)).toEqual(['bot.outer']);
});
