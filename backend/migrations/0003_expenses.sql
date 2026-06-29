CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  amount INTEGER NOT NULL,
  description TEXT NOT NULL,
  expense_date TEXT NOT NULL,
  created_by_staff_id TEXT REFERENCES staffs(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
