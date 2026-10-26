/* Manual snapshot only. No timers, subscriptions, order writes or pixel calls. */
(() => {
 'use strict';
 const root=document.getElementById('recent-intake-board');
 if(!root)return;
 const style=document.createElement('style');
 style.textContent=`
 #recent-intake-board{border:1px solid #d8e4ed;border-radius:18px;overflow:hidden;margin-bottom:24px;background:#fff;color:#17354a}
 #recent-intake-board .rb-head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:22px 24px;background:#132f44;color:white}
 #recent-intake-board .rb-head h2{font-size:21px;margin:0 0 6px}#recent-intake-board .rb-head p{color:#bdd3e1;margin:0;font-size:13px;line-height:1.6}
 #recent-intake-board .rb-head button{background:#c4f0e7;color:#123d39;white-space:nowrap;border:0;min-height:44px;font-weight:700}
 #recent-intake-board .rb-metrics{display:grid;grid-template-columns:1.3fr 1fr 1fr;padding:24px;gap:24px;border-bottom:1px solid #e4edf2}
 #recent-intake-board .rb-metric{border-right:1px solid #e4edf2}#recent-intake-board .rb-metric:last-child{border:0}
 #recent-intake-board .rb-metric span{display:block;color:#567083;font-size:13px}#recent-intake-board .rb-metric b{display:block;font-size:36px;line-height:1.4;font-variant-numeric:tabular-nums;color:#153c52}#recent-intake-board .rb-metric:first-child b{color:#087c77}
 #recent-intake-board .rb-body{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(240px,1fr);gap:28px;padding:24px}#recent-intake-board .rb-body>div{min-width:0}
 #recent-intake-board h3{margin:0 0 16px;font-size:16px}#recent-intake-board .rb-table-wrap{overflow:auto}
 #recent-intake-board table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:14px}#recent-intake-board th{text-align:right;font-size:12px;color:#647b8c;font-weight:500;padding:0 10px 12px}#recent-intake-board th:nth-child(-n+2){text-align:left}
 #recent-intake-board td{text-align:right;padding:13px 10px;border-top:1px solid #edf2f5;font-variant-numeric:tabular-nums}#recent-intake-board td:nth-child(-n+2){text-align:left}
 #recent-intake-board .rb-rank{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:8px;background:#edf2f6;color:#657a8b;font-weight:700}#recent-intake-board .rb-top{background:#e0f4ef;color:#086e63}
 #recent-intake-board .rb-bar{height:3px;width:76px;margin-top:7px;background:#eaf0f4;border-radius:3px}#recent-intake-board .rb-bar i{display:block;height:100%;background:#42a99e;border-radius:3px}
 #recent-intake-board .rb-total{font-weight:700;color:#087c77;font-size:17px}#recent-intake-board .rb-latest{border-left:1px solid #e4edf2;padding-left:24px}
 #recent-intake-board .rb-event{display:flex;align-items:center;gap:12px;min-height:43px;border-bottom:1px solid #eff3f6;font-size:13px}#recent-intake-board .rb-event time{font-variant-numeric:tabular-nums;color:#5e7789}#recent-intake-board .rb-event button{margin-left:auto;padding:5px 9px;font-size:12px;background:transparent;color:#267181;border:1px solid #d7e6eb}
 #recent-intake-board .rb-empty{color:#718594;line-height:1.8;padding:22px 0;font-size:14px}#recent-intake-board .rb-foot{padding:12px 24px;background:#f7fafc;color:#667e90;font-size:12px;margin:0}
 #rb-detail{max-width:480px;width:calc(100% - 36px);border:1px solid #d4e2ec;border-radius:16px;padding:24px}#rb-detail::backdrop{background:#10263866}#rb-detail dl{display:grid;grid-template-columns:100px 1fr;gap:14px;font-size:14px}#rb-detail dd{margin:0;overflow-wrap:anywhere}#rb-detail dt{color:#6a7e8c}
 @media(max-width:1000px){#recent-intake-board .rb-body{grid-template-columns:1fr}#recent-intake-board .rb-latest{border-left:0;padding:18px 0 0;border-top:1px solid #e4edf2}}
 @media(max-width:540px){#recent-intake-board .rb-head{padding:18px;align-items:flex-start}#recent-intake-board .rb-head h2{font-size:18px}#recent-intake-board .rb-head button{padding:10px;font-size:13px}#recent-intake-board .rb-metrics{padding:18px;gap:12px}#recent-intake-board .rb-metric b{font-size:28px}#recent-intake-board .rb-body{padding:18px}#recent-intake-board .rb-metric span{font-size:12px}}
 `;
 document.head.append(style);
 root.innerHTML=`<div class="rb-head"><div><h2>近30分鐘進件大盤</h2><p id="rb-window">點擊刷新，查看最近30分鐘進件快照</p></div><button type="button" id="rb-refresh">刷新大盤</button></div><div class="rb-metrics">${[['total','總進件'],['main','直流進件'],['second','二篩進件']].map(([key,label])=>`<div class="rb-metric"><span>${label}</span><b id="rb-${key}">—</b></div>`).join('')}</div><div class="rb-body"><div><h3>版本進件排行</h3><div class="rb-table-wrap"><table><thead><tr><th>排名</th><th>版本／案件</th><th>直流</th><th>二篩</th><th>合計</th><th>最近進件</th></tr></thead><tbody id="rb-ranks"><tr><td colspan="6"><div class="rb-empty">尚未更新 · 點擊「刷新大盤」取得排行</div></td></tr></tbody></table></div></div><div class="rb-latest"><h3>最近進件 <small>· 最新10筆</small></h3><div id="rb-events" class="rb-empty">尚未更新</div></div></div><p class="rb-foot" id="rb-status" role="status">僅手動更新，不會自動刷新；不受上方／下方統計日期影響。</p>`;
 const dialog=document.createElement('dialog');dialog.id='rb-detail';dialog.innerHTML='<h3>進件資料</h3><div id="rb-detail-content"></div><form method="dialog"><button class="secondary">關閉</button></form>';document.body.append(dialog);
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const stamp=value=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));
 const clock=value=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));
 const label=v=>v==='補助'?'補助金':(v==='E'?'M':v)+'版';
 const tag=v=>`<span class="tag tag-variant-${/^[CEFGIJK]$/.test(v)?v.toLowerCase():'c'}">${esc(label(v))}</span>`;
 let busy=false,latest=[];
 $('rb-refresh').addEventListener('click',async()=>{
  if(busy)return;busy=true;$('rb-refresh').disabled=true;$('rb-refresh').textContent='更新中…';$('rb-status').textContent='正在查詢最近30分鐘…';
  try{
   const {data,error}=await client.rpc('get_recent_intake_dashboard');if(error)throw error;if(!data)throw Error('無法取得統計');
   for(const key of ['total','main','second'])$('rb-'+key).textContent=Number(data[key]||0).toLocaleString('zh-TW');
   $('rb-window').textContent=`統計區間 ${stamp(data.from)} — ${stamp(data.to)}`;
   const ranks=[...(data.versions||[])].filter(r=>Number(r.total)>0).sort((a,b)=>b.total-a.total||Date.parse(b.latest)-Date.parse(a.latest)||String(a.version).localeCompare(String(b.version)));
   const max=Math.max(1,...ranks.map(r=>Number(r.total)));
   $('rb-ranks').innerHTML=ranks.map((r,i)=>`<tr><td><span class="rb-rank ${i<3?'rb-top':''}">${i+1}</span></td><td>${tag(r.version)}<div class="rb-bar"><i style="width:${Math.min(100,Math.max(0,Number(r.total)/max*100))}%"></i></div></td><td>${Number(r.main)}</td><td>${Number(r.second)}</td><td class="rb-total">${Number(r.total)}</td><td>${esc(clock(r.latest))}</td></tr>`).join('')||'<tr><td colspan="6"><div class="rb-empty">最近30分鐘尚無進件</div></td></tr>';
   latest=[...(data.recent||[])].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,10);$('rb-events').className='';$('rb-events').innerHTML=latest.map((r,i)=>`<div class="rb-event"><time>${esc(clock(r.created_at))}</time>${tag(r.version)}<span>${r.queue==='second'?'二篩':'直流'}</span><button type="button" data-recent="${i}" aria-label="查看 ${esc(clock(r.created_at))} ${esc(label(r.version))} 進件">查看</button></div>`).join('')||'<div class="rb-empty">此時段沒有新進件</div>';
   $('rb-status').textContent=`已更新：${stamp(data.to)}（台灣時間）· 手動快照，不會自動刷新。`;
  }catch(e){$('rb-status').textContent='更新失敗，請稍後重試。畫面若有數字，仍為上一次成功的快照。';}
  finally{busy=false;$('rb-refresh').disabled=false;$('rb-refresh').textContent='刷新大盤';}
 });
 $('rb-events').addEventListener('click',async e=>{
  const button=e.target.closest('[data-recent]');if(!button)return;const row=latest[Number(button.dataset.recent)];if(!row)return;
  button.disabled=true;
  try{const second=row.queue==='second';const fields=second?'name,age,phone,q3_amount_needed,status,created_at':'name,age,q3_amount_needed,status,created_at';
   const {data,error}=await client.from(second?'x_loan_leads':'leads').select(fields).eq('id',row.id).single();if(error||!data)throw Error('資料不可讀取');
   $('rb-detail-content').innerHTML='<dl>'+[['版本',label(row.version)],['列表',second?'二篩':'直流'],['進件時間',stamp(data.created_at)],['姓名',data.name],['年齡',data.age],...(second?[['手機',data.phone]]:[]),['需求金額',data.q3_amount_needed],['狀態',statusLabels[data.status]||data.status]].map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v??'未填')}</dd>`).join('')+'</dl>';dialog.showModal();
  }catch(e){$('rb-status').textContent='這筆訂單目前無法讀取，請到對應列表查看。';}finally{button.disabled=false;}
 });
})();
