const API_URL = window.location.origin + '/api';
const ITENS_POR_PAGINA = 20;

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
let paginaAtual = 1;
let _ultimoContadorLembretes = 0;
let _ultimoContadorSolic = 0;
let timeoutBusca = null;
let filtrosAtivos = false;

// ========================================================================
// UTILITÁRIOS E VALIDAÇÕES
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
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function formatDisplay(dateStr) {
  if (!dateStr) return '';
  let parts = dateStr.split('-');
  return parts[2] + '/' + parts[1] + '/' + parts[0];
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
  hoje.setHours(0, 0, 0, 0);
  const data = new Date(dataStr + 'T00:00:00');
  return data < hoje;
}

function validarDataNaoPassada(dataStr, campoNome = 'Data') {
  if (isDataPassada(dataStr)) {
    showToast(campoNome + ' não pode ser no passado.', true);
    return false;
  }
  return true;
}

function validarDataHoraNaoPassada(dataStr, horaStr, campoNome = 'Data/Hora') {
  if (!dataStr || !horaStr) return true;
  const dataHora = new Date(`${dataStr}T${horaStr}:00`);
  const agora = new Date();
  agora.setMilliseconds(0);
  if (dataHora < agora) {
    showToast(`${campoNome} não pode ser no passado.`, true);
    return false;
  }
  return true;
}

function validarDataNascimento(dataNasc) {
  if (!dataNasc) {
    showToast('Data de nascimento é obrigatória.', true);
    return false;
  }
  if (isNaN(new Date(dataNasc).getTime())) {
    showToast('Data de nascimento inválida.', true);
    return false;
  }
  return true;
}

function atualizarIdadeDisplay() {
  const dataNasc = document.getElementById('pacienteDataNasc')?.value;
  const idade = calcularIdade(dataNasc);
  document.getElementById('idadeDisplay').innerHTML = idade !== null ? 'Idade: ' + idade + ' anos' : '';
}
document.addEventListener('change', function(e) {
  if (e.target.id === 'pacienteDataNasc') atualizarIdadeDisplay();
});

function atualizarIdadeSol() {
  const dataNasc = document.getElementById('solPacienteDataNasc')?.value;
  const idade = calcularIdade(dataNasc);
  document.getElementById('solIdadeDisplay').innerHTML = idade !== null ? 'Idade: ' + idade + ' anos' : '';
}
document.addEventListener('change', function(e) {
  if (e.target.id === 'solPacienteDataNasc') atualizarIdadeSol();
});

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
// TEMA CLARO/ESCURO
// ========================================================================
function aplicarTema() {
  const tema = localStorage.getItem('theme') || 'light';
  if (tema === 'dark') {
    document.body.classList.add('dark-theme');
    const icon = document.querySelector('#themeToggle i');
    if (icon) icon.className = 'fas fa-sun';
  } else {
    document.body.classList.remove('dark-theme');
    const icon = document.querySelector('#themeToggle i');
    if (icon) icon.className = 'fas fa-moon';
  }
}

function toggleTheme() {
  const body = document.body;
  body.classList.toggle('dark-theme');
  const tema = body.classList.contains('dark-theme') ? 'dark' : 'light';
  localStorage.setItem('theme', tema);
  const icon = document.querySelector('#themeToggle i');
  if (icon) icon.className = tema === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

// ========================================================================
// NAVEGAÇÃO
// ========================================================================
function navegarPara(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(pageId);
  if (target) target.classList.add('active');
  document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('active'));
  const menuBtn = document.querySelector(`.menu-item[data-page="${pageId}"]`);
  if (menuBtn) menuBtn.classList.add('active');

  if (pageId === 'pageAdmin') mostrarSubPage('medicos');
  if (pageId === 'pagePerfil') {
    document.getElementById('perfilNome').textContent = user.nome;
    document.getElementById('perfilUsername').textContent = user.username;
    document.getElementById('perfilTipo').textContent = user.tipo === 'admin' ? 'Administrador' : user.tipo === 'consultorio' ? 'Consultório' : 'Vendedor';
    document.getElementById('perfilLoja').textContent = user.loja_nome || 'Não vinculado';
  }
  if (pageId === 'pageLista') {
    if (!filtrosAtivos) carregarDados();
    else renderizarLista(paginaAtual);
  }
  if (pageId === 'pageCalendario') renderizarCalendario();
  if (pageId === 'pageDashboard' && user.tipo === 'admin') carregarDashboard();
  fecharMenu();
}

function mostrarSubPage(subId) {
  if (user.tipo !== 'admin') { showToast('Acesso negado.', true); return; }
  document.querySelectorAll('#pageAdmin .sub-page').forEach(el => { el.classList.remove('active');
    el.style.display = 'none'; });
  const target = document.getElementById('sub' + subId.charAt(0).toUpperCase() + subId.slice(1));
  if (target) { target.classList.add('active');
    target.style.display = 'block'; }
  document.querySelectorAll('.admin-tabs .tab-btn').forEach(b => { b.classList.remove('active'); if (b.getAttribute('data-sub') === subId) b.classList.add('active'); });
  if (subId === 'solicitacoes') carregarSolicitacoes();
  if (subId === 'whatsapp') carregarConfigWhatsapp();
  if (subId === 'usuarios') { renderUsuarios();
    preencherSelectLojas(); }
  if (subId === 'lojas') carregarLojas();
  if (subId === 'configImpressao') carregarConfigImpressao();
  if (subId === 'medicos') { renderMedicos();
    document.getElementById('horariosMedico').style.display = 'none'; }
  if (subId === 'pacientes') renderPacientes();
}

function abrirMenu() {
  document.getElementById('sideMenu').classList.add('open');
  document.getElementById('menuOverlay').classList.add('show');
}

function fecharMenu() {
  document.getElementById('sideMenu').classList.remove('open');
  document.getElementById('menuOverlay').classList.remove('show');
}

// ========================================================================
// INICIALIZAÇÃO DOS EVENTOS (DOMContentLoaded)
// ========================================================================
document.addEventListener('DOMContentLoaded', function() {
  aplicarTema();
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
  const hamburger = document.getElementById('hamburgerBtn');
  const closeBtn = document.getElementById('closeMenuBtn');
  const overlay = document.getElementById('menuOverlay');
  if (hamburger) hamburger.addEventListener('click', function(e) { e.stopPropagation();
    abrirMenu(); });
  if (closeBtn) closeBtn.addEventListener('click', fecharMenu);
  if (overlay) overlay.addEventListener('click', fecharMenu);
  document.querySelectorAll('.menu-item').forEach(b => {
    b.addEventListener('click', function() {
      const page = this.getAttribute('data-page');
      const sub = this.getAttribute('data-sub');
      if (sub) { navegarPara('pageAdmin');
        mostrarSubPage(sub); } else if (page) navegarPara(page);
      fecharMenu();
    });
  });
  document.querySelectorAll('.admin-tabs .tab-btn').forEach(b => {
    b.addEventListener('click', function() {
      const sub = this.getAttribute('data-sub');
      if (sub) mostrarSubPage(sub);
    });
  });
  const inputBusca = document.getElementById('buscaPaciente');
  if (inputBusca) {
    inputBusca.addEventListener('input', function() {
      clearTimeout(timeoutBusca);
      timeoutBusca = setTimeout(() => {
        if (this.value.trim() !== '' || document.getElementById('buscaVendedor').value || document.getElementById('buscaStatus').value || document.getElementById('buscaDataInicio').value || document.getElementById('buscaDataFim').value) {
          aplicarFiltros();
        } else {
          limparFiltros();
        }
      }, 500);
    });
  }
  ['buscaVendedor', 'buscaStatus', 'buscaDataInicio', 'buscaDataFim'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', function() {
        if (document.getElementById('buscaPaciente').value.trim() || this.value || document.getElementById('buscaDataInicio').value || document.getElementById('buscaDataFim').value) {
          aplicarFiltros();
        } else {
          limparFiltros();
        }
      });
    }
  });
});

