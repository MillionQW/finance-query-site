export abstract class SqliteRepository {
  constructor(protected readonly db: any) { }

  protected withTransaction<T>(callback: () => T): T {
    if (this.db.isTransaction) return callback();

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
