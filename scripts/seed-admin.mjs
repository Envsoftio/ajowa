import { existsSync } from 'node:fs';
import { hashPassword } from 'better-auth/crypto';
import pg from 'pg';

const { Pool } = pg;

if (typeof process.loadEnvFile === 'function') {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }

  if (existsSync('.env.local')) {
    process.loadEnvFile('.env.local');
  }
}

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const societyCode = process.env.SOCIETY_CODE || process.env.NUXT_PUBLIC_SOCIETY_CODE || 'AJOWA';
const adminEmail = process.env.AJOWA_ADMIN_EMAIL || 'vishnu@envsoft.io';
const adminPassword = process.env.AJOWA_ADMIN_PASSWORD || 'Demo@123';
const adminName = process.env.AJOWA_ADMIN_NAME || 'Vishnu';
const adminMobile = process.env.AJOWA_ADMIN_MOBILE || '+919999999990';

if (!databaseUrl) {
  throw new Error('DATABASE_URL or SUPABASE_DB_URL is required before running seed:admin.');
}

const pool = new Pool({
  connectionString: databaseUrl,
});

const run = async () => {
  const client = await pool.connect();

  try {
    await client.query('begin');

    const societyResult = await client.query(
      `
        select id
        from society_profile
        where code = $1
        limit 1
      `,
      [societyCode],
    );

    const societyId = societyResult.rows[0]?.id;

    if (!societyId) {
      throw new Error(
        `No society_profile found for code "${societyCode}". Run the base seed first or create the society before seeding the admin.`,
      );
    }

    const passwordHash = await hashPassword(adminPassword);

    const authUserResult = await client.query(
      `
        insert into auth_users (name, email, email_verified)
        values ($1, $2, true)
        on conflict (email) do update
          set name = excluded.name,
              email_verified = true,
              updated_at = now()
        returning id
      `,
      [adminName, adminEmail],
    );

    const authUserId = authUserResult.rows[0]?.id;

    if (!authUserId) {
      throw new Error('Failed to resolve auth user id for the admin account.');
    }

    await client.query(
      `
        insert into auth_accounts (account_id, provider_id, user_id, password)
        values ($1, 'credential', $2, $3)
        on conflict (provider_id, account_id) do update
          set user_id = excluded.user_id,
              password = excluded.password,
              updated_at = now()
      `,
      [authUserId, authUserId, passwordHash],
    );

    await client.query(
      `
        insert into users (
          society_id,
          auth_user_id,
          role,
          full_name,
          email,
          mobile_number,
          whatsapp_number,
          can_login,
          must_change_password,
          email_verified,
          is_active
        )
        values ($1, $2, 'ADMIN', $3, $4, $5, $5, true, false, true, true)
        on conflict (auth_user_id) do update
          set role = 'ADMIN',
              society_id = excluded.society_id,
              full_name = excluded.full_name,
              email = excluded.email,
              mobile_number = excluded.mobile_number,
              whatsapp_number = excluded.whatsapp_number,
              can_login = true,
              must_change_password = false,
              email_verified = true,
              is_active = true,
              updated_at = now()
      `,
      [societyId, authUserId, adminName, adminEmail, adminMobile],
    );

    await client.query('commit');

    console.log(`Seeded admin account for ${adminEmail} in society ${societyCode}.`);
    console.log(`Password: ${adminPassword}`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
