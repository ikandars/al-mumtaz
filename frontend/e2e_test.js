import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  console.log('Memulai E2E test menggunakan Puppeteer...');
  
  // Launch browser
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Set viewport to mobile size
  await page.setViewport({ width: 480, height: 850 });

  // Helper to click tabs inside Shadow DOM
  async function clickTab(tabName) {
    console.log(`Mengklik tab: ${tabName}`);
    await page.evaluate((name) => {
      const app = document.querySelector('almumtaz-crm');
      const buttons = Array.from(app.shadowRoot.querySelectorAll('.bottom-nav button'));
      const btn = buttons.find(b => b.textContent.includes(name));
      if (btn) {
        btn.click();
      } else {
        throw new Error(`Tab ${name} tidak ditemukan di bottom-nav`);
      }
    }, tabName);
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  try {
    // 1. Navigate to frontend dev server
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle2' });
    console.log('Membuka halaman login...');

    // Wait for login form
    await page.waitForSelector('almumtaz-crm');
    
    // Fill credentials inside Shadow DOM
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      app.shadowRoot.querySelector('#login-username').value = 'mika';
      app.shadowRoot.querySelector('#login-password').value = 'Innuyasa07';
      app.shadowRoot.querySelector('form').dispatchEvent(new Event('submit'));
    });

    console.log('Mencoba masuk...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify login success
    const loggedInUser = await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      return app.shadowRoot.textContent.includes('Mika Dwi Indah');
    });

    if (!loggedInUser) {
      throw new Error('Gagal Login: Nama Staff tidak terdeteksi di Dashboard');
    }
    console.log('Login Sukses: Mika Dwi Indah masuk ke Dashboard.');

    // Take screenshot of blank Dashboard
    await page.screenshot({ path: '/Users/kandar/.gemini/antigravity-ide/brain/af78f44a-8c32-479a-87fe-8abbbee86d85/1_dashboard_empty.png' });

    // 2. Click "Pengguna" Tab to Add Student & Tutor
    await clickTab('Pengguna');
    await page.screenshot({ path: '/Users/kandar/.gemini/antigravity-ide/brain/af78f44a-8c32-479a-87fe-8abbbee86d85/2_users_empty.png' });

    // Add Student "Ahmad Budi"
    console.log('Menambahkan siswa Ahmad Budi...');
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      // Trigger modal add user
      app.activeModal = 'user-add';
    });
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      const form = app.shadowRoot.querySelector('form');
      form.querySelector('#user-name').value = 'Ahmad Budi';
      form.querySelector('#user-email').value = 'budi@almumtaz.com';
      form.querySelector('#user-phone').value = '081234567891';
      form.querySelector('#user-is-participant').checked = true;
      form.dispatchEvent(new Event('submit'));
    });
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Add Tutor "Ustadz Hanafi"
    console.log('Menambahkan tutor Ustadz Hanafi...');
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      app.activeModal = 'user-add';
    });
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      const form = app.shadowRoot.querySelector('form');
      form.querySelector('#user-name').value = 'Ustadz Hanafi';
      form.querySelector('#user-email').value = 'hanafi@almumtaz.com';
      form.querySelector('#user-phone').value = '081234567892';
      form.querySelector('#user-is-participant').checked = false;
      form.querySelector('#user-is-tutor').checked = true;
      form.querySelector('#user-is-staff').checked = false;
      form.dispatchEvent(new Event('submit'));
    });
    await new Promise(resolve => setTimeout(resolve, 1500));
    await page.screenshot({ path: '/Users/kandar/.gemini/antigravity-ide/brain/af78f44a-8c32-479a-87fe-8abbbee86d85/3_users_added.png' });

    // 3. Click "Kelas" Tab to Create Class & Assign Student
    await clickTab('Kelas');
    console.log('Membuat kelas baru "Kelas Tahsin Al-Quran"...');
    
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      app.activeModal = 'class-add';
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Find tutor Hanafi's checkbox and create class
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      const form = app.shadowRoot.querySelector('form');
      form.querySelector('#class-name').value = 'Kelas Tahsin Al-Quran';
      form.querySelector('#class-description').value = 'Jadwal Sore';
      form.querySelector('#class-fee').value = '100000';
      form.querySelector('#class-status').value = 'active';
      
      // Check the first tutor checkbox
      const tutorCB = form.querySelector('.class-tutor-check');
      if (tutorCB) tutorCB.checked = true;
      
      form.dispatchEvent(new Event('submit'));
    });
    await new Promise(resolve => setTimeout(resolve, 1500));
    await page.screenshot({ path: '/Users/kandar/.gemini/antigravity-ide/brain/af78f44a-8c32-479a-87fe-8abbbee86d85/4_class_created.png' });

    // Enroll Ahmad Budi into "Kelas Tahsin Al-Quran"
    console.log('Mendaftarkan siswa Ahmad Budi ke kelas...');
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      const classCard = app.shadowRoot.querySelector('.list-card');
      // Trigger members modal for this class
      app.openClassMembers(app.classes[0]);
    });
    await new Promise(resolve => setTimeout(resolve, 800));

    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      const modal = app.shadowRoot.querySelector('.modal-content');
      // Select the first student (Ahmad Budi) from dropdown
      const select = modal.querySelector('#add-member-select');
      select.value = app.participants[0].id;
      modal.querySelector('form').dispatchEvent(new Event('submit'));
    });
    await new Promise(resolve => setTimeout(resolve, 1500));
    await page.screenshot({ path: '/Users/kandar/.gemini/antigravity-ide/brain/af78f44a-8c32-479a-87fe-8abbbee86d85/5_student_enrolled.png' });

    // Close members modal
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      app.activeModal = null;
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // 4. Click "Keuangan" Tab to input payment
    await clickTab('Keuangan');
    console.log('Menginput transaksi pembayaran Rp 100.000...');
    
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      app.activeModal = 'payment-add';
      app.liveAmount = 0;
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      const form = app.shadowRoot.querySelector('form');
      
      form.querySelector('#pay-student').value = app.participants[0].id;
      form.querySelector('#pay-type').value = 'course';
      
      // Dispatch change to show class select
      form.querySelector('#pay-type').dispatchEvent(new Event('change'));
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      const form = app.shadowRoot.querySelector('form');
      form.querySelector('#pay-class').value = app.classes[0].id;
      form.querySelector('#pay-amount').value = '100000';
      form.querySelector('#pay-amount').dispatchEvent(new Event('input')); // trigger fee preview
      form.querySelector('#pay-notes').value = 'Iuran Bulan Juli';
      
      form.dispatchEvent(new Event('submit'));
    });
    await new Promise(resolve => setTimeout(resolve, 1500));
    await page.screenshot({ path: '/Users/kandar/.gemini/antigravity-ide/brain/af78f44a-8c32-479a-87fe-8abbbee86d85/6_payment_added_pending.png' });

    // 5. Approve Payment
    console.log('Menyetujui (Approve) pembayaran pending...');
    // Open payment details modal
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      app.openPaymentDetails(app.payments[0].id);
    });
    await new Promise(resolve => setTimeout(resolve, 800));

    // Fill verification note and click Approve
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      const modal = app.shadowRoot.querySelector('.modal-content');
      modal.querySelector('#verify-notes').value = 'Bukti transfer valid dan cocok.';
      // Trigger verify status
      app.handleVerifyPayment('approved');
    });
    await new Promise(resolve => setTimeout(resolve, 1500));
    await page.screenshot({ path: '/Users/kandar/.gemini/antigravity-ide/brain/af78f44a-8c32-479a-87fe-8abbbee86d85/7_payment_approved.png' });

    // 6. Return to "Dasbor" to Verify Stats
    await clickTab('Dasbor');
    console.log('Memverifikasi perhitungan matematika pada Dasbor...');
    await page.screenshot({ path: '/Users/kandar/.gemini/antigravity-ide/brain/af78f44a-8c32-479a-87fe-8abbbee86d85/8_dashboard_final.png' });

    const finalStats = await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      const text = app.shadowRoot.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
      return {
        netIncome: text.includes('Rp 70.000'),
        adminKas: text.includes('Rp 30.000'),
        totalKotor: text.includes('Rp 100.000'),
        tutorPayout: text.includes('Rp 70.000') && text.includes('Ustadz Hanafi')
      };
    });

    console.log('Statistik Hasil E2E:', finalStats);
    if (!finalStats.netIncome || !finalStats.adminKas || !finalStats.totalKotor || !finalStats.tutorPayout) {
      throw new Error('Verifikasi Statistik Gagal: Angka di Dasbor tidak cocok dengan Rp 70.000 net, Rp 30.000 admin, atau share tutor!');
    }
    
    console.log('E2E TEST BERHASIL: Seluruh alur data, transaksi pembayaran, pembagian fee tutor, dan visualisasi dasbor sukses teruji!');

  } catch (err) {
    console.error('TERJADI ERROR SAAT E2E TEST:', err);
    await page.screenshot({ path: '/Users/kandar/.gemini/antigravity-ide/brain/af78f44a-8c32-479a-87fe-8abbbee86d85/error_screenshot.png' });
  } finally {
    await browser.close();
    console.log('Browser ditutup.');
  }
})();
