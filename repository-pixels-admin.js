/* FB settings only. Never mutates orders, shared LINE settings or numbering. */
(() => {
  'use strict';
  const sites = [
    {id:'main',name:'主倉庫',domain:'zenittra.com',versions:['C','E','F','G','I','J','K']},
    {id:'copy1',name:'複製倉庫一',domain:'monofhj.com',versions:['C','E','F','I','J','K']},
    {id:'copy2',name:'複製倉庫二',domain:'nexspirs.com',versions:['C','E','F','I','J','K']}
  ];
  const root = document.getElementById('repo-pixel-manager');
  let rows = new Map(), loading = null, loaded = false;
  const esc = text => String(text ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key = (site,variant) => site + ':' + variant;
  const style = document.createElement('style');
  style.textContent = `.repo-pixel-box{border:1px solid var(--border,#d9e2ef);border-radius:16px;margin:16px 0;background:#fff;overflow:hidden}.repo-pixel-box>summary{padding:18px;cursor:pointer;background:#f1f6fc;display:flex;gap:12px;align-items:center;flex-wrap:wrap}.repo-pixel-box>summary strong{font-size:18px;color:#17406b}.repo-pixel-domain{font-size:16px;font-weight:700;color:#2563a5}.repo-pixel-content{padding:16px}.repo-pixel-content .pixel-version-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr));gap:14px}.repo-pixel-status{min-height:20px;margin:8px 0 0;font-size:13px}.repo-pixel-warning{padding:12px;border-radius:10px;background:#fff8e7;color:#715216;overflow-wrap:anywhere}.repo-pixel-version-footer{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px}.repo-pixel-manager-note{line-height:1.7}.repo-pixel-content input[type=text]{min-width:0}.repo-pixel-content .pixel-row{grid-template-columns:minmax(100px,1fr) auto auto}`;
  document.head.append(style);
  function warning() {
    const locations = new Map();
    rows.forEach(r=>r.draft.filter(p=>p.enabled&&p.id.trim()).forEach(p=>{
      const entries=locations.get(p.id.trim())||[];entries.push(r.site_id+'/'+r.variant);locations.set(p.id.trim(),entries);
    }));
    const duplicates=[...locations].filter(([,places])=>places.length>1);
    const box=root.querySelector('[data-duplicates]');
    if(box) box.textContent=duplicates.length ? '跨站／跨版本共用提醒：'+duplicates.map(([id,places])=>id+'（'+places.join('、')+'）').join('；')+'。相同 ID 仍會接收這些位置的事件。' : '目前沒有跨站／跨版本重複的啟用 FB Pixel。';
  }
  function render() {
    const open = new Set([...root.querySelectorAll('details[open]')].map(e=>e.dataset.site));
    root.innerHTML='<p class="notice repo-pixel-manager-note">先選倉庫與域名，再編輯版本。每個版本最多 5 個 FB Pixel；空白表示停用，不會回退到其他倉庫。下方每張卡片獨立儲存，不修改 LINE 或訂單。域名僅供辨識，網站使用固定倉庫編號讀取設定。</p><div class="repo-pixel-warning" data-duplicates></div>'+sites.map(site=>`<details class="repo-pixel-box" data-site="${site.id}" ${open.has(site.id)||(!open.size&&site.id==='main')?'open':''}><summary><strong>${site.name}</strong><span class="repo-pixel-domain">${site.domain}</span><span class="notice">${site.versions.length} 個版本 · 點擊展開</span></summary><div class="repo-pixel-content"><div class="pixel-version-grid">${site.versions.map(v=>{
      const r=rows.get(key(site.id,v));if(!r)return '<p class="notice error">缺少 '+v+' 版設定，請重新載入。</p>';
      return `<section class="pixel-version-card" data-key="${key(site.id,v)}"><div class="pixel-version-head"><div><div class="pixel-version-title">${v}版 FB Pixel</div><div class="pixel-version-count">${site.domain}${v==='C'?'/':'/'+v.toLowerCase()+'/'} · ${r.draft.length}/5</div></div><button type="button" class="secondary" data-action="add" ${r.busy||r.draft.length>=5?'disabled':''}>新增</button></div><div class="pixel-list">${r.draft.map((p,i)=>`<div class="pixel-row"><input type="text" inputmode="numeric" value="${esc(p.id)}" data-index="${i}" data-field="id" aria-label="${site.domain} ${v}版 Pixel ${i+1}" ${r.busy?'disabled':''}><label class="pixel-toggle"><input type="checkbox" data-index="${i}" data-field="enabled" ${p.enabled?'checked':''} ${r.busy?'disabled':''}>啟用</label><button type="button" class="danger" data-action="remove" data-index="${i}" ${r.busy?'disabled':''}>刪除</button></div>`).join('')||'<p class="notice">目前未配置 FB Pixel，此版本不回傳 FB 事件。</p>'}</div><div class="repo-pixel-version-footer"><span class="notice">只影響本倉庫 ${v}版</span><button type="button" data-action="save" ${r.busy?'disabled':''}>${r.busy?'儲存中…':'儲存此版本'}</button></div><p class="repo-pixel-status ${r.error?'error':'notice'}" role="status">${esc(r.message||'')}</p></section>`;
    }).join('')}</div></div></details>`).join('')+'<button type="button" class="secondary" data-action="reload">重新載入三個倉庫的 FB 設定</button>';
    warning();
  }
  async function load() {
    if(loading)return loading;
    loading=(async()=>{
      const {data,error}=await client.from('repository_fb_pixels').select('site_id,variant,pixel_ids,updated_at').order('site_id').order('variant');
      if(error)throw error;
      const next=new Map();
      for(const r of data||[])next.set(key(r.site_id,r.variant),{...r,draft:r.pixel_ids.map(p=>({id:p.id,enabled:p.enabled!==false}))});
      if(sites.some(s=>s.versions.some(v=>!next.has(key(s.id,v)))))throw new Error('倉庫設定不完整，未開放儲存。');
      rows=next;loaded=true;render();
    })().catch(e=>{root.innerHTML='<p class="notice error">FB 設定載入失敗：'+esc(e.message)+'</p><button type="button" data-action="reload">重試</button>';throw e;}).finally(()=>{loading=null;});
    return loading;
  }
  function changed(r){return JSON.stringify(r.draft)!==JSON.stringify(r.pixel_ids);}
  root.addEventListener('input',e=>{
    const card=e.target.closest('[data-key]'), field=e.target.dataset.field;if(!card||!field)return;
    const r=rows.get(card.dataset.key),p=r?.draft[Number(e.target.dataset.index)];if(!p||r.busy)return;
    p[field]=field==='enabled'?e.target.checked:e.target.value;r.message='尚未儲存';
    card.querySelector('[role=status]').textContent='尚未儲存';warning();
  });
  root.addEventListener('click',async e=>{
    const button=e.target.closest('[data-action]');if(!button)return;
    const action=button.dataset.action,card=button.closest('[data-key]'),r=card&&rows.get(card.dataset.key);
    if(action==='reload'){
      if([...rows.values()].some(x=>x.busy))return;
      if([...rows.values()].some(changed)&&!confirm('重新載入將放棄尚未儲存的 FB 修改，確定繼續？'))return;
      loaded=false;await load().catch(()=>{});return;
    }
    if(!r||r.busy)return;
    if(action==='add'){if(r.draft.length<5)r.draft.push({id:'',enabled:true});r.message='尚未儲存';render();return;}
    if(action==='remove'){r.draft.splice(Number(button.dataset.index),1);r.message='尚未儲存';render();return;}
    if(action!=='save')return;
    const pixels=r.draft.map(p=>({id:p.id.trim(),enabled:!!p.enabled})).filter(p=>p.id);
    if(pixels.length>5||pixels.some(p=>!/^\d{8,20}$/.test(p.id))||new Set(pixels.map(p=>p.id)).size!==pixels.length){r.error=true;r.message='請填寫 8–20 位數字，同一版本不得重複，最多 5 個。';render();return;}
    const site=sites.find(s=>s.id===r.site_id);
    if(!confirm(`只儲存 ${site.name} ${site.domain} 的 ${r.variant}版 FB Pixel（${pixels.length} 個）。${pixels.length?'':'此版本將停止回傳 FB 事件。'}其他設定不變，確定？`))return;
    r.busy=true;r.error=false;r.message='儲存中…';render();
    try{
      const {data,error}=await client.from('repository_fb_pixels').update({pixel_ids:pixels,updated_at:new Date().toISOString()}).eq('site_id',r.site_id).eq('variant',r.variant).eq('updated_at',r.updated_at).select('pixel_ids,updated_at');
      if(error)throw error;if(!data?.length)throw new Error('此版本已被其他人修改或沒有寫入權限，請重新載入後再儲存。');
      r.pixel_ids=data[0].pixel_ids;r.updated_at=data[0].updated_at;r.draft=r.pixel_ids.map(p=>({...p}));r.message='已儲存。客戶重新開啟／重新整理頁面後生效。';
    }catch(error){r.error=true;r.message='儲存失敗：'+error.message;}finally{r.busy=false;render();}
  });
  window.RepositoryPixelsAdmin={show(){if(!loaded)load().catch(()=>{});}};
})();
