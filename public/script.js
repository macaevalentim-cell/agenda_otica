// ========================================================================
// CONFIGURAÇÕES E VARIÁVEIS GLOBAIS
// ========================================================================
const API_URL = window.location.origin + '/api';
let token = null;
let user = null;
let consultas = [];
let medicos = [];
let usuarios = [];
let clientes = [];
let lojas = [];
let currentView = 'week';
let currentDate = new Date();
let editandoId = null;
let medicoSelecionadoId = null;
let consultaParaImprimir = null;
let _ultimoContadorLembretes = 0;
let _ultimoContadorSolic = 0;

// ========================================================================
// UTILITÁRIOS
// ========================================================================
function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'toast' + (isError ? ' error' : '');
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 4000);
}

function formatDate(date) {
    let d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDisplay(dateStr) {
    if (!dateStr) return '';
    let parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function escapeHtml(text) {
    if (!text) return '';
    let div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function calcularIdade(dataNasc) {
    if (!dataNasc) return null;
    const hoje = new Date();
    const nasc = new Date(dataNasc);
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const mes = hoje.getMonth() - nasc.getMonth();
    if (mes < 0 || (mes === 0 && hoje.getDate() < nasc.getDate())) idade--;
    return idade;
}

function isDataPassada(dataStr) {
    if (!dataStr) return false;
    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    const data = new Date(dataStr + 'T00:00:00');
    return data < hoje;
}

function validarDataNaoPassada(dataStr, campoNome = 'Data') {
    if (isDataPassada(dataStr)) {
        showToast(`${campoNome} não pode ser no passado. Escolha hoje ou uma data futura.`, true);
        return false;
    }
    return true;
}

function atualizarIdadeDisplay() {
    const dataNasc = document.getElementById('pacienteDataNasc')?.value;
    const idade = calcularIdade(dataNasc);
    document.getElementById('idadeDisplay').innerHTML = idade !== null ? `Idade: ${idade} anos` : '';
}
document.addEventListener('change', function(e) {
    if (e.target.id === 'pacienteDataNasc') atualizarIdadeDisplay();
});

function atualizarIdadeSol() {
    const dataNasc = document.getElementById('solPacienteDataNasc')?.value;
    const idade = calcularIdade(dataNasc);
    document.getElementById('solIdadeDisplay').innerHTML = idade !== null ? `Idade: ${idade} anos` : '';
}
document.addEventListener('change', function(e) {
    if (e.target.id === 'solPacienteDataNasc') atualizarIdadeSol();
});

// Lógica dos checkboxes Encaixe/Neurodivergente/Deficiência Física
function setupEncaixeLogic(encaixeId, neuroId, defId) {
    const encaixe = document.getElementById(encaixeId);
    const neuro = document.getElementById(neuroId);
    const def = document.getElementById(defId);
    if (!encaixe || !neuro || !def) return;

    function update() {
        if (encaixe.checked) {
            neuro.checked = false;
            def.checked = false;
            neuro.disabled = true;
            def.disabled = true;
        } else {
            neuro.disabled = false;
            def.disabled = false;
        }
    }

    encaixe.addEventListener('change', update);
    neuro.addEventListener('change', function() {
        if (this.checked) {
            encaixe.checked = false;
            def.disabled = false;
        }
    });
    def.addEventListener('change', function() {
        if (this.checked) {
            encaixe.checked = false;
            neuro.disabled = false;
        }
    });

    update();
}

// ========================================================================
// NAVEGAÇÃO ENTRE PÁGINAS E SUB-PÁGINAS
// ========================================================================

// Navegar para uma página principal (Lista, Calendário, etc.)
function navegarPara(pageId) {
    // Ocultar todas as páginas
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(pageId);
    if (target) target.classList.add('active');

    // Atualizar menu lateral
    document.querySelectorAll('.menu-item').forEach(btn => btn.classList.remove('active'));
    const menuBtn = document.querySelector(`.menu-item[data-page="${pageId}"]`);
    if (menuBtn) menuBtn.classList.add('active');

    // Se for página admin, mostrar a primeira sub-página (Médicos) por padrão
    if (pageId === 'pageAdmin') {
        mostrarSubPage('medicos');
    }

    // Se for página de perfil, carregar dados
    if (pageId === 'pagePerfil') {
        document.getElementById('perfilNome').textContent = user.nome;
        document.getElementById('perfilUsername').textContent = user.username;
        document.getElementById('perfilTipo').textContent = user.tipo === 'admin' ? 'Administrador' : 'Vendedor';
        document.getElementById('perfilLoja').textContent = user.loja_nome || 'Não vinculado';
    }

    // Recarregar listas conforme a página
    if (pageId === 'pageLista') renderizarLista();
    if (pageId === 'pageCalendario') renderizarCalendario();
    if (pageId === 'pageDashboard' && user.tipo === 'admin') carregarDashboard();

    fecharMenu();
}

// Mostrar uma sub-página dentro do admin
function mostrarSubPage(subId) {
    if (user.tipo !== 'admin') {
        showToast('Acesso negado.', true);
        return;
    }

    // Ocultar todas as sub-páginas
    document.querySelectorAll('#pageAdmin .sub-page').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none'; // redundância
    });

    // Mostrar a sub-página alvo
    const targetId = 'sub' + subId.charAt(0).toUpperCase() + subId.slice(1);
    const target = document.getElementById(targetId);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
    }

    // Atualizar abas
    document.querySelectorAll('.admin-tabs .tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-sub') === subId) {
            btn.classList.add('active');
        }
    });

    // Carregar dados específicos
    if (subId === 'solicitacoes') carregarSolicitacoes();
    if (subId === 'whatsapp') carregarConfigWhatsapp();
    if (subId === 'usuarios') {
        renderUsuarios();
        preencherSelectLojas();
    }
    if (subId === 'lojas') carregarLojas();
    if (subId === 'configImpressao') carregarConfigImpressao();
    if (subId === 'medicos') {
        renderMedicos();
        document.getElementById('horariosMedico').style.display = 'none';
    }
    if (subId === 'pacientes') renderPacientes();
}

// ========================================================================
// MENU LATERAL (Hamburger)
// ========================================================================
function abrirMenu() {
    document.getElementById('sideMenu').classList.add('open');
    document.getElementById('menuOverlay').classList.add('show');
}

function fecharMenu() {
    document.getElementById('sideMenu').classList.remove('open');
    document.getElementById('menuOverlay').classList.remove('show');
}

// Inicializar eventos do menu
document.addEventListener('DOMContentLoaded', function() {
    const hamburger = document.getElementById('hamburgerBtn');
    const closeBtn = document.getElementById('closeMenuBtn');
    const overlay = document.getElementById('menuOverlay');

    if (hamburger) {
        hamburger.addEventListener('click', function(e) {
            e.stopPropagation();
            abrirMenu();
        });
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', fecharMenu);
    }
    if (overlay) {
        overlay.addEventListener('click', fecharMenu);
    }

    // Eventos dos itens do menu
    document.querySelectorAll('.menu-item').forEach(btn => {
        btn.addEventListener('click', function() {
            const page = this.getAttribute('data-page');
            const sub = this.getAttribute('data-sub');
            if (sub) {
                // Se tem sub, navega para página admin e mostra sub
                navegarPara('pageAdmin');
                mostrarSubPage(sub);
            } else if (page) {
                navegarPara(page);
            }
            fecharMenu();
        });
    });

    // Eventos das abas do admin (clique nas tabs)
    document.querySelectorAll('.admin-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const sub = this.getAttribute('data-sub');
            if (sub) mostrarSubPage(sub);
        });
    });
});

// ========================================================================
// LOGIN
// ========================================================================
async function fazerLogin() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await res.text();
            throw new Error(text || 'Erro no servidor');
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro no login');

        token = data.token;
        user = data.user;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        document.getElementById('loginDiv').style.display = 'none';
        document.getElementById('dashboardDiv').style.display = 'block';
        document.getElementById('userName').innerHTML = `👤 ${user.nome} (${user.tipo === 'admin' ? 'Admin' : 'Vendedor'})`;
        document.getElementById('menuUserName').textContent = user.nome;
        document.getElementById('menuUserTipo').textContent = user.tipo === 'admin' ? 'Administrador' : 'Vendedor';

        if (user.loja_nome) {
            document.getElementById('lojaNome').innerHTML = `🏢 ${user.loja_nome}`;
            document.getElementById('menuLojaNome').textContent = `🏢 ${user.loja_nome}`;
        }

        const isAdmin = user.tipo === 'admin';
        document.getElementById('menuAgendar').style.display = isAdmin ? 'block' : 'none';
        document.getElementById('menuDashboard').style.display = isAdmin ? 'block' : 'none';
        document.getElementById('menuAdmin').style.display = isAdmin ? 'block' : 'none';

        document.getElementById('perfilNome').textContent = user.nome;
        document.getElementById('perfilUsername').textContent = user.username;
        document.getElementById('perfilTipo').textContent = user.tipo === 'admin' ? 'Administrador' : 'Vendedor';
        document.getElementById('perfilLoja').textContent = user.loja_nome || 'Não vinculado';

        await carregarDados();
        renderizarLista();
        iniciarPollingLembretes();
        if (isAdmin) {
            iniciarPollingSolicitacoes();
            carregarDashboard();
            carregarLojas();
            carregarConfigImpressao();
        }
        fecharMenu();
        navegarPara('pageLista');

        setTimeout(() => {
            setupEncaixeLogic('pacienteEncaixe', 'pacienteNeurodivergente', 'pacienteDeficienciaFisica');
            setupEncaixeLogic('pacienteCadEncaixe', 'pacienteCadNeurodivergente', 'pacienteCadDeficienciaFisica');
            setupEncaixeLogic('solEncaixe', 'solNeurodivergente', 'solDeficienciaFisica');
            setupEncaixeLogic('novoPacienteEncaixe', 'novoPacienteNeurodivergente', 'novoPacienteDeficienciaFisica');
        }, 100);
    } catch (err) {
        document.getElementById('loginMsg').innerHTML = `<p style="color:red;">${err.message}</p>`;
        console.error(err);
    }
}

