require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const path = require('path');

const app = express();

// ==================== SEGURANÇA ====================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:3000'],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
    }
  }
}));

const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

app.use(express.json());
app.use(express.static('public'));

// ==================== CONEXÃO POSTGRESQL ====================
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 10,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

pool.connect()
  .then(client => {
    console.log('✅ Conectado ao PostgreSQL!');
    client.release();
  })
  .catch(err => {
    console.error('❌ Erro ao conectar:', err.message);
    process.exit(1);
  });

// ==================== FUNÇÕES AUXILIARES ====================
function toNull(value) {
  return (value === undefined || value === '') ? null : value;
}

// Formata data para YYYY-MM-DD (sem timezone)
function formatDateToYYYYMMDD(date) {
  if (!date) return null;
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Acesso negado' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS medico_horarios (
        id SERIAL PRIMARY KEY,
        medico_id INTEGER NOT NULL REFERENCES medicos(id) ON DELETE CASCADE,
        dia_semana INTEGER NOT NULL CHECK (dia_semana >= 0 AND dia_semana <= 6),
        hora_inicio TIME NOT NULL,
        hora_fim TIME NOT NULL,
        intervalo INTEGER DEFAULT 30,
        ativo BOOLEAN DEFAULT TRUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela medico_horarios ok');

    // Inserir usuários padrão
    const admin = await pool.query('SELECT id FROM usuarios WHERE username = $1', ['admin']);
    if (admin.rows.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await pool.query(
        'INSERT INTO usuarios (nome, username, senha, tipo, ativo) VALUES ($1, $2, $3, $4, $5)',
        ['Administrador', 'admin', hash, 'admin', true]
      );
      console.log('✅ Usuário admin criado');
    }

    const vendedor = await pool.query('SELECT id FROM usuarios WHERE username = $1', ['vendedor']);
    if (vendedor.rows.length === 0) {
      const hash = await bcrypt.hash('vender123', 10);
      await pool.query(
        'INSERT INTO usuarios (nome, username, senha, tipo, ativo) VALUES ($1, $2, $3, $4, $5)',
        ['Vendedor', 'vendedor', hash, 'vendedor', true]
      );
      console.log('✅ Usuário vendedor criado');
    }

    const config = await pool.query('SELECT id FROM whatsapp_config WHERE id = 1');
    if (config.rows.length === 0) {
      await pool.query(
        'INSERT INTO whatsapp_config (id, numero, endereco_otica) VALUES ($1, $2, $3)',
        [1, '(22) 99764-0112', 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ']
      );
      console.log('✅ Configuração WhatsApp criada');
    }

    console.log('✅ Banco de dados inicializado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error.message);
    console.error(error.stack);
  }
}
initDatabase();

// ==================== ROTAS ====================

// ---------- LOGIN ----------
app.post('/api/login',
  [
    body('username').notEmpty().trim().escape(),
    body('password').notEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Dados inválidos', details: errors.array() });
    }
    try {
      const { username, password } = req.body;
      const result = await pool.query(
        'SELECT id, nome, username, senha, tipo, telefone FROM usuarios WHERE username = $1 AND ativo = true',
        [username]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Usuário ou senha inválidos' });
      }
      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.senha);
      if (!valid) {
        return res.status(401).json({ error: 'Usuário ou senha inválidos' });
      }
      const token = jwt.sign(
        { id: user.id, nome: user.nome, username: user.username, tipo: user.tipo },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      res.json({ token, user: { id: user.id, nome: user.nome, username: user.username, tipo: user.tipo, telefone: user.telefone } });
    } catch (error) {
      console.error('❌ Erro no login:', error);
      res.status(500).json({ error: 'Erro interno: ' + error.message });
    }
  }
);

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
    if (crm) {
      const exist = await pool.query('SELECT id FROM medicos WHERE crm = $1', [crm]);
      if (exist.rows.length > 0) {
        return res.status(400).json({ error: 'CRM já cadastrado.' });
      }
    }
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
    if (crm) {
      const exist = await pool.query('SELECT id FROM medicos WHERE crm = $1 AND id != $2', [crm, req.params.id]);
      if (exist.rows.length > 0) {
        return res.status(400).json({ error: 'CRM já cadastrado.' });
      }
    }
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

