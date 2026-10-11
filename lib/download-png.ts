/** Keep the object URL alive long enough for mobile browsers to begin saving. */
function savePng(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Only named, owner-configured parent origins can receive browser-local images. */
export function downloadPng(blob: Blob, fileName: string) {
  const origins=(process.env.NEXT_PUBLIC_EMBED_ORIGINS||'').split(',').flatMap(raw=>{
    try { const url=new URL(raw.trim());return url.protocol==='https:'&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash?[url.origin]:[]; } catch { return []; }
  });
  if(window.parent===window||origins.length===0){savePng(blob,fileName);return;}
  const id=crypto.randomUUID();
  const accepted=(event:MessageEvent)=>{
    if(event.source!==window.parent||!origins.includes(event.origin)||event.data?.type!=='nekocircle:download-accepted'||event.data?.id!==id)return;
    window.clearTimeout(fallback);window.removeEventListener('message',accepted);
  };
  const fallback=window.setTimeout(()=>{window.removeEventListener('message',accepted);savePng(blob,fileName);},1200);
  window.addEventListener('message',accepted);
  for(const origin of origins)window.parent.postMessage({type:'nekocircle:download',id,name:fileName,blob},origin);
}
