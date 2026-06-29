CREATE TABLE other_incomes (
  id TEXT PRIMARY KEY,
  amount INTEGER NOT NULL,
  description TEXT NOT NULL,
  income_date TEXT NOT NULL,
  category TEXT NOT NULL, -- 'Saldo Kas Awal', 'Donasi', 'Hibah', 'Hadiah', 'Lainnya'
  attachment_r2_key TEXT,
  created_by_staff_id TEXT REFERENCES staffs(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
