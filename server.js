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
app.use(helmet());
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
// (mantido igual ao original)

// ---------- CONSULTAS ----------
// (mantido igual ao original)

// ---------- SOLICITAÇÕES ----------
// (mantido igual ao original)

// ---------- LEMBRETES ----------
// (mantido igual ao original)

// ---------- USUÁRIOS ----------
// (mantido igual ao original)

// ---------- WHATSAPP CONFIG ----------
// (mantido igual ao original)

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