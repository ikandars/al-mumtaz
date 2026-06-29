import fs from 'fs';
import path from 'path';

console.log('Generating Al-Mumtaz CRM seed SQL file...');

const sqlLines = [];

// 1. Reset tables (keeping only user-mika / staff-mika)
sqlLines.push('PRAGMA foreign_keys = OFF;');
sqlLines.push('DELETE FROM class_members;');
sqlLines.push('DELETE FROM class_tutors;');
sqlLines.push('DELETE FROM tutor_shares;');
sqlLines.push('DELETE FROM payments;');
sqlLines.push('DELETE FROM expenses;');
sqlLines.push('DELETE FROM other_incomes;');
sqlLines.push('DELETE FROM exam_events;');
sqlLines.push('DELETE FROM classes;');
sqlLines.push('DELETE FROM tutors;');
sqlLines.push('DELETE FROM participants;');
sqlLines.push('DELETE FROM staffs;');
sqlLines.push('DELETE FROM users;');
sqlLines.push('DELETE FROM settings;');

// 2. Insert Staff Admin Mika (password: Innuyasa07)
sqlLines.push(`INSERT INTO users (id, name, email, phone) VALUES ('user-mika', 'Mika Dwi Indah', 'mika@almumtaz.com', '081234567890');`);
sqlLines.push(`INSERT INTO staffs (id, user_id, username, password_hash, permissions) VALUES ('staff-mika', 'user-mika', 'mika', '544fb24cb6806366c29c960d1b9bb7a673223335a2c5de9c201a1f7573110480', '["create","update","delete"]');`);

// 2. Insert Settings
sqlLines.push(`INSERT INTO settings (key, value) VALUES ('admin_fee_config', '{"enabled":true,"tiers":[{"min_amount":100000,"fee":30000},{"min_amount":50000,"fee":25000},{"min_amount":0,"fee":20000}]}');`);

// 3. Define Tutors
const tutorsData = [
  { id: 'tutor-eka', name: 'Ummi Eka', email: 'eka@almumtaz.com', phone: '081211110001' },
  { id: 'tutor-ayu', name: 'Ummi Ayu', email: 'ayu@almumtaz.com', phone: '081211110002' },
  { id: 'tutor-susi', name: 'Ummi Susi', email: 'susi@almumtaz.com', phone: '081211110003' },
  { id: 'tutor-novi', name: 'Ummi Novi', email: 'novi@almumtaz.com', phone: '081211110004' },
  { id: 'tutor-dwi', name: 'Ummi Dwi', email: 'dwi@almumtaz.com', phone: '081211110005' },
  { id: 'tutor-fitri', name: 'Ummi Fitri', email: 'fitri@almumtaz.com', phone: '081211110006' },
  { id: 'tutor-nilla', name: 'Ummi Nilla', email: 'nilla@almumtaz.com', phone: '081211110007' },
  { id: 'tutor-noni', name: 'Ummi Noni', email: 'noni@almumtaz.com', phone: '081211110008' },
  { id: 'tutor-isti', name: 'Ummi Isti', email: 'isti@almumtaz.com', phone: '081211110009' },
  { id: 'tutor-mika', name: 'Ummi Mika', email: 'mika@almumtaz.com', phone: '081234567890', is_mika: true }
];

// Write Tutors to SQL
for (const t of tutorsData) {
  const userId = t.is_mika ? 'user-mika' : `user-${t.id}`;
  if (!t.is_mika) {
    sqlLines.push(`INSERT INTO users (id, name, email, phone) VALUES ('${userId}', '${t.name}', '${t.email}', '${t.phone}');`);
  }
  sqlLines.push(`INSERT INTO tutors (id, user_id) VALUES ('${t.id}', '${userId}');`);
}

