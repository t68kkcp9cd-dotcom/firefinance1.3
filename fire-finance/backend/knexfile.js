module.exports = {
  development: {
    client: 'postgresql',
    connection: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: process.env.DATABASE_PORT || 5432,
      database: process.env.DATABASE_NAME || 'firefinance_dev',
      user: process.env.DATABASE_USER || 'firefinance',
      password: process.env.DATABASE_PASSWORD || 'password',
    },
    migrations: {
      directory: './database/migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './database/seeds',
    },
    pool: {
      min: 2,
      max: 10,
    },
  },

  production: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL || {
      host: process.env.DATABASE_HOST || 'postgres',
      port: process.env.DATABASE_PORT || 5432,
      database: process.env.DATABASE_NAME || 'firefinance_db',
      user: process.env.DATABASE_USER || 'firefinance',
      password: process.env.DATABASE_PASSWORD,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    },
    migrations: {
      directory: './database/migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './database/seeds',
    },
    pool: {
      min: 2,
      max: 20,
    },
    acquireConnectionTimeout: 60000,
  },
}