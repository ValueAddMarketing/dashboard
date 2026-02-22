-- Migration: Add missing columns to meeting_notes table
-- Run this in Supabase SQL Editor: https://app.supabase.com/project/ecmhhonjazfbletyvncw/sql
--
-- The meeting_notes table was missing columns required by the AI transcript
-- analysis feature, causing all Save Meeting operations to fail silently.

-- Add new columns for enhanced meeting analysis
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS meeting_title text;
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS duration text;
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS participants jsonb DEFAULT '[]'::jsonb;
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS topics jsonb DEFAULT '[]'::jsonb;
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS sentiment_explanation text;
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS decisions jsonb DEFAULT '[]'::jsonb;
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS concerns jsonb DEFAULT '[]'::jsonb;
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS follow_up_needed boolean DEFAULT false;
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS follow_up_items jsonb DEFAULT '[]'::jsonb;
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS risk_factors jsonb DEFAULT '[]'::jsonb;
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS client_requests jsonb DEFAULT '[]'::jsonb;
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS positive_signals jsonb DEFAULT '[]'::jsonb;
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS warning_signals jsonb DEFAULT '[]'::jsonb;
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE meeting_notes ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
