const { Pool } = require('pg');

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'sua_senha',
    database: 'agenda_medica_vision'
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Erro de conexão:', err);
    } else {
        console.log('Conectado!', res.rows[0]);
    }
    pool.end();
});