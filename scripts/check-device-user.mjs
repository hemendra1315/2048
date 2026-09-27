import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dddsplxihciighvmaqqt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZHNwbHhpaGNpaWdodm1hcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MzkwMjMsImV4cCI6MjEwNTMxNTAyM30.pnsb2zejuaHkauMMM0d6otRofPxMtx-K0-1iMvWeyJ8';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d').single();
console.log('Profile on physical device:', profile);
