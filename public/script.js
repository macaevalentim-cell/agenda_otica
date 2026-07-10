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
let filtrosAtivos = false; // indica se a lista atual é resultado de filtro

// ========================================================================
// UTILITÁRIOS
// ========================================================================
function showToast(m, e = !1) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = m;
  t.className = 'toast' + (e ? ' error' : '');
  t.classList.add('show');
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove('show'), 4000);
}

function formatDate(d) {
  let e = new Date(d);
  return e.getFullYear() + '-' + String(e.getMonth() + 1).padStart(2, '0') + '-' + String(e.getDate()).padStart(2, '0');
}

function formatDisplay(d) {
  if (!d) return '';
  let p = d.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

function escapeHtml(t) {
  if (!t) return '';
  let e = document.createElement('div');
  e.textContent = t;
  return e.innerHTML;
}

function calcularIdade(d) {
  if (!d) return null;
  const h = new Date(),
    n = new Date(d);
  let i = h.getFullYear() - n.getFullYear();
  const m = h.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && h.getDate() < n.getDate())) i--;
  return i;
}

function isDataPassada(d) {
  if (!d) return !1;
  const h = new Date();
  h.setHours(0, 0, 0, 0);
  const n = new Date(d + 'T00:00:00');
  return n < h;
}

function validarDataNaoPassada(d, c = 'Data') {
  if (isDataPassada(d)) {
    showToast(c + ' não pode ser no passado.', !0);
    return !1;
  }
  return !0;
}

function atualizarIdadeDisplay() {
  const d = document.getElementById('pacienteDataNasc')?.value,
    i = calcularIdade(d);
  document.getElementById('idadeDisplay').innerHTML = i !== null ? 'Idade: ' + i + ' anos' : '';
}
document.addEventListener('change', function(e) {
  if (e.target.id === 'pacienteDataNasc') atualizarIdadeDisplay();
});

function atualizarIdadeSol() {
  const d = document.getElementById('solPacienteDataNasc')?.value,
    i = calcularIdade(d);
  document.getElementById('solIdadeDisplay').innerHTML = i !== null ? 'Idade: ' + i + ' anos' : '';
}
document.addEventListener('change', function(e) {
  if (e.target.id === 'solPacienteDataNasc') atualizarIdadeSol();
});

function setupEncaixeLogic(e, n, d) {
  const a = document.getElementById(e),
    r = document.getElementById(n),
    o = document.getElementById(d);
  if (!a || !r || !o) return;

  function c() {
    a.checked ? (r.checked = !1, o.checked = !1, r.disabled = !0, o.disabled = !0) : (r.disabled = !1, o.disabled = !1);
  }
  a.addEventListener('change', c);
  r.addEventListener('change', function() {
    this.checked && (a.checked = !1, o.disabled = !1);
  });
  o.addEventListener('change', function() {
    this.checked && (a.checked = !1, r.disabled = !1);
  });
  c();
}

// ========================================================================
// TEMA CLARO/ESCURO
// ========================================================================
function aplicarTema() {
  const t = localStorage.getItem('theme') || 'light';
  if (t === 'dark') {
    document.body.classList.add('dark-theme');
    const i = document.querySelector('#themeToggle i');
    if (i) i.className = 'fas fa-sun';
  } else {
    document.body.classList.remove('dark-theme');
    const i = document.querySelector('#themeToggle i');
    if (i) i.className = 'fas fa-moon';
  }
}

function toggleTheme() {
  const b = document.body;
  b.classList.toggle('dark-theme');
  const t = b.classList.contains('dark-theme') ? 'dark' : 'light';
  localStorage.setItem('theme', t);
  const i = document.querySelector('#themeToggle i');
  if (i) i.className = t === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

// ========================================================================
// NAVEGAÇÃO
// ========================================================================
function navegarPara(p) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  const t = document.getElementById(p);
  if (t) t.classList.add('active');
  document.querySelectorAll('.menu-item').forEach(x => x.classList.remove('active'));
  const m = document.querySelector(`.menu-item[data-page="${p}"]`);
  if (m) m.classList.add('active');
  if (p === 'pageAdmin') mostrarSubPage('medicos');
  if (p === 'pagePerfil') {
    document.getElementById('perfilNome').textContent = user.nome;
    document.getElementById('perfilUsername').textContent = user.username;
    document.getElementById('perfilTipo').textContent = user.tipo === 'admin' ? 'Administrador' : user.tipo === 'consultorio' ? 'Consultório' : 'Vendedor';
    document.getElementById('perfilLoja').textContent = user.loja_nome || 'Não vinculado';
  }
  if (p === 'pageLista') {
    if (!filtrosAtivos) {
      // Se não houver filtros ativos, carrega dados normais
      carregarDados();
    } else {
      renderizarLista(paginaAtual);
    }
  }
  if (p === 'pageCalendario') renderizarCalendario();
  if (p === 'pageDashboard' && user.tipo === 'admin') carregarDashboard();
  fecharMenu();
}

function mostrarSubPage(s) {
  if (user.tipo !== 'admin') { showToast('Acesso negado.', !0); return }
  document.querySelectorAll('#pageAdmin .sub-page').forEach(el => { el.classList.remove('active');
    el.style.display = 'none' });
  const t = document.getElementById('sub' + s.charAt(0).toUpperCase() + s.slice(1));
  if (t) { t.classList.add('active');
    t.style.display = 'block' }
  document.querySelectorAll('.admin-tabs .tab-btn').forEach(b => { b.classList.remove('active'); if (b.getAttribute('data-sub') === s) b.classList.add('active') });
  if (s === 'solicitacoes') carregarSolicitacoes();
  if (s === 'whatsapp') carregarConfigWhatsapp();
  if (s === 'usuarios') { renderUsuarios();
    preencherSelectLojas() }
  if (s === 'lojas') carregarLojas();
  if (s === 'configImpressao') carregarConfigImpressao();
  if (s === 'medicos') { renderMedicos();
    document.getElementById('horariosMedico').style.display = 'none' }
  if (s === 'pacientes') renderPacientes();
}

function abrirMenu() {
  document.getElementById('sideMenu').classList.add('open');
  document.getElementById('menuOverlay').classList.add('show');
}

function fecharMenu() {
  document.getElementById('sideMenu').classList.remove('open');
  document.getElementById('menuOverlay').classList.remove('show');
}

document.addEventListener('DOMContentLoaded', function() {
  aplicarTema();
  const tb = document.getElementById('themeToggle');
  if (tb) tb.addEventListener('click', toggleTheme);
  const hb = document.getElementById('hamburgerBtn'),
    cb = document.getElementById('closeMenuBtn'),
    ov = document.getElementById('menuOverlay');
  if (hb) hb.addEventListener('click', function(e) { e.stopPropagation();
    abrirMenu() });
  if (cb) cb.addEventListener('click', fecharMenu);
  if (ov) ov.addEventListener('click', fecharMenu);
  document.querySelectorAll('.menu-item').forEach(b => {
    b.addEventListener('click', function() {
      const p = this.getAttribute('data-page'),
        s = this.getAttribute('data-sub');
      if (s) { navegarPara('pageAdmin');
        mostrarSubPage(s) } else if (p) navegarPara(p);
      fecharMenu();
    });
  });
  document.querySelectorAll('.admin-tabs .tab-btn').forEach(b => {
    b.addEventListener('click', function() {
      const s = this.getAttribute('data-sub');
      if (s) mostrarSubPage(s);
    });
  });
  // Busca automática com debounce
  const iBusca = document.getElementById('buscaPaciente');
  if (iBusca) {
    iBusca.addEventListener('input', function() {
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
    if (el) el.addEventListener('change', function() {
      // Se algum filtro estiver preenchido, aplica
      if (document.getElementById('buscaPaciente').value.trim() || this.value || document.getElementById('buscaDataInicio').value || document.getElementById('buscaDataFim').value) {
        aplicarFiltros();
      } else {
        limparFiltros();
      }
    });
  });
});

// ========================================================================
// LOGIN
// ========================================================================
async function fazerLogin() {
  const u = document.getElementById('username').value,
    pw = document.getElementById('password').value;
  try {
    const r = await fetch(API_URL + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: pw })
    });
    const ct = r.headers.get('content-type');
    if (!ct || !ct.includes('application/json')) {
      const t = await r.text();
      throw new Error(t || 'Erro no servidor');
    }
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Erro no login');
    token = d.token;
    user = d.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    document.getElementById('loginDiv').style.display = 'none';
    document.getElementById('dashboardDiv').style.display = 'block';
    const lt = user.tipo === 'admin' ? 'Admin' : user.tipo === 'consultorio' ? 'Consultório' : 'Vendedor';
    document.getElementById('userName').innerHTML = '👤 ' + user.nome + ' (' + lt + ')';
    document.getElementById('menuUserName').textContent = user.nome;
    document.getElementById('menuUserTipo').textContent = lt;
    if (user.loja_nome) {
      document.getElementById('lojaNome').innerHTML = '🏢 ' + user.loja_nome;
      document.getElementById('menuLojaNome').textContent = '🏢 ' + user.loja_nome;
    }
    const isAdmin = user.tipo === 'admin',
      isConsult = user.tipo === 'consultorio';
    document.getElementById('menuCalendario').style.display = isConsult ? 'none' : 'block';
    document.getElementById('menuAgendar').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('menuSolicitar').style.display = isConsult ? 'none' : 'block';
    document.getElementById('menuDashboard').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('menuAdmin').style.display = isAdmin ? 'block' : 'none';
    document.querySelectorAll('.menu-item[data-sub]').forEach(el => el.style.display = isAdmin ? 'block' : 'none');
    document.getElementById('perfilNome').textContent = user.nome;
    document.getElementById('perfilUsername').textContent = user.username;
    document.getElementById('perfilTipo').textContent = lt;
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
  } catch (e) {
    document.getElementById('loginMsg').innerHTML = '<p style="color:red;">' + e.message + '</p>';
    console.error(e);
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
    let d = await rC.json();
    consultas = d.map(c => ({ ...c, data_consulta: c.data_consulta || null, is_own: c.is_own === 1 }));
    const rM = await fetch(API_URL + '/medicos', { headers: { Authorization: 'Bearer ' + token } });
    medicos = await rM.json();
    preencherSelectMedico();
    preencherSelectMedicoSol();
    const rCl = await fetch(API_URL + '/clientes', { headers: { Authorization: 'Bearer ' + token } });
    clientes = await rCl.json();
    preencherSelectPacientes();
    renderizarLista(paginaAtual);
    if (user.tipo === 'admin') {
      const rU = await fetch(API_URL + '/usuarios', { headers: { Authorization: 'Bearer ' + token } });
      usuarios = await rU.json();
      renderUsuarios();
      renderMedicos();
      renderPacientes();
      atualizarBadgeSolicitacoes();
      carregarConfigWhatsapp();
      carregarDashboard();
      preencherSelectVendedores();
    }
    // Resetar flag de filtros
    filtrosAtivos = false;
  } catch (e) {
    console.error(e);
    showToast('Erro ao carregar dados: ' + e.message, !0);
  }
}

