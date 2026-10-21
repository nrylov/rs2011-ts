import {test,expect} from 'bun:test';
import {refusalFeedback} from '../src/browser/message-feedback.ts';
test('fresh gate refusal appears in action feedback with unchanged server wording',()=>{
 const text='You should talk to your instructor before going through the gate.';
 expect(refusalFeedback([{type:109,text}],1,0)).toBe(text);
 expect(refusalFeedback([{type:109,text}],1,1)).toBeNull();
 expect(refusalFeedback([{type:2,name:'Someone',text}],2,1)).toBeNull();
});
test('feedback reads fresh refusals from a rolling message buffer and ignores ordinary messages',()=>{
 const messages=Array.from({length:200},()=>({type:109,text:'You should ignore this old message.'}));messages[199]={type:109,text:'The fire catches.'};expect(refusalFeedback(messages,250,249)).toBeNull();
 messages[199]={type:0,text:"You can't reach that."};expect(refusalFeedback(messages,251,250)).toBe("You can't reach that.");
});
test('engine feedback is visible while public chat and routine progress stay quiet',()=>{
 expect(refusalFeedback([{type:4,text:'Nothing interesting happens.'}],1,0)).toBe('Nothing interesting happens.');
 expect(refusalFeedback([{type:4,text:"I can't reach that."}],1,0)).toBe("I can't reach that.");
 expect(refusalFeedback([{type:109,text:'You swing your hatchet at the tree.'}],1,0)).toBeNull();
 expect(refusalFeedback([{type:2,name:'Someone',text:'Nothing interesting happens.'}],1,0)).toBeNull();
});