// ========================================================================
// LOGIN
// ========================================================================
async function fazerLogin() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  try {
    const res = await fetch(API_URL + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const ct = res.headers.get('content-type');
    if (!ct || !ct.includes('application/json')) {
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
    const labelTipo = user.tipo === 'admin' ? 'Admin' : user.tipo === 'consultorio' ? 'Consultório' : 'Vendedor';
    document.getElementById('userName').innerHTML = '👤 ' + user.nome + ' (' + labelTipo + ')';
    document.getElementById('menuUserName').textContent = user.nome;
    document.getElementById('menuUserTipo').textContent = labelTipo;
    if (user.loja_nome) {
      document.getElementById('lojaNome').innerHTML = '🏢 ' + user.loja_nome;
      document.getElementById('menuLojaNome').textContent = '🏢 ' + user.loja_nome;
    }
    const isAdmin = user.tipo === 'admin';
    const isConsult = user.tipo === 'consultorio';
    document.getElementById('menuCalendario').style.display = isConsult ? 'none' : 'block';
    document.getElementById('menuAgendar').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('menuSolicitar').style.display = isConsult ? 'none' : 'block';
    document.getElementById('menuDashboard').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('menuAdmin').style.display = isAdmin ? 'block' : 'none';
    document.querySelectorAll('.menu-item[data-sub]').forEach(el => el.style.display = isAdmin ? 'block' : 'none');
    document.getElementById('perfilNome').textContent = user.nome;
    document.getElementById('perfilUsername').textContent = user.username;
    document.getElementById('perfilTipo').textContent = labelTipo;
    document.getElementById('perfilLoja').textContent = user.loja_nome || 'Não vinculado';
    await carregarDados();
    renderizarLista(1);
    preencherSelectVendedores();
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
    document.getElementById('loginMsg').innerHTML = '<p style="color:red;">' + err.message + '</p>';
    console.error(err);
  }
}

// ========================================================================
// CARREGAR DADOS
// ========================================================================
async function carregarDados() {
  try {
    const rC = await fetch(API_URL + '/consultas', { headers: { Authorization: 'Bearer ' + token } });
    if (!rC.ok) {
      const text = await rC.text();
      throw new Error('Erro ao carregar consultas: ' + text);
    }
    let data = await rC.json();
    consultas = data.map(c => ({ ...c, data_consulta: c.data_consulta || null, is_own: c.is_own === 1 }));
    const rM = await fetch(API_URL + '/medicos', { headers: { Authorization: 'Bearer ' + token } });
    medicos = await rM.json();
    preencherSelectMedico();
    preencherSelectMedicoSol();
    const rCl = await fetch(API_URL + '/clientes', { headers: { Authorization: 'Bearer ' + token } });
    clientes = await rCl.json();
    preencherSelectPacientes();
    renderizarLista(paginaAtual);
    renderPacientes();
    if (user.tipo === 'admin') {
      const rU = await fetch(API_URL + '/usuarios', { headers: { Authorization: 'Bearer ' + token } });
      usuarios = await rU.json();
      renderUsuarios();
      renderMedicos();
      atualizarBadgeSolicitacoes();
      carregarConfigWhatsapp();
      carregarDashboard();
      preencherSelectVendedores();
    }
    filtrosAtivos = false;
  } catch (err) {
    console.error(err);
    showToast('Erro ao carregar dados: ' + err.message, true);
  }
}

// ========================================================================
// FILTROS DE BUSCA (Lista de Consultas)
// ========================================================================
function preencherSelectVendedores() {
  const s = document.getElementById('buscaVendedor');
  if (!s) return;
  const isAdmin = user.tipo === 'admin';
  let ops = '<option value="">Todos</option>';
  if (isAdmin) {
    usuarios.forEach(u => {
      if (u.tipo === 'vendedor' || u.tipo === 'admin') {
        ops += `<option value="${u.id}">${escapeHtml(u.nome)}</option>`;
      }
    });
  } else {
    ops += `<option value="${user.id}" selected>${escapeHtml(user.nome)}</option>`;
  }
  s.innerHTML = ops;
}

function aplicarFiltros() {
  const paciente = document.getElementById('buscaPaciente').value.trim();
  const vendedor = document.getElementById('buscaVendedor').value;
  const status = document.getElementById('buscaStatus').value;
  const dataInicio = document.getElementById('buscaDataInicio').value;
  const dataFim = document.getElementById('buscaDataFim').value;
  if (!paciente && !vendedor && !status && !dataInicio && !dataFim) {
    limparFiltros();
    return;
  }
  const params = new URLSearchParams();
  if (paciente) params.append('paciente', paciente);
  if (vendedor) params.append('vendedor_id', vendedor);
  if (status) params.append('status', status);
  if (dataInicio) params.append('data_inicio', dataInicio);
  if (dataFim) params.append('data_fim', dataFim);
  fetch(API_URL + '/consultas/filtrar?' + params.toString(), { headers: { Authorization: 'Bearer ' + token } })
    .then(r => {
      if (!r.ok) {
        return r.text().then(text => { throw new Error(text || 'Erro ao filtrar'); });
      }
      return r.json();
    })
    .then(d => {
      consultas = d.map(c => ({ ...c, data_consulta: c.data_consulta || null, is_own: c.is_own === 1 }));
      filtrosAtivos = true;
      paginaAtual = 1;
      renderizarLista(1);
      showToast('🔍 Encontradas ' + consultas.length + ' consulta(s)');
    })
    .catch(err => {
      showToast('Erro ao filtrar: ' + err.message, true);
      console.error(err);
    });
}

function limparFiltros() {
  document.getElementById('buscaPaciente').value = '';
  document.getElementById('buscaVendedor').value = '';
  document.getElementById('buscaStatus').value = '';
  document.getElementById('buscaDataInicio').value = '';
  document.getElementById('buscaDataFim').value = '';
  filtrosAtivos = false;
  carregarDados();
}

// ========================================================================
// BUSCA DE PACIENTES (na lista de pacientes)
// ========================================================================
function buscarPacientes() {
  const search = document.getElementById('buscaPacienteList').value.trim();
  if (!search) {
    carregarDados();
    return;
  }
  fetch(API_URL + '/clientes?search=' + encodeURIComponent(search), {
    headers: { Authorization: 'Bearer ' + token }
  })
    .then(r => {
      if (!r.ok) throw new Error('Erro ao buscar pacientes');
      return r.json();
    })
    .then(data => {
      clientes = data;
      renderPacientes();
      showToast('Encontrados ' + clientes.length + ' paciente(s)');
    })
    .catch(err => showToast('Erro ao buscar pacientes: ' + err.message, true));
}

function limparBuscaPacientes() {
  document.getElementById('buscaPacienteList').value = '';
  carregarDados();
}

// ========================================================================
// LOJAS (CRUD)
// ========================================================================
async function carregarLojas() {
  try {
    const r = await fetch(API_URL + '/lojas', { headers: { Authorization: 'Bearer ' + token } });
    lojas = await r.json();
    renderLojas();
    preencherSelectLojas();
  } catch (err) { showToast('Erro ao carregar lojas', true); }
}

function renderLojas() {
  const c = document.getElementById('lojasList');
  if (!c) return;
  if (lojas.length === 0) { c.innerHTML = '<p class="no-data">Nenhuma loja cadastrada.</p>'; return; }
  c.innerHTML = lojas.map(l =>
    `<div style="border-bottom:1px solid #ddd;padding:10px;display:flex;justify-content:space-between;align-items:center;">
      <div><strong>${escapeHtml(l.nome)}</strong><br>${l.endereco || ''}</div>
      <div><button onclick="editarLoja(${l.id})">✏️</button><button onclick="excluirLoja(${l.id})">🗑️</button></div>
    </div>`
  ).join('');
}

function preencherSelectLojas() {
  const s = document.getElementById('usuarioLoja');
  if (s) s.innerHTML = '<option value="">Selecione uma loja</option>' + lojas.map(l => `<option value="${l.id}">${l.nome}</option>`).join('');
}

async function salvarLoja() {
  let n = document.getElementById('lojaNome');
  if (!n) n = document.querySelector('input[name="lojaNome"]');
  if (!n) { showToast('Erro: campo Nome não encontrado.', true); return; }
  let e = document.getElementById('lojaEndereco');
  if (!e) e = document.querySelector('input[name="lojaEndereco"]');
  if (!e) { showToast('Erro: campo Endereço não encontrado.', true); return; }
  const nome = n.value.trim();
  const endereco = e.value.trim();
  if (nome === '') { showToast('O nome da loja é obrigatório.', true); return; }
  const id = document.getElementById('editLojaId').value;
  const url = id ? API_URL + '/lojas/' + id : API_URL + '/lojas';
  const method = id ? 'PUT' : 'POST';
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ nome, endereco }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Erro');
    showToast(id ? 'Loja atualizada!' : 'Loja cadastrada!');
    cancelarEdicaoLoja();
    await carregarLojas();
    preencherSelectLojas();
  } catch (err) { showToast(err.message, true); }
}

function editarLoja(id) {
  const l = lojas.find(x => x.id === id);
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
    await fetch(API_URL + '/lojas/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    showToast('Excluída');
    await carregarLojas();
    preencherSelectLojas();
  } catch (err) { showToast(err.message, true); }
}

// ========================================================================
// PREENCHER SELECTS
// ========================================================================
function preencherSelectMedico() {
  const s = document.getElementById('medicoSelect');
  if (s) s.innerHTML = '<option value="">Selecione um médico</option>' + medicos.map(m => `<option value="${m.id}">${m.nome} - ${m.especialidade}</option>`).join('');
}

function preencherSelectMedicoSol() {
  const s = document.getElementById('solMedicoSelect');
  if (s) s.innerHTML = '<option value="">Selecione um médico</option>' + medicos.map(m => `<option value="${m.id}">${m.nome} - ${m.especialidade}</option>`).join('');
}

function preencherSelectPacientes() {
  const s = document.getElementById('pacienteSelect');
  if (s) s.innerHTML = '<option value="">Selecione um paciente</option>' + clientes.map(p => `<option value="${p.id}">${p.nome} - ${p.telefone}</option>`).join('');
}

// ========================================================================
// BUSCAR PACIENTE POR CPF
// ========================================================================
async function buscarPacientePorCpf() {
  const cpf = document.getElementById('buscarCpf').value.trim();
  if (!cpf) { showToast('Digite um CPF', true); return; }
  try {
    const r = await fetch(API_URL + '/clientes/buscar?cpf=' + cpf, { headers: { Authorization: 'Bearer ' + token } });
    const p = await r.json();
    if (!p) { showToast('Não encontrado', true); return; }
    document.getElementById('pacienteNome').value = p.nome;
    document.getElementById('pacienteTelefone').value = p.telefone;
    document.getElementById('pacienteEmail').value = p.email || '';
    document.getElementById('pacienteCpf').value = p.cpf || '';
    document.getElementById('pacienteDataNasc').value = p.data_nascimento || '';
    document.getElementById('pacienteNeurodivergente').checked = p.neurodivergente === 1;
    document.getElementById('pacienteDeficienciaFisica').checked = p.deficiencia_fisica === 1;
    document.getElementById('pacienteEncaixe').checked = p.encaixe === 1;
    document.getElementById('pacienteSelect').value = p.id;
    atualizarIdadeDisplay();
    setupEncaixeLogic('pacienteEncaixe', 'pacienteNeurodivergente', 'pacienteDeficienciaFisica');
    showToast('Paciente encontrado!');
  } catch (err) { showToast('Erro: ' + err.message, true); }
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
    const r = await fetch(API_URL + '/clientes/buscar?cpf=' + cpf, { headers: { Authorization: 'Bearer ' + token } });
    const p = await r.json();
    if (!p) { showToast('Não encontrado', true); return; }
    document.getElementById('solPacienteNome').value = p.nome;
    document.getElementById('solPacienteTelefone').value = p.telefone;
    document.getElementById('solPacienteEmail').value = p.email || '';
    document.getElementById('solPacienteCpf').value = p.cpf || '';
    document.getElementById('solPacienteDataNasc').value = p.data_nascimento || '';
    document.getElementById('solNeurodivergente').checked = p.neurodivergente === 1;
    document.getElementById('solDeficienciaFisica').checked = p.deficiencia_fisica === 1;
    document.getElementById('solEncaixe').checked = p.encaixe === 1;
    atualizarIdadeSol();
    setupEncaixeLogic('solEncaixe', 'solNeurodivergente', 'solDeficienciaFisica');
    showToast('Paciente encontrado!');
  } catch (err) { showToast('Erro: ' + err.message, true); }
}

// ========================================================================
// CRUD DE PACIENTES
// ========================================================================
async function salvarPaciente() {
  const dataNasc = document.getElementById('pacienteCadDataNasc').value;
  if (!validarDataNascimento(dataNasc)) return;
  const data = {
    nome: document.getElementById('pacienteCadNome').value,
    telefone: document.getElementById('pacienteCadTelefone').value,
    email: document.getElementById('pacienteCadEmail').value,
    cpf: document.getElementById('pacienteCadCpf').value,
    data_nascimento: dataNasc,
    neurodivergente: document.getElementById('pacienteCadNeurodivergente').checked ? 1 : 0,
    deficiencia_fisica: document.getElementById('pacienteCadDeficienciaFisica').checked ? 1 : 0,
    encaixe: document.getElementById('pacienteCadEncaixe').checked ? 1 : 0
  };
  const id = document.getElementById('editPacienteId').value;
  const url = id ? API_URL + '/clientes/' + id : API_URL + '/clientes';
  const method = id ? 'PUT' : 'POST';
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error('Erro');
    showToast(id ? 'Atualizado!' : 'Cadastrado!');
    cancelarEdicaoPaciente();
    await carregarDados();
  } catch (err) { showToast(err.message, true); }
}

function renderPacientes() {
  const c = document.getElementById('pacientesList');
  if (!c) return;
  if (clientes.length === 0) { c.innerHTML = '<p class="no-data">Nenhum paciente cadastrado.</p>'; return; }
  c.innerHTML = clientes.map(p =>
    `<div style="border-bottom:1px solid #ddd;padding:10px;display:flex;justify-content:space-between;align-items:center;">
      <div><strong>${escapeHtml(p.nome)}</strong><br>📞 ${p.telefone} ${p.email ? '✉️ ' + p.email : ''} ${p.cpf ? 'CPF: ' + p.cpf : ''}</div>
      <div><button onclick="editarPaciente(${p.id})">✏️</button><button onclick="excluirPaciente(${p.id})">🗑️</button></div>
    </div>`
  ).join('');
}

