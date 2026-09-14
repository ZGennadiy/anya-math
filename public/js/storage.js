import { STORAGE_KEY, SETTINGS_KEY, TOTAL_STAGES, RECENT_TASK_LIMIT, PREVIOUS_SEED_LIMIT } from './config.js';
const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
function browserStorage(){try{return globalThis.localStorage;}catch{return null;}}
export function normalizeSettings(data) {
  const systemReduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
  return {schemaVersion:1,sound:typeof data?.sound==='boolean'?data.sound:false,
    reducedMotion:typeof data?.reducedMotion==='boolean'?data.reducedMotion:typeof data?.animations==='boolean'?!data.animations:systemReduced};
}
export function loadSettings(storage=browserStorage()) {
  try{return normalizeSettings(JSON.parse(storage?.getItem(SETTINGS_KEY)??'null'));}catch{return normalizeSettings(null);}
}
export function saveSettings(settings,storage=browserStorage()) {
  try{if(!storage)return false;storage.setItem(SETTINGS_KEY,JSON.stringify(normalizeSettings(settings)));return true;}catch{return false;}
}
export function initialProgress(settings=normalizeSettings(null)) {
  return {schemaVersion:2,unlockedLevel:1,completedLevels:[],bestStarsByLevel:{},skillStats:{},lastAttemptSeedByLevel:{},
    lastAttemptSignatureByLevel:{},recentTaskSignatures:{},previousSeeds:{},records:{},currentLevel:1,activeRun:null,
    practiceStats:{runs:0,correct:0,wrong:0},settings};
}
const signatures=value=>Array.isArray(value)?value.slice(-RECENT_TASK_LIMIT).filter(s=>typeof s==='string'&&s.length<800):[];
export function normalizeProgress(data,settings) {
  const p=initialProgress(settings??normalizeSettings(data?.settings));
  if(!data || ![1,2].includes(data.schemaVersion)) return p;
  // v1 may store stage stars in level records. No other game's storage is imported.
  const stars=data.bestStarsByLevel??Object.fromEntries((Array.isArray(data.levels)?data.levels:[]).filter(l=>l&&integer(Number(l.levelId),1,TOTAL_STAGES)).map(l=>[Number(l.levelId),l.bestStars]));
  for(let id=1;id<=TOTAL_STAGES;id++) {
    if(integer(stars[id],1,3)) p.bestStarsByLevel[id]=stars[id];
    if(integer(data.lastAttemptSeedByLevel?.[id],0,4294967295)) p.lastAttemptSeedByLevel[id]=data.lastAttemptSeedByLevel[id];
    if(typeof data.lastAttemptSignatureByLevel?.[id]==='string'&&data.lastAttemptSignatureByLevel[id].length<16000) p.lastAttemptSignatureByLevel[id]=data.lastAttemptSignatureByLevel[id];
    const r=data.records?.[id];
    if(r&&integer(r.attempts,0,1000000)&&integer(r.completions,0,r.attempts)) p.records[id]={attempts:r.attempts,completions:r.completions};
    const recent=signatures(data.recentTaskSignatures?.[id]);
    if(recent.length) p.recentTaskSignatures[id]=recent;
    const seeds=data.previousSeeds?.[id];
    if(Array.isArray(seeds)) p.previousSeeds[id]=seeds.slice(-PREVIOUS_SEED_LIMIT).filter(n=>integer(n,0,4294967295));
  }
  p.completedLevels=Object.keys(p.bestStarsByLevel).map(Number);
  while(p.unlockedLevel<TOTAL_STAGES&&p.bestStarsByLevel[p.unlockedLevel])p.unlockedLevel++;
  p.currentLevel=integer(data.currentLevel,1,p.unlockedLevel)?data.currentLevel:p.unlockedLevel;
  if(data.skillStats&&typeof data.skillStats==='object') for(const [skill,s] of Object.entries(data.skillStats).slice(0,100)) {
    if(/^[a-zA-Z0-9:_-]+$/.test(skill)&&integer(s?.correct,0,10000000)&&integer(s?.wrong,0,10000000))p.skillStats[skill]={correct:s.correct,wrong:s.wrong};
  }
  if(data.practiceStats&&['runs','correct','wrong'].every(k=>integer(data.practiceStats[k],0,10000000)))p.practiceStats={...data.practiceStats};
  if(data.activeRun&&typeof data.activeRun==='object'&&integer(data.activeRun.levelId,1,p.unlockedLevel)) p.activeRun=data.activeRun;
  return p;
}
export function loadProgress(storage=browserStorage()) {
  try {
    const raw=storage?.getItem(STORAGE_KEY)??storage?.getItem('anya-math:progress:v1')??'null';
    const data=JSON.parse(raw);
    const settings=storage?.getItem(SETTINGS_KEY)?loadSettings(storage):normalizeSettings(data?.settings);
    return normalizeProgress(data,settings);
  } catch{return initialProgress(loadSettings(storage));}
}
export function saveProgress(progress,storage=browserStorage()) {
  try{if(!storage)return false;const {settings,...data}=progress;storage.setItem(STORAGE_KEY,JSON.stringify(data));return true;}catch{return false;}
}
export function recordAttempt(progress,level,seed,signature,tasks=[]) {
  const p=structuredClone(progress), r=p.records[level]??{attempts:0,completions:0};
  p.currentLevel=level;p.lastAttemptSeedByLevel[level]=seed;p.lastAttemptSignatureByLevel[level]=signature;
  p.previousSeeds[level]=[...(p.previousSeeds[level]??[]),seed].slice(-PREVIOUS_SEED_LIMIT);
  p.recentTaskSignatures[level]=[...(p.recentTaskSignatures[level]??[]),...tasks.map(t=>t.signature)].slice(-RECENT_TASK_LIMIT);
  p.records[level]={...r,attempts:r.attempts+1};return p;
}
export function recordAnswer(progress,skill,correct) {
  const p=structuredClone(progress), s=p.skillStats[skill]??{correct:0,wrong:0};
  p.skillStats[skill]={correct:s.correct+(correct?1:0),wrong:s.wrong+(correct?0:1)};return p;
}
export function completeLevel(progress,level,stars) {
  if(!integer(stars,1,3)||!integer(level,1,progress.unlockedLevel))return progress;
  const p=structuredClone(progress);p.bestStarsByLevel[level]=Math.max(stars,p.bestStarsByLevel[level]??0);
  p.completedLevels=[...new Set([...p.completedLevels,level])].sort((a,b)=>a-b);
  p.unlockedLevel=Math.min(TOTAL_STAGES,Math.max(p.unlockedLevel,level+1));p.currentLevel=p.unlockedLevel;p.activeRun=null;
  const r=p.records[level]??{attempts:1,completions:0};p.records[level]={...r,completions:r.completions+1};return p;
}
export function resetProgress(storage=browserStorage(),settings=loadSettings(storage)) {
  const progress=initialProgress(normalizeSettings(settings));let saved=false;
  try{if(storage){saveSettings(progress.settings,storage);storage.removeItem(STORAGE_KEY);storage.removeItem('anya-math:progress:v1');saved=saveProgress(progress,storage);}}catch{/* The in-memory reset still works. */}
  return {progress,saved};
}
export const totalStars=p=>Object.values(p.bestStarsByLevel).reduce((sum,n)=>sum+n,0);
