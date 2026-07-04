const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { toNull } = require('../utils/helpers');
const { body, validationResult } = require('express-validator');
const router = express.Router();

// Validação para criação/atualização
const usuarioValidation = [
  body('nome').notEmpty().trim().escape(),
  body('username').notEmpty().trim().escape().isLength({ min: 3 }),
  body('tipo').isIn(['admin', 'vendedor']),
  body('empresa_id').optional().isInt(),
  body('telefone').if(body('tipo').equals('vendedor')).notEmpty().withMessage('Telefone obrigatório para vendedor')
];

// Listar usuários
router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.nome, u.username, u.telefone, u.tipo, u.ativo, u.empresa_id, e.nome as empresa_nome
      FROM usuarios u
      LEFT JOIN empresas e ON u.empresa_id = e.id
      ORDER BY u.id
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({ error: 'Erro interno ao listar usuários' });
  }
});

// Criar usuário
router.post('/', authenticateToken, isAdmin, usuarioValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Dados inválidos', details: errors.array() });
  }

  try {
    const { nome, username, senha, telefone, tipo, empresa_id } = req.body;

    // Verifica se username já existe
    const existente = await pool.query('SELECT id FROM usuarios WHERE username = $1', [username]);
    if (existente.rows.length > 0) {
      return res.status(400).json({ error: 'Username já está em uso' });
    }

    const hashed = await bcrypt.hash(senha, 10);
    const result = await pool.query(
      `INSERT INTO usuarios (nome, username, senha, telefone, tipo, empresa_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [nome, username, hashed, toNull(telefone), tipo, toNull(empresa_id)]
    );

    res.status(201).json({ id: result.rows[0].id, message: 'Usuário criado com sucesso' });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.status(500).json({ error: 'Erro interno ao criar usuário' });
  }
});

// Atualizar usuário
router.put('/:id', authenticateToken, isAdmin, usuarioValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Dados inválidos', details: errors.array() });
  }

  try {
    const { nome, username, senha, telefone, tipo, ativo, empresa_id } = req.body;
    const userId = req.params.id;

    // Impede alteração do admin principal? (opcional, podemos permitir)
    if (userId == 1) {
      return res.status(403).json({ error: 'Não é permitido alterar o usuário admin principal' });
    }

    // Verifica se username já existe para outro usuário
    const existente = await pool.query('SELECT id FROM usuarios WHERE username = $1 AND id != $2', [username, userId]);
    if (existente.rows.length > 0) {
      return res.status(400).json({ error: 'Username já está em uso' });
    }

    if (senha && senha.length > 0) {
      const hashed = await bcrypt.hash(senha, 10);
      await pool.query(
        `UPDATE usuarios SET nome=$1, username=$2, senha=$3, telefone=$4, tipo=$5, ativo=$6, empresa_id=$7 WHERE id=$8`,
        [nome, username, hashed, toNull(telefone), tipo, ativo !== undefined ? ativo : true, toNull(empresa_id), userId]
      );
    } else {
      await pool.query(
        `UPDATE usuarios SET nome=$1, username=$2, telefone=$3, tipo=$4, ativo=$5, empresa_id=$6 WHERE id=$7`,
        [nome, username, toNull(telefone), tipo, ativo !== undefined ? ativo : true, toNull(empresa_id), userId]
      );
    }

    res.json({ message: 'Usuário atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({ error: 'Erro interno ao atualizar usuário' });
  }
});

// Excluir usuário
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    if (userId == 1) {
      return res.status(403).json({ error: 'Não é permitido excluir o admin principal' });
    }

    // Verifica se o usuário existe
    const user = await pool.query('SELECT id FROM usuarios WHERE id = $1', [userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    await pool.query('DELETE FROM usuarios WHERE id = $1', [userId]);
    res.json({ message: 'Usuário excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    res.status(500).json({ error: 'Erro interno ao excluir usuário' });
  }
});

module.exports = router;