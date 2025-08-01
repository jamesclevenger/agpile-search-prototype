import { NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

export async function GET() {
  try {
    // Check database connectivity
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DB,
      connectTimeout: 10000,  // 10 second timeout
      acquireTimeout: 10000,
    });

    await connection.ping();
    
    // Test basic query to ensure database is properly initialized
    await connection.execute('SELECT 1 as test');
    
    await connection.end();

    // Check Solr connectivity
    const solrUrl = `http://${process.env.SOLR_HOST || 'localhost'}:${process.env.SOLR_PORT || '8983'}/solr/${process.env.SOLR_CORE || 'unity_catalog'}/admin/ping`;
    const solrResponse = await fetch(solrUrl);
    
    if (!solrResponse.ok) {
      throw new Error('Solr health check failed');
    }

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        solr: 'connected'
      }
    });
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 503 });
  }
}