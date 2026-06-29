const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function testLogin() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'Omacae@2772',
        database: 'agenda_medica_vision'
    });

    try {
        const [rows] = await pool.execute('SELECT * FROM usuarios WHERE username = ?', ['admin']);
        console.log('Usuário encontrado:', rows[0]);
        
        if (rows[0]) {
            const valid = await bcrypt.compare('admin123', rows[0].senha);
            console.log('Senha válida:', valid);
        }
    } catch (err) {
        console.error('Erro:', err);
    }
    
    process.exit();
}

testLogin();