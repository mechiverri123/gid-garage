const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const json = (body, status=200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const sbHeaders = key => ({ apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json' });
const clean = v => String(v ?? '').trim();
const slug = v => clean(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

function vehicleKey(v){
  return [v.year,v.make,v.model,v.trim,v.engine_code,v.engine_size,v.drive_type,v.transmission].map(slug).filter(Boolean).join('|');
}
function extractJSON(text){
  const s=text.indexOf('{'), e=text.lastIndexOf('}');
  if(s<0||e<s) throw new Error('Research model did not return JSON');
  return JSON.parse(text.slice(s,e+1));
}
async function claude(env, prompt, maxTokens=7000, searches=6){
  const model=env.CLAUDE_REPAIR_MODEL || 'claude-sonnet-5';
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({
    model,max_tokens:maxTokens,temperature:0,
    system:`You are the research engine for a professional automotive repair tool. Accuracy beats completeness. Use web search aggressively. Never invent a torque, capacity, fluid, procedure step, part number, or applicability. Prefer OEM/manufacturer service information, OEM manuals, NHTSA manufacturer communications, reputable technical sources, and high-quality repair references. Never silently substitute another engine, drivetrain, generation, or market. If sources conflict, preserve the conflict. If a value cannot be supported, use null and status NOT_VERIFIED. Return ONLY valid JSON matching the requested schema; no markdown fences. Source URLs must be real URLs you actually found.`,
    tools:[{type:'web_search_20250305',name:'web_search',max_uses:searches}],messages:[{role:'user',content:prompt}]
  })});
  if(!r.ok){ const t=await r.text(); throw new Error(`Claude API ${r.status}: ${t.slice(0,500)}`); }
  const d=await r.json();
  const text=(d.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
  return { data:extractJSON(text), usage:d.usage||null };
}
async function sb(env,path,opt={}){
  const url=env.SUPABASE_URL||env.VITE_SUPABASE_URL, key=env.SUPABASE_SERVICE_KEY;
  if(!url||!key) throw new Error('Supabase server variables are missing');
  return fetch(`${url}/rest/v1/${path}`,{...opt,headers:{...sbHeaders(key),...(opt.headers||{})}});
}
function normalizeNhtsa(r,vin){
  return { vin, year:clean(r.ModelYear), make:clean(r.Make), model:clean(r.Model), trim:clean(r.Trim||r.Series), engine_size:clean(r.DisplacementL), engine_code:clean(r.EngineModel), cylinders:clean(r.EngineCylinders), drive_type:clean(r.DriveType), transmission:[clean(r.TransmissionStyle),clean(r.TransmissionSpeeds)&&`${clean(r.TransmissionSpeeds)}-speed`].filter(Boolean).join(' '), fuel_type:clean(r.FuelTypePrimary), body_class:clean(r.BodyClass), source:'NHTSA vPIC' };
}
async function decodeVin(vin){
  const u=`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`;
  const r=await fetch(u); if(!r.ok) throw new Error('NHTSA VIN decode failed');
  const d=await r.json(), row=d.Results?.[0]; if(!row) throw new Error('VIN was not decoded');
  const v=normalizeNhtsa(row,vin);
  if(!v.year||!v.make||!v.model) throw new Error(row.ErrorText||'VIN did not resolve to year/make/model');
  return v;
}
function baselinePrompt(v){return `Research the exact US-market vehicle configuration below and build its baseline service specification profile.\nVEHICLE=${JSON.stringify(v)}\nDo not research a different engine/drivetrain. Search multiple sources when needed. Torque values must name the exact fastener. Fluid entries must distinguish total/dry capacity from drain-and-fill when sources do.\nReturn this exact JSON shape:\n{"vehicle":${JSON.stringify(v)},"engine":{"code":null,"displacement":null,"oil_filter":null,"spark_plug":null,"spark_plug_gap":null},"fluids":[{"system":"","specification":"","capacity":"","qualifier":"","status":"VERIFIED|CONFLICT|NOT_VERIFIED","sources":[{"title":"","url":""}]}],"common_torque_specs":[{"fastener":"","value":"","qualifier":"","status":"VERIFIED|CONFLICT|NOT_VERIFIED","sources":[{"title":"","url":""}]}],"maintenance":[{"item":"","interval":"","qualifier":"","sources":[{"title":"","url":""}]}],"notes":[],"researched_at":"ISO_DATE"}`}
function jobPrompt(v,job,baseline){return `Research ONE repair job for this exact US-market vehicle.\nVEHICLE=${JSON.stringify(v)}\nJOB=${JSON.stringify(job)}\nKNOWN_BASELINE=${JSON.stringify(baseline).slice(0,14000)}\nBuild a technician-useful guide. Identify every fastener normally disturbed by this job and search for its exact torque. Do not omit a torque merely because it seems obvious; use NOT_VERIFIED if unavailable. Include fluid refill/bleed specs when the job opens a fluid system. Find up to 5 genuinely relevant YouTube videos; only include real youtube.com/watch or youtu.be URLs discovered during search, and prefer videos matching generation/engine/drivetrain.\nReturn exactly:\n{"job":"","overview":"","applicability":"","parts":[{"name":"","notes":""}],"tools":[],"warnings":[],"procedure":[{"step":1,"instruction":"","critical_spec":""}],"torque_specs":[{"fastener":"","value":"","qualifier":"","status":"VERIFIED|CONFLICT|NOT_VERIFIED","sources":[{"title":"","url":""}]}],"fluids":[{"system":"","specification":"","capacity":"","qualifier":"","status":"VERIFIED|CONFLICT|NOT_VERIFIED","sources":[{"title":"","url":""}]}],"diagnostics":[],"youtube":[{"title":"","url":"","match_notes":""}],"sources":[{"title":"","url":"","kind":"OEM|NHTSA|technical|video|other"}],"researched_at":"ISO_DATE"}`}

export async function onRequestPost({request,env}){
 try{
  if(!env.ANTHROPIC_API_KEY) return json({error:'ANTHROPIC_API_KEY is not configured on the server'},500);
  const body=await request.json(); let vehicle=body.vehicle||null;
  if(body.action==='decode') return json({vehicle:await decodeVin(clean(body.vin))});
  if(body.vin) vehicle=await decodeVin(clean(body.vin));
  if(!vehicle?.year||!vehicle?.make||!vehicle?.model) return json({error:'Vehicle needs year, make, and model (or a VIN).'},400);
  vehicle={...vehicle,year:clean(vehicle.year),make:clean(vehicle.make),model:clean(vehicle.model),trim:clean(vehicle.trim),engine_size:clean(vehicle.engine_size),engine_code:clean(vehicle.engine_code),drive_type:clean(vehicle.drive_type),transmission:clean(vehicle.transmission)};
  const key=vehicleKey(vehicle); if(!key) return json({error:'Could not build vehicle key'},400);
  const q=encodeURIComponent(key);
  let baseline=null, baselineCached=false;
  const br=await sb(env,`gid_vehicle_profiles?vehicle_key=eq.${q}&select=profile&limit=1`); if(br.ok){const a=await br.json();baseline=a[0]?.profile||null;baselineCached=!!baseline;}
  if(!baseline||body.force_baseline){ const x=await claude(env,baselinePrompt(vehicle),7500,7); baseline=x.data; await sb(env,'gid_vehicle_profiles',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({vehicle_key:key,vin:vehicle.vin||null,year:Number(vehicle.year)||null,make:vehicle.make,model:vehicle.model,trim:vehicle.trim||null,engine_size:vehicle.engine_size||null,engine_code:vehicle.engine_code||null,drive_type:vehicle.drive_type||null,transmission:vehicle.transmission||null,profile:baseline,updated_at:new Date().toISOString()})}); baselineCached=false; }
  const job=clean(body.job); if(!job) return json({vehicle,vehicle_key:key,baseline,cache:{baseline:baselineCached}});
  const jobKey=`${key}|${slug(job)}`; let guide=null,jobCached=false;
  const jr=await sb(env,`gid_repair_guides?job_key=eq.${encodeURIComponent(jobKey)}&select=guide&limit=1`); if(jr.ok){const a=await jr.json();guide=a[0]?.guide||null;jobCached=!!guide;}
  if(!guide||body.force_job){const x=await claude(env,jobPrompt(vehicle,job,baseline),9000,10);guide=x.data;await sb(env,'gid_repair_guides',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({job_key:jobKey,vehicle_key:key,job_name:job,guide,updated_at:new Date().toISOString()})});jobCached=false;}
  return json({vehicle,vehicle_key:key,baseline,guide,cache:{baseline:baselineCached,job:jobCached}});
 }catch(e){return json({error:e instanceof Error?e.message:String(e)},500)}
}
