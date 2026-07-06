const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const router = express.Router();

// ==================== LISTAR HORÁRIOS DE UM MÉDICO ====================
router.get('/medicos/:id/horarios', authenticateToken, isAdmin, async (req, res) => {
  try {
    const medicoId = req.params.id;
    const [rows] = await pool.query(
      `SELECT id, medico_id, dia_semana, hora_inicio, hora_fim, 
              intervalo_minutos as intervalo, ativo 
       FROM medico_horarios 
       WHERE medico_id = ? 
       ORDER BY dia_semana, hora_inicio`,
      [medicoId]
    );
    res.json(rows);
  } catch (error) {
    console.error('❌ Erro ao listar horários:', error);
    res.status(500).json({ error: 'Erro interno ao listar horários' });
  }
});

// ==================== BUSCAR HORÁRIO POR ID (NOVA ROTA) ====================
router.get('/horarios/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await pool.query(
      `SELECT id, medico_id, dia_semana, hora_inicio, hora_fim, 
              intervalo_minutos as intervalo, ativo 
       FROM medico_horarios 
       WHERE id = ?`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Horário não encontrado.' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('❌ Erro ao buscar horário:', error);
    res.status(500).json({ error: 'Erro interno ao buscar horário' });
  }
});

// ==================== ADICIONAR HORÁRIO ====================
router.post('/medicos/:id/horarios', authenticateToken, isAdmin, async (req, res) => {
  try {
    const medicoId = req.params.id;
    const { dia_semana, hora_inicio, hora_fim, intervalo, intervalo_minutos } = req.body;

    if (dia_semana === undefined || !hora_inicio || !hora_fim) {
      return res.status(400).json({ error: 'Dia da semana, horário de início e fim são obrigatórios.' });
    }

    const dia = parseInt(dia_semana);
    if (isNaN(dia) || dia < 0 || dia > 6) {
      return res.status(400).json({ error: 'Dia da semana inválido (0-6).' });
    }

    const intervaloFinal = parseInt(intervalo || intervalo_minutos || 30);
    if (isNaN(intervaloFinal) || intervaloFinal < 5) {
      return res.status(400).json({ error: 'Intervalo inválido (mínimo 5 minutos).' });
    }

    const [medico] = await pool.query('SELECT id FROM medicos WHERE id = ?', [medicoId]);
    if (medico.length === 0) {
      return res.status(404).json({ error: 'Médico não encontrado.' });
    }

    const [result] = await pool.query(
      'INSERT INTO medico_horarios (medico_id, dia_semana, hora_inicio, hora_fim, intervalo_minutos) VALUES (?, ?, ?, ?, ?)',
      [medicoId, dia, hora_inicio, hora_fim, intervaloFinal]
    );

    res.status(201).json({ id: result.insertId, message: 'Horário adicionado com sucesso!' });
  } catch (error) {
    console.error('❌ Erro ao adicionar horário:', error);
    res.status(500).json({ error: 'Erro ao adicionar horário: ' + error.message });
  }
});

// ==================== ATUALIZAR HORÁRIO ====================
router.put('/horarios/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { dia_semana, hora_inicio, hora_fim, intervalo, intervalo_minutos, ativo } = req.body;

    if (dia_semana === undefined || !hora_inicio || !hora_fim) {
      return res.status(400).json({ error: 'Dia da semana, horário de início e fim são obrigatórios.' });
    }

    const dia = parseInt(dia_semana);
    if (isNaN(dia) || dia < 0 || dia > 6) {
      return res.status(400).json({ error: 'Dia da semana inválido (0-6).' });
    }

    const intervaloFinal = parseInt(intervalo || intervalo_minutos || 30);
    if (isNaN(intervaloFinal) || intervaloFinal < 5) {
      return res.status(400).json({ error: 'Intervalo inválido (mínimo 5 minutos).' });
    }

    const ativoFinal = (ativo !== undefined) ? (ativo ? 1 : 0) : 1;

    const [result] = await pool.query(
      `UPDATE medico_horarios 
       SET dia_semana = ?, hora_inicio = ?, hora_fim = ?, 
           intervalo_minutos = ?, ativo = ? 
       WHERE id = ?`,
      [dia, hora_inicio, hora_fim, intervaloFinal, ativoFinal, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Horário não encontrado.' });
    }

    res.json({ message: 'Horário atualizado com sucesso!' });
  } catch (error) {
    console.error('❌ Erro ao atualizar horário:', error);
    res.status(500).json({ error: 'Erro interno ao atualizar horário: ' + error.message });
  }
});

// ==================== EXCLUIR HORÁRIO ====================
router.delete('/horarios/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM medico_horarios WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Horário não encontrado.' });
    }
    res.json({ message: 'Horário excluído com sucesso!' });
  } catch (error) {
    console.error('❌ Erro ao excluir horário:', error);
    res.status(500).json({ error: 'Erro interno ao excluir horário' });
  }
});

// ==================== HORÁRIOS DISPONÍVEIS ====================
router.get('/medicos/:id/horarios/disponiveis', authenticateToken, async (req, res) => {
  try {
    const medicoId = req.params.id;
    const { data } = req.query;
    if (!data) return res.status(400).json({ error: 'Data é obrigatória' });

    const diaSemana = new Date(data).getDay();
    const [configs] = await pool.query(
      `SELECT hora_inicio, hora_fim, intervalo_minutos as intervalo 
       FROM medico_horarios 
       WHERE medico_id = ? AND dia_semana = ? AND ativo = true`,
      [medicoId, diaSemana]
    );

    if (configs.length === 0) return res.json([]);

    const todosHorarios = [];
    for (const config of configs) {
      let current = new Date(`2000-01-01T${config.hora_inicio}`);
      const end = new Date(`2000-01-01T${config.hora_fim}`);
      const intervalo = config.intervalo || 30;
      while (current < end) {
        const h = current.getHours().toString().padStart(2, '0');
        const m = current.getMinutes().toString().padStart(2, '0');
        todosHorarios.push(`${h}:${m}`);
        current.setMinutes(current.getMinutes() + intervalo);
      }
    }

    const horariosUnicos = [...new Set(todosHorarios)];
    const [ocupados] = await pool.query(
      `SELECT horario FROM consultas 
       WHERE medico_id = ? AND data_consulta = ? 
       AND status NOT IN (?, ?)`,
      [medicoId, data, 'cancelada', 'realizada']
    );
    const ocupadosSet = new Set(ocupados.map(r => r.horario));
    const disponiveis = horariosUnicos.filter(h => !ocupadosSet.has(h));
    res.json(disponiveis.map(h => ({ horario: h })));
  } catch (error) {
    console.error('❌ Erro ao buscar horários disponíveis:', error);
    res.status(500).json({ error: 'Erro interno ao buscar horários disponíveis' });
  }
});

module.exports = router;