import { Pool, PoolClient } from 'pg';
import { config } from '../config';
import { dbLogger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

export class DatabaseManager {
  private _pool!: Pool;
  private isConnected: boolean = false;

  constructor() {
    // Initialization deferred to initialize() method
  }

  /**
   * Initialize database connection and verify PostGIS
   */
  async initialize(): Promise<void> {
    try {
      dbLogger.info('Initializing database connection...');

      // Create PostgreSQL pool directly
      this._pool = new Pool({
        host: config.postgres.host,
        port: config.postgres.port,
        database: config.postgres.database,
        user: config.postgres.user,
        password: config.postgres.password,
        max: config.postgres.max || 20,
        idleTimeoutMillis: config.postgres.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: config.postgres.connectionTimeoutMillis || 10000,
      });

      dbLogger.info('Database pool created');

      // Get a client to test connection
      const pool = this._pool;

      // Test connection and perform GeoAgent-specific initialization
      const client = await pool.connect();

      try {
        // Try to create PostGIS extension if not exists
        await client.query(`
          CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        `);

        // Try to enable PostGIS - this might fail if not available
        let postgisAvailable = false;
        try {
          // Check if PostGIS is available in system
          const extensionCheck = await client.query(`
            SELECT * FROM pg_available_extensions WHERE name = 'postgis';
          `);

          if (extensionCheck.rows.length > 0) {
            // Try to create PostGIS extension
            await client.query(`
              CREATE EXTENSION IF NOT EXISTS postgis;
            `);

            const postgisCheck = await client.query(`
              SELECT PostGIS_Version() as version;
            `);

            postgisAvailable = !!postgisCheck.rows[0]?.version;
            dbLogger.info(`PostGIS version: ${postgisCheck.rows[0].version}`);
          } else {
            dbLogger.warn('PostGIS extension not available in PostgreSQL installation');
            dbLogger.warn('GeoAgent will run with limited spatial functionality');
          }
        } catch (postgisError) {
          dbLogger.warn({ error: postgisError }, 'PostGIS not available, running without spatial extensions');
          // Continue without PostGIS - use fallback functions
        }

        // Verify schema exists
        const schemaCheck = await client.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.schemata
            WHERE schema_name = $1
          ) as exists;
        `, [config.postgres.schema]);

        if (!schemaCheck.rows[0].exists) {
          dbLogger.warn(`Schema ${config.postgres.schema} does not exist, creating...`);
          await client.query(`CREATE SCHEMA IF NOT EXISTS ${config.postgres.schema}`);
        }

        // Set search path
        await client.query(`SET search_path TO ${config.postgres.schema}, public`);

        // Verify core tables exist
        const tables = ['data_layers', 'geospatial_features', 'tracking_events', 'geofences'];
        for (const table of tables) {
          const tableCheck = await client.query(`
            SELECT EXISTS (
              SELECT 1 FROM information_schema.tables
              WHERE table_schema = $1 AND table_name = $2
            ) as exists;
          `, [config.postgres.schema, table]);

          if (!tableCheck.rows[0].exists) {
            dbLogger.warn(`Table ${table} does not exist. Run migrations.`);
          }
        }

        this.isConnected = true;
        dbLogger.info('Database connection initialized successfully');
      } finally {
        client.release();
      }
    } catch (error) {
      dbLogger.error(error, 'Failed to initialize database connection');
      throw error;
    }
  }

  /**
   * Get the pool instance (for backward compatibility)
   */
  get pool(): Pool {
    return this._pool;
  }

  /**
   * Get a client from the pool
   */
  async getClient(): Promise<PoolClient> {
    if (!this.isConnected) {
      throw new Error('Database not initialized');
    }
    return this.pool.connect();
  }

  /**
   * Execute a query
   */
  async query<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;

      dbLogger.debug({
        query: text.substring(0, 100),
        params: params?.length || 0,
        rows: result.rowCount,
        duration,
      }, 'Query executed');

      return result;
    } catch (error) {
      dbLogger.error({
        error,
        query: text,
        params,
      }, 'Query failed');
      throw error;
    }
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Run migrations
   */
  async runMigrations(): Promise<void> {
    dbLogger.info('Running database migrations...');

    const migrationsDir = path.join(__dirname, '../../migrations');

    try {
      // Create migrations tracking table if not exists
      await this.query(`
        CREATE TABLE IF NOT EXISTS geoagent.migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Get list of migration files
      const files = await fs.readdir(migrationsDir);
      const sqlFiles = files
        .filter(f => f.endsWith('.sql'))
        .sort();

      for (const file of sqlFiles) {
        // Check if migration has been run
        const check = await this.query<{ count: string }>(
          'SELECT COUNT(*) as count FROM geoagent.migrations WHERE filename = $1',
          [file]
        );

        if (parseInt(check.rows[0].count) === 0) {
          dbLogger.info(`Running migration: ${file}`);

          // Read and execute migration
          const sql = await fs.readFile(
            path.join(migrationsDir, file),
            'utf-8'
          );

          await this.transaction(async (client) => {
            await client.query(sql);
            await client.query(
              'INSERT INTO geoagent.migrations (filename) VALUES ($1)',
              [file]
            );
          });

          dbLogger.info(`Migration ${file} completed successfully`);
        } else {
          dbLogger.debug(`Migration ${file} already executed`);
        }
      }

      dbLogger.info('All migrations completed');
    } catch (error) {
      dbLogger.error(error, 'Migration failed');
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const result = await this.query('SELECT 1 as check');

      // Check for PostGIS without failing if not available
      let postgisVersion = null;
      try {
        const postgisResult = await this.query('SELECT PostGIS_Version() as version');
        postgisVersion = postgisResult.rows[0]?.version;
      } catch (e) {
        // PostGIS not available, continue without it
        postgisVersion = 'not available';
      }

      return {
        healthy: this.isConnected && result.rows.length > 0,
        details: {
          connected: this.isConnected,
          poolSize: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount,
          postgis: postgisVersion,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: (error as Error).message,
        },
      };
    }
  }

  /**
   * Close the pool
   */
  async close(): Promise<void> {
    dbLogger.info('Closing database connection pool...');
    await this._pool.end();
    this.isConnected = false;
    dbLogger.info('Database connection pool closed');
  }

  /**
   * Get the pool instance (for advanced usage)
   */
  getPool(): Pool {
    return this.pool;
  }
}

// Export singleton instance
export const databaseManager = new DatabaseManager();