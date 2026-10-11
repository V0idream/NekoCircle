
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    -- NOTE: the legacy plaintext key 'admin_password' is intentionally NOT
    -- seeded anymore. It was never read by any code path (login/status/
    -- change-password all use 'admin_password_hash'), but it leaked a
    -- misleading admin123 string into every backup. This DELETE migrates
    -- existing databases restored from older snapshots.
    DELETE FROM settings WHERE key = 'admin_password';
    -- ── Generation log (tracks every circle generation) ────
    CREATE TABLE IF NOT EXISTS generation_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      source      TEXT NOT NULL,
      username    TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_generation_log_source ON generation_log(source);
    -- ── Yahoo circle persistence ──
    CREATE TABLE IF NOT EXISTS yahoo_circles (
      id          TEXT PRIMARY KEY,
      username    TEXT NOT NULL,
      circle_data TEXT NOT NULL,
      storage_consent INTEGER NOT NULL DEFAULT 0,
      consented_at INTEGER,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_yahoo_circles_username ON yahoo_circles(username);
    -- ── Public feedback ──
    CREATE TABLE IF NOT EXISTS feedbacks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      content     TEXT NOT NULL,
      contact     TEXT NOT NULL DEFAULT '',
      locale      TEXT NOT NULL DEFAULT 'zh',
      status      TEXT NOT NULL DEFAULT 'new',
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON feedbacks(status, created_at DESC);
    -- ── Announcements ──
    CREATE TABLE IF NOT EXISTS announcements (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      type        TEXT NOT NULL DEFAULT 'info',
      active      INTEGER NOT NULL DEFAULT 1,
      pinned      INTEGER NOT NULL DEFAULT 0,
      locale      TEXT NOT NULL DEFAULT 'all',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
  
CREATE INDEX IF NOT EXISTS idx_circle_expiry ON yahoo_circles(storage_consent, created_at);
CREATE INDEX IF NOT EXISTS idx_generation_date ON generation_log(created_at);
CREATE TABLE IF NOT EXISTS import_snapshots(id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL);
