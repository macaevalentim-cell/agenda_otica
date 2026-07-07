const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { toNull } = require('../utils/helpers');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, nome, crm, telefone, email, especialidade, whatsapp, endereco, mensagem_padrao FROM medicos WHERE ativo = true ORDER BY nome'
    );
    res.json(rows);
  } catch (error) {
    console.error('❌ Erro ao listar médicos:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { nome, crm, telefone, email, especialidade, whatsapp, endereco, mensagem_padrao } = req.body;
    if (!nome || !crm || !especialidade) {
      return res.status(400).json({ error: 'Nome, CRM e especialidade são obrigatórios' });
    }

    if (crm) {
      const [exist] = await pool.query('SELECT id FROM medicos WHERE crm = ?', [crm]);
      if (exist.length > 0) return res.status(400).json({ error: 'CRM já cadastrado.' });
    }

    const [result] = await pool.query(
      'INSERT INTO medicos (nome, crm, telefone, email, especialidade, whatsapp, endereco, mensagem_padrao) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [nome, crm, toNull(telefone), toNull(email), especialidade, toNull(whatsapp), toNull(endereco), toNull(mensagem_padrao)]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    console.error('❌ Erro ao criar médico:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { nome, crm, telefone, email, especialidade, whatsapp, endereco, mensagem_padrao } = req.body;
    if (crm) {
      const [exist] = await pool.query('SELECT id FROM medicos WHERE crm = ? AND id != ?', [crm, req.params.id]);
      if (exist.length > 0) return res.status(400).json({ error: 'CRM já cadastrado.' });
    }
    await pool.query(
      'UPDATE medicos SET nome=?, crm=?, telefone=?, email=?, especialidade=?, whatsapp=?, endereco=?, mensagem_padrao=? WHERE id=?',
      [nome, crm, toNull(telefone), toNull(email), especialidade, toNull(whatsapp), toNull(endereco), toNull(mensagem_padrao), req.params.id]
    );
    res.json({ message: 'Atualizado' });
  } catch (error) {
    console.error('❌ Erro ao atualizar médico:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE medicos SET ativo = false WHERE id = ?', [req.params.id]);
    res.json({ message: 'Excluído' });
  } catch (error) {
    console.error('❌ Erro ao excluir médico:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;