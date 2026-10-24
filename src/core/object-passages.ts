import type {MapObject} from '../cache/terrain.ts';
import type {Point} from './routing.ts';

// Revision-634 Ernest cellar gates use scripted side-to-side passage, not an
// ordinary collision change. Match placement as well as ID: never infer a wall
// crossing merely from a generic Open option. Locks still come from live forms.
const cellarGates:Record<number,[number,number]>={
 137:[3105,9765],138:[3100,9765],139:[3105,9760],140:[3100,9760],141:[3100,9755],
 142:[3102,9763],143:[3097,9763],144:[3108,9758],145:[3102,9758],
};
export function scriptedPassage(object:MapObject):[Point,Point]|null {
 const placement=cellarGates[object.id];
 if(!placement||object.level!==0||object.shape!==10||object.x!==placement[0]||object.y!==placement[1]||!object.options.some(option=>option?.toLowerCase()==='open'))return null;
 return object.id<=141?[{x:object.x-1,y:object.y},{x:object.x+1,y:object.y}]:[{x:object.x,y:object.y-1},{x:object.x,y:object.y+1}];
}
