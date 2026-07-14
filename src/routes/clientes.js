const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { toNull, formatDateToYYYYMMDD } = require('../utils/helpers');
const router = express.Router();

// =========================================================================
// LISTAR CLIENTES (com busca por nome, telefone ou CPF)
// =========================================================================
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search } = req.query;
    let query = `
      SELECT id, nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe 
      FROM clientes 
      WHERE ativo = true
    `;
    const params = [];
    if (search && search.trim() !== '') {
      query += ` AND (nome ILIKE $1 OR telefone ILIKE $1 OR cpf ILIKE $1)`;
      params.push(`%${search.trim()}%`);
    }
    query += ` ORDER BY nome`;
    const result = await pool.query(query, params);
    res.json(result.rows.map(c => ({ ...c, data_nascimento: formatDateToYYYYMMDD(c.data_nascimento) })));
  } catch (error) {
    console.error('❌ Erro ao listar clientes:', error);
    res.status(500).json({ error: 'Erro interno ao listar clientes' });
  }
});

// =========================================================================
// BUSCAR CLIENTE POR CPF
// =========================================================================
router.get('/buscar', authenticateToken, async (req, res) => {
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
    console.error('❌ Erro ao buscar cliente por CPF:', error);
    res.status(500).json({ error: 'Erro interno ao buscar cliente por CPF' });
  }
});

// =========================================================================
// CRIAR CLIENTE
// =========================================================================
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe } = req.body;
    if (!nome || !telefone) return res.status(400).json({ error: 'Nome e telefone são obrigatórios.' });
    if (!data_nascimento) return res.status(400).json({ error: 'Data de nascimento é obrigatória.' });

    if (cpf) {
      const existente = await pool.query('SELECT id FROM clientes WHERE cpf = $1', [cpf]);
      if (existente.rows.length > 0) {
        return res.status(400).json({ error: 'CPF já cadastrado.' });
      }
    }

    const result = await pool.query(
      `INSERT INTO clientes (nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [nome, telefone, toNull(email), toNull(cpf), data_nascimento,
       neurodivergente ? 1 : 0, deficiencia_fisica ? 1 : 0, encaixe ? 1 : 0, req.user.id]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    console.error('❌ Erro ao criar cliente:', error);
    res.status(500).json({ error: 'Erro interno ao criar cliente' });
  }
});

// =========================================================================
// ATUALIZAR CLIENTE (e também atualiza consultas vinculadas)
// =========================================================================
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe } = req.body;
    if (cpf) {
      const existente = await pool.query('SELECT id FROM clientes WHERE cpf = $1 AND id != $2', [cpf, req.params.id]);
      if (existente.rows.length > 0) {
        return res.status(400).json({ error: 'CPF já cadastrado para outro cliente.' });
      }
    }

    // Atualiza cliente
    await pool.query(
      `UPDATE clientes SET nome=$1, telefone=$2, email=$3, cpf=$4, data_nascimento=$5, neurodivergente=$6, deficiencia_fisica=$7, encaixe=$8 WHERE id=$9`,
      [nome, telefone, toNull(email), toNull(cpf), data_nascimento,
       neurodivergente ? 1 : 0, deficiencia_fisica ? 1 : 0, encaixe ? 1 : 0, req.params.id]
    );

    // ===== NOVO: Atualiza as consultas vinculadas a este paciente =====
    await pool.query(
      `UPDATE consultas 
       SET paciente_nome = $1, paciente_telefone = $2, paciente_email = $3, paciente_cpf = $4
       WHERE paciente_id = $5 AND status NOT IN ($6, $7)`,
      [nome, telefone, toNull(email), toNull(cpf), req.params.id, 'realizada', 'cancelada']
    );

    res.json({ message: 'Cliente e consultas vinculadas atualizados!' });
  } catch (error) {
    console.error('❌ Erro ao atualizar cliente:', error);
    res.status(500).json({ error: 'Erro interno ao atualizar cliente' });
  }
});

// =========================================================================
// EXCLUIR CLIENTE
// =========================================================================
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE clientes SET ativo = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Excluído' });
  } catch (error) {
    console.error('❌ Erro ao excluir cliente:', error);
    res.status(500).json({ error: 'Erro interno ao excluir cliente' });
  }
});

module.exports = router;