-- Criar banco de dados (execute separadamente se necessário)
-- CREATE DATABASE agenda_medica_vision;

-- Conectar ao banco
-- \c agenda_medica_vision;

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    senha VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    tipo VARCHAR(10) DEFAULT 'vendedor' CHECK (tipo IN ('admin', 'vendedor')),
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de médicos
CREATE TABLE IF NOT EXISTS medicos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    crm VARCHAR(20) UNIQUE NOT NULL,
    telefone VARCHAR(20),
    email VARCHAR(100),
    especialidade VARCHAR(100),
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de clientes
CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(200) NOT NULL,
    telefone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    cpf VARCHAR(14),
    ativo BOOLEAN DEFAULT TRUE,
    criado_por INTEGER REFERENCES usuarios(id),
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de consultas
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
);

-- Tabela de configurações do WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    numero VARCHAR(20) DEFAULT '(22) 99764-0112',
    endereco_otica TEXT DEFAULT 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ',
    atualizado_por INTEGER REFERENCES usuarios(id),
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inserir usuários padrão (senha: admin123 e vender123)
-- As senhas são bcrypt hashes (mesmos do MySQL)
INSERT INTO usuarios (nome, username, senha, tipo, ativo) VALUES 
('Administrador', 'admin', '$2a$10$tLqU5qJ5qJ5qJ5qJ5qJ5qO', 'admin', TRUE),
('Vendedor', 'vendedor', '$2a$10$tLqU5qJ5qJ5qJ5qJ5qJ5qO', 'vendedor', TRUE)
ON CONFLICT (username) DO NOTHING;

-- Inserir configuração padrão do WhatsApp
INSERT INTO whatsapp_config (id, numero, endereco_otica) VALUES 
(1, '(22) 99764-0112', 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ')
ON CONFLICT (id) DO NOTHING;