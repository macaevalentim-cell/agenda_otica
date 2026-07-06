const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { toNull } = require('../utils/helpers');
const router = express.Router();

// Listar lojas
router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nome, endereco FROM lojas WHERE ativo = true ORDER BY nome');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Criar loja
router.post('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { nome, endereco } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const result = await pool.query(
      'INSERT INTO lojas (nome, endereco) VALUES ($1, $2) RETURNING id',
      [nome, toNull(endereco)]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Atualizar loja
router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { nome, endereco } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    await pool.query(
      'UPDATE lojas SET nome=$1, endereco=$2 WHERE id=$3',
      [nome, toNull(endereco), req.params.id]
    );
    res.json({ message: 'Atualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Excluir (desativar) loja
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE lojas SET ativo = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Excluído' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;