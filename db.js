const mysql = require('mysql2/promise');
require('dotenv').config(); // Переконайтесь, що dotenv завантажує змінні середовища

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});


pool.getConnection()
    .then(connection => {
        console.log('Successfully connected to the database.');
        connection.release(); // Важливо повернути з'єднання до пулу
    })
    .catch(err => {
        console.error('Error connecting to the database:', err.stack);   
    });

module.exports = pool;