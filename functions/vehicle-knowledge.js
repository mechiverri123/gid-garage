function headers(key){return {apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'}}
function json(x,status=200){return new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}
function clean(v){return String(v??'').trim()}
export async function onRequestGet({request,env}){
 const u=new URL(request.url), action=u.searchParams.get('action')||'facts';
 const base=`${env.SUPABASE_URL??env.VITE_SUPABASE_URL}/rest/v1`, h=headers(env.SUPABASE_SERVICE_KEY);
 if(!env.SUPABASE_SERVICE_KEY) return json({error:'Server missing SUPABASE_SERVICE_KEY'},500);
 if(action==='vin'){
  const vin=clean(u.searchParams.get('vin')).toUpperCase(); if(vin.length!==17)return json({error:'VIN must be 17 characters'},400);
  const r=await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`); if(!r.ok)return json({error:'VIN decoder unavailable'},502); const d=await r.json(); const x=d.Results?.[0]||{};
  const year=Number(x.ModelYear)||null, make=clean(x.Make), model=clean(x.Model); if(!year||!make||!model)return json({error:'VIN did not decode to a complete year/make/model',vin,error_code:x.ErrorCode||''},422);
  const cq=`${base}/knowledge_vehicle_configurations?year=eq.${year}&make=ilike.${encodeURIComponent(make)}&model=ilike.${encodeURIComponent(model)}&select=year,make,model,configuration_key,vehicle_key,engine_displacement_l,engine_model,engine_cylinders,drive_type,transmission_style,transmission_speeds,fuel_type,trim,confidence,source&limit=100`;
  const cr=await fetch(cq,{headers:h}); const configurations=cr.ok?await cr.json():[];
  const disp=Number(x.DisplacementL)||0,cyl=Number(x.EngineCylinders)||0,speeds=Number(x.TransmissionSpeeds)||0,em=clean(x.EngineModel).toLowerCase(),drive=clean(x.DriveType).toLowerCase();
  const scored=configurations.map(c=>{let score=0,signals=0;if(disp&&Number(c.engine_displacement_l)){signals++;if(Math.abs(Number(c.engine_displacement_l)-disp)<0.08)score+=5;else score-=5}if(cyl&&Number(c.engine_cylinders)){signals++;if(Number(c.engine_cylinders)===cyl)score+=3;else score-=3}if(em&&c.engine_model){signals++;if(clean(c.engine_model).toLowerCase().includes(em)||em.includes(clean(c.engine_model).toLowerCase()))score+=5}if(speeds&&Number(c.transmission_speeds)){signals++;if(Number(c.transmission_speeds)===speeds)score+=2;else score-=2}if(drive&&c.drive_type){signals++;const cd=clean(c.drive_type).toLowerCase();if(cd&&((drive.includes('4')&&cd.includes('4'))||(drive.includes('all')&&(cd.includes('all')||cd.includes('awd')))||(drive.includes('front')&&(cd.includes('front')||cd.includes('fwd'))||(drive.includes('rear')&&(cd.includes('rear')||cd.includes('rwd')))))score+=2}return {c,score,signals}}).sort((a,b)=>b.score-a.score);
  const selected_configuration=scored.length&&scored[0].signals>0&&scored[0].score>0&&(scored.length===1||scored[0].score>scored[1].score)?scored[0].c:null;
  return json({vin,year,make,model,engine_model:x.EngineModel||'',displacement_l:x.DisplacementL||'',cylinders:x.EngineCylinders||'',drive_type:x.DriveType||'',transmission_style:x.TransmissionStyle||'',transmission_speeds:x.TransmissionSpeeds||'',error_code:x.ErrorCode||'',configurations,selected_configuration});
 }
 const year=Number(u.searchParams.get('year')), make=clean(u.searchParams.get('make')), model=clean(u.searchParams.get('model'));
 if(!year||!make||!model)return json({error:'year, make and model required'},400);
 if(action==='configs'){
  const q=`${base}/knowledge_vehicle_configurations?year=eq.${year}&make=ilike.${encodeURIComponent(make)}&model=ilike.${encodeURIComponent(model)}&select=year,make,model,configuration_key,vehicle_key,engine_displacement_l,engine_model,engine_cylinders,drive_type,transmission_style,transmission_speeds,fuel_type,trim,confidence,source&order=engine_displacement_l.asc&limit=100`;
  const r=await fetch(q,{headers:h}); if(!r.ok)return json({error:'Configuration lookup failed',detail:await r.text()},502); return json({configurations:await r.json()});
 }
 const vehicleKey=clean(u.searchParams.get('vehicle_key'));
 let q=`${base}/knowledge_research_results?year=eq.${year}`; // fallback below because table may not expose year
 if(vehicleKey) q=`${base}/knowledge_research_results?vehicle_key=eq.${encodeURIComponent(vehicleKey)}&select=category,field_name,value_text,value_json,units,source_name,source_url,evidence_text,confidence,verification_status,created_at&order=category.asc&limit=1000`;
 else q=`${base}/knowledge_research_results?vehicle_key=ilike.${encodeURIComponent(`${year}|${make}|${model}`)}*&select=category,field_name,value_text,value_json,units,source_name,source_url,evidence_text,confidence,verification_status,created_at&order=category.asc&limit=1000`;
 const r=await fetch(q,{headers:h}); if(!r.ok)return json({error:'Knowledge lookup failed',detail:await r.text()},502); const rows=await r.json();
 const verified=rows.filter(x=>String(x.verification_status||'').toLowerCase()==='verified');
 return json({vehicle_key:vehicleKey||null,verified_facts:verified,evidence:rows.filter(x=>!verified.includes(x))});
}
