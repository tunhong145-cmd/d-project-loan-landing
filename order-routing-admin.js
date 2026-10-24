/* Admin-only new-order routing. Never moves, edits or renumbers orders. */
(() => {
 'use strict';
 const versions=['C','E','F','G','I','J','K'];
 const label=q=>q==='main'?'直流':'二篩';
 const style=document.createElement('style');style.textContent='#order-routing-view .home-table{min-width:0;table-layout:fixed}#order-routing-view th:first-child{width:20%}#order-routing-view th:nth-child(2){width:30%}#order-routing-view select{width:100%;min-width:0}@media(max-width:650px){#order-routing-view .panel{padding:18px!important}#order-routing-view th,#order-routing-view td{padding:10px 5px}#order-routing-view th{font-size:11px}}';document.head.append(style);
 let saved=null,busy=false,request=0;
 const root=document.createElement('section');root.id='order-routing-view';root.className='hidden';
 root.innerHTML=`<div class="panel" style="padding:24px"><h2>訂單分流</h2><p class="notice">設定各版本新訂單的所屬列表，適用主倉庫與所有複製倉庫。歷史訂單與既有甲方編號不移動、不更改。</p><p class="notice">LINE、像素與來源版本不隨分流變更。補助金維持原邏輯。</p><p id="routing-updated" class="notice"></p><div class="home-table-wrap"><table class="home-table"><thead><tr><th>來源版本</th><th>目前新單去向</th><th>調整新單去向</th></tr></thead><tbody>${versions.map(v=>`<tr><td>${v}版</td><td id="routing-current-${v}">—</td><td><select id="routing-${v}" aria-label="${v}版新訂單去向" disabled><option value="main">直流</option><option value="second">二篩</option></select></td></tr>`).join('')}</tbody></table></div><p class="notice">例如 E版由二篩改為直流：設定生效後提交的新 E單進直流，舊單仍在二篩。已開啟的舊頁面也以送件時的設定為準。</p><p class="notice">投手專用後台的存取權限不會擴大；若將 I版改到二篩，原 I版直流專用入口不會顯示這些新單。</p><div class="settings-actions"><button id="routing-save" disabled>儲存分流設定</button><button id="routing-reload" class="secondary">重新載入</button></div><p id="routing-message" class="notice" role="status"></p></div>`;
 document.getElementById('app-panel').append(root);
 const $=id=>document.getElementById(id);
 function message(s){$('routing-message').textContent=s;}
 function lock(value){busy=value;for(const v of versions)$('routing-'+v).disabled=value||!saved;$('routing-save').disabled=value||!saved;$('routing-reload').disabled=value;}
 function render(data){
  if(!data||!Number.isInteger(data.revision)||versions.some(v=>!['main','second'].includes(data.routes?.[v])))throw new Error('設定資料不完整，未允許儲存');
  saved=data;
  for(const v of versions){$('routing-current-'+v).textContent=label(data.routes[v]);$('routing-'+v).value=data.routes[v];}
  $('routing-updated').textContent='最近更新：'+new Date(data.updated_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
 }
 async function load(){
  const token=++request;saved=null;lock(true);message('正在載入目前分流設定…');
  try{const {data,error}=await client.rpc('get_order_routing_settings');if(token!==request)return;if(error)throw error;render(data);message('尚未儲存的選擇不會生效。');}
  catch(e){if(token===request)message('載入失敗：'+e.message+'。未改動目前分流。');}
  finally{if(token===request)lock(false);}
 }
 $('routing-reload').addEventListener('click',()=>{if(!busy)load();});
 $('routing-save').addEventListener('click',async()=>{
  if(busy||!saved)return;
  const routes=Object.fromEntries(versions.map(v=>[v,$('routing-'+v).value]));
  const changed=versions.filter(v=>routes[v]!==saved.routes[v]);
  if(!changed.length){message('沒有變更，現有去向維持不變。');return;}
  if(!confirm('確認變更新訂單分流？\n\n'+changed.map(v=>`${v}版：${label(saved.routes[v])} → ${label(routes[v])}`).join('\n')+'\n\n適用所有倉庫，只影響之後提交的新訂單。歷史訂單及編號不變。'))return;
  lock(true);message('正在儲存…');
  try{
   const {data,error}=await client.rpc('save_order_routing_settings',{p_routes:routes,p_revision:saved.revision});
   if(error)throw error;render(data);message('已儲存。新提交訂單依此分流；歷史訂單與編號未變動。');
  }catch(e){saved=null;message(String(e.message).includes('ROUTING_CHANGED_RELOAD')?'其他管理員已更新分流；本次未覆蓋，請重新載入後再操作。':'未能確認儲存結果：'+e.message+'。請重新載入確認實際設定後再操作。');}
  finally{lock(false);}
 });
 window.OrderRouting={show(visible){root.classList.toggle('hidden',!visible);if(visible&&!busy)load();}};
})();
