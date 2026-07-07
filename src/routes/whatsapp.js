const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/config', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT numero, endereco_otica FROM whatsapp_config WHERE id = 1');
    if (rows.length === 0) {
      return res.json({ numero: '(22) 99764-0112', endereco_otica: 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('❌ Erro ao carregar config WhatsApp:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/config', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { numero, endereco_otica } = req.body;
    await pool.query(
      `INSERT INTO whatsapp_config (id, numero, endereco_otica, atualizado_por)
       VALUES (1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE numero = VALUES(numero), endereco_otica = VALUES(endereco_otica), atualizado_por = VALUES(atualizado_por)`,
      [numero, endereco_otica, req.user.id]
    );
    res.json({ message: 'Configurações salvas' });
  } catch (error) {
    console.error('❌ Erro ao salvar config WhatsApp:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;