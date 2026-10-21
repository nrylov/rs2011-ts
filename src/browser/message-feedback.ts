import {plainText} from '../core/dialogue.ts';
import type {Message} from '../core/world.ts';
/** Only fresh server refusals reach the prominent status; player chat cannot spoof them. */
export function refusalFeedback(messages:Message[],sequence:number,since:number){
 if(sequence<=since)return null;
 const fresh=messages.slice(-Math.min(sequence-since,messages.length));
 for(const m of fresh.reverse())if([0,109].includes(m.type)){
  const text=plainText(m.text);
  if(/^(?:You (?:can't|cannot|don't|do not|need|must|should|have to|are unable)|Nothing interesting happens)/i.test(text))return text;
 }
 return null;
}
