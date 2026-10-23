import type {World} from './world.ts';
import {plainText} from './dialogue.ts';

/** Fresh server feedback only. Player chat and earlier actions must never reject a new action. */
export function actionRefusalSince(world:World,sequence:number,extra?:RegExp):string|null {
 if(world.messageSequence<=sequence)return null;
 for(const message of world.messages.slice(-Math.min(world.messageSequence-sequence,world.messages.length))){
  if(![0,4,109].includes(message.type))continue;
  const text=plainText(message.text),normalized=text.replace(/[’‘]/g,"'");
  if(/^(?:Nothing interesting happens\b|I (?:can't|cant|cannot) reach\b|You (?:can't|cant|cannot|don't|do not|need|must|should|haven't|have (?:to|not|no|run out|insufficient))\b|Your inventory\b|You are (?:unable|too)\b)/i.test(normalized))return text;
  if(extra){extra.lastIndex=0;if(extra.test(normalized))return text;}
 }
 return null;
}
