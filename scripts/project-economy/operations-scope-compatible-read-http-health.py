"""TEST ONLY fixed no-proxy/no-redirect probe, supervised by owned 35s process budget."""
import os
import sys
import time
import urllib.request


def main():
    if os.environ.get('CI')!='true' or os.environ.get('EVENTFLOW_SCOPE_COMPATIBLE_READ_ISOLATED_DB')!='true' or os.environ.get('PGDATABASE')!='eventflow_scope_publication_runtime':return 2
    if any(value and key.lower() in {'http_proxy','https_proxy','all_proxy','no_proxy'} for key,value in os.environ.items()):return 2
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*_args,**_kwargs):return None
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
    deadline=time.monotonic()+30
    while time.monotonic()<deadline:
        try:
            with opener.open(urllib.request.Request('http://127.0.0.1:55407/',method='GET'),timeout=min(2,deadline-time.monotonic())) as response:
                if response.status==200 and time.monotonic()<deadline:
                    print('operations-scope-compatible-read-http-health PASS fixed_loopback_no_redirect');return 0
        except OSError:pass
        time.sleep(.1)
    return 1

if __name__=='__main__':
    try:sys.exit(main())
    except Exception:sys.exit(1)