function editarPaciente(id) {
  const p = clientes.find(x => x.id === id);
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
    await fetch(API_URL + '/clientes/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    showToast('Excluído');
    await carregarDados();
  } catch (err) { showToast(err.message, true); }
}

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
  const dataNasc = document.getElementById('novoPacienteDataNasc').value;
  if (!validarDataNascimento(dataNasc)) return;
  const data = {
    nome: document.getElementById('novoPacienteNome').value,
    telefone: document.getElementById('novoPacienteTelefone').value,
    email: document.getElementById('novoPacienteEmail').value,
    cpf: document.getElementById('novoPacienteCpf').value,
    data_nascimento: dataNasc,
    neurodivergente: document.getElementById('novoPacienteNeurodivergente').checked ? 1 : 0,
    deficiencia_fisica: document.getElementById('novoPacienteDeficienciaFisica').checked ? 1 : 0,
    encaixe: document.getElementById('novoPacienteEncaixe').checked ? 1 : 0
  };
  if (!data.nome || !data.telefone) { document.getElementById('novoPacienteMsg').innerHTML = '<p style="color:red;">Nome e telefone são obrigatórios.</p>'; return; }
  try {
    const r = await fetch(API_URL + '/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error('Erro');
    showToast('Paciente cadastrado!');
    fecharModalCadastroPaciente();
    await carregarDados();
    const np = clientes.find(p => p.cpf === data.cpf || (p.nome === data.nome && p.telefone === data.telefone));
    if (np) {
      document.getElementById('pacienteSelect').value = np.id;
      document.getElementById('pacienteNome').value = np.nome;
      document.getElementById('pacienteTelefone').value = np.telefone;
      document.getElementById('pacienteEmail').value = np.email || '';
      document.getElementById('pacienteCpf').value = np.cpf || '';
      document.getElementById('pacienteDataNasc').value = np.data_nascimento || '';
      document.getElementById('pacienteNeurodivergente').checked = np.neurodivergente === 1;
      document.getElementById('pacienteDeficienciaFisica').checked = np.deficiencia_fisica === 1;
      document.getElementById('pacienteEncaixe').checked = np.encaixe === 1;
      atualizarIdadeDisplay();
      setupEncaixeLogic('pacienteEncaixe', 'pacienteNeurodivergente', 'pacienteDeficienciaFisica');
    }
  } catch (err) { document.getElementById('novoPacienteMsg').innerHTML = '<p style="color:red;">' + err.message + '</p>'; }
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
  const id = document.getElementById('editMedicoId').value;
  const url = id ? API_URL + '/medicos/' + id : API_URL + '/medicos';
  const method = id ? 'PUT' : 'POST';
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error('Erro');
    showToast(id ? 'Atualizado!' : 'Cadastrado!');
    cancelarEdicaoMedico();
    await carregarDados();
  } catch (err) { showToast(err.message, true); }
}

function renderMedicos() {
  const c = document.getElementById('medicosList');
  if (!c) return;
  if (medicos.length === 0) { c.innerHTML = '<p class="no-data">Nenhum médico cadastrado.</p>'; return; }
  c.innerHTML = medicos.map(m =>
    `<div style="border-bottom:1px solid #ddd;padding:10px;display:flex;justify-content:space-between;align-items:center;">
      <div><strong>${escapeHtml(m.nome)}</strong> (${m.crm})<br>${m.especialidade} ${m.telefone ? '📞 ' + m.telefone : ''}</div>
      <div><button onclick="editarMedico(${m.id})">✏️</button><button onclick="excluirMedico(${m.id})">🗑️</button><button onclick="gerenciarHorarios(${m.id})" class="btn-warning">⏰ Horários</button></div>
    </div>`
  ).join('');
}

function editarMedico(id) {
  const m = medicos.find(x => x.id === id);
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
    await fetch(API_URL + '/medicos/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    showToast('Excluído');
    await carregarDados();
  } catch (err) { showToast(err.message, true); }
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
    const r = await fetch(API_URL + '/medicos/' + medicoId + '/horarios', { headers: { Authorization: 'Bearer ' + token } });
    const horarios = await r.json();
    const c = document.getElementById('horariosList');
    if (horarios.length === 0) { c.innerHTML = '<p>Nenhum horário cadastrado.</p>'; return; }
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    c.innerHTML = horarios.map(h =>
      `<div class="horario-item"><span>${dias[h.dia_semana]} - ${h.hora_inicio} às ${h.hora_fim} (intervalo ${h.intervalo}min) ${!h.ativo ? '(Inativo)' : ''}</span><div><button onclick="editarHorario(${h.id})" class="btn-warning">✏️</button><button onclick="excluirHorario(${h.id})" class="btn-danger">🗑️</button></div></div>`
    ).join('');
  } catch (err) { showToast(err.message, true); }
}

async function adicionarHorarioMedico() {
  if (!medicoSelecionadoId) { showToast('Selecione um médico primeiro.', true); return; }
  const data = {
    dia_semana: parseInt(document.getElementById('horarioDiaSemana').value),
    hora_inicio: document.getElementById('horarioInicio').value,
    hora_fim: document.getElementById('horarioFim').value,
    intervalo: parseInt(document.getElementById('horarioIntervalo').value) || 30
  };
  const id = document.getElementById('editHorarioId').value;
  const url = id ? API_URL + '/horarios/' + id : API_URL + '/medicos/' + medicoSelecionadoId + '/horarios';
  const method = id ? 'PUT' : 'POST';
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(data) });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro'); }
    showToast(id ? 'Atualizado!' : 'Adicionado!');
    cancelarEdicaoHorario();
    carregarHorarios(medicoSelecionadoId);
  } catch (err) { showToast(err.message, true); }
}

async function editarHorario(id) {
  try {
    const r = await fetch(API_URL + '/horarios/' + id, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro'); }
    const h = await r.json();
    if (!h) return;
    document.getElementById('editHorarioId').value = h.id;
    document.getElementById('horarioDiaSemana').value = h.dia_semana;
    document.getElementById('horarioInicio').value = h.hora_inicio;
    document.getElementById('horarioFim').value = h.hora_fim;
    document.getElementById('horarioIntervalo').value = h.intervalo || 30;
    document.getElementById('cancelHorarioBtn').style.display = 'inline-block';
    document.getElementById('horariosMedico').scrollIntoView({ behavior: 'smooth' });
  } catch (err) { showToast(err.message, true); }
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
    const r = await fetch(API_URL + '/horarios/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro'); }
    showToast('Excluído');
    carregarHorarios(medicoSelecionadoId);
  } catch (err) { showToast(err.message, true); }
}

// ========================================================================
// CARREGAR HORÁRIOS DISPONÍVEIS
// ========================================================================
async function carregarHorariosDisponiveis() {
  const medicoId = document.getElementById('medicoSelect').value;
  const data = document.getElementById('dataConsulta').value;
  const select = document.getElementById('horarioSelect');
  const msg = document.getElementById('msgHorarios');
  select.innerHTML = '<option value="">Carregando...</option>';
  msg.style.display = 'none';
  msg.innerHTML = '';
  if (!medicoId || !data) { select.innerHTML = '<option value="">Selecione médico e data</option>'; return; }
  if (isDataPassada(data)) { select.innerHTML = '<option value="">Data inválida</option>';
    msg.style.display = 'block';
    msg.innerHTML = '⚠️ Data não pode ser no passado.'; return; }
  try {
    const r = await fetch(API_URL + '/medicos/' + medicoId + '/horarios/disponiveis?data=' + data, { headers: { Authorization: 'Bearer ' + token } });
    const horarios = await r.json();
    if (horarios.error) { select.innerHTML = '<option value="">Nenhum horário disponível</option>';
      msg.style.display = 'block';
      msg.innerHTML = '⚠️ ' + horarios.error; return; }
    const disp = horarios.filter(x => x.disponivel !== false);
    if (disp.length === 0) { select.innerHTML = '<option value="">Nenhum horário disponível</option>';
      msg.style.display = 'block';
      msg.innerHTML = '⚠️ Todos os horários estão ocupados nesta data.'; return; }
    select.innerHTML = '<option value="">Selecione um horário</option>' + disp.map(x => `<option value="${x.horario}">${x.horario}</option>`).join('');
    msg.style.display = 'none';
  } catch (err) { select.innerHTML = '<option value="">Erro ao carregar</option>';
    msg.style.display = 'block';
    msg.innerHTML = '⚠️ ' + err.message; }
}
document.addEventListener('change', function(e) {
  if (e.target.id === 'medicoSelect' || e.target.id === 'dataConsulta') carregarHorariosDisponiveis();
});

async function carregarHorariosDisponiveisSol() {
  const medicoId = document.getElementById('solMedicoSelect').value;
  const data = document.getElementById('solDataConsulta').value;
  const selects = [document.getElementById('solHorario1'), document.getElementById('solHorario2'), document.getElementById('solHorario3')];
  const msg = document.getElementById('solMsgHorarios');
  selects.forEach(s => s.innerHTML = '<option value="">Carregando...</option>');
  msg.style.display = 'none';
  msg.innerHTML = '';
  if (!medicoId || !data) { selects.forEach(s => s.innerHTML = '<option value="">Selecione médico e data</option>'); return; }
  if (isDataPassada(data)) { selects.forEach(s => s.innerHTML = '<option value="">Data inválida</option>');
    msg.style.display = 'block';
    msg.innerHTML = '⚠️ Data não pode ser no passado.'; return; }
  try {
    const r = await fetch(API_URL + '/medicos/' + medicoId + '/horarios/disponiveis?data=' + data, { headers: { Authorization: 'Bearer ' + token } });
    const horarios = await r.json();
    if (horarios.error) { selects.forEach(s => s.innerHTML = '<option value="">Nenhum disponível</option>');
      msg.style.display = 'block';
      msg.innerHTML = '⚠️ ' + horarios.error; return; }
    if (horarios.length === 0) { selects.forEach(s => s.innerHTML = '<option value="">Nenhum horário disponível</option>');
      msg.style.display = 'block';
      msg.innerHTML = '⚠️ Médico não possui horários disponíveis para esta data.'; return; }
    let ops = '<option value="">Selecione um horário</option>';
    horarios.forEach(h => {
      const disp = h.disponivel !== false;
      const label = disp ? h.horario : h.horario + ' (Agendado)';
      const disabled = !disp ? 'disabled' : '';
      const style = !disp ? 'style="color:#999;background:#f5f5f5;"' : '';
      ops += `<option value="${h.horario}" ${disabled} ${style}>${label}</option>`;
    });
    selects.forEach(s => s.innerHTML = ops);
    msg.style.display = 'none';
  } catch (err) { selects.forEach(s => s.innerHTML = '<option value="">Erro</option>');
    msg.style.display = 'block';
    msg.innerHTML = '⚠️ ' + err.message; }
}
document.addEventListener('change', function(e) {
  if (e.target.id === 'solMedicoSelect' || e.target.id === 'solDataConsulta') carregarHorariosDisponiveisSol();
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
  const dataNasc = document.getElementById('pacienteDataNasc').value;

  if (!pacienteNome || !pacienteTelefone || !dataConsulta || !horario || !medicoId) {
    showToast('Preencha todos os campos obrigatórios!', true);
    return;
  }
  if (!validarDataNascimento(dataNasc)) return;
  if (!validarDataHoraNaoPassada(dataConsulta, horario, 'Data/Hora da consulta')) return;

  const dados = {
    paciente_id: pacienteId || null,
    paciente_nome: pacienteNome,
    paciente_telefone: pacienteTelefone,
    paciente_email: document.getElementById('pacienteEmail').value,
    paciente_cpf: document.getElementById('pacienteCpf').value,
    data_nascimento: dataNasc,
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
  const url = editandoId ? API_URL + '/consultas/' + editandoId : API_URL + '/consultas';
  const method = editandoId ? 'PUT' : 'POST';
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(dados) });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro'); }
    showToast(editandoId ? 'Atualizada!' : 'Agendada!');
    cancelarEdicao();
    await carregarDados();
    renderizarCalendario();
    renderizarLista(paginaAtual);
  } catch (err) { showToast(err.message, true); }
}

