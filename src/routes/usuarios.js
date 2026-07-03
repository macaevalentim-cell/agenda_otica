const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { toNull } = require('../utils/helpers');
const router = express.Router();

router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.nome, u.username, u.telefone, u.tipo, u.ativo, u.empresa_id, e.nome as empresa_nome
      FROM usuarios u LEFT JOIN empresas e ON u.empresa_id = e.id ORDER BY u.id
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { nome, username, senha, telefone, tipo, empresa_id } = req.body;
    if (tipo === 'vendedor' && !telefone) return res.status(400).json({ error: 'Telefone obrigatório para vendedor.' });
    const hashed = await bcrypt.hash(senha, 10);
    const result = await pool.query(
      'INSERT INTO usuarios (nome, username, senha, telefone, tipo, empresa_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [nome, username, hashed, toNull(telefone), tipo, toNull(empresa_id)]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { nome, username, senha, telefone, tipo, ativo, empresa_id } = req.body;
    if (tipo === 'vendedor' && !telefone) return res.status(400).json({ error: 'Telefone obrigatório.' });
    if (senha) {
      const hashed = await bcrypt.hash(senha, 10);
      await pool.query(
        `UPDATE usuarios SET nome=$1, username=$2, senha=$3, telefone=$4, tipo=$5, ativo=$6, empresa_id=$7 WHERE id=$8`,
        [nome, username, hashed, toNull(telefone), tipo, ativo !== undefined ? ativo : true, toNull(empresa_id), req.params.id]
      );
    } else {
      await pool.query(
        `UPDATE usuarios SET nome=$1, username=$2, telefone=$3, tipo=$4, ativo=$5, empresa_id=$6 WHERE id=$7`,
        [nome, username, toNull(telefone), tipo, ativo !== undefined ? ativo : true, toNull(empresa_id), req.params.id]
      );
    }
    res.json({ message: 'Atualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
    res.json({ message: 'Excluído' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;