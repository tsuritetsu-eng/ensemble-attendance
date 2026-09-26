const KEY='ensembleAttendanceV2';
const WORKER_URL='https://ensemble-attendance.mrtsuritetsu.workers.dev';
const TOKEN_KEY='ensembleAttendanceSession';

const $=id=>document.getElementById(id);
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
const today=()=>new Date().toISOString().slice(0,10);
let state=JSON.parse(localStorage.getItem(KEY)||'null')||{members:[],records:[]};

function esc(v){
  return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function mins(r){
  const a=r.in.split(':').map(Number),b=r.out.split(':').map(Number);
  let d=b[0]*60+b[1]-a[0]*60-a[1];
  if(d<0)d+=1440;
  return Math.max(0,d-Number(r.breakMin||0));
}
function hm(n){
  n=Math.max(0,Math.round(n));
  return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
}
function member(id){return state.members.find(x=>x.id===id);}
function weekRange(d){
  const x=new Date(d+'T00:00:00'),day=x.getDay(),m=new Date(x);
  m.setDate(x.getDate()-(day===0?6:day-1));
  const s=new Date(m);s.setDate(m.getDate()+6);
  return [m.toISOString().slice(0,10),s.toISOString().slice(0,10)];
}

function authToken(){return sessionStorage.getItem(TOKEN_KEY)||'';}

function showLogin(message=''){
  const screen=$('loginScreen');
  if(screen)screen.classList.remove('hidden');
  const error=$('loginError');
  if(error)error.textContent=message;
}

function hideLogin(){
  const screen=$('loginScreen');
  if(screen)screen.classList.add('hidden');
  const error=$('loginError');
  if(error)error.textContent='';
}

async function login(password){
  if(!password)throw new Error('パスワードを入力してください。');
  let r;
  try{
    r=await fetch(WORKER_URL+'/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({password})
    });
  }catch(e){
    throw new Error('Cloudflare Workerに接続できません。ページを再読み込みしてもう一度お試しください。');
  }
  const text=await r.text();
  let d;
  try{
    d=JSON.parse(text);
  }catch(e){
    const detail=text.replace(/<[^>]*>/g,' ').replace(/\\s+/g,' ').trim().slice(0,300);
    throw new Error(
      'WorkerがJSONを返していません（HTTP '+r.status+'）。'+
      (detail?' 応答: '+detail:'')
    );
  }
  if(!r.ok||!d.ok)throw new Error(d.error||('ログインに失敗しました（HTTP '+r.status+'）。'));
  if(!d.token)throw new Error('ログインには成功しましたが、認証トークンが返ってきませんでした。');
  sessionStorage.setItem(TOKEN_KEY,d.token);
  hideLogin();
}

function logout(){
  sessionStorage.removeItem(TOKEN_KEY);
  location.reload();
}

async function api(action,payload={}){
  const token=authToken();
  if(!token){showLogin();throw new Error('ログインが必要です。');}
  let r;
  try{
    r=await fetch(WORKER_URL+'/api',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':'Bearer '+token
      },
      body:JSON.stringify({action,...payload})
    });
  }catch(e){
    throw new Error('Cloudflare Workerに接続できません。');
  }
  const text=await r.text();
  let d;
  try{d=JSON.parse(text);}catch(e){d={ok:false,error:'API応答を読み取れませんでした。'};}
  if(r.status===401){
    sessionStorage.removeItem(TOKEN_KEY);
    showLogin('セッションが切れました。もう一度パスワードを入力してください。');
    throw new Error('認証が必要です。');
  }
  if(!r.ok||!d.ok)throw new Error(d.error||('サーバーエラー（HTTP '+r.status+'）。'));
  return d;
}

function saveLocal(){localStorage.setItem(KEY,JSON.stringify(state));}

async function loadState(){
  if(!authToken()){showLogin();return;}
  try{
    const data=await api('getAll');
    state={members:data.members||[],records:data.records||[]};
    saveLocal();
    renderAll();
  }catch(e){
    console.error(e);
    alert('Googleスプレッドシートからデータを取得できませんでした。\n'+e.message);
    renderAll();
  }
}

