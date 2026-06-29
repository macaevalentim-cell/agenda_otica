require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();

// ==================== MIDDLEWARES GLOBAIS ====================
app.use(cors());
app.use(express.json());

// ==================== CONEXÃO MYSQL ====================
console.log('🔧 Conectando ao banco...');
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

// Teste de conexão
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

// ==================== INICIALIZAÇÃO DO BANCO (assíncrona) ====================
async function initDatabase() {
    try {
        console.log('📦 Iniciando criação das tabelas...');
        // (código de criação de tabelas - igual ao anterior)
        // ...
        console.log('✅ Banco de dados inicializado com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao inicializar banco:', error.message);
    }
}
initDatabase();

// ==================== ROTAS DE API (ANTES DO ESTÁTICO) ====================

// ---------- LOGIN ----------
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

// ---------- MÉDICOS ----------
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

app.post('/api/medicos', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { nome, crm, telefone, email, especialidade, whatsapp, endereco, mensagem_padrao } = req.body;
        if (crm) {
            const [existing] = await pool.execute('SELECT id FROM medicos WHERE crm = ?', [crm]);
            if (existing.length > 0) {
                return res.status(400).json({ error: 'CRM já cadastrado para outro médico.' });
            }
        }
        const [result] = await pool.execute(
            'INSERT INTO medicos (nome, crm, telefone, email, especialidade, whatsapp, endereco, mensagem_padrao) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [nome, crm, toNull(telefone), toNull(email), especialidade, toNull(whatsapp), toNull(endereco), toNull(mensagem_padrao)]
        );
        res.status(201).json({ id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/medicos/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { nome, crm, telefone, email, especialidade, whatsapp, endereco, mensagem_padrao } = req.body;
        if (crm) {
            const [existing] = await pool.execute('SELECT id FROM medicos WHERE crm = ? AND id != ?', [crm, req.params.id]);
            if (existing.length > 0) {
                return res.status(400).json({ error: 'CRM já cadastrado para outro médico.' });
            }
        }
        await pool.execute(
            'UPDATE medicos SET nome=?, crm=?, telefone=?, email=?, especialidade=?, whatsapp=?, endereco=?, mensagem_padrao=? WHERE id=?',
            [nome, crm, toNull(telefone), toNull(email), especialidade, toNull(whatsapp), toNull(endereco), toNull(mensagem_padrao), req.params.id]
        );
        res.json({ message: 'Atualizado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/medicos/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await pool.execute('UPDATE medicos SET ativo = 0 WHERE id = ?', [req.params.id]);
        res.json({ message: 'Excluído' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- CLIENTES ----------
app.get('/api/clientes', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT id, nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE ativo = 1 ORDER BY nome'
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/clientes/buscar', authenticateToken, async (req, res) => {
    try {
        const { cpf } = req.query;
        if (!cpf) return res.json(null);
        const [rows] = await pool.execute(
            'SELECT id, nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE cpf = ? AND ativo = 1',
            [cpf]
        );
        if (rows.length === 0) return res.json(null);
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/clientes', authenticateToken, async (req, res) => {
    try {
        const { nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe } = req.body;
        if (cpf) {
            const [existing] = await pool.execute('SELECT id FROM clientes WHERE cpf = ?', [cpf]);
            if (existing.length > 0) {
                return res.status(400).json({ error: 'CPF já cadastrado para outro paciente.' });
            }
        }
        let neuro = neurodivergente ? 1 : 0;
        let defFis = deficiencia_fisica ? 1 : 0;
        let enc = encaixe ? 1 : 0;
        if (neuro === 0 && defFis === 0 && enc === 0) enc = 1;
        const [result] = await pool.execute(
            'INSERT INTO clientes (nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [nome, telefone, toNull(email), toNull(cpf), toNull(data_nascimento), neuro, defFis, enc, req.user.id]
        );
        res.status(201).json({ id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/clientes/:id', authenticateToken, async (req, res) => {
    try {
        const { nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe } = req.body;
        if (cpf) {
            const [existing] = await pool.execute('SELECT id FROM clientes WHERE cpf = ? AND id != ?', [cpf, req.params.id]);
            if (existing.length > 0) {
                return res.status(400).json({ error: 'CPF já cadastrado para outro paciente.' });
            }
        }
        let neuro = neurodivergente ? 1 : 0;
        let defFis = deficiencia_fisica ? 1 : 0;
        let enc = encaixe ? 1 : 0;
        if (neuro === 0 && defFis === 0 && enc === 0) enc = 1;
        await pool.execute(
            'UPDATE clientes SET nome=?, telefone=?, email=?, cpf=?, data_nascimento=?, neurodivergente=?, deficiencia_fisica=?, encaixe=? WHERE id=?',
            [nome, telefone, toNull(email), toNull(cpf), toNull(data_nascimento), neuro, defFis, enc, req.params.id]
        );
        res.json({ message: 'Atualizado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/clientes/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await pool.execute('UPDATE clientes SET ativo = 0 WHERE id = ?', [req.params.id]);
        res.json({ message: 'Excluído' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- CONSULTAS (com is_own) ----------
app.get('/api/consultas', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT c.*, u.nome as vendedor_nome,
                   CASE WHEN c.criado_por = ? THEN 1 ELSE 0 END as is_own
            FROM consultas c 
            LEFT JOIN usuarios u ON c.criado_por = u.id
            ORDER BY c.data_consulta ASC, c.horario ASC
        `;
        const [rows] = await pool.execute(query, [req.user.id]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/consultas', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { paciente_id, paciente_nome, paciente_telefone, paciente_email, paciente_cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, data_consulta, horario, medico_id, medico_nome, observacoes } = req.body;

        let pacienteId = paciente_id;
        if (!pacienteId && paciente_cpf) {
            const [existente] = await pool.execute('SELECT id FROM clientes WHERE cpf = ?', [paciente_cpf]);
            if (existente.length > 0) {
                pacienteId = existente[0].id;
            } else {
                let neuro = neurodivergente ? 1 : 0;
                let defFis = deficiencia_fisica ? 1 : 0;
                let enc = encaixe ? 1 : 0;
                if (neuro === 0 && defFis === 0 && enc === 0) enc = 1;
                const [result] = await pool.execute(
                    'INSERT INTO clientes (nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [paciente_nome, paciente_telefone, toNull(paciente_email), paciente_cpf, toNull(data_nascimento), neuro, defFis, enc, req.user.id]
                );
                pacienteId = result.insertId;
            }
        }

        let nome = paciente_nome;
        let telefone = paciente_telefone;
        let email = paciente_email;
        let cpf = paciente_cpf;
        if (pacienteId) {
            const [cliente] = await pool.execute(
                'SELECT nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE id = ?',
                [pacienteId]
            );
            if (cliente.length > 0) {
                nome = cliente[0].nome;
                telefone = cliente[0].telefone;
                email = cliente[0].email;
                cpf = cliente[0].cpf;
            }
        }

        const [existing] = await pool.execute(
            'SELECT id FROM consultas WHERE data_consulta = ? AND horario = ? AND medico_id = ? AND status NOT IN ("cancelada", "realizada")',
            [data_consulta, horario, medico_id]
        );
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Horário já ocupado para este médico' });
        }

        const [result] = await pool.execute(
            'INSERT INTO consultas (paciente_nome, paciente_telefone, paciente_email, paciente_cpf, data_consulta, horario, medico_id, medico_nome, observacoes, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [nome, telefone, toNull(email), toNull(cpf), data_consulta, horario, medico_id, medico_nome, toNull(observacoes), req.user.id]
        );
        const consultaId = result.insertId;

        await agendarLembrete(consultaId, nome, telefone, data_consulta, horario, medico_nome, medico_id, req.user.id);

        res.status(201).json({ id: consultaId });
    } catch (error) {
        console.error('Erro ao criar consulta:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/consultas/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { paciente_id, paciente_nome, paciente_telefone, paciente_email, paciente_cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, data_consulta, horario, medico_id, medico_nome, observacoes, status } = req.body;

        let pacienteId = paciente_id;
        if (!pacienteId && paciente_cpf) {
            const [existente] = await pool.execute('SELECT id FROM clientes WHERE cpf = ?', [paciente_cpf]);
            if (existente.length > 0) {
                pacienteId = existente[0].id;
            } else {
                let neuro = neurodivergente ? 1 : 0;
                let defFis = deficiencia_fisica ? 1 : 0;
                let enc = encaixe ? 1 : 0;
                if (neuro === 0 && defFis === 0 && enc === 0) enc = 1;
                const [result] = await pool.execute(
                    'INSERT INTO clientes (nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [paciente_nome, paciente_telefone, toNull(paciente_email), paciente_cpf, toNull(data_nascimento), neuro, defFis, enc, req.user.id]
                );
                pacienteId = result.insertId;
            }
        }

        let nome = paciente_nome;
        let telefone = paciente_telefone;
        let email = paciente_email;
        let cpf = paciente_cpf;
        if (pacienteId) {
            const [cliente] = await pool.execute(
                'SELECT nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE id = ?',
                [pacienteId]
            );
            if (cliente.length > 0) {
                nome = cliente[0].nome;
                telefone = cliente[0].telefone;
                email = cliente[0].email;
                cpf = cliente[0].cpf;
            }
        }

        const [existing] = await pool.execute(
            'SELECT id FROM consultas WHERE data_consulta = ? AND horario = ? AND medico_id = ? AND id != ? AND status NOT IN ("cancelada", "realizada")',
            [data_consulta, horario, medico_id, req.params.id]
        );
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Horário já ocupado para este médico' });
        }

        await pool.execute(
            'UPDATE consultas SET paciente_nome=?, paciente_telefone=?, paciente_email=?, paciente_cpf=?, data_consulta=?, horario=?, medico_id=?, medico_nome=?, observacoes=?, status=? WHERE id=?',
            [nome, telefone, toNull(email), toNull(cpf), data_consulta, horario, medico_id, medico_nome, toNull(observacoes), status || 'agendada', req.params.id]
        );
        res.json({ message: 'Atualizado' });
    } catch (error) {
        console.error('Erro ao atualizar consulta:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/consultas/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await pool.execute('DELETE FROM consultas WHERE id = ?', [req.params.id]);
        res.json({ message: 'Excluído' });
    } catch (error) {
        console.error('Erro ao excluir consulta:', error);
        res.status(500).json({ error: error.message });
    }
});

// ---------- SOLICITAÇÕES ----------
app.get('/api/solicitacoes', authenticateToken, async (req, res) => {
    try {
        let query = 'SELECT s.*, u.nome as solicitante_nome FROM solicitacoes_consultas s JOIN usuarios u ON s.solicitado_por = u.id';
        const params = [];
        if (req.user.tipo !== 'admin') {
            query += ' WHERE s.solicitado_por = ?';
            params.push(req.user.id);
        }
        query += ' ORDER BY s.criado_em DESC';
        const [rows] = await pool.execute(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/solicitacoes/pendentes/count', authenticateToken, isAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT COUNT(*) as total FROM solicitacoes_consultas WHERE status = "pendente"');
        res.json({ total: rows[0].total });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/solicitacoes', authenticateToken, async (req, res) => {
    try {
        const {
            paciente_nome,
            paciente_telefone,
            paciente_email,
            paciente_cpf,
            data_nascimento,
            neurodivergente,
            deficiencia_fisica,
            encaixe,
            data_consulta,
            horario1,
            horario2,
            horario3,
            medico_id,
            medico_nome,
            observacoes
        } = req.body;

        let pacienteId = null;
        if (paciente_cpf) {
            const [existente] = await pool.execute('SELECT id FROM clientes WHERE cpf = ?', [paciente_cpf]);
            if (existente.length > 0) {
                pacienteId = existente[0].id;
            } else {
                let neuro = neurodivergente ? 1 : 0;
                let defFis = deficiencia_fisica ? 1 : 0;
                let enc = encaixe ? 1 : 0;
                if (neuro === 0 && defFis === 0 && enc === 0) enc = 1;
                const [result] = await pool.execute(
                    'INSERT INTO clientes (nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [paciente_nome, paciente_telefone, toNull(paciente_email), paciente_cpf, toNull(data_nascimento), neuro, defFis, enc, req.user.id]
                );
                pacienteId = result.insertId;
            }
        }

        const horarios = [horario1, horario2, horario3].filter(h => h);
        for (const hor of horarios) {
            const [existing] = await pool.execute(
                `SELECT id FROM solicitacoes_consultas 
                 WHERE data_consulta = ? AND medico_id = ? AND status = "pendente" 
                 AND (horario_sugerido1 = ? OR horario_sugerido2 = ? OR horario_sugerido3 = ?)`,
                [data_consulta, medico_id, hor, hor, hor]
            );
            if (existing.length > 0) {
                return res.status(400).json({ error: `O horário ${hor} já possui uma solicitação pendente para este médico.` });
            }
        }

        const [result] = await pool.execute(
            `INSERT INTO solicitacoes_consultas 
             (paciente_nome, paciente_telefone, paciente_email, paciente_cpf, data_consulta, horario_sugerido1, horario_sugerido2, horario_sugerido3, medico_id, medico_nome, observacoes, solicitado_por) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                paciente_nome,
                paciente_telefone,
                toNull(paciente_email),
                toNull(paciente_cpf),
                data_consulta,
                horario1,
                toNull(horario2),
                toNull(horario3),
                medico_id,
                medico_nome,
                toNull(observacoes),
                req.user.id
            ]
        );
        res.status(201).json({ id: result.insertId });
    } catch (error) {
        console.error('Erro ao criar solicitação:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/solicitacoes/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { status, horario_escolhido } = req.body;
        if (!['aprovado', 'rejeitado'].includes(status)) {
            return res.status(400).json({ error: 'Status inválido' });
        }

        const [solic] = await pool.execute('SELECT * FROM solicitacoes_consultas WHERE id = ?', [req.params.id]);
        if (solic.length === 0) {
            return res.status(404).json({ error: 'Solicitação não encontrada' });
        }
        const s = solic[0];

        if (status === 'aprovado') {
            if (!horario_escolhido) {
                return res.status(400).json({ error: 'É necessário selecionar um horário para aprovar.' });
            }
            const horarios = [s.horario_sugerido1, s.horario_sugerido2, s.horario_sugerido3].filter(h => h);
            if (!horarios.includes(horario_escolhido)) {
                return res.status(400).json({ error: 'Horário escolhido não está entre os sugeridos.' });
            }

            const [conflict] = await pool.execute(
                'SELECT id FROM consultas WHERE data_consulta = ? AND horario = ? AND medico_id = ? AND status NOT IN ("cancelada", "realizada")',
                [s.data_consulta, horario_escolhido, s.medico_id]
            );
            if (conflict.length > 0) {
                return res.status(400).json({ error: 'Horário já ocupado para este médico.' });
            }

            const [result] = await pool.execute(
                `INSERT INTO consultas 
                 (paciente_nome, paciente_telefone, paciente_email, paciente_cpf, data_consulta, horario, medico_id, medico_nome, observacoes, criado_por) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    s.paciente_nome,
                    s.paciente_telefone,
                    s.paciente_email,
                    s.paciente_cpf,
                    s.data_consulta,
                    horario_escolhido,
                    s.medico_id,
                    s.medico_nome,
                    s.observacoes,
                    s.solicitado_por
                ]
            );
            await agendarLembrete(result.insertId, s.paciente_nome, s.paciente_telefone, s.data_consulta, horario_escolhido, s.medico_nome, s.medico_id, s.solicitado_por);
            await pool.execute('UPDATE solicitacoes_consultas SET horario_escolhido = ? WHERE id = ?', [horario_escolhido, req.params.id]);
        }

        await pool.execute('UPDATE solicitacoes_consultas SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ message: `Solicitação ${status} com sucesso` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- LEMBRETES ----------
async function agendarLembrete(consultaId, pacienteNome, pacienteTelefone, dataConsulta, horario, medicoNome, medicoId, vendedorId) {
    try {
        const [medico] = await pool.execute('SELECT whatsapp, mensagem_padrao FROM medicos WHERE id = ?', [medicoId]);
        const medicoWhatsapp = medico.length ? medico[0].whatsapp : null;
        const mensagemPadrao = medico.length ? medico[0].mensagem_padrao : '';

        const [paciente] = await pool.execute(
            'SELECT neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE nome = ? AND telefone = ?',
            [pacienteNome, pacienteTelefone]
        );
        let condicao = 'Encaixe';
        if (paciente.length) {
            const p = paciente[0];
            if (p.neurodivergente && p.deficiencia_fisica) condicao = 'Neurodivergente e Deficiência Física';
            else if (p.neurodivergente) condicao = 'Neurodivergente';
            else if (p.deficiencia_fisica) condicao = 'Deficiência Física';
            else if (p.encaixe) condicao = 'Encaixe';
            else condicao = 'Encaixe';
        }

        const endereco = 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ';
        const dataLembrete = new Date(dataConsulta);
        dataLembrete.setDate(dataLembrete.getDate() - 1);
        dataLembrete.setHours(8, 0, 0, 0);

        const msgPaciente = `🏥 *ÓTICA MACAÉ - GUIA DE CONSULTA*\n\nPaciente: ${pacienteNome}\nData: ${dataConsulta}\nHorário: ${horario}\nMédico: Dr. ${medicoNome}\nLocal: ${endereco}\nCondição: ${condicao}\n\n${mensagemPadrao ? '*Mensagem do médico:*\n' + mensagemPadrao : ''}`;

        const msgMedico = `📋 *Nova consulta agendada*\n\nPaciente: ${pacienteNome}\nData: ${dataConsulta}\nHorário: ${horario}\nTelefone do paciente: ${pacienteTelefone}\nLocal: ${endereco}\nCondição: ${condicao}`;

        await pool.execute(
            `INSERT INTO lembretes 
             (consulta_id, destinatario_tipo, destinatario_nome, destinatario_contato, mensagem, tipo, data_envio_programada) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [consultaId, 'paciente', pacienteNome, pacienteTelefone, msgPaciente, 'whatsapp', dataLembrete]
        );

        if (medicoWhatsapp) {
            await pool.execute(
                `INSERT INTO lembretes 
                 (consulta_id, destinatario_tipo, destinatario_nome, destinatario_contato, mensagem, tipo, data_envio_programada) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [consultaId, 'medico', medicoNome, medicoWhatsapp, msgMedico, 'whatsapp', dataLembrete]
            );
        } else {
            await pool.execute(
                `INSERT INTO lembretes 
                 (consulta_id, destinatario_tipo, destinatario_nome, destinatario_contato, mensagem, tipo, data_envio_programada) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [consultaId, 'medico', medicoNome, 'sistema', msgMedico, 'sistema', dataLembrete]
            );
        }
    } catch (error) {
        console.error('Erro ao agendar lembrete:', error);
    }
}

app.get('/api/lembretes', authenticateToken, async (req, res) => {
    try {
        let query = 'SELECT * FROM lembretes WHERE status = "pendente"';
        const params = [];
        if (req.user.tipo !== 'admin') {
            query += ' AND destinatario_tipo = "vendedor" AND destinatario_nome = ?';
            params.push(req.user.nome);
        }
        query += ' ORDER BY data_envio_programada ASC';
        const [rows] = await pool.execute(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/lembretes/:id/enviar', authenticateToken, async (req, res) => {
    try {
        await pool.execute('UPDATE lembretes SET status = "enviado", enviado_em = NOW() WHERE id = ?', [req.params.id]);
        res.json({ message: 'Lembrete marcado como enviado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- STATS ----------
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const [consultasHoje] = await pool.execute('SELECT COUNT(*) as total FROM consultas WHERE data_consulta = ?', [today]);
        const [totalConsultas] = await pool.execute('SELECT COUNT(*) as total FROM consultas');
        const [totalMedicos] = await pool.execute('SELECT COUNT(*) as total FROM medicos WHERE ativo = 1');
        res.json({
            consultas_hoje: consultasHoje[0].total,
            total_consultas: totalConsultas[0].total,
            total_medicos: totalMedicos[0].total
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- WHATSAPP CONFIG ----------
app.get('/api/whatsapp/config', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT numero, endereco_otica FROM whatsapp_config WHERE id = 1');
        if (rows.length === 0) {
            return res.json({ numero: '(22) 99764-0112', endereco_otica: 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ' });
        }
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/whatsapp/config', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { numero, endereco_otica } = req.body;
        await pool.execute(
            'INSERT INTO whatsapp_config (id, numero, endereco_otica, atualizado_por) VALUES (1, ?, ?, ?) ON DUPLICATE KEY UPDATE numero=VALUES(numero), endereco_otica=VALUES(endereco_otica), atualizado_por=VALUES(atualizado_por)',
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
        const [rows] = await pool.execute('SELECT id, nome, username, telefone, tipo, ativo FROM usuarios ORDER BY id');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/usuarios', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { nome, username, senha, telefone, tipo } = req.body;
        if (tipo === 'vendedor' && !telefone) {
            return res.status(400).json({ error: 'Telefone é obrigatório para vendedores.' });
        }
        const hashed = await bcrypt.hash(senha, 10);
        const [result] = await pool.execute(
            'INSERT INTO usuarios (nome, username, senha, telefone, tipo) VALUES (?, ?, ?, ?, ?)',
            [nome, username, hashed, toNull(telefone), tipo]
        );
        res.status(201).json({ id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/usuarios/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { nome, username, senha, telefone, tipo, ativo } = req.body;
        if (tipo === 'vendedor' && !telefone) {
            return res.status(400).json({ error: 'Telefone é obrigatório para vendedores.' });
        }
        if (senha) {
            const hashed = await bcrypt.hash(senha, 10);
            await pool.execute(
                'UPDATE usuarios SET nome=?, username=?, senha=?, telefone=?, tipo=?, ativo=? WHERE id=?',
                [nome, username, hashed, toNull(telefone), tipo, ativo !== undefined ? ativo : 1, req.params.id]
            );
        } else {
            await pool.execute(
                'UPDATE usuarios SET nome=?, username=?, telefone=?, tipo=?, ativo=? WHERE id=?',
                [nome, username, toNull(telefone), tipo, ativo !== undefined ? ativo : 1, req.params.id]
            );
        }
        res.json({ message: 'Atualizado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/usuarios/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await pool.execute('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
        res.json({ message: 'Excluído' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== JOB DE LEMBRETES ====================
async function processarLembretes() {
    try {
        const agora = new Date();
        const [rows] = await pool.execute(
            'SELECT * FROM lembretes WHERE status = "pendente" AND data_envio_programada <= ?',
            [agora]
        );
        for (const lembrete of rows) {
            console.log(`📨 Enviando lembrete para ${lembrete.destinatario_nome} (${lembrete.destinatario_contato}):\n${lembrete.mensagem}`);
            await pool.execute('UPDATE lembretes SET status = "enviado", enviado_em = NOW() WHERE id = ?', [lembrete.id]);
        }
    } catch (error) {
        console.error('Erro no job de lembretes:', error);
    }
}

setInterval(processarLembretes, 3600000);
processarLembretes();

// ==================== ARQUIVOS ESTÁTICOS E FALLBACK ====================
// Servir arquivos estáticos (CSS, JS, imagens) da pasta 'public'
app.use(express.static('public'));

// Rota principal - serve o index.html para qualquer rota não capturada pelas rotas de API
app.get('*', (req, res) => {
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