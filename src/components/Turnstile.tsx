import {useCallback, useEffect, useRef, useState} from 'react';

const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
const scriptUrl = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
interface WidgetApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
}
declare global { interface Window { turnstile?: WidgetApi } }
let loading: Promise<WidgetApi> | undefined;
function loadApi(): Promise<WidgetApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) loading = new Promise<WidgetApi>((resolve,reject) => {
    const script = document.createElement('script');
    const failed = () => { clearTimeout(timer); script.remove(); loading = undefined; reject(new Error('Widget unavailable')); };
    const timer = window.setTimeout(failed, 45000);
    script.async = true;
    script.src = scriptUrl;
    script.onload = () => { clearTimeout(timer); if(window.turnstile) resolve(window.turnstile); else failed(); };
    script.onerror = failed;
    document.head.appendChild(script);
  });
  return loading;
}

function Challenge({onToken}: {onToken:(value:string)=>void}) {
  const host = useRef<HTMLDivElement>(null);
  const [attempt,retry] = useState(0);
  const [status,setStatus] = useState<'loading'|'ready'|'slow'|'error'>('loading');
  useEffect(() => {
    let active = true, id: string | undefined;
    const slow = window.setTimeout(()=>{if(active) setStatus(s=>s==='loading'?'slow':s);},12000);
    const fail = () => { if(active){onToken('');setStatus('error');} };
    setStatus('loading');
    loadApi().then(api=>{
      if (!active || !host.current) return;
      id = api.render(host.current, {sitekey:siteKey, size:'compact', theme:document.documentElement.classList.contains('dark')?'dark':'auto',
        callback:(token:string)=>{if(active){onToken(token);setStatus('ready');}},
        'expired-callback':()=>{if(active) onToken('');}, 'error-callback':fail, 'timeout-callback':fail,
      });
      setStatus(s=>s==='error'?s:'ready');
    }).catch(fail);
    return ()=>{active=false; clearTimeout(slow); onToken(''); if(id!==undefined)window.turnstile?.remove(id);};
  },[onToken,attempt]);
  return <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
    <div ref={host} />
    <div role="status">{status==='loading' && 'Loading security check. You can keep filling in the form.'}
      {status==='slow' && 'The security check is taking longer than usual. You can keep filling in the form.'}
      {status==='error' && <>The security check couldn’t load. Check your connection, then <button type="button" className="font-semibold underline" onClick={()=>retry(n=>n+1)}>try again</button>.</>}
    </div>
  </div>;
}

export const challengeNeeded = 'Please complete the security check, then try again.';
export function useTurnstile(scope: string) {
  const token = useRef('');
  const [attempt,reset] = useState(0);
  const onToken = useCallback((value:string)=>{token.current=value;},[]);
  return {
    widget:siteKey ? <Challenge key={`${scope}-${attempt}`} onToken={onToken}/> : null,
    consume() {
      if (!siteKey) return undefined;
      if (!token.current) throw new Error(challengeNeeded);
      const value = token.current;
      token.current=''; reset(n=>n+1); // A submitted token is single-use, even on failure.
      return value;
    },
  };
}