function renderMembers(){
  const body=$('membersBody');
  if(!body)return;
  body.innerHTML=state.members.length?state.members.map(m=>'<tr><td><strong>'+esc(m.name)+'</strong></td><td>'+esc(m.no)+'</td><td>'+esc(m.group)+'</td><td>'+esc(m.memo)+'</td><td><div class="actions"><button class="secondary member-edit" data-id="'+esc(m.id)+'">編集</button><button class="danger member-delete" data-id="'+esc(m.id)+'">削除</button></div></td></tr>').join(''):'<tr><td colspan="5" class="empty">部員が登録されていません。</td></tr>';
  const select=$('attendanceMember');
  if(select)select.innerHTML=state.members.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name)+(m.group?' / '+esc(m.group):'')+'</option>').join('');
}

function editMember(id){
  const m=member(id);if(!m)return;
  $('memberId').value=m.id;
  $('memberName').value=m.name;
  $('memberNo').value=m.no||'';
  $('memberGroup').value=m.group||'';
  $('memberMemo').value=m.memo||'';
  $('memberForm').classList.remove('hidden');
  $('memberName').focus();
}

async function deleteMember(id){
  const m=member(id);
  if(!m||!confirm(m.name+' を削除しますか？\nこの部員の勤怠記録も削除されます。'))return;
  try{
    await api('deleteMember',{id});
    state.members=state.members.filter(x=>x.id!==id);
    state.records=state.records.filter(x=>x.memberId!==id);
    saveLocal();renderAll();
  }catch(e){alert(e.message);}
}

function resetMemberForm(){
  $('memberForm').reset();
  $('memberId').value='';
  $('memberForm').classList.add('hidden');
}

async function saveMember(e){
  e.preventDefault();
  const id=$('memberId').value;
  const o={
    id:id||uid(),
    name:$('memberName').value.trim(),
    no:$('memberNo').value.trim(),
    group:$('memberGroup').value.trim(),
    memo:$('memberMemo').value.trim()
  };
  if(!o.name)return alert('氏名を入力してください。');
  try{
    await api('saveMember',{member:o});
    const i=state.members.findIndex(x=>x.id===id);
    if(i>=0)state.members[i]=o;else state.members.push(o);
    resetMemberForm();saveLocal();renderAll();
    alert('部員情報を保存しました。');
  }catch(e){alert(e.message);}
}

async function saveAttendance(e){
  e.preventDefault();
  const r={
    id:uid(),
    memberId:$('attendanceMember').value,
    date:$('attendanceDate').value,
    in:$('clockIn').value,
    out:$('clockOut').value,
    breakMin:Number($('breakMin').value||0),
    note:$('attendanceNote').value.trim()
  };
  if(!r.memberId||!r.date||!r.in||!r.out)return alert('部員・日付・出退勤を入力してください。');
  const old=state.records.find(x=>x.memberId===r.memberId&&x.date===r.date);
  if(old)r.id=old.id;
  try{
    await api('saveRecord',{record:r});
    const i=state.records.findIndex(x=>x.id===r.id);
    if(i>=0)state.records[i]=r;else state.records.push(r);
    saveLocal();renderAll();
    alert('勤怠を保存しました。');
  }catch(e){alert(e.message);}
}

async function deleteRecord(id){
  if(!confirm('この勤怠記録を削除しますか？'))return;
  try{
    await api('deleteRecord',{id});
    state.records=state.records.filter(r=>r.id!==id);
    saveLocal();renderAll();
  }catch(e){alert(e.message);}
}

function renderAttendance(){
  const body=$('attendanceBody');if(!body)return;
  const rs=[...state.records].sort((a,b)=>b.date.localeCompare(a.date));
  body.innerHTML=rs.length?rs.map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+esc(member(r.memberId)?.name||'削除済み')+'</td><td>'+esc(r.in)+'</td><td>'+esc(r.out)+'</td><td>'+esc(r.breakMin)+'分</td><td><strong>'+hm(mins(r))+'</strong></td><td><button class="danger record-delete" data-id="'+esc(r.id)+'">削除</button></td></tr>').join(''):'<tr><td colspan="7" class="empty">勤怠記録がありません。</td></tr>';
}

