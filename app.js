// Contact form: insert-only table (RLS: anon may insert, nobody can read via the public key).
const SB='https://czjwiudbasqwlwvezmaz.supabase.co', KEY='sb_publishable_I9N8lydmQ1h6NQD6JT-jDQ_PQkjsBAK';
const f=document.getElementById('lead'), s=document.getElementById('status');
document.querySelectorAll('[data-project]').forEach(a=>a.addEventListener('click',()=>{ f.project.value=a.dataset.project; }));
(function(){
  const nodes=[...document.querySelectorAll('.reveal')];
  const show=el=>{ if(el) el.classList.add('in'); };
  const showIn=root=>{
    if(!root) return;
    if(root.classList.contains('reveal')) show(root);
    root.querySelectorAll('.reveal').forEach(show);
  };
  document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',()=>showIn(document.querySelector(a.getAttribute('href')))));
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce||!('IntersectionObserver' in window)){ nodes.forEach(show); return; }
  const io=new IntersectionObserver(entries=>{
    entries.forEach(e=>{ if(!e.isIntersecting) return; show(e.target); io.unobserve(e.target); });
  },{threshold:.12,rootMargin:'0px 0px -24px 0px'});
  nodes.forEach(n=>io.observe(n));
  if(location.hash) showIn(document.querySelector(location.hash));
})();
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
