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
app.use(helmet()); // Protege cabeçalhos HTTP

// CORS restrito (defina a variável FRONTEND_URL no Render)
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate Limiting (evita ataques de força bruta)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // limite de 100 requisições por IP
});
app.use('/api/', limiter);

app.use(express.json());
app.use(express.static('public'));

// ==================== CONEXÃO POSTGRESQL ====================
// TODAS as variáveis DEVEM estar definidas no ambiente (Render ou .env)
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, // SEM fallback inseguro
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
    process.exit(1); // Encerra se não conectar
  });

// ==================== FUNÇÕES AUXILIARES ====================
function toNull(value) {
  return (value === undefined || value === '') ? null : value;
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Acesso negado' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => { // SEM fallback
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
    // ... (todas as outras tabelas permanecem iguais, apenas omiti para não repetir)
    // Certifique-se de incluir todas as tabelas do seu código original.

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
// (Todas as rotas permanecem IGUAIS ao seu código original,
//  apenas removi os fallbacks de senha/JWT e adicionei validação em algumas rotas críticas)

// Exemplo de rota de login com validação
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
        process.env.JWT_SECRET, // SEM fallback
        { expiresIn: '7d' }
      );
      res.json({ token, user: { id: user.id, nome: user.nome, username: user.username, tipo: user.tipo, telefone: user.telefone } });
    } catch (error) {
      console.error('❌ Erro no login:', error);
      res.status(500).json({ error: 'Erro interno: ' + error.message });
    }
  }
);

// Rota de verificação (mantida)
app.get('/api/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// ==================== DEMAIS ROTAS ====================
// Inclua aqui TODAS as outras rotas do seu código original
// (medicos, clientes, consultas, solicitacoes, lembretes, etc.)
// Elas permanecem inalteradas, apenas substitua os fallbacks de JWT_SECRET.

// ==================== MIDDLEWARE DE ERRO GLOBAL ====================
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