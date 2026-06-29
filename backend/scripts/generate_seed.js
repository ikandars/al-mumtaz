import fs from 'fs';
import path from 'path';

console.log('Generating dummy seed SQL file...');

const sqlLines = [];

// 1. Clear tables
sqlLines.push('PRAGMA foreign_keys = OFF;');
sqlLines.push('DELETE FROM class_members;');
sqlLines.push('DELETE FROM class_tutors;');
sqlLines.push('DELETE FROM classes;');
sqlLines.push('DELETE FROM tutor_shares;');
sqlLines.push('DELETE FROM payments;');
sqlLines.push('DELETE FROM exam_events;');
sqlLines.push('DELETE FROM tutors;');
sqlLines.push('DELETE FROM participants;');
sqlLines.push('DELETE FROM staffs;');
sqlLines.push('DELETE FROM users;');
sqlLines.push('DELETE FROM settings;');

// 2. Insert Settings
sqlLines.push(`INSERT INTO settings (key, value) VALUES ('admin_fee_config', '{"enabled":true,"tiers":[{"min_amount":100000,"fee":30000},{"min_amount":50000,"fee":25000},{"min_amount":0,"fee":20000}]}');`);

// 3. Insert Staff
// Admin: mika (password: Innuyasa07) -> hash: 544fb24cb6806366c29c960d1b9bb7a673223335a2c5de9c201a1f7573110480
sqlLines.push(`INSERT INTO users (id, name, email, phone) VALUES ('user-mika', 'Mika Dwi Indah', 'mika@almumtaz.com', '081234567890');`);
sqlLines.push(`INSERT INTO staffs (id, user_id, username, password_hash, permissions) VALUES ('staff-mika', 'user-mika', 'mika', '544fb24cb6806366c29c960d1b9bb7a673223335a2c5de9c201a1f7573110480', '["create","update","delete"]');`);

// Read-only staff: lisa (password: lisa123) -> hash: 5f067dff24abfec3367934c9a61a576a1ae5ce446ad19500c9ccca3f0f99d044
sqlLines.push(`INSERT INTO users (id, name, email, phone) VALUES ('user-lisa', 'Lisa Readonly', 'lisa@almumtaz.com', '081234567899');`);
sqlLines.push(`INSERT INTO staffs (id, user_id, username, password_hash, permissions) VALUES ('staff-lisa', 'user-lisa', 'lisa', '5f067dff24abfec3367934c9a61a576a1ae5ce446ad19500c9ccca3f0f99d044', '[]');`);

// 4. Generate 10 Tutors
const tutorNames = [
  'Ustadz Hanafi', 'Ustadz Yazid', 'Ustadz Khalid', 'Ustadzah Aisyah', 'Ustadzah Khadijah',
  'Ustadz Abdul', 'Ustadz Rahmat', 'Ustadzah Fatimah', 'Ustadzah Maryam', 'Ustadz Lukman'
];
const tutorEmails = [
  'hanafi@almumtaz.com', 'yazid@almumtaz.com', 'khalid@almumtaz.com', 'aisyah@almumtaz.com', 'khadijah@almumtaz.com',
  'abdul@almumtaz.com', 'rahmat@almumtaz.com', 'fatimah@almumtaz.com', 'maryam@almumtaz.com', 'lukman@almumtaz.com'
];

for (let i = 0; i < 10; i++) {
  const userId = `tutor-usr-${i+1}`;
  const tutorId = `tutor-${i+1}`;
  const name = tutorNames[i];
  const email = tutorEmails[i];
  const phone = `0812345678${(i+1).toString().padStart(2, '0')}`;
  
  sqlLines.push(`INSERT INTO users (id, name, email, phone) VALUES ('${userId}', '${name}', '${email}', '${phone}');`);
  sqlLines.push(`INSERT INTO tutors (id, user_id) VALUES ('${tutorId}', '${userId}');`);
}

// 5. Generate 50 Students (Participants)
const firstNames = ['Ahmad', 'Rizky', 'Hendra', 'Budi', 'Joko', 'Dewi', 'Indah', 'Siti', 'Fajar', 'Yanto', 'Rina', 'Mega', 'Sari', 'Eko', 'Agus', 'Dwi', 'Sri', 'Putri', 'Taufik', 'Dian', 'Adi', 'Bambang', 'Lilis', 'Yuni', 'Herman'];
const lastNames = ['Pratama', 'Wijaya', 'Santoso', 'Lestari', 'Saputra', 'Hidayat', 'Kusuma', 'Nugroho', 'Setiawan', 'Fitriani', 'Wulandari', 'Utami', 'Rahayu', 'Gunawan', 'Susanto', 'Haryono', 'Mahendra', 'Kartika', 'Siregar', 'Lubis'];

