router.post('/', authenticateToken, async (req, res) => {
    try {
        const {
            paciente_nome, paciente_telefone, paciente_email, paciente_cpf,
            data_nascimento, neurodivergente, deficiencia_fisica, encaixe,
            data_consulta, horario1, horario2, horario3,
            medico_id, medico_nome, observacoes, numero_pedido
        } = req.body;

        // Validações básicas
        if (!paciente_nome || !paciente_telefone) {
            return res.status(400).json({ error: 'Nome e telefone do paciente são obrigatórios.' });
        }
        if (!data_consulta || !horario1 || !medico_id) {
            return res.status(400).json({ error: 'Data, 1º horário e médico são obrigatórios.' });
        }

        // Valida se o médico atende no dia
        const diaSemana = new Date(data_consulta).getDay();
        const horariosConfig = await pool.query(
            `SELECT hora_inicio, hora_fim FROM medico_horarios WHERE medico_id = $1 AND dia_semana = $2 AND ativo = true`,
            [medico_id, diaSemana]
        );
        if (horariosConfig.rows.length === 0) {
            return res.status(400).json({ error: 'Médico não atende neste dia da semana.' });
        }

        // Valida os horários sugeridos
        const horariosSugeridos = [horario1, horario2, horario3].filter(h => h);
        for (const hor of horariosSugeridos) {
            let valido = false;
            for (const config of horariosConfig.rows) {
                if (hor >= config.hora_inicio && hor < config.hora_fim) {
                    valido = true;
                    break;
                }
            }
            if (!valido) {
                return res.status(400).json({ error: `Horário ${hor} não está dentro do expediente do médico.` });
            }
        }

        // Evita conflitos com solicitações pendentes do mesmo médico/data/horário
        for (const hor of horariosSugeridos) {
            const conflito = await pool.query(
                `SELECT id FROM solicitacoes_consultas
                 WHERE data_consulta = $1 AND medico_id = $2 AND status = $3
                 AND (horario_sugerido1 = $4 OR horario_sugerido2 = $5 OR horario_sugerido3 = $6)`,
                [data_consulta, medico_id, 'pendente', hor, hor, hor]
            );
            if (conflito.rows.length > 0) {
                return res.status(400).json({ error: `Horário ${hor} já possui solicitação pendente para este médico.` });
            }
        }

        // Se CPF foi fornecido, tenta criar/atualizar paciente
        if (paciente_cpf) {
            const existente = await pool.query('SELECT id FROM clientes WHERE cpf = $1', [paciente_cpf]);
            if (existente.rows.length === 0) {
                await pool.query(
                    `INSERT INTO clientes (nome, telefone, email, cpf, data_nascimento, neurodivergente, deficiencia_fisica, encaixe, criado_por)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [paciente_nome, paciente_telefone, paciente_email || null, paciente_cpf, data_nascimento || null,
                     neurodivergente || 0, deficiencia_fisica || 0, encaixe || 1, req.user.id]
                );
            }
        }

        // Insere a solicitação
        const result = await pool.query(
            `INSERT INTO solicitacoes_consultas
             (paciente_nome, paciente_telefone, paciente_email, paciente_cpf, data_consulta,
              horario_sugerido1, horario_sugerido2, horario_sugerido3,
              medico_id, medico_nome, observacoes, numero_pedido, solicitado_por)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING id`,
            [
                paciente_nome, paciente_telefone, paciente_email || null, paciente_cpf || null,
                data_consulta, horario1, horario2 || null, horario3 || null,
                medico_id, medico_nome, observacoes || null, numero_pedido || null,
                req.user.id
            ]
        );

        res.status(201).json({ id: result.rows[0].id, message: 'Solicitação enviada com sucesso!' });
    } catch (error) {
        console.error('Erro ao criar solicitação:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});