-- Tabel Users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabel Staffs
CREATE TABLE IF NOT EXISTS staffs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    permissions TEXT NOT NULL, -- JSON array of permissions: ["create", "update", "delete"]
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tabel Participants (Peserta/Siswa)
CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tabel Tutors (Pengajar)
CREATE TABLE IF NOT EXISTS tutors (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tabel Classes
CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    monthly_fee INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabel Class Members
CREATE TABLE IF NOT EXISTS class_members (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'inactive'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
    UNIQUE(class_id, participant_id)
);

-- Tabel Class Tutors
CREATE TABLE IF NOT EXISTS class_tutors (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    tutor_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE CASCADE,
    UNIQUE(class_id, tutor_id)
);

-- Tabel Exam Events
CREATE TABLE IF NOT EXISTS exam_events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    class_id TEXT, -- Relasi opsional ke Kelas tertentu (NULL jika ujian bersifat umum/global)
    fee INTEGER NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
);

-- Tabel Payments
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    participant_id TEXT NOT NULL,
    class_id TEXT,
    exam_event_id TEXT,
    type TEXT NOT NULL, -- 'course' atau 'exam'
    amount INTEGER NOT NULL,
    admin_fee INTEGER NOT NULL DEFAULT 0,
    net_amount INTEGER NOT NULL,
    attachment_r2_key TEXT,
    payment_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    approved_by_staff_id TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (participant_id) REFERENCES participants(id),
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (exam_event_id) REFERENCES exam_events(id),
    FOREIGN KEY (approved_by_staff_id) REFERENCES staffs(id)
);

-- Tabel Tutor Shares
CREATE TABLE IF NOT EXISTS tutor_shares (
    id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL,
    tutor_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id)
);

-- Tabel Settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Insert Seed Data (Staff Default: Mika)
INSERT OR IGNORE INTO users (id, name, email, phone) 
VALUES ('user-mika', 'Mika Dwi Indah', 'mika@almumtaz.com', '081234567890');

INSERT OR IGNORE INTO staffs (id, user_id, username, password_hash, permissions) 
VALUES ('staff-mika', 'user-mika', 'mika', '544fb24cb6806366c29c960d1b9bb7a673223335a2c5de9c201a1f7573110480', '["create","update","delete"]');

-- Insert default admin fee configuration
INSERT OR IGNORE INTO settings (key, value)
VALUES (
    'admin_fee_config',
    '{"enabled":true,"tiers":[{"min_amount":100000,"fee":30000},{"min_amount":50000,"fee":25000},{"min_amount":0,"fee":20000}]}'
);
