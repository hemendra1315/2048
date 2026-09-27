const token = "eyJhbGciOiJFUzI1NiIsImtpZCI6IjZkYjE1OWQwLTEzMmQtNDU5My05NjI0LTViYzhjY2IzMzMxZCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2RkZHNwbHhpaGNpaWdodm1hcXF0LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIzYTU0NjIzOS1kMGNjLTQxMGEtOTNhNi0wZGQwZGI2MmJkOGEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzkwNTA2NTY4LCJpYXQiOjE3OTA1MDI5NjgsImVtYWlsIjoiM2E1NDYyMzktZDBjYy00MTBhLTkzYTYtMGRkMGRiNjJiZDhhQHVzZXJzLmFyY2FkZS12YXVsdC5pbnZhbGlkIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJ2YXVsdCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbF92ZXJpZmllZCI6dHJ1ZX0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3OTA1MDI5Njh9XSwic2Vzc2lvbl9pZCI6IjVkM2FmOTE2LTczMjEtNGVhMy1hYTI3LThhN2MwYWY0NTk5NCIsImlzX2Fub255bW91cyI6ZmFsc2V9.fnnHJjJ6tz7YFdG3QAbovffnE59HybErgYXhaOCUIozv9t1KDYX0-scYwp7zGpRtFIr3cIGYgYddpK2kjsXsdw";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZHNwbHhpaGNpaWdodm1hcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MzkwMjMsImV4cCI6MjEwNTMxNTAyM30.pnsb2zejuaHkauMMM0d6otRofPxMtx-K0-1iMvWeyJ8";
const baseUrl = "https://dddsplxihciighvmaqqt.supabase.co";

async function main() {
  const headers = {
    'apikey': anonKey,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  console.log('1. Fetching my profile:');
  const myProfRes = await fetch(`${baseUrl}/rest/v1/profiles?id=eq.3a546239-d0cc-410a-93a6-0dd0db62bd8a&select=*`, { headers });
  console.log('My Profile:', await myProfRes.json());

  console.log('\n2. Fetching all profiles:');
  const allProfRes = await fetch(`${baseUrl}/rest/v1/profiles?select=*`, { headers });
  const allProfiles = await allProfRes.json();
  console.log('All Profiles count:', allProfiles.length);
  console.log('Profiles:', allProfiles);

  console.log('\n3. Searching for gopika:');
  const gopikaRes = await fetch(`${baseUrl}/rest/v1/profiles?username=eq.gopika&select=*`, { headers });
  console.log('Gopika Profile:', await gopikaRes.json());
}

main().catch(console.error);
