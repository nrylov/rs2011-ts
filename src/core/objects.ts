export interface ObjectChange { id: number | null; x: number; y: number; level: number; shape: number; rotation: number; }
export const objectLayer = (shape:number) => shape<=3?0:shape<=8?1:shape===22?3:2;
export const objectKey = (x:number,y:number,level:number,shape:number) => `${level}:${x}:${y}:${objectLayer(shape)}`;
