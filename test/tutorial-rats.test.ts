import {test,expect} from 'bun:test';
import {fixTutorialRats} from '../scripts/fix-void-tutorial-rats.ts';
const source='[giant_rat]\nid = 86\nhunt_mode = "cowardly"\n\n[giant_rat_tutorial_island]\nid = 950\nclone = "giant_rat"\nhitpoints = 50\ncombat_def = "giant_rat_tutorial_island"\nhunt_mode = "cowardly" # keep combat\n\n[giant_rat_dark]\nid = 8828\nhunt_mode = "cowardly"\n';
test('tutorial rat patch disables hunting while preserving other rats and combat settings',()=>{
 const patched=fixTutorialRats(source),before=Bun.TOML.parse(source) as any,after=Bun.TOML.parse(patched) as any;
 expect(after.giant_rat_tutorial_island).toEqual({...before.giant_rat_tutorial_island,hunt_mode:''});
 expect(after.giant_rat).toEqual(before.giant_rat);expect(after.giant_rat_dark).toEqual(before.giant_rat_dark);
 expect(patched).toBe(source.replace('hunt_mode = "cowardly" # keep combat','hunt_mode = "" # keep combat'));
 expect(fixTutorialRats(patched)).toBe(patched);
 expect(fixTutorialRats(source.replaceAll('\n','\r\n'))).toBe(patched.replaceAll('\n','\r\n'));
});
test('tutorial rat patch refuses missing, duplicate or changed revision definitions',()=>{
 for(const input of ['',source+source,source.replace('id = 950','id = 951'),source.replace('clone = "giant_rat"','clone = "other"'),source.replace('hunt_mode = "cowardly" # keep combat','hunt_mode = "custom"')])expect(()=>fixTutorialRats(input)).toThrow();
});
