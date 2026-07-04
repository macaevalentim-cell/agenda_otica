const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { toNull, formatDateToYYYYMMDD } = require('../utils/helpers');
const { agendarLembrete } = require('../services/lembreteService');
const router = express.Router();

// Listar consultas – vendedor vê só as suas, admin vê todas
router.get('/', authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.user.tipo === 'admin';
    let query = `
      SELECT c.*, u.nome as vendedor_nome,
             CASE WHEN c.criado_por = $1 THEN 1 ELSE 0 END as is_own
      FROM consultas c
      LEFT JOIN usuarios u ON c.criado_por = u.id
    `;
    const params = [req.user.id];
    if (!isAdmin) {
      query += ' WHERE c.criado_por = $1';
    }
    query += ' ORDER BY c.data_consulta ASC, c.horario ASC';
    const result = await pool.query(query, params);
    res.json(result.rows.map(c => ({ ...c, data_consulta: formatDateToYYYYMMDD(c.data_consulta) })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Filtrar consultas (admin pode filtrar por vendedor, etc.)
router.get('/filtrar', authenticateToken, async (req, res) => {
  try {
    const { data_inicio, data_fim, medico_id, status, paciente, vendedor_id } = req.query;
    const isAdmin = req.user.tipo === 'admin';
    let query = `
      SELECT c.*, u.nome as vendedor_nome,
             CASE WHEN c.criado_por = $1 THEN 1 ELSE 0 END as is_own
      FROM consultas c
      LEFT JOIN usuarios u ON c.criado_por = u.id
      WHERE 1=1
    `;
    const params = [req.user.id];
    let pc = 2;

    if (!isAdmin) {
      query += ` AND c.criado_por = $${pc++}`;
      params.push(req.user.id);
    }

    if (data_inicio) { query += ` AND c.data_consulta >= $${pc++}`; params.push(data_inicio); }
    if (data_fim) { query += ` AND c.data_consulta <= $${pc++}`; params.push(data_fim); }
    if (medico_id) { query += ` AND c.medico_id = $${pc++}`; params.push(parseInt(medico_id)); }
    if (status) { query += ` AND c.status = $${pc++}`; params.push(status); }
    if (paciente) { query += ` AND c.paciente_nome ILIKE $${pc++}`; params.push(`%${paciente}%`); }
    if (isAdmin && vendedor_id) { query += ` AND c.criado_por = $${pc++}`; params.push(parseInt(vendedor_id)); }

    query += ' ORDER BY c.data_consulta DESC, c.horario DESC';
    const result = await pool.query(query, params);
    res.json(result.rows.map(c => ({ ...c, data_consulta: formatDateToYYYYMMDD(c.data_consulta) })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Criar consulta (apenas admin)
router.post('/', authenticateToken, isAdmin, async (req, res) => {
  // ... mesmo código, mas sem empresa_id
  // [código completo omitido por brevidade, mas idêntico ao anterior, removendo referências a empresa_id]
});

// Atualizar consulta (apenas admin)
router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  // ... mesmo código, sem empresa_id
});

// Excluir consulta (apenas admin)
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  // ... mesmo código
});

// Confirmar, processar (apenas admin)
router.put('/:id/confirmar', authenticateToken, isAdmin, async (req, res) => {
  // ... mesmo código
});
router.put('/:id/processar', authenticateToken, isAdmin, async (req, res) => {
  // ... mesmo código
});

module.exports = router;