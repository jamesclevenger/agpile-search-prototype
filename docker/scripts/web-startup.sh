#!/bin/bash
set -e

echo "Starting Unity Catalog Web Service..."

# Function to wait for a service to be ready
wait_for_service() {
    local host=$1
    local port=$2
    local service_name=$3
    local max_attempts=60
    local attempt=1
    
    echo "Waiting for $service_name at $host:$port..."
    
    while [ $attempt -le $max_attempts ]; do
        if timeout 5 bash -c "</dev/tcp/$host/$port" 2>/dev/null; then
            echo "✅ $service_name is ready!"
            return 0
        fi
        
        echo "⏳ $service_name not ready yet (attempt $attempt/$max_attempts)..."
        sleep 5
        attempt=$((attempt + 1))
    done
    
    echo "❌ $service_name failed to become ready after $max_attempts attempts"
    return 1
}

# Function to wait for MySQL to be ready with proper initialization
wait_for_mysql() {
    local host=$1
    local port=$2
    local max_attempts=60
    local attempt=1
    
    echo "Waiting for MySQL database to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        # Check if MySQL port is open
        if timeout 5 bash -c "</dev/tcp/$host/$port" 2>/dev/null; then
            echo "✅ MySQL port is accessible"
            
            # Additional check: try to connect and verify database exists
            if timeout 10 node -e "
                const mysql = require('mysql2/promise');
                (async () => {
                    try {
                        const connection = await mysql.createConnection({
                            host: '$host',
                            port: $port,
                            user: process.env.MYSQL_USER,
                            password: process.env.MYSQL_PASSWORD,
                            database: process.env.MYSQL_DB,
                            connectTimeout: 5000
                        });
                        await connection.ping();
                        await connection.end();
                        console.log('MySQL connection successful');
                        process.exit(0);
                    } catch (error) {
                        console.log('MySQL connection failed:', error.message);
                        process.exit(1);
                    }
                })();
            " 2>/dev/null; then
                echo "✅ MySQL database is ready and accessible!"
                return 0
            else
                echo "⏳ MySQL port open but database not ready yet..."
            fi
        else
            echo "⏳ MySQL port not accessible yet (attempt $attempt/$max_attempts)..."
        fi
        
        sleep 5
        attempt=$((attempt + 1))
    done
    
    echo "❌ MySQL failed to become ready after $max_attempts attempts"
    return 1
}

# Function to wait for Solr core to be ready
wait_for_solr() {
    local host=$1
    local port=$2
    local core=$3
    local max_attempts=90  # Increased from 60 to 90 (7.5 minutes total)
    local attempt=1
    
    echo "Waiting for Solr core '$core' to be ready..."
    echo "Note: Solr typically takes 5-7 minutes to fully initialize"
    
    while [ $attempt -le $max_attempts ]; do
        # First check basic port connectivity
        if timeout 3 bash -c "</dev/tcp/$host/$port" 2>/dev/null; then
            # Port is open, now check HTTP endpoints
            
            # Check if Solr admin ping responds (with longer timeout for connection resets)
            if timeout 10 curl -f -s "http://$host:$port/solr/admin/ping" >/dev/null 2>&1; then
                echo "✅ Solr server is running"
                
                # Check if the specific core exists
                if timeout 10 curl -f -s "http://$host:$port/solr/$core/admin/ping" >/dev/null 2>&1; then
                    echo "✅ Solr core '$core' is ready!"
                    return 0
                else
                    echo "⏳ Solr running but core '$core' not ready yet (attempt $attempt/$max_attempts)..."
                fi
            else
                # Solr might be in startup phase (connection reset is normal)
                echo "⏳ Solr port open but HTTP not ready yet (attempt $attempt/$max_attempts)..."
            fi
        else
            echo "⏳ Solr port not accessible yet (attempt $attempt/$max_attempts)..."
        fi
        
        sleep 5
        attempt=$((attempt + 1))
    done
    
    echo "⚠️  Solr core '$core' not ready after $max_attempts attempts (7.5 minutes)"
    echo "This may be normal - Solr sometimes takes longer to initialize"
    return 1
}

# Apply startup delay if specified
if [ -n "$STARTUP_DELAY" ] && [ "$STARTUP_DELAY" -gt 0 ]; then
    echo "Applying startup delay of $STARTUP_DELAY seconds..."
    sleep "$STARTUP_DELAY"
fi

# Wait for dependencies if environment variables are set (with fallback)
DEPENDENCY_CHECK_FAILED=false

if [ -n "$MYSQL_HOST" ] && [ -n "$MYSQL_PORT" ]; then
    if ! wait_for_mysql "$MYSQL_HOST" "$MYSQL_PORT"; then
        echo "⚠️  MySQL dependency check failed, but continuing with startup..."
        DEPENDENCY_CHECK_FAILED=true
    fi
fi

if [ -n "$SOLR_HOST" ] && [ -n "$SOLR_PORT" ] && [ -n "$SOLR_CORE" ]; then
    if ! wait_for_solr "$SOLR_HOST" "$SOLR_PORT" "$SOLR_CORE"; then
        echo "⚠️  Solr dependency check failed, but continuing with startup..."
        DEPENDENCY_CHECK_FAILED=true
    fi
fi

if [ "$DEPENDENCY_CHECK_FAILED" = true ]; then
    echo "⚠️  Some dependencies failed to initialize properly."
    echo "🚀 Starting Next.js server anyway - health endpoint will show dependency status..."
else
    echo "🚀 All dependencies ready, starting Next.js server..."
fi

# Start the Next.js application
exec node server.js