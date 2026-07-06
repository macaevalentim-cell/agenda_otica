const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { validate, loginValidation } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/login', validate(loginValidation), async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query(`
      SELECT u.id, u.nome, u.username, u.senha, u.tipo, u.telefone, u.loja_id,
             l.nome as loja_nome, l.endereco as loja_endereco
      FROM usuarios u
      LEFT JOIN lojas l ON u.loja_id = l.id
      WHERE u.username = $1 AND u.ativo = true
    `, [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.senha);
    if (!valid) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    const token = jwt.sign(
      { id: user.id, nome: user.nome, username: user.username, tipo: user.tipo, loja_id: user.loja_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        nome: user.nome,
        username: user.username,
        tipo: user.tipo,
        telefone: user.telefone,
        loja_id: user.loja_id,
        loja_nome: user.loja_nome,
        loja_endereco: user.loja_endereco
      }
    });
  } catch (error) {
    console.error('❌ Erro no login:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/verify', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.nome, u.username, u.tipo, u.telefone, u.loja_id,
             l.nome as loja_nome, l.endereco as loja_endereco
      FROM usuarios u
      LEFT JOIN lojas l ON u.loja_id = l.id
      WHERE u.id = $1
    `, [req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ valid: true, user: result.rows[0] });
  } catch (error) {
    console.error('❌ Erro no verify:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;