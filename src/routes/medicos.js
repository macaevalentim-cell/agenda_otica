const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { toNull } = require('../utils/helpers');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, crm, telefone, email, especialidade, whatsapp, endereco, mensagem_padrao FROM medicos WHERE ativo = true ORDER BY nome'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erro ao listar médicos:', error);
    res.status(500).json({ error: 'Erro interno ao listar médicos' });
  }
});

router.post('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { nome, crm, telefone, email, especialidade, whatsapp, endereco, mensagem_padrao } = req.body;
    if (!nome || !crm || !especialidade) {
      return res.status(400).json({ error: 'Nome, CRM e especialidade são obrigatórios.' });
    }

    const existente = await pool.query('SELECT id FROM medicos WHERE crm = $1', [crm]);
    if (existente.rows.length > 0) {
      return res.status(400).json({ error: 'CRM já cadastrado.' });
    }

    const result = await pool.query(
      'INSERT INTO medicos (nome, crm, telefone, email, especialidade, whatsapp, endereco, mensagem_padrao) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [nome, crm, toNull(telefone), toNull(email), especialidade, toNull(whatsapp), toNull(endereco), toNull(mensagem_padrao)]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    console.error('❌ Erro ao criar médico:', error);
    res.status(500).json({ error: 'Erro interno ao criar médico' });
  }
});

router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { nome, crm, telefone, email, especialidade, whatsapp, endereco, mensagem_padrao } = req.body;
    const existente = await pool.query('SELECT id FROM medicos WHERE crm = $1 AND id != $2', [crm, req.params.id]);
    if (existente.rows.length > 0) {
      return res.status(400).json({ error: 'CRM já cadastrado para outro médico.' });
    }
    await pool.query(
      'UPDATE medicos SET nome=$1, crm=$2, telefone=$3, email=$4, especialidade=$5, whatsapp=$6, endereco=$7, mensagem_padrao=$8 WHERE id=$9',
      [nome, crm, toNull(telefone), toNull(email), especialidade, toNull(whatsapp), toNull(endereco), toNull(mensagem_padrao), req.params.id]
    );
    res.json({ message: 'Atualizado' });
  } catch (error) {
    console.error('❌ Erro ao atualizar médico:', error);
    res.status(500).json({ error: 'Erro interno ao atualizar médico' });
  }
});

router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE medicos SET ativo = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Excluído' });
  } catch (error) {
    console.error('❌ Erro ao excluir médico:', error);
    res.status(500).json({ error: 'Erro interno ao excluir médico' });
  }
});

module.exports = router;