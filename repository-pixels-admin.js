/* FB settings only. Never mutates orders, shared LINE settings or numbering. */
(() => {
  'use strict';
  const sites = [
    {id:'main',name:'主倉庫',domain:'aethereas.top',versions:['C','E','F','G','I','J','K']},
    {id:'copy1',name:'複製倉庫一',domain:'orbies.top',versions:['C','E','F','G','I','J','K']},
    {id:'copy2',name:'複製倉庫二',domain:'lumeniasc.com',versions:['C','E','F','G','I','J','K']},
    {id:'copy3',name:'複製倉庫三',domain:'vectes.top',versions:['C','E','F','G','I','J','K']},
    {id:'copy4',name:'複製倉庫四',domain:'vexisds.top',versions:['C','E','F','G','I','J','K']},
    {id:'copy5',name:'複製倉庫五',domain:'zephrs.top',versions:['C','E','F','G','I','J','K']}
  ];
  const root = document.getElementById('repo-pixel-manager');
  let rows = new Map(), loading = null, loaded = false;
  const esc = text => String(text ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key = (site,variant) => site + ':' + variant;
  const style = document.createElement('style');
  style.textContent = `.repo-pixel-box{border:1px solid var(--border,#d9e2ef);border-radius:16px;margin:16px 0;background:#fff;overflow:hidden}.repo-pixel-box>summary{padding:18px;cursor:pointer;background:#f1f6fc;display:flex;gap:12px;align-items:center;flex-wrap:wrap}.repo-pixel-box>summary strong{font-size:18px;color:#17406b}.repo-pixel-domain{font-size:16px;font-weight:700;color:#2563a5;overflow-wrap:anywhere}.repo-pixel-content{padding:16px}.repo-pixel-content .pixel-version-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr));gap:14px}.repo-pixel-status{min-height:20px;margin:8px 0 0;font-size:13px}.repo-pixel-warning{padding:12px;border-radius:10px;background:#fff8e7;color:#715216;overflow-wrap:anywhere}.repo-pixel-version-footer{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px}.repo-pixel-manager-note{line-height:1.7}.repo-pixel-content input[type=text]{min-width:0}.repo-pixel-content .pixel-row{grid-template-columns:minmax(100px,1fr) auto auto}`;
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
    root.innerHTML='<p class="notice repo-pixel-manager-note">先選倉庫與域名，再編輯版本。每個版本最多 5 個 FB Pixel；空白表示停用，不會回退到其他倉庫。下方每張卡片獨立儲存，不修改 LINE 或訂單。域名僅供辨識，網站使用固定倉庫編號讀取設定。</p><div class="repo-pixel-warning" data-duplicates></div>'+sites.map(site=>`<details class="repo-pixel-box" data-site="${site.id}" ${open.has(site.id)||(!open.size&&site.id==='main')?'open':''}><summary><strong>${site.name}</strong><span class="repo-pixel-domain">${site.domain}</span>${site.pendingDomain?'<span class="notice">自訂域名待綁定</span>':''}<span class="notice">${site.versions.length} 個版本 · 點擊展開</span></summary><div class="repo-pixel-content"><div class="pixel-version-grid">${site.versions.map(v=>{
      const r=rows.get(key(site.id,v));if(!r)return '<p class="notice error">缺少 '+v+' 版設定，請重新載入。</p>';
      return `<section class="pixel-version-card" data-key="${key(site.id,v)}"><div class="pixel-version-head"><div><div class="pixel-version-title">${v}版 FB Pixel</div><div class="pixel-version-count">${site.domain}${v==='C'?'/':'/'+v.toLowerCase()+'/'} · ${r.draft.length}/5</div></div><button type="button" class="secondary" data-action="add" ${r.busy||r.draft.length>=5?'disabled':''}>新增</button></div><div class="pixel-list">${r.draft.map((p,i)=>`<div class="pixel-row"><input type="text" inputmode="numeric" value="${esc(p.id)}" data-index="${i}" data-field="id" aria-label="${site.domain} ${v}版 Pixel ${i+1}" ${r.busy?'disabled':''}><label class="pixel-toggle"><input type="checkbox" data-index="${i}" data-field="enabled" ${p.enabled?'checked':''} ${r.busy?'disabled':''}>啟用</label><button type="button" class="danger" data-action="remove" data-index="${i}" ${r.busy?'disabled':''}>刪除</button></div>`).join('')||'<p class="notice">目前未配置 FB Pixel，此版本不回傳 FB 事件。</p>'}</div><div class="repo-pixel-version-footer"><span class="notice">只影響本倉庫 ${v}版</span><button type="button" data-action="save" ${r.busy?'disabled':''}>${r.busy?'儲存中…':'儲存此版本'}</button></div><p class="repo-pixel-status ${r.error?'error':'notice'}" role="status">${esc(r.message||'')}</p></section>`;
    }).join('')}</div></div></details>`).join('')+'<button type="button" class="secondary" data-action="reload">重新載入全部倉庫的 FB 設定</button>';
    warning();
  }
  async function load() {
