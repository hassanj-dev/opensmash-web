/**
 * Security and Idempotency Tests for supabase-schema.sql
 * Uses @electric-sql/pglite (PostgreSQL in WASM)
 *
 * Tests:
 * 1. Schema idempotency (run twice without errors)
 * 2. Gym owner cannot set own role to super_admin
 * 3. Suspended gym owner reads 0 rows
 * 4. Gym A cannot access gym B data
 * 5. After reactivation, all data is intact
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
const path = require('path');

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
  console.log(`\n${colors.cyan}▶️  ${name}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

// Stub auth schema - minimal auth.users and auth.uid() for testing
const AUTH_STUB = `
-- Stub auth schema for testing
CREATE SCHEMA IF NOT EXISTS auth;

-- Stub auth.users table
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    encrypted_password TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session variable to hold current user ID
CREATE TABLE IF NOT EXISTS auth.session (
    user_id UUID
);

-- Helper to set current user (for testing)
CREATE OR REPLACE FUNCTION auth.set_uid(uid UUID)
RETURNS VOID AS $$
BEGIN
    DELETE FROM auth.session;
    INSERT INTO auth.session (user_id) VALUES (uid);
END;
$$ LANGUAGE plpgsql;

-- auth.uid() function that reads from session
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID AS $$
BEGIN
    RETURN (SELECT user_id FROM auth.session LIMIT 1);
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant permissions
GRANT USAGE ON SCHEMA auth TO PUBLIC;
GRANT SELECT ON auth.users TO PUBLIC;
GRANT ALL ON auth.session TO PUBLIC;
`;

async function setupAuthenticatedRole(db) {
    await db.exec(`
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
                CREATE ROLE authenticated;
            END IF;
        END
        $$;

        GRANT authenticated TO CURRENT_USER;
    `);
}

async function setCurrentUser(db, userId) {
    await db.exec(`SELECT auth.set_uid('${userId}'::UUID);`);
    await db.exec(`SET ROLE authenticated;`);
}

async function resetRole(db) {
    await db.exec(`RESET ROLE;`);
}

async function runTests() {
    let db;
    let testsPassed = 0;
    let testsFailed = 0;

    try {
        log('\n🧪 Starting Security & Idempotency Tests\n', 'blue');
        log('━'.repeat(60), 'blue');

        // Initialize PGlite
        logTest('Initializing PGlite (PostgreSQL in WASM)');
        db = new PGlite();
        logSuccess('PGlite initialized');

        // Load SQL schema
        const schemaPath = path.join(__dirname, 'supabase-schema.sql');
        if (!fs.existsSync(schemaPath)) {
            throw new Error(`Schema file not found: ${schemaPath}`);
        }
        const schema = fs.readFileSync(schemaPath, 'utf8');
        logSuccess('Schema file loaded');

        // =====================================================
        // TEST 1: IDEMPOTENCY - Run schema twice
        // =====================================================
        logTest('TEST 1: Schema Idempotency');

        try {
            // Setup auth stub
            log('  Setting up auth stub schema...', 'cyan');
            await db.exec(AUTH_STUB);
            await setupAuthenticatedRole(db);

            // First run
            log('  Running schema (1st time)...', 'cyan');
            await db.exec(schema);
            logSuccess('  First run: SUCCESS');

            // Second run (test idempotency)
            log('  Running schema (2nd time - testing idempotency)...', 'cyan');
            await db.exec(schema);
            logSuccess('  Second run: SUCCESS');

            logSuccess('TEST 1 PASSED: Schema is idempotent ✓');
            testsPassed++;
        } catch (err) {
            logError(`TEST 1 FAILED: ${err.message}`);
            testsFailed++;
        }

        // =====================================================
        // TEST 2: Owner cannot promote self to super_admin
        // =====================================================
        logTest('TEST 2: Gym Owner Cannot Set Role to Super Admin');

        try {
            // Create gym A
            const gymAResult = await db.query(`
                INSERT INTO gyms (name, owner_email, owner_name)
                VALUES ('Gym A', 'owner_a@test.com', 'Owner A')
                RETURNING id;
            `);
            const gymAId = gymAResult.rows[0].id;
            log(`  Created Gym A: ${gymAId}`, 'cyan');

            // Create gym owner A in auth.users
            const authUserAResult = await db.query(`
                INSERT INTO auth.users (email)
                VALUES ('owner_a@test.com')
                RETURNING id;
            `);
            const authUserAId = authUserAResult.rows[0].id;

            // Create user A with gym_owner role
            await db.query(`
                INSERT INTO users (id, gym_id, email, full_name, role)
                VALUES ($1, $2, 'owner_a@test.com', 'Owner A', 'gym_owner');
            `, [authUserAId, gymAId]);
            log('  Created gym owner A', 'cyan');

            // Set current user to owner A
            await setCurrentUser(db, authUserAId);

            // Try to update own role to super_admin (should fail)
            log('  Attempting to promote self to super_admin...', 'cyan');
            try {
                await db.query(`
                    UPDATE users
                    SET role = 'super_admin'
                    WHERE id = $1;
                `, [authUserAId]);

                // If we get here, the trigger didn't fire
                await resetRole(db);
                logError('TEST 2 FAILED: Owner was able to promote to super_admin (trigger did not fire)');
                testsFailed++;
            } catch (updateErr) {
                // Expected error from trigger
                await resetRole(db);
                if (updateErr.message.includes('promote') || updateErr.message.includes('super_admin')) {
                    logSuccess('  Update blocked by trigger: ' + updateErr.message);
                    logSuccess('TEST 2 PASSED: Cannot promote to super_admin ✓');
                    testsPassed++;
                } else {
                    logError(`TEST 2 FAILED: Wrong error: ${updateErr.message}`);
                    testsFailed++;
                }
            }
        } catch (err) {
            await resetRole(db);
            logError(`TEST 2 FAILED: ${err.message}`);
            testsFailed++;
        }

        // =====================================================
        // TEST 3: Suspended gym reads 0 rows
        // =====================================================
        logTest('TEST 3: Suspended Gym Owner Reads 0 Rows');

        try {
            // Create gym B
            const gymBResult = await db.query(`
                INSERT INTO gyms (name, owner_email, owner_name, status)
                VALUES ('Gym B', 'owner_b@test.com', 'Owner B', 'active')
                RETURNING id;
            `);
            const gymBId = gymBResult.rows[0].id;
            log(`  Created Gym B: ${gymBId}`, 'cyan');

            // Create owner B
            const authUserBResult = await db.query(`
                INSERT INTO auth.users (email)
                VALUES ('owner_b@test.com')
                RETURNING id;
            `);
            const authUserBId = authUserBResult.rows[0].id;

            await db.query(`
                INSERT INTO users (id, gym_id, email, full_name, role)
                VALUES ($1, $2, 'owner_b@test.com', 'Owner B', 'gym_owner');
            `, [authUserBId, gymBId]);

            // Create test data for gym B
            await db.query(`
                INSERT INTO plans (gym_id, name, duration_months, price)
                VALUES ($1, 'Monthly Plan', 1, 100.00);
            `, [gymBId]);

            await db.query(`
                INSERT INTO members (gym_id, code, name)
                VALUES ($1, 'M0001', 'Test Member B');
            `, [gymBId]);

            await db.query(`
                INSERT INTO expenses (gym_id, category, amount)
                VALUES ($1, 'Utilities', 500.00);
            `, [gymBId]);

            await db.query(`
                INSERT INTO settings (gym_id, key, value)
                VALUES ($1, 'currency', 'USD');
            `, [gymBId]);

            log('  Created test data (plans, members, expenses, settings)', 'cyan');

            // Set current user to owner B and verify data is visible
            await setCurrentUser(db, authUserBId);

            const beforePlans = await db.query('SELECT COUNT(*) FROM plans;');
            const beforeMembers = await db.query('SELECT COUNT(*) FROM members;');
            const beforeExpenses = await db.query('SELECT COUNT(*) FROM expenses;');
            const beforeSettings = await db.query('SELECT COUNT(*) FROM settings;');

            log(`  Before suspension: plans=${beforePlans.rows[0].count}, members=${beforeMembers.rows[0].count}, expenses=${beforeExpenses.rows[0].count}, settings=${beforeSettings.rows[0].count}`, 'cyan');

            await resetRole(db);

            // Suspend gym B
            await db.query(`
                UPDATE gyms
                SET status = 'suspended', suspended_at = NOW(), suspended_reason = 'Test suspension'
                WHERE id = $1;
            `, [gymBId]);
            log('  Suspended Gym B', 'cyan');

            // Set current user back to owner B
            await setCurrentUser(db, authUserBId);

            // Try to read data (should return 0 rows due to is_gym_active check)
            const afterPlans = await db.query('SELECT COUNT(*) FROM plans;');
            const afterMembers = await db.query('SELECT COUNT(*) FROM members;');
            const afterExpenses = await db.query('SELECT COUNT(*) FROM expenses;');
            const afterSettings = await db.query('SELECT COUNT(*) FROM settings;');

            await resetRole(db);

            log(`  After suspension: plans=${afterPlans.rows[0].count}, members=${afterMembers.rows[0].count}, expenses=${afterExpenses.rows[0].count}, settings=${afterSettings.rows[0].count}`, 'cyan');

            const allZero =
                afterPlans.rows[0].count === '0' &&
                afterMembers.rows[0].count === '0' &&
                afterExpenses.rows[0].count === '0' &&
                afterSettings.rows[0].count === '0';

            if (allZero) {
                logSuccess('TEST 3 PASSED: Suspended gym reads 0 rows from all tables ✓');
                testsPassed++;
            } else {
                logError('TEST 3 FAILED: Suspended gym can still read some data');
                testsFailed++;
            }
        } catch (err) {
            await resetRole(db);
            logError(`TEST 3 FAILED: ${err.message}`);
            testsFailed++;
        }

        // =====================================================
        // TEST 4: Gym A cannot access Gym B data
        // =====================================================
        logTest('TEST 4: Gym A Cannot Access Gym B Data');

        try {
            // Create gym C
            const gymCResult = await db.query(`
                INSERT INTO gyms (name, owner_email, owner_name)
                VALUES ('Gym C', 'owner_c@test.com', 'Owner C')
                RETURNING id;
            `);
            const gymCId = gymCResult.rows[0].id;

            // Create owner C
            const authUserCResult = await db.query(`
                INSERT INTO auth.users (email)
                VALUES ('owner_c@test.com')
                RETURNING id;
            `);
            const authUserCId = authUserCResult.rows[0].id;

            await db.query(`
                INSERT INTO users (id, gym_id, email, full_name, role)
                VALUES ($1, $2, 'owner_c@test.com', 'Owner C', 'gym_owner');
            `, [authUserCId, gymCId]);

            // Create gym D
            const gymDResult = await db.query(`
                INSERT INTO gyms (name, owner_email, owner_name)
                VALUES ('Gym D', 'owner_d@test.com', 'Owner D')
                RETURNING id;
            `);
            const gymDId = gymDResult.rows[0].id;

            // Create owner D
            const authUserDResult = await db.query(`
                INSERT INTO auth.users (email)
                VALUES ('owner_d@test.com')
                RETURNING id;
            `);
            const authUserDId = authUserDResult.rows[0].id;

            await db.query(`
                INSERT INTO users (id, gym_id, email, full_name, role)
                VALUES ($1, $2, 'owner_d@test.com', 'Owner D', 'gym_owner');
            `, [authUserDId, gymDId]);

            // Add data to gym D
            const gymDPlanResult = await db.query(`
                INSERT INTO plans (gym_id, name, duration_months, price)
                VALUES ($1, 'Gym D Plan', 1, 100.00)
                RETURNING id;
            `, [gymDId]);
            const gymDPlanId = gymDPlanResult.rows[0].id;

            const gymDMemberResult = await db.query(`
                INSERT INTO members (gym_id, code, name)
                VALUES ($1, 'M0002', 'Member D')
                RETURNING id;
            `, [gymDId]);
            const gymDMemberId = gymDMemberResult.rows[0].id;

            log(`  Created Gym C, Gym D, and test data`, 'cyan');

            // Log in as owner C
            await setCurrentUser(db, authUserCId);

            // Try to read gym D's data
            const plansRead = await db.query('SELECT * FROM plans WHERE id = $1;', [gymDPlanId]);
            const membersRead = await db.query('SELECT * FROM members WHERE id = $1;', [gymDMemberId]);

            await resetRole(db);

            const cannotReadPlans = plansRead.rows.length === 0;
            const cannotReadMembers = membersRead.rows.length === 0;

            if (cannotReadPlans && cannotReadMembers) {
                logSuccess('TEST 4 PASSED: Gym C cannot access Gym D data ✓');
                testsPassed++;
            } else {
                logError('TEST 4 FAILED: Cross-tenant data leak detected');
                testsFailed++;
            }

            // Try to write to gym D's data (should fail)
            await setCurrentUser(db, authUserCId);

            try {
                await db.query(`
                    INSERT INTO members (gym_id, code, name)
                    VALUES ($1, 'M0003', 'Malicious Member');
                `, [gymDId]);

                await resetRole(db);
                logError('TEST 4 FAILED: Gym C was able to insert into Gym D');
                testsFailed++;
            } catch (insertErr) {
                await resetRole(db);
                if (insertErr.message.includes('policy') || insertErr.message.includes('permission')) {
                    logSuccess('  Write blocked: ' + insertErr.message);
                } else {
                    logWarning('  Write blocked with unexpected error: ' + insertErr.message);
                }
            }
        } catch (err) {
            await resetRole(db);
            logError(`TEST 4 FAILED: ${err.message}`);
            testsFailed++;
        }

        // =====================================================
        // TEST 5: After reactivation, data is intact
        // =====================================================
        logTest('TEST 5: After Reactivation, Data is Intact');

        try {
            // Create gym E
            const gymEResult = await db.query(`
                INSERT INTO gyms (name, owner_email, owner_name, status)
                VALUES ('Gym E', 'owner_e@test.com', 'Owner E', 'active')
                RETURNING id;
            `);
            const gymEId = gymEResult.rows[0].id;

            // Create owner E
            const authUserEResult = await db.query(`
                INSERT INTO auth.users (email)
                VALUES ('owner_e@test.com')
                RETURNING id;
            `);
            const authUserEId = authUserEResult.rows[0].id;

            await db.query(`
                INSERT INTO users (id, gym_id, email, full_name, role)
                VALUES ($1, $2, 'owner_e@test.com', 'Owner E', 'gym_owner');
            `, [authUserEId, gymEId]);

            // Add test data
            await db.query(`
                INSERT INTO plans (gym_id, name, duration_months, price)
                VALUES ($1, 'Test Plan E', 1, 150.00);
            `, [gymEId]);

            await db.query(`
                INSERT INTO members (gym_id, code, name, phone)
                VALUES ($1, 'M0010', 'Test Member E', '1234567890');
            `, [gymEId]);

            await db.query(`
                INSERT INTO expenses (gym_id, category, amount, note)
                VALUES ($1, 'Rent', 2000.00, 'Monthly rent');
            `, [gymEId]);

            log('  Created Gym E with test data', 'cyan');

            // Capture original counts
            const beforePlans = await db.query('SELECT COUNT(*) FROM plans WHERE gym_id = $1;', [gymEId]);
            const beforeMembers = await db.query('SELECT COUNT(*) FROM members WHERE gym_id = $1;', [gymEId]);
            const beforeExpenses = await db.query('SELECT COUNT(*) FROM expenses WHERE gym_id = $1;', [gymEId]);

            log(`  Before suspension: plans=${beforePlans.rows[0].count}, members=${beforeMembers.rows[0].count}, expenses=${beforeExpenses.rows[0].count}`, 'cyan');

            // Suspend gym E
            await db.query(`
                UPDATE gyms
                SET status = 'suspended', suspended_at = NOW()
                WHERE id = $1;
            `, [gymEId]);
            log('  Suspended Gym E', 'cyan');

            // Verify owner cannot read during suspension
            await setCurrentUser(db, authUserEId);
            const duringPlans = await db.query('SELECT COUNT(*) FROM plans;');
            await resetRole(db);

            log(`  During suspension: plans=${duringPlans.rows[0].count} (should be 0)`, 'cyan');

            // Reactivate gym E
            await db.query(`
                UPDATE gyms
                SET status = 'active', suspended_at = NULL, suspended_reason = NULL
                WHERE id = $1;
            `, [gymEId]);
            log('  Reactivated Gym E', 'cyan');

            // Verify data is intact and accessible
            await setCurrentUser(db, authUserEId);

            const afterPlans = await db.query('SELECT COUNT(*) FROM plans;');
            const afterMembers = await db.query('SELECT COUNT(*) FROM members;');
            const afterExpenses = await db.query('SELECT COUNT(*) FROM expenses;');

            await resetRole(db);

            log(`  After reactivation: plans=${afterPlans.rows[0].count}, members=${afterMembers.rows[0].count}, expenses=${afterExpenses.rows[0].count}`, 'cyan');

            const dataIntact =
                beforePlans.rows[0].count === afterPlans.rows[0].count &&
                beforeMembers.rows[0].count === afterMembers.rows[0].count &&
                beforeExpenses.rows[0].count === afterExpenses.rows[0].count;

            if (dataIntact && duringPlans.rows[0].count === '0') {
                logSuccess('TEST 5 PASSED: Data intact after reactivation ✓');
                testsPassed++;
            } else {
                logError('TEST 5 FAILED: Data mismatch after reactivation');
                testsFailed++;
            }
        } catch (err) {
            await resetRole(db);
            logError(`TEST 5 FAILED: ${err.message}`);
            testsFailed++;
        }

        // =====================================================
        // SUMMARY
        // =====================================================
        log('\n' + '━'.repeat(60), 'blue');
        log('\n📊 TEST SUMMARY\n', 'blue');

        const total = testsPassed + testsFailed;
        log(`Total Tests: ${total}`, 'cyan');
        log(`Passed: ${testsPassed}`, 'green');
        log(`Failed: ${testsFailed}`, 'red');
        log(`Success Rate: ${((testsPassed / total) * 100).toFixed(1)}%\n`, testsFailed === 0 ? 'green' : 'yellow');

        if (testsFailed === 0) {
            log('🎉 ALL TESTS PASSED! Schema is secure and idempotent.\n', 'green');
            return 0;
        } else {
            log('⚠️  SOME TESTS FAILED. Review the output above.\n', 'red');
            return 1;
        }

    } catch (err) {
        logError(`\n❌ TEST SUITE ERROR: ${err.message}`);
        console.error(err);
        return 1;
    } finally {
        if (db) {
            await db.close();
        }
    }
}

// Run tests
runTests().then(exitCode => {
    process.exit(exitCode);
}).catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
});
