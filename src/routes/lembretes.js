const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// ==================== LISTAR LEMBRETES PENDENTES ====================
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

// ==================== MARCAR LEMBRETE COMO ENVIADO ====================
router.put('/:id/enviar', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE lembretes SET status = $1, enviado_em = NOW() WHERE id = $2 AND status = $3',
      ['enviado', req.params.id, 'pendente']
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Lembrete não encontrado ou já enviado.' });
    }
    res.json({ message: 'Lembrete marcado como enviado' });
  } catch (error) {
    console.error('❌ Erro ao marcar lembrete como enviado:', error);
    res.status(500).json({ error: 'Erro interno ao marcar lembrete como enviado' });
  }
});

module.exports = router;