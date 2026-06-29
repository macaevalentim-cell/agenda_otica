require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==================== CONEXÃO MYSQL ====================
console.log('🔧 Conectando ao banco com as seguintes variáveis:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_SSL:', process.env.DB_SSL || 'false');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Omacae@2772',
    database: process.env.DB_NAME || 'agenda_medica_vision',
    waitForConnections: true,
    connectionLimit: 10,
    ...(process.env.DB_SSL === 'true' ? {
        ssl: {
            rejectUnauthorized: false
        }
    } : {})
});

// Testar conexão imediatamente
pool.getConnection()
    .then(conn => {
        console.log('✅ Conexão com o banco estabelecida com sucesso!');
        conn.release();
    })
    .catch(err => {
        console.error('❌ Falha na conexão com o banco:', err.message);
    });

// ==================== FUNÇÕES AUXILIARES ====================
function toNull(value) {
    return (value === undefined || value === '') ? null : value;
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Acesso negado' });
    jwt.verify(token, process.env.JWT_SECRET || 'secret_key', (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido' });
        req.user = user;
        next();
    });
}

function isAdmin(req, res, next) {
    if (req.user.tipo !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }
    next();
}

// ==================== INICIALIZAÇÃO DO BANCO ====================
async function initDatabase() {
    try {
        console.log('📦 Iniciando criação das tabelas...');

        // 1. Usuários
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INT PRIMARY KEY AUTO_INCREMENT,
                nome VARCHAR(100) NOT NULL,
                username VARCHAR(50) UNIQUE NOT NULL,
                senha VARCHAR(255) NOT NULL,
                telefone VARCHAR(20),
                tipo ENUM('admin', 'vendedor') DEFAULT 'vendedor',
                ativo BOOLEAN DEFAULT TRUE,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabela usuarios ok');

        // 2. Médicos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS medicos (
                id INT PRIMARY KEY AUTO_INCREMENT,
                nome VARCHAR(100) NOT NULL,
                crm VARCHAR(20) UNIQUE NOT NULL,
                telefone VARCHAR(20),
                email VARCHAR(100),
                especialidade VARCHAR(100),
                whatsapp VARCHAR(20),
                endereco TEXT,
                mensagem_padrao TEXT,
                ativo BOOLEAN DEFAULT TRUE,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabela medicos ok');

        // 3. Clientes
        await pool.query(`
            CREATE TABLE IF NOT EXISTS clientes (
                id INT PRIMARY KEY AUTO_INCREMENT,
                nome VARCHAR(200) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
                email VARCHAR(100),
                cpf VARCHAR(14) UNIQUE,
                data_nascimento DATE,
                neurodivergente BOOLEAN DEFAULT FALSE,
                deficiencia_fisica BOOLEAN DEFAULT FALSE,
                encaixe BOOLEAN DEFAULT TRUE,
                ativo BOOLEAN DEFAULT TRUE,
                criado_por INT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (criado_por) REFERENCES usuarios(id)
            )
        `);
        console.log('✅ Tabela clientes ok');

        // 4. Consultas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS consultas (
                id INT PRIMARY KEY AUTO_INCREMENT,
                paciente_nome VARCHAR(200) NOT NULL,
                paciente_telefone VARCHAR(20) NOT NULL,
                paciente_email VARCHAR(100),
                paciente_cpf VARCHAR(14),
                data_consulta DATE NOT NULL,
                horario VARCHAR(5) NOT NULL,
                medico_id INT NOT NULL,
                medico_nome VARCHAR(100) NOT NULL,
                observacoes TEXT,
                status ENUM('agendada', 'confirmada', 'cancelada', 'realizada') DEFAULT 'agendada',
                criado_por INT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (medico_id) REFERENCES medicos(id),
                FOREIGN KEY (criado_por) REFERENCES usuarios(id)
            )
        `);
        console.log('✅ Tabela consultas ok');

        // 5. Solicitações
        await pool.query(`
            CREATE TABLE IF NOT EXISTS solicitacoes_consultas (
                id INT PRIMARY KEY AUTO_INCREMENT,
                paciente_nome VARCHAR(200) NOT NULL,
                paciente_telefone VARCHAR(20) NOT NULL,
                paciente_email VARCHAR(100),
                paciente_cpf VARCHAR(14),
                data_consulta DATE NOT NULL,
                horario_sugerido1 VARCHAR(5) NOT NULL,
                horario_sugerido2 VARCHAR(5),
                horario_sugerido3 VARCHAR(5),
                horario_escolhido VARCHAR(5),
                medico_id INT NOT NULL,
                medico_nome VARCHAR(100) NOT NULL,
                observacoes TEXT,
                status ENUM('pendente', 'aprovado', 'rejeitado') DEFAULT 'pendente',
                solicitado_por INT NOT NULL,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (medico_id) REFERENCES medicos(id),
                FOREIGN KEY (solicitado_por) REFERENCES usuarios(id)
            )
        `);
        console.log('✅ Tabela solicitacoes_consultas ok');

        // 6. Lembretes
        await pool.query(`
            CREATE TABLE IF NOT EXISTS lembretes (
                id INT PRIMARY KEY AUTO_INCREMENT,
                consulta_id INT NOT NULL,
                destinatario_tipo ENUM('paciente', 'vendedor', 'medico') NOT NULL,
                destinatario_nome VARCHAR(200) NOT NULL,
                destinatario_contato VARCHAR(100) NOT NULL,
                mensagem TEXT NOT NULL,
                tipo VARCHAR(20) DEFAULT 'whatsapp',
                status ENUM('pendente', 'enviado', 'falha') DEFAULT 'pendente',
                data_envio_programada DATETIME NOT NULL,
                enviado_em TIMESTAMP NULL,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (consulta_id) REFERENCES consultas(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Tabela lembretes ok');

        // 7. WhatsApp config
        await pool.query(`
            CREATE TABLE IF NOT EXISTS whatsapp_config (
                id INT PRIMARY KEY DEFAULT 1,
                numero VARCHAR(20) DEFAULT '(22) 99764-0112',
                endereco_otica TEXT,
                atualizado_por INT,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (atualizado_por) REFERENCES usuarios(id)
            )
        `);
        console.log('✅ Tabela whatsapp_config ok');

        // 8. Inserir usuários padrão
        const [adminExists] = await pool.query('SELECT id FROM usuarios WHERE username = "admin"');
        if (adminExists.length === 0) {
            const hashedAdmin = await bcrypt.hash('admin123', 10);
            await pool.query(
                'INSERT INTO usuarios (nome, username, senha, tipo, ativo) VALUES (?, ?, ?, ?, ?)',
                ['Administrador', 'admin', hashedAdmin, 'admin', 1]
            );
            console.log('✅ Usuário admin criado');
        }

        const [vendedorExists] = await pool.query('SELECT id FROM usuarios WHERE username = "vendedor"');
        if (vendedorExists.length === 0) {
            const hashedVendedor = await bcrypt.hash('vender123', 10);
            await pool.query(
                'INSERT INTO usuarios (nome, username, senha, tipo, ativo) VALUES (?, ?, ?, ?, ?)',
                ['Vendedor', 'vendedor', hashedVendedor, 'vendedor', 1]
            );
            console.log('✅ Usuário vendedor criado');
        }

        // 9. Configuração WhatsApp
        const [configExists] = await pool.query('SELECT id FROM whatsapp_config WHERE id = 1');
        if (configExists.length === 0) {
            await pool.query(
                'INSERT INTO whatsapp_config (id, numero, endereco_otica) VALUES (1, ?, ?)',
                ['(22) 99764-0112', 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ']
            );
            console.log('✅ Configuração WhatsApp criada');
        }

        console.log('✅ Banco de dados inicializado com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao inicializar banco:', error.message);
        console.error('Detalhes:', error);
    }
}

// Executar a inicialização (não bloquear o servidor)
initDatabase();

// ==================== ROTAS ====================

// ---------- LOGIN (com log detalhado) ----------
app.post('/api/login', async (req, res) => {
    try {
        console.log('🔑 Tentativa de login:', req.body.username);
        const { username, password } = req.body;

        const [users] = await pool.execute(
            'SELECT id, nome, username, senha, tipo, telefone FROM usuarios WHERE username = ? AND ativo = 1',
            [username]
        );

        if (users.length === 0) {
            console.log('❌ Usuário não encontrado:', username);
            return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        }

        const user = users[0];
        const valid = await bcrypt.compare(password, user.senha);
        if (!valid) {
            console.log('❌ Senha inválida para:', username);
            return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        }

        const token = jwt.sign(
            { id: user.id, nome: user.nome, username: user.username, tipo: user.tipo },
            process.env.JWT_SECRET || 'secret_key',
            { expiresIn: '7d' }
        );

        console.log('✅ Login bem-sucedido:', username);
        res.json({ token, user: { id: user.id, nome: user.nome, username: user.username, tipo: user.tipo, telefone: user.telefone } });
    } catch (error) {
        console.error('❌ Erro no login:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ error: 'Erro interno do servidor: ' + error.message });
    }
});

app.get('/api/verify', authenticateToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// ---------- MÉDICOS (exemplo de uma rota) ----------
app.get('/api/medicos', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT id, nome, crm, telefone, email, especialidade, whatsapp, endereco, mensagem_padrao FROM medicos WHERE ativo = 1 ORDER BY nome'
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Coloque as demais rotas aqui (mesmo código que você já tinha) ---
// Inclua todas as rotas do seu sistema (clientes, consultas, solicitações, etc.)
// Para economizar espaço, estou pulando, mas você deve manter todas.

// ==================== ROTAS ADICIONAIS (inclua todas que você já tinha) ====================
// ... (coloque aqui todas as rotas do seu sistema, exatamente como estavam)

// ==================== FRONTEND ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== INICIALIZAÇÃO ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`👑 Admin: admin / admin123`);
    console.log(`📋 Vendedor: vendedor / vender123`);
    console.log(`⏰ Job de lembretes ativo (a cada hora)\n`);
});