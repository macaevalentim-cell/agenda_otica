const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

console.log('🔍 Configuração do banco:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '*****' : '(vazio)');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'agenda_medica_vision',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ==================== INICIALIZAÇÃO DO BANCO ====================
async function initDatabase() {
  let connection;
  try {
    console.log('📦 Inicializando banco de dados (MySQL)...');
    connection = await pool.getConnection();
    console.log('✅ Conectado ao MySQL com sucesso!');

    // ----- LOJAS -----
    await connection.query(`
      CREATE TABLE IF NOT EXISTS lojas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(200) NOT NULL,
        endereco TEXT,
        ativo BOOLEAN DEFAULT TRUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ----- USUARIOS (com loja_id) -----
    await connection.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        senha VARCHAR(255) NOT NULL,
        telefone VARCHAR(20),
        tipo VARCHAR(10) DEFAULT 'vendedor' CHECK (tipo IN ('admin', 'vendedor')),
        loja_id INT,
        ativo BOOLEAN DEFAULT TRUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (loja_id) REFERENCES lojas(id) ON DELETE SET NULL
      )
    `);

    // Verifica se a coluna loja_id existe (migração)
    const [columns] = await connection.query('SHOW COLUMNS FROM usuarios LIKE ?', ['loja_id']);
    if (columns.length === 0) {
      console.log('🔧 Coluna loja_id não encontrada. Adicionando...');
      await connection.query('ALTER TABLE usuarios ADD COLUMN loja_id INT NULL');
      await connection.query('ALTER TABLE usuarios ADD FOREIGN KEY (loja_id) REFERENCES lojas(id) ON DELETE SET NULL');
      console.log('✅ Coluna loja_id adicionada!');
    }

    // ----- MEDICOS -----
    await connection.query(`
      CREATE TABLE IF NOT EXISTS medicos (
        id INT AUTO_INCREMENT PRIMARY KEY,
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

    // ----- CLIENTES -----
    await connection.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id INT AUTO_INCREMENT PRIMARY KEY,
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
        FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL
      )
    `);

    // ----- CONSULTAS (com numero_pedido) -----
    await connection.query(`
      CREATE TABLE IF NOT EXISTS consultas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        paciente_nome VARCHAR(200) NOT NULL,
        paciente_telefone VARCHAR(20) NOT NULL,
        paciente_email VARCHAR(100),
        paciente_cpf VARCHAR(14),
        data_consulta DATE NOT NULL,
        horario VARCHAR(5) NOT NULL,
        medico_id INT NOT NULL,
        medico_nome VARCHAR(100) NOT NULL,
        observacoes TEXT,
        numero_pedido VARCHAR(50),
        status VARCHAR(20) DEFAULT 'agendada' CHECK (status IN ('agendada', 'confirmada', 'cancelada', 'realizada')),
        criado_por INT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (medico_id) REFERENCES medicos(id),
        FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL
      )
    `);

    // Verifica se a coluna numero_pedido existe em consultas
    const [colConsultas] = await connection.query('SHOW COLUMNS FROM consultas LIKE ?', ['numero_pedido']);
    if (colConsultas.length === 0) {
      console.log('🔧 Coluna numero_pedido não encontrada em consultas. Adicionando...');
      await connection.query('ALTER TABLE consultas ADD COLUMN numero_pedido VARCHAR(50)');
      console.log('✅ Coluna numero_pedido adicionada em consultas!');
    }

    // ----- SOLICITACOES (com numero_pedido) -----
    await connection.query(`
      CREATE TABLE IF NOT EXISTS solicitacoes_consultas (
        id INT AUTO_INCREMENT PRIMARY KEY,
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
        numero_pedido VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
        solicitado_por INT NOT NULL,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (medico_id) REFERENCES medicos(id),
        FOREIGN KEY (solicitado_por) REFERENCES usuarios(id)
      )
    `);

    // Verifica se a coluna numero_pedido existe em solicitacoes_consultas
    const [colSolic] = await connection.query('SHOW COLUMNS FROM solicitacoes_consultas LIKE ?', ['numero_pedido']);
    if (colSolic.length === 0) {
      console.log('🔧 Coluna numero_pedido não encontrada em solicitacoes_consultas. Adicionando...');
      await connection.query('ALTER TABLE solicitacoes_consultas ADD COLUMN numero_pedido VARCHAR(50)');
      console.log('✅ Coluna numero_pedido adicionada em solicitacoes_consultas!');
    }

    // ----- MEDICO_HORARIOS (com intervalo_minutos) -----
    await connection.query(`
      CREATE TABLE IF NOT EXISTS medico_horarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        medico_id INT NOT NULL,
        dia_semana INT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
        hora_inicio TIME NOT NULL,
        hora_fim TIME NOT NULL,
        intervalo_minutos INT DEFAULT 30,
        ativo BOOLEAN DEFAULT TRUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (medico_id) REFERENCES medicos(id) ON DELETE CASCADE
      )
    `);

    // Verifica se a coluna intervalo_minutos existe (se for intervalo, renomear)
    const [colIntervalo] = await connection.query('SHOW COLUMNS FROM medico_horarios LIKE ?', ['intervalo']);
    if (colIntervalo.length > 0) {
      console.log('🔧 Renomeando coluna "intervalo" para "intervalo_minutos"...');
      await connection.query('ALTER TABLE medico_horarios CHANGE COLUMN intervalo intervalo_minutos INT DEFAULT 30');
      console.log('✅ Coluna renomeada!');
    }

    // ----- LEMBRETES -----
    await connection.query(`
      CREATE TABLE IF NOT EXISTS lembretes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        consulta_id INT NOT NULL,
        destinatario_tipo VARCHAR(20) NOT NULL CHECK (destinatario_tipo IN ('paciente', 'vendedor', 'medico')),
        destinatario_nome VARCHAR(200) NOT NULL,
        destinatario_contato VARCHAR(100) NOT NULL,
        mensagem TEXT NOT NULL,
        tipo VARCHAR(20) DEFAULT 'whatsapp',
        status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'falha')),
        data_envio_programada TIMESTAMP NOT NULL,
        enviado_em TIMESTAMP,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (consulta_id) REFERENCES consultas(id) ON DELETE CASCADE
      )
    `);

    // ----- WHATSAPP_CONFIG -----
    await connection.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_config (
        id INT PRIMARY KEY DEFAULT 1,
        numero VARCHAR(20) DEFAULT '(22) 99764-0112',
        endereco_otica TEXT,
        atualizado_por INT,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (atualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
      )
    `);

    // ===== ÍNDICES =====
    await connection.query(`CREATE INDEX idx_consultas_data ON consultas(data_consulta)`).catch(() => {});
    await connection.query(`CREATE INDEX idx_consultas_medico ON consultas(medico_id)`).catch(() => {});
    await connection.query(`CREATE INDEX idx_consultas_status ON consultas(status)`).catch(() => {});
    await connection.query(`CREATE INDEX idx_consultas_criado_por ON consultas(criado_por)`).catch(() => {});
    await connection.query(`CREATE INDEX idx_clientes_cpf ON clientes(cpf)`).catch(() => {});
    await connection.query(`CREATE INDEX idx_horarios_medico ON medico_horarios(medico_id)`).catch(() => {});
    await connection.query(`CREATE INDEX idx_solicitacoes_status ON solicitacoes_consultas(status)`).catch(() => {});
    await connection.query(`CREATE INDEX idx_lembretes_status ON lembretes(status)`).catch(() => {});

    // ===== DADOS INICIAIS =====
    // Loja padrão
    const [lojaExist] = await connection.query('SELECT id FROM lojas WHERE nome = ?', ['Ótica Macaé - Matriz']);
    let lojaId;
    if (lojaExist.length === 0) {
      const [result] = await connection.query(
        'INSERT INTO lojas (nome, endereco) VALUES (?, ?)',
        ['Ótica Macaé - Matriz', 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ']
      );
      lojaId = result.insertId;
      console.log('✅ Loja padrão criada');
    } else {
      lojaId = lojaExist[0].id;
    }

    // Admin
    const [adminExist] = await connection.query('SELECT id FROM usuarios WHERE username = ?', ['admin']);
    if (adminExist.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await connection.query(
        'INSERT INTO usuarios (nome, username, senha, tipo, loja_id, ativo) VALUES (?, ?, ?, ?, ?, ?)',
        ['Administrador', 'admin', hash, 'admin', lojaId, true]
      );
      console.log('✅ Usuário admin criado');
    }

    // Vendedor
    const [vendedorExist] = await connection.query('SELECT id FROM usuarios WHERE username = ?', ['vendedor']);
    if (vendedorExist.length === 0) {
      const hash = await bcrypt.hash('vender123', 10);
      await connection.query(
        'INSERT INTO usuarios (nome, username, senha, tipo, loja_id, ativo) VALUES (?, ?, ?, ?, ?, ?)',
        ['Vendedor', 'vendedor', hash, 'vendedor', lojaId, true]
      );
      console.log('✅ Usuário vendedor criado');
    }

    // Config WhatsApp
    const [configExist] = await connection.query('SELECT id FROM whatsapp_config WHERE id = 1');
    if (configExist.length === 0) {
      await connection.query(
        'INSERT INTO whatsapp_config (id, numero, endereco_otica) VALUES (?, ?, ?)',
        [1, '(22) 99764-0112', 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ']
      );
      console.log('✅ Configuração WhatsApp criada');
    }

    connection.release();
    console.log('✅ Banco de dados (MySQL) inicializado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error.message);
    if (connection) connection.release();
    throw error;
  }
}

module.exports = { pool, initDatabase };