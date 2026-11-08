(() => {
  'use strict';

  // These are the confirmed custom domains used by copy9, not editable display labels.
  const copy9Domains = new Set(['atollgh.top', 'vectonrg.top', 'catenwe.top']);

  function copy9I(variant, sourceUrl) {
    if (!/^I(?:版本|版)?$/i.test(String(variant || '').trim())) return false;
    let url;
    try { url = new URL(String(sourceUrl || '').trim()); }
    catch { return false; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
    if (copy9Domains.has(host)) return true;
    return host === 'tunhong145-cmd.github.io' && /^\/d-project-landing-copy9\/i(?:\/|$)/i.test(url.pathname);
  }

  window.OrderVersionBadge = Object.freeze({ copy9I });
})();
