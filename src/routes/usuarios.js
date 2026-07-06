const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { toNull } = require('../utils/helpers');
const router = express.Router();

router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id, u.nome, u.username, u.telefone, u.tipo, u.ativo, u.loja_id,
             l.nome as loja_nome
      FROM usuarios u
      LEFT JOIN lojas l ON u.loja_id = l.id
      ORDER BY u.id
    `);
    res.json(rows);
  } catch (error) {
    console.error('❌ Erro ao listar usuários:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { nome, username, senha, telefone, tipo, loja_id } = req.body;
    if (tipo === 'vendedor' && !telefone) {
      return res.status(400).json({ error: 'Telefone obrigatório para vendedor.' });
    }
    const hashed = await bcrypt.hash(senha, 10);
    const [result] = await pool.query(
      'INSERT INTO usuarios (nome, username, senha, telefone, tipo, loja_id) VALUES (?, ?, ?, ?, ?, ?)',
      [nome, username, hashed, toNull(telefone), tipo, toNull(loja_id)]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    console.error('❌ Erro ao criar usuário:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { nome, username, senha, telefone, tipo, ativo, loja_id } = req.body;
    if (tipo === 'vendedor' && !telefone) {
      return res.status(400).json({ error: 'Telefone obrigatório para vendedor.' });
    }
    if (senha) {
      const hashed = await bcrypt.hash(senha, 10);
      await pool.query(
        `UPDATE usuarios SET nome=?, username=?, senha=?, telefone=?, tipo=?, ativo=?, loja_id=? WHERE id=?`,
        [nome, username, hashed, toNull(telefone), tipo, ativo !== undefined ? ativo : true, toNull(loja_id), req.params.id]
      );
    } else {
      await pool.query(
        `UPDATE usuarios SET nome=?, username=?, telefone=?, tipo=?, ativo=?, loja_id=? WHERE id=?`,
        [nome, username, toNull(telefone), tipo, ativo !== undefined ? ativo : true, toNull(loja_id), req.params.id]
      );
    }
    res.json({ message: 'Atualizado' });
  } catch (error) {
    console.error('❌ Erro ao atualizar usuário:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
    res.json({ message: 'Excluído' });
  } catch (error) {
    console.error('❌ Erro ao excluir usuário:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;