// ---------- HORÁRIOS DOS MÉDICOS ----------
app.get('/api/medicos/:id/horarios', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM medico_horarios WHERE medico_id = $1 ORDER BY dia_semana, hora_inicio',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/horarios/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM medico_horarios WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Horário não encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/medicos/:id/horarios', authenticateToken, isAdmin, async (req, res) => {
  try {
    const medicoId = req.params.id;
    const { dia_semana, hora_inicio, hora_fim, intervalo } = req.body;

    const medico = await pool.query('SELECT id FROM medicos WHERE id = $1', [medicoId]);
    if (medico.rows.length === 0) {
      return res.status(404).json({ error: 'Médico não encontrado' });
    }

    const exist = await pool.query(
      'SELECT id FROM medico_horarios WHERE medico_id = $1 AND dia_semana = $2',
      [medicoId, dia_semana]
    );
    if (exist.rows.length > 0) {
      return res.status(400).json({ error: 'Já existe horário configurado para este dia da semana.' });
    }

    const result = await pool.query(
      'INSERT INTO medico_horarios (medico_id, dia_semana, hora_inicio, hora_fim, intervalo) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [medicoId, dia_semana, hora_inicio, hora_fim, intervalo || 30]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/horarios/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { dia_semana, hora_inicio, hora_fim, intervalo, ativo } = req.body;
    const result = await pool.query(
      'UPDATE medico_horarios SET dia_semana=$1, hora_inicio=$2, hora_fim=$3, intervalo=$4, ativo=$5 WHERE id=$6 RETURNING id',
      [dia_semana, hora_inicio, hora_fim, intervalo || 30, ativo !== undefined ? ativo : true, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Horário não encontrado' });
    }
    res.json({ message: 'Horário atualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/horarios/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM medico_horarios WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Horário não encontrado' });
    }
    res.json({ message: 'Horário excluído' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== HORÁRIOS DISPONÍVEIS ====================
app.get('/api/medicos/:id/horarios/disponiveis', authenticateToken, async (req, res) => {
  try {
    const medicoId = req.params.id;
    const { data } = req.query;
    if (!data) {
      return res.status(400).json({ error: 'Data é obrigatória' });
    }

    const diaSemana = new Date(data).getDay();

    const horariosConfig = await pool.query(
      `SELECT hora_inicio, hora_fim, intervalo 
       FROM medico_horarios 
       WHERE medico_id = $1 AND dia_semana = $2 AND ativo = true`,
      [medicoId, diaSemana]
    );

    if (horariosConfig.rows.length === 0) {
      return res.json({ error: 'Médico não possui horários configurados para este dia.' });
    }

    const config = horariosConfig.rows[0];
    const inicio = config.hora_inicio;
    const fim = config.hora_fim;
    const intervalo = config.intervalo || 30;

    const horariosPossiveis = [];
    let current = new Date(`2000-01-01T${inicio}`);
    const end = new Date(`2000-01-01T${fim}`);
    while (current < end) {
      const h = current.getHours().toString().padStart(2, '0');
      const m = current.getMinutes().toString().padStart(2, '0');
      horariosPossiveis.push(`${h}:${m}`);
      current.setMinutes(current.getMinutes() + intervalo);
    }

    const consultasExistentes = await pool.query(
      'SELECT horario FROM consultas WHERE medico_id = $1 AND data_consulta = $2 AND status NOT IN ($3, $4)',
      [medicoId, data, 'cancelada', 'realizada']
    );
    const horariosOcupados = consultasExistentes.rows.map(r => r.horario);

    const horariosDisponiveis = horariosPossiveis.filter(h => !horariosOcupados.includes(h));

    res.json(horariosDisponiveis.map(h => ({ horario: h })));
  } catch (error) {
    console.error('Erro ao buscar horários disponíveis:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------- CLIENTES ----------
app.get('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE ativo = true ORDER BY nome'
    );
    const clientes = result.rows.map(c => ({
      ...c,
      data_nascimento: formatDateToYYYYMMDD(c.data_nascimento)
    }));
    res.json(clientes);
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
    const cliente = result.rows[0];
    cliente.data_nascimento = formatDateToYYYYMMDD(cliente.data_nascimento);
    res.json(cliente);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/clientes', authenticateToken, async (req, res) => {
  try {
    const { nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe } = req.body;
    if (cpf) {
      const exist = await pool.query('SELECT id FROM clientes WHERE cpf = $1', [cpf]);
      if (exist.rows.length > 0) {
        return res.status(400).json({ error: 'CPF já cadastrado.' });
      }
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
      if (exist.rows.length > 0) {
        return res.status(400).json({ error: 'CPF já cadastrado.' });
      }
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
    const consultas = result.rows.map(c => ({
      ...c,
      data_consulta: formatDateToYYYYMMDD(c.data_consulta),
      criado_em: c.criado_em ? new Date(c.criado_em).toISOString() : null
    }));
    res.json(consultas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/consultas', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { paciente_id, paciente_nome, paciente_telefone, paciente_email, paciente_cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, data_consulta, horario, medico_id, medico_nome, observacoes } = req.body;

    const diaSemana = new Date(data_consulta).getDay();
    const horarioConfig = await pool.query(
      'SELECT hora_inicio, hora_fim FROM medico_horarios WHERE medico_id = $1 AND dia_semana = $2 AND ativo = true',
      [medico_id, diaSemana]
    );
    if (horarioConfig.rows.length === 0) {
      return res.status(400).json({ error: 'Médico não atende neste dia da semana.' });
    }
    const config = horarioConfig.rows[0];
    if (horario < config.hora_inicio || horario >= config.hora_fim) {
      return res.status(400).json({ error: 'Horário fora do período de atendimento do médico.' });
    }

    const conflito = await pool.query(
      'SELECT id FROM consultas WHERE data_consulta = $1 AND horario = $2 AND medico_id = $3 AND status NOT IN ($4, $5)',
      [data_consulta, horario, medico_id, 'cancelada', 'realizada']
    );
    if (conflito.rows.length > 0) {
      return res.status(400).json({ error: 'Horário já ocupado para este médico.' });
    }

    let pacienteId = paciente_id;
    if (!pacienteId && paciente_cpf) {
      const existente = await pool.query('SELECT id FROM clientes WHERE cpf = $1', [paciente_cpf]);
      if (existente.rows.length > 0) {
        pacienteId = existente.rows[0].id;
      } else {
        const result = await pool.query(
          `INSERT INTO clientes (nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, criado_por) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [paciente_nome, paciente_telefone, toNull(paciente_email), paciente_cpf, toNull(data_nascimento), neurodivergente ? 1 : 0, deficiencia_fisica ? 1 : 0, encaixe ? 1 : 0, req.user.id]
        );
        pacienteId = result.rows[0].id;
      }
    }

    let nome = paciente_nome, telefone = paciente_telefone, email = paciente_email, cpf = paciente_cpf;
    if (pacienteId) {
      const cliente = await pool.query(
        'SELECT nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE id = $1',
        [pacienteId]
      );
      if (cliente.rows.length > 0) {
        nome = cliente.rows[0].nome;
        telefone = cliente.rows[0].telefone;
        email = cliente.rows[0].email;
        cpf = cliente.rows[0].cpf;
      }
    }

    const result = await pool.query(
      `INSERT INTO consultas (paciente_nome, paciente_telefone, paciente_email, paciente_cpf, data_consulta, horario, medico_id, medico_nome, observacoes, criado_por) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [nome, telefone, toNull(email), toNull(cpf), data_consulta, horario, medico_id, medico_nome, toNull(observacoes), req.user.id]
    );
    const consultaId = result.rows[0].id;
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

    // Verifica se a consulta já está realizada (não pode editar)
    const consultaAtual = await pool.query('SELECT status FROM consultas WHERE id = $1', [req.params.id]);
    if (consultaAtual.rows.length === 0) {
      return res.status(404).json({ error: 'Consulta não encontrada' });
    }
    if (consultaAtual.rows[0].status === 'realizada') {
      return res.status(400).json({ error: 'Consulta já realizada. Não é possível editar.' });
    }
    if (consultaAtual.rows[0].status === 'cancelada') {
      return res.status(400).json({ error: 'Consulta cancelada. Não é possível editar.' });
    }

    const diaSemana = new Date(data_consulta).getDay();
    const horarioConfig = await pool.query(
      'SELECT hora_inicio, hora_fim FROM medico_horarios WHERE medico_id = $1 AND dia_semana = $2 AND ativo = true',
      [medico_id, diaSemana]
    );
    if (horarioConfig.rows.length === 0) {
      return res.status(400).json({ error: 'Médico não atende neste dia da semana.' });
    }
    const config = horarioConfig.rows[0];
    if (horario < config.hora_inicio || horario >= config.hora_fim) {
      return res.status(400).json({ error: 'Horário fora do período de atendimento do médico.' });
    }

    const conflito = await pool.query(
      'SELECT id FROM consultas WHERE data_consulta = $1 AND horario = $2 AND medico_id = $3 AND id != $4 AND status NOT IN ($5, $6)',
      [data_consulta, horario, medico_id, req.params.id, 'cancelada', 'realizada']
    );
    if (conflito.rows.length > 0) {
      return res.status(400).json({ error: 'Horário já ocupado para este médico.' });
    }

    let pacienteId = paciente_id;
    if (!pacienteId && paciente_cpf) {
      const existente = await pool.query('SELECT id FROM clientes WHERE cpf = $1', [paciente_cpf]);
      if (existente.rows.length > 0) {
        pacienteId = existente.rows[0].id;
      } else {
        const result = await pool.query(
          `INSERT INTO clientes (nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, criado_por) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [paciente_nome, paciente_telefone, toNull(paciente_email), paciente_cpf, toNull(data_nascimento), neurodivergente ? 1 : 0, deficiencia_fisica ? 1 : 0, encaixe ? 1 : 0, req.user.id]
        );
        pacienteId = result.rows[0].id;
      }
    }

    let nome = paciente_nome, telefone = paciente_telefone, email = paciente_email, cpf = paciente_cpf;
    if (pacienteId) {
      const cliente = await pool.query(
        'SELECT nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE id = $1',
        [pacienteId]
      );
      if (cliente.rows.length > 0) {
        nome = cliente.rows[0].nome;
        telefone = cliente.rows[0].telefone;
        email = cliente.rows[0].email;
        cpf = cliente.rows[0].cpf;
      }
    }

    await pool.query(
      `UPDATE consultas SET paciente_nome=$1, paciente_telefone=$2, paciente_email=$3, paciente_cpf=$4, data_consulta=$5, horario=$6, medico_id=$7, medico_nome=$8, observacoes=$9, status=$10 WHERE id=$11`,
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
    // Verifica se a consulta já está realizada (não pode excluir)
    const consultaAtual = await pool.query('SELECT status FROM consultas WHERE id = $1', [req.params.id]);
    if (consultaAtual.rows.length === 0) {
      return res.status(404).json({ error: 'Consulta não encontrada' });
    }
    if (consultaAtual.rows[0].status === 'realizada') {
      return res.status(400).json({ error: 'Consulta já realizada. Não é possível excluir.' });
    }
    await pool.query('DELETE FROM consultas WHERE id = $1', [req.params.id]);
    res.json({ message: 'Excluído' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- CONFIRMAR CONSULTA ----------
app.put('/api/consultas/:id/confirmar', authenticateToken, isAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const consulta = await pool.query(
      'SELECT status FROM consultas WHERE id = $1',
      [id]
    );
    if (consulta.rows.length === 0) {
      return res.status(404).json({ error: 'Consulta não encontrada' });
    }
    if (consulta.rows[0].status === 'cancelada') {
      return res.status(400).json({ error: 'Não é possível confirmar uma consulta cancelada.' });
    }
    if (consulta.rows[0].status === 'realizada') {
      return res.status(400).json({ error: 'Consulta já foi realizada.' });
    }
    if (consulta.rows[0].status === 'confirmada') {
      return res.status(400).json({ error: 'Consulta já está confirmada.' });
    }
    await pool.query(
      'UPDATE consultas SET status = $1 WHERE id = $2',
      ['confirmada', id]
    );
    res.json({ message: 'Consulta confirmada com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- PROCESSAR CONSULTA (marcar como realizada) ----------
app.put('/api/consultas/:id/processar', authenticateToken, isAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const consulta = await pool.query(
      'SELECT status FROM consultas WHERE id = $1',
      [id]
    );
    if (consulta.rows.length === 0) {
      return res.status(404).json({ error: 'Consulta não encontrada' });
    }
    if (consulta.rows[0].status === 'cancelada') {
      return res.status(400).json({ error: 'Não é possível processar uma consulta cancelada.' });
    }
    if (consulta.rows[0].status === 'realizada') {
      return res.status(400).json({ error: 'Consulta já foi processada.' });
    }
    await pool.query(
      'UPDATE consultas SET status = $1 WHERE id = $2',
      ['realizada', id]
    );
    res.json({ message: 'Consulta processada (realizada) com sucesso!' });
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
    const solicitacoes = result.rows.map(s => ({
      ...s,
      data_consulta: formatDateToYYYYMMDD(s.data_consulta),
      criado_em: s.criado_em ? new Date(s.criado_em).toISOString() : null
    }));
    res.json(solicitacoes);
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
    const {
      paciente_nome, paciente_telefone, paciente_email, paciente_cpf,
      data_nascimento, neurodivergente, deficiencia_fisica, encaixe,
      data_consulta, horario1, horario2, horario3,
      medico_id, medico_nome, observacoes
    } = req.body;

    const diaSemana = new Date(data_consulta).getDay();
    const horarioConfig = await pool.query(
      'SELECT hora_inicio, hora_fim FROM medico_horarios WHERE medico_id = $1 AND dia_semana = $2 AND ativo = true',
      [medico_id, diaSemana]
    );
    if (horarioConfig.rows.length === 0) {
      return res.status(400).json({ error: 'Médico não atende neste dia da semana.' });
    }
    const config = horarioConfig.rows[0];
    const horariosSugeridos = [horario1, horario2, horario3].filter(h => h);
    for (const hor of horariosSugeridos) {
      if (hor < config.hora_inicio || hor >= config.hora_fim) {
        return res.status(400).json({ error: `Horário ${hor} fora do período de atendimento do médico.` });
      }
    }

    let pacienteId = null;
    if (paciente_cpf) {
      const existente = await pool.query('SELECT id FROM clientes WHERE cpf = $1', [paciente_cpf]);
      if (existente.rows.length > 0) {
        pacienteId = existente.rows[0].id;
      } else {
        const neuro = neurodivergente ? 1 : 0;
        const defFis = deficiencia_fisica ? 1 : 0;
        const enc = encaixe ? 1 : 0;
        const result = await pool.query(
          `INSERT INTO clientes (nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, criado_por) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [paciente_nome, paciente_telefone, toNull(paciente_email), toNull(paciente_cpf), toNull(data_nascimento), neuro, defFis, enc, req.user.id]
        );
        pacienteId = result.rows[0].id;
      }
    }

    for (const hor of horariosSugeridos) {
      const conflito = await pool.query(
        `SELECT id FROM solicitacoes_consultas 
         WHERE data_consulta = $1 AND medico_id = $2 AND status = $3 
         AND (horario_sugerido1 = $4 OR horario_sugerido2 = $5 OR horario_sugerido3 = $6)`,
        [data_consulta, medico_id, 'pendente', hor, hor, hor]
      );
      if (conflito.rows.length > 0) {
        return res.status(400).json({ error: `Horário ${hor} já possui solicitação pendente para este médico.` });
      }
    }

    const result = await pool.query(
      `INSERT INTO solicitacoes_consultas 
       (paciente_nome, paciente_telefone, paciente_email, paciente_cpf, data_consulta, 
        horario_sugerido1, horario_sugerido2, horario_sugerido3, 
        medico_id, medico_nome, observacoes, solicitado_por) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        paciente_nome, paciente_telefone, toNull(paciente_email), toNull(paciente_cpf),
        data_consulta, horario1, toNull(horario2), toNull(horario3),
        medico_id, medico_nome, toNull(observacoes), req.user.id
      ]
    );
    res.status(201).json({ id: result.rows[0].id });
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

    const solic = await pool.query('SELECT * FROM solicitacoes_consultas WHERE id = $1', [req.params.id]);
    if (solic.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }
    const s = solic.rows[0];

    if (status === 'aprovado') {
      if (!horario_escolhido) {
        return res.status(400).json({ error: 'Selecione um horário para aprovar.' });
      }
      const horarios = [s.horario_sugerido1, s.horario_sugerido2, s.horario_sugerido3].filter(h => h);
      if (!horarios.includes(horario_escolhido)) {
        return res.status(400).json({ error: 'Horário escolhido não está entre os sugeridos.' });
      }

      const diaSemana = new Date(s.data_consulta).getDay();
      const horarioConfig = await pool.query(
        'SELECT hora_inicio, hora_fim FROM medico_horarios WHERE medico_id = $1 AND dia_semana = $2 AND ativo = true',
        [s.medico_id, diaSemana]
      );
      if (horarioConfig.rows.length === 0) {
        return res.status(400).json({ error: 'Médico não atende neste dia da semana.' });
      }
      const config = horarioConfig.rows[0];
      if (horario_escolhido < config.hora_inicio || horario_escolhido >= config.hora_fim) {
        return res.status(400).json({ error: 'Horário fora do período de atendimento do médico.' });
      }

      const conflito = await pool.query(
        'SELECT id FROM consultas WHERE data_consulta = $1 AND horario = $2 AND medico_id = $3 AND status NOT IN ($4, $5)',
        [s.data_consulta, horario_escolhido, s.medico_id, 'cancelada', 'realizada']
      );
      if (conflito.rows.length > 0) {
        return res.status(400).json({ error: 'Horário já ocupado para este médico.' });
      }

      const result = await pool.query(
        `INSERT INTO consultas 
         (paciente_nome, paciente_telefone, paciente_email, paciente_cpf, data_consulta, horario, medico_id, medico_nome, observacoes, criado_por) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [s.paciente_nome, s.paciente_telefone, s.paciente_email, s.paciente_cpf, s.data_consulta, horario_escolhido, s.medico_id, s.medico_nome, s.observacoes, s.solicitado_por]
      );
      const consultaId = result.rows[0].id;
      await agendarLembrete(consultaId, s.paciente_nome, s.paciente_telefone, s.data_consulta, horario_escolhido, s.medico_nome, s.medico_id, s.solicitado_por);
      await pool.query('UPDATE solicitacoes_consultas SET horario_escolhido = $1 WHERE id = $2', [horario_escolhido, req.params.id]);
    }

    await pool.query('UPDATE solicitacoes_consultas SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ message: `Solicitação ${status} com sucesso` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- LEMBRETES ----------
async function agendarLembrete(consultaId, pacienteNome, pacienteTelefone, dataConsulta, horario, medicoNome, medicoId, vendedorId) {
  try {
    const medico = await pool.query('SELECT whatsapp, mensagem_padrao FROM medicos WHERE id = $1', [medicoId]);
    const medicoWhatsapp = medico.rows.length ? medico.rows[0].whatsapp : null;
    const mensagemPadrao = medico.rows.length ? medico.rows[0].mensagem_padrao : '';

    const paciente = await pool.query(
      'SELECT neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE nome = $1 AND telefone = $2',
      [pacienteNome, pacienteTelefone]
    );
    let condicao = 'Encaixe';
    if (paciente.rows.length) {
      const p = paciente.rows[0];
      if (p.neurodivergente && p.deficiencia_fisica) condicao = 'Neurodivergente e Def. Física';
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
    const msgMedico = `📋 *Nova consulta agendada*\n\nPaciente: ${pacienteNome}\nData: ${dataConsulta}\nHorário: ${horario}\nTelefone: ${pacienteTelefone}\nLocal: ${endereco}\nCondição: ${condicao}`;

    await pool.query(
      `INSERT INTO lembretes (consulta_id, destinatario_tipo, destinatario_nome, destinatario_contato, mensagem, tipo, data_envio_programada) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [consultaId, 'paciente', pacienteNome, pacienteTelefone, msgPaciente, 'whatsapp', dataLembrete]
    );

    if (medicoWhatsapp) {
      await pool.query(
        `INSERT INTO lembretes (consulta_id, destinatario_tipo, destinatario_nome, destinatario_contato, mensagem, tipo, data_envio_programada) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [consultaId, 'medico', medicoNome, medicoWhatsapp, msgMedico, 'whatsapp', dataLembrete]
      );
    } else {
      await pool.query(
        `INSERT INTO lembretes (consulta_id, destinatario_tipo, destinatario_nome, destinatario_contato, mensagem, tipo, data_envio_programada) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [consultaId, 'medico', medicoNome, 'sistema', msgMedico, 'sistema', dataLembrete]
      );
    }
    console.log('✅ Lembrete agendado para:', pacienteNome);
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

// ---------- DASHBOARD ----------
app.get('/api/dashboard', authenticateToken, isAdmin, async (req, res) => {
  try {
    // Total de consultas por status
    const statusResult = await pool.query(`
      SELECT status, COUNT(*) as total 
      FROM consultas 
      GROUP BY status
    `);
    const statusCounts = {};
    statusResult.rows.forEach(row => {
      statusCounts[row.status || 'agendada'] = parseInt(row.total);
    });

    // Consultas por vendedor
    const vendedoresResult = await pool.query(`
      SELECT 
        u.id as vendedor_id,
        u.nome as vendedor_nome,
        COUNT(c.id) as total,
        COUNT(CASE WHEN c.status = 'agendada' THEN 1 END) as agendadas,
        COUNT(CASE WHEN c.status = 'confirmada' THEN 1 END) as confirmadas,
        COUNT(CASE WHEN c.status = 'cancelada' THEN 1 END) as canceladas,
        COUNT(CASE WHEN c.status = 'realizada' THEN 1 END) as realizadas
      FROM usuarios u
      LEFT JOIN consultas c ON c.criado_por = u.id
      WHERE u.tipo IN ('vendedor', 'admin')
      GROUP BY u.id, u.nome
      ORDER BY u.nome
    `);
    const vendedores = vendedoresResult.rows.map(v => ({
      ...v,
      total: parseInt(v.total),
      agendadas: parseInt(v.agendadas || 0),
      confirmadas: parseInt(v.confirmadas || 0),
      canceladas: parseInt(v.canceladas || 0),
      realizadas: parseInt(v.realizadas || 0)
    }));

    // Totais gerais
    const totalConsultas = await pool.query('SELECT COUNT(*) as total FROM consultas');
    const totalMedicos = await pool.query('SELECT COUNT(*) as total FROM medicos WHERE ativo = true');

    res.json({
      total_consultas: parseInt(totalConsultas.rows[0].total),
      total_medicos: parseInt(totalMedicos.rows[0].total),
      por_status: statusCounts,
      por_vendedor: vendedores
    });
  } catch (error) {
    console.error('Erro no dashboard:', error);
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

// ==================== MIDDLEWARE DE ERRO ====================
app.use((err, req, res, next) => {
  console.error('❌ Erro não tratado:', err.stack);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

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
});