const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BACKUP_DIR = path.join(__dirname, '../backups');
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const filename = `backup-${timestamp}.sql`;
const filepath = path.join(BACKUP_DIR, filename);

// Se usar DATABASE_URL (Render)
const dbUrl = process.env.DATABASE_URL;
if (dbUrl) {
    const command = `pg_dump "${dbUrl}" --no-owner --no-acl --clean --if-exists > "${filepath}"`;
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Erro no backup: ${error.message}`);
            return;
        }
        if (stderr) console.error(`stderr: ${stderr}`);
        console.log(`✅ Backup salvo em: ${filepath}`);
    });
} else {
    // Usar variáveis individuais
    const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
    const command = `PGPASSWORD=${DB_PASSWORD} pg_dump --host=${DB_HOST} --port=${DB_PORT} --username=${DB_USER} --no-owner --no-acl --clean --if-exists "${DB_NAME}" > "${filepath}"`;
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Erro no backup: ${error.message}`);
            return;
        }
        if (stderr) console.error(`stderr: ${stderr}`);
        console.log(`✅ Backup salvo em: ${filepath}`);
    });
}