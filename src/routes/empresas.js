const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { toNull } = require('../utils/helpers');
const router = express.Router();

router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nome, endereco, telefone, email, cnpj FROM empresas WHERE ativo = true ORDER BY nome');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { nome, endereco, telefone, email, cnpj } = req.body;
    const result = await pool.query(
      'INSERT INTO empresas (nome, endereco, telefone, email, cnpj) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [nome, toNull(endereco), toNull(telefone), toNull(email), toNull(cnpj)]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { nome, endereco, telefone, email, cnpj } = req.body;
    await pool.query(
      'UPDATE empresas SET nome=$1, endereco=$2, telefone=$3, email=$4, cnpj=$5 WHERE id=$6',
      [nome, toNull(endereco), toNull(telefone), toNull(email), toNull(cnpj), req.params.id]
    );
    res.json({ message: 'Atualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE empresas SET ativo = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Excluído' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;