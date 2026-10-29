// Contact form: insert-only table (RLS: anon may insert, nobody can read via the public key).
const SB='https://czjwiudbasqwlwvezmaz.supabase.co', KEY='sb_publishable_I9N8lydmQ1h6NQD6JT-jDQ_PQkjsBAK';
const f=document.getElementById('lead'), s=document.getElementById('status');
f.addEventListener('submit', async e=>{
  e.preventDefault();
  if(f.website.value) return; // bot trap
  if(!f.checkValidity()){ s.textContent='Please fill in your name, a valid email and a few details.'; return; }
  const body={name:f.name.value.trim(),email:f.email.value.trim(),project:f.project.value,message:f.message.value.trim()};
  s.textContent='Sending…';
  try{
    const r=await fetch(SB+'/rest/v1/portfolio_leads',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(body)});
    if(!r.ok) throw new Error(r.status);
    f.reset(); s.textContent='Thanks, we got it and will reply by email.';
  }catch(err){ s.textContent='That didn\'t send. Please try again in a minute.'; }
});
