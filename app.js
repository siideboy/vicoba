const $=s=>document.querySelector(s),N=x=>+x||0,fmt=n=>"TZS "+Math.round(N(n)).toLocaleString();
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const app=$("#app");
if(!CFG.URL||!CFG.KEY){app.innerHTML='<div class="card auth"><b>Setup needed</b><p>Fill URL and KEY in config.js.</p></div>';throw new Error("config")}
const sb=supabase.createClient(CFG.URL,CFG.KEY);
const T={member:["Dashboard","Pay","Loans","Ledger","Inbox"],accountant:["Dashboard","Approvals","Loans","Ledger","Broadcast","Inbox"],secretary:["Dashboard","Loans","Broadcast","Inbox"],chairman:["Dashboard","Approvals","Loans","Ledger","Audit","Inbox"],admin:["Dashboard","Approvals","Loans","Ledger","Broadcast","Members","Audit","Inbox"]};
let me,S={},D={},tab="Dashboard",liveOn=0;
const poster=()=>me.role!=="member",msg=(el,t,ok)=>{$(el).innerHTML=`<p class="${ok?"ok":"err"}">${esc(t)}</p>`};
const tbl=(h,r)=>`<div class="wrap"><table><tr>${h.map(x=>`<th>${x}`).join("")}${r.map(x=>`<tr>${x.map(c=>`<td>${c??""}`).join("")}`).join("")}</table></div>`;
function parse(t){const T=t.replace(/\s+/g," ").trim(),l=T.toLowerCase();
const net=/m-?pesa|vodacom/.test(l)?"M-Pesa":/airtel/.test(l)?"Airtel Money":/mixx|yas|tigo/.test(l)?"Mixx by Yas":/halo/.test(l)?"HaloPesa":"Unknown";
const ref=(T.match(/(?:trans(?:action)?\s*id|txn\s*id|ref(?:erence)?)[:\s#]*([A-Z0-9][A-Z0-9.\-]{5,})/i)||T.match(/^([A-Z0-9]{8,12})\b/)||[])[1];
const a=(T.match(/(?:tsh|tzs)\.?\s?([\d,]+(?:\.\d+)?)/i)||[])[1];
const name=(T.match(/from\s+([A-Za-z][A-Za-z .'-]+?)(?=\s+(?:\d|on\b|at\b|kwa\b)|[.,]|$)/i)||[])[1];
return{net,ref,amount:a?parseFloat(a.replace(/,/g,"")):null,name:name&&name.trim().toUpperCase(),date:(T.match(/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/)||[])[1],time:(T.match(/(\d{1,2}:\d{2}(?::\d{2})?\s?(?:[AP]M)?)/i)||[])[1]}}
function iso(p){try{const[d,m,y]=p.date.split(/[\/.-]/).map(Number);let h=0,mi=0;if(p.time){const t=p.time.match(/(\d+):(\d+)\s?([AP]M)?/i);h=+t[1];mi=+t[2];if(t[3]){const pm=/pm/i.test(t[3]);if(pm&&h<12)h+=12;if(!pm&&h==12)h=0}}const dt=new Date(y<100?2000+y:y,m-1,d,h,mi);return isNaN(dt)?null:dt.toISOString()}catch(e){return null}}
function authView(m){app.innerHTML=`<div class="card auth"><h1>THE <b>BILLIONAIRE</b> VICOBA</h1><p class="k">Sign in or create a member account.</p><input id="fn" placeholder="Full name (register only)"><input id="ph" placeholder="Phone (register only)"><input id="em" type="email" placeholder="Email"><input id="pw" type="password" placeholder="Password (min 8 characters)"><div class="row"><button class="p" onclick="login()">Sign in</button><button onclick="reg()">Register</button></div><div id="am">${m||""}</div></div>`}
async function login(){const{error}=await sb.auth.signInWithPassword({email:$("#em").value,password:$("#pw").value});error?msg("#am",error.message):boot()}
async function reg(){const{error}=await sb.auth.signUp({email:$("#em").value,password:$("#pw").value,options:{data:{full_name:$("#fn").value,phone:$("#ph").value}}});error?msg("#am",error.message):msg("#am","Account created. Confirm your email if asked, then sign in.",1)}
async function boot(){const{data:{session}}=await sb.auth.getSession();if(!session)return authView();
const{data:p}=await sb.from("profiles").select("*").eq("id",session.user.id).single();if(!p)return authView("Profile not found. Run the SQL files first.");
me=p;S=(await sb.from("settings").select("*").single()).data||{};await load();shell();live()}
async function load(){const q=(t,o)=>sb.from(t).select(o||"*");
const r=await Promise.all([sb.rpc("group_totals"),q("loans","*,profiles(full_name)").order("id",{ascending:false}),q("transactions","*,profiles(full_name)").order("id",{ascending:false}).limit(300),q("announcements").order("id",{ascending:false}).limit(10),q("notifications").order("id",{ascending:false}).limit(40),q("member_balances")]);
D={tot:r[0].data||{},loans:r[1].data||[],tx:r[2].data||[],ann:r[3].data||[],inb:r[4].data||[],bal:r[5].data||[]};
if(me.role!=="member")D.people=(await q("profiles").order("full_name")).data||[];
if(["admin","chairman"].includes(me.role))D.audit=(await q("audit_logs").order("id",{ascending:false}).limit(100)).data||[]}
function shell(){const u=D.inb.filter(n=>!n.read).length;
app.innerHTML=`<header><h1>THE <b>BILLIONAIRE</b> VICOBA</h1><div class="row" style="margin:0"><span class="tag">${esc(me.full_name)} - ${me.role}</span><button onclick="theme()">Theme</button><button onclick="out()">Sign out</button></div></header><nav>${T[me.role].map(t=>`<button class="${t==tab?"on":""}" onclick="go('${t}')">${t}${t=="Inbox"&&u?" ("+u+")":""}</button>`).join("")}</nav><main>${V[tab]()}</main>`}
const go=t=>{tab=t;shell()},refresh=async()=>{await load();shell()},busy=()=>/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
function live(){if(liveOn)return;liveOn=1;const f=()=>busy()?load():refresh();let c=sb.channel("vic");["transactions","notifications","announcements","loans"].forEach(t=>c=c.on("postgres_changes",{event:"*",schema:"public",table:t},f));c.subscribe()}
const risk=l=>{const b=D.bal.find(m=>m.id===l.member_id),c=b?(N(b.shares)+N(b.savings))/l.principal:0;return c>=1?"Low":c>=.5?"Medium":"High"};
const V={
Dashboard(){const t=D.tot,cap=N(t.shares)+N(t.savings),profit=N(t.income)-N(t.expenses),cash=cap+profit-N(t.disbursed)+N(t.recovered),my=D.bal.find(m=>m.id===me.id);
const it=[["Shares",t.shares],["Savings",t.savings],["Loans out",t.disbursed],["Recovered",t.recovered],["Cash available",cash],["Profit",profit]],mx=Math.max(1,...it.map(i=>Math.abs(N(i[1]))));
return `<div class="card hero"><div class="k">Total group capital (live)</div><div class="v">${fmt(cap)}</div><span class="tag">Growth ${cap?(profit/cap*100).toFixed(1):0}%</span></div>
${my?`<div class="card"><div class="k">My balances</div><b>Shares ${fmt(my.shares)}</b><br><b>Savings ${fmt(my.savings)}</b></div>`:""}
<div class="grid">${it.map(i=>`<div class="card"><div class="k">${i[0]}</div><div class="v">${fmt(i[1])}</div></div>`).join("")}</div>
<div class="card"><svg viewBox="0 0 300 110" width="100%" role="img" aria-label="Group composition">${it.map((i,x)=>{const h=Math.max(2,Math.abs(N(i[1]))/mx*80);return `<rect x="${12+x*48}" y="${90-h}" width="30" height="${h}" rx="5" fill="var(--acc)" opacity="${.4+x*.1}"/><text x="${12+x*48}" y="104">${i[0].slice(0,7)}</text>`}).join("")}</svg></div>
<div class="card"><b>Announcements</b>${D.ann.map(a=>`<p><b>${esc(a.title)}</b><br>${esc(a.body)}</p>`).join("")||'<p class="k">No announcements yet.</p>'}${poster()?`<div class="row"><input id="at" placeholder="Title"><input id="ab" placeholder="Message"><button class="p" onclick="ann()">Post</button></div>`:""}</div>`},
Pay(){const m=D.tx.filter(t=>t.member_id===me.id).slice(0,8);return `<div class="card"><b>Paste your mobile money SMS</b><p class="k">M-Pesa, Airtel Money, Mixx by Yas or HaloPesa. The accountant confirms each payment before it counts.</p><textarea id="sms" placeholder="Paste the full SMS here"></textarea><div class="row"><select id="alloc"><option value="shares">Shares</option><option value="savings">Savings</option><option value="loan_repayment">Loan repayment</option></select><button class="p" onclick="pay()">Send for confirmation</button></div><div id="res"></div></div><div class="card"><b>My recent payments</b>${tbl(["Reference","Amount","Type","Status"],m.map(t=>[esc(t.reference),fmt(t.amount),t.kind,t.status]))}</div>`},
Approvals(){const pt=D.tx.filter(t=>t.status==="pending"),pl=D.loans.filter(l=>l.status==="pending");
return `<div class="card"><b>Pending payments</b>${tbl(["Member","Reference","Amount","Type","Network",""],pt.map(t=>[esc(t.profiles?.full_name),esc(t.reference),fmt(t.amount),t.kind,esc(t.network),`<button class="p" onclick="conf(${t.id},true)">Confirm</button> <button onclick="conf(${t.id},false)">Reject</button>`]))}</div>
<div class="card"><b>Loan applications</b>${tbl(["Member","Amount","Months","Risk",""],pl.map(l=>[esc(l.profiles?.full_name),fmt(l.principal),l.months,risk(l),`<button class="p" onclick="lo(${l.id},true)">Approve and disburse</button> <button onclick="lo(${l.id},false)">Reject</button>`]))}</div>
<div class="card"><b>Record income or expense</b><div class="row"><select id="mk"><option>income</option><option>expense</option></select><input id="ma" type="number" placeholder="Amount"><input id="md" placeholder="Description"><button class="p" onclick="manual()">Save</button></div><div id="mr"></div></div>`},
Loans(){return `<div class="card"><b>Loans</b>${tbl(["Member","Principal","Months","Repaid","Status","Risk",""],D.loans.map(l=>[esc(l.profiles?.full_name),fmt(l.principal),l.months,fmt(D.tx.filter(t=>t.member_id===l.member_id&&t.kind==="loan_repayment"&&t.status==="posted").reduce((a,t)=>a+N(t.amount),0)),l.status,risk(l),`<button onclick="sched(${l.id})">Schedule</button>`]))}<div id="sch"></div></div>
${me.role==="member"?`<div class="card"><b>Apply for a loan</b><p class="k">Interest: ${N(S.loan_rate_monthly)}% per month on the reducing balance. Late penalty: ${N(S.penalty_daily_pct)}% per day.</p><div class="row"><input id="la" type="number" placeholder="Amount (TZS)"><input id="lm" type="number" placeholder="Months (1-36)"><button class="p" onclick="apply()">Apply</button></div><div id="lr"></div></div>`:""}`},
Ledger(){const p=D.tx.filter(t=>t.status==="posted");return `<div class="card"><b>General ledger</b>${tbl(["Date","Member","Type","Amount","Reference","Network"],p.map(t=>[new Date(t.paid_at).toLocaleDateString(),esc(t.profiles?.full_name||"Group"),t.kind,fmt(t.amount),esc(t.reference),esc(t.network)]))}<div class="row"><button onclick="csv()">Export CSV</button><button onclick="print()">Print / PDF</button></div></div>`},
Broadcast(){return `<div class="card"><b>Communication center</b><p class="k">Sends in-app notifications now. SMS delivery needs a gateway (next step).</p><div class="row"><select id="au"><option value="all">All members</option><option value="def">Loan defaulters</option></select></div><textarea id="bm" placeholder="Write a message"></textarea><div class="row"><button class="p" onclick="bc()">Send</button></div><div id="br"></div></div>`},
Inbox(){return `<div class="card"><b>Notifications</b>${D.inb.map(n=>`<p class="${n.read?"k":""}">${esc(n.body)}<br><span class="k">${new Date(n.created_at).toLocaleString()}</span></p>`).join("")||'<p class="k">Nothing yet.</p>'}<button onclick="readAll()">Mark all read</button></div>`},
Members(){return `<div class="card"><b>Members and roles</b>${tbl(["Name","Phone","Role"],D.people.map(p=>[esc(p.full_name),esc(p.phone),`<select onchange="setRole('${p.id}',this.value)">${Object.keys(T).map(r=>`<option ${r==p.role?"selected":""}>${r}</option>`).join("")}</select>`]))}</div>`},
Audit(){return `<div class="card"><b>Audit log</b>${tbl(["When","Action","Table","Row"],D.audit.map(a=>[new Date(a.created_at).toLocaleString(),a.action,a.table_name,esc(a.row_id)]))}</div>`}};
async function pay(){const raw=$("#sms").value,p=parse(raw);
if(!p.amount||!p.ref)return msg("#res","Could not read the amount or reference. Paste the full SMS.");
const{error}=await sb.rpc("submit_payment",{p_kind:$("#alloc").value,p_amount:p.amount,p_reference:p.ref,p_network:p.net,p_raw:raw,p_paid_at:iso(p)});
if(error)return msg("#res",error.code==="23505"||/duplicate/i.test(error.message)?"This reference was already submitted.":error.message);
const w=p.name&&!me.full_name.toUpperCase().split(" ").some(x=>p.name.includes(x));
await refresh();msg("#res",`Sent: ${fmt(p.amount)} via ${p.net}, ref ${p.ref}. Waiting for accountant confirmation.${w?" Payer name differs from your account name, so it will be reviewed closely.":""}`,1)}
async function conf(id,ok){const{error}=await sb.rpc("confirm_payment",{p_id:id,p_ok:ok});error?alert(error.message):refresh()}
async function lo(id,ok){const{error}=await sb.rpc("approve_loan",{p_id:id,p_ok:ok});error?alert(error.message):refresh()}
async function manual(){const a=N($("#ma").value);if(a<=0)return msg("#mr","Enter an amount.");
const{error}=await sb.from("transactions").insert({kind:$("#mk").value,amount:a,reference:"MAN-"+Date.now(),raw_sms:$("#md").value,status:"posted",created_by:me.id});
error?msg("#mr",error.message):(await refresh(),msg("#mr","Saved.",1))}
async function apply(){const a=N($("#la").value),m=N($("#lm").value);if(a<=0||m<1||m>36)return msg("#lr","Enter an amount and 1 to 36 months.");
const{error}=await sb.from("loans").insert({member_id:me.id,principal:a,rate_monthly:N(S.loan_rate_monthly),months:m});
error?msg("#lr",error.message):(await refresh(),msg("#lr","Application sent for approval.",1))}
async function sched(id){const{data}=await sb.from("loan_schedule").select("*").eq("loan_id",id).order("due_date");
$("#sch").innerHTML=data&&data.length?tbl(["Due","Principal","Interest","Paid"],data.map(r=>[r.due_date,fmt(r.principal_due),fmt(r.interest_due),fmt(r.paid)])):'<p class="k">No schedule yet. It is created when the loan is approved.</p>'}
async function ann(){const{error}=await sb.from("announcements").insert({title:$("#at").value,body:$("#ab").value,created_by:me.id});error?alert(error.message):refresh()}
async function bc(){let ids=D.people.filter(p=>p.active).map(p=>p.id);
if($("#au").value==="def"){const{data}=await sb.from("loan_schedule").select("paid,principal_due,interest_due,loans(member_id)").lt("due_date",new Date().toISOString().slice(0,10));
ids=[...new Set((data||[]).filter(r=>N(r.paid)<N(r.principal_due)+N(r.interest_due)).map(r=>r.loans.member_id))]}
if(!ids.length||!$("#bm").value)return msg("#br","Write a message and choose recipients.");
const{error}=await sb.from("notifications").insert(ids.map(u=>({user_id:u,body:$("#bm").value})));error?msg("#br",error.message):msg("#br","Sent to "+ids.length+" members.",1)}
async function readAll(){await sb.from("notifications").update({read:true}).eq("user_id",me.id);refresh()}
async function setRole(id,role){const{error}=await sb.from("profiles").update({role}).eq("id",id);error?alert(error.message):refresh()}
function csv(){const c="date,member,type,amount,reference,network\n"+D.tx.filter(t=>t.status==="posted").map(t=>[t.paid_at,t.profiles?.full_name||"Group",t.kind,t.amount,t.reference,t.network].map(x=>'"'+String(x??"").replace(/"/g,'""')+'"').join(",")).join("\n");const a=document.createElement("a");a.href="data:text/csv,"+encodeURIComponent(c);a.download="ledger.csv";a.click()}
function theme(){const d=document.documentElement;d.dataset.theme=(d.dataset.theme||(matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light"))==="dark"?"light":"dark"}
async function out(){await sb.auth.signOut();me=null;authView()}
boot();
