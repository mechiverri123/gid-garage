/** Backend-only batch queue endpoint. No AI and no frontend dependency.
 * POST /knowledge-batch-queue
 * { vehicle:{year,make,model,engine?,transmission?,drivetrain?,generation?,trim?}, jobs:[{system,component,procedure,priority?}] }
 */
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
const clean=v=>typeof v==='string'?v.trim().replace(/\s+/g,' '):'';
const hdr=k=>({apikey:k,Authorization:`Bearer ${k}`,'Content-Type':'application/json'});
async function sb(env,path,opt={}){const base=`${env.SUPABASE_URL??env.VITE_SUPABASE_URL}/rest/v1`;return fetch(base+path,{...opt,headers:{...hdr(env.SUPABASE_SERVICE_KEY),...(opt.headers||{})}})}
function vehicleKey(v){return [v.year,v.make,v.model,v.engine,v.transmission,v.drivetrain].map(x=>clean(String(x??''))).filter(Boolean).join('|').toLowerCase()}
function jobKey(vk,j){return [vk,j.system,j.component,j.procedure].map(clean).join('|').toLowerCase()}
export async function onRequestPost({request,env}){
 if(!env.SUPABASE_SERVICE_KEY||!(env.SUPABASE_URL??env.VITE_SUPABASE_URL)) return json({error:'Supabase backend not configured'},500);
 let b; try{b=await request.json()}catch{return json({error:'Invalid JSON'},400)}
 const v=b.vehicle||{}; v.year=Number(v.year); v.make=clean(v.make); v.model=clean(v.model); v.engine=clean(v.engine); v.transmission=clean(v.transmission); v.drivetrain=clean(v.drivetrain); v.generation=clean(v.generation); v.trim=clean(v.trim);
 if(!Number.isInteger(v.year)||!v.make||!v.model||!Array.isArray(b.jobs)||!b.jobs.length) return json({error:'vehicle.year/make/model and non-empty jobs[] required'},400);
 const vk=vehicleKey(v);
 const vr=await sb(env,'/knowledge_vehicle_targets',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({vehicle_key:vk,year_start:v.year,year_end:v.year,make:v.make,model:v.model,generation:v.generation||null,engine:v.engine||null,transmission:v.transmission||null,drivetrain:v.drivetrain||null,trim:v.trim||null})});
 if(!vr.ok) return json({error:'vehicle upsert failed',detail:await vr.text()},502); const target=(await vr.json())[0];
 const rows=[]; for(const raw of b.jobs){const j={system:clean(raw.system),component:clean(raw.component),procedure:clean(raw.procedure),priority:Number.isFinite(Number(raw.priority))?Number(raw.priority):100}; if(!j.system||!j.component||!j.procedure) continue; rows.push({job_key:jobKey(vk,j),target_id:target.id,...j,status:'pending'});}
 if(!rows.length) return json({error:'No valid jobs'},400);
 const jr=await sb(env,'/knowledge_jobs',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify(rows)}); if(!jr.ok)return json({error:'job insert failed',detail:await jr.text()},502);
 const created=await jr.json();
 const coverage=rows.map(r=>({target_id:target.id,system:r.system,component:r.component,procedure:r.procedure,state:'queued'}));
 await sb(env,'/knowledge_coverage',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify(coverage)});
 return json({ok:true,vehicle_key:vk,target_id:target.id,requested:rows.length,created:created.length});
}
