export function initializeFinanceStoreSchema(db: any): void {
  db.exec(`
      CREATE TABLE IF NOT EXISTS companies (
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        display_symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        latest_price REAL,
        change_percent REAL,
        first_seen_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (market, symbol)
      );

      CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
      CREATE INDEX IF NOT EXISTS idx_companies_display_symbol ON companies(display_symbol);

      CREATE TABLE IF NOT EXISTS favorite_companies (
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        display_symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        latest_price REAL,
        change_percent REAL,
        pinned_order INTEGER NOT NULL DEFAULT 0,
        favorited_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        announcement_viewed_at TEXT,
        PRIMARY KEY (market, symbol),
        FOREIGN KEY (market, symbol) REFERENCES companies(market, symbol)
          ON UPDATE CASCADE ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_favorite_companies_order
        ON favorite_companies(pinned_order DESC, favorited_at DESC);
      CREATE INDEX IF NOT EXISTS idx_favorite_companies_name
        ON favorite_companies(name);

      CREATE TABLE IF NOT EXISTS company_insights (
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        buy_point_range TEXT NOT NULL DEFAULT '',
        buy_point_updated_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (market, symbol)
      );

      CREATE TABLE IF NOT EXISTS company_announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        announcement_key TEXT NOT NULL,
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        display_symbol TEXT NOT NULL,
        company_name TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        published_at TEXT NOT NULL,
        url TEXT NOT NULL,
        source TEXT NOT NULL,
        discovered_at TEXT NOT NULL,
        UNIQUE (market, symbol, announcement_key)
      );

      CREATE INDEX IF NOT EXISTS idx_company_announcements_feed
        ON company_announcements(market, symbol, published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_company_announcements_unread
        ON company_announcements(market, symbol, discovered_at);

      CREATE TABLE IF NOT EXISTS announcement_refresh_state (
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        last_refreshed_at TEXT NOT NULL,
        last_error TEXT,
        PRIMARY KEY (market, symbol)
      );

      CREATE TABLE IF NOT EXISTS financial_statement_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        display_symbol TEXT NOT NULL,
        company_name TEXT,
        years_requested INTEGER NOT NULL,
        years_key TEXT NOT NULL,
        source TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        refreshed_at TEXT NOT NULL,
        UNIQUE (market, symbol, years_requested)
      );

      CREATE INDEX IF NOT EXISTS idx_statement_cache_lookup
        ON financial_statement_cache(market, symbol, years_requested);

      CREATE TABLE IF NOT EXISTS financial_statement_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL REFERENCES financial_statement_cache(id) ON DELETE CASCADE,
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        statement_type TEXT NOT NULL,
        item TEXT NOT NULL,
        source_item TEXT,
        item_order INTEGER NOT NULL,
        values_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_statement_rows_item
        ON financial_statement_rows(market, symbol, statement_type, item);

      CREATE TABLE IF NOT EXISTS financial_statement_values (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL REFERENCES financial_statement_cache(id) ON DELETE CASCADE,
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        statement_type TEXT NOT NULL,
        item TEXT NOT NULL,
        source_item TEXT,
        year TEXT NOT NULL,
        value_num REAL,
        value_text TEXT,
        unit TEXT NOT NULL,
        source TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_statement_values_chart
        ON financial_statement_values(statement_type, item, year);
      CREATE INDEX IF NOT EXISTS idx_statement_values_company
        ON financial_statement_values(market, symbol, statement_type, year);

      CREATE TABLE IF NOT EXISTS financial_metric_values (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL REFERENCES financial_statement_cache(id) ON DELETE CASCADE,
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        metric_key TEXT NOT NULL,
        metric_label TEXT NOT NULL,
        year TEXT NOT NULL,
        value_num REAL,
        source TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_metric_values_chart
        ON financial_metric_values(metric_key, year);
      CREATE INDEX IF NOT EXISTS idx_metric_values_company
        ON financial_metric_values(market, symbol, metric_key, year);

      CREATE TABLE IF NOT EXISTS statement_refresh_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL,
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        years_requested INTEGER NOT NULL,
        source TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        stored_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS statement_refresh_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        total_targets INTEGER NOT NULL DEFAULT 0,
        succeeded INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        message TEXT,
        errors_json TEXT NOT NULL DEFAULT '[]'
      );

      CREATE INDEX IF NOT EXISTS idx_statement_refresh_jobs_started
        ON statement_refresh_jobs(started_at DESC);

      CREATE TABLE IF NOT EXISTS peer_comparison_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        display_symbol TEXT NOT NULL,
        company_name TEXT,
        industry_name TEXT,
        industry_source TEXT,
        source TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        peer_count INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        refreshed_at TEXT NOT NULL,
        UNIQUE (market, symbol)
      );

      CREATE INDEX IF NOT EXISTS idx_peer_comparison_cache_lookup
        ON peer_comparison_cache(market, symbol, refreshed_at);

      CREATE TABLE IF NOT EXISTS screener_cache (
        cache_key TEXT PRIMARY KEY,
        params_json TEXT NOT NULL,
        source TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        refreshed_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_screener_cache_refreshed
        ON screener_cache(refreshed_at);

      CREATE TABLE IF NOT EXISTS etfs (
        symbol TEXT PRIMARY KEY,
        display_symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        exchange TEXT NOT NULL,
        latest_price REAL,
        iopv REAL,
        premium_rate REAL,
        change_amount REAL,
        change_percent REAL,
        volume REAL,
        amount REAL,
        open_price REAL,
        high_price REAL,
        low_price REAL,
        previous_close REAL,
        amplitude REAL,
        turnover_rate REAL,
        latest_shares REAL,
        market_cap REAL,
        data_date TEXT,
        quote_updated_at TEXT,
        source TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_etfs_name ON etfs(name);
      CREATE INDEX IF NOT EXISTS idx_etfs_amount ON etfs(amount DESC);
      CREATE INDEX IF NOT EXISTS idx_etfs_market_cap ON etfs(market_cap DESC);

      CREATE TABLE IF NOT EXISTS etf_daily_prices (
        symbol TEXT NOT NULL,
        trade_date TEXT NOT NULL,
        open_price REAL,
        close_price REAL,
        high_price REAL,
        low_price REAL,
        volume REAL,
        amount REAL,
        amplitude REAL,
        change_percent REAL,
        change_amount REAL,
        turnover_rate REAL,
        source TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (symbol, trade_date),
        FOREIGN KEY (symbol) REFERENCES etfs(symbol) ON UPDATE CASCADE ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_etf_daily_prices_lookup
        ON etf_daily_prices(symbol, trade_date DESC);

      CREATE TABLE IF NOT EXISTS etf_refresh_state (
        cache_key TEXT PRIMARY KEY,
        refreshed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS favorite_etfs (
        symbol TEXT PRIMARY KEY,
        favorited_at TEXT NOT NULL,
        FOREIGN KEY (symbol) REFERENCES etfs(symbol) ON UPDATE CASCADE ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS etf_valuations (
        symbol TEXT PRIMARY KEY,
        tracking_index_name TEXT,
        tracking_index_code TEXT,
        pe_total_shares REAL,
        pe_calculated_shares REAL,
        valuation_date TEXT,
        available INTEGER NOT NULL,
        unavailable_reason TEXT,
        fetched_at TEXT NOT NULL,
        source TEXT NOT NULL,
        FOREIGN KEY (symbol) REFERENCES etfs(symbol) ON UPDATE CASCADE ON DELETE CASCADE
      );
    `);

  ensureColumn(db, 'financial_statement_rows', 'source_item', 'TEXT');
  ensureColumn(db, 'financial_statement_values', 'source_item', 'TEXT');
  ensureColumn(db, 'favorite_companies', 'announcement_viewed_at', 'TEXT');
  db.prepare(`
      UPDATE favorite_companies
      SET announcement_viewed_at = datetime('now')
      WHERE announcement_viewed_at IS NULL
    `).run();

}

function ensureColumn(db: any, tableName: string, columnName: string, declaration: string): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column: any) => column.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${declaration}`);
  }

}
