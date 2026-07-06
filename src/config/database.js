const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Configuração do pool
let poolConfig;
if (process.env.DATABASE_URL) {
  // Render fornece uma URL completa com SSL
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  };
} else {
  // Fallback para desenvolvimento local (MySQL não é usado)
  // Se quiser manter MySQL local, use mysql2 – mas aqui assumimos PostgreSQL
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

// ==================== INICIALIZAÇÃO DO BANCO ====================
async function initDatabase() {
  try {
    console.log('📦 Inicializando banco de dados (PostgreSQL)...');
    
    // Tabela lojas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lojas (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(200) NOT NULL,
        endereco TEXT,
        ativo BOOLEAN DEFAULT TRUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela usuarios (com loja_id)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        senha VARCHAR(255) NOT NULL,
        telefone VARCHAR(20),
        tipo VARCHAR(10) DEFAULT 'vendedor' CHECK (tipo IN ('admin', 'vendedor')),
        loja_id INTEGER REFERENCES lojas(id) ON DELETE SET NULL,
        ativo BOOLEAN DEFAULT TRUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela medicos
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

    // Tabela clientes
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
        criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela consultas
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
        criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela solicitacoes_consultas
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
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela medico_horarios
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medico_horarios (
        id SERIAL PRIMARY KEY,
        medico_id INTEGER NOT NULL REFERENCES medicos(id) ON DELETE CASCADE,
        dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
        hora_inicio TIME NOT NULL,
        hora_fim TIME NOT NULL,
        intervalo_minutos INTEGER DEFAULT 30,
        ativo BOOLEAN DEFAULT TRUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela lembretes
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

    // Tabela whatsapp_config
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        numero VARCHAR(20) DEFAULT '(22) 99764-0112',
        endereco_otica TEXT,
        atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Índices (PostgreSQL suporta IF NOT EXISTS)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_consultas_data ON consultas(data_consulta)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_consultas_medico ON consultas(medico_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_consultas_status ON consultas(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_consultas_criado_por ON consultas(criado_por)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes(cpf)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_horarios_medico ON medico_horarios(medico_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON solicitacoes_consultas(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_lembretes_status ON lembretes(status)`);

    // Dados iniciais
    const lojaExist = await pool.query('SELECT id FROM lojas WHERE nome = $1', ['Ótica Macaé - Matriz']);
    let lojaId;
    if (lojaExist.rows.length === 0) {
      const result = await pool.query(
        'INSERT INTO lojas (nome, endereco) VALUES ($1, $2) RETURNING id',
        ['Ótica Macaé - Matriz', 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ']
      );
      lojaId = result.rows[0].id;
      console.log('✅ Loja padrão criada');
    } else {
      lojaId = lojaExist.rows[0].id;
    }

    // Usuário admin
    const adminExist = await pool.query('SELECT id FROM usuarios WHERE username = $1', ['admin']);
    if (adminExist.rows.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await pool.query(
        'INSERT INTO usuarios (nome, username, senha, tipo, loja_id, ativo) VALUES ($1, $2, $3, $4, $5, $6)',
        ['Administrador', 'admin', hash, 'admin', lojaId, true]
      );
      console.log('✅ Usuário admin criado');
    }

    // Usuário vendedor
    const vendedorExist = await pool.query('SELECT id FROM usuarios WHERE username = $1', ['vendedor']);
    if (vendedorExist.rows.length === 0) {
      const hash = await bcrypt.hash('vender123', 10);
      await pool.query(
        'INSERT INTO usuarios (nome, username, senha, tipo, loja_id, ativo) VALUES ($1, $2, $3, $4, $5, $6)',
        ['Vendedor', 'vendedor', hash, 'vendedor', lojaId, true]
      );
      console.log('✅ Usuário vendedor criado');
    }

    // Configuração WhatsApp
    const configExist = await pool.query('SELECT id FROM whatsapp_config WHERE id = 1');
    if (configExist.rows.length === 0) {
      await pool.query(
        'INSERT INTO whatsapp_config (id, numero, endereco_otica) VALUES ($1, $2, $3)',
        [1, '(22) 99764-0112', 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ']
      );
      console.log('✅ Configuração WhatsApp criada');
    }

    console.log('✅ Banco de dados (PostgreSQL) inicializado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error.message);
    throw error;
  }
}

module.exports = { pool, initDatabase };