-- Add receiver_staff_id to payments table
ALTER TABLE payments ADD COLUMN receiver_staff_id TEXT REFERENCES staffs(id);
