import WebSocket from 'ws';

async function main() {
  const pagesRes = await fetch('http://127.0.0.1:9222/json');
  const pages = await pagesRes.json();
  const page = pages.find(p => p.type === 'page' && p.url.includes('localhost')) || pages[0];
  if (!page) {
    console.error('No page found');
    return;
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let id = 1;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = id++;
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === msgId) {
        ws.off('message', handler);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  const res = await send('Runtime.evaluate', {
    expression: `(async () => {
      // 1. Get current user & token
      const tok = localStorage.getItem('sb-dddsplxihciighvmaqqt-auth-token');
      const sess = tok ? JSON.parse(tok) : null;
      const token = sess?.access_token;
      const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZHNwbHhpaGNpaWdodm1hcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MzkwMjMsImV4cCI6MjEwNTMxNTAyM30.pnsb2zejuaHkauMMM0d6otRofPxMtx-K0-1iMvWeyJ8';
      const baseUrl = 'https://dddsplxihciighvmaqqt.supabase.co';

      // 2. Query available users
      const profsRes = await fetch(baseUrl + '/rest/v1/profiles?select=id,username,display_name', {
        headers: { apikey: anonKey, Authorization: 'Bearer ' + token }
      });
      const profs = await profsRes.json();

      // 3. Test calling create_group_chat RPC directly
      const rpcRes = await fetch(baseUrl + '/rest/v1/rpc/create_group_chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify({
          p_name: 'Test Debug Squad',
          p_member_ids: profs && profs.length > 1 ? [profs[1].id] : []
        })
      });
      const rpcData = await rpcRes.text();

      // 4. Test biometric register options call
      const bioRes = await fetch(baseUrl + '/functions/v1/vault-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify({ action: 'webauthn-register-options' })
      });
      const bioData = await bioRes.text();

      return {
        origin: window.location.origin,
        user: sess?.user?.id,
        profilesCount: profs?.length,
        profs: profs,
        createGroupChatStatus: rpcRes.status,
        createGroupChatResponse: rpcData,
        biometricRegisterStatus: bioRes.status,
        biometricRegisterResponse: bioData
      };
    })()`,
    returnByValue: true,
    awaitPromise: true
  });

  console.log('DIAGNOSTICS RESULT:', JSON.stringify(res.result?.value, null, 2));
  ws.close();
}

main().catch(console.error);
