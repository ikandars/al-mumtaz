# Al-Mumtaz CRM

Aplikasi Customer Relationship Management (CRM) dan Manajemen Akademik untuk **Rumah Qur'an Al-Mumtaz** (lembaga pelatihan dan pembelajaran membaca Al-Qur'an). Aplikasi ini bersifat open-source dan dirancang agar dapat digunakan secara gratis oleh lembaga Rumah Qur'an lainnya, baik untuk penggunaan secara online maupun offline (lokal). Sistem ini membantu administrator dan staf mengelola data siswa, kelas, ujian, pembayaran, arus kas keuangan, serta pembagian mukafaah pengajar.

---

## Fitur Utama

- **Manajemen Siswa & Pengguna**: Profil lengkap siswa, keikutsertaan kelas, status iuran aktif/nonaktif, serta kelola akun staff & guru pengajar dengan hak akses tingkat (*Permissions*: Create, Update, Delete).
- **Manajemen Kelas & Anggota**: Tambah/edit kelas dengan iuran bulanan kustom, penentuan guru pengajar (*Tutors*), pengelolaan pendaftaran anggota kelas, serta cek status iuran per bulan.
- **Manajemen Jadwal Ujian**: Penjadwalan ujian untuk kelas tertentu atau terbuka umum beserta nominal biaya pendaftarannya.
- **Pencatatan Transaksi Pembayaran**:
  - Input pembayaran iuran bulanan kelas atau pendaftaran ujian.
  - Pilihan auto-filter kelas berdasarkan siswa yang dipilih.
  - Opsi *Terapkan Biaya Admin* (dihitung dinamis menggunakan *tier* nominal) dengan default otomatis mengikuti pengaturan bawaan kelas, tetapi tetap dapat diubah secara manual.
  - Pengunggahan berkas bukti transfer (Gambar/PDF) ke Cloudflare R2 Object Storage.
- **Kalkulasi & Pratinjau Nominal Real-time**: Kalkulasi dinamis untuk rincian Biaya Admin Agensi, Mukafaah Pengajar (bersih), serta pembagian porsi mukafaah antar pengajar secara real-time.
- **Ekspor Bukti Tanda Bayar (PDF)**: Tombol cetak langsung kuitansi resmi dalam format PDF yang dilengkapi dengan Logo, UUID Transaksi, serta konversi angka nominal ke huruf terbilang bahasa Indonesia (contoh: Rp 150.000 menjadi *"Seratus Lima Puluh Ribu Rupiah"*).
- **Laporan Keuangan & Pengajar**:
  - **Laporan Arus Kas**: Pencatatan saldo kas awal, pemasukan (iuran & donasi), pengeluaran agensi (listrik, wifi, dll), serta saldo akhir bulanan yang otomatis dibawa ke saldo awal bulan berikutnya.
  - **Laporan Iuran Kelas**: Daftar rekapitulasi pembayaran iuran siswa per kelas per bulan.
  - **Laporan Mukafaah**: Akumulasi pembagian mukafaah per guru pengajar per bulan dengan fitur pembayaran (Disburse) instan.
- **Keamanan & Antarmuka Pengguna**:
  - Tombol *Show/Hide Password* (ikon mata) interaktif pada form login.
  - Antarmuka web responsif dan ramah seluler (*mobile-first*), menggunakan skema warna HSL, Outfit typography, hover effects, dan dukungan Progressive Web App (PWA).
  - Notifikasi real-time instan menggunakan teknologi Server-Sent Events (SSE).

---

## Teknologi yang Digunakan

### Frontend
- **Framework**: [Lit Element](https://lit.dev/) (Web Components, Reactive States, TypeScript)
- **Bundler & Dev Server**: [Vite](https://vitejs.dev/)
- **Design System**: Vanilla CSS dengan variabel CSS kustom untuk responsivitas dan fleksibilitas.

### Backend
- **Framework**: [Hono](https://hono.dev/) (Fast & Lightweight Web Framework)
- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/) (Serverless)
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (Serverless SQL Database / SQLite-based)
- **Storage**: [Cloudflare R2](https://developers.cloudflare.com/r2/) (S3-compatible Object Storage untuk bukti transfer)
- **Streaming**: Server-Sent Events (SSE) untuk notifikasi siaran instan.

---

## Panduan Menjalankan di Lokal

### Prasyarat
- [Node.js](https://nodejs.org/) (versi 18+)
- Cloudflare Wrangler CLI (terinstal otomatis via devDependencies)

### Langkah Setup

1. **Kloning Repositori**:
   ```bash
   git clone git@github.com:ikandars/crm-rq-al-mumtaz.git
   cd crm-rq-al-mumtaz
   ```

2. **Inisialisasi Database Lokal & Seeding**:
   Jalankan perintah berikut di folder root untuk menyiapkan database D1 lokal dan mengisi data dummy awal:
   ```bash
   cd backend
   npm install
   
   # Membuat file database lokal & skema migrasi
   npx wrangler d1 migrations apply al-mumtaz-crm-db --local
   
   # Memasukkan data awal (seed)
   npx wrangler d1 execute al-mumtaz-crm-db --file=./new_seed.sql --local
   ```
   *Catatan*: Database lokal akan disimpan di folder `.wrangler/state/v3/d1`.

3. **Menjalankan Backend (Wrangler Dev)**:
   ```bash
   # Di dalam folder backend
   npm run dev
   ```
   Backend akan berjalan secara default di `http://localhost:8787`.

4. **Menjalankan Frontend (Vite Dev Server)**:
   Buka terminal baru di folder root:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Vite akan mem-proxy semua request `/api` ke `http://localhost:8787`. Akses aplikasi di browser Anda di alamat:
   **http://localhost:5173**

### Kredensial Login Admin (Bawaan Seed)
- **Username**: `mika`
- **Password**: `Innuyasa07`

---

## Panduan Deployment (Cloudflare)

Untuk mendeploy aplikasi ke Cloudflare Workers produksi:

1. Pastikan Anda sudah login ke Cloudflare:
   ```bash
   npx wrangler login
   ```

2. Buat database D1 dan bucket R2 baru di Cloudflare Dashboard Anda, lalu sesuaikan binding ID di `backend/wrangler.jsonc`.

3. Jalankan migrasi di database produksi:
   ```bash
   npx wrangler d1 migrations apply al-mumtaz-crm-db --remote
   ```

4. Build frontend dan deploy backend beserta static assets-nya:
   ```bash
   # Build frontend di folder frontend/
   cd frontend
   npm run build
   
   # Deploy ke Cloudflare di folder backend/
   cd ../backend
   npm run deploy
   ```

---

## Lisensi

Proyek ini dilisensikan di bawah **MIT License**. Lihat berkas [LICENSE](LICENSE) untuk informasi lebih lanjut.
