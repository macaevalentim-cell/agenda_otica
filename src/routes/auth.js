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
    const result = await pool.query(
      `SELECT id, nome, username, senha, tipo, telefone
       FROM usuarios
       WHERE username = $1 AND ativo = true`,
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.senha);
    if (!valid) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }
    const token = jwt.sign(
      { id: user.id, nome: user.nome, username: user.username, tipo: user.tipo },
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
        telefone: user.telefone
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/verify', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nome, username, tipo, telefone FROM usuarios WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.json({ valid: true, user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;