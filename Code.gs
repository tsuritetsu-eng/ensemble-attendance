const SPREADSHEET_ID='';
const SHEET_MEMBERS='部員';
const SHEET_RECORDS='勤怠';

function spreadsheet_(){
  return SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function setup(){
  const ss=spreadsheet_();
  getOrCreate_(ss,SHEET_MEMBERS,['id','no','name','group','memo']);
  getOrCreate_(ss,SHEET_RECORDS,['id','memberId','date','in','out','breakMin','note']);
  ss.setSpreadsheetTimeZone('Asia/Tokyo');
  return 'setup complete';
}

function getOrCreate_(ss,name,headers){
  let sh=ss.getSheetByName(name);
  if(!sh) sh=ss.insertSheet(name);
  if(sh.getLastRow()===0) sh.getRange(1,1,1,headers.length).setValues([headers]);
  return sh;
}

function json_(obj){
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonp_(callback,obj){
  const safe=String(callback||'').replace(/[^a-zA-Z0-9_$.]/g,'');
  if(!safe) return json_(obj);
  return ContentService
    .createTextOutput(safe+'('+JSON.stringify(obj)+');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function rows_(name){
  const sh=spreadsheet_().getSheetByName(name);
  if(!sh||sh.getLastRow()<2)return [];
  const v=sh.getRange(2,1,sh.getLastRow()-1,5).getDisplayValues();
  return v.map(x=>({
    id:x[0],no:x[1],name:x[2],group:x[3],memo:x[4]
  }));
}

function recordRows_(){
  const sh=spreadsheet_().getSheetByName(SHEET_RECORDS);
  if(!sh||sh.getLastRow()<2)return [];
  return sh.getRange(2,1,sh.getLastRow()-1,7).getDisplayValues().map(x=>({
    id:x[0],
    memberId:x[1],
    date:x[2],
    in:x[3],
    out:x[4],
    breakMin:Number(x[5]||0),
    note:x[6]
  }));
}

function findRow_(sh,id){
  const last=sh.getLastRow();
  if(last<2)return -1;
  const ids=sh.getRange(2,1,last-1,1).getDisplayValues().flat();
  const i=ids.indexOf(String(id));
  return i<0?-1:i+2;
}

function upsert_(sheetName,obj,headers){
  const sh=spreadsheet_().getSheetByName(sheetName);
  if(!sh)throw new Error('setup()を先に実行してください。');
  if(!obj||!obj.id)throw new Error('IDがありません。');
  const row=findRow_(sh,obj.id);
  const vals=headers.map(h=>obj[h]??'');
  if(row<0)sh.appendRow(vals);
  else sh.getRange(row,1,1,headers.length).setValues([vals]);
}

function delete_(sheetName,id){
  const sh=spreadsheet_().getSheetByName(sheetName);
  if(!sh)return;
  const row=findRow_(sh,id);
  if(row>0)sh.deleteRow(row);
}

function handle_(p){
  setup();
  if(p.action==='getAll'){
    return {ok:true,members:rows_(SHEET_MEMBERS),records:recordRows_()};
  }
  if(p.action==='saveMember'){
    upsert_(SHEET_MEMBERS,p.member,['id','no','name','group','memo']);
    return {ok:true};
  }
  if(p.action==='deleteMember'){
    const records=recordRows_().filter(r=>r.memberId===p.id);
    records.forEach(r=>delete_(SHEET_RECORDS,r.id));
    delete_(SHEET_MEMBERS,p.id);
    return {ok:true};
  }
  if(p.action==='saveRecord'){
    upsert_(SHEET_RECORDS,p.record,['id','memberId','date','in','out','breakMin','note']);
    return {ok:true};
  }
  if(p.action==='deleteRecord'){
    delete_(SHEET_RECORDS,p.id);
    return {ok:true};
  }
  throw new Error('未対応のactionです。');
}

function doGet(e){
  try{
    const p=e&&e.parameter?e.parameter:{};
    if(p.action){
      const payload=p.payload?JSON.parse(p.payload):p;
      const result=handle_(payload);
      return jsonp_(p.callback,result);
    }
    return json_({
      ok:true,
      message:'アンサンブル部勤怠APIは稼働しています。',
      time:new Date().toISOString()
    });
  }catch(err){
    return jsonp_((e&&e.parameter&&e.parameter.callback)||'',{
      ok:false,
      error:String(err.message||err)
    });
  }
}

function doPost(e){
  try{
    const p=JSON.parse((e.postData&&e.postData.contents)||'{}');
    return json_(handle_(p));
  }catch(err){
    return json_({
      ok:false,
      error:String(err.message||err)
    });
  }
}