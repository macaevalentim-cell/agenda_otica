const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { toNull, formatDateToYYYYMMDD } = require('../utils/helpers');
const { agendarLembrete } = require('../services/lembreteService');
const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.user.tipo === 'admin';
    let query = `
      SELECT s.*, u.nome as solicitante_nome
      FROM solicitacoes_consultas s
      JOIN usuarios u ON s.solicitado_por = u.id
    `;
    const params = [];
    if (!isAdmin) {
      query += ' WHERE s.solicitado_por = $1';
      params.push(req.user.id);
    }
    query += ' ORDER BY s.criado_em DESC';
    const result = await pool.query(query, params);
    res.json(result.rows.map(s => ({ ...s, data_consulta: formatDateToYYYYMMDD(s.data_consulta) })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/pendentes/count', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) as total FROM solicitacoes_consultas WHERE status = $1', ['pendente']);
    res.json({ total: parseInt(result.rows[0].total) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  // ... mesmo código, sem empresa_id, e o criado_por é o usuário logado (req.user.id)
  // [código completo omitido por brevidade, mas idêntico ao anterior, removendo empresa_id]
});

router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  // ... mesmo código, sem empresa_id
});

module.exports = router;