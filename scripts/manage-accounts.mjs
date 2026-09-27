import puppeteer from 'puppeteer-core';

async function run() {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('localhost')) || pages[0];

  const result = await page.evaluate(async () => {
    const tok = localStorage.getItem('sb-dddsplxihciighvmaqqt-auth-token');
    const sess = tok ? JSON.parse(tok) : null;
    const token = sess?.access_token;
    const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZHNwbHhpaGNpaWdodm1hcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MzkwMjMsImV4cCI6MjEwNTMxNTAyM30.pnsb2zejuaHkauMMM0d6otRofPxMtx-K0-1iMvWeyJ8';
    const baseUrl = 'https://dddsplxihciighvmaqqt.supabase.co';

    const myProfileRes = await fetch(`${baseUrl}/rest/v1/profiles?id=eq.${sess?.user?.id}&select=*`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` }
    });
    const myProfile = await myProfileRes.json();

    // Check if we can search or list users via RPC or profiles
    const allProfilesRes = await fetch(`${baseUrl}/rest/v1/profiles?select=*`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` }
    });
    const allProfiles = await allProfilesRes.json();

    return {
      currentUserProfile: myProfile,
      allProfiles: allProfiles,
    };
  });

  console.log('RESULT:', JSON.stringify(result, null, 2));
  await browser.disconnect();
}

run().catch(console.error);
