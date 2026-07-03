const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/config', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT numero, endereco_otica FROM whatsapp_config WHERE id = 1');
    if (result.rows.length === 0) return res.json({ numero: '(22) 99764-0112', endereco_otica: 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/config', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { numero, endereco_otica } = req.body;
    await pool.query(
      `INSERT INTO whatsapp_config (id, numero, endereco_otica, atualizado_por) 
       VALUES (1, $1, $2, $3) 
       ON CONFLICT (id) DO UPDATE SET numero = EXCLUDED.numero, endereco_otica = EXCLUDED.endereco_otica, atualizado_por = EXCLUDED.atualizado_por`,
      [numero, endereco_otica, req.user.id]
    );
    res.json({ message: 'Configurações salvas' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;