function renderizarLista(pagina = 1) {
  const container = document.getElementById('consultasListMain');
  const paginacao = document.getElementById('listaPaginacao');
  if (!container) return;
  const listaOrdenada = [...consultas].sort((a, b) => {
    if (a.data_consulta !== b.data_consulta) return b.data_consulta.localeCompare(a.data_consulta);
    return b.horario.localeCompare(a.horario);
  });
  const total = listaOrdenada.length;
  const totalPaginas = Math.ceil(total / ITENS_POR_PAGINA);
  if (pagina > totalPaginas) pagina = totalPaginas || 1;
  const inicio = (pagina - 1) * ITENS_POR_PAGINA;
  const fim = Math.min(inicio + ITENS_POR_PAGINA, total);
  const paginaConsultas = listaOrdenada.slice(inicio, fim);
  if (consultas.length === 0) {
    container.innerHTML = '<p class="no-data">Nenhuma consulta agendada.</p>';
    paginacao.innerHTML = '';
    return;
  }
  const isAdmin = user.tipo === 'admin';
  const isConsult = user.tipo === 'consultorio';
  let html = '';
  paginaConsultas.forEach(cons => {
    const status = cons.status || 'agendada';
    let stCls = 'status-agendada';
    if (status === 'cancelada') stCls = 'status-cancelada';
    else if (status === 'confirmada') stCls = 'status-confirmada';
    else if (status === 'realizada') stCls = 'status-realizada';
    const isRealizada = status === 'realizada';
    const podeEditar = isAdmin && !isRealizada && status !== 'cancelada';
    const isOwn = cons.is_own;
    const canView = (isAdmin || isOwn);
    const clickAttr = canView ? `onclick="mostrarDetalhes(${cons.id})"` : '';
    const cursorStyle = canView ? 'cursor:pointer;' : 'cursor:default;';
    let acoes = '';
    let info = '';
    const hasPedido = cons.numero_pedido ? '<br><small>📦 Pedido: ' + escapeHtml(cons.numero_pedido) + '</small>' : '';
    const lojaStr = cons.loja_nome ? '<br><small>🏢 ' + escapeHtml(cons.loja_nome) + '</small>' : '';
    let vendHtml = '';
    if (isAdmin && usuarios.length > 0) {
      const curr = cons.criado_por || '';
      const ops = usuarios.map(u => `<option value="${u.id}" ${u.id === curr ? 'selected' : ''}>${escapeHtml(u.nome)}</option>`).join('');
      const uid = 'vendedor-' + cons.id;
      vendHtml = `<div class="vendedor-controls">
        <select id="${uid}-select" data-consulta-id="${cons.id}" data-original="${curr}">${ops}</select>
        <button id="${uid}-salvar" class="btn-success btn-small" style="display:none;" onclick="salvarVendedor(${cons.id},'${uid}')">💾 Salvar</button>
        <button id="${uid}-cancelar" class="btn-secondary btn-small" style="display:none;" onclick="cancelarVendedor(${cons.id},'${uid}')">✖ Cancelar</button>
      </div>`;
    }
    if (isAdmin) {
      const podeExcluir = status === 'cancelada';
      acoes = `<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
        ${vendHtml}
        ${podeEditar ? `<button onclick="editarConsulta(${cons.id})" class="btn-warning btn-small">✏️</button>` : ''}
        ${podeEditar ? `<button onclick="cancelarConsulta(${cons.id})" class="btn-danger btn-small">🚫</button>` : ''}
        ${podeExcluir ? `<button onclick="excluirConsulta(${cons.id})" class="btn-danger btn-small">🗑️</button>` : ''}
        ${podeEditar && status !== 'cancelada' && status !== 'realizada' && status !== 'confirmada' ? `<button onclick="confirmarConsulta(${cons.id})" class="btn-success btn-small">✅</button>` : ''}
        ${podeEditar && status !== 'cancelada' && status !== 'realizada' ? `<button onclick="processarConsulta(${cons.id})" class="btn-process btn-small">🔄</button>` : ''}
        <button onclick="enviarWhatsAppPaciente(${cons.id})" class="btn-whatsapp btn-small">📱</button>
        <button onclick="enviarWhatsAppMedico(${cons.id})" class="btn-medico btn-small">📱</button>
        <button onclick="abrirModalImpressao(${cons.id})" class="btn-print btn-small">🖨️</button>
      </div>`;
      info = `<strong>${escapeHtml(cons.paciente_nome)}</strong> <span class="${stCls}">${status}</span><br>${formatDisplay(cons.data_consulta)} ${cons.horario} | Dr. ${escapeHtml(cons.medico_nome)}${hasPedido}${lojaStr}${cons.observacoes ? '<br><small>📝 ' + escapeHtml(cons.observacoes) + '</small>' : ''}<br><small>👤 Vendedor: ${escapeHtml(cons.vendedor_nome || 'Não informado')}</small>`;
    } else if (isConsult) {
      const podeConfirmar = !isRealizada && status !== 'cancelada' && status !== 'confirmada';
      const podeCancelar = !isRealizada && status !== 'cancelada';
      acoes = `<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
        ${podeConfirmar ? `<button onclick="confirmarConsulta(${cons.id})" class="btn-success btn-small">✅ Confirmar</button>` : ''}
        ${podeCancelar ? `<button onclick="cancelarConsulta(${cons.id})" class="btn-danger btn-small">🚫 Cancelar</button>` : ''}
      </div>`;
      info = `<strong>${escapeHtml(cons.paciente_nome)}</strong> <span class="${stCls}">${status}</span><br>${formatDisplay(cons.data_consulta)} ${cons.horario} | Dr. ${escapeHtml(cons.medico_nome)}${hasPedido}${lojaStr}${cons.observacoes ? '<br><small>📝 ' + escapeHtml(cons.observacoes) + '</small>' : ''}<br><small>👤 Vendedor: ${escapeHtml(cons.vendedor_nome || 'Não informado')}</small>`;
    } else {
      if (isOwn) {
        acoes = `<div style="display:flex;gap:5px;flex-wrap:wrap;"><button onclick="mostrarDetalhes(${cons.id})" class="btn-primary btn-small">👁️ Ver</button></div>`;
        info = `<strong>${escapeHtml(cons.paciente_nome)}</strong> <span class="${stCls}">${status}</span><br>${formatDisplay(cons.data_consulta)} ${cons.horario} | Dr. ${escapeHtml(cons.medico_nome)}${hasPedido}${lojaStr}${cons.observacoes ? '<br><small>📝 ' + escapeHtml(cons.observacoes) + '</small>' : ''}<br><small>👤 Vendedor: ${escapeHtml(cons.vendedor_nome || 'Não informado')}</small>`;
      } else {
        info = `<div style="display:flex;align-items:center;gap:10px;"><span style="font-weight:bold;color:#a0aec0;">⏰ Horário já agendado</span><span style="font-size:12px;color:#718096;">(${formatDisplay(cons.data_consulta)} ${cons.horario})</span></div><small style="color:#a0aec0;">Vendedor: ${escapeHtml(cons.vendedor_nome || 'Não informado')}</small>`;
        acoes = '';
      }
    }
    const extraClass = (!isOwn && !isAdmin && !isConsult) ? 'other-vendor' : '';
    const isRealizadaClass = isRealizada ? 'consulta-realizada' : '';
    html += `<div class="consulta-card ${extraClass} ${isRealizadaClass}" ${clickAttr} style="${cursorStyle}">
      <div class="info">${info}</div>
      ${acoes}
    </div>`;
  });
  container.innerHTML = html;
  paginacao.innerHTML = '';
  if (totalPaginas > 1) {
    let pagHtml = '';
    if (pagina > 1) pagHtml += `<button onclick="renderizarLista(${pagina - 1})"><i class="fas fa-chevron-left"></i></button>`;
    for (let i = 1; i <= totalPaginas; i++) {
      pagHtml += `<button class="${i === pagina ? 'active' : ''}" onclick="renderizarLista(${i})">${i}</button>`;
    }
    if (pagina < totalPaginas) pagHtml += `<button onclick="renderizarLista(${pagina + 1})"><i class="fas fa-chevron-right"></i></button>`;
    paginacao.innerHTML = pagHtml;
    paginaAtual = pagina;
  }
  document.querySelectorAll('.vendedor-controls select').forEach(s => {
    s.addEventListener('change', function() {
      const uid = this.id.replace('-select', '');
      const salvarBtn = document.getElementById(uid + '-salvar');
      const cancelarBtn = document.getElementById(uid + '-cancelar');
      const original = this.getAttribute('data-original');
      if (this.value !== original) {
        salvarBtn.style.display = 'inline-block';
        cancelarBtn.style.display = 'inline-block';
      } else {
        salvarBtn.style.display = 'none';
        cancelarBtn.style.display = 'none';
      }
    });
  });
}

async function salvarVendedor(consultaId, uid) {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem alterar o vendedor.', true); return; }
  const select = document.getElementById(uid + '-select');
  if (!select) return;
  const novoVendedorId = parseInt(select.value);
  if (!novoVendedorId) { showToast('Selecione um vendedor válido.', true); return; }
  try {
    const r = await fetch(API_URL + '/consultas/' + consultaId + '/vendedor', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ vendedor_id: novoVendedorId })
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro'); }
    showToast('Vendedor alterado!');
    select.setAttribute('data-original', novoVendedorId);
    document.getElementById(uid + '-salvar').style.display = 'none';
    document.getElementById(uid + '-cancelar').style.display = 'none';
    await carregarDados();
    renderizarLista(paginaAtual);
  } catch (err) { showToast(err.message, true); }
}

function cancelarVendedor(consultaId, uid) {
  const select = document.getElementById(uid + '-select');
  if (!select) return;
  select.value = select.getAttribute('data-original');
  document.getElementById(uid + '-salvar').style.display = 'none';
  document.getElementById(uid + '-cancelar').style.display = 'none';
}

