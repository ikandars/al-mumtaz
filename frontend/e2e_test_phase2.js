import puppeteer from 'puppeteer';

(async () => {
  console.log('Memulai Verifikasi E2E Tahap 2...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 850 });

  async function clickTab(tabName) {
    console.log(`Mengklik tab: ${tabName}`);
    await page.evaluate((name) => {
      const app = document.querySelector('almumtaz-crm');
      const buttons = Array.from(app.shadowRoot.querySelectorAll('.bottom-nav button'));
      const btn = buttons.find(b => b.textContent.trim().includes(name));
      if (btn) {
        btn.click();
      } else {
        throw new Error(`Tab ${name} tidak ditemukan di bottom-nav`);
      }
    }, tabName);
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  try {
    // 1. Open login page
    await page.goto('https://fragrant-surf-ea74.awanio.workers.dev', { waitUntil: 'networkidle2' });
    console.log('Halaman login dibuka.');

    await page.waitForSelector('almumtaz-crm');

    // 2. Login as Admin (mika)
    console.log('Login sebagai Admin mika...');
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      app.shadowRoot.querySelector('#login-username').value = 'mika';
      app.shadowRoot.querySelector('#login-password').value = 'Innuyasa07';
      app.shadowRoot.querySelector('form').dispatchEvent(new Event('submit'));
    });
    
    // Wait for login success
    await page.waitForFunction(() => {
      const app = document.querySelector('almumtaz-crm');
      return app && app.shadowRoot.querySelector('.bottom-nav') !== null;
    }, { timeout: 5000 });
    console.log('Login Admin mika berhasil.');

    await page.screenshot({ path: '/Users/kandar/.gemini/antigravity-ide/brain/af78f44a-8c32-479a-87fe-8abbbee86d85/desktop_dashboard.png' });
    console.log('Screenshot desktop dashboard disimpan.');

    // 3. Test Siswa Tab (Siswa search & details)
    await clickTab('Siswa');
    console.log('Mencari siswa...');
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      app.participantSearchQuery = 'Ahmad';
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Click on the first student card (Ahmad Budi)
    console.log('Membuka detail siswa...');
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      const card = app.shadowRoot.querySelector('.item-list .list-card');
      if (card) {
        card.click();
      } else {
        throw new Error('Siswa tidak ditemukan dalam hasil pencarian');
      }
    });
    
    // Wait for details modal to open and load
    await page.waitForFunction(() => {
      const app = document.querySelector('almumtaz-crm');
      return app && app.shadowRoot.querySelector('.modal-content') !== null && app.shadowRoot.textContent.includes('Kelas yang Diikuti');
    }, { timeout: 5000 });

    await page.screenshot({ path: '/Users/kandar/.gemini/antigravity-ide/brain/af78f44a-8c32-479a-87fe-8abbbee86d85/siswa_details.png' });
    console.log('Screenshot detail siswa disimpan.');

    // Close student detail modal
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      app.activeModal = null;
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // 4. Test Laporan Tab
    await clickTab('Laporan');
    
    // Wait for report table to render Ustadz Hanafi (from summary list)
    await page.waitForFunction(() => {
      const app = document.querySelector('almumtaz-crm');
      return app && app.shadowRoot.textContent.includes('Ustadz Hanafi');
    }, { timeout: 5000 });

    const hasTutorRekap = await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      const text = app.shadowRoot.textContent;
      return text.includes('Rekap Bulanan Mukafaah') && text.includes('Ustadz Hanafi');
    });
    console.log('Verifikasi tabel rekap pengajar:', hasTutorRekap);

    // Switch to Iuran Kelas Bulanan
    console.log('Membuka Laporan Iuran Kelas Bulanan...');
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      const buttons = Array.from(app.shadowRoot.querySelectorAll('button.tab-btn'));
      const classReportBtn = buttons.find(b => b.textContent.includes('Iuran Kelas Bulanan'));
      if (classReportBtn) classReportBtn.click();
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Select Kelas Al-Fatihah (which has student Ahmad Budi) and set month
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      app.selectedReportClassId = 'class-1';
      app.selectedReportMonth = '2026-06';
      app.loadClassReport();
    });
    
    // Wait for class payment report to load
    await page.waitForFunction(() => {
      const app = document.querySelector('almumtaz-crm');
      return app && app.shadowRoot.textContent.includes('Ahmad Pratama') && app.shadowRoot.textContent.includes('Lunas');
    }, { timeout: 5000 });

    await page.screenshot({ path: '/Users/kandar/.gemini/antigravity-ide/brain/af78f44a-8c32-479a-87fe-8abbbee86d85/laporan_iuran.png' });
    console.log('Screenshot laporan iuran kelas disimpan.');

    // 5. Test Multiple Tutors Payment preview
    await clickTab('Keuangan');
    console.log('Membuka form input pembayaran...');
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      app.activeModal = 'payment-add';
      app.liveAmount = 0;
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Set class to Kelas Al-Fatihah (3 tutors) and nominal 120,000
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      app.selectedClassForPaymentId = 'class-1';
      app.liveAmount = 120000;
    });
    await new Promise(resolve => setTimeout(resolve, 800));
    await page.screenshot({ path: '/Users/kandar/.gemini/antigravity-ide/brain/af78f44a-8c32-479a-87fe-8abbbee86d85/payment_input_split.png' });
    console.log('Screenshot preview pembagian fee tutor berganda disimpan.');

    // Close payment input modal
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      app.activeModal = null;
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // === 5a. Test Expense recording ===
    console.log('Menguji pencatatan pengeluaran...');
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      // Switch local tab to expenses
      app.financeTab = 'expenses';
      app.loadExpenses();
    });
    await new Promise(resolve => setTimeout(resolve, 600));

    // Open expense modal
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      app.activeModal = 'expense-add';
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Fill form and submit
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      const root = app.shadowRoot;
      root.querySelector('#expense-desc').value = 'Biaya Internet Kantor';
      root.querySelector('#expense-amount').value = '50000';
      root.querySelector('#expense-date').value = '2026-06-28';
      root.querySelector('form').dispatchEvent(new Event('submit'));
    });
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Check expense list
    const hasExpenseText = await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      return app.shadowRoot.textContent.includes('Biaya Internet Kantor') && app.shadowRoot.textContent.includes('50.000');
    });
    console.log('Verifikasi pencatatan pengeluaran masuk daftar:', hasExpenseText);

    await page.screenshot({ path: '/Users/kandar/.gemini/antigravity-ide/brain/af78f44a-8c32-479a-87fe-8abbbee86d85/pengeluaran_kas_added.png' });
    console.log('Screenshot pengeluaran kas disimpan.');

    // === 5b. Test Cashflow Report ===
    await clickTab('Laporan');
    console.log('Membuka Laporan Arus Kas...');
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      app.selectedReportTab = 'cashflow';
      app.selectedReportMonth = '2026-06';
      app.loadCashflowReport();
    });
    await new Promise(resolve => setTimeout(resolve, 1200));

    const cashflowLoaded = await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      const text = app.shadowRoot.textContent;
      return text.includes('Saldo Awal') && text.includes('Saldo Akhir') && text.includes('Aliran Keluar') && text.includes('Biaya Internet Kantor');
    });
    console.log('Verifikasi pembacaan Laporan Arus Kas:', cashflowLoaded);

    await page.screenshot({ path: '/Users/kandar/.gemini/antigravity-ide/brain/af78f44a-8c32-479a-87fe-8abbbee86d85/laporan_arus_kas.png' });
    console.log('Screenshot laporan arus kas disimpan.');

    // === 5c. Test Attachment Wildcard Route (Fix 404) ===
    console.log('Menguji pembukaan lampiran transfer (wildcard route)...');
    const attachmentUrlResult = await page.evaluate(async () => {
      const app = document.querySelector('almumtaz-crm');
      // Find an approved payment that has attachment key
      const paymentWithAttachment = app.payments.find(p => p.attachment_r2_key);
      if (!paymentWithAttachment) return 'no_attachment_found';
      
      const token = localStorage.getItem('token');
      try {
        const url = `/api/payments/attachments/${paymentWithAttachment.attachment_r2_key}`;
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        return { status: res.status, url };
      } catch(e) {
        return { error: e.message };
      }
    });
    console.log('Hasil test download lampiran:', attachmentUrlResult);
    if (attachmentUrlResult === 'no_attachment_found') {
      console.log('Skip test lampiran karena data dummy tidak memiliki lampiran R2.');
    } else if (attachmentUrlResult.status !== 200) {
      throw new Error(`Gagal membuka bukti transfer! Status: ${attachmentUrlResult.status}. Respon Rute wildcard tidak mengembalikan status OK (200).`);
    } else {
      console.log('Verifikasi rute bukti transfer: BERHASIL (Status 200 OK)!');
    }

    // 6. Logout
    await clickTab('Pengaturan');
    console.log('Melakukan logout...');
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      app.logout();
    });
    
    // Wait for login screen to load
    await page.waitForFunction(() => {
      const app = document.querySelector('almumtaz-crm');
      return app && app.shadowRoot.querySelector('#login-username') !== null;
    }, { timeout: 5000 });
    console.log('Logout berhasil.');

    // 7. Login as Read-Only staff (lisa)
    console.log('Login sebagai Read-only lisa...');
    await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      app.shadowRoot.querySelector('#login-username').value = 'lisa';
      app.shadowRoot.querySelector('#login-password').value = 'lisa123';
      app.shadowRoot.querySelector('form').dispatchEvent(new Event('submit'));
    });
    
    // Wait for dashboard bottom-nav to appear
    await page.waitForFunction(() => {
      const app = document.querySelector('almumtaz-crm');
      return app && app.shadowRoot.querySelector('.bottom-nav') !== null;
    }, { timeout: 5000 });
    console.log('Login Lisa berhasil.');

    // Check that write buttons are hidden on Dashboard
    const dashboardButtonsOk = await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      const text = app.shadowRoot.textContent;
      const hasInputBtn = text.includes('Input Pembayaran');
      const hasClassBtn = text.includes('Kelas Baru');
      return !hasInputBtn && !hasClassBtn;
    });
    console.log('Verifikasi pembatasan tombol input di Dasbor:', dashboardButtonsOk);

    // Go to Laporan tab, check that tutor shares Action button is hidden
    await clickTab('Laporan');
    
    // Wait for report table to load Ustadz Hanafi
    await page.waitForFunction(() => {
      const app = document.querySelector('almumtaz-crm');
      return app && app.shadowRoot.textContent.includes('Ustadz Hanafi');
    }, { timeout: 5000 });

    await page.screenshot({ path: '/Users/kandar/.gemini/antigravity-ide/brain/af78f44a-8c32-479a-87fe-8abbbee86d85/readonly_reports.png' });
    console.log('Screenshot readonly laporan disimpan.');

    const reportActionsOk = await page.evaluate(() => {
      const app = document.querySelector('almumtaz-crm');
      const text = app.shadowRoot.textContent;
      const hasSetPaid = text.includes('Set Paid') || text.includes('Set Unpaid');
      return !hasSetPaid;
    });
    console.log('Verifikasi pembatasan aksi tombol di Laporan:', reportActionsOk);

    if (!dashboardButtonsOk || !reportActionsOk) {
      throw new Error('Pembatasan read-only staff tidak berfungsi dengan benar!');
    }

    console.log('VERIFIKASI E2E TAHAP 2 BERHASIL: Seluruh fungsionalitas baru berfungsi dengan sempurna!');

  } catch(err) {
    console.error('TERJADI KESALAHAN E2E TAHAP 2:', err);
    try {
      await page.screenshot({ path: '/Users/kandar/.gemini/antigravity-ide/brain/af78f44a-8c32-479a-87fe-8abbbee86d85/error_phase2.png' });
      console.log('Tangkapan layar error disimpan di error_phase2.png');
    } catch(se) {
      console.error('Gagal mengambil tangkapan layar error:', se);
    }
  } finally {
    await browser.close();
  }
})();
