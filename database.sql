-- Criar banco de dados
CREATE DATABASE IF NOT EXISTS agenda_medica_vision;
USE agenda_medica_vision;

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS usuarios (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nome VARCHAR(100) NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    senha VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    tipo ENUM('admin', 'vendedor') DEFAULT 'vendedor',
    ativo BOOLEAN DEFAULT TRUE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de médicos
CREATE TABLE IF NOT EXISTS medicos (
    id INT PRIMARY KEY AUTO_INCREMENT,
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
    id INT PRIMARY KEY AUTO_INCREMENT,
    nome VARCHAR(200) NOT NULL,
    telefone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    cpf VARCHAR(14),
    ativo BOOLEAN DEFAULT TRUE,
    criado_por INT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (criado_por) REFERENCES usuarios(id)
);

-- Tabela de consultas
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
);

-- Tabela de configurações do WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_config (
    id INT PRIMARY KEY DEFAULT 1,
    numero VARCHAR(20) DEFAULT '(22) 99764-0112',
    endereco_otica TEXT DEFAULT 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ',
    atualizado_por INT,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (atualizado_por) REFERENCES usuarios(id)
);

-- Inserir usuários padrão (senha: admin123 e vender123)
INSERT INTO usuarios (nome, username, senha, tipo, ativo) VALUES 
('Administrador', 'admin', '$2a$10$tLqU5qJ5qJ5qJ5qJ5qJ5qO', 'admin', 1),
('Vendedor', 'vendedor', '$2a$10$tLqU5qJ5qJ5qJ5qJ5qJ5qO', 'vendedor', 1);

-- Inserir configuração padrão do WhatsApp
INSERT INTO whatsapp_config (id, numero, endereco_otica) VALUES 
(1, '(22) 99764-0112', 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ');