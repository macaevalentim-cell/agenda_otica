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
    console.error('❌ Erro ao listar lojas:', error);
    res.status(500).json({ error: 'Erro interno ao listar lojas' });
  }
});

// Criar loja
router.post('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { nome, endereco } = req.body;
    console.log('📝 Recebendo dados para criar loja:', { nome, endereco });

    // Validação rigorosa
    if (!nome || nome.trim() === '') {
      return res.status(400).json({ error: 'O nome da loja é obrigatório.' });
    }

    // Verifica se já existe uma loja com o mesmo nome (opcional)
    const existente = await pool.query('SELECT id FROM lojas WHERE nome = $1 AND ativo = true', [nome.trim()]);
    if (existente.rows.length > 0) {
      return res.status(400).json({ error: 'Já existe uma loja com este nome.' });
    }

    const result = await pool.query(
      'INSERT INTO lojas (nome, endereco) VALUES ($1, $2) RETURNING id',
      [nome.trim(), toNull(endereco) || null]
    );
    console.log('✅ Loja criada com ID:', result.rows[0].id);
    res.status(201).json({ id: result.rows[0].id, message: 'Loja criada com sucesso!' });
  } catch (error) {
    console.error('❌ Erro ao criar loja:', error);
    res.status(500).json({ error: 'Erro interno ao criar loja: ' + error.message });
  }
});

// Atualizar loja
router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { nome, endereco } = req.body;
    const id = req.params.id;
    console.log('📝 Atualizando loja ID:', id, { nome, endereco });

    if (!nome || nome.trim() === '') {
      return res.status(400).json({ error: 'O nome da loja é obrigatório.' });
    }

    // Verifica se existe outra loja com o mesmo nome
    const existente = await pool.query('SELECT id FROM lojas WHERE nome = $1 AND id != $2 AND ativo = true', [nome.trim(), id]);
    if (existente.rows.length > 0) {
      return res.status(400).json({ error: 'Já existe outra loja com este nome.' });
    }

    await pool.query(
      'UPDATE lojas SET nome = $1, endereco = $2 WHERE id = $3',
      [nome.trim(), toNull(endereco) || null, id]
    );
    console.log('✅ Loja atualizada ID:', id);
    res.json({ message: 'Loja atualizada com sucesso!' });
  } catch (error) {
    console.error('❌ Erro ao atualizar loja:', error);
    res.status(500).json({ error: 'Erro interno ao atualizar loja: ' + error.message });
  }
});

// Excluir (desativar) loja
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    console.log('🗑️ Desativando loja ID:', id);
    await pool.query('UPDATE lojas SET ativo = false WHERE id = $1', [id]);
    res.json({ message: 'Loja excluída com sucesso!' });
  } catch (error) {
    console.error('❌ Erro ao excluir loja:', error);
    res.status(500).json({ error: 'Erro interno ao excluir loja: ' + error.message });
  }
});

module.exports = router;