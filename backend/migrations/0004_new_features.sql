-- Alter classes table
ALTER TABLE classes ADD COLUMN has_admin_fee INTEGER NOT NULL DEFAULT 1;

-- Alter expenses table
ALTER TABLE expenses ADD COLUMN attachment_r2_key TEXT;
