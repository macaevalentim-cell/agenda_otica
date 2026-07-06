const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { toNull, formatDateToYYYYMMDD } = require('../utils/helpers');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE ativo = true ORDER BY nome'
    );
    res.json(rows.map(c => ({ ...c, data_nascimento: formatDateToYYYYMMDD(c.data_nascimento) })));
  } catch (error) {
    console.error('❌ Erro ao listar clientes:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/buscar', authenticateToken, async (req, res) => {
  try {
    const { cpf } = req.query;
    if (!cpf) return res.json(null);
    const [rows] = await pool.query(
      'SELECT id, nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe FROM clientes WHERE cpf = ? AND ativo = true',
      [cpf]
    );
    if (rows.length === 0) return res.json(null);
    const cliente = rows[0];
    cliente.data_nascimento = formatDateToYYYYMMDD(cliente.data_nascimento);
    res.json(cliente);
  } catch (error) {
    console.error('❌ Erro ao buscar cliente por CPF:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe } = req.body;
    if (!nome || !telefone) return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });

    if (cpf) {
      const [exist] = await pool.query('SELECT id FROM clientes WHERE cpf = ?', [cpf]);
      if (exist.length > 0) return res.status(400).json({ error: 'CPF já cadastrado.' });
    }

    const [result] = await pool.query(
      `INSERT INTO clientes (nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nome, telefone, toNull(email), toNull(cpf), toNull(data_nascimento),
       neurodivergente ? 1 : 0, deficiencia_fisica ? 1 : 0, encaixe ? 1 : 0, req.user.id]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    console.error('❌ Erro ao criar cliente:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe } = req.body;
    if (cpf) {
      const [exist] = await pool.query('SELECT id FROM clientes WHERE cpf = ? AND id != ?', [cpf, req.params.id]);
      if (exist.length > 0) return res.status(400).json({ error: 'CPF já cadastrado.' });
    }
    await pool.query(
      `UPDATE clientes SET nome=?, telefone=?, email=?, cpf=?, data_nascimento=?, neurodivergente=?, deficiencia_fisica=?, encaixe=? WHERE id=?`,
      [nome, telefone, toNull(email), toNull(cpf), toNull(data_nascimento),
       neurodivergente ? 1 : 0, deficiencia_fisica ? 1 : 0, encaixe ? 1 : 0, req.params.id]
    );
    res.json({ message: 'Atualizado' });
  } catch (error) {
    console.error('❌ Erro ao atualizar cliente:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE clientes SET ativo = false WHERE id = ?', [req.params.id]);
    res.json({ message: 'Excluído' });
  } catch (error) {
    console.error('❌ Erro ao excluir cliente:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;