const students = [];
for (let i = 0; i < 50; i++) {
  const userId = `student-usr-${i+1}`;
  const participantId = `student-${i+1}`;
  const fn = firstNames[i % firstNames.length];
  const ln = lastNames[(i * 3) % lastNames.length];
  const name = `${fn} ${ln}`;
  const email = `student${i+1}@gmail.com`;
  const phone = `082123456${(i+1).toString().padStart(3, '0')}`;
  
  sqlLines.push(`INSERT INTO users (id, name, email, phone) VALUES ('${userId}', '${name}', '${email}', '${phone}');`);
  sqlLines.push(`INSERT INTO participants (id, user_id) VALUES ('${participantId}', '${userId}');`);
  students.push({ id: participantId, name });
}

// 6. Generate 5 Classes
const classes = [
  { id: 'class-1', name: 'Kelas Al-Fatihah', description: 'Jadwal Sore', fee: 120000, tutors: ['tutor-1', 'tutor-2', 'tutor-3'] },
  { id: 'class-2', name: 'Kelas Juz Amma', description: 'Jadwal Malam', fee: 100000, tutors: ['tutor-4', 'tutor-5', 'tutor-6'] },
  { id: 'class-3', name: 'Kelas Tahsin Premium', description: 'Jadwal Akhir Pekan', fee: 150000, tutors: ['tutor-7', 'tutor-8', 'tutor-9'] },
  { id: 'class-4', name: 'Kelas Tilawah Dewasa', description: 'Jadwal Pagi', fee: 90000, tutors: ['tutor-10'] },
  { id: 'class-5', name: 'Kelas Anak-Anak', description: 'Jadwal Siang', fee: 80000, tutors: ['tutor-1'] }
];

for (const cls of classes) {
  sqlLines.push(`INSERT INTO classes (id, name, description, monthly_fee, status) VALUES ('${cls.id}', '${cls.name}', '${cls.description}', ${cls.fee}, 'active');`);
  
  // Assign tutors
  for (const tutorId of cls.tutors) {
    const ctId = `ct-${cls.id}-${tutorId}`;
    sqlLines.push(`INSERT INTO class_tutors (id, class_id, tutor_id) VALUES ('${ctId}', '${cls.id}', '${tutorId}');`);
  }
}

// 7. Enroll Students to Classes
// Distribute 50 students evenly to 5 classes (10 students per class)
const enrollmentMap = {}; // participantId -> classId
for (let i = 0; i < 50; i++) {
  const studentId = `student-${i+1}`;
  const classIndex = Math.floor(i / 10);
  const cls = classes[classIndex];
  const cmId = `cm-${cls.id}-${studentId}`;
  
  sqlLines.push(`INSERT INTO class_members (id, class_id, participant_id, status) VALUES ('${cmId}', '${cls.id}', '${studentId}', 'active');`);
  enrollmentMap[studentId] = cls;
}

// 8. Generate Payments & Payouts (Tutor Shares)
// We will generate payments for:
// May (15 payments approved)
// June (20 payments approved)
// July (8 payments pending, 4 payments rejected)

function getAdminFee(amount) {
  if (amount >= 100000) return 30000;
  if (amount >= 50000) return 25000;
  return 20000;
}

let paymentCount = 0;
let shareCount = 0;

