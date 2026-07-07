const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.put('/alterar-senha', authenticateToken, async (req, res) => {
  try {
    const { senha_atual, nova_senha } = req.body;
    if (!senha_atual || !nova_senha) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias.' });
    }
    if (nova_senha.length < 6) {
      return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres.' });
    }

    const [rows] = await pool.query('SELECT senha FROM usuarios WHERE id = ?', [req.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const valid = await bcrypt.compare(senha_atual, rows[0].senha);
    if (!valid) {
      return res.status(401).json({ error: 'Senha atual incorreta.' });
    }

    const novaHash = await bcrypt.hash(nova_senha, 10);
    await pool.query('UPDATE usuarios SET senha = ? WHERE id = ?', [novaHash, req.user.id]);

    res.json({ message: 'Senha alterada com sucesso!' });
  } catch (error) {
    console.error('❌ Erro ao alterar senha:', error);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;