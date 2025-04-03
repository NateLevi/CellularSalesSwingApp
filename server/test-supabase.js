
require('dotenv').config({ path: '../.env' });
console.log('TEST SCRIPT USING URL:', process.env.DATABASE_URL); // Add this line


const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  
});

async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('Supabase connected at:', res.rows[0].now);
  } catch (err) {
    console.error('Error executing query', err.stack);
  } finally {
    await pool.end();
  }
}

testConnection();

