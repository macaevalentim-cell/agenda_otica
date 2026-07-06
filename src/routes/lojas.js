const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const router = express.Router();

// Listar lojas (GET)
router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, endereco FROM lojas WHERE ativo = true ORDER BY nome'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erro ao listar lojas:', error);
    res.status(500).json({ error: 'Erro interno ao listar lojas' });
  }
});

// Criar loja (POST)
router.post('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    console.log('📥 Corpo da requisição:', req.body);

    const { nome, endereco } = req.body;

    // Validações básicas
    if (!nome || typeof nome !== 'string' || nome.trim() === '') {
      return res.status(400).json({ error: 'O nome da loja é obrigatório e deve ser um texto válido.' });
    }

    // Remove espaços extras
    const nomeLimpo = nome.trim();
    const enderecoLimpo = endereco ? endereco.trim() : null;

    // Verifica duplicidade (opcional, mas evita confusão)
    const existente = await pool.query(
      'SELECT id FROM lojas WHERE nome = $1 AND ativo = true',
      [nomeLimpo]
    );
    if (existente.rows.length > 0) {
      return res.status(400).json({ error: 'Já existe uma loja com este nome.' });
    }

    // Insere no banco
    const result = await pool.query(
      'INSERT INTO lojas (nome, endereco) VALUES ($1, $2) RETURNING id',
      [nomeLimpo, enderecoLimpo]
    );

    console.log('✅ Loja criada com ID:', result.rows[0].id);
    res.status(201).json({
      id: result.rows[0].id,
      message: 'Loja criada com sucesso!'
    });
  } catch (error) {
    console.error('❌ Erro ao criar loja:', error);
    // Retorna erro detalhado para depuração
    res.status(500).json({
      error: 'Erro interno ao criar loja',
      detalhe: error.message
    });
  }
});

// Atualizar loja (PUT)
router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { nome, endereco } = req.body;
    const id = req.params.id;

    if (!nome || typeof nome !== 'string' || nome.trim() === '') {
      return res.status(400).json({ error: 'O nome da loja é obrigatório.' });
    }

    const nomeLimpo = nome.trim();
    const enderecoLimpo = endereco ? endereco.trim() : null;

    // Verifica duplicidade
    const existente = await pool.query(
      'SELECT id FROM lojas WHERE nome = $1 AND id != $2 AND ativo = true',
      [nomeLimpo, id]
    );
    if (existente.rows.length > 0) {
      return res.status(400).json({ error: 'Já existe outra loja com este nome.' });
    }

    await pool.query(
      'UPDATE lojas SET nome = $1, endereco = $2 WHERE id = $3',
      [nomeLimpo, enderecoLimpo, id]
    );

    res.json({ message: 'Loja atualizada com sucesso!' });
  } catch (error) {
    console.error('❌ Erro ao atualizar loja:', error);
    res.status(500).json({ error: 'Erro interno ao atualizar loja' });
  }
});

// Excluir loja (DELETE)
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query('UPDATE lojas SET ativo = false WHERE id = $1', [id]);
    res.json({ message: 'Loja excluída com sucesso!' });
  } catch (error) {
    console.error('❌ Erro ao excluir loja:', error);
    res.status(500).json({ error: 'Erro interno ao excluir loja' });
  }
});

module.exports = router;