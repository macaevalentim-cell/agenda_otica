const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    // Status
    const [statusRows] = await pool.query('SELECT status, COUNT(*) as total FROM consultas GROUP BY status');
    const statusCounts = {};
    statusRows.forEach(row => {
      statusCounts[row.status || 'agendada'] = parseInt(row.total);
    });

    // Vendedores
    const [vendedoresRows] = await pool.query(`
      SELECT u.id, u.nome as vendedor_nome,
        COUNT(c.id) as total,
        COUNT(CASE WHEN c.status = 'agendada' THEN 1 END) as agendadas,
        COUNT(CASE WHEN c.status = 'confirmada' THEN 1 END) as confirmadas,
        COUNT(CASE WHEN c.status = 'cancelada' THEN 1 END) as canceladas,
        COUNT(CASE WHEN c.status = 'realizada' THEN 1 END) as realizadas
      FROM usuarios u
      LEFT JOIN consultas c ON c.criado_por = u.id
      WHERE u.tipo IN ('vendedor', 'admin')
      GROUP BY u.id, u.nome
      ORDER BY u.nome
    `);
    const vendedores = vendedoresRows.map(v => ({
      ...v,
      total: parseInt(v.total),
      agendadas: parseInt(v.agendadas || 0),
      confirmadas: parseInt(v.confirmadas || 0),
      canceladas: parseInt(v.canceladas || 0),
      realizadas: parseInt(v.realizadas || 0)
    }));

    // Totais
    const [totalConsultas] = await pool.query('SELECT COUNT(*) as total FROM consultas');
    const [totalMedicos] = await pool.query('SELECT COUNT(*) as total FROM medicos WHERE ativo = true');

    res.json({
      total_consultas: parseInt(totalConsultas[0].total),
      total_medicos: parseInt(totalMedicos[0].total),
      por_status: statusCounts,
      por_vendedor: vendedores
    });
  } catch (error) {
    console.error('❌ Erro no dashboard:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;