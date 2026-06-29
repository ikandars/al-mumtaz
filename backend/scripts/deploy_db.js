import fs from 'fs';
import path from 'path';

const SECRET = 'al-mumtaz-deploy-secret-key-123';
const URL = 'https://fragrant-surf-ea74.awanio.workers.dev/api/deploy/execute-sql';

async function run() {
  console.log('Memulai migrasi dan seeding remote D1...');
  
  const migrationsDir = path.resolve('migrations');
  const files = [
    path.join(migrationsDir, '0000_init.sql'),
    path.join(migrationsDir, '0001_tutor_share_status.sql'),
    path.resolve('generated_seed.sql')
  ];

  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.warn(`File ${file} tidak ditemukan, dilewati.`);
      continue;
    }
    console.log(`Membaca file: ${path.basename(file)}...`);
    const content = fs.readFileSync(file, 'utf8');
    
    // Strip comments
    const cleanContent = content
      .replace(/--.*$/gm, '') // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments

    // Split by semicolon
    const statements = cleanContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`Ditemukan ${statements.length} instruksi SQL di ${path.basename(file)}.`);
    
    const batchSize = 15;
    for (let i = 0; i < statements.length; i += batchSize) {
      const batch = statements.slice(i, i + batchSize).map(sql => ({ sql, params: [] }));
      console.log(`Mengirim batch SQL ${i + 1} - ${Math.min(i + batchSize, statements.length)}...`);
      
      const res = await fetch(URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-deploy-secret': SECRET
        },
        body: JSON.stringify({ batch })
      });
      
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gagal mengirim batch: ${res.status} - ${errText}`);
      }
      
      const json = await res.json();
      if (!json.success) {
        throw new Error(`Gagal mengeksekusi SQL: ${json.error}`);
      }
    }
    console.log(`File ${path.basename(file)} berhasil dieksekusi.`);
  }
  
  console.log('SELESAI: Remote database berhasil diinisialisasi dan di-seed!');
}

run().catch(err => {
  console.error('Terjadi kesalahan saat deploy DB:', err);
});
