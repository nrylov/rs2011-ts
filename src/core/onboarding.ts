/** First-login UI is game-connected, but not an ordinary dialogue or game tab. */
export const CHARACTER_DESIGN_MESSAGE='Character design is open (window 1028). Use await bot.confirmAppearance() to accept the currently selected appearance before starting Tutorial Island.';
export function onboardingState(windowId:number|undefined,interfaces:Iterable<number>=[]){
 if(windowId!==1028&&![...interfaces].includes(1028))return null;
 return {kind:'character-design' as const,message:CHARACTER_DESIGN_MESSAGE,nextAction:'await bot.confirmAppearance()'};
}
