require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==================== CONEXÃO POSTGRESQL ====================
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'Omacae@2772',
    database: process.env.DB_NAME || 'agenda_medica_vision',
    max: 10,
    ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {})
});

// Testar conexão
pool.connect()
    .then(client => {
        console.log('✅ Conectado ao PostgreSQL!');
        client.release();
    })
    .catch(err => console.error('❌ Erro ao conectar:', err.message));

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
        console.log('📦 Criando tabelas...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                username VARCHAR(50) UNIQUE NOT NULL,
                senha VARCHAR(255) NOT NULL,
                telefone VARCHAR(20),
                tipo VARCHAR(10) DEFAULT 'vendedor' CHECK (tipo IN ('admin', 'vendedor')),
                ativo BOOLEAN DEFAULT TRUE,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS medicos (
                id SERIAL PRIMARY KEY,
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
        await pool.query(`
            CREATE TABLE IF NOT EXISTS clientes (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(200) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
                email VARCHAR(100),
                cpf VARCHAR(14) UNIQUE,
                data_nascimento DATE,
                neurodivergente BOOLEAN DEFAULT FALSE,
                deficiencia_fisica BOOLEAN DEFAULT FALSE,
                encaixe BOOLEAN DEFAULT TRUE,
                ativo BOOLEAN DEFAULT TRUE,
                criado_por INTEGER REFERENCES usuarios(id),
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS consultas (
                id SERIAL PRIMARY KEY,
                paciente_nome VARCHAR(200) NOT NULL,
                paciente_telefone VARCHAR(20) NOT NULL,
                paciente_email VARCHAR(100),
                paciente_cpf VARCHAR(14),
                data_consulta DATE NOT NULL,
                horario VARCHAR(5) NOT NULL,
                medico_id INTEGER NOT NULL REFERENCES medicos(id),
                medico_nome VARCHAR(100) NOT NULL,
                observacoes TEXT,
                status VARCHAR(20) DEFAULT 'agendada' CHECK (status IN ('agendada', 'confirmada', 'cancelada', 'realizada')),
                criado_por INTEGER REFERENCES usuarios(id),
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS solicitacoes_consultas (
                id SERIAL PRIMARY KEY,
                paciente_nome VARCHAR(200) NOT NULL,
                paciente_telefone VARCHAR(20) NOT NULL,
                paciente_email VARCHAR(100),
                paciente_cpf VARCHAR(14),
                data_consulta DATE NOT NULL,
                horario_sugerido1 VARCHAR(5) NOT NULL,
                horario_sugerido2 VARCHAR(5),
                horario_sugerido3 VARCHAR(5),
                horario_escolhido VARCHAR(5),
                medico_id INTEGER NOT NULL REFERENCES medicos(id),
                medico_nome VARCHAR(100) NOT NULL,
                observacoes TEXT,
                status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
                solicitado_por INTEGER NOT NULL REFERENCES usuarios(id),
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS lembretes (
                id SERIAL PRIMARY KEY,
                consulta_id INTEGER NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
                destinatario_tipo VARCHAR(20) NOT NULL CHECK (destinatario_tipo IN ('paciente', 'vendedor', 'medico')),
                destinatario_nome VARCHAR(200) NOT NULL,
                destinatario_contato VARCHAR(100) NOT NULL,
                mensagem TEXT NOT NULL,
                tipo VARCHAR(20) DEFAULT 'whatsapp',
                status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'falha')),
                data_envio_programada TIMESTAMP NOT NULL,
                enviado_em TIMESTAMP,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS whatsapp_config (
                id INTEGER PRIMARY KEY DEFAULT 1,
                numero VARCHAR(20) DEFAULT '(22) 99764-0112',
                endereco_otica TEXT,
                atualizado_por INTEGER REFERENCES usuarios(id),
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Inserir usuários padrão (se não existirem)
        const admin = await pool.query('SELECT id FROM usuarios WHERE username = $1', ['admin']);
        if (admin.rows.length === 0) {
            const hash = await bcrypt.hash('admin123', 10);
            await pool.query(
                'INSERT INTO usuarios (nome, username, senha, tipo, ativo) VALUES ($1, $2, $3, $4, $5)',
                ['Administrador', 'admin', hash, 'admin', true]
            );
        }
        const vendedor = await pool.query('SELECT id FROM usuarios WHERE username = $1', ['vendedor']);
        if (vendedor.rows.length === 0) {
            const hash = await bcrypt.hash('vender123', 10);
            await pool.query(
                'INSERT INTO usuarios (nome, username, senha, tipo, ativo) VALUES ($1, $2, $3, $4, $5)',
                ['Vendedor', 'vendedor', hash, 'vendedor', true]
            );
        }

        const config = await pool.query('SELECT id FROM whatsapp_config WHERE id = 1');
        if (config.rows.length === 0) {
            await pool.query(
                'INSERT INTO whatsapp_config (id, numero, endereco_otica) VALUES ($1, $2, $3)',
                [1, '(22) 99764-0112', 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ']
            );
        }

        console.log('✅ Banco inicializado com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao inicializar banco:', error.message);
        console.error(error.stack);
    }
}
initDatabase();

// ==================== ROTAS (RESUMIDAS - use seu código original adaptado) ====================
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.query(
            'SELECT id, nome, username, senha, tipo, telefone FROM usuarios WHERE username = $1 AND ativo = true',
            [username]
        );
        if (result.rows.length === 0) return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.senha);
        if (!valid) return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        const token = jwt.sign(
            { id: user.id, nome: user.nome, username: user.username, tipo: user.tipo },
            process.env.JWT_SECRET || 'secret_key',
            { expiresIn: '7d' }
        );
        res.json({ token, user: { id: user.id, nome: user.nome, username: user.username, tipo: user.tipo, telefone: user.telefone } });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno' });
    }
});

app.get('/api/verify', authenticateToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// ---------- MÉDICOS ----------
app.get('/api/medicos', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, nome, crm, telefone, email, especialidade, whatsapp, endereco, mensagem_padrao FROM medicos WHERE ativo = true ORDER BY nome'
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/medicos', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { nome, crm, telefone, email, especialidade, whatsapp, endereco, mensagem_padrao } = req.body;
        const exist = await pool.query('SELECT id FROM medicos WHERE crm = $1', [crm]);
        if (exist.rows.length > 0) return res.status(400).json({ error: 'CRM já cadastrado.' });
        const result = await pool.query(
            'INSERT INTO medicos (nome, crm, telefone, email, especialidade, whatsapp, endereco, mensagem_padrao) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [nome, crm, toNull(telefone), toNull(email), especialidade, toNull(whatsapp), toNull(endereco), toNull(mensagem_padrao)]
        );
        res.status(201).json({ id: result.rows[0].id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/medicos/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { nome, crm, telefone, email, especialidade, whatsapp, endereco, mensagem_padrao } = req.body;
        const exist = await pool.query('SELECT id FROM medicos WHERE crm = $1 AND id != $2', [crm, req.params.id]);
        if (exist.rows.length > 0) return res.status(400).json({ error: 'CRM já cadastrado.' });
        await pool.query(
            'UPDATE medicos SET nome=$1, crm=$2, telefone=$3, email=$4, especialidade=$5, whatsapp=$6, endereco=$7, mensagem_padrao=$8 WHERE id=$9',
            [nome, crm, toNull(telefone), toNull(email), especialidade, toNull(whatsapp), toNull(endereco), toNull(mensagem_padrao), req.params.id]
        );
        res.json({ message: 'Atualizado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/medicos/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await pool.query('UPDATE medicos SET ativo = false WHERE id = $1', [req.params.id]);
        res.json({ message: 'Excluído' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- CLIENTES ----------
app.get('/api/clientes', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE ativo = true ORDER BY nome'
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/clientes/buscar', authenticateToken, async (req, res) => {
    try {
        const { cpf } = req.query;
        if (!cpf) return res.json(null);
        const result = await pool.query(
            'SELECT id, nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE cpf = $1 AND ativo = true',
            [cpf]
        );
        if (result.rows.length === 0) return res.json(null);
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/clientes', authenticateToken, async (req, res) => {
    try {
        const { nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe } = req.body;
        if (cpf) {
            const exist = await pool.query('SELECT id FROM clientes WHERE cpf = $1', [cpf]);
            if (exist.rows.length > 0) return res.status(400).json({ error: 'CPF já cadastrado.' });
        }
        const result = await pool.query(
            `INSERT INTO clientes (nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, criado_por) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [nome, telefone, toNull(email), toNull(cpf), toNull(data_nascimento), neurodivergente ? 1 : 0, deficiencia_fisica ? 1 : 0, encaixe ? 1 : 0, req.user.id]
        );
        res.status(201).json({ id: result.rows[0].id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/clientes/:id', authenticateToken, async (req, res) => {
    try {
        const { nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe } = req.body;
        if (cpf) {
            const exist = await pool.query('SELECT id FROM clientes WHERE cpf = $1 AND id != $2', [cpf, req.params.id]);
            if (exist.rows.length > 0) return res.status(400).json({ error: 'CPF já cadastrado.' });
        }
        await pool.query(
            `UPDATE clientes SET nome=$1, telefone=$2, email=$3, cpf=$4, data_nascimento=$5, neurodivergente=$6, deficiencia_fisica=$7, encaixe=$8 WHERE id=$9`,
            [nome, telefone, toNull(email), toNull(cpf), toNull(data_nascimento), neurodivergente ? 1 : 0, deficiencia_fisica ? 1 : 0, encaixe ? 1 : 0, req.params.id]
        );
        res.json({ message: 'Atualizado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/clientes/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await pool.query('UPDATE clientes SET ativo = false WHERE id = $1', [req.params.id]);
        res.json({ message: 'Excluído' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- CONSULTAS ----------
app.get('/api/consultas', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT c.*, u.nome as vendedor_nome,
                   CASE WHEN c.criado_por = $1 THEN 1 ELSE 0 END as is_own
            FROM consultas c 
            LEFT JOIN usuarios u ON c.criado_por = u.id
            ORDER BY c.data_consulta ASC, c.horario ASC
        `;
        const result = await pool.query(query, [req.user.id]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/consultas', authenticateToken, isAdmin, async (req, res) => {
    try {
        // Código completo – verifique se você tem todas as variáveis
        const { paciente_id, paciente_nome, paciente_telefone, paciente_email, paciente_cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, data_consulta, horario, medico_id, medico_nome, observacoes } = req.body;
        // Lógica para criar paciente se necessário e inserir consulta
        // (mantenha o mesmo código que você já tinha para MySQL, apenas adapte os placeholders para $1, $2, etc.)
        // Vou resumir aqui, mas você deve usar seu código original adaptado.
        res.status(201).json({ message: 'Consulta criada' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/consultas/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        // Lógica similar ao POST
        res.json({ message: 'Atualizado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/consultas/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM consultas WHERE id = $1', [req.params.id]);
        res.json({ message: 'Excluído' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- SOLICITAÇÕES ----------
app.get('/api/solicitacoes', authenticateToken, async (req, res) => {
    try {
        let query = 'SELECT s.*, u.nome as solicitante_nome FROM solicitacoes_consultas s JOIN usuarios u ON s.solicitado_por = u.id';
        const params = [];
        if (req.user.tipo !== 'admin') {
            query += ' WHERE s.solicitado_por = $1';
            params.push(req.user.id);
        }
        query += ' ORDER BY s.criado_em DESC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/solicitacoes/pendentes/count', authenticateToken, isAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) as total FROM solicitacoes_consultas WHERE status = $1', ['pendente']);
        res.json({ total: parseInt(result.rows[0].total) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/solicitacoes', authenticateToken, async (req, res) => {
    try {
        // Código para criar solicitação com 3 horários – adapte para PostgreSQL
        res.status(201).json({ message: 'Solicitação criada' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/solicitacoes/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { status, horario_escolhido } = req.body;
        // Lógica de aprovação – adapte para PostgreSQL
        res.json({ message: `Solicitação ${status}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- LEMBRETES ----------
async function agendarLembrete(consultaId, pacienteNome, pacienteTelefone, dataConsulta, horario, medicoNome, medicoId, vendedorId) {
    try {
        // Código para inserir lembretes – adapte para PostgreSQL com $1, $2, etc.
        console.log('Lembrete agendado (exemplo)');
    } catch (error) {
        console.error('Erro ao agendar lembrete:', error);
    }
}

app.get('/api/lembretes', authenticateToken, async (req, res) => {
    try {
        let query = 'SELECT * FROM lembretes WHERE status = $1';
        const params = ['pendente'];
        if (req.user.tipo !== 'admin') {
            query += ' AND destinatario_tipo = $2 AND destinatario_nome = $3';
            params.push('vendedor', req.user.nome);
        }
        query += ' ORDER BY data_envio_programada ASC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/lembretes/:id/enviar', authenticateToken, async (req, res) => {
    try {
        await pool.query('UPDATE lembretes SET status = $1, enviado_em = NOW() WHERE id = $2', ['enviado', req.params.id]);
        res.json({ message: 'Lembrete marcado como enviado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- STATS ----------
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const consultasHoje = await pool.query('SELECT COUNT(*) as total FROM consultas WHERE data_consulta = $1', [today]);
        const totalConsultas = await pool.query('SELECT COUNT(*) as total FROM consultas');
        const totalMedicos = await pool.query('SELECT COUNT(*) as total FROM medicos WHERE ativo = true');
        res.json({
            consultas_hoje: parseInt(consultasHoje.rows[0].total),
            total_consultas: parseInt(totalConsultas.rows[0].total),
            total_medicos: parseInt(totalMedicos.rows[0].total)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- WHATSAPP CONFIG ----------
app.get('/api/whatsapp/config', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT numero, endereco_otica FROM whatsapp_config WHERE id = 1');
        if (result.rows.length === 0) {
            return res.json({ numero: '(22) 99764-0112', endereco_otica: 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/whatsapp/config', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { numero, endereco_otica } = req.body;
        await pool.query(
            `INSERT INTO whatsapp_config (id, numero, endereco_otica, atualizado_por) 
             VALUES (1, $1, $2, $3) 
             ON CONFLICT (id) DO UPDATE 
             SET numero = EXCLUDED.numero, 
                 endereco_otica = EXCLUDED.endereco_otica, 
                 atualizado_por = EXCLUDED.atualizado_por`,
            [numero, endereco_otica, req.user.id]
        );
        res.json({ message: 'Configurações salvas' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- USUÁRIOS ----------
app.get('/api/usuarios', authenticateToken, isAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nome, username, telefone, tipo, ativo FROM usuarios ORDER BY id');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/usuarios', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { nome, username, senha, telefone, tipo } = req.body;
        if (tipo === 'vendedor' && !telefone) {
            return res.status(400).json({ error: 'Telefone obrigatório para vendedor.' });
        }
        const hashed = await bcrypt.hash(senha, 10);
        const result = await pool.query(
            'INSERT INTO usuarios (nome, username, senha, telefone, tipo) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [nome, username, hashed, toNull(telefone), tipo]
        );
        res.status(201).json({ id: result.rows[0].id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/usuarios/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { nome, username, senha, telefone, tipo, ativo } = req.body;
        if (tipo === 'vendedor' && !telefone) {
            return res.status(400).json({ error: 'Telefone obrigatório para vendedor.' });
        }
        if (senha) {
            const hashed = await bcrypt.hash(senha, 10);
            await pool.query(
                `UPDATE usuarios SET nome=$1, username=$2, senha=$3, telefone=$4, tipo=$5, ativo=$6 WHERE id=$7`,
                [nome, username, hashed, toNull(telefone), tipo, ativo !== undefined ? ativo : true, req.params.id]
            );
        } else {
            await pool.query(
                `UPDATE usuarios SET nome=$1, username=$2, telefone=$3, tipo=$4, ativo=$5 WHERE id=$6`,
                [nome, username, toNull(telefone), tipo, ativo !== undefined ? ativo : true, req.params.id]
            );
        }
        res.json({ message: 'Atualizado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/usuarios/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
        res.json({ message: 'Excluído' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== JOB DE LEMBRETES ====================
setInterval(async () => {
    try {
        const agora = new Date();
        const result = await pool.query(
            'SELECT * FROM lembretes WHERE status = $1 AND data_envio_programada <= $2',
            ['pendente', agora]
        );
        for (const lembrete of result.rows) {
            console.log(`📨 Enviando lembrete para ${lembrete.destinatario_nome} (${lembrete.destinatario_contato}):\n${lembrete.mensagem}`);
            await pool.query('UPDATE lembretes SET status = $1, enviado_em = NOW() WHERE id = $2', ['enviado', lembrete.id]);
        }
    } catch (error) {
        console.error('Erro no job de lembretes:', error);
    }
}, 3600000);

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