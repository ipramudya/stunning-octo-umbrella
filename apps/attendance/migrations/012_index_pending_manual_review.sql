CREATE INDEX ix_attendance_pending_review
ON attendance_entries (status, source, submitted_at, id)
