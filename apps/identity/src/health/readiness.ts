import { Injectable } from '@nestjs/common';

import { SessionStore } from '../auth/session.store.js';
import { OracleDatabase } from '../oracle.js';

@Injectable()
export class ReadinessService {
  constructor(
    private readonly database: OracleDatabase,
    private readonly sessions: SessionStore,
  ) {}

  async isReady(): Promise<boolean> {
    try {
      await Promise.all([
        this.database.withConnection((connection) =>
          connection.execute('SELECT 1 FROM DUAL'),
        ),
        this.sessions.ping(),
      ]);

      return true;
    } catch {
      return false;
    }
  }
}
