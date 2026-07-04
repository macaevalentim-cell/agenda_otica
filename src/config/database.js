const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Configuração do pool
let poolConfig;
if (process.env.DATABASE_URL) {
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  };
} else {
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'agenda_medica',
    max: 10,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  };
}

const pool = new Pool(poolConfig);

// Função para adicionar colunas se não existirem
async function ensureColumn(table, column, definition) {
  try {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
      [table, column]
    );
    if (result.rows.length === 0) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`✅ Coluna ${column} adicionada à tabela ${table}`);
    }
  } catch (err) {
    console.error(`❌ Erro ao verificar/adicionar coluna ${column} na tabela ${table}:`, err.message);
  }
}

async function initDatabase() {
  try {
    console.log('📦 Inicializando banco de dados...');

    // ===== Tabela empresas =====
    await pool.query(`
      CREATE TABLE IF NOT EXISTS empresas (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(200) NOT NULL,
        endereco TEXT,
        telefone VARCHAR(20),
        email VARCHAR(100),
        cnpj VARCHAR(18),
        ativo BOOLEAN DEFAULT TRUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Garantir colunas (caso a tabela já exista sem elas)
    await ensureColumn('empresas', 'endereco', 'TEXT');
    await ensureColumn('empresas', 'email', 'VARCHAR(100)');
    await ensureColumn('empresas', 'cnpj', 'VARCHAR(18)');
    await ensureColumn('empresas', 'ativo', 'BOOLEAN DEFAULT TRUE');
    await ensureColumn('empresas', 'criado_em', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    console.log('✅ Tabela empresas ok');

    // ===== Tabela usuarios =====
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        senha VARCHAR(255) NOT NULL,
        telefone VARCHAR(20),
        tipo VARCHAR(10) DEFAULT 'vendedor' CHECK (tipo IN ('admin', 'vendedor')),
        empresa_id INTEGER REFERENCES empresas(id),
        ativo BOOLEAN DEFAULT TRUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Garantir colunas
    await ensureColumn('usuarios', 'telefone', 'VARCHAR(20)');
    await ensureColumn('usuarios', 'tipo', 'VARCHAR(10) DEFAULT \'vendedor\' CHECK (tipo IN (\'admin\', \'vendedor\'))');
    await ensureColumn('usuarios', 'empresa_id', 'INTEGER REFERENCES empresas(id)');
    await ensureColumn('usuarios', 'ativo', 'BOOLEAN DEFAULT TRUE');
    await ensureColumn('usuarios', 'criado_em', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    console.log('✅ Tabela usuarios ok');

    // ===== Tabela medicos =====
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
    console.log('✅ Tabela medicos ok');

    // ===== Tabela clientes =====
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
    console.log('✅ Tabela clientes ok');

    // ===== Tabela consultas =====
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
        numero_pedido VARCHAR(50),
        status VARCHAR(20) DEFAULT 'agendada' CHECK (status IN ('agendada', 'confirmada', 'cancelada', 'realizada')),
        criado_por INTEGER REFERENCES usuarios(id),
        empresa_id INTEGER REFERENCES empresas(id),
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await ensureColumn('consultas', 'numero_pedido', 'VARCHAR(50)');
    await ensureColumn('consultas', 'empresa_id', 'INTEGER REFERENCES empresas(id)');
    console.log('✅ Tabela consultas ok');

    // ===== Tabela solicitacoes_consultas =====
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
        numero_pedido VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
        solicitado_por INTEGER NOT NULL REFERENCES usuarios(id),
        empresa_id INTEGER REFERENCES empresas(id),
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await ensureColumn('solicitacoes_consultas', 'numero_pedido', 'VARCHAR(50)');
    await ensureColumn('solicitacoes_consultas', 'empresa_id', 'INTEGER REFERENCES empresas(id)');
    console.log('✅ Tabela solicitacoes_consultas ok');

    // ===== Tabela medico_horarios =====
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

    // ===== Tabela lembretes =====
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
    console.log('✅ Tabela lembretes ok');

    // ===== Tabela whatsapp_config =====
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        numero VARCHAR(20) DEFAULT '(22) 99764-0112',
        endereco_otica TEXT,
        atualizado_por INTEGER REFERENCES usuarios(id),
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela whatsapp_config ok');

    // ===== Índices para performance =====
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_consultas_data ON consultas(data_consulta)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_consultas_medico ON consultas(medico_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_consultas_status ON consultas(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_consultas_criado_por ON consultas(criado_por)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_consultas_empresa ON consultas(empresa_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes(cpf)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_horarios_medico ON medico_horarios(medico_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON solicitacoes_consultas(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_lembretes_status ON lembretes(status)`);
    console.log('✅ Índices criados');

    // ===== Dados iniciais =====
    // Empresa padrão
    const empresaExist = await pool.query('SELECT id FROM empresas WHERE nome = $1', ['Ótica Macaé']);
    let empresaId;
    if (empresaExist.rows.length === 0) {
      const result = await pool.query(
        'INSERT INTO empresas (nome, endereco, telefone) VALUES ($1, $2, $3) RETURNING id',
        ['Ótica Macaé', 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ', '(22) 99764-0112']
      );
      empresaId = result.rows[0].id;
      console.log('✅ Empresa padrão criada');
    } else {
      empresaId = empresaExist.rows[0].id;
    }

    // Usuário admin
    const admin = await pool.query('SELECT id FROM usuarios WHERE username = $1', ['admin']);
    if (admin.rows.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await pool.query(
        'INSERT INTO usuarios (nome, username, senha, tipo, empresa_id, ativo) VALUES ($1, $2, $3, $4, $5, $6)',
        ['Administrador', 'admin', hash, 'admin', empresaId, true]
      );
      console.log('✅ Usuário admin criado');
    }

    // Usuário vendedor
    const vendedor = await pool.query('SELECT id FROM usuarios WHERE username = $1', ['vendedor']);
    if (vendedor.rows.length === 0) {
      const hash = await bcrypt.hash('vender123', 10);
      await pool.query(
        'INSERT INTO usuarios (nome, username, senha, tipo, empresa_id, ativo) VALUES ($1, $2, $3, $4, $5, $6)',
        ['Vendedor', 'vendedor', hash, 'vendedor', empresaId, true]
      );
      console.log('✅ Usuário vendedor criado');
    }

    // Configuração WhatsApp
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
    throw error; // para que o processo possa tratá-lo
  }
}

module.exports = { pool, initDatabase };