-- Change coaches.user_id FK from SET NULL to CASCADE
-- so deleting a user also removes their coach record.
ALTER TABLE coaches
  DROP CONSTRAINT IF EXISTS coaches_user_id_fkey,
  ADD CONSTRAINT coaches_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
