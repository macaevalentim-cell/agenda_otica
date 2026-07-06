const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = 'SELECT * FROM lembretes WHERE status = ?';
    const params = ['pendente'];
    if (req.user.tipo !== 'admin') {
      query += ' AND destinatario_tipo = ? AND destinatario_nome = ?';
      params.push('vendedor', req.user.nome);
    }
    query += ' ORDER BY data_envio_programada ASC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('❌ Erro ao listar lembretes:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/enviar', authenticateToken, async (req, res) => {
  try {
    await pool.query('UPDATE lembretes SET status = ?, enviado_em = NOW() WHERE id = ?', ['enviado', req.params.id]);
    res.json({ message: 'Lembrete enviado' });
  } catch (error) {
    console.error('❌ Erro ao enviar lembrete:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;