// 4. Define Students (Participants)
// Tutors can also be students (e.g. in Kelas Guru).
// We map student names to their existing tutor user ids if they represent tutors.
// Otherwise, we create a new student user.
const studentRosters = {
  class_1: ['Ilham', 'Kenzie', 'Alaric', 'Ikhsan', 'Fadli'],
  class_2: ['Keizya', 'Ariena', 'Delisha', 'Chilla', 'Kamila'],
  class_3: ['Hafizah', 'Azela', 'Qiandra', 'Adzkia', 'Alfaridzi'],
  class_4: ['Hanif', 'Amel', 'Kaira', 'Ibrahim', 'Kirana', 'Rafif'],
  class_5: ['Gia', 'Nari', 'Anjani', 'Adibah', 'Maysha', 'Raisya', 'Satria', 'Zafran', 'Princess', 'Fahmi', 'Filio', 'Kansa'],
  class_6: ['Bu Rini', 'Bu Mika', 'Bu Reni', 'Bu Nurhasanah', 'Bu Esta', 'Bu Enci', 'Bu Ayu', 'Bu Vanny'],
  class_7: ['Faza', 'Widia', 'Khanza', 'Aira', 'Aisyah'],
  class_8: ['Bu Sri', 'Kak Rahma', 'Bu Ayu', 'Bude Yati'],
  class_9: ['Kak Rahma', 'Bu Eka', 'Bu Min', 'Bu Mila', 'Eni Susilowati'],
  class_10: ['Khalid', 'Atthalah', 'Alif', 'Barra', 'Uwais'],
  class_11: ['Azzam (PAUD)', 'Niken', 'Aninda', 'Maharani', 'Shanum', 'Maryam', 'Syaqila', 'Ziqri'],
  class_12: ['Miqdad', 'Devanka', 'Saffanah', 'Alfalah (Ibrahim)', 'Fadan', 'Alana', 'Naya (Denisa)', 'Faqih', 'Zayn', 'Bariq', 'Nana', 'Rizieq'],
  class_13: ['Bu Fitri', 'Bu Nilla', 'Bu Novi', 'Bu Noni', 'Bu Isti', 'Bu Susi'],
  class_14: ['Denendra', 'Abrami', 'Tristan Azka', 'Bady', 'Farhan', 'Adrian', 'Zizi', 'Azzam (Remaja)', 'Arya'],
  class_15: ['Alena', 'Keenan', 'Zezyan', 'Vino', 'Fajar', 'Fayruz'],
  class_16: ['Niko', 'Nafiah', 'Zayyan', 'Cindy']
};

// Map student names to unique participant IDs
const studentMap = {}; // name -> { participantId, userId }

// Helper to register student
function getOrCreateStudent(name) {
  if (studentMap[name]) return studentMap[name];

  let userId;
  let isTutor = false;

  // Link teachers playing roles as students in Kelas Guru
  if (name === 'Bu Fitri') { userId = 'user-tutor-fitri'; isTutor = true; }
  else if (name === 'Bu Nilla') { userId = 'user-tutor-nilla'; isTutor = true; }
  else if (name === 'Bu Novi') { userId = 'user-tutor-novi'; isTutor = true; }
  else if (name === 'Bu Noni') { userId = 'user-tutor-noni'; isTutor = true; }
  else if (name === 'Bu Isti') { userId = 'user-tutor-isti'; isTutor = true; }
  else if (name === 'Bu Susi') { userId = 'user-tutor-susi'; isTutor = true; }
  // Link admin Mika playing student role in Class 6
  else if (name === 'Bu Mika') { userId = 'user-mika'; isTutor = true; }

  const cleanName = name.replace(' (PAUD)', '').replace(' (Remaja)', '');
  const idSuffix = name.includes('(PAUD)') ? '-paud' : (name.includes('(Remaja)') ? '-remaja' : '');
  const idSafeName = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '') + idSuffix;
  const participantId = `student-${idSafeName}`;

  if (!isTutor) {
    userId = `user-${participantId}`;
    const email = `${idSafeName}@almumtaz-student.com`;
    const phone = '0822' + Math.floor(10000000 + Math.random() * 90000000);
    sqlLines.push(`INSERT INTO users (id, name, email, phone) VALUES ('${userId}', '${cleanName}', '${email}', '${phone}');`);
  }

  sqlLines.push(`INSERT INTO participants (id, user_id) VALUES ('${participantId}', '${userId}');`);

  studentMap[name] = { participantId, userId };
  return studentMap[name];
}

