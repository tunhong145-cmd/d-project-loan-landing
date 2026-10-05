/* K is intentionally isolated from D's lead queries, settings and numbering. */
(() => {
  'use strict';
  const size = 100;
  let rows = [], page = 1, count = 0, request = 0, initialized = false, busy = false;
  const selected = new Map();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fields = [['name','姓名'],['age','年齡'],['phone','手機號碼'],['q3_amount_needed','需求金額'],
    ['q2_bank_status','銀行警示戶／告誡戶'],['court_deduction_status','法院強制扣款'],
    ['has_passport','是否有護照'],['q4_foreign_currency_account','個人外幣帳戶']];
  const root = document.createElement('section');
  root.id = 'k-admin-view'; root.className = 'hidden';
  root.innerHTML = `
    <div class="panel settings-panel"><h2>X貸款 K版</h2>
      <p class="notice">K版專屬訂單、甲方編號與 LINE／FB 像素設定。</p>
      <div class="settings-actions"><button data-action="tab-orders">K版訂單</button><button class="secondary" data-action="tab-settings">K版設定</button><a href="k/" target="_blank" rel="noopener">開啟 K版落地頁 ↗</a></div>
      <p id="k-msg" role="status" class="notice" style="white-space:pre-wrap"></p></div>
    <div id="k-orders">
      <div class="panel filters"><div class="filter-row">
        <input id="k-from" type="date" aria-label="K版開始日期" style="width:155px"><span>至</span><input id="k-to" type="date" aria-label="K版結束日期" style="width:155px">
        <select id="k-status" aria-label="K版狀態" style="width:145px"><option value="">所有狀態</option>${Object.entries(statusLabels).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select>
        <input id="k-search" placeholder="搜尋姓名 / 手機 / 年齡 / 金額 / 來源廣告" style="flex:1;min-width:220px">
        <button data-action="search">搜尋</button><button class="secondary" data-action="refresh">刷新本頁</button>
      </div><div class="copy-number-panel"><strong>K版甲方編號</strong><span>下一編號</span><input id="k-next" type="number" min="1" max="999998" value="1"><button class="secondary" data-action="save-number">儲存下一編號</button><span class="notice">跨電腦共用；已編號訂單沿用原號。重新設定起點可重用編號。</span></div></div>
      <div class="panel list-panel"><div class="list-head"><h2>K版申請列表</h2><div class="list-head-right"><label class="select-all-wrap"><input id="k-select-all" type="checkbox">全選本頁</label><span id="k-count"></span><button class="secondary" data-action="export">匯出 CSV</button></div></div>
        <div id="k-list" class="lead-list"></div><div class="pagination"><button class="secondary" data-action="prev">上一頁</button><span id="k-page"></span><button class="secondary" data-action="next">下一頁</button></div>
      </div>
    </div>
    <div id="k-settings" class="hidden">
      <div class="panel settings-panel"><h3>K版 LINE 設定</h3><label for="k-line">K版獨立 LINE 連結</label><input id="k-line" type="url" placeholder="https://lin.ee/xxxxxxx 或 https://line.me/R/ti/p/@xxxxxxxx"><p class="notice">支援輪換短連結。尚未填寫時，K版暫停送件。</p><label for="k-line-id">LINE ID（選填，短連結可留白）</label><input id="k-line-id" placeholder="@xxxxxxxx"><button class="secondary" data-action="test-line">測試 LINE</button></div>
      <div class="panel settings-panel"><h3>K版 Facebook Pixel</h3><p class="notice">最多 5 個；留白不啟用。只在 K版回傳 PageView、Lead、CompleteRegistration。</p>
        ${Array.from({length:5},(_,i)=>`<label for="k-pixel-${i}">像素 ${i+1}</label><div class="pixel-row"><input id="k-pixel-${i}" inputmode="numeric" placeholder="Facebook Pixel ID"><label class="pixel-toggle"><input id="k-pixel-on-${i}" type="checkbox" checked>啟用</label></div>`).join('')}
      </div><div class="panel settings-panel"><button data-action="save-settings">儲存 K版 LINE 與像素</button><p class="notice">設定儲存後，重新整理 K版落地頁生效。</p></div>
    </div>
    <dialog id="k-detail" style="width:min(650px,94vw);max-height:90vh;overflow:auto;border:1px solid #dce4ee;border-radius:14px;padding:24px;margin:auto"><div class="drawer-head"><h2>K版客戶詳細資料</h2><button class="secondary" data-action="close-detail">關閉</button></div><div id="k-detail-body"></div></dialog>`;
  document.getElementById('app-panel').append(root);
  const $ = id => root.querySelector('#'+id);
  function message(text, error=false) { $('k-msg').textContent=text; $('k-msg').className='notice'+(error?' error':''); }
  function number(n) { return n == null ? '未編號' : String(n).padStart(2,'0'); }
  function copyTextFor(r) {
    return ['案件類型：X貸款','來源版本：K版本',...fields.map(([key,label])=>`${label}：${r[key] ?? ''}`),`甲方編號：${number(r.client_copy_number)}`].join('\n');
  }
  function filters() { return {from:$('k-from').value,to:$('k-to').value,status:$('k-status').value,search:$('k-search').value.trim()}; }
  function query(f, exact=false) {
    let q=client.from('x_loan_leads').select('*',exact?{count:'exact'}:{});
    if(f.from) q=q.gte('created_at',f.from+'T00:00:00+08:00');
    if(f.to) q=q.lte('created_at',f.to+'T23:59:59.999+08:00');
    if(f.status) q=q.eq('status',f.status);
    if(f.search) q=q.ilike('search_text','%'+f.search.replace(/[\\%_]/g,'\\$&')+'%');
    return q.order('created_at',{ascending:false}).order('id',{ascending:false});
  }
  async function load() {
    const token=++request; message('正在載入 K版訂單…');
    const result=await query(filters(),true).range((page-1)*size,page*size-1);
    if(token!==request) return;
    if(result.error) throw result.error;
    count=result.count||0;
    if(page>Math.max(1,Math.ceil(count/size))) {page=Math.max(1,Math.ceil(count/size));return load();}
    rows=result.data||[];
    rows.forEach(r=>{if(selected.has(r.id)) selected.set(r.id,r);});
    render(); message(`共 ${count} 筆 K版訂單，每頁 ${size} 筆。`);
  }
  function render() {
    $('k-count').textContent=`共 ${count} 筆・已選 ${selected.size} 筆`;
    $('k-page').textContent=`第 ${page} / ${Math.max(1,Math.ceil(count/size))} 頁`;
    root.querySelector('[data-action="prev"]').disabled=page<=1;
    root.querySelector('[data-action="next"]').disabled=page*size>=count;
    $('k-select-all').checked=rows.length>0&&rows.every(r=>selected.has(r.id));
    $('k-list').innerHTML=rows.length?rows.map(r=>`<article style="padding:18px;border-bottom:1px solid #e4eaf2;display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
      <input type="checkbox" data-select="${r.id}" aria-label="選取 ${esc(r.name)}" ${selected.has(r.id)?'checked':''} style="width:18px;min-height:18px">
      <div style="flex:1;min-width:200px"><strong style="font-size:18px">${esc(r.name)}</strong> <span class="notice">${esc(r.age)}歲 · ${esc(r.phone)}</span><p style="margin:7px 0"><strong>${esc(r.q3_amount_needed)}</strong> · <span style="color:#6752bd">K版本</span> · 甲方編號 ${number(r.client_copy_number)}</p><span class="notice">${esc(formatDate(r.created_at))} · ${r.line_clicked?'已點 LINE':'未點 LINE'}</span></div>
      <select data-status="${r.id}" aria-label="${esc(r.name)}狀態" style="width:130px">${Object.entries(statusLabels).map(([v,l])=>`<option value="${v}" ${r.status===v?'selected':''}>${l}</option>`).join('')}</select>
      <button class="secondary" data-action="detail" data-id="${r.id}">詳細資料</button><button data-action="copy" data-id="${r.id}">一鍵複製${r.client_copy_number==null?'・編號':''}</button>
    </article>`).join(''):'<p class="notice empty">目前沒有符合條件的 K版訂單。</p>';
  }
  async function loadSettings() {
    const {data,error}=await client.from('x_loan_settings').select('*').eq('version_code','K').single();
    if(error) throw error;
    $('k-line').value=data.line_url||''; $('k-line-id').value=data.line_id||'';
    $('k-next').value=data.client_copy_next_number||1;
    for(let i=0;i<5;i++) {const p=(data.pixel_ids||[])[i];$('k-pixel-'+i).value=p?.id||'';$('k-pixel-on-'+i).checked=p?.enabled!==false;}
  }
  function validLine(value) {
    try {const u=new URL(value);return u.protocol==='https:'&&['lin.ee','line.me'].includes(u.hostname)&&u.pathname.length>1&&!u.username&&!u.password&&!u.port;} catch{return false;}
  }
  async function saveSettings() {
    const line=$('k-line').value.trim(), pixels=[];
    if(line&&!validLine(line)) throw new Error('請填寫有效的 https://lin.ee/ 或 https://line.me/ 連結。');
    for(let i=0;i<5;i++) {const id=$('k-pixel-'+i).value.trim();if(!id)continue;if(!/^\d{8,20}$/.test(id))throw new Error(`像素 ${i+1} ID 格式不正確。`);pixels.push({id,enabled:$('k-pixel-on-'+i).checked,platform:'facebook'});}
    if(new Set(pixels.map(p=>p.id)).size!==pixels.length) throw new Error('像素 ID 不可重複。');
    const {error}=await client.from('x_loan_settings').update({line_url:line,line_id:$('k-line-id').value.trim(),pixel_ids:pixels,updated_at:new Date().toISOString()}).eq('version_code','K').select('version_code').single();
    if(error) throw error;
    message('K版 LINE 與像素已儲存。');
  }
  function detail(id) {
    const r=rows.find(r=>r.id===id); if(!r)return;
    $('k-detail-body').innerHTML=`<dl style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${fields.map(([key,label])=>`<div><dt class="notice">${label}</dt><dd style="margin:3px 0">${esc(r[key])}</dd></div>`).join('')}</dl>
      <label>甲方編號</label><div style="display:flex;gap:8px"><input id="k-edit-number" type="number" min="1" max="999999" value="${r.client_copy_number||''}"><button class="secondary" data-action="edit-number" data-id="${r.id}">儲存</button><button class="secondary" data-action="clear-number" data-id="${r.id}">清除編號</button></div>
      <label style="margin-top:15px">備註</label><textarea id="k-notes">${esc(r.notes)}</textarea><button class="secondary" data-action="notes" data-id="${r.id}">儲存備註</button>
      <p class="notice" style="overflow-wrap:anywhere">來源：${esc(r.traffic_source||'未識別')}<br>來源連結：${esc(r.source_url||'')}<br>裝置／瀏覽器：${esc(r.user_agent||'')}</p><label>甲方資料</label><textarea id="k-copy-preview" readonly style="min-height:230px">${esc(copyTextFor(r))}</textarea><button data-action="copy" data-id="${r.id}">一鍵複製・沿用訂單編號</button>`;
    if(!$('k-detail').open)$('k-detail').showModal();
  }
  async function patch(id,value) {
    const {data,error}=await client.from('x_loan_leads').update({...value,updated_at:new Date().toISOString()}).eq('id',id).select('*').single();
    if(error) throw error;
    rows=rows.map(r=>r.id===id?data:r); if(selected.has(id))selected.set(id,data); render();return data;
  }
  async function copy(id) {
    const r=rows.find(r=>r.id===id);if(!r)return;
    const {data,error}=await client.rpc('assign_x_loan_copy_number',{target_lead_id:id});
    if(error)throw error;
    r.client_copy_number=data.number;$('k-next').value=data.next_number;render();
    const text=copyTextFor(r);
    if($('k-detail').open)$('k-copy-preview').value=text;
    try {await navigator.clipboard.writeText(text);message(`已複製 K版客戶資料，甲方編號 ${number(data.number)}。`);}
    catch {detail(id);$('k-copy-preview').focus();$('k-copy-preview').select();message(`已綁定編號 ${number(data.number)}。瀏覽器未允許自動複製，請按 Ctrl+C 複製已選取的資料。`,true);}
  }
  async function exportRows() {
    let data=[...selected.values()];
    if(!data.length){ const f=filters(); for(let offset=0;;offset+=size){const result=await query(f).range(offset,offset+size-1);if(result.error)throw result.error;data.push(...result.data);if(result.data.length<size)break;} }
    if(!data.length)throw new Error('目前沒有可匯出的 K版訂單。');
    const columns=[['created_at','申請時間'],['project_code','案件類型'],['landing_version','來源版本'],['client_copy_number','甲方編號'],...fields,['status','狀態'],['line_clicked','已點LINE'],['traffic_source','來源平台'],['source_url','來源連結'],['notes','備註']];
    const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
    const csv=[columns.map(([,l])=>cell(l)).join(','),...data.map(r=>columns.map(([k])=>cell(r[k])).join(','))].join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='K版訂單-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message(`已匯出 ${data.length} 筆 K版訂單。`);
  }
  root.addEventListener('click',async event=>{
    const button=event.target.closest('[data-action]');if(!button||busy)return;
    const action=button.dataset.action,id=button.dataset.id;
    busy=true;button.disabled=true;
    try {
      if(action==='tab-orders'||action==='tab-settings') {$('k-orders').classList.toggle('hidden',action!=='tab-orders');$('k-settings').classList.toggle('hidden',action!=='tab-settings');}
      if(action==='search'){page=1;selected.clear();await load();}
      if(action==='refresh')await load();
      if(action==='prev'||action==='next'){page+=action==='prev'?-1:1;await load();}
      if(action==='save-settings')await saveSettings();
      if(action==='test-line'){const url=$('k-line').value.trim();if(!validLine(url))throw new Error('請先填寫 K版 LINE 連結。');window.open(url,'_blank','noopener,noreferrer');}
      if(action==='save-number'){const n=Number($('k-next').value);if(!Number.isInteger(n)||n<1||n>999998)throw new Error('下一編號請填寫 1–999998。');const {error}=await client.from('x_loan_settings').update({client_copy_next_number:n,updated_at:new Date().toISOString()}).eq('version_code','K').select('version_code').single();if(error)throw error;message(`K版下一編號已設為 ${n}。`);}
      if(action==='detail')detail(id);
      if(action==='close-detail')$('k-detail').close();
      if(action==='copy')await copy(id);
      if(action==='notes'){await patch(id,{notes:$('k-notes').value});message('K版備註已儲存。');}
      if(action==='edit-number'||action==='clear-number'){const n=action==='clear-number'?null:Number($('k-edit-number').value);if(n!==null&&(!Number.isInteger(n)||n<1||n>999999))throw new Error('編號請填寫 1–999999。');await patch(id,{client_copy_number:n});detail(id);message(n===null?'K版訂單編號已清除，下次複製會重新分配。':'K版訂單編號已更新。');}
      if(action==='export')await exportRows();
    }catch(e){message('K版操作失敗：'+(e.message||e),true);}
    finally{busy=false;button.disabled=false;if(action==='prev'||action==='next')render();}
  });
  root.addEventListener('change',async event=>{
    const el=event.target;
    if(el.dataset.select){const r=rows.find(r=>r.id===el.dataset.select);if(el.checked)selected.set(r.id,r);else selected.delete(r.id);render();}
    if(el.id==='k-select-all'){rows.forEach(r=>el.checked?selected.set(r.id,r):selected.delete(r.id));render();}
    if(el.dataset.status){try{await patch(el.dataset.status,{status:el.value});message('K版狀態已更新。');}catch(e){message(e.message,true);render();}}
  });
  $('k-search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();root.querySelector('[data-action="search"]').click();}});
  window.KAdmin={async show(visible){root.classList.toggle('hidden',!visible);if(!visible){if($('k-detail').open)$('k-detail').close();return;}if(!initialized){try{await Promise.all([load(),loadSettings()]);initialized=true;}catch(e){message('K版載入失敗：'+e.message,true);}}}};
})();