// ========================================================================
// CARREGAR DADOS
// ========================================================================
async function carregarDados() {
    try {
        const resConsultas = await fetch(`${API_URL}/consultas`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        let data = await resConsultas.json();
        consultas = data.map(c => ({ ...c, data_consulta: c.data_consulta || null, is_own: c.is_own === 1 }));
        console.log('Consultas carregadas:', consultas.length);

        const resMedicos = await fetch(`${API_URL}/medicos`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        medicos = await resMedicos.json();
        preencherSelectMedico();
        preencherSelectMedicoSol();

        const resClientes = await fetch(`${API_URL}/clientes`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        clientes = await resClientes.json();
        preencherSelectPacientes();

        renderizarLista();
        if (user.tipo === 'admin') {
            const resUsuarios = await fetch(`${API_URL}/usuarios`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            usuarios = await resUsuarios.json();
            renderUsuarios();
            renderMedicos();
            renderPacientes();
            atualizarBadgeSolicitacoes();
            carregarConfigWhatsapp();
            carregarDashboard();
        }
    } catch (err) {
        console.error('Erro ao carregar dados:', err);
        showToast('Erro ao carregar dados', true);
    }
}

// ========================================================================
// LOJAS (CRUD)
// ========================================================================
async function carregarLojas() {
    try {
        const res = await fetch(`${API_URL}/lojas`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        lojas = await res.json();
        renderLojas();
        preencherSelectLojas();
    } catch (err) {
        console.error('Erro ao carregar lojas:', err);
        showToast('Erro ao carregar lojas', true);
    }
}

function renderLojas() {
    const container = document.getElementById('lojasList');
    if (!container) return;
    if (lojas.length === 0) {
        container.innerHTML = '<p class="no-data">Nenhuma loja cadastrada.</p>';
        return;
    }
    container.innerHTML = lojas.map(l => `
        <div style="border-bottom:1px solid #ddd; padding:10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <strong>${escapeHtml(l.nome)}</strong><br>
                ${l.endereco || ''}
            </div>
            <div>
                <button onclick="editarLoja(${l.id})">✏️</button>
                <button onclick="excluirLoja(${l.id})">🗑️</button>
            </div>
        </div>
    `).join('');
}

function preencherSelectLojas() {
    const select = document.getElementById('usuarioLoja');
    if (select) {
        select.innerHTML = '<option value="">Selecione uma loja</option>' +
            lojas.map(l => `<option value="${l.id}">${l.nome}</option>`).join('');
    }
}

async function salvarLoja() {
    let nomeInput = document.getElementById('lojaNome');
    if (!nomeInput) {
        nomeInput = document.querySelector('input[name="lojaNome"]');
    }
    if (!nomeInput) {
        showToast('Erro: campo Nome não encontrado.', true);
        return;
    }
    let enderecoInput = document.getElementById('lojaEndereco');
    if (!enderecoInput) {
        enderecoInput = document.querySelector('input[name="lojaEndereco"]');
    }
    if (!enderecoInput) {
        showToast('Erro: campo Endereço não encontrado.', true);
        return;
    }
    const nome = nomeInput.value.trim();
    const endereco = enderecoInput.value.trim();
    if (nome === '') {
        showToast('O nome da loja é obrigatório.', true);
        return;
    }
    const editId = document.getElementById('editLojaId').value;
    const url = editId ? `${API_URL}/lojas/${editId}` : `${API_URL}/lojas`;
    const method = editId ? 'PUT' : 'POST';
    try {
        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ nome, endereco })
        });
        const result = await res.json();
        if (!res.ok) {
            throw new Error(result.error || 'Erro ao salvar loja');
        }
        showToast(editId ? 'Loja atualizada!' : 'Loja cadastrada!');
        cancelarEdicaoLoja();
        await carregarLojas();
        preencherSelectLojas();
    } catch (err) {
        showToast(err.message, true);
        console.error('Erro ao salvar loja:', err);
    }
}

function editarLoja(id) {
    const l = lojas.find(loj => loj.id === id);
    if (!l) return;
    document.getElementById('editLojaId').value = l.id;
    document.getElementById('lojaNome').value = l.nome || '';
    document.getElementById('lojaEndereco').value = l.endereco || '';
    document.getElementById('cancelLojaBtn').style.display = 'inline-block';
    mostrarSubPage('lojas');
}

function cancelarEdicaoLoja() {
    document.getElementById('editLojaId').value = '';
    document.getElementById('cancelLojaBtn').style.display = 'none';
    document.getElementById('lojaNome').value = '';
    document.getElementById('lojaEndereco').value = '';
}

async function excluirLoja(id) {
    if (!confirm('Excluir esta loja?')) return;
    try {
        await fetch(`${API_URL}/lojas/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        showToast('Excluída');
        await carregarLojas();
        preencherSelectLojas();
    } catch (err) {
        showToast(err.message, true);
    }
}

// ========================================================================
// PREENCHER SELECTS
// ========================================================================
function preencherSelectMedico() {
    const select = document.getElementById('medicoSelect');
    if (select) {
        select.innerHTML = '<option value="">Selecione um médico</option>' +
            medicos.map(m => `<option value="${m.id}">${m.nome} - ${m.especialidade}</option>`).join('');
    }
}

function preencherSelectMedicoSol() {
    const select = document.getElementById('solMedicoSelect');
    if (select) {
        select.innerHTML = '<option value="">Selecione um médico</option>' +
            medicos.map(m => `<option value="${m.id}">${m.nome} - ${m.especialidade}</option>`).join('');
    }
}

function preencherSelectPacientes() {
    const select = document.getElementById('pacienteSelect');
    if (select) {
        select.innerHTML = '<option value="">Selecione um paciente</option>' +
            clientes.map(p => `<option value="${p.id}">${p.nome} - ${p.telefone}</option>`).join('');
    }
}

// ========================================================================
// BUSCAR PACIENTE POR CPF
// ========================================================================
async function buscarPacientePorCpf() {
    const cpf = document.getElementById('buscarCpf').value.trim();
    if (!cpf) { showToast('Digite um CPF', true); return; }
    try {
        const res = await fetch(`${API_URL}/clientes/buscar?cpf=${cpf}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const paciente = await res.json();
        if (!paciente) { showToast('Não encontrado', true); return; }
        document.getElementById('pacienteNome').value = paciente.nome;
        document.getElementById('pacienteTelefone').value = paciente.telefone;
        document.getElementById('pacienteEmail').value = paciente.email || '';
        document.getElementById('pacienteCpf').value = paciente.cpf || '';
        document.getElementById('pacienteDataNasc').value = paciente.data_nascimento || '';
        document.getElementById('pacienteNeurodivergente').checked = paciente.neurodivergente === 1;
        document.getElementById('pacienteDeficienciaFisica').checked = paciente.deficiencia_fisica === 1;
        document.getElementById('pacienteEncaixe').checked = paciente.encaixe === 1;
        document.getElementById('pacienteSelect').value = paciente.id;
        atualizarIdadeDisplay();
        setupEncaixeLogic('pacienteEncaixe', 'pacienteNeurodivergente', 'pacienteDeficienciaFisica');
        showToast('Paciente encontrado!');
    } catch (err) {
        showToast('Erro: ' + err.message, true);
    }
}

function limparBuscaPaciente() {
    document.getElementById('buscarCpf').value = '';
    document.getElementById('pacienteNome').value = '';
    document.getElementById('pacienteTelefone').value = '';
    document.getElementById('pacienteEmail').value = '';
    document.getElementById('pacienteCpf').value = '';
    document.getElementById('pacienteDataNasc').value = '';
    document.getElementById('pacienteNeurodivergente').checked = false;
    document.getElementById('pacienteDeficienciaFisica').checked = false;
    document.getElementById('pacienteEncaixe').checked = true;
    document.getElementById('pacienteSelect').value = '';
    document.getElementById('idadeDisplay').innerHTML = '';
    setupEncaixeLogic('pacienteEncaixe', 'pacienteNeurodivergente', 'pacienteDeficienciaFisica');
}

async function buscarPacienteSol() {
    const cpf = document.getElementById('solBuscarCpf').value.trim();
    if (!cpf) { showToast('Digite um CPF', true); return; }
    try {
        const res = await fetch(`${API_URL}/clientes/buscar?cpf=${cpf}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const paciente = await res.json();
        if (!paciente) { showToast('Não encontrado', true); return; }
        document.getElementById('solPacienteNome').value = paciente.nome;
        document.getElementById('solPacienteTelefone').value = paciente.telefone;
        document.getElementById('solPacienteEmail').value = paciente.email || '';
        document.getElementById('solPacienteCpf').value = paciente.cpf || '';
        document.getElementById('solPacienteDataNasc').value = paciente.data_nascimento || '';
        document.getElementById('solNeurodivergente').checked = paciente.neurodivergente === 1;
        document.getElementById('solDeficienciaFisica').checked = paciente.deficiencia_fisica === 1;
        document.getElementById('solEncaixe').checked = paciente.encaixe === 1;
        atualizarIdadeSol();
        setupEncaixeLogic('solEncaixe', 'solNeurodivergente', 'solDeficienciaFisica');
        showToast('Paciente encontrado!');
    } catch (err) {
        showToast('Erro: ' + err.message, true);
    }
}

// ========================================================================
// CRUD DE PACIENTES
// ========================================================================
async function salvarPaciente() {
    const data = {
        nome: document.getElementById('pacienteCadNome').value,
        telefone: document.getElementById('pacienteCadTelefone').value,
        email: document.getElementById('pacienteCadEmail').value,
        cpf: document.getElementById('pacienteCadCpf').value,
        data_nascimento: document.getElementById('pacienteCadDataNasc').value,
        neurodivergente: document.getElementById('pacienteCadNeurodivergente').checked ? 1 : 0,
        deficiencia_fisica: document.getElementById('pacienteCadDeficienciaFisica').checked ? 1 : 0,
        encaixe: document.getElementById('pacienteCadEncaixe').checked ? 1 : 0
    };
    const editId = document.getElementById('editPacienteId').value;
    const url = editId ? `${API_URL}/clientes/${editId}` : `${API_URL}/clientes`;
    const method = editId ? 'PUT' : 'POST';
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Erro');
        showToast(editId ? 'Atualizado!' : 'Cadastrado!');
        cancelarEdicaoPaciente();
        await carregarDados();
    } catch (err) {
        showToast(err.message, true);
    }
}

function renderPacientes() {
    const container = document.getElementById('pacientesList');
    if (!container) return;
    if (clientes.length === 0) {
        container.innerHTML = '<p class="no-data">Nenhum paciente cadastrado.</p>';
        return;
    }
    container.innerHTML = clientes.map(p => `
        <div style="border-bottom:1px solid #ddd; padding:10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <strong>${escapeHtml(p.nome)}</strong><br>
                📞 ${p.telefone} ${p.email ? '✉️ ' + p.email : ''} ${p.cpf ? 'CPF: ' + p.cpf : ''}
            </div>
            <div>
                <button onclick="editarPaciente(${p.id})">✏️</button>
                <button onclick="excluirPaciente(${p.id})">🗑️</button>
            </div>
        </div>
    `).join('');
}

function editarPaciente(id) {
    const p = clientes.find(c => c.id === id);
    if (!p) return;
    document.getElementById('editPacienteId').value = p.id;
    document.getElementById('pacienteCadNome').value = p.nome;
    document.getElementById('pacienteCadTelefone').value = p.telefone;
    document.getElementById('pacienteCadEmail').value = p.email || '';
    document.getElementById('pacienteCadCpf').value = p.cpf || '';
    document.getElementById('pacienteCadDataNasc').value = p.data_nascimento || '';
    document.getElementById('pacienteCadNeurodivergente').checked = p.neurodivergente === 1;
    document.getElementById('pacienteCadDeficienciaFisica').checked = p.deficiencia_fisica === 1;
    document.getElementById('pacienteCadEncaixe').checked = p.encaixe === 1;
    document.getElementById('cancelPacienteBtn').style.display = 'inline-block';
    mostrarSubPage('pacientes');
    setupEncaixeLogic('pacienteCadEncaixe', 'pacienteCadNeurodivergente', 'pacienteCadDeficienciaFisica');
}

function cancelarEdicaoPaciente() {
    document.getElementById('editPacienteId').value = '';
    document.getElementById('cancelPacienteBtn').style.display = 'none';
    document.getElementById('pacienteCadNome').value = '';
    document.getElementById('pacienteCadTelefone').value = '';
    document.getElementById('pacienteCadEmail').value = '';
    document.getElementById('pacienteCadCpf').value = '';
    document.getElementById('pacienteCadDataNasc').value = '';
    document.getElementById('pacienteCadNeurodivergente').checked = false;
    document.getElementById('pacienteCadDeficienciaFisica').checked = false;
    document.getElementById('pacienteCadEncaixe').checked = true;
    setupEncaixeLogic('pacienteCadEncaixe', 'pacienteCadNeurodivergente', 'pacienteCadDeficienciaFisica');
}

async function excluirPaciente(id) {
    if (!confirm('Excluir este paciente?')) return;
    try {
        await fetch(`${API_URL}/clientes/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        showToast('Excluído');
        await carregarDados();
    } catch (err) {
        showToast(err.message, true);
    }
}

// ========================================================================
// MODAL NOVO PACIENTE
// ========================================================================
function abrirModalCadastroPaciente() {
    document.getElementById('modalCadastroPaciente').classList.add('show');
    document.getElementById('novoPacienteMsg').innerHTML = '';
    document.getElementById('novoPacienteNome').value = '';
    document.getElementById('novoPacienteTelefone').value = '';
    document.getElementById('novoPacienteEmail').value = '';
    document.getElementById('novoPacienteCpf').value = '';
    document.getElementById('novoPacienteDataNasc').value = '';
    document.getElementById('novoPacienteNeurodivergente').checked = false;
    document.getElementById('novoPacienteDeficienciaFisica').checked = false;
    document.getElementById('novoPacienteEncaixe').checked = true;
    setupEncaixeLogic('novoPacienteEncaixe', 'novoPacienteNeurodivergente', 'novoPacienteDeficienciaFisica');
}

function fecharModalCadastroPaciente() {
    document.getElementById('modalCadastroPaciente').classList.remove('show');
}

async function salvarNovoPaciente() {
    const data = {
        nome: document.getElementById('novoPacienteNome').value,
        telefone: document.getElementById('novoPacienteTelefone').value,
        email: document.getElementById('novoPacienteEmail').value,
        cpf: document.getElementById('novoPacienteCpf').value,
        data_nascimento: document.getElementById('novoPacienteDataNasc').value,
        neurodivergente: document.getElementById('novoPacienteNeurodivergente').checked ? 1 : 0,
        deficiencia_fisica: document.getElementById('novoPacienteDeficienciaFisica').checked ? 1 : 0,
        encaixe: document.getElementById('novoPacienteEncaixe').checked ? 1 : 0
    };
    if (!data.nome || !data.telefone) {
        document.getElementById('novoPacienteMsg').innerHTML = '<p style="color:red;">Nome e telefone são obrigatórios.</p>';
        return;
    }
    try {
        const res = await fetch(`${API_URL}/clientes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Erro');
        showToast('Paciente cadastrado!');
        fecharModalCadastroPaciente();
        await carregarDados();
        const novoPaciente = clientes.find(p => p.cpf === data.cpf || (p.nome === data.nome && p.telefone === data.telefone));
        if (novoPaciente) {
            document.getElementById('pacienteSelect').value = novoPaciente.id;
            document.getElementById('pacienteNome').value = novoPaciente.nome;
            document.getElementById('pacienteTelefone').value = novoPaciente.telefone;
            document.getElementById('pacienteEmail').value = novoPaciente.email || '';
            document.getElementById('pacienteCpf').value = novoPaciente.cpf || '';
            document.getElementById('pacienteDataNasc').value = novoPaciente.data_nascimento || '';
            document.getElementById('pacienteNeurodivergente').checked = novoPaciente.neurodivergente === 1;
            document.getElementById('pacienteDeficienciaFisica').checked = novoPaciente.deficiencia_fisica === 1;
            document.getElementById('pacienteEncaixe').checked = novoPaciente.encaixe === 1;
            atualizarIdadeDisplay();
            setupEncaixeLogic('pacienteEncaixe', 'pacienteNeurodivergente', 'pacienteDeficienciaFisica');
        }
    } catch (err) {
        document.getElementById('novoPacienteMsg').innerHTML = `<p style="color:red;">${err.message}</p>`;
    }
}

// ========================================================================
// CRUD DE MÉDICOS
// ========================================================================
async function salvarMedico() {
    const data = {
        nome: document.getElementById('medicoNome').value,
        crm: document.getElementById('medicoCrm').value,
        telefone: document.getElementById('medicoTelefone').value,
        email: document.getElementById('medicoEmail').value,
        especialidade: document.getElementById('medicoEspecialidade').value,
        whatsapp: document.getElementById('medicoWhatsapp').value,
        endereco: document.getElementById('medicoEndereco').value,
        mensagem_padrao: document.getElementById('medicoMensagemPadrao').value
    };
    const editId = document.getElementById('editMedicoId').value;
    const url = editId ? `${API_URL}/medicos/${editId}` : `${API_URL}/medicos`;
    const method = editId ? 'PUT' : 'POST';
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Erro');
        showToast(editId ? 'Atualizado!' : 'Cadastrado!');
        cancelarEdicaoMedico();
        await carregarDados();
    } catch (err) {
        showToast(err.message, true);
    }
}

function renderMedicos() {
    const container = document.getElementById('medicosList');
    if (!container) return;
    if (medicos.length === 0) {
        container.innerHTML = '<p class="no-data">Nenhum médico cadastrado.</p>';
        return;
    }
    container.innerHTML = medicos.map(m => `
        <div style="border-bottom:1px solid #ddd; padding:10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <strong>${escapeHtml(m.nome)}</strong> (${m.crm})<br>
                ${m.especialidade} ${m.telefone ? '📞 ' + m.telefone : ''}
            </div>
            <div>
                <button onclick="editarMedico(${m.id})">✏️</button>
                <button onclick="excluirMedico(${m.id})">🗑️</button>
                <button onclick="gerenciarHorarios(${m.id})" class="btn-warning">⏰ Horários</button>
            </div>
        </div>
    `).join('');
}

function editarMedico(id) {
    const m = medicos.find(med => med.id === id);
    if (!m) return;
    document.getElementById('editMedicoId').value = m.id;
    document.getElementById('medicoNome').value = m.nome;
    document.getElementById('medicoCrm').value = m.crm;
    document.getElementById('medicoTelefone').value = m.telefone || '';
    document.getElementById('medicoEmail').value = m.email || '';
    document.getElementById('medicoEspecialidade').value = m.especialidade || '';
    document.getElementById('medicoWhatsapp').value = m.whatsapp || '';
    document.getElementById('medicoEndereco').value = m.endereco || '';
    document.getElementById('medicoMensagemPadrao').value = m.mensagem_padrao || '';
    document.getElementById('cancelMedicoBtn').style.display = 'inline-block';
    mostrarSubPage('medicos');
}

function cancelarEdicaoMedico() {
    document.getElementById('editMedicoId').value = '';
    document.getElementById('cancelMedicoBtn').style.display = 'none';
    document.getElementById('medicoNome').value = '';
    document.getElementById('medicoCrm').value = '';
    document.getElementById('medicoTelefone').value = '';
    document.getElementById('medicoEmail').value = '';
    document.getElementById('medicoEspecialidade').value = '';
    document.getElementById('medicoWhatsapp').value = '';
    document.getElementById('medicoEndereco').value = '';
    document.getElementById('medicoMensagemPadrao').value = '';
}

async function excluirMedico(id) {
    if (!confirm('Excluir este médico?')) return;
    try {
        await fetch(`${API_URL}/medicos/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        showToast('Excluído');
        await carregarDados();
    } catch (err) {
        showToast(err.message, true);
    }
}

// ========================================================================
// HORÁRIOS DOS MÉDICOS
// ========================================================================
function gerenciarHorarios(medicoId) {
    medicoSelecionadoId = medicoId;
    document.getElementById('horariosMedico').style.display = 'block';
    carregarHorarios(medicoId);
    document.getElementById('horariosMedico').scrollIntoView({ behavior: 'smooth' });
}

async function carregarHorarios(medicoId) {
    try {
        const res = await fetch(`${API_URL}/medicos/${medicoId}/horarios`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const horarios = await res.json();
        const container = document.getElementById('horariosList');
        if (horarios.length === 0) {
            container.innerHTML = '<p>Nenhum horário cadastrado.</p>';
            return;
        }
        const dias = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
        container.innerHTML = horarios.map(h => `
            <div class="horario-item">
                <span>${dias[h.dia_semana]} - ${h.hora_inicio} às ${h.hora_fim} (intervalo ${h.intervalo}min) ${!h.ativo ? '(Inativo)' : ''}</span>
                <div>
                    <button onclick="editarHorario(${h.id})" class="btn-warning">✏️</button>
                    <button onclick="excluirHorario(${h.id})" class="btn-danger">🗑️</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        showToast(err.message, true);
    }
}

async function adicionarHorarioMedico() {
    if (!medicoSelecionadoId) {
        showToast('Selecione um médico primeiro.', true);
        return;
    }
    const data = {
        dia_semana: parseInt(document.getElementById('horarioDiaSemana').value),
        hora_inicio: document.getElementById('horarioInicio').value,
        hora_fim: document.getElementById('horarioFim').value,
        intervalo: parseInt(document.getElementById('horarioIntervalo').value) || 30
    };
    const editId = document.getElementById('editHorarioId').value;
    const url = editId ? `${API_URL}/horarios/${editId}` : `${API_URL}/medicos/${medicoSelecionadoId}/horarios`;
    const method = editId ? 'PUT' : 'POST';
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Erro ao salvar horário');
        }
        showToast(editId ? 'Atualizado!' : 'Adicionado!');
        cancelarEdicaoHorario();
        carregarHorarios(medicoSelecionadoId);
    } catch (err) {
        showToast(err.message, true);
    }
}

async function editarHorario(id) {
    try {
        const res = await fetch(`${API_URL}/horarios/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Erro ao buscar horário');
        }
        const h = await res.json();
        if (!h) return;
        document.getElementById('editHorarioId').value = h.id;
        document.getElementById('horarioDiaSemana').value = h.dia_semana;
        document.getElementById('horarioInicio').value = h.hora_inicio;
        document.getElementById('horarioFim').value = h.hora_fim;
        document.getElementById('horarioIntervalo').value = h.intervalo || 30;
        document.getElementById('cancelHorarioBtn').style.display = 'inline-block';
        document.getElementById('horariosMedico').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
        showToast(err.message, true);
    }
}

function cancelarEdicaoHorario() {
    document.getElementById('editHorarioId').value = '';
    document.getElementById('cancelHorarioBtn').style.display = 'none';
    document.getElementById('horarioDiaSemana').value = '0';
    document.getElementById('horarioInicio').value = '08:00';
    document.getElementById('horarioFim').value = '17:00';
    document.getElementById('horarioIntervalo').value = '30';
}

async function excluirHorario(id) {
    if (!confirm('Excluir este horário?')) return;
    try {
        const res = await fetch(`${API_URL}/horarios/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Erro ao excluir');
        }
        showToast('Excluído');
        carregarHorarios(medicoSelecionadoId);
    } catch (err) {
        showToast(err.message, true);
    }
}

// ========================================================================
// CARREGAR HORÁRIOS DISPONÍVEIS (AGENDAMENTO)
// ========================================================================
async function carregarHorariosDisponiveis() {
    const medicoId = document.getElementById('medicoSelect').value;
    const data = document.getElementById('dataConsulta').value;
    const select = document.getElementById('horarioSelect');
    const msgDiv = document.getElementById('msgHorarios');

    select.innerHTML = '<option value="">Carregando...</option>';
    msgDiv.style.display = 'none';
    msgDiv.innerHTML = '';

    if (!medicoId || !data) {
        select.innerHTML = '<option value="">Selecione médico e data</option>';
        return;
    }

    if (isDataPassada(data)) {
        select.innerHTML = '<option value="">Data inválida</option>';
        msgDiv.style.display = 'block';
        msgDiv.innerHTML = '⚠️ Data não pode ser no passado.';
        return;
    }

    try {
        const res = await fetch(`${API_URL}/medicos/${medicoId}/horarios/disponiveis?data=${data}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const horarios = await res.json();
        if (horarios.error) {
            select.innerHTML = '<option value="">Nenhum horário disponível</option>';
            msgDiv.style.display = 'block';
            msgDiv.innerHTML = `⚠️ ${horarios.error}`;
            return;
        }
        if (horarios.length === 0) {
            select.innerHTML = '<option value="">Nenhum horário disponível</option>';
            msgDiv.style.display = 'block';
            msgDiv.innerHTML = '⚠️ Médico não possui horários disponíveis para esta data.';
            return;
        }
        select.innerHTML = '<option value="">Selecione um horário</option>' +
            horarios.map(h => `<option value="${h.horario}">${h.horario}</option>`).join('');
        msgDiv.style.display = 'none';
    } catch (err) {
        select.innerHTML = '<option value="">Erro ao carregar</option>';
        msgDiv.style.display = 'block';
        msgDiv.innerHTML = `⚠️ ${err.message}`;
    }
}

document.addEventListener('change', function(e) {
    if (e.target.id === 'medicoSelect' || e.target.id === 'dataConsulta') {
        carregarHorariosDisponiveis();
    }
});

// ========================================================================
// CARREGAR HORÁRIOS DISPONÍVEIS (SOLICITAÇÃO)
// ========================================================================
async function carregarHorariosDisponiveisSol() {
    const medicoId = document.getElementById('solMedicoSelect').value;
    const data = document.getElementById('solDataConsulta').value;
    const selects = [
        document.getElementById('solHorario1'),
        document.getElementById('solHorario2'),
        document.getElementById('solHorario3')
    ];
    const msgDiv = document.getElementById('solMsgHorarios');

    selects.forEach(s => s.innerHTML = '<option value="">Carregando...</option>');
    msgDiv.style.display = 'none';
    msgDiv.innerHTML = '';

    if (!medicoId || !data) {
        selects.forEach(s => s.innerHTML = '<option value="">Selecione médico e data</option>');
        return;
    }

    if (isDataPassada(data)) {
        selects.forEach(s => s.innerHTML = '<option value="">Data inválida</option>');
        msgDiv.style.display = 'block';
        msgDiv.innerHTML = '⚠️ Data não pode ser no passado.';
        return;
    }

    try {
        const res = await fetch(`${API_URL}/medicos/${medicoId}/horarios/disponiveis?data=${data}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const horarios = await res.json();
        if (horarios.error) {
            selects.forEach(s => s.innerHTML = '<option value="">Nenhum disponível</option>');
            msgDiv.style.display = 'block';
            msgDiv.innerHTML = `⚠️ ${horarios.error}`;
            return;
        }
        if (horarios.length === 0) {
            selects.forEach(s => s.innerHTML = '<option value="">Nenhum horário disponível</option>');
            msgDiv.style.display = 'block';
            msgDiv.innerHTML = '⚠️ Médico não possui horários disponíveis para esta data.';
            return;
        }
        const options = '<option value="">Selecione um horário</option>' +
            horarios.map(h => `<option value="${h.horario}">${h.horario}</option>`).join('');
        selects.forEach(s => s.innerHTML = options);
        msgDiv.style.display = 'none';
    } catch (err) {
        selects.forEach(s => s.innerHTML = '<option value="">Erro</option>');
        msgDiv.style.display = 'block';
        msgDiv.innerHTML = `⚠️ ${err.message}`;
    }
}

document.addEventListener('change', function(e) {
    if (e.target.id === 'solMedicoSelect' || e.target.id === 'solDataConsulta') {
        carregarHorariosDisponiveisSol();
    }
});

// ========================================================================
// CONSULTAS (CRUD)
// ========================================================================
async function salvarConsulta() {
    if (user.tipo !== 'admin') { showToast('Apenas administradores podem agendar.', true); return; }
    const pacienteId = document.getElementById('pacienteSelect').value;
    const pacienteNome = document.getElementById('pacienteNome').value;
    const pacienteTelefone = document.getElementById('pacienteTelefone').value;
    const dataConsulta = document.getElementById('dataConsulta').value;
    const horario = document.getElementById('horarioSelect').value;
    const medicoId = document.getElementById('medicoSelect').value;
    const medicoNome = medicos.find(m => m.id == medicoId)?.nome;
    const numeroPedido = document.getElementById('numeroPedido').value.trim() || null;

    if (!pacienteNome || !pacienteTelefone || !dataConsulta || !horario || !medicoId) {
        showToast('Preencha todos os campos obrigatórios!', true);
        return;
    }

    if (!validarDataNaoPassada(dataConsulta, 'Data da consulta')) return;

    const dados = {
        paciente_id: pacienteId || null,
        paciente_nome: pacienteNome,
        paciente_telefone: pacienteTelefone,
        paciente_email: document.getElementById('pacienteEmail').value,
        paciente_cpf: document.getElementById('pacienteCpf').value,
        data_nascimento: document.getElementById('pacienteDataNasc').value,
        neurodivergente: document.getElementById('pacienteNeurodivergente').checked ? 1 : 0,
        deficiencia_fisica: document.getElementById('pacienteDeficienciaFisica').checked ? 1 : 0,
        encaixe: document.getElementById('pacienteEncaixe').checked ? 1 : 0,
        data_consulta: dataConsulta,
        horario: horario,
        medico_id: parseInt(medicoId),
        medico_nome: medicoNome,
        observacoes: document.getElementById('observacoes').value,
        numero_pedido: numeroPedido
    };
    const url = editandoId ? `${API_URL}/consultas/${editandoId}` : `${API_URL}/consultas`;
    const method = editandoId ? 'PUT' : 'POST';
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(dados)
        });
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Erro'); }
        showToast(editandoId ? 'Atualizada!' : 'Agendada!');
        cancelarEdicao();
        await carregarDados();
        renderizarCalendario();
    } catch (err) {
        showToast(err.message, true);
    }
}

function renderizarLista() {
    const container = document.getElementById('consultasListMain');
    if (!container) return;
    if (consultas.length === 0) {
        container.innerHTML = '<p class="no-data">Nenhuma consulta agendada.</p>';
        return;
    }
    const isAdmin = user.tipo === 'admin';
    container.innerHTML = consultas.map(c => {
        const isOwn = c.is_own;
        const status = c.status || 'agendada';
        let statusClass = 'status-agendada';
        if (status === 'cancelada') statusClass = 'status-cancelada';
        else if (status === 'confirmada') statusClass = 'status-confirmada';
        else if (status === 'realizada') statusClass = 'status-realizada';

        const isRealizada = status === 'realizada';
        const podeEditar = isAdmin && !isRealizada && status !== 'cancelada';

        let actions = '';
        let extraClass = '';
        let infoHtml = '';
        const hasPedido = c.numero_pedido ? `<br><small>📦 Pedido: ${escapeHtml(c.numero_pedido)}</small>` : '';
        const lojaStr = c.loja_nome ? `<br><small>🏢 ${escapeHtml(c.loja_nome)}</small>` : '';

        if (isAdmin) {
            actions = `
                <div style="display:flex; gap:5px; flex-wrap:wrap;">
                    ${podeEditar ? `<button onclick="editarConsulta(${c.id})" class="btn-warning">✏️</button>` : ''}
                    ${podeEditar ? `<button onclick="cancelarConsulta(${c.id})" class="btn-danger">🚫</button>` : ''}
                    ${podeEditar ? `<button onclick="excluirConsulta(${c.id})" class="btn-danger">🗑️</button>` : ''}
                    ${podeEditar && status !== 'cancelada' && status !== 'realizada' && status !== 'confirmada' ? 
                        `<button onclick="confirmarConsulta(${c.id})" class="btn-success">✅ Confirmar</button>` : ''}
                    ${podeEditar && status !== 'cancelada' && status !== 'realizada' ? 
                        `<button onclick="processarConsulta(${c.id})" class="btn-process">🔄 Processar</button>` : ''}
                    <button onclick="enviarWhatsAppPaciente(${c.id})" class="btn-whatsapp">📱 WhatsApp</button>
                    <button onclick="enviarWhatsAppMedico(${c.id})" class="btn-medico">📱 Médico</button>
                    <button onclick="abrirModalImpressao(${c.id})" class="btn-print">🖨️ Imprimir Comprovante</button>
                </div>
            `;
            infoHtml = `
                <strong>${escapeHtml(c.paciente_nome)}</strong>
                <span class="${statusClass}">${status}</span><br>
                ${formatDisplay(c.data_consulta)} ${c.horario} | Dr. ${escapeHtml(c.medico_nome)}
                ${hasPedido}
                ${lojaStr}
                ${c.observacoes ? `<br><small>📝 ${escapeHtml(c.observacoes)}</small>` : ''}
                <br><small>👤 Vendedor: ${escapeHtml(c.vendedor_nome || 'Não informado')}</small>
            `;
        } else {
            if (isOwn) {
                actions = `
                    <div style="display:flex; gap:5px; flex-wrap:wrap;">
                        <button onclick="mostrarDetalhes(${c.id})" class="btn-primary">👁️ Ver</button>
                    </div>
                `;
                infoHtml = `
                    <strong>${escapeHtml(c.paciente_nome)}</strong>
                    <span class="${statusClass}">${status}</span><br>
                    ${formatDisplay(c.data_consulta)} ${c.horario} | Dr. ${escapeHtml(c.medico_nome)}
                    ${hasPedido}
                    ${lojaStr}
                    ${c.observacoes ? `<br><small>📝 ${escapeHtml(c.observacoes)}</small>` : ''}
                    <br><small>👤 Vendedor: ${escapeHtml(c.vendedor_nome || 'Não informado')}</small>
                `;
            } else {
                extraClass = 'other-vendor';
                infoHtml = `
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-weight:bold; color:#a0aec0;">⏰ Horário já agendado</span>
                        <span style="font-size:12px; color:#718096;">(${formatDisplay(c.data_consulta)} ${c.horario})</span>
                    </div>
                    <small style="color:#a0aec0;">Vendedor: ${escapeHtml(c.vendedor_nome || 'Não informado')}</small>
                `;
            }
        }

        const isRealizadaClass = isRealizada ? 'consulta-realizada' : '';
        return `<div class="consulta-card ${extraClass} ${isRealizadaClass}" onclick="mostrarDetalhes(${c.id})" style="cursor:pointer;">
            <div class="info">
                ${infoHtml}
            </div>
            ${actions}
        </div>`;
    }).join('');
}

// ========================================================================
// AÇÕES DE CONSULTAS
// ========================================================================
async function confirmarConsulta(id) {
    if (user.tipo !== 'admin') { showToast('Apenas administradores podem confirmar.', true); return; }
    const c = consultas.find(cons => cons.id === id);
    if (c && c.status === 'realizada') { showToast('Consulta já realizada.', true); return; }
    if (!confirm('Confirmar esta consulta?')) return;
    try {
        const res = await fetch(`${API_URL}/consultas/${id}/confirmar`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Erro'); }
        showToast('Consulta confirmada!');
        await carregarDados();
        renderizarCalendario();
    } catch (err) {
        showToast(err.message, true);
    }
}

async function processarConsulta(id) {
    if (user.tipo !== 'admin') { showToast('Apenas administradores podem processar.', true); return; }
    const c = consultas.find(cons => cons.id === id);
    if (c && c.status === 'realizada') { showToast('Consulta já foi processada.', true); return; }
    if (!confirm('Marcar esta consulta como REALIZADA? Esta ação é irreversível.')) return;
    try {
        const res = await fetch(`${API_URL}/consultas/${id}/processar`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Erro'); }
        showToast('Consulta processada (realizada)!');
        await carregarDados();
        renderizarCalendario();
        if (user.tipo === 'admin') carregarDashboard();
    } catch (err) {
        showToast(err.message, true);
    }
}

async function cancelarConsulta(id) {
    if (user.tipo !== 'admin') { showToast('Apenas administradores podem cancelar.', true); return; }
    const c = consultas.find(cons => cons.id === id);
    if (c && c.status === 'realizada') { showToast('Consulta já realizada. Não pode ser cancelada.', true); return; }
    if (!confirm('Cancelar esta consulta?')) return;
    try {
        const consulta = consultas.find(c => c.id === id);
        if (!consulta) return;
        const dados = { ...consulta, status: 'cancelada' };
        const res = await fetch(`${API_URL}/consultas/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(dados)
        });
        if (!res.ok) throw new Error('Erro ao cancelar');
        showToast('Consulta cancelada!');
        await carregarDados();
        renderizarCalendario();
    } catch (err) {
        showToast(err.message, true);
    }
}

async function excluirConsulta(id) {
    if (user.tipo !== 'admin') { showToast('Apenas administradores podem excluir.', true); return; }
    const c = consultas.find(cons => cons.id === id);
    if (c && c.status === 'realizada') { showToast('Consulta já realizada. Não pode ser excluída.', true); return; }
    if (!confirm('Excluir permanentemente?')) return;
    try {
        await fetch(`${API_URL}/consultas/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });
        showToast('Excluída!');
        await carregarDados();
        renderizarCalendario();
    } catch (err) {
        showToast(err.message, true);
    }
}

function editarConsulta(id) {
    if (user.tipo !== 'admin') { showToast('Apenas administradores podem editar.', true); return; }
    const c = consultas.find(c => c.id === id);
    if (!c) return;
    if (c.status === 'realizada') { showToast('Consulta já realizada. Não é possível editar.', true); return; }
    if (c.status === 'cancelada') { showToast('Consulta cancelada. Não é possível editar.', true); return; }
    editandoId = id;
    document.getElementById('pacienteNome').value = c.paciente_nome;
    document.getElementById('pacienteTelefone').value = c.paciente_telefone;
    document.getElementById('pacienteEmail').value = c.paciente_email || '';
    document.getElementById('pacienteCpf').value = c.paciente_cpf || '';
    document.getElementById('pacienteDataNasc').value = c.data_nascimento || '';
    document.getElementById('dataConsulta').value = c.data_consulta;
    document.getElementById('horarioSelect').value = c.horario;
    document.getElementById('medicoSelect').value = c.medico_id;
    document.getElementById('observacoes').value = c.observacoes || '';
    document.getElementById('numeroPedido').value = c.numero_pedido || '';
    document.getElementById('cancelEditBtn').style.display = 'inline-block';
    const paciente = clientes.find(p => p.nome === c.paciente_nome && p.telefone === c.paciente_telefone);
    if (paciente) {
        document.getElementById('pacienteDataNasc').value = paciente.data_nascimento || '';
        document.getElementById('pacienteNeurodivergente').checked = paciente.neurodivergente === 1;
        document.getElementById('pacienteDeficienciaFisica').checked = paciente.deficiencia_fisica === 1;
        document.getElementById('pacienteEncaixe').checked = paciente.encaixe === 1;
        document.getElementById('pacienteSelect').value = paciente.id;
        atualizarIdadeDisplay();
        setupEncaixeLogic('pacienteEncaixe', 'pacienteNeurodivergente', 'pacienteDeficienciaFisica');
    }
    carregarHorariosDisponiveis();
    navegarPara('pageAgendar');
}

function cancelarEdicao() {
    editandoId = null;
    document.getElementById('pacienteSelect').value = '';
    document.getElementById('pacienteNome').value = '';
    document.getElementById('pacienteTelefone').value = '';
    document.getElementById('pacienteEmail').value = '';
    document.getElementById('pacienteCpf').value = '';
    document.getElementById('pacienteDataNasc').value = '';
    document.getElementById('pacienteNeurodivergente').checked = false;
    document.getElementById('pacienteDeficienciaFisica').checked = false;
    document.getElementById('pacienteEncaixe').checked = true;
    document.getElementById('dataConsulta').value = '';
    document.getElementById('horarioSelect').value = '';
    document.getElementById('medicoSelect').value = '';
    document.getElementById('observacoes').value = '';
    document.getElementById('numeroPedido').value = '';
    document.getElementById('cancelEditBtn').style.display = 'none';
    document.getElementById('idadeDisplay').innerHTML = '';
    document.getElementById('buscarCpf').value = '';
    const msgDiv = document.getElementById('msgHorarios');
    if (msgDiv) {
        msgDiv.style.display = 'none';
        msgDiv.innerHTML = '';
    }
    setupEncaixeLogic('pacienteEncaixe', 'pacienteNeurodivergente', 'pacienteDeficienciaFisica');
}

// ========================================================================
// IMPRESSÃO
// ========================================================================
function abrirModalImpressao(id) {
    consultaParaImprimir = id;
    document.getElementById('modalImpressao').classList.add('show');
}

function fecharModalImpressao() {
    document.getElementById('modalImpressao').classList.remove('show');
}

function imprimirComprovanteSelecionado(tipo) {
    const id = consultaParaImprimir;
    fecharModalImpressao();
    if (id) {
        gerarComprovante(id, tipo);
    } else {
        showToast('Erro: nenhuma consulta selecionada.', true);
    }
}

function getPrintConfig() {
    const config = localStorage.getItem('printConfig');
    if (config) {
        return JSON.parse(config);
    }
    return { marginLeft: 20, marginRight: 20, marginTop: 20, headerHeight: 80 };
}

function gerarComprovante(id, tipo) {
    const c = consultas.find(cons => cons.id === id);
    if (!c) {
        showToast('Consulta não encontrada.', true);
        return;
    }

    let condicao = 'Encaixe';
    let paciente = null;
    if (c.paciente_cpf) {
        paciente = clientes.find(p => p.cpf === c.paciente_cpf);
    }
    if (!paciente) {
        paciente = clientes.find(p => p.nome === c.paciente_nome && p.telefone === c.paciente_telefone);
    }
    if (paciente) {
        if (paciente.neurodivergente && paciente.deficiencia_fisica) condicao = 'Neurodivergente e Def. Física';
        else if (paciente.neurodivergente) condicao = 'Neurodivergente';
        else if (paciente.deficiencia_fisica) condicao = 'Deficiência Física';
        else if (paciente.encaixe) condicao = 'Encaixe';
    }

    const medico = medicos.find(m => m.id === c.medico_id);
    const enderecoMedico = medico ? medico.endereco : 'Endereço não informado';

    const lojaNome = c.loja_nome || user.loja_nome || 'Ótica Macaé';
    const lojaEndereco = c.loja_endereco || user.loja_endereco || '';
    const vendedorNome = c.vendedor_nome || user.nome || 'Não informado';

    const dataFormatada = formatDisplay(c.data_consulta);
    const status = c.status || 'agendada';
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    const pedido = c.numero_pedido || 'Não informado';

    const config = getPrintConfig();

    let html = `
        <div class="comprovante-container" style="padding-left:${config.marginLeft}px; padding-right:${config.marginRight}px; padding-top:${config.marginTop}px;">
            <div class="comprovante-conteudo">
                <div class="header-loja" style="font-size:22px; font-weight:700; margin-bottom:4px;">${escapeHtml(lojaNome)}</div>
                ${lojaEndereco ? `<div class="header-endereco-loja" style="font-size:14px; color:#4a5568; margin-bottom:12px;">${escapeHtml(lojaEndereco)}</div>` : ''}
                <div class="header-vendedor" style="font-size:14px; color:#4a5568; margin-bottom:16px; font-weight:500;">Vendedor: ${escapeHtml(vendedorNome)}</div>
                <h2 style="text-align:center; border-bottom:2px solid #2d3748; padding-bottom:10px; font-size:20px; font-weight:600; color:#2d3748; margin-bottom:16px; word-wrap:break-word; overflow-wrap:break-word;">Comprovante de Consulta</h2>
                <div class="detalhe" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed #e2e8f0; font-size:15px; color:#2d3748; word-wrap:break-word; overflow-wrap:break-word;">
                    <span class="label" style="font-weight:600; color:#4a5568; flex-shrink:0;">Paciente:</span>
                    <span class="valor" style="font-weight:500; text-align:right; word-wrap:break-word; overflow-wrap:break-word; max-width:60%;">${escapeHtml(c.paciente_nome)}</span>
                </div>
                <div class="detalhe" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed #e2e8f0; font-size:15px; color:#2d3748; word-wrap:break-word; overflow-wrap:break-word;">
                    <span class="label" style="font-weight:600; color:#4a5568; flex-shrink:0;">Data:</span>
                    <span class="valor" style="font-weight:500; text-align:right; word-wrap:break-word; overflow-wrap:break-word; max-width:60%;">${dataFormatada}</span>
                </div>
                <div class="detalhe" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed #e2e8f0; font-size:15px; color:#2d3748; word-wrap:break-word; overflow-wrap:break-word;">
                    <span class="label" style="font-weight:600; color:#4a5568; flex-shrink:0;">Horário:</span>
                    <span class="valor" style="font-weight:500; text-align:right; word-wrap:break-word; overflow-wrap:break-word; max-width:60%;">${c.horario}</span>
                </div>
                <div class="detalhe" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed #e2e8f0; font-size:15px; color:#2d3748; word-wrap:break-word; overflow-wrap:break-word;">
                    <span class="label" style="font-weight:600; color:#4a5568; flex-shrink:0;">Médico:</span>
                    <span class="valor" style="font-weight:500; text-align:right; word-wrap:break-word; overflow-wrap:break-word; max-width:60%;">Dr. ${escapeHtml(c.medico_nome)}</span>
                </div>
                <div class="detalhe" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed #e2e8f0; font-size:15px; color:#2d3748; word-wrap:break-word; overflow-wrap:break-word;">
                    <span class="label" style="font-weight:600; color:#4a5568; flex-shrink:0;">Status:</span>
                    <span class="valor" style="font-weight:500; text-align:right; word-wrap:break-word; overflow-wrap:break-word; max-width:60%;">${statusLabel}</span>
                </div>
                <div class="detalhe" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed #e2e8f0; font-size:15px; color:#2d3748; word-wrap:break-word; overflow-wrap:break-word;">
                    <span class="label" style="font-weight:600; color:#4a5568; flex-shrink:0;">Condição:</span>
                    <span class="valor" style="font-weight:500; text-align:right; word-wrap:break-word; overflow-wrap:break-word; max-width:60%;">${condicao}</span>
                </div>
                <div class="detalhe" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed #e2e8f0; font-size:15px; color:#2d3748; word-wrap:break-word; overflow-wrap:break-word;">
                    <span class="label" style="font-weight:600; color:#4a5568; flex-shrink:0;">Pedido:</span>
                    <span class="valor" style="font-weight:500; text-align:right; word-wrap:break-word; overflow-wrap:break-word; max-width:60%;">${pedido}</span>
                </div>
                ${c.observacoes ? `<div class="detalhe" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed #e2e8f0; font-size:15px; color:#2d3748; word-wrap:break-word; overflow-wrap:break-word;">
                    <span class="label" style="font-weight:600; color:#4a5568; flex-shrink:0;">Observações:</span>
                    <span class="valor" style="font-weight:500; text-align:right; word-wrap:break-word; overflow-wrap:break-word; max-width:60%;">${escapeHtml(c.observacoes)}</span>
                </div>` : ''}
                
                <div class="rodape-medico" style="margin-top:16px; padding-top:12px; border-top:2px solid #2d3748; text-align:center; font-size:15px; font-weight:500; color:#2d3748; word-wrap:break-word; overflow-wrap:break-word;">
                    <div>Endereço do médico:</div>
                    <div class="endereco-medico" style="font-weight:400; color:#4a5568; font-size:15px; word-wrap:break-word; overflow-wrap:break-word;">${escapeHtml(enderecoMedico)}</div>
                </div>
                <div class="rodape-final" style="text-align:center; font-size:12px; color:#a0aec0; margin-top:12px; border-top:1px solid #e2e8f0; padding-top:10px; word-wrap:break-word; overflow-wrap:break-word;">Este comprovante é válido como comprovação de agendamento.</div>
            </div>
            <button onclick="fecharComprovante()" class="no-print" style="display:block; margin:16px auto 0 auto; padding:8px 24px; background:#e53e3e; color:white; border:none; border-radius:6px; cursor:pointer; font-size:14px;">Fechar</button>
        </div>
    `;

    if (tipo === 'bobina') {
        html = html.replace('comprovante-container', 'comprovante-container comprovante-bobina');
        html = html.replace(/font-size:22px/g, 'font-size:18px');
        html = html.replace(/font-size:14px/g, 'font-size:11px');
        html = html.replace(/font-size:15px/g, 'font-size:11px');
        html = html.replace(/padding:6px 0/g, 'padding:3px 0');
        html = html.replace(/font-size:20px/g, 'font-size:15px');
        html = html.replace(/font-size:16px/g, 'font-size:13px');
    }

    const comprovanteDiv = document.getElementById('comprovante');
    comprovanteDiv.innerHTML = html;
    comprovanteDiv.style.display = 'block';

    setTimeout(() => {
        window.print();
    }, 300);
}

function fecharComprovante() {
    document.getElementById('comprovante').style.display = 'none';
    document.getElementById('comprovante').innerHTML = '';
    consultaParaImprimir = null;
}

// ========================================================================
// CALENDÁRIO
// ========================================================================
function renderizarCalendario() {
    const container = document.getElementById('calendarioContainer');
    if (!container) return;

    const titulo = document.getElementById('tituloCalendario');
    const nomeMes = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    titulo.textContent = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);

    if (currentView === 'week') renderizarSemana(container);
    else if (currentView === 'month') renderizarMes(container);
    else renderizarDia(container);

    document.querySelectorAll('.view-buttons button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll(`.view-buttons button[onclick*="${currentView}"]`).forEach(btn => btn.classList.add('active'));
}

function renderizarMes(container) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = formatDate(new Date());
    
    let html = `<div class="mes-grid">`;
    ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].forEach(d => {
        html += `<div style="font-weight:600; padding:8px; text-align:center; color:#4a5568;">${d}</div>`;
    });
    for (let i = 0; i < startDay; i++) {
        html += `<div class="dia-cell outro-mes"></div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
        let dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        let isToday = dateStr === today;
        let dayEvents = consultas.filter(c => c.data_consulta === dateStr);
        html += `<div class="dia-cell ${isToday ? 'dia-hoje' : ''}">
            <span class="dia-numero">${d}</span>`;
        const maxShow = 3;
        dayEvents.slice(0, maxShow).forEach(e => {
            html += `<div class="dia-consulta" onclick="mostrarDetalhes(${e.id})">
                <span class="horario">${e.horario}</span>
                <span class="paciente">${escapeHtml(e.paciente_nome.substring(0,12))}</span>
                <span class="medico">${escapeHtml(e.medico_nome)}</span>
            </div>`;
        });
        if (dayEvents.length > maxShow) {
            html += `<div class="dia-consulta mais">+ ${dayEvents.length - maxShow} mais</div>`;
        }
        html += `</div>`;
    }
    html += `</div>`;
    container.innerHTML = html;
}

function renderizarSemana(container) {
    let start = new Date(currentDate);
    start.setDate(currentDate.getDate() - currentDate.getDay());
    let days = [];
    for (let i = 0; i < 7; i++) {
        let d = new Date(start);
        d.setDate(start.getDate() + i);
        days.push(d);
    }
    let hours = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00'];
    
    let html = `<table class="semana-table"><thead><tr><th>Horário</th>`;
    days.forEach(day => {
        let dateStr = formatDate(day);
        let dayEvents = consultas.filter(c => c.data_consulta === dateStr);
        html += `<th>
            <span class="dia-semana">${day.toLocaleDateString('pt-BR', { weekday: 'short' })}</span>
            <span class="dia-numero">${day.getDate()}</span>
            <span style="font-size:12px; font-weight:400;">(${dayEvents.length})</span>
        </th>`;
    });
    html += `</tr></thead><tbody>`;
    hours.forEach(hour => {
        html += `<tr><td class="horario-label">${hour}</td>`;
        days.forEach(day => {
            let dateStr = formatDate(day);
            let hourEvents = consultas.filter(c => c.data_consulta === dateStr && c.horario === hour);
            html += `<td style="background: ${hourEvents.length > 0 ? '#f0f4ff' : 'white'};">`;
            hourEvents.forEach(e => {
                html += `<div class="consulta-item" onclick="mostrarDetalhes(${e.id})">
                    <span class="paciente-nome">${escapeHtml(e.paciente_nome)}</span>
                    <span class="medico-nome">${escapeHtml(e.medico_nome)}</span>
                </div>`;
            });
            html += `</td>`;
        });
        html += `</tr>`;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
}

function renderizarDia(container) {
    let dateStr = formatDate(currentDate);
    let dayEvents = consultas.filter(c => c.data_consulta === dateStr).sort((a,b) => a.horario.localeCompare(b.horario));
    
    let html = `<div style="background:linear-gradient(135deg,#667eea,#764ba2); color:white; padding:25px 20px; text-align:center; border-radius:12px; margin-bottom:25px; box-shadow:0 4px 12px rgba(102,126,234,0.3);">
        <h2 style="font-size:28px;">${currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</h2>
        <p style="font-size:18px; opacity:0.9; margin-top:5px;">${currentDate.toLocaleDateString('pt-BR', { weekday: 'long' })}</p>
        <p style="font-size:16px; margin-top:8px; background:rgba(255,255,255,0.2); display:inline-block; padding:4px 18px; border-radius:20px;">${dayEvents.length} consulta(s)</p>
    </div>`;
    
    if (dayEvents.length === 0) {
        html += `<div class="no-data" style="padding:40px; font-size:18px;">📭 Nenhuma consulta agendada para este dia.</div>`;
    } else {
        html += `<div class="dia-list">`;
        dayEvents.forEach(e => {
            html += `<div class="dia-card" onclick="mostrarDetalhes(${e.id})" style="cursor:pointer;">
                <div class="info">
                    <div class="horario">${e.horario}</div>
                    <div class="dados">
                        <span class="paciente">${escapeHtml(e.paciente_nome)}</span>
                        <span class="detalhes">
                            👨‍⚕️ <span class="medico">Dr. ${escapeHtml(e.medico_nome)}</span>
                            ${e.paciente_telefone ? ` 📞 ${e.paciente_telefone}` : ''}
                            ${e.observacoes ? ` 📝 ${escapeHtml(e.observacoes)}` : ''}
                        </span>
                    </div>
                </div>
                <div style="display:flex; gap:6px;">
                    <span style="background:#edf2f7; color:#4a5568; padding:2px 10px; border-radius:12px; font-size:11px;">${e.status || 'agendada'}</span>
                </div>
            </div>`;
        });
        html += `</div>`;
    }
    container.innerHTML = html;
}

// ========================================================================
// DASHBOARD
// ========================================================================
async function carregarDashboard() {
    if (user.tipo !== 'admin') return;
    try {
        const res = await fetch(`${API_URL}/dashboard`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro');

        document.getElementById('totalConsultas').textContent = data.total_consultas || 0;
        document.getElementById('totalMedicos').textContent = data.total_medicos || 0;
        document.getElementById('totalAgendadas').textContent = data.por_status?.agendada || 0;
        document.getElementById('totalConfirmadas').textContent = data.por_status?.confirmada || 0;
        document.getElementById('totalRealizadas').textContent = data.por_status?.realizada || 0;
        document.getElementById('totalCanceladas').textContent = data.por_status?.cancelada || 0;

        const container = document.getElementById('vendedoresRelatorio');
        if (!data.por_vendedor || data.por_vendedor.length === 0) {
            container.innerHTML = '<p style="padding:20px; color:#999;">Nenhum vendedor com consultas.</p>';
            return;
        }

        const maxTotal = Math.max(...data.por_vendedor.map(v => v.total), 1);
        let html = `<table>
            <thead>
                <tr>
                    <th>Vendedor</th>
                    <th style="text-align:center;">Total</th>
                    <th style="text-align:center;">Agendadas</th>
                    <th style="text-align:center;">Confirmadas</th>
                    <th style="text-align:center;">Realizadas</th>
                    <th style="text-align:center;">Canceladas</th>
                    <th style="min-width:120px;">Progresso</th>
                </tr>
            </thead>
            <tbody>`;
        data.por_vendedor.forEach(v => {
            const pct = Math.round((v.total / maxTotal) * 100);
            const barColor = v.total > 0 ? '#667eea' : '#e2e8f0';
            html += `<tr>
                <td><strong>${escapeHtml(v.vendedor_nome)}</strong></td>
                <td style="text-align:center; font-weight:600;">${v.total}</td>
                <td style="text-align:center;"><span class="badge-status badge-agendada">${v.agendadas}</span></td>
                <td style="text-align:center;"><span class="badge-status badge-confirmada">${v.confirmadas}</span></td>
                <td style="text-align:center;"><span class="badge-status badge-realizada">${v.realizadas}</span></td>
                <td style="text-align:center;"><span class="badge-status badge-cancelada">${v.canceladas}</span></td>
                <td>
                    <div class="barra-container">
                        <div class="barra">
                            <div class="preenchimento" style="width:${pct}%; background:${barColor};"></div>
                        </div>
                        <span style="font-size:12px; color:#4a5568; min-width:40px;">${pct}%</span>
                    </div>
                </td>
            </tr>`;
        });
        html += `</tbody></table>`;
        container.innerHTML = html;
    } catch (err) {
        console.error(err);
        showToast('Erro ao carregar dashboard', true);
    }
}

// ========================================================================
// ENVIO DE WHATSAPP
// ========================================================================
async function enviarWhatsAppPaciente(id) {
    if (user.tipo !== 'admin') { showToast('Apenas administradores podem enviar.', true); return; }
    const e = consultas.find(c => c.id === id);
    if (!e) return;

    const medico = medicos.find(m => m.id === e.medico_id);
    if (!medico) {
        showToast('Médico não encontrado.', true);
        return;
    }

    const mensagemPadrao = medico.mensagem_padrao || '';
    const enderecoMedico = medico.endereco || 'Endereço não informado';

    const paciente = clientes.find(p => p.nome === e.paciente_nome && p.telefone === e.paciente_telefone);
    let condicao = 'Encaixe';
    if (paciente) {
        if (paciente.neurodivergente && paciente.deficiencia_fisica) condicao = 'Neurodivergente e Def. Física';
        else if (paciente.neurodivergente) condicao = 'Neurodivergente';
        else if (paciente.deficiencia_fisica) condicao = 'Deficiência Física';
        else if (paciente.encaixe) condicao = 'Encaixe';
    }

    const lojaNome = e.loja_nome || user.loja_nome || 'Ótica Macaé';

    let msg = `${lojaNome}\n`;
    msg += `----------------------------------------\n`;
    msg += `GUIA DE CONSULTA\n`;
    msg += `----------------------------------------\n\n`;
    msg += `Paciente: ${e.paciente_nome}\n`;
    msg += `Data: ${formatDisplay(e.data_consulta)}\n`;
    msg += `Horário: ${e.horario}\n`;
    msg += `Médico: Dr. ${medico.nome}\n`;
    msg += `Endereço do atendimento: ${enderecoMedico}\n`;
    msg += `Condição: ${condicao}\n`;
    if (e.numero_pedido) {
        msg += `Pedido: #${e.numero_pedido}\n`;
    }
    if (mensagemPadrao) {
        msg += `\nMensagem do médico:\n${mensagemPadrao}\n`;
    }
    msg += `\n----------------------------------------\n`;
    msg += `Confirme sua presença respondendo a esta mensagem.`;

    const phone = e.paciente_telefone.replace(/\D/g, '');
    if (phone) {
        window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
        showToast('Número do paciente não disponível', true);
    }
}

async function enviarWhatsAppMedico(id) {
    if (user.tipo !== 'admin') { showToast('Apenas administradores podem enviar.', true); return; }
    const e = consultas.find(c => c.id === id);
    if (!e) return;
    const medico = medicos.find(m => m.id === e.medico_id);
    if (!medico || !medico.whatsapp) {
        showToast('Médico não possui WhatsApp cadastrado.', true);
        return;
    }
    const endereco = e.loja_endereco || user.loja_endereco || 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ';
    const lojaNome = e.loja_nome || user.loja_nome || 'Ótica Macaé';
    const paciente = clientes.find(p => p.nome === e.paciente_nome && p.telefone === e.paciente_telefone);
    let condicao = 'Encaixe';
    if (paciente) {
        if (paciente.neurodivergente && paciente.deficiencia_fisica) condicao = 'Neurodivergente e Def. Física';
        else if (paciente.neurodivergente) condicao = 'Neurodivergente';
        else if (paciente.deficiencia_fisica) condicao = 'Deficiência Física';
        else if (paciente.encaixe) condicao = 'Encaixe';
    }
    let msg = `Nova consulta agendada\n`;
    msg += `----------------------------------------\n`;
    msg += `${lojaNome}\n`;
    msg += `Paciente: ${e.paciente_nome}\n`;
    msg += `Data: ${formatDisplay(e.data_consulta)}\n`;
    msg += `Horário: ${e.horario}\n`;
    msg += `Telefone: ${e.paciente_telefone}\n`;
    msg += `Local: ${endereco}\n`;
    msg += `Condição: ${condicao}\n`;
    if (e.numero_pedido) {
        msg += `Pedido: #${e.numero_pedido}\n`;
    }

    const phone = medico.whatsapp.replace(/\D/g, '');
    if (phone) {
        window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
        showToast('WhatsApp do médico inválido', true);
    }
}

// ========================================================================
// USUÁRIOS
// ========================================================================
async function salvarUsuario() {
    if (user.tipo !== 'admin') { showToast('Apenas administradores podem criar usuários.', true); return; }
    const tipo = document.getElementById('usuarioTipo').value;
    const telefone = document.getElementById('usuarioTelefone').value;
    if (tipo === 'vendedor' && !telefone) {
        showToast('Telefone obrigatório para vendedor', true);
        return;
    }
    const data = {
        nome: document.getElementById('usuarioNome').value,
        username: document.getElementById('usuarioUsername').value,
        senha: document.getElementById('usuarioSenha').value || undefined,
        telefone: telefone,
        tipo: tipo,
        loja_id: document.getElementById('usuarioLoja').value || null
    };
    const editId = document.getElementById('editUsuarioId').value;
    const url = editId ? `${API_URL}/usuarios/${editId}` : `${API_URL}/usuarios`;
    const method = editId ? 'PUT' : 'POST';
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(data)
        });
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Erro'); }
        showToast(editId ? 'Atualizado' : 'Criado');
        cancelarEdicaoUsuario();
        await carregarDados();
        await carregarLojas();
    } catch (err) {
        showToast(err.message, true);
    }
}

function renderUsuarios() {
    const container = document.getElementById('usuariosList');
    if (!container) return;
    if (usuarios.length === 0) { container.innerHTML = '<p class="no-data">Nenhum usuário</p>'; return; }
    container.innerHTML = usuarios.map(u => `
        <div style="border-bottom:1px solid #ddd; padding:10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <strong>${escapeHtml(u.nome)}</strong><br>
                @${u.username} | ${u.tipo} ${u.telefone ? '📞 ' + u.telefone : ''}
                ${u.loja_nome ? `<br>🏢 ${escapeHtml(u.loja_nome)}` : ''}
            </div>
            <div>
                <button onclick="editarUsuario(${u.id})">✏️</button>
                ${u.username !== 'admin' ? `<button onclick="excluirUsuario(${u.id})">🗑️</button>` : ''}
            </div>
        </div>
    `).join('');
}

function editarUsuario(id) {
    if (user.tipo !== 'admin') { showToast('Apenas administradores podem editar usuários.', true); return; }
    const u = usuarios.find(user => user.id === id);
    if (!u) return;
    document.getElementById('editUsuarioId').value = u.id;
    document.getElementById('usuarioNome').value = u.nome;
    document.getElementById('usuarioUsername').value = u.username;
    document.getElementById('usuarioSenha').value = '';
    document.getElementById('usuarioTelefone').value = u.telefone || '';
    document.getElementById('usuarioTipo').value = u.tipo;
    document.getElementById('usuarioLoja').value = u.loja_id || '';
    document.getElementById('cancelUsuarioBtn').style.display = 'inline-block';
    mostrarSubPage('usuarios');
    preencherSelectLojas();
}

function cancelarEdicaoUsuario() {
    document.getElementById('editUsuarioId').value = '';
    document.getElementById('cancelUsuarioBtn').style.display = 'none';
    document.getElementById('usuarioNome').value = '';
    document.getElementById('usuarioUsername').value = '';
    document.getElementById('usuarioSenha').value = '';
    document.getElementById('usuarioTelefone').value = '';
    document.getElementById('usuarioTipo').value = 'vendedor';
    document.getElementById('usuarioLoja').value = '';
}

async function excluirUsuario(id) {
    if (user.tipo !== 'admin') { showToast('Apenas administradores podem excluir usuários.', true); return; }
    if (!confirm('Excluir?')) return;
    try {
        await fetch(`${API_URL}/usuarios/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        showToast('Excluído');
        await carregarDados();
    } catch (err) {
        showToast(err.message, true);
    }
}

// ========================================================================
// SOLICITAÇÕES
// ========================================================================
async function enviarSolicitacao() {
    const btn = document.getElementById('btnEnviarSolicitacao');
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    try {
        const dataConsulta = document.getElementById('solDataConsulta').value;
        if (!validarDataNaoPassada(dataConsulta, 'Data da consulta')) {
            btn.disabled = false;
            btn.textContent = 'Enviar Solicitação';
            return;
        }

        const medicoId = document.getElementById('solMedicoSelect').value;
        const medicoNome = medicos.find(m => m.id == medicoId)?.nome || '';
        const horario1 = document.getElementById('solHorario1').value;
        const horario2 = document.getElementById('solHorario2').value;
        const horario3 = document.getElementById('solHorario3').value;

        if (!medicoId) {
            document.getElementById('solMsg').innerHTML = '<p style="color:red;">Selecione um médico.</p>';
            btn.disabled = false;
            btn.textContent = 'Enviar Solicitação';
            return;
        }
        if (!dataConsulta) {
            document.getElementById('solMsg').innerHTML = '<p style="color:red;">Selecione uma data.</p>';
            btn.disabled = false;
            btn.textContent = 'Enviar Solicitação';
            return;
        }
        if (!horario1) {
            document.getElementById('solMsg').innerHTML = '<p style="color:red;">Selecione pelo menos o 1º horário.</p>';
            btn.disabled = false;
            btn.textContent = 'Enviar Solicitação';
            return;
        }

        const dados = {
            paciente_nome: document.getElementById('solPacienteNome').value.trim(),
            paciente_telefone: document.getElementById('solPacienteTelefone').value.trim(),
            paciente_email: document.getElementById('solPacienteEmail').value.trim(),
            paciente_cpf: document.getElementById('solPacienteCpf').value.trim(),
            data_nascimento: document.getElementById('solPacienteDataNasc').value,
            neurodivergente: document.getElementById('solNeurodivergente').checked ? 1 : 0,
            deficiencia_fisica: document.getElementById('solDeficienciaFisica').checked ? 1 : 0,
            encaixe: document.getElementById('solEncaixe').checked ? 1 : 0,
            data_consulta: dataConsulta,
            horario1: horario1,
            horario2: horario2,
            horario3: horario3,
            medico_id: parseInt(medicoId),
            medico_nome: medicoNome,
            observacoes: document.getElementById('solObservacoes').value.trim(),
            numero_pedido: document.getElementById('solNumeroPedido').value.trim() || null
        };

        if (!dados.paciente_nome || !dados.paciente_telefone) {
            document.getElementById('solMsg').innerHTML = '<p style="color:red;">Nome e telefone do paciente são obrigatórios.</p>';
            btn.disabled = false;
            btn.textContent = 'Enviar Solicitação';
            return;
        }

        const res = await fetch(`${API_URL}/solicitacoes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(dados)
        });

        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await res.text();
            throw new Error(text || 'Erro no servidor');
        }

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Erro ao enviar solicitação');

        document.getElementById('solMsg').innerHTML = '<p style="color:green;">✅ Solicitação enviada com sucesso! Aguarde aprovação.</p>';
        setTimeout(() => {
            document.getElementById('solMsg').innerHTML = '';
            document.getElementById('solPacienteNome').value = '';
            document.getElementById('solPacienteTelefone').value = '';
            document.getElementById('solPacienteEmail').value = '';
            document.getElementById('solPacienteCpf').value = '';
            document.getElementById('solPacienteDataNasc').value = '';
            document.getElementById('solNeurodivergente').checked = false;
            document.getElementById('solDeficienciaFisica').checked = false;
            document.getElementById('solEncaixe').checked = true;
            document.getElementById('solHorario1').value = '';
            document.getElementById('solHorario2').value = '';
            document.getElementById('solHorario3').value = '';
            document.getElementById('solObservacoes').value = '';
            document.getElementById('solNumeroPedido').value = '';
            document.getElementById('solIdadeDisplay').innerHTML = '';
            setupEncaixeLogic('solEncaixe', 'solNeurodivergente', 'solDeficienciaFisica');
        }, 3000);

    } catch (err) {
        document.getElementById('solMsg').innerHTML = `<p style="color:red;">❌ ${err.message}</p>`;
        console.error('Erro ao enviar solicitação:', err);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Enviar Solicitação';
    }
}

async function carregarSolicitacoes() {
    if (user.tipo !== 'admin') return;
    try {
        const res = await fetch(`${API_URL}/solicitacoes`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const lista = await res.json();
        const container = document.getElementById('solicitacoesList');
        if (!container) return;
        if (lista.length === 0) {
            container.innerHTML = '<p class="no-data">Nenhuma solicitação.</p>';
            return;
        }
        container.innerHTML = lista.map(s => {
            const horarios = [s.horario_sugerido1, s.horario_sugerido2, s.horario_sugerido3].filter(h => h);
            let horariosHtml = '';
            if (s.status === 'pendente') {
                horariosHtml = horarios.map(h => `
                    <label style="margin-right:10px;">
                        <input type="radio" name="horario_${s.id}" value="${h}" ${s.horario_escolhido === h ? 'checked' : ''}>
                        ${h}
                    </label>
                `).join('');
            }

            let actionsHtml = '';
            if (s.status === 'pendente') {
                actionsHtml = `
                    <div class="horario-radio-group">
                        ${horariosHtml}
                        <button onclick="aprovarSolicitacao(${s.id})" class="btn-success" style="margin-top:5px;">✅ Aprovar (selecionado)</button>
                        <button onclick="rejeitarSolicitacao(${s.id})" class="btn-danger" style="margin-top:5px;">❌ Rejeitar</button>
                    </div>
                `;
            }

            const hasPedido = s.numero_pedido ? `<br><small>📦 Pedido: ${escapeHtml(s.numero_pedido)}</small>` : '';

            return `
                <div style="border-bottom:1px solid #ddd; padding:10px; ${s.status === 'pendente' ? 'background:#fffbe6;' : ''}">
                    <div>
                        <strong>${escapeHtml(s.paciente_nome)}</strong> ${hasPedido}<br>
                        ${formatDisplay(s.data_consulta)} | Médico: ${s.medico_nome}<br>
                        <span style="font-size:12px; color:${s.status === 'pendente' ? 'orange' : s.status === 'aprovado' ? 'green' : 'red'};">Status: ${s.status}</span>
                        ${s.status === 'pendente' ? `<span style="font-size:11px; color:#999;"> | Solicitado por: ${escapeHtml(s.solicitante_nome)}</span>` : ''}
                        ${s.horario_escolhido ? `<br><strong>Horário escolhido: ${s.horario_escolhido}</strong>` : ''}
                    </div>
                    ${actionsHtml}
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error(err);
        document.getElementById('solicitacoesList').innerHTML = `<p style="color:red;">Erro: ${err.message}</p>`;
    }
}

async function aprovarSolicitacao(id) {
    if (user.tipo !== 'admin') { showToast('Apenas administradores podem aprovar.', true); return; }
    if (!confirm('Aprovar esta solicitação?')) return;
    const radio = document.querySelector(`input[name="horario_${id}"]:checked`);
    if (!radio) {
        showToast('Selecione um horário para aprovar.', true);
        return;
    }
    const horario_escolhido = radio.value;
    try {
        const res = await fetch(`${API_URL}/solicitacoes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status: 'aprovado', horario_escolhido })
        });
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Erro'); }
        showToast('Solicitação aprovada!');
        await carregarSolicitacoes();
        await carregarDados();
        renderizarCalendario();
        atualizarBadgeSolicitacoes();
    } catch (err) {
        showToast(err.message, true);
    }
}

async function rejeitarSolicitacao(id) {
    if (user.tipo !== 'admin') { showToast('Apenas administradores podem rejeitar.', true); return; }
    if (!confirm('Rejeitar esta solicitação?')) return;
    try {
        const res = await fetch(`${API_URL}/solicitacoes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status: 'rejeitado' })
        });
        if (!res.ok) throw new Error('Erro');
        showToast('Solicitação rejeitada.');
        await carregarSolicitacoes();
        atualizarBadgeSolicitacoes();
    } catch (err) {
        showToast(err.message, true);
    }
}

async function atualizarBadgeSolicitacoes() {
    if (user.tipo !== 'admin') return;
    try {
        const res = await fetch(`${API_URL}/solicitacoes/pendentes/count`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        const badge1 = document.getElementById('badgeSolicitacoes');
        const badge2 = document.getElementById('badgeSolicitacoesMenu');
        [badge1, badge2].forEach(b => {
            if (b) {
                b.textContent = data.total;
                b.style.display = data.total > 0 ? 'inline' : 'none';
            }
        });
        if (window._ultimoContadorSolic === undefined) window._ultimoContadorSolic = 0;
        if (data.total > window._ultimoContadorSolic && data.total > 0) {
            showToast(`📩 ${data.total} nova(s) solicitação(ões)`);
        }
        window._ultimoContadorSolic = data.total;
    } catch (err) { console.error(err); }
}

function iniciarPollingSolicitacoes() {
    if (user.tipo !== 'admin') return;
    atualizarBadgeSolicitacoes();
    setInterval(atualizarBadgeSolicitacoes, 30000);
}

// ========================================================================
// LEMBRETES
// ========================================================================
async function carregarLembretes() {
    try {
        const res = await fetch(`${API_URL}/lembretes`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const lista = await res.json();
        const container = document.getElementById('lembretesList');
        if (!container) return;
        if (lista.length === 0) { container.innerHTML = '<p>Nenhum lembrete pendente.</p>'; return; }
        container.innerHTML = lista.map(l => `
            <div style="border-bottom:1px solid #ddd; padding:10px;">
                <strong>${escapeHtml(l.destinatario_nome)}</strong> (${l.destinatario_tipo})<br>
                <span style="font-size:13px;">${escapeHtml(l.mensagem)}</span><br>
                <small>Enviar em: ${new Date(l.data_envio_programada).toLocaleString()}</small>
                <button onclick="marcarLembreteEnviado(${l.id})" class="btn-success" style="margin-left:10px;">✅ Simular envio</button>
            </div>
        `).join('');
        const badge = document.getElementById('badgeLembretes');
        if (badge) {
            badge.textContent = lista.length;
            badge.style.display = lista.length > 0 ? 'inline' : 'none';
        }
        if (lista.length > _ultimoContadorLembretes && lista.length > 0) {
            showToast(`🔔 ${lista.length} lembrete(s) pendente(s)`);
        }
        _ultimoContadorLembretes = lista.length;
    } catch (err) {
        console.error(err);
    }
}

function abrirModalLembretes() {
    document.getElementById('modalLembretes').classList.add('show');
    carregarLembretes();
}

function fecharModalLembretes() {
    document.getElementById('modalLembretes').classList.remove('show');
}

async function marcarLembreteEnviado(id) {
    try {
        await fetch(`${API_URL}/lembretes/${id}/enviar`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` }
        });
        showToast('Lembrete enviado!');
        carregarLembretes();
    } catch (err) {
        showToast(err.message, true);
    }
}

function iniciarPollingLembretes() {
    carregarLembretes();
    setInterval(carregarLembretes, 60000);
}

// ========================================================================
// WHATSAPP CONFIG
// ========================================================================
async function carregarConfigWhatsapp() {
    if (user.tipo !== 'admin') return;
    try {
        const res = await fetch(`${API_URL}/whatsapp/config`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        document.getElementById('whatsappNumero').value = data.numero || '';
        document.getElementById('whatsappEndereco').value = data.endereco_otica || '';
    } catch (err) { console.error(err); }
}

async function salvarConfigWhatsapp() {
    if (user.tipo !== 'admin') { showToast('Apenas administradores podem configurar.', true); return; }
    const data = {
        numero: document.getElementById('whatsappNumero').value,
        endereco_otica: document.getElementById('whatsappEndereco').value
    };
    try {
        const res = await fetch(`${API_URL}/whatsapp/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Erro');
        showToast('Configurações salvas!');
    } catch (err) {
        showToast(err.message, true);
    }
}

// ========================================================================
// PERFIL
// ========================================================================
function abrirModalPerfil() {
    navegarPara('pagePerfil');
}

async function salvarAlterarSenha() {
    const senhaAtual = document.getElementById('perfilSenhaAtual').value;
    const novaSenha = document.getElementById('perfilNovaSenha').value;
    const confirmar = document.getElementById('perfilConfirmarSenha').value;

    if (!senhaAtual || !novaSenha || !confirmar) {
        document.getElementById('perfilMsg').innerHTML = '<p style="color:red;">Preencha todos os campos.</p>';
        return;
    }
    if (novaSenha.length < 6) {
        document.getElementById('perfilMsg').innerHTML = '<p style="color:red;">Nova senha deve ter pelo menos 6 caracteres.</p>';
        return;
    }
    if (novaSenha !== confirmar) {
        document.getElementById('perfilMsg').innerHTML = '<p style="color:red;">As senhas não coincidem.</p>';
        return;
    }

    try {
        const res = await fetch(`${API_URL}/perfil/alterar-senha`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ senha_atual: senhaAtual, nova_senha: novaSenha })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro');
        document.getElementById('perfilMsg').innerHTML = `<p style="color:green;">${data.message}</p>`;
        setTimeout(() => {
            document.getElementById('perfilSenhaAtual').value = '';
            document.getElementById('perfilNovaSenha').value = '';
            document.getElementById('perfilConfirmarSenha').value = '';
            document.getElementById('perfilMsg').innerHTML = '';
            showToast('Senha alterada com sucesso!');
        }, 2000);
    } catch (err) {
        document.getElementById('perfilMsg').innerHTML = `<p style="color:red;">${err.message}</p>`;
    }
}

// ========================================================================
// CONFIGURAÇÕES DE IMPRESSÃO
// ========================================================================
function carregarConfigImpressao() {
    const config = localStorage.getItem('printConfig');
    if (config) {
        const parsed = JSON.parse(config);
        document.getElementById('printMarginLeft').value = parsed.marginLeft || 20;
        document.getElementById('printMarginRight').value = parsed.marginRight || 20;
        document.getElementById('printMarginTop').value = parsed.marginTop || 20;
        document.getElementById('printHeaderHeight').value = parsed.headerHeight || 80;
        document.getElementById('configImpressaoMsg').innerHTML = '<p style="color:green;">Configurações carregadas.</p>';
    } else {
        document.getElementById('printMarginLeft').value = 20;
        document.getElementById('printMarginRight').value = 20;
        document.getElementById('printMarginTop').value = 20;
        document.getElementById('printHeaderHeight').value = 80;
        document.getElementById('configImpressaoMsg').innerHTML = '<p style="color:#999;">Configurações padrão carregadas.</p>';
    }
}

function salvarConfigImpressao() {
    const config = {
        marginLeft: parseInt(document.getElementById('printMarginLeft').value) || 20,
        marginRight: parseInt(document.getElementById('printMarginRight').value) || 20,
        marginTop: parseInt(document.getElementById('printMarginTop').value) || 20,
        headerHeight: parseInt(document.getElementById('printHeaderHeight').value) || 80
    };
    localStorage.setItem('printConfig', JSON.stringify(config));
    document.getElementById('configImpressaoMsg').innerHTML = '<p style="color:green;">Configurações salvas com sucesso!</p>';
    setTimeout(() => {
        document.getElementById('configImpressaoMsg').innerHTML = '';
    }, 3000);
}

// ========================================================================
// NAVEGAÇÃO DO CALENDÁRIO
// ========================================================================
function mudarView(view) { currentView = view; renderizarCalendario(); }
function hoje() { currentDate = new Date(); renderizarCalendario(); }
function anterior() {
    if (currentView === 'month') currentDate.setMonth(currentDate.getMonth() - 1);
    else if (currentView === 'week') currentDate.setDate(currentDate.getDate() - 7);
    else currentDate.setDate(currentDate.getDate() - 1);
    renderizarCalendario();
}
function proximo() {
    if (currentView === 'month') currentDate.setMonth(currentDate.getMonth() + 1);
    else if (currentView === 'week') currentDate.setDate(currentDate.getDate() + 7);
    else currentDate.setDate(currentDate.getDate() + 1);
    renderizarCalendario();
}

// ========================================================================
// MODAL DE DETALHES
// ========================================================================
function mostrarDetalhes(id) {
    const e = consultas.find(c => c.id === id);
    if (!e) return;

    if (user.tipo !== 'admin' && !e.is_own) {
        showToast('Esta consulta foi agendada por outro vendedor. Você não pode visualizar os detalhes.', true);
        return;
    }

    const modal = document.getElementById('modalDetalhes');
    const body = document.getElementById('detalhesBody');

    const status = e.status || 'agendada';
    let statusHtml = '';
    if (status === 'cancelada') statusHtml = ' <span style="color:red;">(Cancelada)</span>';
    else if (status === 'confirmada') statusHtml = ' <span style="color:green;">(Confirmada)</span>';
    else if (status === 'realizada') statusHtml = ' <span style="color:blue;">(Realizada)</span>';

    const vendedor = e.vendedor_nome || 'Não informado';
    const isRealizada = status === 'realizada';
    const podeEditar = user.tipo === 'admin' && !isRealizada && status !== 'cancelada';

    let adminActions = '';
    if (user.tipo === 'admin') {
        adminActions = `
            ${podeEditar ? `<button onclick="editarConsulta(${e.id}); fecharModalDetalhes();" class="btn-warning" style="width:100%; margin-top:5px;">✏️ Editar</button>` : ''}
            ${podeEditar && status !== 'cancelada' && status !== 'realizada' && status !== 'confirmada' ? 
                `<button onclick="confirmarConsulta(${e.id}); fecharModalDetalhes();" class="btn-success" style="width:100%; margin-top:5px;">✅ Confirmar</button>` : ''}
            ${podeEditar && status !== 'cancelada' && status !== 'realizada' ? 
                `<button onclick="processarConsulta(${e.id}); fecharModalDetalhes();" class="btn-process" style="width:100%; margin-top:5px;">🔄 Processar</button>` : ''}
            ${podeEditar ? `<button onclick="cancelarConsulta(${e.id}); fecharModalDetalhes();" class="btn-danger" style="width:100%; margin-top:5px;">🚫 Cancelar</button>` : ''}
            ${!isRealizada ? `<button onclick="enviarWhatsAppPaciente(${e.id})" class="btn-whatsapp" style="width:100%; margin-top:5px;">📱 WhatsApp Paciente</button>` : ''}
            ${!isRealizada ? `<button onclick="enviarWhatsAppMedico(${e.id})" class="btn-medico" style="width:100%; margin-top:5px;">📱 WhatsApp Médico</button>` : ''}
            <button onclick="abrirModalImpressao(${e.id}); fecharModalDetalhes();" class="btn-print" style="width:100%; margin-top:5px;">🖨️ Imprimir Comprovante</button>
            ${isRealizada ? '<p style="color:#2b6cb0; font-weight:bold; margin-top:10px;">✅ Consulta já realizada. Nenhuma ação disponível.</p>' : ''}
        `;
    }

    const hasPedido = e.numero_pedido ? `<div><strong>Nº Pedido:</strong> ${escapeHtml(e.numero_pedido)}</div>` : '';
    const lojaStr = e.loja_nome ? `<div><strong>Loja:</strong> ${escapeHtml(e.loja_nome)}</div>` : '';

    body.innerHTML = `
        <div><strong>Paciente:</strong> ${escapeHtml(e.paciente_nome)}</div>
        <div><strong>Data/Hora:</strong> ${formatDisplay(e.data_consulta)} ${e.horario}</div>
        <div><strong>Médico:</strong> Dr. ${escapeHtml(e.medico_nome)}</div>
        <div><strong>Telefone:</strong> ${e.paciente_telefone}</div>
        ${e.paciente_email ? `<div><strong>E-mail:</strong> ${escapeHtml(e.paciente_email)}</div>` : ''}
        ${hasPedido}
        ${lojaStr}
        ${e.observacoes ? `<div><strong>Observações:</strong> ${escapeHtml(e.observacoes)}</div>` : ''}
        <div><strong>Status:</strong> ${status}${statusHtml}</div>
        <div><strong>Vendedor:</strong> ${escapeHtml(vendedor)}</div>
        <div style="margin-top:15px; display:flex; flex-direction:column; gap:5px;">
            ${adminActions}
        </div>
    `;
    modal.classList.add('show');
}

function fecharModalDetalhes() {
    document.getElementById('modalDetalhes').classList.remove('show');
}

// ========================================================================
// LOGOUT
// ========================================================================
function logout() {
    localStorage.clear();
    window.location.reload();
}

// ========================================================================
// AUTO LOGIN
// ========================================================================
(function() {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (savedToken && savedUser) {
        token = savedToken;
        user = JSON.parse(savedUser);
        fetch(`${API_URL}/verify`, {
            headers: { Authorization: `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
            if (data.valid) {
                document.getElementById('loginDiv').style.display = 'none';
                document.getElementById('dashboardDiv').style.display = 'block';
                document.getElementById('userName').innerHTML = `👤 ${user.nome} (${user.tipo === 'admin' ? 'Admin' : 'Vendedor'})`;
                document.getElementById('menuUserName').textContent = user.nome;
                document.getElementById('menuUserTipo').textContent = user.tipo === 'admin' ? 'Administrador' : 'Vendedor';

                if (user.loja_nome) {
                    document.getElementById('lojaNome').innerHTML = `🏢 ${user.loja_nome}`;
                    document.getElementById('menuLojaNome').textContent = `🏢 ${user.loja_nome}`;
                }

                const isAdmin = user.tipo === 'admin';
                document.getElementById('menuAgendar').style.display = isAdmin ? 'block' : 'none';
                document.getElementById('menuDashboard').style.display = isAdmin ? 'block' : 'none';
                document.getElementById('menuAdmin').style.display = isAdmin ? 'block' : 'none';

                document.getElementById('perfilNome').textContent = user.nome;
                document.getElementById('perfilUsername').textContent = user.username;
                document.getElementById('perfilTipo').textContent = user.tipo === 'admin' ? 'Administrador' : 'Vendedor';
                document.getElementById('perfilLoja').textContent = user.loja_nome || 'Não vinculado';

                carregarDados();
                renderizarLista();
                iniciarPollingLembretes();
                if (isAdmin) {
                    iniciarPollingSolicitacoes();
                    carregarDashboard();
                    carregarLojas();
                    carregarConfigImpressao();
                }
                setTimeout(() => {
                    setupEncaixeLogic('pacienteEncaixe', 'pacienteNeurodivergente', 'pacienteDeficienciaFisica');
                    setupEncaixeLogic('pacienteCadEncaixe', 'pacienteCadNeurodivergente', 'pacienteCadDeficienciaFisica');
                    setupEncaixeLogic('solEncaixe', 'solNeurodivergente', 'solDeficienciaFisica');
                    setupEncaixeLogic('novoPacienteEncaixe', 'novoPacienteNeurodivergente', 'novoPacienteDeficienciaFisica');
                }, 100);
                navegarPara('pageLista');
            } else {
                localStorage.clear();
            }
        })
        .catch(() => {
            localStorage.clear();
        });
    }
})();

// Fechar modais ao clicar fora
document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('show');
    });
});

console.log('✅ Sistema completo com configurações de impressão personalizáveis.');