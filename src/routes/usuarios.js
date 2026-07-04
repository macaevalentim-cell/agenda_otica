const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { toNull } = require('../utils/helpers');
const router = express.Router();

// Listar usuários (apenas admin)
router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, username, telefone, tipo, ativo FROM usuarios ORDER BY id'
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Criar usuário (apenas admin)
router.post('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { nome, username, senha, telefone, tipo } = req.body;
    if (tipo === 'vendedor' && !telefone) {
      return res.status(400).json({ error: 'Telefone obrigatório para vendedor.' });
    }
    const hashed = await bcrypt.hash(senha, 10);
    const result = await pool.query(
      'INSERT INTO usuarios (nome, username, senha, telefone, tipo) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [nome, username, hashed, toNull(telefone), tipo]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Editar usuário (apenas admin)
router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { nome, username, senha, telefone, tipo, ativo } = req.body;
    if (tipo === 'vendedor' && !telefone) {
      return res.status(400).json({ error: 'Telefone obrigatório para vendedor.' });
    }
    if (senha) {
      const hashed = await bcrypt.hash(senha, 10);
      await pool.query(
        `UPDATE usuarios SET nome=$1, username=$2, senha=$3, telefone=$4, tipo=$5, ativo=$6 WHERE id=$7`,
        [nome, username, hashed, toNull(telefone), tipo, ativo !== undefined ? ativo : true, req.params.id]
      );
    } else {
      await pool.query(
        `UPDATE usuarios SET nome=$1, username=$2, telefone=$3, tipo=$4, ativo=$5 WHERE id=$6`,
        [nome, username, toNull(telefone), tipo, ativo !== undefined ? ativo : true, req.params.id]
      );
    }
    res.json({ message: 'Atualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Excluir usuário (apenas admin)
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
    res.json({ message: 'Excluído' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;