// ========================================================================
// PREENCHER SELECT DE VENDEDORES PARA FILTRO
// ========================================================================
function preencherSelectVendedores() {
  const s = document.getElementById('buscaVendedor');
  if (!s) return;
  const isAdmin = user.tipo === 'admin';
  let ops = '<option value="">Todos</option>';
  if (isAdmin) {
    usuarios.forEach(u => {
      if (u.tipo === 'vendedor' || u.tipo === 'admin') ops += `<option value="${u.id}">${escapeHtml(u.nome)}</option>`;
    });
  } else {
    ops += `<option value="${user.id}" selected>${escapeHtml(user.nome)}</option>`;
  }
  s.innerHTML = ops;
}

// ========================================================================
// FILTROS DE BUSCA NA LISTA
// ========================================================================
function aplicarFiltros() {
  const p = document.getElementById('buscaPaciente').value.trim();
  const v = document.getElementById('buscaVendedor').value;
  const st = document.getElementById('buscaStatus').value;
  const di = document.getElementById('buscaDataInicio').value;
  const df = document.getElementById('buscaDataFim').value;

  // Se todos os filtros estiverem vazios, apenas recarrega os dados normais
  if (!p && !v && !st && !di && !df) {
    limparFiltros();
    return;
  }

  const params = new URLSearchParams();
  if (p) params.append('paciente', p);
  if (v) params.append('vendedor_id', v);
  if (st) params.append('status', st);
  if (di) params.append('data_inicio', di);
  if (df) params.append('data_fim', df);

  fetch(API_URL + '/consultas/filtrar?' + params.toString(), { headers: { Authorization: 'Bearer ' + token } })
    .then(r => {
      if (!r.ok) {
        return r.text().then(text => { throw new Error(text || 'Erro ao filtrar') });
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
    .catch(e => {
      showToast('Erro ao filtrar: ' + e.message, !0);
      console.error(e);
    });
}

function limparFiltros() {
  document.getElementById('buscaPaciente').value = '';
  document.getElementById('buscaVendedor').value = '';
  document.getElementById('buscaStatus').value = '';
  document.getElementById('buscaDataInicio').value = '';
  document.getElementById('buscaDataFim').value = '';
  filtrosAtivos = false;
  carregarDados(); // recarrega todos os dados
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
  } catch (e) { showToast('Erro ao carregar lojas', !0) }
}

function renderLojas() {
  const c = document.getElementById('lojasList');
  if (!c) return;
  if (lojas.length === 0) { c.innerHTML = '<p class="no-data">Nenhuma loja cadastrada.</p>'; return }
  c.innerHTML = lojas.map(l =>
    `<div style="border-bottom:1px solid #ddd;padding:10px;display:flex;justify-content:space-between;align-items:center;">
      <div><strong>${escapeHtml(l.nome)}</strong><br>${l.endereco||''}</div>
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
  if (!n) { showToast('Erro: campo Nome não encontrado.', !0); return }
  let e = document.getElementById('lojaEndereco');
  if (!e) e = document.querySelector('input[name="lojaEndereco"]');
  if (!e) { showToast('Erro: campo Endereço não encontrado.', !0); return }
  const nome = n.value.trim(),
    end = e.value.trim();
  if (nome === '') { showToast('O nome da loja é obrigatório.', !0); return }
  const id = document.getElementById('editLojaId').value,
    url = id ? API_URL + '/lojas/' + id : API_URL + '/lojas',
    method = id ? 'PUT' : 'POST';
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ nome, endereco: end }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Erro');
    showToast(id ? 'Loja atualizada!' : 'Loja cadastrada!');
    cancelarEdicaoLoja();
    await carregarLojas();
    preencherSelectLojas();
  } catch (e) { showToast(e.message, !0) }
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
  } catch (e) { showToast(e.message, !0) }
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
  const c = document.getElementById('buscarCpf').value.trim();
  if (!c) { showToast('Digite um CPF', !0); return }
  try {
    const r = await fetch(API_URL + '/clientes/buscar?cpf=' + c, { headers: { Authorization: 'Bearer ' + token } });
    const p = await r.json();
    if (!p) { showToast('Não encontrado', !0); return }
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
  } catch (e) { showToast('Erro: ' + e.message, !0) }
}

function limparBuscaPaciente() {
  document.getElementById('buscarCpf').value = '';
  document.getElementById('pacienteNome').value = '';
  document.getElementById('pacienteTelefone').value = '';
  document.getElementById('pacienteEmail').value = '';
  document.getElementById('pacienteCpf').value = '';
  document.getElementById('pacienteDataNasc').value = '';
  document.getElementById('pacienteNeurodivergente').checked = !1;
  document.getElementById('pacienteDeficienciaFisica').checked = !1;
  document.getElementById('pacienteEncaixe').checked = !0;
  document.getElementById('pacienteSelect').value = '';
  document.getElementById('idadeDisplay').innerHTML = '';
  setupEncaixeLogic('pacienteEncaixe', 'pacienteNeurodivergente', 'pacienteDeficienciaFisica');
}

async function buscarPacienteSol() {
  const c = document.getElementById('solBuscarCpf').value.trim();
  if (!c) { showToast('Digite um CPF', !0); return }
  try {
    const r = await fetch(API_URL + '/clientes/buscar?cpf=' + c, { headers: { Authorization: 'Bearer ' + token } });
    const p = await r.json();
    if (!p) { showToast('Não encontrado', !0); return }
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
  } catch (e) { showToast('Erro: ' + e.message, !0) }
}

// ========================================================================
// CRUD DE PACIENTES
// ========================================================================
async function salvarPaciente() {
  const d = {
    nome: document.getElementById('pacienteCadNome').value,
    telefone: document.getElementById('pacienteCadTelefone').value,
    email: document.getElementById('pacienteCadEmail').value,
    cpf: document.getElementById('pacienteCadCpf').value,
    data_nascimento: document.getElementById('pacienteCadDataNasc').value,
    neurodivergente: document.getElementById('pacienteCadNeurodivergente').checked ? 1 : 0,
    deficiencia_fisica: document.getElementById('pacienteCadDeficienciaFisica').checked ? 1 : 0,
    encaixe: document.getElementById('pacienteCadEncaixe').checked ? 1 : 0
  };
  const id = document.getElementById('editPacienteId').value,
    url = id ? API_URL + '/clientes/' + id : API_URL + '/clientes',
    method = id ? 'PUT' : 'POST';
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(d) });
    if (!r.ok) throw new Error('Erro');
    showToast(id ? 'Atualizado!' : 'Cadastrado!');
    cancelarEdicaoPaciente();
    await carregarDados();
  } catch (e) { showToast(e.message, !0) }
}

function renderPacientes() {
  const c = document.getElementById('pacientesList');
  if (!c) return;
  if (clientes.length === 0) { c.innerHTML = '<p class="no-data">Nenhum paciente cadastrado.</p>'; return }
  c.innerHTML = clientes.map(p =>
    `<div style="border-bottom:1px solid #ddd;padding:10px;display:flex;justify-content:space-between;align-items:center;">
      <div><strong>${escapeHtml(p.nome)}</strong><br>📞 ${p.telefone} ${p.email?'✉️ '+p.email:''} ${p.cpf?'CPF: '+p.cpf:''}</div>
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
  document.getElementById('pacienteCadNeurodivergente').checked = !1;
  document.getElementById('pacienteCadDeficienciaFisica').checked = !1;
  document.getElementById('pacienteCadEncaixe').checked = !0;
  setupEncaixeLogic('pacienteCadEncaixe', 'pacienteCadNeurodivergente', 'pacienteCadDeficienciaFisica');
}

async function excluirPaciente(id) {
  if (!confirm('Excluir este paciente?')) return;
  try {
    await fetch(API_URL + '/clientes/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    showToast('Excluído');
    await carregarDados();
  } catch (e) { showToast(e.message, !0) }
}

function abrirModalCadastroPaciente() {
  document.getElementById('modalCadastroPaciente').classList.add('show');
  document.getElementById('novoPacienteMsg').innerHTML = '';
  document.getElementById('novoPacienteNome').value = '';
  document.getElementById('novoPacienteTelefone').value = '';
  document.getElementById('novoPacienteEmail').value = '';
  document.getElementById('novoPacienteCpf').value = '';
  document.getElementById('novoPacienteDataNasc').value = '';
  document.getElementById('novoPacienteNeurodivergente').checked = !1;
  document.getElementById('novoPacienteDeficienciaFisica').checked = !1;
  document.getElementById('novoPacienteEncaixe').checked = !0;
  setupEncaixeLogic('novoPacienteEncaixe', 'novoPacienteNeurodivergente', 'novoPacienteDeficienciaFisica');
}

function fecharModalCadastroPaciente() {
  document.getElementById('modalCadastroPaciente').classList.remove('show');
}

async function salvarNovoPaciente() {
  const d = {
    nome: document.getElementById('novoPacienteNome').value,
    telefone: document.getElementById('novoPacienteTelefone').value,
    email: document.getElementById('novoPacienteEmail').value,
    cpf: document.getElementById('novoPacienteCpf').value,
    data_nascimento: document.getElementById('novoPacienteDataNasc').value,
    neurodivergente: document.getElementById('novoPacienteNeurodivergente').checked ? 1 : 0,
    deficiencia_fisica: document.getElementById('novoPacienteDeficienciaFisica').checked ? 1 : 0,
    encaixe: document.getElementById('novoPacienteEncaixe').checked ? 1 : 0
  };
  if (!d.nome || !d.telefone) { document.getElementById('novoPacienteMsg').innerHTML = '<p style="color:red;">Nome e telefone são obrigatórios.</p>'; return }
  try {
    const r = await fetch(API_URL + '/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(d) });
    if (!r.ok) throw new Error('Erro');
    showToast('Paciente cadastrado!');
    fecharModalCadastroPaciente();
    await carregarDados();
    const np = clientes.find(p => p.cpf === d.cpf || (p.nome === d.nome && p.telefone === d.telefone));
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
  } catch (e) { document.getElementById('novoPacienteMsg').innerHTML = '<p style="color:red;">' + e.message + '</p>' }
}

// ========================================================================
// CRUD DE MÉDICOS
// ========================================================================
async function salvarMedico() {
  const d = {
    nome: document.getElementById('medicoNome').value,
    crm: document.getElementById('medicoCrm').value,
    telefone: document.getElementById('medicoTelefone').value,
    email: document.getElementById('medicoEmail').value,
    especialidade: document.getElementById('medicoEspecialidade').value,
    whatsapp: document.getElementById('medicoWhatsapp').value,
    endereco: document.getElementById('medicoEndereco').value,
    mensagem_padrao: document.getElementById('medicoMensagemPadrao').value
  };
  const id = document.getElementById('editMedicoId').value,
    url = id ? API_URL + '/medicos/' + id : API_URL + '/medicos',
    method = id ? 'PUT' : 'POST';
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(d) });
    if (!r.ok) throw new Error('Erro');
    showToast(id ? 'Atualizado!' : 'Cadastrado!');
    cancelarEdicaoMedico();
    await carregarDados();
  } catch (e) { showToast(e.message, !0) }
}

function renderMedicos() {
  const c = document.getElementById('medicosList');
  if (!c) return;
  if (medicos.length === 0) { c.innerHTML = '<p class="no-data">Nenhum médico cadastrado.</p>'; return }
  c.innerHTML = medicos.map(m =>
    `<div style="border-bottom:1px solid #ddd;padding:10px;display:flex;justify-content:space-between;align-items:center;">
      <div><strong>${escapeHtml(m.nome)}</strong> (${m.crm})<br>${m.especialidade} ${m.telefone?'📞 '+m.telefone:''}</div>
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
  } catch (e) { showToast(e.message, !0) }
}

// ========================================================================
// HORÁRIOS DOS MÉDICOS
// ========================================================================
function gerenciarHorarios(id) {
  medicoSelecionadoId = id;
  document.getElementById('horariosMedico').style.display = 'block';
  carregarHorarios(id);
  document.getElementById('horariosMedico').scrollIntoView({ behavior: 'smooth' });
}

async function carregarHorarios(id) {
  try {
    const r = await fetch(API_URL + '/medicos/' + id + '/horarios', { headers: { Authorization: 'Bearer ' + token } });
    const h = await r.json();
    const c = document.getElementById('horariosList');
    if (h.length === 0) { c.innerHTML = '<p>Nenhum horário cadastrado.</p>'; return }
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    c.innerHTML = h.map(h =>
      `<div class="horario-item"><span>${dias[h.dia_semana]} - ${h.hora_inicio} às ${h.hora_fim} (intervalo ${h.intervalo}min) ${!h.ativo?'(Inativo)':''}</span><div><button onclick="editarHorario(${h.id})" class="btn-warning">✏️</button><button onclick="excluirHorario(${h.id})" class="btn-danger">🗑️</button></div></div>`
    ).join('');
  } catch (e) { showToast(e.message, !0) }
}

async function adicionarHorarioMedico() {
  if (!medicoSelecionadoId) { showToast('Selecione um médico primeiro.', !0); return }
  const d = {
    dia_semana: parseInt(document.getElementById('horarioDiaSemana').value),
    hora_inicio: document.getElementById('horarioInicio').value,
    hora_fim: document.getElementById('horarioFim').value,
    intervalo: parseInt(document.getElementById('horarioIntervalo').value) || 30
  };
  const id = document.getElementById('editHorarioId').value,
    url = id ? API_URL + '/horarios/' + id : API_URL + '/medicos/' + medicoSelecionadoId + '/horarios',
    method = id ? 'PUT' : 'POST';
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(d) });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro') }
    showToast(id ? 'Atualizado!' : 'Adicionado!');
    cancelarEdicaoHorario();
    carregarHorarios(medicoSelecionadoId);
  } catch (e) { showToast(e.message, !0) }
}

async function editarHorario(id) {
  try {
    const r = await fetch(API_URL + '/horarios/' + id, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro') }
    const h = await r.json();
    if (!h) return;
    document.getElementById('editHorarioId').value = h.id;
    document.getElementById('horarioDiaSemana').value = h.dia_semana;
    document.getElementById('horarioInicio').value = h.hora_inicio;
    document.getElementById('horarioFim').value = h.hora_fim;
    document.getElementById('horarioIntervalo').value = h.intervalo || 30;
    document.getElementById('cancelHorarioBtn').style.display = 'inline-block';
    document.getElementById('horariosMedico').scrollIntoView({ behavior: 'smooth' });
  } catch (e) { showToast(e.message, !0) }
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
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro') }
    showToast('Excluído');
    carregarHorarios(medicoSelecionadoId);
  } catch (e) { showToast(e.message, !0) }
}

// ========================================================================
// CARREGAR HORÁRIOS DISPONÍVEIS
// ========================================================================
async function carregarHorariosDisponiveis() {
  const m = document.getElementById('medicoSelect').value,
    d = document.getElementById('dataConsulta').value,
    s = document.getElementById('horarioSelect'),
    msg = document.getElementById('msgHorarios');
  s.innerHTML = '<option value="">Carregando...</option>';
  msg.style.display = 'none';
  msg.innerHTML = '';
  if (!m || !d) { s.innerHTML = '<option value="">Selecione médico e data</option>'; return }
  if (isDataPassada(d)) { s.innerHTML = '<option value="">Data inválida</option>';
    msg.style.display = 'block';
    msg.innerHTML = '⚠️ Data não pode ser no passado.'; return }
  try {
    const r = await fetch(API_URL + '/medicos/' + m + '/horarios/disponiveis?data=' + d, { headers: { Authorization: 'Bearer ' + token } });
    const h = await r.json();
    if (h.error) { s.innerHTML = '<option value="">Nenhum horário disponível</option>';
      msg.style.display = 'block';
      msg.innerHTML = '⚠️ ' + h.error; return }
    const disp = h.filter(x => x.disponivel !== !1);
    if (disp.length === 0) { s.innerHTML = '<option value="">Nenhum horário disponível</option>';
      msg.style.display = 'block';
      msg.innerHTML = '⚠️ Todos os horários estão ocupados nesta data.'; return }
    s.innerHTML = '<option value="">Selecione um horário</option>' + disp.map(x => `<option value="${x.horario}">${x.horario}</option>`).join('');
    msg.style.display = 'none';
  } catch (e) { s.innerHTML = '<option value="">Erro ao carregar</option>';
    msg.style.display = 'block';
    msg.innerHTML = '⚠️ ' + e.message }
}
document.addEventListener('change', function(e) { if (e.target.id === 'medicoSelect' || e.target.id === 'dataConsulta') carregarHorariosDisponiveis() });

async function carregarHorariosDisponiveisSol() {
  const m = document.getElementById('solMedicoSelect').value,
    d = document.getElementById('solDataConsulta').value,
    s = [document.getElementById('solHorario1'), document.getElementById('solHorario2'), document.getElementById('solHorario3')],
    msg = document.getElementById('solMsgHorarios');
  s.forEach(x => x.innerHTML = '<option value="">Carregando...</option>');
  msg.style.display = 'none';
  msg.innerHTML = '';
  if (!m || !d) { s.forEach(x => x.innerHTML = '<option value="">Selecione médico e data</option>'); return }
  if (isDataPassada(d)) { s.forEach(x => x.innerHTML = '<option value="">Data inválida</option>');
    msg.style.display = 'block';
    msg.innerHTML = '⚠️ Data não pode ser no passado.'; return }
  try {
    const r = await fetch(API_URL + '/medicos/' + m + '/horarios/disponiveis?data=' + d, { headers: { Authorization: 'Bearer ' + token } });
    const h = await r.json();
    if (h.error) { s.forEach(x => x.innerHTML = '<option value="">Nenhum disponível</option>');
      msg.style.display = 'block';
      msg.innerHTML = '⚠️ ' + h.error; return }
    if (h.length === 0) { s.forEach(x => x.innerHTML = '<option value="">Nenhum horário disponível</option>');
      msg.style.display = 'block';
      msg.innerHTML = '⚠️ Médico não possui horários disponíveis para esta data.'; return }
    let ops = '<option value="">Selecione um horário</option>';
    h.forEach(x => {
      const disp = x.disponivel !== !1,
        label = disp ? x.horario : x.horario + ' (Agendado)',
        disabled = !disp ? 'disabled' : '',
        style = !disp ? 'style="color:#999;background:#f5f5f5;"' : '';
      ops += `<option value="${x.horario}" ${disabled} ${style}>${label}</option>`;
    });
    s.forEach(x => x.innerHTML = ops);
    msg.style.display = 'none';
  } catch (e) { s.forEach(x => x.innerHTML = '<option value="">Erro</option>');
    msg.style.display = 'block';
    msg.innerHTML = '⚠️ ' + e.message }
}
document.addEventListener('change', function(e) { if (e.target.id === 'solMedicoSelect' || e.target.id === 'solDataConsulta') carregarHorariosDisponiveisSol() });

// ========================================================================
// CONSULTAS (CRUD) + LISTA COM PAGINAÇÃO E FILTROS
// ========================================================================
async function salvarConsulta() {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem agendar.', !0); return }
  const pid = document.getElementById('pacienteSelect').value,
    pnome = document.getElementById('pacienteNome').value,
    ptel = document.getElementById('pacienteTelefone').value,
    data = document.getElementById('dataConsulta').value,
    hor = document.getElementById('horarioSelect').value,
    mid = document.getElementById('medicoSelect').value,
    mnome = medicos.find(m => m.id == mid)?.nome,
    nped = document.getElementById('numeroPedido').value.trim() || null;
  if (!pnome || !ptel || !data || !hor || !mid) { showToast('Preencha todos os campos obrigatórios!', !0); return }
  if (!validarDataNaoPassada(data, 'Data da consulta')) return;
  const dados = {
    paciente_id: pid || null,
    paciente_nome: pnome,
    paciente_telefone: ptel,
    paciente_email: document.getElementById('pacienteEmail').value,
    paciente_cpf: document.getElementById('pacienteCpf').value,
    data_nascimento: document.getElementById('pacienteDataNasc').value,
    neurodivergente: document.getElementById('pacienteNeurodivergente').checked ? 1 : 0,
    deficiencia_fisica: document.getElementById('pacienteDeficienciaFisica').checked ? 1 : 0,
    encaixe: document.getElementById('pacienteEncaixe').checked ? 1 : 0,
    data_consulta: data,
    horario: hor,
    medico_id: parseInt(mid),
    medico_nome: mnome,
    observacoes: document.getElementById('observacoes').value,
    numero_pedido: nped
  };
  const url = editandoId ? API_URL + '/consultas/' + editandoId : API_URL + '/consultas',
    method = editandoId ? 'PUT' : 'POST';
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(dados) });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro') }
    showToast(editandoId ? 'Atualizada!' : 'Agendada!');
    cancelarEdicao();
    await carregarDados();
    renderizarCalendario();
    renderizarLista(paginaAtual);
  } catch (e) { showToast(e.message, !0) }
}

function renderizarLista(p = 1) {
  const c = document.getElementById('consultasListMain'),
    pg = document.getElementById('listaPaginacao');
  if (!c) return;
  const lista = [...consultas].sort((a, b) => {
    if (a.data_consulta !== b.data_consulta) return b.data_consulta.localeCompare(a.data_consulta);
    return b.horario.localeCompare(a.horario);
  });
  const total = lista.length,
    totalPag = Math.ceil(total / ITENS_POR_PAGINA);
  if (p > totalPag) p = totalPag || 1;
  const ini = (p - 1) * ITENS_POR_PAGINA,
    fim = Math.min(ini + ITENS_POR_PAGINA, total),
    pag = lista.slice(ini, fim);
  if (consultas.length === 0) { c.innerHTML = '<p class="no-data">Nenhuma consulta agendada.</p>';
    pg.innerHTML = ''; return }
  const isAdmin = user.tipo === 'admin',
    isConsult = user.tipo === 'consultorio';
  let html = '';
  pag.forEach(cons => {
    const status = cons.status || 'agendada';
    let stCls = 'status-agendada';
    if (status === 'cancelada') stCls = 'status-cancelada';
    else if (status === 'confirmada') stCls = 'status-confirmada';
    else if (status === 'realizada') stCls = 'status-realizada';
    const isRealizada = status === 'realizada',
      podeEditar = isAdmin && !isRealizada && status !== 'cancelada',
      isOwn = cons.is_own,
      canView = isAdmin || isOwn,
      clickAttr = canView ? `onclick="mostrarDetalhes(${cons.id})"` : '',
      cursorStyle = canView ? 'cursor:pointer;' : 'cursor:default;';
    let acoes = '',
      info = '';
    const hasPedido = cons.numero_pedido ? '<br><small>📦 Pedido: ' + escapeHtml(cons.numero_pedido) + '</small>' : '',
      lojaStr = cons.loja_nome ? '<br><small>🏢 ' + escapeHtml(cons.loja_nome) + '</small>' : '';
    let vendHtml = '';
    if (isAdmin && usuarios.length > 0) {
      const curr = cons.criado_por || '',
        ops = usuarios.map(u => `<option value="${u.id}" ${u.id===curr?'selected':''}>${escapeHtml(u.nome)}</option>`).join(''),
        uid = 'vendedor-' + cons.id;
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
        ${podeEditar?`<button onclick="editarConsulta(${cons.id})" class="btn-warning btn-small">✏️</button>`:''}
        ${podeEditar?`<button onclick="cancelarConsulta(${cons.id})" class="btn-danger btn-small">🚫</button>`:''}
        ${podeExcluir?`<button onclick="excluirConsulta(${cons.id})" class="btn-danger btn-small">🗑️</button>`:''}
        ${podeEditar&&status!=='cancelada'&&status!=='realizada'&&status!=='confirmada'?`<button onclick="confirmarConsulta(${cons.id})" class="btn-success btn-small">✅</button>`:''}
        ${podeEditar&&status!=='cancelada'&&status!=='realizada'?`<button onclick="processarConsulta(${cons.id})" class="btn-process btn-small">🔄</button>`:''}
        <button onclick="enviarWhatsAppPaciente(${cons.id})" class="btn-whatsapp btn-small">📱</button>
        <button onclick="enviarWhatsAppMedico(${cons.id})" class="btn-medico btn-small">📱</button>
        <button onclick="abrirModalImpressao(${cons.id})" class="btn-print btn-small">🖨️</button>
      </div>`;
      info = `<strong>${escapeHtml(cons.paciente_nome)}</strong> <span class="${stCls}">${status}</span><br>${formatDisplay(cons.data_consulta)} ${cons.horario} | Dr. ${escapeHtml(cons.medico_nome)}${hasPedido}${lojaStr}${cons.observacoes?'<br><small>📝 '+escapeHtml(cons.observacoes)+'</small>':''}<br><small>👤 Vendedor: ${escapeHtml(cons.vendedor_nome||'Não informado')}</small>`;
    } else if (isConsult) {
      const podeConf = !isRealizada && status !== 'cancelada' && status !== 'confirmada',
        podeCanc = !isRealizada && status !== 'cancelada';
      acoes = `<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
        ${podeConf?`<button onclick="confirmarConsulta(${cons.id})" class="btn-success btn-small">✅ Confirmar</button>`:''}
        ${podeCanc?`<button onclick="cancelarConsulta(${cons.id})" class="btn-danger btn-small">🚫 Cancelar</button>`:''}
      </div>`;
      info = `<strong>${escapeHtml(cons.paciente_nome)}</strong> <span class="${stCls}">${status}</span><br>${formatDisplay(cons.data_consulta)} ${cons.horario} | Dr. ${escapeHtml(cons.medico_nome)}${hasPedido}${lojaStr}${cons.observacoes?'<br><small>📝 '+escapeHtml(cons.observacoes)+'</small>':''}<br><small>👤 Vendedor: ${escapeHtml(cons.vendedor_nome||'Não informado')}</small>`;
    } else {
      if (isOwn) {
        acoes = `<div style="display:flex;gap:5px;flex-wrap:wrap;"><button onclick="mostrarDetalhes(${cons.id})" class="btn-primary btn-small">👁️ Ver</button></div>`;
        info = `<strong>${escapeHtml(cons.paciente_nome)}</strong> <span class="${stCls}">${status}</span><br>${formatDisplay(cons.data_consulta)} ${cons.horario} | Dr. ${escapeHtml(cons.medico_nome)}${hasPedido}${lojaStr}${cons.observacoes?'<br><small>📝 '+escapeHtml(cons.observacoes)+'</small>':''}<br><small>👤 Vendedor: ${escapeHtml(cons.vendedor_nome||'Não informado')}</small>`;
      } else {
        info = `<div style="display:flex;align-items:center;gap:10px;"><span style="font-weight:bold;color:#a0aec0;">⏰ Horário já agendado</span><span style="font-size:12px;color:#718096;">(${formatDisplay(cons.data_consulta)} ${cons.horario})</span></div><small style="color:#a0aec0;">Vendedor: ${escapeHtml(cons.vendedor_nome||'Não informado')}</small>`;
        acoes = '';
      }
    }
    const extra = (!isOwn && !isAdmin && !isConsult) ? 'other-vendor' : '',
      realCls = isRealizada ? 'consulta-realizada' : '';
    html += `<div class="consulta-card ${extra} ${realCls}" ${clickAttr} style="${cursorStyle}"><div class="info">${info}</div>${acoes}</div>`;
  });
  c.innerHTML = html;
  pg.innerHTML = '';
  if (totalPag > 1) {
    let ph = '';
    if (p > 1) ph += `<button onclick="renderizarLista(${p-1})"><i class="fas fa-chevron-left"></i></button>`;
    for (let i = 1; i <= totalPag; i++) ph += `<button class="${i===p?'active':''}" onclick="renderizarLista(${i})">${i}</button>`;
    if (p < totalPag) ph += `<button onclick="renderizarLista(${p+1})"><i class="fas fa-chevron-right"></i></button>`;
    pg.innerHTML = ph;
    paginaAtual = p;
  }
  // eventos para mostrar/ocultar botões de vendedor
  document.querySelectorAll('.vendedor-controls select').forEach(s => {
    s.addEventListener('change', function() {
      const uid = this.id.replace('-select', ''),
        sv = document.getElementById(uid + '-salvar'),
        cv = document.getElementById(uid + '-cancelar'),
        orig = this.getAttribute('data-original');
      if (this.value !== orig) { sv.style.display = 'inline-block';
        cv.style.display = 'inline-block' } else { sv.style.display = 'none';
        cv.style.display = 'none' }
    });
  });
}

