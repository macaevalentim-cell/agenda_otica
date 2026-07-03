const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { toNull, formatDateToYYYYMMDD } = require('../utils/helpers');
const { validate, pacienteValidation } = require('../middleware/validation');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE ativo = true ORDER BY nome'
    );
    res.json(result.rows.map(c => ({ ...c, data_nascimento: formatDateToYYYYMMDD(c.data_nascimento) })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, validate(pacienteValidation), async (req, res) => {
  try {
    const { nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe } = req.body;
    if (cpf) {
      const exist = await pool.query('SELECT id FROM clientes WHERE cpf = $1', [cpf]);
      if (exist.rows.length > 0) return res.status(400).json({ error: 'CPF já cadastrado.' });
    }
    const result = await pool.query(
      `INSERT INTO clientes (nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, criado_por) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [nome, telefone, toNull(email), toNull(cpf), toNull(data_nascimento), neurodivergente?1:0, deficiencia_fisica?1:0, encaixe?1:0, req.user.id]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticateToken, validate(pacienteValidation), async (req, res) => {
  try {
    const { nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe } = req.body;
    if (cpf) {
      const exist = await pool.query('SELECT id FROM clientes WHERE cpf = $1 AND id != $2', [cpf, req.params.id]);
      if (exist.rows.length > 0) return res.status(400).json({ error: 'CPF já cadastrado.' });
    }
    await pool.query(
      `UPDATE clientes SET nome=$1, telefone=$2, email=$3, cpf=$4, data_nascimento=$5, neurodivergente=$6, deficiencia_fisica=$7, encaixe=$8 WHERE id=$9`,
      [nome, telefone, toNull(email), toNull(cpf), toNull(data_nascimento), neurodivergente?1:0, deficiencia_fisica?1:0, encaixe?1:0, req.params.id]
    );
    res.json({ message: 'Atualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE clientes SET ativo = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Excluído' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;