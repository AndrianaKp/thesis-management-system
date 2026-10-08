
const mysql = require('mysql');

const pool = mysql.createPool({
  connectionLimit: 10,
  host    : process.env.DATABASE_HOST,
  user    : process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE,
});

// Προαιρετικό health check + ένα log ΜΟΝΟ
pool.getConnection((err, conn) => {
  if (err) {
    console.error('MYSQL connection error:', err);
    return;
  }
  console.log('MYSQL Connected...');
  if (conn) conn.release();
});

module.exports = pool;
