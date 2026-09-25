const KEY='ensembleAttendanceV2';
const API_URL='https://script.google.com/macros/s/AKfycbylVtujr6m_IH7VY0l2B_Hdi-EZfQ-hgD0Z0q69D39j2yCZI1K1JbFbrdzYkf6tKlx2/exec';
const $=id=>document.getElementById(id);
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
const today=()=>new Date().toISOString().slice(0,10);
let state=JSON.parse(localStorage.getItem(KEY)||'null')||{members:[],records:[]};

function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function mins(r){let a=r.in.split(':').map(Number),b=r.out.split(':').map(Number),d=b[0]*60+b[1]-a[0]*60-a[1];if(d<0)d+=1440;return Math.max(0,d-Number(r.breakMin||0))}
function hm(n){n=Math.max(0,Math.round(n));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0')}
function member(id){return state.members.find(x=>x.id===id)}
function weekRange(d){let x=new Date(d+'T00:00:00'),day=x.getDay(),m=new Date(x);m.setDate(x.getDate()-(day===0?6:day-1));let s=new Date(m);s.setDate(m.getDate()+6);return[m.toISOString().slice(0,10),s.toISOString().slice(0,10)]}

async function api(action,payload={}){
  if(!API_URL) return null;
  const body=JSON.stringify({action,...payload});
  const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body});
  if(!r.ok) throw new Error('サーバー通信エラー: '+r.status);
  const data=await r.json();
  if(!data.ok) throw new Error(data.error||'サーバー処理に失敗しました。');
  return data;
}
function saveLocal(){localStorage.setItem(KEY,JSON.stringify(state))}
async function loadState(){
  if(!API_URL){renderAll();return}
  try{
    const data=await api('getAll');
    state={members:data.members||[],records:data.records||[]};
    saveLocal();
    renderAll();
  }catch(e){
    console.error(e);
    alert('Googleスプレッドシートからデータを取得できませんでした。\n'+e.message+'\n\n現在の端末に保存されているデータを表示します。');
    renderAll();
  }
}
async function persist(){saveLocal();renderAll()}

function renderMembers(){
  $('membersBody').innerHTML=state.members.length?state.members.map(m=>'<tr><td><strong>'+esc(m.name)+'</strong></td><td>'+esc(m.no)+'</td><td>'+esc(m.group)+'</td><td>'+esc(m.memo)+'</td><td><div class="actions"><button class="secondary" onclick="editMember(\''+m.id+'\')">編集</button><button class="danger" onclick="deleteMember(\''+m.id+'\')">削除</button></div></td></tr>').join(''):'<tr><td colspan="5" class="empty">部員が登録されていません。</td></tr>';
  $('attendanceMember').innerHTML=state.members.map(m=>'<option value="'+m.id+'">'+esc(m.name)+(m.group?' / '+esc(m.group):'')+'</option>').join('');
}
window.editMember=id=>{let m=member(id);if(!m)return;$('memberId').value=m.id;$('memberName').value=m.name;$('memberNo').value=m.no||'';$('memberGroup').value=m.group||'';$('memberMemo').value=m.memo||'';$('memberForm').classList.remove('hidden');$('memberName').focus();};
window.deleteMember=async id=>{let m=member(id);if(!m||!confirm(m.name+' を削除しますか？\nこの部員の勤怠記録も削除されます。'))return;try{if(API_URL)await api('deleteMember',{id});state.members=state.members.filter(x=>x.id!==id);state.records=state.records.filter(x=>x.memberId!==id);await persist()}catch(e){alert(e.message)}};
function resetMemberForm(){$('memberForm').reset();$('memberId').value='';$('memberForm').classList.add('hidden')}
$('newMemberBtn').onclick=()=>{$('memberForm').classList.remove('hidden');$('memberName').focus()};
$('cancelMember').onclick=resetMemberForm;
$('memberForm').onsubmit=async e=>{e.preventDefault();let id=$('memberId').value,o={id:id||uid(),name:$('memberName').value.trim(),no:$('memberNo').value.trim(),group:$('memberGroup').value.trim(),memo:$('memberMemo').value.trim()};if(!o.name)return;try{if(API_URL)await api('saveMember',{member:o});let i=state.members.findIndex(x=>x.id===id);if(i>=0)state.members[i]=o;else state.members.push(o);resetMemberForm();await persist();alert('部員情報を保存しました。')}catch(e){alert(e.message)}};