async function confirmarConsulta(id) {
  if (user.tipo !== 'admin' && user.tipo !== 'consultorio') {
    showToast('Apenas administradores ou consultório podem confirmar.', true);
    return;
  }
  const c = consultas.find(x => x.id === id);
  if (c && c.status === 'realizada') { showToast('Consulta já realizada.', true); return; }
  if (!confirm('Confirmar esta consulta?')) return;
  try {
    const r = await fetch(API_URL + '/consultas/' + id + '/confirmar', { method: 'PUT', headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro'); }
    showToast('Consulta confirmada!');
    await carregarDados();
    renderizarCalendario();
    renderizarLista(paginaAtual);
  } catch (err) { showToast(err.message, true); }
}

async function processarConsulta(id) {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem processar.', true); return; }
  const c = consultas.find(x => x.id === id);
  if (c && c.status === 'realizada') { showToast('Consulta já foi processada.', true); return; }
  if (!confirm('Marcar como REALIZADA? Essa ação é irreversível.')) return;
  try {
    const r = await fetch(API_URL + '/consultas/' + id + '/processar', { method: 'PUT', headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro'); }
    showToast('Consulta processada!');
    await carregarDados();
    renderizarCalendario();
    renderizarLista(paginaAtual);
    if (user.tipo === 'admin') carregarDashboard();
  } catch (err) { showToast(err.message, true); }
}

async function cancelarConsulta(id) {
  if (user.tipo !== 'admin' && user.tipo !== 'consultorio') {
    showToast('Apenas administradores ou consultório podem cancelar.', true);
    return;
  }
  const c = consultas.find(x => x.id === id);
  if (c && c.status === 'realizada') { showToast('Consulta já realizada. Não pode cancelar.', true); return; }
  if (!confirm('Cancelar esta consulta?')) return;
  try {
    if (user.tipo === 'consultorio') {
      const r = await fetch(API_URL + '/consultas/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ status: 'cancelada' })
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro'); }
    } else {
      const cons = consultas.find(x => x.id === id);
      if (!cons) return;
      const r = await fetch(API_URL + '/consultas/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ ...cons, status: 'cancelada' })
      });
      if (!r.ok) throw new Error('Erro');
    }
    showToast('Consulta cancelada!');
    await carregarDados();
    renderizarCalendario();
    renderizarLista(paginaAtual);
  } catch (err) { showToast(err.message, true); }
}

async function excluirConsulta(id) {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem excluir.', true); return; }
  const c = consultas.find(x => x.id === id);
  if (!c || c.status !== 'cancelada') { showToast('Apenas consultas canceladas podem ser excluídas.', true); return; }
  if (!confirm('Excluir permanentemente esta consulta cancelada?')) return;
  try {
    await fetch(API_URL + '/consultas/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    showToast('Excluída!');
    await carregarDados();
    renderizarCalendario();
    renderizarLista(paginaAtual);
  } catch (err) { showToast(err.message, true); }
}

function editarConsulta(id) {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem editar.', true); return; }
  const c = consultas.find(x => x.id === id);
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
  const p = clientes.find(x => x.nome === c.paciente_nome && x.telefone === c.paciente_telefone);
  if (p) {
    document.getElementById('pacienteDataNasc').value = p.data_nascimento || '';
    document.getElementById('pacienteNeurodivergente').checked = p.neurodivergente === 1;
    document.getElementById('pacienteDeficienciaFisica').checked = p.deficiencia_fisica === 1;
    document.getElementById('pacienteEncaixe').checked = p.encaixe === 1;
    document.getElementById('pacienteSelect').value = p.id;
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
  const msg = document.getElementById('msgHorarios');
  if (msg) { msg.style.display = 'none';
    msg.innerHTML = ''; }
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
  if (id) gerarComprovante(id, tipo);
  else showToast('Erro: nenhuma consulta selecionada.', true);
}

function getPrintConfig() {
  const config = localStorage.getItem('printConfig');
  return config ? JSON.parse(config) : { marginLeft: 20, marginRight: 20, marginTop: 20, headerHeight: 80 };
}

function gerarComprovante(id, tipo) {
  const c = consultas.find(x => x.id === id);
  if (!c) { showToast('Consulta não encontrada.', true); return; }
  let condicao = 'Encaixe';
  let paciente = null;
  if (c.paciente_cpf) paciente = clientes.find(p => p.cpf === c.paciente_cpf);
  if (!paciente) paciente = clientes.find(p => p.nome === c.paciente_nome && p.telefone === c.paciente_telefone);
  if (paciente) {
    if (paciente.neurodivergente && paciente.deficiencia_fisica) condicao = 'Neurodivergente e Def. Física';
    else if (paciente.neurodivergente) condicao = 'Neurodivergente';
    else if (paciente.deficiencia_fisica) condicao = 'Deficiência Física';
    else if (paciente.encaixe) condicao = 'Encaixe';
  }
  const condDisplay = condicao === 'Encaixe' ? '<span style="font-weight:bold;color:#e53e3e;background:#fff5f5;padding:2px 10px;border-radius:4px;border:1px solid #e53e3e;">🔹 Encaixe</span>' : condicao;
  const medico = medicos.find(m => m.id === c.medico_id);
  const endMed = medico ? medico.endereco : 'Endereço não informado';
  const lojaNome = c.loja_nome || user.loja_nome || 'Ótica Macaé';
  const lojaEnd = c.loja_endereco || user.loja_endereco || '';
  const vendedor = c.vendedor_nome || user.nome || 'Não informado';
  const dataF = formatDisplay(c.data_consulta);
  const status = c.status || 'agendada';
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const pedido = c.numero_pedido || 'Não informado';
  const cfg = getPrintConfig();
  let html = `<div class="comprovante-container" style="padding-left:${cfg.marginLeft}px;padding-right:${cfg.marginRight}px;padding-top:${cfg.marginTop}px;">
    <div class="comprovante-conteudo">
      <div class="header-loja" style="font-size:22px;font-weight:700;margin-bottom:4px;">${escapeHtml(lojaNome)}</div>
      ${lojaEnd ? '<div class="header-endereco-loja" style="font-size:14px;color:#4a5568;margin-bottom:12px;">' + escapeHtml(lojaEnd) + '</div>' : ''}
      <div class="header-vendedor" style="font-size:14px;color:#4a5568;margin-bottom:16px;font-weight:500;">Vendedor: ${escapeHtml(vendedor)}</div>
      <h2 style="text-align:center;border-bottom:2px solid #2d3748;padding-bottom:10px;font-size:20px;font-weight:600;color:#2d3748;margin-bottom:16px;">Comprovante de Consulta</h2>
      <div class="detalhe"><span class="label">Paciente:</span><span class="valor">${escapeHtml(c.paciente_nome)}</span></div>
      <div class="detalhe"><span class="label">Data:</span><span class="valor">${dataF}</span></div>
      <div class="detalhe"><span class="label">Horário:</span><span class="valor">${c.horario}</span></div>
      <div class="detalhe"><span class="label">Médico:</span><span class="valor">Dr. ${escapeHtml(c.medico_nome)}</span></div>
      <div class="detalhe"><span class="label">Status:</span><span class="valor">${statusLabel}</span></div>
      <div class="detalhe"><span class="label">Condição:</span><span class="valor">${condDisplay}</span></div>
      <div class="detalhe"><span class="label">Pedido:</span><span class="valor">${pedido}</span></div>
      ${c.observacoes ? '<div class="detalhe"><span class="label">Observações:</span><span class="valor">' + escapeHtml(c.observacoes) + '</span></div>' : ''}
      <div class="rodape-medico"><div>Endereço do médico:</div><div class="endereco-medico">${escapeHtml(endMed)}</div></div>
      <div class="rodape-final">Este comprovante é válido como comprovação de agendamento.</div>
    </div>
    <button onclick="fecharComprovante()" class="no-print" style="display:block;margin:16px auto 0;padding:8px 24px;background:#e53e3e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">Fechar</button>
  </div>`;
  if (tipo === 'bobina') {
    html = html.replace('comprovante-container', 'comprovante-container comprovante-bobina')
      .replace(/font-size:22px/g, 'font-size:18px')
      .replace(/font-size:14px/g, 'font-size:11px')
      .replace(/font-size:15px/g, 'font-size:11px')
      .replace(/padding:6px 0/g, 'padding:3px 0')
      .replace(/font-size:20px/g, 'font-size:15px')
      .replace(/font-size:16px/g, 'font-size:13px');
  }
  document.getElementById('comprovante').innerHTML = html;
  document.getElementById('comprovante').style.display = 'block';
  setTimeout(() => window.print(), 300);
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
  document.querySelectorAll('.view-buttons button').forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`.view-buttons button[onclick*="${currentView}"]`).forEach(b => b.classList.add('active'));
}

function renderizarMes(container) {
  const year = currentDate.getFullYear(),
    month = currentDate.getMonth(),
    firstDay = new Date(year, month, 1),
    startDay = firstDay.getDay(),
    daysInMonth = new Date(year, month + 1, 0).getDate(),
    today = formatDate(new Date());
  let html = '<div class="mes-grid">';
  ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].forEach(d => html += `<div style="font-weight:600;padding:8px;text-align:center;color:#4a5568;">${d}</div>`);
  for (let i = 0; i < startDay; i++) html += '<div class="dia-cell outro-mes"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const isToday = dateStr === today;
    const dayEvents = consultas.filter(c => c.data_consulta === dateStr);
    html += `<div class="dia-cell ${isToday ? 'dia-hoje' : ''}"><span class="dia-numero">${d}</span>`;
    const maxShow = 3;
    dayEvents.slice(0, maxShow).forEach(e => {
      const isOwn = (user.tipo === 'admin' || e.is_own);
      const clickAttr = isOwn ? `onclick="mostrarDetalhes(${e.id})"` : '';
      const extraClass = isOwn ? '' : ' other-vendor';
      const styleExtra = !isOwn ? 'cursor:default;opacity:0.6;' : '';
      html += `<div class="dia-consulta${extraClass}" ${clickAttr} style="${styleExtra}">
        <span class="horario">${e.horario}</span>
        <span class="paciente">${escapeHtml(e.paciente_nome.substring(0, 12))}</span>
        <span class="medico">${escapeHtml(e.medico_nome)}</span>
      </div>`;
    });
    if (dayEvents.length > maxShow) html += `<div class="dia-consulta mais">+ ${dayEvents.length - maxShow} mais</div>`;
    html += '</div>';
  }
  html += '</div>';
  container.innerHTML = html;
}

function renderizarSemana(container) {
  let start = new Date(currentDate);
  start.setDate(currentDate.getDate() - currentDate.getDay());
  let days = [];
  for (let i = 0; i < 7; i++) { let d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d); }
  const hours = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];
  let html = '<table class="semana-table"><thead><tr><th>Horário</th>';
  days.forEach(day => {
    const dateStr = formatDate(day);
    const dayEvents = consultas.filter(c => c.data_consulta === dateStr);
    html += `<th><span class="dia-semana">${day.toLocaleDateString('pt-BR', { weekday: 'short' })}</span><span class="dia-numero">${day.getDate()}</span><span style="font-size:12px;font-weight:400;">(${dayEvents.length})</span></th>`;
  });
  html += '</tr></thead><tbody>';
  hours.forEach(hour => {
    html += `<tr><td class="horario-label">${hour}</td>`;
    days.forEach(day => {
      const dateStr = formatDate(day);
      const hourEvents = consultas.filter(c => c.data_consulta === dateStr && c.horario === hour);
      html += `<td style="background:${hourEvents.length > 0 ? '#f0f4ff' : 'white'};">`;
      hourEvents.forEach(e => {
        const isOwn = (user.tipo === 'admin' || e.is_own);
        const clickAttr = isOwn ? `onclick="mostrarDetalhes(${e.id})"` : '';
        const extraClass = isOwn ? '' : ' other-vendor';
        const styleExtra = !isOwn ? 'cursor:default;opacity:0.6;' : '';
        html += `<div class="consulta-item${extraClass}" ${clickAttr} style="${styleExtra}">
          <span class="paciente-nome">${escapeHtml(e.paciente_nome)}</span>
          <span class="medico-nome">${escapeHtml(e.medico_nome)}</span>
        </div>`;
      });
      html += '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function renderizarDia(container) {
  const dateStr = formatDate(currentDate);
  const dayEvents = consultas.filter(c => c.data_consulta === dateStr).sort((a, b) => a.horario.localeCompare(b.horario));
  let html = `<div style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:25px 20px;text-align:center;border-radius:12px;margin-bottom:25px;box-shadow:0 4px 12px rgba(102,126,234,.3);">
    <h2 style="font-size:28px;">${currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</h2>
    <p style="font-size:18px;opacity:.9;margin-top:5px;">${currentDate.toLocaleDateString('pt-BR', { weekday: 'long' })}</p>
    <p style="font-size:16px;margin-top:8px;background:rgba(255,255,255,.2);display:inline-block;padding:4px 18px;border-radius:20px;">${dayEvents.length} consulta(s)</p>
  </div>`;
  if (dayEvents.length === 0) {
    html += '<div class="no-data" style="padding:40px;font-size:18px;">📭 Nenhuma consulta agendada para este dia.</div>';
  } else {
    html += '<div class="dia-list">';
    dayEvents.forEach(e => {
      const isOwn = (user.tipo === 'admin' || e.is_own);
      const clickAttr = isOwn ? `onclick="mostrarDetalhes(${e.id})"` : '';
      const extraClass = isOwn ? '' : ' other-vendor';
      const styleExtra = !isOwn ? 'cursor:default;opacity:0.6;' : 'cursor:pointer;';
      html += `<div class="dia-card${extraClass}" ${clickAttr} style="${styleExtra}">
        <div class="info">
          <div class="horario">${e.horario}</div>
          <div class="dados">
            <span class="paciente">${escapeHtml(e.paciente_nome)}</span>
            <span class="detalhes">👨‍⚕️ <span class="medico">Dr. ${escapeHtml(e.medico_nome)}</span>${e.paciente_telefone ? ' 📞 ' + e.paciente_telefone : ''}${e.observacoes ? ' 📝 ' + escapeHtml(e.observacoes) : ''}</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;"><span style="background:#edf2f7;color:#4a5568;padding:2px 10px;border-radius:12px;font-size:11px;">${e.status || 'agendada'}</span></div>
      </div>`;
    });
    html += '</div>';
  }
  container.innerHTML = html;
}

// ========================================================================
// DASHBOARD
// ========================================================================
async function carregarDashboard() {
  if (user.tipo !== 'admin') return;
  try {
    const r = await fetch(API_URL + '/dashboard', { headers: { Authorization: 'Bearer ' + token } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Erro');
    document.getElementById('totalConsultas').textContent = d.total_consultas || 0;
    document.getElementById('totalMedicos').textContent = d.total_medicos || 0;
    document.getElementById('totalAgendadas').textContent = d.por_status?.agendada || 0;
    document.getElementById('totalConfirmadas').textContent = d.por_status?.confirmada || 0;
    document.getElementById('totalRealizadas').textContent = d.por_status?.realizada || 0;
    document.getElementById('totalCanceladas').textContent = d.por_status?.cancelada || 0;
    const container = document.getElementById('vendedoresRelatorio');
    if (!d.por_vendedor || d.por_vendedor.length === 0) {
      container.innerHTML = '<p style="padding:20px;color:#999;">Nenhum vendedor com consultas.</p>';
      return;
    }
    const maxTotal = Math.max(...d.por_vendedor.map(v => v.total), 1);
    let html = '<table><thead><tr><th>Vendedor</th><th style="text-align:center;">Total</th><th style="text-align:center;">Agendadas</th><th style="text-align:center;">Confirmadas</th><th style="text-align:center;">Realizadas</th><th style="text-align:center;">Canceladas</th><th style="min-width:120px;">Progresso</th></tr></thead><tbody>';
    d.por_vendedor.forEach(v => {
      const pct = Math.round((v.total / maxTotal) * 100);
      const barColor = v.total > 0 ? '#667eea' : '#e2e8f0';
      html += `<tr>
        <td><strong>${escapeHtml(v.vendedor_nome)}</strong></td>
        <td style="text-align:center;font-weight:600;">${v.total}</td>
        <td style="text-align:center;"><span class="badge-status badge-agendada">${v.agendadas}</span></td>
        <td style="text-align:center;"><span class="badge-status badge-confirmada">${v.confirmadas}</span></td>
        <td style="text-align:center;"><span class="badge-status badge-realizada">${v.realizadas}</span></td>
        <td style="text-align:center;"><span class="badge-status badge-cancelada">${v.canceladas}</span></td>
        <td><div class="barra-container"><div class="barra"><div class="preenchimento" style="width:${pct}%;background:${barColor};"></div></div><span style="font-size:12px;color:#4a5568;min-width:40px;">${pct}%</span></div></td>
      </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) { console.error(err);
    showToast('Erro ao carregar dashboard', true); }
}

// ========================================================================
// ENVIO DE WHATSAPP
// ========================================================================
async function enviarWhatsAppPaciente(id) {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem enviar.', true); return; }
  const e = consultas.find(c => c.id === id);
  if (!e) return;
  const medico = medicos.find(m => m.id === e.medico_id);
  if (!medico) { showToast('Médico não encontrado.', true); return; }
  const msgPadrao = medico.mensagem_padrao || '';
  const endMed = medico.endereco || 'Endereço não informado';
  const pac = clientes.find(p => p.nome === e.paciente_nome && p.telefone === e.paciente_telefone);
  let cond = 'Encaixe';
  if (pac) {
    if (pac.neurodivergente && pac.deficiencia_fisica) cond = 'Neurodivergente e Def. Física';
    else if (pac.neurodivergente) cond = 'Neurodivergente';
    else if (pac.deficiencia_fisica) cond = 'Deficiência Física';
    else if (pac.encaixe) cond = 'Encaixe';
  }
  const loja = e.loja_nome || user.loja_nome || 'Ótica Macaé';
  let msg = loja + '\n----------------------------------------\nGUIA DE CONSULTA\n----------------------------------------\n\nPaciente: ' + e.paciente_nome + '\nData: ' + formatDisplay(e.data_consulta) + '\nHorário: ' + e.horario + '\nMédico: Dr. ' + medico.nome + '\nEndereço do atendimento: ' + endMed + '\nCondição: ' + cond;
  if (e.numero_pedido) msg += '\nPedido: #' + e.numero_pedido;
  if (msgPadrao) msg += '\n\nMensagem do médico:\n' + msgPadrao;
  msg += '\n\n----------------------------------------\nConfirme sua presença respondendo a esta mensagem.';
  const phone = e.paciente_telefone.replace(/\D/g, '');
  if (phone) window.open('https://wa.me/55' + phone + '?text=' + encodeURIComponent(msg), '_blank');
  else showToast('Número do paciente não disponível', true);
}

async function enviarWhatsAppMedico(id) {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem enviar.', true); return; }
  const e = consultas.find(c => c.id === id);
  if (!e) return;
  const medico = medicos.find(m => m.id === e.medico_id);
  if (!medico || !medico.whatsapp) { showToast('Médico não possui WhatsApp cadastrado.', true); return; }
  const end = e.loja_endereco || user.loja_endereco || 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ';
  const loja = e.loja_nome || user.loja_nome || 'Ótica Macaé';
  const pac = clientes.find(p => p.nome === e.paciente_nome && p.telefone === e.paciente_telefone);
  let cond = 'Encaixe';
  if (pac) {
    if (pac.neurodivergente && pac.deficiencia_fisica) cond = 'Neurodivergente e Def. Física';
    else if (pac.neurodivergente) cond = 'Neurodivergente';
    else if (pac.deficiencia_fisica) cond = 'Deficiência Física';
    else if (pac.encaixe) cond = 'Encaixe';
  }
  const idade = calcularIdade(pac?.data_nascimento);
  const idadeStr = idade !== null ? `\nIdade: ${idade} anos` : '';
  let msg = 'Nova consulta agendada\n----------------------------------------\n' + loja + '\nPaciente: ' + e.paciente_nome + idadeStr + '\nData: ' + formatDisplay(e.data_consulta) + '\nHorário: ' + e.horario + '\nTelefone: ' + e.paciente_telefone + '\nLocal: ' + end + '\nCondição: ' + cond;
  if (e.numero_pedido) msg += '\nPedido: #' + e.numero_pedido;
  const phone = medico.whatsapp.replace(/\D/g, '');
  if (phone) window.open('https://wa.me/55' + phone + '?text=' + encodeURIComponent(msg), '_blank');
  else showToast('WhatsApp do médico inválido', true);
}

// ========================================================================
// USUÁRIOS (CRUD)
// ========================================================================
async function salvarUsuario() {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem criar usuários.', true); return; }
  const tipo = document.getElementById('usuarioTipo').value;
  const telefone = document.getElementById('usuarioTelefone').value;
  if (tipo === 'vendedor' && !telefone) { showToast('Telefone obrigatório para vendedor', true); return; }
  const data = {
    nome: document.getElementById('usuarioNome').value,
    username: document.getElementById('usuarioUsername').value,
    senha: document.getElementById('usuarioSenha').value || undefined,
    telefone: telefone,
    tipo: tipo,
    loja_id: document.getElementById('usuarioLoja').value || null
  };
  const id = document.getElementById('editUsuarioId').value;
  const url = id ? API_URL + '/usuarios/' + id : API_URL + '/usuarios';
  const method = id ? 'PUT' : 'POST';
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(data) });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro'); }
    showToast(id ? 'Atualizado' : 'Criado');
    cancelarEdicaoUsuario();
    await carregarDados();
    await carregarLojas();
  } catch (err) { showToast(err.message, true); }
}

function renderUsuarios() {
  const c = document.getElementById('usuariosList');
  if (!c) return;
  if (usuarios.length === 0) { c.innerHTML = '<p class="no-data">Nenhum usuário</p>'; return; }
  c.innerHTML = usuarios.map(u =>
    `<div style="border-bottom:1px solid #ddd;padding:10px;display:flex;justify-content:space-between;align-items:center;">
      <div><strong>${escapeHtml(u.nome)}</strong><br>@${u.username} | ${u.tipo} ${u.telefone ? '📞 ' + u.telefone : ''}${u.loja_nome ? '<br>🏢 ' + escapeHtml(u.loja_nome) : ''}</div>
      <div><button onclick="editarUsuario(${u.id})">✏️</button>${u.username !== 'admin' ? `<button onclick="excluirUsuario(${u.id})">🗑️</button>` : ''}</div>
    </div>`
  ).join('');
}

function editarUsuario(id) {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem editar usuários.', true); return; }
  const u = usuarios.find(x => x.id === id);
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
    await fetch(API_URL + '/usuarios/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    showToast('Excluído');
    await carregarDados();
  } catch (err) { showToast(err.message, true); }
}

// ========================================================================
// SOLICITAÇÕES
// ========================================================================
async function enviarSolicitacao() {
  const btn = document.getElementById('btnEnviarSolicitacao');
  btn.disabled = true;
  btn.textContent = 'Enviando...';
  try {
    const data = document.getElementById('solDataConsulta').value;
    const h1 = document.getElementById('solHorario1').value;
    const dataNasc = document.getElementById('solPacienteDataNasc').value;

    if (!validarDataNascimento(dataNasc)) {
      btn.disabled = false;
      btn.textContent = 'Enviar Solicitação';
      return;
    }
    if (!validarDataHoraNaoPassada(data, h1, '1º Horário')) {
      btn.disabled = false;
      btn.textContent = 'Enviar Solicitação';
      return;
    }

    const medicoId = document.getElementById('solMedicoSelect').value;
    const medicoNome = medicos.find(m => m.id == medicoId)?.nome || '';
    const h2 = document.getElementById('solHorario2').value;
    const h3 = document.getElementById('solHorario3').value;
    if (!medicoId) { document.getElementById('solMsg').innerHTML = '<p style="color:red;">Selecione um médico.</p>';
      btn.disabled = false;
      btn.textContent = 'Enviar Solicitação'; return; }
    if (!data) { document.getElementById('solMsg').innerHTML = '<p style="color:red;">Selecione uma data.</p>';
      btn.disabled = false;
      btn.textContent = 'Enviar Solicitação'; return; }
    if (!h1) { document.getElementById('solMsg').innerHTML = '<p style="color:red;">Selecione pelo menos o 1º horário.</p>';
      btn.disabled = false;
      btn.textContent = 'Enviar Solicitação'; return; }
    const dados = {
      paciente_nome: document.getElementById('solPacienteNome').value.trim(),
      paciente_telefone: document.getElementById('solPacienteTelefone').value.trim(),
      paciente_email: document.getElementById('solPacienteEmail').value.trim(),
      paciente_cpf: document.getElementById('solPacienteCpf').value.trim(),
      data_nascimento: dataNasc,
      neurodivergente: document.getElementById('solNeurodivergente').checked ? 1 : 0,
      deficiencia_fisica: document.getElementById('solDeficienciaFisica').checked ? 1 : 0,
      encaixe: document.getElementById('solEncaixe').checked ? 1 : 0,
      data_consulta: data,
      horario1: h1,
      horario2: h2,
      horario3: h3,
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
    const r = await fetch(API_URL + '/solicitacoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(dados)
    });
    const ct = r.headers.get('content-type');
    if (!ct || !ct.includes('application/json')) {
      const text = await r.text();
      throw new Error(text || 'Erro no servidor');
    }
    const result = await r.json();
    if (!r.ok) throw new Error(result.error || 'Erro ao enviar solicitação');
    document.getElementById('solMsg').innerHTML = '<p style="color:green;">✅ Solicitação enviada! Aguarde aprovação.</p>';
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
  } catch (err) { document.getElementById('solMsg').innerHTML = '<p style="color:red;">❌ ' + err.message + '</p>'; } finally { btn.disabled = false;
    btn.textContent = 'Enviar Solicitação'; }
}

async function carregarSolicitacoes() {
  if (user.tipo !== 'admin') return;
  try {
    const r = await fetch(API_URL + '/solicitacoes', { headers: { Authorization: 'Bearer ' + token } });
    const lista = await r.json();
    const c = document.getElementById('solicitacoesList');
    if (!c) return;
    if (lista.length === 0) { c.innerHTML = '<p class="no-data">Nenhuma solicitação.</p>'; return; }
    c.innerHTML = lista.map(s => {
      const horarios = [s.horario_sugerido1, s.horario_sugerido2, s.horario_sugerido3].filter(h => h);
      let horHtml = '';
      let actHtml = '';
      if (s.status === 'pendente') {
        horHtml = horarios.map(h => `<label style="margin-right:10px;"><input type="radio" name="horario_${s.id}" value="${h}" ${s.horario_escolhido === h ? 'checked' : ''}> ${h}</label>`).join('');
        actHtml = `<div class="horario-radio-group">${horHtml}<button onclick="aprovarSolicitacao(${s.id})" class="btn-success" style="margin-top:5px;">✅ Aprovar (selecionado)</button><button onclick="rejeitarSolicitacao(${s.id})" class="btn-danger" style="margin-top:5px;">❌ Rejeitar</button></div>`;
      } else if (s.status === 'aprovado') {
        actHtml = `<div style="margin-top:5px; display:flex; gap:8px;">
          <button onclick="reabrirSolicitacao(${s.id})" class="btn-warning" style="padding:4px 12px;">🔓 Reabrir</button>
          <button onclick="editarSolicitacao(${s.id})" class="btn-primary" style="padding:4px 12px;">✏️ Editar</button>
        </div>`;
      }
      const ped = s.numero_pedido ? '<br><small>📦 Pedido: ' + escapeHtml(s.numero_pedido) + '</small>' : '';
      return `<div style="border-bottom:1px solid #ddd;padding:10px;${s.status === 'pendente' ? 'background:#fffbe6;' : ''}">
        <div><strong>${escapeHtml(s.paciente_nome)}</strong>${ped}<br>${formatDisplay(s.data_consulta)} | Médico: ${s.medico_nome}<br><span style="font-size:12px;color:${s.status === 'pendente' ? 'orange' : s.status === 'aprovado' ? 'green' : 'red'};">Status: ${s.status}</span>${s.status === 'pendente' ? '<span style="font-size:11px;color:#999;"> | Solicitado por: ' + escapeHtml(s.solicitante_nome) + '</span>' : ''}${s.horario_escolhido ? '<br><strong>Horário escolhido: ' + s.horario_escolhido + '</strong>' : ''}</div>${actHtml}</div>`;
    }).join('');
  } catch (err) { console.error(err);
    document.getElementById('solicitacoesList').innerHTML = '<p style="color:red;">Erro: ' + err.message + '</p>'; }
}

// ========================================================================
// REABRIR SOLICITAÇÃO APROVADA
// ========================================================================
async function reabrirSolicitacao(id) {
  if (!confirm('Reabrir esta solicitação? A consulta vinculada será excluída e você poderá editá-la.')) return;
  try {
    const r = await fetch(API_URL + '/solicitacoes/' + id + '/reabrir', {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Erro ao reabrir');
    }
    showToast('Solicitação reaberta!');
    carregarSolicitacoes();
    carregarDados();
  } catch (err) { showToast(err.message, true); }
}

// ========================================================================
// EDITAR SOLICITAÇÃO (carregar dados no formulário)
// ========================================================================
function editarSolicitacao(id) {
  fetch(API_URL + '/solicitacoes', { headers: { Authorization: 'Bearer ' + token } })
    .then(r => r.json())
    .then(lista => {
      const s = lista.find(item => item.id === id);
      if (!s) { showToast('Solicitação não encontrada', true); return; }
      if (s.status !== 'pendente' && s.status !== 'aprovado') {
        showToast('Só é possível editar solicitações pendentes ou reabertas.', true);
        return;
      }
      document.getElementById('solPacienteNome').value = s.paciente_nome || '';
      document.getElementById('solPacienteTelefone').value = s.paciente_telefone || '';
      document.getElementById('solPacienteEmail').value = s.paciente_email || '';
      document.getElementById('solPacienteCpf').value = s.paciente_cpf || '';
      document.getElementById('solPacienteDataNasc').value = s.data_nascimento || '';
      document.getElementById('solDataConsulta').value = s.data_consulta || '';
      document.getElementById('solHorario1').value = s.horario_sugerido1 || '';
      document.getElementById('solHorario2').value = s.horario_sugerido2 || '';
      document.getElementById('solHorario3').value = s.horario_sugerido3 || '';
      document.getElementById('solMedicoSelect').value = s.medico_id || '';
      document.getElementById('solObservacoes').value = s.observacoes || '';
      document.getElementById('solNumeroPedido').value = s.numero_pedido || '';

      const btn = document.getElementById('btnEnviarSolicitacao');
      btn.textContent = 'Atualizar Solicitação';
      btn.dataset.editId = id;
      btn.onclick = function() { atualizarSolicitacao(id); };
      navegarPara('pageSolicitar');
    })
    .catch(err => showToast('Erro ao carregar solicitação: ' + err.message, true));
}

// ========================================================================
// ATUALIZAR SOLICITAÇÃO (editar dados)
// ========================================================================
async function atualizarSolicitacao(id) {
  const btn = document.getElementById('btnEnviarSolicitacao');
  btn.disabled = true;
  btn.textContent = 'Atualizando...';
  try {
    const data = document.getElementById('solDataConsulta').value;
    const h1 = document.getElementById('solHorario1').value;
    const dataNasc = document.getElementById('solPacienteDataNasc').value;

    if (!validarDataNascimento(dataNasc)) { btn.disabled = false;
      btn.textContent = 'Atualizar Solicitação'; return; }
    if (!validarDataHoraNaoPassada(data, h1, '1º Horário')) { btn.disabled = false;
      btn.textContent = 'Atualizar Solicitação'; return; }

    const medicoId = document.getElementById('solMedicoSelect').value;
    const medicoNome = medicos.find(m => m.id == medicoId)?.nome || '';
    const h2 = document.getElementById('solHorario2').value;
    const h3 = document.getElementById('solHorario3').value;

    const dados = {
      paciente_nome: document.getElementById('solPacienteNome').value.trim(),
      paciente_telefone: document.getElementById('solPacienteTelefone').value.trim(),
      paciente_email: document.getElementById('solPacienteEmail').value.trim(),
      paciente_cpf: document.getElementById('solPacienteCpf').value.trim(),
      data_consulta: data,
      horario1: h1,
      horario2: h2,
      horario3: h3,
      medico_id: parseInt(medicoId),
      medico_nome: medicoNome,
      observacoes: document.getElementById('solObservacoes').value.trim(),
      numero_pedido: document.getElementById('solNumeroPedido').value.trim() || null
    };

    if (!dados.paciente_nome || !dados.paciente_telefone) {
      showToast('Nome e telefone do paciente são obrigatórios.', true);
      btn.disabled = false;
      btn.textContent = 'Atualizar Solicitação';
      return;
    }

    const r = await fetch(API_URL + '/solicitacoes/' + id + '/editar', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(dados)
    });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || 'Erro ao atualizar');
    }
    showToast('Solicitação atualizada!');
    btn.textContent = 'Enviar Solicitação';
    btn.onclick = function() { enviarSolicitacao(); };
    delete btn.dataset.editId;
    navegarPara('pageAdmin');
    mostrarSubPage('solicitacoes');
  } catch (err) {
    showToast('Erro: ' + err.message, true);
  } finally {
    btn.disabled = false;
    if (btn.textContent === 'Atualizando...') btn.textContent = 'Atualizar Solicitação';
  }
}

// ========================================================================
// APROVAR/REJEITAR SOLICITAÇÃO
// ========================================================================
async function aprovarSolicitacao(id) {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem aprovar.', true); return; }
  if (!confirm('Aprovar esta solicitação?')) return;
  const radio = document.querySelector(`input[name="horario_${id}"]:checked`);
  if (!radio) { showToast('Selecione um horário para aprovar.', true); return; }
  const hor = radio.value;
  try {
    const r = await fetch(API_URL + '/solicitacoes/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ status: 'aprovado', horario_escolhido: hor })
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro'); }
    showToast('Solicitação aprovada!');
    await carregarSolicitacoes();
    await carregarDados();
    renderizarCalendario();
    renderizarLista(paginaAtual);
    atualizarBadgeSolicitacoes();
  } catch (err) { showToast(err.message, true); }
}

async function rejeitarSolicitacao(id) {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem rejeitar.', true); return; }
  if (!confirm('Rejeitar esta solicitação?')) return;
  try {
    const r = await fetch(API_URL + '/solicitacoes/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ status: 'rejeitado' })
    });
    if (!r.ok) throw new Error('Erro');
    showToast('Solicitação rejeitada.');
    await carregarSolicitacoes();
    atualizarBadgeSolicitacoes();
  } catch (err) { showToast(err.message, true); }
}

async function atualizarBadgeSolicitacoes() {
  if (user.tipo !== 'admin') return;
  try {
    const r = await fetch(API_URL + '/solicitacoes/pendentes/count', { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return;
    const d = await r.json();
    const b1 = document.getElementById('badgeSolicitacoes');
    const b2 = document.getElementById('badgeSolicitacoesMenu');
    [b1, b2].forEach(b => { if (b) { b.textContent = d.total;
        b.style.display = d.total > 0 ? 'inline' : 'none'; } });
    if (window._ultimoContadorSolic === undefined) window._ultimoContadorSolic = 0;
    if (d.total > window._ultimoContadorSolic && d.total > 0) showToast('📩 ' + d.total + ' nova(s) solicitação(ões)');
    window._ultimoContadorSolic = d.total;
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
    const r = await fetch(API_URL + '/lembretes', { headers: { Authorization: 'Bearer ' + token } });
    const lista = await r.json();
    const c = document.getElementById('lembretesList');
    if (!c) return;
    if (lista.length === 0) { c.innerHTML = '<p>Nenhum lembrete pendente.</p>'; return; }
    c.innerHTML = lista.map(l =>
      `<div style="border-bottom:1px solid #ddd;padding:10px;">
        <strong>${escapeHtml(l.destinatario_nome)}</strong> (${l.destinatario_tipo})<br>
        <span style="font-size:13px;">${escapeHtml(l.mensagem)}</span><br>
        <small>Enviar em: ${new Date(l.data_envio_programada).toLocaleString()}</small>
        <button onclick="marcarLembreteEnviado(${l.id})" class="btn-success" style="margin-left:10px;">✅ Simular envio</button>
      </div>`
    ).join('');
    const badge = document.getElementById('badgeLembretes');
    if (badge) { badge.textContent = lista.length;
      badge.style.display = lista.length > 0 ? 'inline' : 'none'; }
    if (lista.length > _ultimoContadorLembretes && lista.length > 0) showToast('🔔 ' + lista.length + ' lembrete(s) pendente(s)');
    _ultimoContadorLembretes = lista.length;
  } catch (err) { console.error(err); }
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
    await fetch(API_URL + '/lembretes/' + id + '/enviar', { method: 'PUT', headers: { Authorization: 'Bearer ' + token } });
    showToast('Lembrete enviado!');
    carregarLembretes();
  } catch (err) { showToast(err.message, true); }
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
    const r = await fetch(API_URL + '/whatsapp/config', { headers: { Authorization: 'Bearer ' + token } });
    const d = await r.json();
    document.getElementById('whatsappNumero').value = d.numero || '';
    document.getElementById('whatsappEndereco').value = d.endereco_otica || '';
  } catch (err) { console.error(err); }
}

async function salvarConfigWhatsapp() {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem configurar.', true); return; }
  const data = { numero: document.getElementById('whatsappNumero').value, endereco_otica: document.getElementById('whatsappEndereco').value };
  try {
    const r = await fetch(API_URL + '/whatsapp/config', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error('Erro');
    showToast('Configurações salvas!');
  } catch (err) { showToast(err.message, true); }
}

// ========================================================================
// PERFIL
// ========================================================================
function abrirModalPerfil() { navegarPara('pagePerfil'); }

async function salvarAlterarSenha() {
  const atual = document.getElementById('perfilSenhaAtual').value;
  const nova = document.getElementById('perfilNovaSenha').value;
  const confirma = document.getElementById('perfilConfirmarSenha').value;
  if (!atual || !nova || !confirma) { document.getElementById('perfilMsg').innerHTML = '<p style="color:red;">Preencha todos os campos.</p>'; return; }
  if (nova.length < 6) { document.getElementById('perfilMsg').innerHTML = '<p style="color:red;">Nova senha deve ter pelo menos 6 caracteres.</p>'; return; }
  if (nova !== confirma) { document.getElementById('perfilMsg').innerHTML = '<p style="color:red;">As senhas não coincidem.</p>'; return; }
  try {
    const r = await fetch(API_URL + '/perfil/alterar-senha', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ senha_atual: atual, nova_senha: nova }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Erro');
    document.getElementById('perfilMsg').innerHTML = '<p style="color:green;">' + d.message + '</p>';
    setTimeout(() => {
      document.getElementById('perfilSenhaAtual').value = '';
      document.getElementById('perfilNovaSenha').value = '';
      document.getElementById('perfilConfirmarSenha').value = '';
      document.getElementById('perfilMsg').innerHTML = '';
      showToast('Senha alterada!');
    }, 2000);
  } catch (err) { document.getElementById('perfilMsg').innerHTML = '<p style="color:red;">' + err.message + '</p>'; }
}

// ========================================================================
// CONFIGURAÇÕES DE IMPRESSÃO
// ========================================================================
function carregarConfigImpressao() {
  const config = localStorage.getItem('printConfig');
  if (config) {
    const p = JSON.parse(config);
    document.getElementById('printMarginLeft').value = p.marginLeft || 20;
    document.getElementById('printMarginRight').value = p.marginRight || 20;
    document.getElementById('printMarginTop').value = p.marginTop || 20;
    document.getElementById('printHeaderHeight').value = p.headerHeight || 80;
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
  document.getElementById('configImpressaoMsg').innerHTML = '<p style="color:green;">Configurações salvas!</p>';
  setTimeout(() => document.getElementById('configImpressaoMsg').innerHTML = '', 3000);
}

// ========================================================================
// NAVEGAÇÃO DO CALENDÁRIO
// ========================================================================
function mudarView(view) { currentView = view;
  renderizarCalendario(); }

function hoje() { currentDate = new Date();
  renderizarCalendario(); }

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
  let stHtml = '';
  if (status === 'cancelada') stHtml = ' <span style="color:red;">(Cancelada)</span>';
  else if (status === 'confirmada') stHtml = ' <span style="color:green;">(Confirmada)</span>';
  else if (status === 'realizada') stHtml = ' <span style="color:blue;">(Realizada)</span>';
  const vendedor = e.vendedor_nome || 'Não informado';
  const isRealizada = status === 'realizada';
  const podeEditar = user.tipo === 'admin' && !isRealizada && status !== 'cancelada';
  let adminActions = '';
  if (user.tipo === 'admin') {
    adminActions = `
      ${podeEditar ? `<button onclick="editarConsulta(${e.id});fecharModalDetalhes();" class="btn-warning" style="width:100%;margin-top:5px;">✏️ Editar</button>` : ''}
      ${podeEditar && status !== 'cancelada' && status !== 'realizada' && status !== 'confirmada' ? `<button onclick="confirmarConsulta(${e.id});fecharModalDetalhes();" class="btn-success" style="width:100%;margin-top:5px;">✅ Confirmar</button>` : ''}
      ${podeEditar && status !== 'cancelada' && status !== 'realizada' ? `<button onclick="processarConsulta(${e.id});fecharModalDetalhes();" class="btn-process" style="width:100%;margin-top:5px;">🔄 Processar</button>` : ''}
      ${podeEditar ? `<button onclick="cancelarConsulta(${e.id});fecharModalDetalhes();" class="btn-danger" style="width:100%;margin-top:5px;">🚫 Cancelar</button>` : ''}
      ${!isRealizada ? `<button onclick="enviarWhatsAppPaciente(${e.id})" class="btn-whatsapp" style="width:100%;margin-top:5px;">📱 WhatsApp Paciente</button>` : ''}
      ${!isRealizada ? `<button onclick="enviarWhatsAppMedico(${e.id})" class="btn-medico" style="width:100%;margin-top:5px;">📱 WhatsApp Médico</button>` : ''}
      <button onclick="abrirModalImpressao(${e.id});fecharModalDetalhes();" class="btn-print" style="width:100%;margin-top:5px;">🖨️ Imprimir Comprovante</button>
      ${isRealizada ? '<p style="color:#2b6cb0;font-weight:bold;margin-top:10px;">✅ Consulta já realizada. Nenhuma ação disponível.</p>' : ''}
    `;
  }
  const hasPedido = e.numero_pedido ? '<div><strong>Nº Pedido:</strong> ' + escapeHtml(e.numero_pedido) + '</div>' : '';
  const lojaStr = e.loja_nome ? '<div><strong>Loja:</strong> ' + escapeHtml(e.loja_nome) + '</div>' : '';
  body.innerHTML = `
    <div><strong>Paciente:</strong> ${escapeHtml(e.paciente_nome)}</div>
    <div><strong>Data/Hora:</strong> ${formatDisplay(e.data_consulta)} ${e.horario}</div>
    <div><strong>Médico:</strong> Dr. ${escapeHtml(e.medico_nome)}</div>
    <div><strong>Telefone:</strong> ${e.paciente_telefone}</div>
    ${e.paciente_email ? '<div><strong>E-mail:</strong> ' + escapeHtml(e.paciente_email) + '</div>' : ''}
    ${hasPedido}${lojaStr}
    ${e.observacoes ? '<div><strong>Observações:</strong> ' + escapeHtml(e.observacoes) + '</div>' : ''}
    <div><strong>Status:</strong> ${status}${stHtml}</div>
    <div><strong>Vendedor:</strong> ${escapeHtml(vendedor)}</div>
    <div style="margin-top:15px;display:flex;flex-direction:column;gap:5px;">${adminActions}</div>
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
  const tk = localStorage.getItem('token');
  const su = localStorage.getItem('user');
  if (tk && su) {
    token = tk;
    user = JSON.parse(su);
    fetch(API_URL + '/verify', { headers: { Authorization: 'Bearer ' + tk } })
      .then(r => r.json())
      .then(d => {
        if (d.valid) {
          document.getElementById('loginDiv').style.display = 'none';
          document.getElementById('dashboardDiv').style.display = 'block';
          const labelTipo = user.tipo === 'admin' ? 'Admin' : user.tipo === 'consultorio' ? 'Consultório' : 'Vendedor';
          document.getElementById('userName').innerHTML = '👤 ' + user.nome + ' (' + labelTipo + ')';
          document.getElementById('menuUserName').textContent = user.nome;
          document.getElementById('menuUserTipo').textContent = labelTipo;
          if (user.loja_nome) {
            document.getElementById('lojaNome').innerHTML = '🏢 ' + user.loja_nome;
            document.getElementById('menuLojaNome').textContent = '🏢 ' + user.loja_nome;
          }
          const isAdmin = user.tipo === 'admin';
          const isConsult = user.tipo === 'consultorio';
          document.getElementById('menuCalendario').style.display = isConsult ? 'none' : 'block';
          document.getElementById('menuAgendar').style.display = isAdmin ? 'block' : 'none';
          document.getElementById('menuSolicitar').style.display = isConsult ? 'none' : 'block';
          document.getElementById('menuDashboard').style.display = isAdmin ? 'block' : 'none';
          document.getElementById('menuAdmin').style.display = isAdmin ? 'block' : 'none';
          document.querySelectorAll('.menu-item[data-sub]').forEach(el => el.style.display = isAdmin ? 'block' : 'none');
          document.getElementById('perfilNome').textContent = user.nome;
          document.getElementById('perfilUsername').textContent = user.username;
          document.getElementById('perfilTipo').textContent = labelTipo;
          document.getElementById('perfilLoja').textContent = user.loja_nome || 'Não vinculado';
          carregarDados();
          renderizarLista(1);
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
        } else localStorage.clear();
      })
      .catch(() => localStorage.clear());
  }
})();

document.querySelectorAll('.modal-overlay').forEach(modal => {
  modal.addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('show');
  });
});

console.log('✅ Sistema completo com busca, reabrir/editar solicitações e outras melhorias.');