const KEY="ensembleAttendanceV1";
let db=JSON.parse(localStorage.getItem(KEY)||'{"members":[],"records":{}}');
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,"0");
const today=()=>new Date().toISOString().slice(0,10);
function save(){localStorage.setItem(KEY,JSON.stringify(db));renderAll()}
function minutes(a,b,breakMin=0){if(!a||!b)return 0;let [ah,am]=a.split(":").map(Number),[bh,bm]=b.split(":").map(Number);let m=(bh*60+bm)-(ah*60+am)-Number(breakMin||0);return Math.max(0,m)}
function hm(m){return `${Math.floor(m/60)}時間${pad(m%60)}分`}
function dateObj(s){let d=new Date(s+"T00:00:00");return d}
function monday(s){let d=dateObj(s), n=d.getDay(); d.setDate(d.getDate()-(n===0?6:n-1));return d}
function dateStr(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function weekDates(s){let d=monday(s),a=[];for(let i=0;i<7;i++){let x=new Date(d);x.setDate(d.getDate()+i);a.push(dateStr(x))}return a}
function rec(mid,date){return db.records[date]?.[mid]||{}}
function setRec(mid,date,key,val){db.records[date]??={};db.records[date][mid]??={};db.records[date][mid][key]=val;save()}
function renderMembers(){
 $("memberCount").textContent=db.members.length;
 $("membersTable").innerHTML=db.members.length?`<div class="scroll"><table><thead><tr><th>番号</th><th>氏名</th><th>担当・パート</th><th>メモ</th><th></th></tr></thead><tbody>${db.members.map(m=>`<tr><td>${esc(m.no)}</td><td><b>${esc(m.name)}</b></td><td>${esc(m.group)}</td><td>${esc(m.memo)}</td><td><button onclick="editMember('${m.id}')">編集</button> <button class="secondary" onclick="deleteMember('${m.id}')">削除</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">まだ部員が登録されていません。</div>`
}
function renderAttendance(){
 let d=$("attDate").value||today();$("attDate").value=d;
 $("attendanceTable").innerHTML=db.members.length?`<div class="scroll"><table><thead><tr><th>部員</th><th>出勤</th><th>退勤</th><th>休憩(分)</th><th>実働</th><th>備考</th></tr></thead><tbody>${db.members.map(m=>{let r=rec(m.id,d),v=minutes(r.in,r.out,r.brk);return `<tr><td><b>${esc(m.name)}</b><div class="mini">${esc(m.group)}</div></td><td><input class="tableInput" type="time" value="${r.in||""}" onchange="setRec('${m.id}','${d}','in',this.value)"></td><td><input class="tableInput" type="time" value="${r.out||""}" onchange="setRec('${m.id}','${d}','out',this.value)"></td><td><input class="tableInput" type="number" min="0" value="${r.brk??0}" onchange="setRec('${m.id}','${d}','brk',this.value)"></td><td class="status">${hm(v)}</td><td><input class="tableInput" value="${esc(r.note||"")}" onchange="setRec('${m.id}','${d}','note',this.value)"></td></tr>`}).join("")}</tbody></table></div>`:`<div class="empty">先に部員を登録してください。</div>`
}
function renderWeekly(){
 let d=$("weekDate").value||today();$("weekDate").value=d;let ds=weekDates(d);
 $("weeklyTable").innerHTML=db.members.length?`<div class="scroll"><table><thead><tr><th>部員</th>${ds.map(x=>`<th>${x.slice(5).replace("-","/")}</th>`).join("")}<th>週合計</th></tr></thead><tbody>${db.members.map(m=>{let vals=ds.map(x=>minutes(rec(m.id,x).in,rec(m.id,x).out,rec(m.id,x).brk));return `<tr><td><b>${esc(m.name)}</b><div class="mini">${esc(m.group)}</div></td>${vals.map(v=>`<td>${hm(v)}</td>`).join("")}<td><b>${hm(vals.reduce((a,b)=>a+b,0))}</b></td></tr>`}).join("")}</tbody></table></div>`:`<div class="empty">部員がいません。</div>`
}
function renderMonthly(){
 let month=$("monthDate").value||today().slice(0,7);$("monthDate").value=month;let [y,mo]=month.split("-").map(Number),days=new Date(y,mo,0).getDate();
 $("monthlyTable").innerHTML=db.members.length?`<div class="scroll"><table><thead><tr><th>部員</th><th>勤務日数</th><th>総勤務時間</th><th>平均/勤務日</th></tr></thead><tbody>${db.members.map(m=>{let total=0,count=0;for(let i=1;i<=days;i++){let x=`${month}-${pad(i)}`,v=minutes(rec(m.id,x).in,rec(m.id,x).out,rec(m.id,x).brk);total+=v;if(v)count++}return `<tr><td><b>${esc(m.name)}</b><div class="mini">${esc(m.group)}</div></td><td>${count}日</td><td><b>${hm(total)}</b></td><td>${count?hm(Math.round(total/count)):"0時間00分"}</td></tr>`}).join("")}</tbody></table></div>`:`<div class="empty">部員がいません。</div>`
}
function totals(){
 let ds=weekDates(today()),w=0,m=0,month=today().slice(0,7);
 db.members.forEach(x=>{ds.forEach(d=>w+=minutes(rec(x.id,d).in,rec(x.id,d).out,rec(x.id,d).brk));let [y,mo]=month.split("-").map(Number),days=new Date(y,mo,0).getDate();for(let i=1;i<=days;i++){let d=`${month}-${pad(i)}`;m+=minutes(rec(x.id,d).in,rec(x.id,d).out,rec(x.id,d).brk)}});$("weekTotal").textContent=hm(w);$("monthTotal").textContent=hm(m)
}
function renderToday(){let d=today();$("todayLabel").textContent=d;let rows=db.members.map(m=>{let r=rec(m.id,d),v=minutes(r.in,r.out,r.brk);return `<div style="padding:10px 0;border-bottom:1px solid #eee"><b>${esc(m.name)}</b>　${r.in||"--:--"} ～ ${r.out||"--:--"}　<strong>${hm(v)}</strong></div>`}).join("");$("todayList").innerHTML=rows||'<div class="empty">部員が登録されていません。</div>'}
function renderAll(){renderMembers();renderAttendance();renderWeekly();renderMonthly();totals();renderToday()}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
window.editMember=id=>{let m=db.members.find(x=>x.id===id);$("memberForm").classList.remove("hidden");$("memberId").value=m.id;$("memberName").value=m.name;$("memberNo").value=m.no;$("memberGroup").value=m.group;$("memberMemo").value=m.memo}
window.deleteMember=id=>{if(confirm("この部員を削除しますか？")){db.members=db.members.filter(x=>x.id!==id);save()}}
$("addMemberBtn").onclick=()=>{$("memberForm").classList.remove("hidden");["memberId","memberName","memberNo","memberGroup","memberMemo"].forEach(id=>$(id).value="")}
$("cancelMemberBtn").onclick=()=>$("memberForm").classList.add("hidden");
$("saveMemberBtn").onclick=()=>{let id=$("memberId").value||crypto.randomUUID(),m={id,name:$("memberName").value.trim(),no:$("memberNo").value.trim(),group:$("memberGroup").value.trim(),memo:$("memberMemo").value.trim()};if(!m.name)return alert("氏名を入力してください");let i=db.members.findIndex(x=>x.id===id);if(i>=0)db.members[i]=m;else db.members.push(m);$("memberForm").classList.add("hidden");save()}
["attDate","weekDate","monthDate"].forEach(id=>$(id).onchange=renderAll);
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{document.querySelectorAll("nav button").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");$(b.dataset.tab).classList.add("active");renderAll()});
$("backupBtn").onclick=()=>{let blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`ensemble-attendance-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href)}
$("restoreInput").onchange=e=>{let f=e.target.files[0];if(!f)return;let r=new FileReader();r.onload=()=>{try{let x=JSON.parse(r.result);if(!x.members||!x.records)throw 0;if(confirm("現在のデータを復元データで置き換えますか？")){db=x;save()}}catch{alert("バックアップファイルを読み込めませんでした")}};r.readAsText(f)}
function csv(rows,name){let s="\uFEFF"+rows.map(r=>r.map(x=>`"${String(x??"").replaceAll('"','""')}"`).join(",")).join("\n"),a=document.createElement("a");a.href=URL.createObjectURL(new Blob([s],{type:"text/csv"}));a.download=name;a.click()}
$("csvWeekBtn").onclick=()=>{let ds=weekDates($("weekDate").value||today());csv([["氏名",...ds,"週合計"],...db.members.map(m=>{let v=ds.map(d=>minutes(rec(m.id,d).in,rec(m.id,d).out,rec(m.id,d).brk));return [m.name,...v.map(hm),hm(v.reduce((a,b)=>a+b,0))]})],"週次勤怠.csv")}
$("csvMonthBtn").onclick=()=>{let month=$("monthDate").value||today().slice(0,7);csv([["氏名","勤務日数","総勤務時間"],...db.members.map(m=>{let [y,mo]=month.split("-").map(Number),days=new Date(y,mo,0).getDate(),t=0,c=0;for(let i=1;i<=days;i++){let d=`${month}-${pad(i)}`,v=minutes(rec(m.id,d).in,rec(m.id,d).out,rec(m.id,d).brk);t+=v;if(v)c++}return[m.name,c+"日",hm(t)]})],"月次勤怠.csv")}
$("attDate").value=today();$("weekDate").value=today();$("monthDate").value=today().slice(0,7);renderAll();