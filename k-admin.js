/* K is intentionally isolated from D's lead queries, settings and numbering. */
(() => {
  'use strict';
  const size = 100;
  let rows = [], page = 1, count = 0, request = 0, initialized = false, busy = false;
  let settingsReady = null;
  let configLoaded = false, kPixels = [], savedConfig = null, savedLineId = '';
  const selected = new Map();
  const style = document.createElement('style');
  style.textContent = `
    #k-admin-view .filters{margin-bottom:18px}
    #k-admin-view .lead-title-line{flex-wrap:wrap}
    #k-admin-view .lead-meta{flex-wrap:wrap;white-space:normal}
    #k-admin-view .tag-variant-k{background:#f3edff;color:#6541a5;border-color:#d8c9f3}
    #k-msg:empty,#k-detail-msg:empty{display:none}
    #k-msg{margin:10px 0 0;white-space:pre-wrap}
    #k-admin-view .k-search{min-width:min(350px,100%)}
    #k-detail{position:fixed;inset:0 0 0 auto;width:min(560px,100%);height:100dvh;max-height:100dvh;max-width:100%;margin:0 0 0 auto;padding:0;border:0;background:#fff;color:var(--text);box-shadow:-18px 0 50px rgba(17,31,52,.2)}
    #k-detail[open]{display:flex;flex-direction:column}
    #k-detail::backdrop{background:rgba(10,19,33,.48);backdrop-filter:blur(2px)}
    #k-detail .drawer-head{flex-shrink:0}
    #k-detail .drawer-body{min-height:0;flex:1}
    #k-detail .copy-number-actions{align-items:center}
    #k-edit-number{width:110px;min-height:34px}
    #k-detail-msg{margin-top:0;white-space:pre-wrap}
    @media(max-width:640px){#k-admin-view .k-search{width:100%;min-width:0}#k-admin-view .lead-meta span{max-width:100%;overflow-wrap:anywhere}#k-admin-view .lead-title-line{gap:6px}#k-detail .drawer-body{padding:18px}}
  `;
  document.head.append(style);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fields = [['name','姓名'],['age','年齡'],['phone','手機號碼'],['q3_amount_needed','需求金額'],
    ['q2_bank_status','銀行警示戶／告誡戶'],['court_deduction_status','法院強制扣款'],
    ['has_passport','是否有護照'],['q4_foreign_currency_account','個人外幣帳戶']];
  const root = document.createElement('section');
  root.id = 'k-admin-view'; root.className = 'hidden';
  root.innerHTML = `
    <div id="k-orders">
      <div class="panel filters"><div class="filter-row">
        <div class="quick-dates">${[['0','當日'],['1','昨日'],['3','近3日'],['7','近7日'],['30','近30日'],['all','全部']].map(([days,label])=>`<button type="button" data-action="date" data-days="${days}" class="${days==='all'?'active':''}">${label}</button>`).join('')}</div>
        <div class="date-field"><input id="k-from" type="date" aria-label="K版開始日期"></div><span class="date-separator">至</span><div class="date-field"><input id="k-to" type="date" aria-label="K版結束日期"></div>
        <div class="status-field"><select id="k-status" aria-label="K版狀態"><option value="">全部狀態</option>${Object.entries(statusLabels).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div>
        <div class="status-field"><select id="k-source" aria-label="K版來源"><option value="">來源：全部</option><option value="FB">FB</option><option value="TikTok">TikTok</option><option value="unknown">未識別</option></select></div>
        <button data-action="refresh">刷新本頁</button><div class="filter-spacer"></div>
        <div class="search-wrap k-search"><input id="k-search" aria-label="搜尋K版訂單" placeholder="搜尋姓名 / 手機 / 年齡 / 金額 / 來源廣告"><button data-action="search">搜尋</button></div>
      </div><div class="copy-number-panel"><strong>K版甲方編號</strong><span>下一編號</span><input id="k-next" aria-label="K版下一編號" type="number" min="1" max="999998" value="1"><button class="secondary" data-action="save-number">儲存下一編號</button><span class="notice">一鍵複製即綁定編號，已編號訂單沿用原號；與其他版本獨立。</span></div><p class="notice export-note">未勾選時，會匯出目前篩選結果。每頁 100 筆，刷新僅更新本頁。</p><p id="k-msg" role="status" class="notice"></p></div>
      <div class="panel list-panel"><div class="list-head"><h2>X貸款 K版申請列表</h2><div class="list-head-right"><label class="select-all-wrap"><input id="k-select-all" type="checkbox">全選本頁</label><span id="k-count"></span><button class="secondary" data-action="export">匯出 CSV</button></div></div>
        <div id="k-list" class="lead-list"></div><div id="k-pagination" class="pagination"><button class="secondary" data-action="first">首頁</button><button class="secondary" data-action="prev">上一頁</button><span id="k-page" class="pagination-info"></span><button class="secondary" data-action="next">下一頁</button><button class="secondary" data-action="last">末頁</button><label class="pagination-jump">跳至 <input id="k-jump" type="number" min="1" inputmode="numeric"> 頁</label><button class="secondary" data-action="jump">前往</button></div>
      </div>
    </div>
    <dialog id="k-detail" aria-labelledby="k-detail-title"><div class="drawer-head"><h2 id="k-detail-title">K版客戶詳細資料</h2><button class="secondary" data-action="close-detail">關閉</button></div><div class="drawer-body"><p id="k-detail-msg" role="status" class="notice"></p><div id="k-detail-body"></div></div></dialog>`;
  document.getElementById('app-panel').append(root);
  const settingsRoot = document.createElement('div');
  settingsRoot.id='k-line-settings';
  settingsRoot.innerHTML='<div style="height:14px"></div><label for="k-line">貸款 K版 LINE 連結</label><input id="k-line" type="url" placeholder="https://lin.ee/xxxxxxx 或 https://line.me/R/ti/p/@xxxxxxxx"><p id="k-settings-msg" class="notice"></p>';
  const linePanel=document.getElementById('setting-subsidy-line-url').closest('.settings-panel');
  linePanel.insertBefore(settingsRoot,linePanel.querySelector('.settings-actions'));
  const testButton=document.createElement('button');testButton.className='secondary';testButton.textContent='測試 K版 LINE';testButton.dataset.action='test-line';
  linePanel.querySelector('.settings-actions').append(testButton);
  testButton.addEventListener('click',handleAction);
  const $ = id => root.querySelector('#'+id) || document.getElementById(id);
  function message(text, error=false) { for(const id of ['k-msg','k-detail-msg']){$(id).textContent=text;$(id).className='notice'+(error?' error':'');} }
  function settingsMessage(text, error=false) { $('k-settings-msg').textContent=text; $('k-settings-msg').className='notice'+(error?' error':''); }
  function ensureSettings() {
    if (!settingsReady) {
      settingsMessage('正在載入 K版設定…');
      settingsReady=loadSettings().catch(e=>{settingsReady=null;settingsMessage('K版設定載入失敗：'+e.message,true);throw e;});
    }
    return settingsReady;
  }
  function number(n) { return n == null ? '未編號' : String(n).padStart(2,'0'); }
  function copyTextFor(r) {
    return ['案件類型：X貸款','來源版本：K版本',...fields.map(([key,label])=>`${label}：${r[key] ?? ''}`),`甲方編號：${number(r.client_copy_number)}`].join('\n');
  }
  function filters() { return {from:$('k-from').value,to:$('k-to').value,status:$('k-status').value,source:$('k-source').value,search:$('k-search').value.trim()}; }
  function query(f, exact=false) {
    let q=client.from('x_loan_leads').select('*',exact?{count:'exact'}:{});
    if(f.from) q=q.gte('created_at',f.from+'T00:00:00+08:00');
    if(f.to) q=q.lte('created_at',f.to+'T23:59:59.999+08:00');
    if(f.status) q=q.eq('status',f.status);
    if(f.source==='unknown')q=q.or('traffic_source.is.null,traffic_source.eq.');
    else if(f.source)q=q.eq('traffic_source',f.source);
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
    const pages=Math.max(1,Math.ceil(count/size));
    $('k-page').textContent=`第 ${page} / ${pages} 頁・共 ${count} 筆`;
    $('k-pagination').classList.toggle('hidden',count===0);$('k-jump').max=pages;$('k-jump').value=page;
    for(const action of ['prev','first'])root.querySelector(`[data-action="${action}"]`).disabled=page<=1;
    for(const action of ['next','last'])root.querySelector(`[data-action="${action}"]`).disabled=page>=pages;
    $('k-select-all').checked=rows.length>0&&rows.every(r=>selected.has(r.id));
    $('k-select-all').indeterminate=rows.some(r=>selected.has(r.id))&&!$('k-select-all').checked;
    $('k-list').innerHTML=rows.length?rows.map((r,i)=>`<article class="lead-row">
      <input class="lead-check" type="checkbox" data-select="${r.id}" aria-label="選取 ${esc(r.name)}" ${selected.has(r.id)?'checked':''}>
      <div class="lead-summary"><div class="lead-title-line"><span class="lead-index">${count-(page-1)*size-i}</span><span class="lead-name">${esc(r.name)}</span><span class="tag tag-loan">X貸款</span><span class="tag tag-variant-k">K版</span>${r.client_copy_number==null?'':`<span class="tag tag-copy-number">甲方 ${number(r.client_copy_number)}</span>`}<span class="tag tag-${Object.hasOwn(statusLabels,r.status)?r.status:'new'}">${esc(statusLabels[r.status]||r.status)}</span>${r.line_clicked?'<span class="tag tag-line">已點 LINE</span>':''}${trafficSourceTag(r)}</div>
      <div class="lead-meta"><span>年齡 <strong>${esc(r.age)}</strong></span><span>需求金額 <strong>${esc(r.q3_amount_needed)}</strong></span><span>警示戶 <strong>${esc(r.q2_bank_status)}</strong></span><span>手機 <strong>${esc(r.phone)}</strong></span></div><div class="lead-time">${esc(formatDate(r.created_at))}</div></div>
      <div class="lead-actions">${[['contacted','已聯繫'],['line_added','已添加'],['approved','已成交'],['invalid','無效']].map(([v,l])=>`<button class="status-btn ${r.status===v?'active':''}" data-action="status" data-value="${v}" data-id="${r.id}">${l}</button>`).join('')}<button data-action="copy" data-id="${r.id}">一鍵複製${r.client_copy_number==null?'・編號':''}</button><button class="secondary" data-action="detail" data-id="${r.id}">詳情</button></div>
    </article>`).join(''):'<p class="notice empty">目前沒有符合條件的 K版訂單。</p>';
  }
  async function loadSettings() {
    const {data,error}=await client.from('x_loan_settings').select('*').eq('version_code','K').single();
    if(error) throw error;
    $('k-line').value=data.line_url||'';savedLineId=data.line_id||'';
    $('k-next').value=data.client_copy_next_number||1;
    kPixels=(data.pixel_ids||[]).map(p=>({id:String(p.id||''),enabled:p.enabled!==false,platform:'facebook'}));
    configLoaded=true;savedConfig=JSON.stringify({line_url:data.line_url||'',line_id:savedLineId,pixel_ids:kPixels});renderPixels();updateKLinePreview();
  }
  function validLine(value) {
    try {const u=new URL(value);return u.protocol==='https:'&&['lin.ee','line.me'].includes(u.hostname)&&u.pathname.length>1&&!u.username&&!u.password&&!u.port;} catch{return false;}
  }
  function updateKLinePreview(){if(configLoaded)settingsMessage($('k-line').value.trim()?'客戶將前往此 K版專屬 LINE 連結。':'尚未設定 K版 LINE；K版暫停送件。');}
  $('k-line').addEventListener('input',updateKLinePreview);
  function prepareSettings() {
    if(!configLoaded)throw new Error('K版設定尚未載入完成，請稍後再儲存。');
    const line=$('k-line').value.trim(), pixels=kPixels.map(p=>({id:p.id.trim(),enabled:p.enabled!==false,platform:'facebook'})).filter(p=>p.id);
    if(line&&!validLine(line)) throw new Error('請填寫有效的 https://lin.ee/ 或 https://line.me/ 連結。');
    if(pixels.length>5||pixels.some(p=>!/^\d{8,20}$/.test(p.id)))throw new Error('K版最多 5 個像素，ID 必須為 8 至 20 位數字。');
    if(new Set(pixels.map(p=>p.id)).size!==pixels.length) throw new Error('像素 ID 不可重複。');
    const sameLine=savedConfig&&JSON.parse(savedConfig).line_url===line;
    return {line_url:line,line_id:sameLine?savedLineId:(line.match(/@[^/?#]+/)||[''])[0],pixel_ids:pixels};
  }
  async function saveSettings(payload) {
    if(JSON.stringify(payload)===savedConfig)return;
    const {error}=await client.from('x_loan_settings').update({...payload,updated_at:new Date().toISOString()}).eq('version_code','K').select('version_code').single();
    if(error) throw error;
    savedConfig=JSON.stringify(payload);savedLineId=payload.line_id;updateKLinePreview();
  }
  function renderPixels(){
    document.getElementById('k-pixel-card')?.remove();
    const card=document.createElement('div');card.id='k-pixel-card';card.className='pixel-version-card';
    card.innerHTML=`<div class="pixel-version-head"><div><div class="pixel-version-title">K版 FB Pixel</div><div class="pixel-version-count">已設定 ${kPixels.length}/5 個</div></div><button class="secondary" onclick="KAdmin.addPixel()" ${configLoaded?'':'disabled'}>新增</button></div><div class="pixel-list">${kPixels.map((p,i)=>`<div class="pixel-row"><input type="text" id="k-pixel-${i}" value="${esc(p.id)}" inputmode="numeric" aria-label="K版 Pixel ID" onchange="KAdmin.updatePixel(${i},this.value)"><label class="pixel-toggle"><input type="checkbox" ${p.enabled?'checked':''} onchange="KAdmin.togglePixel(${i},this.checked)">啟用</label><button class="danger" onclick="KAdmin.removePixel(${i})">刪除</button></div>`).join('')||`<p class="notice">${configLoaded?'目前沒有設定此版本 Pixel。':'K版設定載入中…'}</p>`}</div>`;
    document.getElementById('pixel-version-list').append(card);
  }
  function detail(id) {
    const r=rows.find(r=>r.id===id); if(!r)return;
    const item=(label,value)=>`<div class="detail-item"><label>${esc(label)}</label><div>${esc(value??'未填')}</div></div>`;
    const attribution=adAttribution(r);
    $('k-detail').dataset.id=id;$('k-detail-title').textContent=`${r.name||'客戶'}｜詳細資料`;$('k-detail-msg').textContent='';
    $('k-detail-body').innerHTML=`<div class="detail-grid">${item('提交時間',formatDate(r.created_at))}${item('目前狀態',statusLabels[r.status]||r.status)}${item('案件類型','X貸款')}${item('來源版本','K版本')}${item('甲方編號',number(r.client_copy_number))}${item('LINE 點擊',r.line_clicked?'已點擊加入 LINE':'尚未點擊')}${fields.map(([key,label])=>item(label,r[key])).join('')}</div>
      <div class="detail-section"><h3>廣告來源信息</h3><div class="detail-grid">${[['來源平台',attribution.platform||r.traffic_source],['來源域名',attribution.domain],['廣告系列ID',attribution.campaignId],['廣告組ID',attribution.adsetId],['來源廣告',attribution.adName],['廣告ID',attribution.adId],['展示位置',attribution.placement]].map(([l,v])=>item(l,v||'未提供')).join('')}</div></div>
      <div class="detail-section"><h3>提交裝置信息</h3><div class="detail-grid">${item('裝置／瀏覽器',r.user_agent||'未提供')}</div></div>
      <div class="detail-section"><h3>提供甲方的客戶資料</h3><textarea id="k-copy-preview" class="client-copy-box" aria-label="K版甲方資料" readonly>${esc(copyTextFor(r))}</textarea><div style="height:10px"></div><button data-action="copy" data-id="${r.id}">一鍵複製${r.client_copy_number==null?'・自動編號':'・沿用訂單編號'}</button><div class="copy-number-actions"><label for="k-edit-number">甲方編號</label><input id="k-edit-number" type="number" min="1" max="999999" value="${r.client_copy_number||''}"><button class="secondary" data-action="edit-number" data-id="${r.id}">儲存編號</button><button class="danger" data-action="clear-number" data-id="${r.id}">清除編號</button></div></div>
      <div class="detail-section"><h3>快速操作</h3><div class="drawer-actions">${Object.entries(statusLabels).map(([v,l])=>`<button class="${r.status===v?'':'secondary'}" data-action="status" data-value="${v}" data-id="${r.id}">${l}</button>`).join('')}<button class="secondary" data-action="copy-phone" data-id="${r.id}">複製電話</button></div></div>
      <div class="detail-section"><h3>處理備註</h3><textarea id="k-notes" aria-label="K版處理備註">${esc(r.notes)}</textarea><div style="height:10px"></div><button data-action="notes" data-id="${r.id}">儲存備註</button></div>`;
    if(!$('k-detail').open){$('k-detail').showModal();$('k-detail').querySelector('.drawer-body').scrollTop=0;}
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
    if($('k-detail').open){const draft=$('k-notes').value;const scroll=$('k-detail').querySelector('.drawer-body').scrollTop;detail(id);$('k-notes').value=draft;$('k-detail').querySelector('.drawer-body').scrollTop=scroll;}
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
  async function handleAction(event) {
    const button=event.target.closest('[data-action]');if(!button||busy)return;
    const action=button.dataset.action,id=button.dataset.id;
    busy=true;button.disabled=true;
    try {
      if(action==='date'){
        const days=button.dataset.days;const today=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Taipei'}));
        const date=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if(days==='all'){$('k-from').value='';$('k-to').value='';}
        else{const from=new Date(today),to=new Date(today);if(days==='1'){from.setDate(from.getDate()-1);to.setDate(to.getDate()-1);}else if(Number(days)>1)from.setDate(from.getDate()-Number(days)+1);$('k-from').value=date(from);$('k-to').value=date(to);}
        root.querySelectorAll('.quick-dates button').forEach(b=>b.classList.toggle('active',b===button));page=1;selected.clear();await load();
      }
      if(action==='search'){page=1;selected.clear();await load();}
      if(action==='refresh')await load();
      if(action==='prev'||action==='next'){page+=action==='prev'?-1:1;await load();}
      if(action==='first'||action==='last'||action==='jump'){
        const max=Math.max(1,Math.ceil(count/size));const target=action==='first'?1:action==='last'?max:Number($('k-jump').value);
        if(!Number.isInteger(target)||target<1||target>max)throw new Error(`頁碼請填寫 1–${max}。`);page=target;await load();
      }
      if(action==='test-line'){const url=$('k-line').value.trim();if(!validLine(url))throw new Error('請先填寫 K版 LINE 連結。');window.open(url,'_blank','noopener,noreferrer');}
      if(action==='save-number'){const n=Number($('k-next').value);if(!Number.isInteger(n)||n<1||n>999998)throw new Error('下一編號請填寫 1–999998。');const {error}=await client.from('x_loan_settings').update({client_copy_next_number:n,updated_at:new Date().toISOString()}).eq('version_code','K').select('version_code').single();if(error)throw error;message(`K版下一編號已設為 ${n}。`);}
      if(action==='detail')detail(id);
      if(action==='close-detail')$('k-detail').close();
      if(action==='copy')await copy(id);
      if(action==='copy-phone'){const r=rows.find(r=>r.id===id);if(r){await navigator.clipboard.writeText(r.phone||'');message('已複製電話，未分配或變更甲方編號。');}}
      if(action==='status'){
        if(!Object.hasOwn(statusLabels,button.dataset.value))throw new Error('無效的狀態。');
        const open=$('k-detail').open&&$('k-detail').dataset.id===id;
        const draft=open?$('k-notes').value:null;
        await patch(id,{status:button.dataset.value});if(open){detail(id);$('k-notes').value=draft;}message('K版狀態已更新。');
      }
      if(action==='notes'){await patch(id,{notes:$('k-notes').value});message('K版備註已儲存。');}
      if(action==='edit-number'||action==='clear-number'){const n=action==='clear-number'?null:Number($('k-edit-number').value);if(n!==null&&(!Number.isInteger(n)||n<1||n>999999))throw new Error('編號請填寫 1–999999。');await patch(id,{client_copy_number:n});detail(id);message(n===null?'K版訂單編號已清除，下次複製會重新分配。':'K版訂單編號已更新。');}
      if(action==='export')await exportRows();
    }catch(e){(action==='test-line'?settingsMessage:message)('K版操作失敗：'+(e.message||e),true);}
    finally{busy=false;button.disabled=false;if(['prev','next','first','last','jump'].includes(action))render();}
  }
  root.addEventListener('click',handleAction);
  settingsRoot.addEventListener('click',handleAction);
  root.addEventListener('change',async event=>{
    const el=event.target;
    if(['k-from','k-to','k-status','k-source'].includes(el.id)){
      if(el.id==='k-from'||el.id==='k-to')root.querySelectorAll('.quick-dates button').forEach(b=>b.classList.remove('active'));
      page=1;selected.clear();try{await load();}catch(e){message('K版載入失敗：'+e.message,true);}return;
    }
    if(el.dataset.select){const r=rows.find(r=>r.id===el.dataset.select);if(el.checked)selected.set(r.id,r);else selected.delete(r.id);render();}
    if(el.id==='k-select-all'){rows.forEach(r=>el.checked?selected.set(r.id,r):selected.delete(r.id));render();}
    if(el.dataset.status){try{await patch(el.dataset.status,{status:el.value});message('K版狀態已更新。');}catch(e){message(e.message,true);render();}}
  });
  $('k-search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();root.querySelector('[data-action="search"]').click();}});
  $('k-jump').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();root.querySelector('[data-action="jump"]').click();}});
  $('k-detail').addEventListener('click',e=>{if(e.target===$('k-detail')){const b=e.target.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)e.target.close();}});
  window.KAdmin={
    prepareSettings,saveSettings,renderPixels,
    addPixel(){if(kPixels.length>=5){alert('每個版本最多可設定 5 個 FB Pixel。');return;}kPixels.push({id:'',enabled:true,platform:'facebook'});renderPixels();},
    updatePixel(i,value){kPixels[i].id=String(value).trim();},
    togglePixel(i,value){kPixels[i].enabled=value;},
    removePixel(i){if(confirm(`確定刪除 Pixel ${kPixels[i].id||'此空白項目'}？`)){kPixels.splice(i,1);renderPixels();}},
    async showSettings(){try{await ensureSettings();}catch{}},
    async show(visible){root.classList.toggle('hidden',!visible);if(!visible){if($('k-detail').open)$('k-detail').close();return;}if(!initialized){try{await Promise.all([load(),ensureSettings()]);initialized=true;}catch(e){message('K版載入失敗：'+e.message,true);}}}
  };
})();