// ========================================================================
// FUNÇÕES DE ALTERAÇÃO DE VENDEDOR
// ========================================================================
async function salvarVendedor(id, uid) {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem alterar o vendedor.', !0); return }
  const s = document.getElementById(uid + '-select');
  if (!s) return;
  const nv = parseInt(s.value);
  if (!nv) { showToast('Selecione um vendedor válido.', !0); return }
  try {
    const r = await fetch(API_URL + '/consultas/' + id + '/vendedor', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ vendedor_id: nv }) });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro') }
    showToast('Vendedor alterado!');
    s.setAttribute('data-original', nv);
    document.getElementById(uid + '-salvar').style.display = 'none';
    document.getElementById(uid + '-cancelar').style.display = 'none';
    await carregarDados();
    renderizarLista(paginaAtual);
  } catch (e) { showToast(e.message, !0) }
}

function cancelarVendedor(id, uid) {
  const s = document.getElementById(uid + '-select');
  if (!s) return;
  s.value = s.getAttribute('data-original');
  document.getElementById(uid + '-salvar').style.display = 'none';
  document.getElementById(uid + '-cancelar').style.display = 'none';
}

// ========================================================================
// AÇÕES DE CONSULTAS
// ========================================================================
async function confirmarConsulta(id) {
  if (user.tipo !== 'admin' && user.tipo !== 'consultorio') { showToast('Apenas administradores ou consultório podem confirmar.', !0); return }
  const c = consultas.find(x => x.id === id);
  if (c && c.status === 'realizada') { showToast('Consulta já realizada.', !0); return }
  if (!confirm('Confirmar esta consulta?')) return;
  try {
    const r = await fetch(API_URL + '/consultas/' + id + '/confirmar', { method: 'PUT', headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro') }
    showToast('Consulta confirmada!');
    await carregarDados();
    renderizarCalendario();
    renderizarLista(paginaAtual);
  } catch (e) { showToast(e.message, !0) }
}

async function processarConsulta(id) {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem processar.', !0); return }
  const c = consultas.find(x => x.id === id);
  if (c && c.status === 'realizada') { showToast('Consulta já foi processada.', !0); return }
  if (!confirm('Marcar como REALIZADA? Essa ação é irreversível.')) return;
  try {
    const r = await fetch(API_URL + '/consultas/' + id + '/processar', { method: 'PUT', headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro') }
    showToast('Consulta processada!');
    await carregarDados();
    renderizarCalendario();
    renderizarLista(paginaAtual);
    if (user.tipo === 'admin') carregarDashboard();
  } catch (e) { showToast(e.message, !0) }
}

async function cancelarConsulta(id) {
  if (user.tipo !== 'admin' && user.tipo !== 'consultorio') { showToast('Apenas administradores ou consultório podem cancelar.', !0); return }
  const c = consultas.find(x => x.id === id);
  if (c && c.status === 'realizada') { showToast('Consulta já realizada. Não pode cancelar.', !0); return }
  if (!confirm('Cancelar esta consulta?')) return;
  try {
    if (user.tipo === 'consultorio') {
      const r = await fetch(API_URL + '/consultas/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ status: 'cancelada' }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro') }
    } else {
      const cons = consultas.find(x => x.id === id);
      if (!cons) return;
      const r = await fetch(API_URL + '/consultas/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ ...cons, status: 'cancelada' }) });
      if (!r.ok) throw new Error('Erro');
    }
    showToast('Consulta cancelada!');
    await carregarDados();
    renderizarCalendario();
    renderizarLista(paginaAtual);
  } catch (e) { showToast(e.message, !0) }
}

async function excluirConsulta(id) {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem excluir.', !0); return }
  const c = consultas.find(x => x.id === id);
  if (!c || c.status !== 'cancelada') { showToast('Apenas consultas canceladas podem ser excluídas.', !0); return }
  if (!confirm('Excluir permanentemente esta consulta cancelada?')) return;
  try {
    await fetch(API_URL + '/consultas/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    showToast('Excluída!');
    await carregarDados();
    renderizarCalendario();
    renderizarLista(paginaAtual);
  } catch (e) { showToast(e.message, !0) }
}

function editarConsulta(id) {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem editar.', !0); return }
  const c = consultas.find(x => x.id === id);
  if (!c) return;
  if (c.status === 'realizada') { showToast('Consulta já realizada. Não é possível editar.', !0); return }
  if (c.status === 'cancelada') { showToast('Consulta cancelada. Não é possível editar.', !0); return }
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
  document.getElementById('pacienteNeurodivergente').checked = !1;
  document.getElementById('pacienteDeficienciaFisica').checked = !1;
  document.getElementById('pacienteEncaixe').checked = !0;
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
    msg.innerHTML = '' }
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

function imprimirComprovanteSelecionado(t) {
  const id = consultaParaImprimir;
  fecharModalImpressao();
  if (id) gerarComprovante(id, t);
  else showToast('Erro: nenhuma consulta selecionada.', !0);
}

function getPrintConfig() {
  const c = localStorage.getItem('printConfig');
  return c ? JSON.parse(c) : { marginLeft: 20, marginRight: 20, marginTop: 20, headerHeight: 80 };
}

function gerarComprovante(id, t) {
  const c = consultas.find(x => x.id === id);
  if (!c) { showToast('Consulta não encontrada.', !0); return }
  let cond = 'Encaixe';
  let p = null;
  if (c.paciente_cpf) p = clientes.find(x => x.cpf === c.paciente_cpf);
  if (!p) p = clientes.find(x => x.nome === c.paciente_nome && x.telefone === c.paciente_telefone);
  if (p) {
    if (p.neurodivergente && p.deficiencia_fisica) cond = 'Neurodivergente e Def. Física';
    else if (p.neurodivergente) cond = 'Neurodivergente';
    else if (p.deficiencia_fisica) cond = 'Deficiência Física';
    else if (p.encaixe) cond = 'Encaixe';
  }
  const condDisplay = cond === 'Encaixe' ? '<span style="font-weight:bold;color:#e53e3e;background:#fff5f5;padding:2px 10px;border-radius:4px;border:1px solid #e53e3e;">🔹 Encaixe</span>' : cond;
  const medico = medicos.find(x => x.id === c.medico_id),
    endMed = medico ? medico.endereco : 'Endereço não informado',
    lojaNome = c.loja_nome || user.loja_nome || 'Ótica Macaé',
    lojaEnd = c.loja_endereco || user.loja_endereco || '',
    vend = c.vendedor_nome || user.nome || 'Não informado',
    dataF = formatDisplay(c.data_consulta),
    stat = c.status || 'agendada',
    statLabel = stat.charAt(0).toUpperCase() + stat.slice(1),
    ped = c.numero_pedido || 'Não informado',
    cfg = getPrintConfig();
  let html =
    `<div class="comprovante-container" style="padding-left:${cfg.marginLeft}px;padding-right:${cfg.marginRight}px;padding-top:${cfg.marginTop}px;">
      <div class="comprovante-conteudo">
        <div class="header-loja" style="font-size:22px;font-weight:700;margin-bottom:4px;">${escapeHtml(lojaNome)}</div>
        ${lojaEnd?'<div class="header-endereco-loja" style="font-size:14px;color:#4a5568;margin-bottom:12px;">'+escapeHtml(lojaEnd)+'</div>':''}
        <div class="header-vendedor" style="font-size:14px;color:#4a5568;margin-bottom:16px;font-weight:500;">Vendedor: ${escapeHtml(vend)}</div>
        <h2 style="text-align:center;border-bottom:2px solid #2d3748;padding-bottom:10px;font-size:20px;font-weight:600;color:#2d3748;margin-bottom:16px;">Comprovante de Consulta</h2>
        <div class="detalhe"><span class="label">Paciente:</span><span class="valor">${escapeHtml(c.paciente_nome)}</span></div>
        <div class="detalhe"><span class="label">Data:</span><span class="valor">${dataF}</span></div>
        <div class="detalhe"><span class="label">Horário:</span><span class="valor">${c.horario}</span></div>
        <div class="detalhe"><span class="label">Médico:</span><span class="valor">Dr. ${escapeHtml(c.medico_nome)}</span></div>
        <div class="detalhe"><span class="label">Status:</span><span class="valor">${statLabel}</span></div>
        <div class="detalhe"><span class="label">Condição:</span><span class="valor">${condDisplay}</span></div>
        <div class="detalhe"><span class="label">Pedido:</span><span class="valor">${ped}</span></div>
        ${c.observacoes?'<div class="detalhe"><span class="label">Observações:</span><span class="valor">'+escapeHtml(c.observacoes)+'</span></div>':''}
        <div class="rodape-medico"><div>Endereço do médico:</div><div class="endereco-medico">${escapeHtml(endMed)}</div></div>
        <div class="rodape-final">Este comprovante é válido como comprovação de agendamento.</div>
      </div>
      <button onclick="fecharComprovante()" class="no-print" style="display:block;margin:16px auto 0;padding:8px 24px;background:#e53e3e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">Fechar</button>
    </div>`;
  if (t === 'bobina') {
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
  const c = document.getElementById('calendarioContainer');
  if (!c) return;
  const t = document.getElementById('tituloCalendario'),
    nome = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  t.textContent = nome.charAt(0).toUpperCase() + nome.slice(1);
  if (currentView === 'week') renderizarSemana(c);
  else if (currentView === 'month') renderizarMes(c);
  else renderizarDia(c);
  document.querySelectorAll('.view-buttons button').forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`.view-buttons button[onclick*="${currentView}"]`).forEach(b => b.classList.add('active'));
}

function renderizarMes(c) {
  const y = currentDate.getFullYear(),
    m = currentDate.getMonth(),
    fd = new Date(y, m, 1),
    sd = fd.getDay(),
    dim = new Date(y, m + 1, 0).getDate(),
    hoje = formatDate(new Date());
  let html = '<div class="mes-grid">';
  ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].forEach(d => html += `<div style="font-weight:600;padding:8px;text-align:center;color:#4a5568;">${d}</div>`);
  for (let i = 0; i < sd; i++) html += '<div class="dia-cell outro-mes"></div>';
  for (let d = 1; d <= dim; d++) {
    const ds = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'),
      isHoje = ds === hoje,
      events = consultas.filter(c => c.data_consulta === ds);
    html += `<div class="dia-cell ${isHoje?'dia-hoje':''}"><span class="dia-numero">${d}</span>`;
    const max = 3;
    events.slice(0, max).forEach(e => {
      const isOwn = user.tipo === 'admin' || e.is_own,
        click = isOwn ? `onclick="mostrarDetalhes(${e.id})"` : '',
        cls = isOwn ? '' : ' other-vendor',
        style = !isOwn ? 'cursor:default;opacity:0.6;' : '';
      html += `<div class="dia-consulta${cls}" ${click} style="${style}"><span class="horario">${e.horario}</span><span class="paciente">${escapeHtml(e.paciente_nome.substring(0,12))}</span><span class="medico">${escapeHtml(e.medico_nome)}</span></div>`;
    });
    if (events.length > max) html += `<div class="dia-consulta mais">+ ${events.length - max} mais</div>`;
    html += '</div>';
  }
  html += '</div>';
  c.innerHTML = html;
}

function renderizarSemana(c) {
  let s = new Date(currentDate);
  s.setDate(currentDate.getDate() - currentDate.getDay());
  let days = [];
  for (let i = 0; i < 7; i++) { let d = new Date(s);
    d.setDate(s.getDate() + i);
    days.push(d) }
  const hours = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];
  let html = '<table class="semana-table"><thead><tr><th>Horário</th>';
  days.forEach(day => {
    const ds = formatDate(day),
      ev = consultas.filter(c => c.data_consulta === ds);
    html += `<th><span class="dia-semana">${day.toLocaleDateString('pt-BR',{weekday:'short'})}</span><span class="dia-numero">${day.getDate()}</span><span style="font-size:12px;font-weight:400;">(${ev.length})</span></th>`;
  });
  html += '</tr></thead><tbody>';
  hours.forEach(h => {
    html += `<tr><td class="horario-label">${h}</td>`;
    days.forEach(day => {
      const ds = formatDate(day),
        ev = consultas.filter(c => c.data_consulta === ds && c.horario === h);
      html += `<td style="background:${ev.length>0?'#f0f4ff':'white'};">`;
      ev.forEach(e => {
        const isOwn = user.tipo === 'admin' || e.is_own,
          click = isOwn ? `onclick="mostrarDetalhes(${e.id})"` : '',
          cls = isOwn ? '' : ' other-vendor',
          style = !isOwn ? 'cursor:default;opacity:0.6;' : '';
        html += `<div class="consulta-item${cls}" ${click} style="${style}"><span class="paciente-nome">${escapeHtml(e.paciente_nome)}</span><span class="medico-nome">${escapeHtml(e.medico_nome)}</span></div>`;
      });
      html += '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  c.innerHTML = html;
}

function renderizarDia(c) {
  const ds = formatDate(currentDate),
    ev = consultas.filter(x => x.data_consulta === ds).sort((a, b) => a.horario.localeCompare(b.horario));
  let html =
    `<div style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:25px 20px;text-align:center;border-radius:12px;margin-bottom:25px;box-shadow:0 4px 12px rgba(102,126,234,.3);">
      <h2 style="font-size:28px;">${currentDate.toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})}</h2>
      <p style="font-size:18px;opacity:.9;margin-top:5px;">${currentDate.toLocaleDateString('pt-BR',{weekday:'long'})}</p>
      <p style="font-size:16px;margin-top:8px;background:rgba(255,255,255,.2);display:inline-block;padding:4px 18px;border-radius:20px;">${ev.length} consulta(s)</p>
    </div>`;
  if (ev.length === 0) { html += '<div class="no-data" style="padding:40px;font-size:18px;">📭 Nenhuma consulta agendada para este dia.</div>' } else {
    html += '<div class="dia-list">';
    ev.forEach(e => {
      const isOwn = user.tipo === 'admin' || e.is_own,
        click = isOwn ? `onclick="mostrarDetalhes(${e.id})"` : '',
        cls = isOwn ? '' : ' other-vendor',
        style = !isOwn ? 'cursor:default;opacity:0.6;' : 'cursor:pointer;';
      html += `<div class="dia-card${cls}" ${click} style="${style}">
        <div class="info">
          <div class="horario">${e.horario}</div>
          <div class="dados">
            <span class="paciente">${escapeHtml(e.paciente_nome)}</span>
            <span class="detalhes">👨‍⚕️ <span class="medico">Dr. ${escapeHtml(e.medico_nome)}</span>${e.paciente_telefone?' 📞 '+e.paciente_telefone:''}${e.observacoes?' 📝 '+escapeHtml(e.observacoes):''}</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;"><span style="background:#edf2f7;color:#4a5568;padding:2px 10px;border-radius:12px;font-size:11px;">${e.status||'agendada'}</span></div>
      </div>`;
    });
    html += '</div>';
  }
  c.innerHTML = html;
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
    const c = document.getElementById('vendedoresRelatorio');
    if (!d.por_vendedor || d.por_vendedor.length === 0) { c.innerHTML = '<p style="padding:20px;color:#999;">Nenhum vendedor com consultas.</p>'; return }
    const max = Math.max(...d.por_vendedor.map(v => v.total), 1);
    let html = '<table><thead><tr><th>Vendedor</th><th style="text-align:center;">Total</th><th style="text-align:center;">Agendadas</th><th style="text-align:center;">Confirmadas</th><th style="text-align:center;">Realizadas</th><th style="text-align:center;">Canceladas</th><th style="min-width:120px;">Progresso</th></tr></thead><tbody>';
    d.por_vendedor.forEach(v => {
      const pct = Math.round((v.total / max) * 100),
        col = v.total > 0 ? '#667eea' : '#e2e8f0';
      html += `<tr>
        <td><strong>${escapeHtml(v.vendedor_nome)}</strong></td>
        <td style="text-align:center;font-weight:600;">${v.total}</td>
        <td style="text-align:center;"><span class="badge-status badge-agendada">${v.agendadas}</span></td>
        <td style="text-align:center;"><span class="badge-status badge-confirmada">${v.confirmadas}</span></td>
        <td style="text-align:center;"><span class="badge-status badge-realizada">${v.realizadas}</span></td>
        <td style="text-align:center;"><span class="badge-status badge-cancelada">${v.canceladas}</span></td>
        <td><div class="barra-container"><div class="barra"><div class="preenchimento" style="width:${pct}%;background:${col};"></div></div><span style="font-size:12px;color:#4a5568;min-width:40px;">${pct}%</span></div></td>
      </tr>`;
    });
    html += '</tbody></table>';
    c.innerHTML = html;
  } catch (e) { console.error(e);
    showToast('Erro ao carregar dashboard', !0) }
}

// ========================================================================
// ENVIO DE WHATSAPP
// ========================================================================
async function enviarWhatsAppPaciente(id) {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem enviar.', !0); return }
  const e = consultas.find(c => c.id === id);
  if (!e) return;
  const medico = medicos.find(m => m.id === e.medico_id);
  if (!medico) { showToast('Médico não encontrado.', !0); return }
  const msgPadrao = medico.mensagem_padrao || '',
    endMed = medico.endereco || 'Endereço não informado',
    pac = clientes.find(p => p.nome === e.paciente_nome && p.telefone === e.paciente_telefone);
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
  else showToast('Número do paciente não disponível', !0);
}

async function enviarWhatsAppMedico(id) {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem enviar.', !0); return }
  const e = consultas.find(c => c.id === id);
  if (!e) return;
  const medico = medicos.find(m => m.id === e.medico_id);
  if (!medico || !medico.whatsapp) { showToast('Médico não possui WhatsApp cadastrado.', !0); return }
  const end = e.loja_endereco || user.loja_endereco || 'Rua Marechal Deodoro, 185 - Centro - Macae/RJ',
    loja = e.loja_nome || user.loja_nome || 'Ótica Macaé',
    pac = clientes.find(p => p.nome === e.paciente_nome && p.telefone === e.paciente_telefone);
  let cond = 'Encaixe';
  if (pac) {
    if (pac.neurodivergente && pac.deficiencia_fisica) cond = 'Neurodivergente e Def. Física';
    else if (pac.neurodivergente) cond = 'Neurodivergente';
    else if (pac.deficiencia_fisica) cond = 'Deficiência Física';
    else if (pac.encaixe) cond = 'Encaixe';
  }
  let msg = 'Nova consulta agendada\n----------------------------------------\n' + loja + '\nPaciente: ' + e.paciente_nome + '\nData: ' + formatDisplay(e.data_consulta) + '\nHorário: ' + e.horario + '\nTelefone: ' + e.paciente_telefone + '\nLocal: ' + end + '\nCondição: ' + cond;
  if (e.numero_pedido) msg += '\nPedido: #' + e.numero_pedido;
  const phone = medico.whatsapp.replace(/\D/g, '');
  if (phone) window.open('https://wa.me/55' + phone + '?text=' + encodeURIComponent(msg), '_blank');
  else showToast('WhatsApp do médico inválido', !0);
}

// ========================================================================
// USUÁRIOS (CRUD)
// ========================================================================
async function salvarUsuario() {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem criar usuários.', !0); return }
  const tipo = document.getElementById('usuarioTipo').value,
    tel = document.getElementById('usuarioTelefone').value;
  if (tipo === 'vendedor' && !tel) { showToast('Telefone obrigatório para vendedor', !0); return }
  const d = { nome: document.getElementById('usuarioNome').value, username: document.getElementById('usuarioUsername').value, senha: document.getElementById('usuarioSenha').value || undefined, telefone: tel, tipo: tipo, loja_id: document.getElementById('usuarioLoja').value || null };
  const id = document.getElementById('editUsuarioId').value,
    url = id ? API_URL + '/usuarios/' + id : API_URL + '/usuarios',
    method = id ? 'PUT' : 'POST';
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(d) });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro') }
    showToast(id ? 'Atualizado' : 'Criado');
    cancelarEdicaoUsuario();
    await carregarDados();
    await carregarLojas();
  } catch (e) { showToast(e.message, !0) }
}

function renderUsuarios() {
  const c = document.getElementById('usuariosList');
  if (!c) return;
  if (usuarios.length === 0) { c.innerHTML = '<p class="no-data">Nenhum usuário</p>'; return }
  c.innerHTML = usuarios.map(u =>
    `<div style="border-bottom:1px solid #ddd;padding:10px;display:flex;justify-content:space-between;align-items:center;">
      <div><strong>${escapeHtml(u.nome)}</strong><br>@${u.username} | ${u.tipo} ${u.telefone?'📞 '+u.telefone:''}${u.loja_nome?'<br>🏢 '+escapeHtml(u.loja_nome):''}</div>
      <div><button onclick="editarUsuario(${u.id})">✏️</button>${u.username!=='admin'?`<button onclick="excluirUsuario(${u.id})">🗑️</button>`:''}</div>
    </div>`
  ).join('');
}

function editarUsuario(id) {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem editar usuários.', !0); return }
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
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem excluir usuários.', !0); return }
  if (!confirm('Excluir?')) return;
  try {
    await fetch(API_URL + '/usuarios/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    showToast('Excluído');
    await carregarDados();
  } catch (e) { showToast(e.message, !0) }
}

// ========================================================================
// SOLICITAÇÕES
// ========================================================================
async function enviarSolicitacao() {
  const b = document.getElementById('btnEnviarSolicitacao');
  b.disabled = !0;
  b.textContent = 'Enviando...';
  try {
    const data = document.getElementById('solDataConsulta').value;
    if (!validarDataNaoPassada(data, 'Data da consulta')) { b.disabled = !1;
      b.textContent = 'Enviar Solicitação'; return }
    const mid = document.getElementById('solMedicoSelect').value,
      mnome = medicos.find(m => m.id == mid)?.nome || '',
      h1 = document.getElementById('solHorario1').value,
      h2 = document.getElementById('solHorario2').value,
      h3 = document.getElementById('solHorario3').value;
    if (!mid) { document.getElementById('solMsg').innerHTML = '<p style="color:red;">Selecione um médico.</p>';
      b.disabled = !1;
      b.textContent = 'Enviar Solicitação'; return }
    if (!data) { document.getElementById('solMsg').innerHTML = '<p style="color:red;">Selecione uma data.</p>';
      b.disabled = !1;
      b.textContent = 'Enviar Solicitação'; return }
    if (!h1) { document.getElementById('solMsg').innerHTML = '<p style="color:red;">Selecione pelo menos o 1º horário.</p>';
      b.disabled = !1;
      b.textContent = 'Enviar Solicitação'; return }
    const d = {
      paciente_nome: document.getElementById('solPacienteNome').value.trim(),
      paciente_telefone: document.getElementById('solPacienteTelefone').value.trim(),
      paciente_email: document.getElementById('solPacienteEmail').value.trim(),
      paciente_cpf: document.getElementById('solPacienteCpf').value.trim(),
      data_nascimento: document.getElementById('solPacienteDataNasc').value,
      neurodivergente: document.getElementById('solNeurodivergente').checked ? 1 : 0,
      deficiencia_fisica: document.getElementById('solDeficienciaFisica').checked ? 1 : 0,
      encaixe: document.getElementById('solEncaixe').checked ? 1 : 0,
      data_consulta: data,
      horario1: h1,
      horario2: h2,
      horario3: h3,
      medico_id: parseInt(mid),
      medico_nome: mnome,
      observacoes: document.getElementById('solObservacoes').value.trim(),
      numero_pedido: document.getElementById('solNumeroPedido').value.trim() || null
    };
    if (!d.paciente_nome || !d.paciente_telefone) { document.getElementById('solMsg').innerHTML = '<p style="color:red;">Nome e telefone do paciente são obrigatórios.</p>';
      b.disabled = !1;
      b.textContent = 'Enviar Solicitação'; return }
    const r = await fetch(API_URL + '/solicitacoes', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(d) });
    const ct = r.headers.get('content-type');
    if (!ct || !ct.includes('application/json')) { const t = await r.text(); throw new Error(t || 'Erro no servidor') }
    const res = await r.json();
    if (!r.ok) throw new Error(res.error || 'Erro ao enviar solicitação');
    document.getElementById('solMsg').innerHTML = '<p style="color:green;">✅ Solicitação enviada! Aguarde aprovação.</p>';
    setTimeout(() => {
      document.getElementById('solMsg').innerHTML = '';
      document.getElementById('solPacienteNome').value = '';
      document.getElementById('solPacienteTelefone').value = '';
      document.getElementById('solPacienteEmail').value = '';
      document.getElementById('solPacienteCpf').value = '';
      document.getElementById('solPacienteDataNasc').value = '';
      document.getElementById('solNeurodivergente').checked = !1;
      document.getElementById('solDeficienciaFisica').checked = !1;
      document.getElementById('solEncaixe').checked = !0;
      document.getElementById('solHorario1').value = '';
      document.getElementById('solHorario2').value = '';
      document.getElementById('solHorario3').value = '';
      document.getElementById('solObservacoes').value = '';
      document.getElementById('solNumeroPedido').value = '';
      document.getElementById('solIdadeDisplay').innerHTML = '';
      setupEncaixeLogic('solEncaixe', 'solNeurodivergente', 'solDeficienciaFisica');
    }, 3000);
  } catch (e) { document.getElementById('solMsg').innerHTML = '<p style="color:red;">❌ ' + e.message + '</p>' } finally { b.disabled = !1;
    b.textContent = 'Enviar Solicitação' }
}

async function carregarSolicitacoes() {
  if (user.tipo !== 'admin') return;
  try {
    const r = await fetch(API_URL + '/solicitacoes', { headers: { Authorization: 'Bearer ' + token } });
    const lista = await r.json();
    const c = document.getElementById('solicitacoesList');
    if (!c) return;
    if (lista.length === 0) { c.innerHTML = '<p class="no-data">Nenhuma solicitação.</p>'; return }
    c.innerHTML = lista.map(s => {
      const horarios = [s.horario_sugerido1, s.horario_sugerido2, s.horario_sugerido3].filter(h => h);
      let horHtml = '',
        actHtml = '';
      if (s.status === 'pendente') {
        horHtml = horarios.map(h => `<label style="margin-right:10px;"><input type="radio" name="horario_${s.id}" value="${h}" ${s.horario_escolhido===h?'checked':''}> ${h}</label>`).join('');
        actHtml =
          `<div class="horario-radio-group">${horHtml}<button onclick="aprovarSolicitacao(${s.id})" class="btn-success" style="margin-top:5px;">✅ Aprovar (selecionado)</button><button onclick="rejeitarSolicitacao(${s.id})" class="btn-danger" style="margin-top:5px;">❌ Rejeitar</button></div>`;
      }
      const ped = s.numero_pedido ? '<br><small>📦 Pedido: ' + escapeHtml(s.numero_pedido) + '</small>' : '';
      return `<div style="border-bottom:1px solid #ddd;padding:10px;${s.status==='pendente'?'background:#fffbe6;':''}">
        <div><strong>${escapeHtml(s.paciente_nome)}</strong>${ped}<br>${formatDisplay(s.data_consulta)} | Médico: ${s.medico_nome}<br><span style="font-size:12px;color:${s.status==='pendente'?'orange':s.status==='aprovado'?'green':'red'};">Status: ${s.status}</span>${s.status==='pendente'?'<span style="font-size:11px;color:#999;"> | Solicitado por: '+escapeHtml(s.solicitante_nome)+'</span>':''}${s.horario_escolhido?'<br><strong>Horário escolhido: '+s.horario_escolhido+'</strong>':''}</div>${actHtml}</div>`;
    }).join('');
  } catch (e) { console.error(e);
    document.getElementById('solicitacoesList').innerHTML = '<p style="color:red;">Erro: ' + e.message + '</p>' }
}

async function aprovarSolicitacao(id) {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem aprovar.', !0); return }
  if (!confirm('Aprovar esta solicitação?')) return;
  const r = document.querySelector(`input[name="horario_${id}"]:checked`);
  if (!r) { showToast('Selecione um horário para aprovar.', !0); return }
  const hor = r.value;
  try {
    const res = await fetch(API_URL + '/solicitacoes/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ status: 'aprovado', horario_escolhido: hor }) });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Erro') }
    showToast('Solicitação aprovada!');
    await carregarSolicitacoes();
    await carregarDados();
    renderizarCalendario();
    renderizarLista(paginaAtual);
    atualizarBadgeSolicitacoes();
  } catch (e) { showToast(e.message, !0) }
}

async function rejeitarSolicitacao(id) {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem rejeitar.', !0); return }
  if (!confirm('Rejeitar esta solicitação?')) return;
  try {
    const res = await fetch(API_URL + '/solicitacoes/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ status: 'rejeitado' }) });
    if (!res.ok) throw new Error('Erro');
    showToast('Solicitação rejeitada.');
    await carregarSolicitacoes();
    atualizarBadgeSolicitacoes();
  } catch (e) { showToast(e.message, !0) }
}

async function atualizarBadgeSolicitacoes() {
  if (user.tipo !== 'admin') return;
  try {
    const r = await fetch(API_URL + '/solicitacoes/pendentes/count', { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return; // se falhar, não exibe erro
    const d = await r.json();
    const b1 = document.getElementById('badgeSolicitacoes'),
      b2 = document.getElementById('badgeSolicitacoesMenu');
    [b1, b2].forEach(b => { if (b) { b.textContent = d.total;
        b.style.display = d.total > 0 ? 'inline' : 'none' } });
    if (window._ultimoContadorSolic === undefined) window._ultimoContadorSolic = 0;
    if (d.total > window._ultimoContadorSolic && d.total > 0) showToast('📩 ' + d.total + ' nova(s) solicitação(ões)');
    window._ultimoContadorSolic = d.total;
  } catch (e) { console.error(e) }
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
    if (lista.length === 0) { c.innerHTML = '<p>Nenhum lembrete pendente.</p>'; return }
    c.innerHTML = lista.map(l =>
      `<div style="border-bottom:1px solid #ddd;padding:10px;">
        <strong>${escapeHtml(l.destinatario_nome)}</strong> (${l.destinatario_tipo})<br>
        <span style="font-size:13px;">${escapeHtml(l.mensagem)}</span><br>
        <small>Enviar em: ${new Date(l.data_envio_programada).toLocaleString()}</small>
        <button onclick="marcarLembreteEnviado(${l.id})" class="btn-success" style="margin-left:10px;">✅ Simular envio</button>
      </div>`
    ).join('');
    const b = document.getElementById('badgeLembretes');
    if (b) { b.textContent = lista.length;
      b.style.display = lista.length > 0 ? 'inline' : 'none' }
    if (lista.length > _ultimoContadorLembretes && lista.length > 0) showToast('🔔 ' + lista.length + ' lembrete(s) pendente(s)');
    _ultimoContadorLembretes = lista.length;
  } catch (e) { console.error(e) }
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
  } catch (e) { showToast(e.message, !0) }
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
  } catch (e) { console.error(e) }
}

async function salvarConfigWhatsapp() {
  if (user.tipo !== 'admin') { showToast('Apenas administradores podem configurar.', !0); return }
  const d = { numero: document.getElementById('whatsappNumero').value, endereco_otica: document.getElementById('whatsappEndereco').value };
  try {
    const r = await fetch(API_URL + '/whatsapp/config', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(d) });
    if (!r.ok) throw new Error('Erro');
    showToast('Configurações salvas!');
  } catch (e) { showToast(e.message, !0) }
}

// ========================================================================
// PERFIL
// ========================================================================
function abrirModalPerfil() { navegarPara('pagePerfil') }

async function salvarAlterarSenha() {
  const a = document.getElementById('perfilSenhaAtual').value,
    n = document.getElementById('perfilNovaSenha').value,
    c = document.getElementById('perfilConfirmarSenha').value;
  if (!a || !n || !c) { document.getElementById('perfilMsg').innerHTML = '<p style="color:red;">Preencha todos os campos.</p>'; return }
  if (n.length < 6) { document.getElementById('perfilMsg').innerHTML = '<p style="color:red;">Nova senha deve ter pelo menos 6 caracteres.</p>'; return }
  if (n !== c) { document.getElementById('perfilMsg').innerHTML = '<p style="color:red;">As senhas não coincidem.</p>'; return }
  try {
    const r = await fetch(API_URL + '/perfil/alterar-senha', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ senha_atual: a, nova_senha: n }) });
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
  } catch (e) { document.getElementById('perfilMsg').innerHTML = '<p style="color:red;">' + e.message + '</p>' }
}