$('attendanceForm').onsubmit=async e=>{e.preventDefault();let r={id:uid(),memberId:$('attendanceMember').value,date:$('attendanceDate').value,in:$('clockIn').value,out:$('clockOut').value,breakMin:Number($('breakMin').value||0),note:$('attendanceNote').value.trim()};if(!r.memberId||!r.date||!r.in||!r.out)return alert('部員・日付・出退勤を入力してください。');let old=state.records.find(x=>x.memberId===r.memberId&&x.date===r.date);if(old)r.id=old.id;try{if(API_URL)await api('saveRecord',{record:r});let i=state.records.findIndex(x=>x.id===r.id);if(i>=0)state.records[i]=r;else state.records.push(r);await persist();alert('勤怠を保存しました。')}catch(e){alert(e.message)}};
$('clearAttendance').onclick=()=>{$('attendanceForm').reset();$('attendanceDate').value=today();$('breakMin').value=0};
window.deleteRecord=async id=>{if(!confirm('この勤怠記録を削除しますか？'))return;try{if(API_URL)await api('deleteRecord',{id});state.records=state.records.filter(r=>r.id!==id);await persist()}catch(e){alert(e.message)}};

function renderAttendance(){let rs=[...state.records].sort((a,b)=>b.date.localeCompare(a.date));$('attendanceBody').innerHTML=rs.length?rs.map(r=>'<tr><td>'+r.date+'</td><td>'+esc(member(r.memberId)?.name||'削除済み')+'</td><td>'+r.in+'</td><td>'+r.out+'</td><td>'+r.breakMin+'分</td><td><strong>'+hm(mins(r))+'</strong></td><td><button class="danger" onclick="deleteRecord(\''+r.id+'\')">削除</button></td></tr>').join(''):'<tr><td colspan="7" class="empty">勤怠記録がありません。</td></tr>'}
function renderWeekly(){let d=$('weekDate').value||today(),[s,e]=weekRange(d);$('weekLabel').textContent=s+' ～ '+e;$('weeklyBody').innerHTML=state.members.length?state.members.map(m=>{let rs=state.records.filter(r=>r.memberId===m.id&&r.date>=s&&r.date<=e),t=rs.reduce((a,r)=>a+mins(r),0);return'<tr><td>'+esc(m.name)+'</td><td>'+rs.length+'日</td><td><strong>'+hm(t)+'</strong></td><td>'+(rs.length?hm(t/rs.length):'0:00')+'</td></tr>'}).join(''):'<tr><td colspan="4" class="empty">部員が登録されていません。</td></tr>'}
function renderMonthly(){let v=$('monthDate').value||today().slice(0,7);$('monthlyBody').innerHTML=state.members.length?state.members.map(m=>{let rs=state.records.filter(r=>r.memberId===m.id&&r.date.startsWith(v)),t=rs.reduce((a,r)=>a+mins(r),0);return'<tr><td>'+esc(m.name)+'</td><td>'+rs.length+'日</td><td><strong>'+hm(t)+'</strong></td><td>'+(rs.length?hm(t/rs.length):'0:00')+'</td></tr>'}).join(''):'<tr><td colspan="4" class="empty">部員が登録されていません。</td></tr>'}
function renderDash(){let[s,e]=weekRange(today()),w=state.records.filter(r=>r.date>=s&&r.date<=e).reduce((a,r)=>a+mins(r),0),mo=state.records.filter(r=>r.date.startsWith(today().slice(0,7))).reduce((a,r)=>a+mins(r),0);$('statMembers').textContent=state.members.length;$('statWeek').textContent=hm(w);$('statMonth').textContent=hm(mo)}
function renderAll(){renderMembers();renderAttendance();renderWeekly();renderMonthly();renderDash()}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.tab).classList.add('active');renderAll()});
$('attendanceDate').value=today();$('weekDate').value=today();$('monthDate').value=today().slice(0,7);$('weekDate').onchange=renderWeekly;$('monthDate').onchange=renderMonthly;loadState();