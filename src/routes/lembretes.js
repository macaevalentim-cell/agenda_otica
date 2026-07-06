const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = 'SELECT * FROM lembretes WHERE status = $1';
    const params = ['pendente'];
    if (req.user.tipo !== 'admin') {
      query += ' AND destinatario_tipo = $2 AND destinatario_nome = $3';
      params.push('vendedor', req.user.nome);
    }
    query += ' ORDER BY data_envio_programada ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erro ao listar lembretes:', error);
    res.status(500).json({ error: 'Erro interno ao listar lembretes' });
  }
});

router.put('/:id/enviar', authenticateToken, async (req, res) => {
  try {
    await pool.query('UPDATE lembretes SET status = $1, enviado_em = NOW() WHERE id = $2', ['enviado', req.params.id]);
    res.json({ message: 'Lembrete enviado' });
  } catch (error) {
    console.error('❌ Erro ao enviar lembrete:', error);
    res.status(500).json({ error: 'Erro interno ao enviar lembrete' });
  }
});

module.exports = router;