import { TOTAL_STAGES } from './config.js';
export function registerGameTools(actions, context = document.modelContext) {
  if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  const tools=[
    {name:'read_math_constellation',description:'Read the visible task, lives and unlocked stage without revealing the expected answer.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>actions.read()},
    {name:'start_math_stage',description:'Start or resume an unlocked stage from the map or result screen.',inputSchema:{type:'object',properties:{levelId:{type:'integer',minimum:1,maximum:TOTAL_STAGES}},required:['levelId'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||!Number.isInteger(input.levelId)||input.levelId<1||input.levelId>TOTAL_STAGES)throw new Error('Invalid stage');return actions.start(input.levelId);}}
  ];
  for(const tool of tools){try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{/* Optional proposed API; gameplay does not depend on it. */}}
  return ()=>lifecycle.abort();
}