// Approved payments helper
function addApprovedPayment(studentId, dateStr, notes) {
  paymentCount++;
  const payId = `pay-approved-${paymentCount}`;
  const cls = enrollmentMap[studentId];
  const fee = cls.fee;
  const adminFee = getAdminFee(fee);
  const netAmount = fee - adminFee;
  
  sqlLines.push(`INSERT INTO payments (id, participant_id, class_id, type, amount, admin_fee, net_amount, payment_date, status, approved_by_staff_id, receiver_staff_id, notes, created_at) VALUES ('${payId}', '${studentId}', '${cls.id}', 'course', ${fee}, ${adminFee}, ${netAmount}, '${dateStr}', 'approved', 'staff-mika', 'staff-mika', '${notes}', '${dateStr} 09:00:00');`);
  
  // Distribute shares
  const tutors = cls.tutors;
  const share = Math.floor(netAmount / tutors.length);
  for (const tutorId of tutors) {
    shareCount++;
    const shareId = `share-${shareCount}`;
    // Some shares in May are paid, others are unpaid
    const isMay = dateStr.startsWith('2026-05');
    const shareStatus = isMay && shareCount % 2 === 0 ? 'paid' : 'unpaid';
    sqlLines.push(`INSERT INTO tutor_shares (id, payment_id, tutor_id, amount, status, created_at) VALUES ('${shareId}', '${payId}', '${tutorId}', ${share}, '${shareStatus}', '${dateStr} 09:05:00');`);
  }
}

// Generate May 2026 payments (May 1st to 28th)
// We take students from index 0 to 25 (e.g. 15 of them)
const mayStudents = [1, 2, 5, 8, 11, 12, 15, 21, 22, 25, 31, 32, 41, 42, 45];
for (const idx of mayStudents) {
  const studentId = `student-${idx}`;
  const day = (idx * 2) % 28 + 1;
  const dateStr = `2026-05-${day.toString().padStart(2, '0')}`;
  addApprovedPayment(studentId, dateStr, 'Iuran Kelas Bulan Mei');
}

// Generate June 2026 payments (June 1st to 28th)
// 20 students paid
const juneStudents = [1, 3, 4, 7, 10, 11, 13, 14, 17, 20, 21, 23, 24, 28, 31, 33, 34, 41, 43, 44];
for (const idx of juneStudents) {
  const studentId = `student-${idx}`;
  const day = (idx * 3) % 28 + 1;
  const dateStr = `2026-06-${day.toString().padStart(2, '0')}`;
  addApprovedPayment(studentId, dateStr, 'Iuran Kelas Bulan Juni');
}

// Generate July 2026 Pending payments
const pendingStudents = [2, 6, 12, 16, 22, 26, 32, 42];
for (let i = 0; i < pendingStudents.length; i++) {
  const idx = pendingStudents[i];
  const studentId = `student-${idx}`;
  const payId = `pay-pending-${i+1}`;
  const cls = enrollmentMap[studentId];
  const fee = cls.fee;
  const adminFee = getAdminFee(fee);
  const netAmount = fee - adminFee;
  const dateStr = `2026-07-0${i+1}`;
  
  sqlLines.push(`INSERT INTO payments (id, participant_id, class_id, type, amount, admin_fee, net_amount, payment_date, status, receiver_staff_id, notes, created_at) VALUES ('${payId}', '${studentId}', '${cls.id}', 'course', ${fee}, ${adminFee}, ${netAmount}, '${dateStr}', 'pending', 'staff-mika', 'Konfirmasi iuran Juli', '${dateStr} 10:00:00');`);
}

// Generate July 2026 Rejected payments
const rejectedStudents = [5, 15, 25, 35];
for (let i = 0; i < rejectedStudents.length; i++) {
  const idx = rejectedStudents[i];
  const studentId = `student-${idx}`;
  const payId = `pay-rejected-${i+1}`;
  const cls = enrollmentMap[studentId];
  const fee = cls.fee;
  const adminFee = getAdminFee(fee);
  const netAmount = fee - adminFee;
  const dateStr = `2026-07-0${i+1}`;
  
  sqlLines.push(`INSERT INTO payments (id, participant_id, class_id, type, amount, admin_fee, net_amount, payment_date, status, approved_by_staff_id, receiver_staff_id, notes, created_at) VALUES ('${payId}', '${studentId}', '${cls.id}', 'course', ${fee}, ${adminFee}, ${netAmount}, '${dateStr}', 'rejected', 'staff-mika', 'staff-mika', 'Bukti transfer buram dan tidak terbaca.', '${dateStr} 11:00:00');`);
}

sqlLines.push('PRAGMA foreign_keys = ON;');

const sqlContent = sqlLines.join('\n') + '\n';
fs.writeFileSync(path.join('/Users/kandar/Workspaces/al-mumtaz-crm/backend', 'generated_seed.sql'), sqlContent);

console.log('generated_seed.sql generated successfully with all dummy data.');