// 5. Define Classes
const classesData = [
  { id: 'class-1', name: 'Ummi Eka', desc: 'Hari/Jam: SENIN - RABU / 18.30 - 20.00', tutors: ['tutor-eka'] },
  { id: 'class-2', name: 'Ummi Ayu', desc: 'Hari/Jam: SENIN - RABU / 18.30 - 20.00', tutors: ['tutor-ayu'] },
  { id: 'class-3', name: 'Ummi Susi', desc: 'Hari/Jam: SENIN - RABU / 18.30 - 20.00', tutors: ['tutor-susi'] },
  { id: 'class-4', name: 'Ummi Novi', desc: 'Hari/Jam: SENIN - RABU / 18.30 - 20.00', tutors: ['tutor-novi'] },
  { id: 'class-5', name: 'Ummi Susi, Ummi Dwi & Ummi Mika', desc: 'Hari/Jam: SABTU & AHAD / 08.00 - 10.00', tutors: ['tutor-susi', 'tutor-dwi', 'tutor-mika'] },
  { id: 'class-6', name: 'Ummi Susi, Ummi Fitri & Ummi Eka', desc: 'Hari/Jam: SENIN & KAMIS / 08.00 - 10.00', tutors: ['tutor-susi', 'tutor-fitri', 'tutor-eka'] },
  { id: 'class-7', name: 'Remaja Putri', desc: 'Hari/Jam: SABTU & AHAD / 08.00 - 09.30', tutors: [] },
  { id: 'class-8', name: 'Jumat Pagi', desc: 'Hari/Jam: Jumat / 09.00 - 11.30', tutors: [] },
  { id: 'class-9', name: 'Selasa Pagi', desc: 'Hari/Jam: Selasa Pagi / 08.00 - 10.00', tutors: [] },
  { id: 'class-10', name: 'Ummi Nilla & Ummi Novi', desc: 'Hari/Jam: Kamis - Sabtu / 16.00 - 17.30', tutors: ['tutor-nilla', 'tutor-novi'] },
  { id: 'class-11', name: 'PAUD Lanjutan', desc: 'Hari/Jam: Senin - Rabu / 16.00 - 17.30', tutors: [] },
  { id: 'class-12', name: 'New PAUD', desc: 'Hari/Jam: SENIN - RABU / 16.00 - 17.30', tutors: [] },
  { id: 'class-13', name: 'Kelas Guru', desc: 'Hari/Jam: SENIN / 11.00 - 13.00', tutors: [] },
  { id: 'class-14', name: 'Kelas Remaja', desc: 'Hari/Jam: SABTU & AHAD / 18.30 - 20.00', tutors: [] },
  { id: 'class-15', name: 'Ummi Susi Kamis-Sabtu', desc: 'Hari/Jam: KAMIS - SABTU / 16.00 - 17.30', tutors: ['tutor-susi'] },
  { id: 'class-16', name: 'Ummi Noni Senin-Rabu', desc: 'Hari/Jam: SENIN - RABU / 13.00 - 14.30', tutors: ['tutor-noni'] }
];

// Write Classes to SQL
for (const cls of classesData) {
  // Use default fee of 150,000 for standard classes
  sqlLines.push(`INSERT INTO classes (id, name, description, monthly_fee, status) VALUES ('${cls.id}', '${cls.name}', '${cls.desc}', 150000, 'active');`);

  // Assign Tutors
  for (const tutorId of cls.tutors) {
    const ctId = `ct-${cls.id}-${tutorId}`;
    sqlLines.push(`INSERT INTO class_tutors (id, class_id, tutor_id) VALUES ('${ctId}', '${cls.id}', '${tutorId}');`);
  }

  // Register and Enroll Students
  const roster = studentRosters[cls.id.replace('-', '_')];
  for (const sName of roster) {
    const student = getOrCreateStudent(sName);
    const cmId = `cm-${cls.id}-${student.participantId}`;
    sqlLines.push(`INSERT INTO class_members (id, class_id, participant_id, status) VALUES ('${cmId}', '${cls.id}', '${student.participantId}', 'active');`);
  }
}

sqlLines.push('PRAGMA foreign_keys = ON;');

const sqlContent = sqlLines.join('\n') + '\n';
const targetPath = path.resolve('/Users/kandar/Workspaces/al-mumtaz-crm/backend/new_seed.sql');

fs.writeFileSync(targetPath, sqlContent, 'utf8');
console.log(`Successfully generated new seed SQL file at: ${targetPath}`);
