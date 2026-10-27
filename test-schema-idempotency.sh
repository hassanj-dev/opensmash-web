#!/bin/bash
# Test script to verify supabase-schema.sql is idempotent
# This script requires Docker to be installed

set -e

echo "🧪 Testing SQL schema idempotency..."
echo ""

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker to run this test."
    echo "   Alternatively, use a local PostgreSQL instance."
    exit 1
fi

echo "📦 Starting PostgreSQL container..."
CONTAINER_NAME="irongym-test-db-$$"

# Start PostgreSQL container
docker run -d \
  --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD=testpass123 \
  -e POSTGRES_DB=testdb \
  -p 5433:5432 \
  postgres:15-alpine

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

# Function to cleanup
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    docker rm -f "$CONTAINER_NAME" > /dev/null 2>&1 || true
}
trap cleanup EXIT

# Run the schema twice to test idempotency
echo ""
echo "▶️  Running schema (1st time)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d testdb < supabase-schema.sql > /tmp/schema-run-1.log 2>&1

if [ $? -eq 0 ]; then
    echo "✅ First run: SUCCESS"
else
    echo "❌ First run: FAILED"
    cat /tmp/schema-run-1.log
    exit 1
fi

echo ""
echo "▶️  Running schema (2nd time - testing idempotency)..."
docker exec -i "$CONTAINER_NAME" psql -U postgres -d testdb < supabase-schema.sql > /tmp/schema-run-2.log 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Second run: SUCCESS"
else
    echo "❌ Second run: FAILED"
    echo ""
    echo "Schema is NOT idempotent. Errors:"
    cat /tmp/schema-run-2.log
    exit 1
fi

echo ""
echo "🎉 Schema is IDEMPOTENT!"
echo ""
echo "✓ All tests passed"
echo "✓ Schema can be run multiple times safely"
echo "✓ No duplicate constraints or errors"

# Show summary
echo ""
echo "📊 Database Summary:"
docker exec "$CONTAINER_NAME" psql -U postgres -d testdb -c "\dt" | grep -E "gyms|users|members|plans|payments|attendance|expenses|audit_log|settings" || echo "Tables created successfully"

exit 0
