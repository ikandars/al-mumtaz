-- Migration: Add status column to tutor_shares
ALTER TABLE tutor_shares ADD COLUMN status TEXT DEFAULT 'unpaid';
