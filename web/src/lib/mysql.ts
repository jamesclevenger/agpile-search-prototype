import mysql from 'mysql2/promise';

// Database configuration
const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DB || 'unity_catalog',
  charset: 'utf8mb4',
  timezone: '+00:00',
};

// Connection pool for better performance
let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      ...dbConfig,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

// Helper function to execute queries
export async function executeQuery<T = unknown>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const connection = getPool();
  
  try {
    const [rows] = await connection.execute(query, params);
    return rows as T[];
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Helper functions for user preferences
export async function getUserPreference(
  userId: number,
  preferenceKey: string
): Promise<string | null> {
  const query = `
    SELECT preference_value 
    FROM user_preferences 
    WHERE user_id = ? AND preference_key = ?
    LIMIT 1
  `;
  
  const rows = await executeQuery<{ preference_value: string }>(
    query,
    [userId, preferenceKey]
  );
  
  return rows.length > 0 ? rows[0].preference_value : null;
}

export async function setUserPreference(
  userId: number,
  preferenceKey: string,
  preferenceValue: string
): Promise<void> {
  const query = `
    INSERT INTO user_preferences (user_id, preference_key, preference_value)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE 
      preference_value = VALUES(preference_value),
      updated_at = CURRENT_TIMESTAMP
  `;
  
  await executeQuery(query, [userId, preferenceKey, preferenceValue]);
}

export async function deleteUserPreference(
  userId: number,
  preferenceKey: string
): Promise<void> {
  const query = `
    DELETE FROM user_preferences 
    WHERE user_id = ? AND preference_key = ?
  `;
  
  await executeQuery(query, [userId, preferenceKey]);
}

// Ensure default user exists for development
export async function ensureDefaultUser(): Promise<void> {
  const query = `
    INSERT IGNORE INTO users (id, email, name, password_hash)
    VALUES (1, 'default@fairgrounds.local', 'Default User', NULL)
  `;
  
  try {
    await executeQuery(query);
  } catch (error) {
    console.error('Error creating default user:', error);
    throw error;
  }
}

// Test connection function
export async function testConnection(): Promise<boolean> {
  try {
    const connection = getPool();
    await connection.execute('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}