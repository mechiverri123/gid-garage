const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const json = (body, status=200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const sbHeaders = key => ({ apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json' });
const clean = v => String(v ?? '').trim();
const slug = v => clean(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const textNorm = v => clean(v).toLowerCase().replace(/[^a-z0-9]/g,'');
function engineLiters(v){
  const m=clean(v).toLowerCase().replace(/liters?|litres?/g,'l').match(/(\d+(?:\.\d+)?)/);
  if(!m) return '';
  const n=Number(m[1]); if(!Number.isFinite(n)) return '';
  return n.toFixed(1);
}
function displayEngine(v){ const n=engineLiters(v); return n ? `${n} L` : clean(v); }
function editDistance(a,b){a=textNorm(a);b=textNorm(b);const d=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));for(let i=0;i<=a.length;i++)d[i][0]=i;for(let j=0;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length];}
function looseTextMatch(a,b){ const x=textNorm(a),y=textNorm(b); if(!x||!y)return true; return x===y||editDistance(x,y)<=Math.max(1,Math.floor(Math.max(x.length,y.length)*0.18)); }
function engineMatch(a,b){ const x=engineLiters(a),y=engineLiters(b); return !x||!y||x===y; }
function canonicalVehicle(input,row){ return {...input,make:row.make||input.make,model:row.model||input.model,trim:row.trim||input.trim,engine_size:displayEngine(row.engine_size||input.engine_size),engine_code:row.engine_code||input.engine_code,drive_type:row.drive_type||input.drive_type,transmission:row.transmission||input.transmission}; }


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
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','Authorization':`Bearer ${env.CLAUDE_CODE_OAUTH_TOKEN}`,'anthropic-version':'2023-06-01','anthropic-beta':'oauth-2025-04-20'},body:JSON.stringify({
    model,max_tokens:maxTokens,
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
  return { vin, year:clean(r.ModelYear), make:clean(r.Make), model:clean(r.Model), trim:clean(r.Trim||r.Series), engine_size:displayEngine(r.DisplacementL), engine_code:clean(r.EngineModel), cylinders:clean(r.EngineCylinders), drive_type:clean(r.DriveType), transmission:[clean(r.TransmissionStyle),clean(r.TransmissionSpeeds)&&`${clean(r.TransmissionSpeeds)}-speed`].filter(Boolean).join(' '), fuel_type:clean(r.FuelTypePrimary), body_class:clean(r.BodyClass), source:'NHTSA vPIC' };
}
async function decodeVin(vin){
  const u=`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`;
  const r=await fetch(u); if(!r.ok) throw new Error('NHTSA VIN decode failed');
  const d=await r.json(), row=d.Results?.[0]; if(!row) throw new Error('VIN was not decoded');
  const v=normalizeNhtsa(row,vin);
  if(!v.year||!v.make||!v.model) throw new Error(row.ErrorText||'VIN did not resolve to year/make/model');
  return v;
}
function baselinePrompt(v){return `Research the exact US-market vehicle configuration below and build its baseline service specification profile. The user's manual spelling/formatting may be loose (example: pathfindr, 4L). Resolve obvious make/model spelling variants to the real canonical vehicle name, but NEVER change year/engine/drivetrain merely to make a match. Return canonical vehicle naming and display displacement like 4.0 L.\n\nVEHICLE=${JSON.stringify(v)}\nDo not research a different engine/drivetrain. Search multiple sources when needed. Torque values must name the exact fastener. Fluid entries must distinguish total/dry capacity from drain-and-fill when sources do.\nReturn this exact JSON shape:\n{"vehicle":{"year":"","make":"","model":"","trim":"","engine_size":"","engine_code":"","cylinders":"","drive_type":"","transmission":""},"engine":{"code":null,"displacement":null,"oil_filter":null,"spark_plug":null,"spark_plug_gap":null},"fluids":[{"system":"","specification":"","capacity":"","qualifier":"","status":"VERIFIED|CONFLICT|NOT_VERIFIED","sources":[{"title":"","url":""}]}],"common_torque_specs":[{"fastener":"","value":"","qualifier":"","status":"VERIFIED|CONFLICT|NOT_VERIFIED","sources":[{"title":"","url":""}]}],"maintenance":[{"item":"","interval":"","qualifier":"","sources":[{"title":"","url":""}]}],"notes":[],"researched_at":"ISO_DATE"}`}
function jobPrompt(v,job,baseline){return `Research ONE repair job for this exact US-market vehicle.\nVEHICLE=${JSON.stringify(v)}\nJOB=${JSON.stringify(job)}\nKNOWN_BASELINE=${JSON.stringify(baseline).slice(0,14000)}\nBuild a technician-useful guide. Identify every fastener normally disturbed by this job and search for its exact torque. Do not omit a torque merely because it seems obvious; use NOT_VERIFIED if unavailable. Include fluid refill/bleed specs when the job opens a fluid system. Find up to 5 genuinely relevant YouTube videos; only include real youtube.com/watch or youtu.be URLs discovered during search, and prefer videos matching generation/engine/drivetrain.\nReturn exactly:\n{"job":"","overview":"","applicability":"","parts":[{"name":"","notes":""}],"tools":[],"warnings":[],"procedure":[{"step":1,"instruction":"","critical_spec":""}],"torque_specs":[{"fastener":"","value":"","qualifier":"","status":"VERIFIED|CONFLICT|NOT_VERIFIED","sources":[{"title":"","url":""}]}],"fluids":[{"system":"","specification":"","capacity":"","qualifier":"","status":"VERIFIED|CONFLICT|NOT_VERIFIED","sources":[{"title":"","url":""}]}],"diagnostics":[],"youtube":[{"title":"","url":"","match_notes":""}],"sources":[{"title":"","url":"","kind":"OEM|NHTSA|technical|video|other"}],"researched_at":"ISO_DATE"}`}

export async function onRequestPost({request,env}){
 try{
  if(!env.CLAUDE_CODE_OAUTH_TOKEN) return json({error:'CLAUDE_CODE_OAUTH_TOKEN is not configured on the server'},500);
  const body=await request.json(); let vehicle=body.vehicle||null;
  if(body.action==='selector_options'){
    const year=clean(body.year), make=clean(body.make);
    if(!year) return json({makes:[],models:[]});
    if(!make){
      const r=await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/car?format=json`);
      const d=await r.json();
      const makes=[...new Set((d.Results||[]).map(x=>clean(x.MakeName)).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
      return json({makes,models:[]});
    }
    const r=await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${encodeURIComponent(year)}?format=json`);
    if(!r.ok) return json({makes:[],models:[]});
    const d=await r.json();
    const models=[...new Set((d.Results||[]).map(x=>clean(x.Model_Name)).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    return json({models});
  }
  if(body.action==='decode') return json({vehicle:await decodeVin(clean(body.vin))});
  if(body.vin) vehicle=await decodeVin(clean(body.vin));
  if(!vehicle?.year||!vehicle?.make||!vehicle?.model) return json({error:'Vehicle needs year, make, and model (or a VIN).'},400);
  vehicle={...vehicle,year:clean(vehicle.year),make:clean(vehicle.make),model:clean(vehicle.model),trim:clean(vehicle.trim),engine_size:displayEngine(vehicle.engine_size),engine_code:clean(vehicle.engine_code),drive_type:clean(vehicle.drive_type),transmission:clean(vehicle.transmission)};
  let key=vehicleKey(vehicle); if(!key) return json({error:'Could not build vehicle key'},400);
  let baseline=null, baselineCached=false;
  let br=await sb(env,`gid_vehicle_profiles?vehicle_key=eq.${encodeURIComponent(key)}&select=*&limit=1`); if(br.ok){const a=await br.json(); if(a[0]){baseline=a[0].profile;baselineCached=!!baseline;vehicle=canonicalVehicle(vehicle,a[0]);key=a[0].vehicle_key||vehicleKey(vehicle);}}
  // Loose cache lookup: "pathfindr" matches "Pathfinder" and 4 / 4L / 4.0L all match 4.0 L.
  if(!baseline&&!body.force_baseline){
    const yr=Number(vehicle.year)||0;
    const cr=await sb(env,`gid_vehicle_profiles?year=eq.${yr}&select=*&limit=250`);
    if(cr.ok){const rows=await cr.json(); const hit=rows.find(r=>looseTextMatch(vehicle.make,r.make)&&looseTextMatch(vehicle.model,r.model)&&engineMatch(vehicle.engine_size,r.engine_size)); if(hit){baseline=hit.profile;baselineCached=!!baseline;vehicle=canonicalVehicle(vehicle,hit);key=hit.vehicle_key||vehicleKey(vehicle);}}
  }
  if(!baseline||body.force_baseline){
    const x=await claude(env,baselinePrompt(vehicle),7500,7); baseline=x.data;
    if(baseline?.vehicle){ vehicle={...vehicle,...baseline.vehicle,year:clean(baseline.vehicle.year||vehicle.year),make:clean(baseline.vehicle.make||vehicle.make),model:clean(baseline.vehicle.model||vehicle.model),engine_size:displayEngine(baseline.vehicle.engine_size||vehicle.engine_size)}; }
    key=vehicleKey(vehicle);
    await sb(env,'gid_vehicle_profiles',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({vehicle_key:key,vin:vehicle.vin||null,year:Number(vehicle.year)||null,make:vehicle.make,model:vehicle.model,trim:vehicle.trim||null,engine_size:vehicle.engine_size||null,engine_code:vehicle.engine_code||null,drive_type:vehicle.drive_type||null,transmission:vehicle.transmission||null,profile:baseline,updated_at:new Date().toISOString()})}); baselineCached=false;
  }
  const job=clean(body.job); if(!job) return json({vehicle,vehicle_key:key,baseline,cache:{baseline:baselineCached}});
  const jobKey=`${key}|${slug(job)}`; let guide=null,jobCached=false;
  const jr=await sb(env,`gid_repair_guides?job_key=eq.${encodeURIComponent(jobKey)}&select=guide&limit=1`); if(jr.ok){const a=await jr.json();guide=a[0]?.guide||null;jobCached=!!guide;}
  if(!guide||body.force_job){const x=await claude(env,jobPrompt(vehicle,job,baseline),9000,10);guide=x.data;await sb(env,'gid_repair_guides',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({job_key:jobKey,vehicle_key:key,job_name:job,guide,updated_at:new Date().toISOString()})});jobCached=false;}
  return json({vehicle,vehicle_key:key,baseline,guide,cache:{baseline:baselineCached,job:jobCached}});
 }catch(e){return json({error:e instanceof Error?e.message:String(e)},500)}
}