// ========================================================================
// CONFIGURAÇÕES DE IMPRESSÃO
// ========================================================================
function carregarConfigImpressao() {
  const c = localStorage.getItem('printConfig');
  if (c) {
    const p = JSON.parse(c);
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
  const c = {
    marginLeft: parseInt(document.getElementById('printMarginLeft').value) || 20,
    marginRight: parseInt(document.getElementById('printMarginRight').value) || 20,
    marginTop: parseInt(document.getElementById('printMarginTop').value) || 20,
    headerHeight: parseInt(document.getElementById('printHeaderHeight').value) || 80
  };
  localStorage.setItem('printConfig', JSON.stringify(c));
  document.getElementById('configImpressaoMsg').innerHTML = '<p style="color:green;">Configurações salvas!</p>';
  setTimeout(() => document.getElementById('configImpressaoMsg').innerHTML = '', 3000);
}

// ========================================================================
// NAVEGAÇÃO DO CALENDÁRIO
// ========================================================================
function mudarView(v) { currentView = v;
  renderizarCalendario() }

function hoje() { currentDate = new Date();
  renderizarCalendario() }

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
    showToast('Esta consulta foi agendada por outro vendedor. Você não pode visualizar os detalhes.', !0);
    return;
  }
  const modal = document.getElementById('modalDetalhes'),
    body = document.getElementById('detalhesBody');
  const status = e.status || 'agendada';
  let stHtml = '';
  if (status === 'cancelada') stHtml = ' <span style="color:red;">(Cancelada)</span>';
  else if (status === 'confirmada') stHtml = ' <span style="color:green;">(Confirmada)</span>';
  else if (status === 'realizada') stHtml = ' <span style="color:blue;">(Realizada)</span>';
  const vendedor = e.vendedor_nome || 'Não informado',
    isRealizada = status === 'realizada',
    podeEditar = user.tipo === 'admin' && !isRealizada && status !== 'cancelada';
  let admAcoes = '';
  if (user.tipo === 'admin') {
    admAcoes =
      `${podeEditar?`<button onclick="editarConsulta(${e.id});fecharModalDetalhes();" class="btn-warning" style="width:100%;margin-top:5px;">✏️ Editar</button>`:''}
      ${podeEditar&&status!=='cancelada'&&status!=='realizada'&&status!=='confirmada'?`<button onclick="confirmarConsulta(${e.id});fecharModalDetalhes();" class="btn-success" style="width:100%;margin-top:5px;">✅ Confirmar</button>`:''}
      ${podeEditar&&status!=='cancelada'&&status!=='realizada'?`<button onclick="processarConsulta(${e.id});fecharModalDetalhes();" class="btn-process" style="width:100%;margin-top:5px;">🔄 Processar</button>`:''}
      ${podeEditar?`<button onclick="cancelarConsulta(${e.id});fecharModalDetalhes();" class="btn-danger" style="width:100%;margin-top:5px;">🚫 Cancelar</button>`:''}
      ${!isRealizada?`<button onclick="enviarWhatsAppPaciente(${e.id})" class="btn-whatsapp" style="width:100%;margin-top:5px;">📱 WhatsApp Paciente</button>`:''}
      ${!isRealizada?`<button onclick="enviarWhatsAppMedico(${e.id})" class="btn-medico" style="width:100%;margin-top:5px;">📱 WhatsApp Médico</button>`:''}
      <button onclick="abrirModalImpressao(${e.id});fecharModalDetalhes();" class="btn-print" style="width:100%;margin-top:5px;">🖨️ Imprimir Comprovante</button>
      ${isRealizada?'<p style="color:#2b6cb0;font-weight:bold;margin-top:10px;">✅ Consulta já realizada. Nenhuma ação disponível.</p>':''}`;
  }
  const ped = e.numero_pedido ? '<div><strong>Nº Pedido:</strong> ' + escapeHtml(e.numero_pedido) + '</div>' : '',
    loja = e.loja_nome ? '<div><strong>Loja:</strong> ' + escapeHtml(e.loja_nome) + '</div>' : '';
  body.innerHTML =
    `<div><strong>Paciente:</strong> ${escapeHtml(e.paciente_nome)}</div>
    <div><strong>Data/Hora:</strong> ${formatDisplay(e.data_consulta)} ${e.horario}</div>
    <div><strong>Médico:</strong> Dr. ${escapeHtml(e.medico_nome)}</div>
    <div><strong>Telefone:</strong> ${e.paciente_telefone}</div>
    ${e.paciente_email?'<div><strong>E-mail:</strong> '+escapeHtml(e.paciente_email)+'</div>':''}
    ${ped}${loja}
    ${e.observacoes?'<div><strong>Observações:</strong> '+escapeHtml(e.observacoes)+'</div>':''}
    <div><strong>Status:</strong> ${status}${stHtml}</div>
    <div><strong>Vendedor:</strong> ${escapeHtml(vendedor)}</div>
    <div style="margin-top:15px;display:flex;flex-direction:column;gap:5px;">${admAcoes}</div>`;
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
  const tk = localStorage.getItem('token'),
    su = localStorage.getItem('user');
  if (tk && su) {
    token = tk;
    user = JSON.parse(su);
    fetch(API_URL + '/verify', { headers: { Authorization: 'Bearer ' + tk } })
      .then(r => r.json())
      .then(d => {
        if (d.valid) {
          document.getElementById('loginDiv').style.display = 'none';
          document.getElementById('dashboardDiv').style.display = 'block';
          const lt = user.tipo === 'admin' ? 'Admin' : user.tipo === 'consultorio' ? 'Consultório' : 'Vendedor';
          document.getElementById('userName').innerHTML = '👤 ' + user.nome + ' (' + lt + ')';
          document.getElementById('menuUserName').textContent = user.nome;
          document.getElementById('menuUserTipo').textContent = lt;
          if (user.loja_nome) {
            document.getElementById('lojaNome').innerHTML = '🏢 ' + user.loja_nome;
            document.getElementById('menuLojaNome').textContent = '🏢 ' + user.loja_nome;
          }
          const isAdmin = user.tipo === 'admin',
            isConsult = user.tipo === 'consultorio';
          document.getElementById('menuCalendario').style.display = isConsult ? 'none' : 'block';
          document.getElementById('menuAgendar').style.display = isAdmin ? 'block' : 'none';
          document.getElementById('menuSolicitar').style.display = isConsult ? 'none' : 'block';
          document.getElementById('menuDashboard').style.display = isAdmin ? 'block' : 'none';
          document.getElementById('menuAdmin').style.display = isAdmin ? 'block' : 'none';
          document.querySelectorAll('.menu-item[data-sub]').forEach(el => el.style.display = isAdmin ? 'block' : 'none');
          document.getElementById('perfilNome').textContent = user.nome;
          document.getElementById('perfilUsername').textContent = user.username;
          document.getElementById('perfilTipo').textContent = lt;
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

document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('show') });
});

console.log('✅ Sistema completo com tema, perfil consultorio, busca e muito mais.');