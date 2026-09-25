const SPREADSHEET_ID=''; // スプレッドシートに紐づけたApps Scriptなら空欄のままでOK
const SHEET_MEMBERS='部員';
const SHEET_RECORDS='勤怠';

function spreadsheet_(){ return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }

function setup(){
  const ss=spreadsheet_();
  const m=getOrCreate_(ss,SHEET_MEMBERS,['id','no','name','group','memo']);
  const r=getOrCreate_(ss,SHEET_RECORDS,['id','memberId','date','in','out','breakMin','note']);
  ss.setSpreadsheetTimeZone('Asia/Tokyo');
  return 'setup complete';
}
function getOrCreate_(ss,name,headers){
  let sh=ss.getSheetByName(name);
  if(!sh) sh=ss.insertSheet(name);
  if(sh.getLastRow()===0) sh.getRange(1,1,1,headers.length).setValues([headers]);
  return sh;
}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)}
function rows_(name){
  const sh=spreadsheet_().getSheetByName(name);
  if(!sh||sh.getLastRow()<2)return [];
  const v=sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getDisplayValues();
  return v.map(x=>({id:x[0],no:x[1],name:x[2],group:x[3],memo:x[4]}));
}
function recordRows_(){
  const sh=spreadsheet_().getSheetByName(SHEET_RECORDS);
  if(!sh||sh.getLastRow()<2)return [];
  return sh.getRange(2,1,sh.getLastRow()-1,7).getDisplayValues().map(x=>({id:x[0],memberId:x[1],date:x[2],in:x[3],out:x[4],breakMin:Number(x[5]||0),note:x[6]}));
}
function findRow_(sh,id){const ids=sh.getRange(2,1,Math.max(sh.getLastRow()-1,0),1).getDisplayValues().flat();const i=ids.indexOf(id);return i<0?-1:i+2}
function upsert_(sheetName,obj,headers){
  const sh=spreadsheet_().getSheetByName(sheetName); if(!sh) throw new Error('setup()を先に実行してください。');
  const row=findRow_(sh,obj.id); const vals=headers.map(h=>obj[h]??'');
  if(row<0) sh.appendRow(vals); else sh.getRange(row,1,1,headers.length).setValues([vals]);
}
function delete_(sheetName,id){
  const sh=spreadsheet_().getSheetByName(sheetName); if(!sh)return;
  const row=findRow_(sh,id); if(row>0) sh.deleteRow(row);
}
function doGet(e){ return json_({ok:true,message:'アンサンブル部勤怠APIは稼働しています。'}); }
function doPost(e){
  try{
    const p=JSON.parse((e.postData&&e.postData.contents)||'{}');
    setup();
    if(p.action==='getAll') return json_({ok:true,members:rows_(SHEET_MEMBERS),records:recordRows_()});
    if(p.action==='saveMember'){upsert_(SHEET_MEMBERS,p.member,['id','no','name','group','memo']);return json_({ok:true})}
    if(p.action==='deleteMember'){delete_(SHEET_MEMBERS,p.id);recordRows_().filter(r=>r.memberId===p.id).forEach(r=>delete_(SHEET_RECORDS,r.id));return json_({ok:true})}
    if(p.action==='saveRecord'){upsert_(SHEET_RECORDS,p.record,['id','memberId','date','in','out','breakMin','note']);return json_({ok:true})}
    if(p.action==='deleteRecord'){delete_(SHEET_RECORDS,p.id);return json_({ok:true})}
    throw new Error('未対応のactionです。');
  }catch(err){return json_({ok:false,error:String(err.message||err)})}
}