function renderWeekly(){
  const body=$('weeklyBody');if(!body)return;
  const d=$('weekDate').value||today(),[s,e]=weekRange(d);
  $('weekLabel').textContent=s+' ～ '+e;
  body.innerHTML=state.members.length?state.members.map(m=>{
    const rs=state.records.filter(r=>r.memberId===m.id&&r.date>=s&&r.date<=e),t=rs.reduce((a,r)=>a+mins(r),0);
    return '<tr><td>'+esc(m.name)+'</td><td>'+rs.length+'日</td><td><strong>'+hm(t)+'</strong></td><td>'+(rs.length?hm(t/rs.length):'0:00')+'</td></tr>';
  }).join(''):'<tr><td colspan="4" class="empty">部員が登録されていません。</td></tr>';
}

function renderMonthly(){
  const body=$('monthlyBody');if(!body)return;
  const v=$('monthDate').value||today().slice(0,7);
  body.innerHTML=state.members.length?state.members.map(m=>{
    const rs=state.records.filter(r=>r.memberId===m.id&&r.date.startsWith(v)),t=rs.reduce((a,r)=>a+mins(r),0);
    return '<tr><td>'+esc(m.name)+'</td><td>'+rs.length+'日</td><td><strong>'+hm(t)+'</strong></td><td>'+(rs.length?hm(t/rs.length):'0:00')+'</td></tr>';
  }).join(''):'<tr><td colspan="4" class="empty">部員が登録されていません。</td></tr>';
}

function renderDash(){
  const[s,e]=weekRange(today());
  const w=state.records.filter(r=>r.date>=s&&r.date<=e).reduce((a,r)=>a+mins(r),0);
  const mo=state.records.filter(r=>r.date.startsWith(today().slice(0,7))).reduce((a,r)=>a+mins(r),0);
  $('statMembers').textContent=state.members.length;
  $('statWeek').textContent=hm(w);
  $('statMonth').textContent=hm(mo);
}

function renderAll(){
  renderMembers();renderAttendance();renderWeekly();renderMonthly();renderDash();
}

document.addEventListener('click',e=>{
  const edit=e.target.closest('.member-edit');
  if(edit){editMember(edit.dataset.id);return;}
  const del=e.target.closest('.member-delete');
  if(del){deleteMember(del.dataset.id);return;}
  const rd=e.target.closest('.record-delete');
  if(rd){deleteRecord(rd.dataset.id);return;}
});

document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  $(b.dataset.tab).classList.add('active');
  renderAll();
}));

$('newMemberBtn').addEventListener('click',()=>{
  $('memberForm').classList.remove('hidden');
  $('memberName').focus();
});
$('cancelMember').addEventListener('click',resetMemberForm);
$('memberForm').addEventListener('submit',saveMember);

$('attendanceForm').addEventListener('submit',saveAttendance);
$('clearAttendance').addEventListener('click',()=>{
  $('attendanceForm').reset();
  $('attendanceDate').value=today();
  $('breakMin').value=0;
});
$('logoutBtn').addEventListener('click',logout);

$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=$('loginSubmit');
  const error=$('loginError');
  const password=$('loginPassword').value;
  if(!password){showLogin('パスワードを入力してください。');return;}
  btn.disabled=true;
  btn.textContent='接続中…';
  if(error)error.textContent='';
  try{
    await login(password);
    $('loginPassword').value='';
    await loadState();
  }catch(err){
    console.error(err);
    showLogin(err.message||'ログインに失敗しました。');
  }finally{
    btn.disabled=false;
    btn.textContent='ログイン';
  }
});

$('attendanceDate').value=today();
$('weekDate').value=today();
$('monthDate').value=today().slice(0,7);
$('weekDate').addEventListener('change',renderWeekly);
$('monthDate').addEventListener('change',renderMonthly);

if(authToken())loadState();else showLogin();
