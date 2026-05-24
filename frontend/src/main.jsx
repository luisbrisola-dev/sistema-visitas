import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const API = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE.replace(/\/$/, '')}/api`

const ETAPAS = [
  'Novo prospect',
  'Contato realizado',
  'Reunião / visita agendada',
  'Proposta enviada',
  'Em negociação',
  'Aguardando retorno',
  'Cliente ativo',
  'Perdido'
]

const TIPOS_ATIVIDADE = [
  'Visita presencial',
  'Ligação',
  'E-mail enviado',
  'WhatsApp',
  'Reunião online',
  'Envio de proposta',
  'Follow-up',
  'Negociação',
  'Pós-venda',
  'Outro'
]

const STATUS_CLIENTE = ['Prospect', 'Em prospecção', 'Em negociação', 'Cliente ativo', 'Perdido', 'Inativo']
const POTENCIAIS = ['Baixo', 'Médio', 'Alto']
const TEMPERATURAS = ['Frio', 'Morno', 'Quente']
function etapaExigePrevisao(etapa) {
  return ETAPAS.indexOf(etapa) >= ETAPAS.indexOf('Proposta enviada') && etapa !== 'Perdido'
}

function etapaTemValor(etapa) {
  return ETAPAS.indexOf(etapa) >= ETAPAS.indexOf('Proposta enviada')
}

function limparSessao() {
  localStorage.removeItem('visitas_token')
  localStorage.removeItem('visitas_user')
}

async function request(path, options = {}) {
  const token = localStorage.getItem('visitas_token')
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401) {
      limparSessao()
      window.dispatchEvent(new Event('visitas-auth-expirada'))
    }
    throw new Error(data.erro || 'Erro na requisição.')
  }
  return data
}

function moeda(valor) {
  if (valor === null || valor === undefined || valor === '') return '-'
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dataBR(data) {
  if (!data) return '-'
  const [y, m, d] = String(data).slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : data
}

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

function Login({ onLogin }) {
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    try {
      const data = await request('/login', { method: 'POST', body: JSON.stringify({ usuario, senha }) })
      localStorage.setItem('visitas_token', data.token)
      localStorage.setItem('visitas_user', JSON.stringify(data.usuario))
      onLogin(data.usuario)
    } catch (err) {
      setErro(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={entrar}>
        <div className="brand">VC</div>
        <h1>Controle Comercial</h1>
        <p>Clientes, oportunidades, atividades e gestão de vendedores externos.</p>
        <label>Usuário</label>
        <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus />
        <label>Senha</label>
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        {erro && <div className="alert error">{erro}</div>}
        <button className="btn primary" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </main>
  )
}

function Shell({ usuario, onLogout }) {
  const [page, setPage] = useState('dashboard')
  const [menuAberto, setMenuAberto] = useState(true)
  const menus = [
    ['dashboard', 'Dashboard', 'D'],
    ['kanban', 'Kanban Comercial', 'K'],
    ['clientes', 'Clientes', 'C'],
    ['atividades', 'Atividades', 'A'],
    ['relatorios', 'Relatórios', 'R'],
    ...(usuario.perfil === 'Administrador' ? [['usuarios', 'Usuários', 'U']] : [])
  ]
  return (
    <div className={`app-shell ${menuAberto ? '' : 'menu-collapsed'}`}>
      <aside className="sidebar">
        <button className="sidebar-toggle" type="button" onClick={() => setMenuAberto(!menuAberto)} title={menuAberto ? 'Ocultar menu' : 'Exibir menu'}>{menuAberto ? '‹' : '›'}</button>
        <div className="logo-row"><span className="logo">VC</span><strong>Controle Comercial</strong></div>
        <nav>
          {menus.map(([id, label, icon]) => (
            <button
              key={id}
              className={page === id ? 'active' : ''}
              onClick={() => setPage(id)}
              title={label}
              aria-label={label}
            >
              <span className="nav-icon" aria-hidden="true">{icon}</span>
              <span className="nav-label">{label}</span>
            </button>
          ))}
        </nav>
        <div className="user-box">
          <strong>{usuario.nome}</strong>
          <span>{usuario.perfil}</span>
          <button className="btn ghost" onClick={onLogout}>Sair</button>
        </div>
      </aside>
      <main className="content">
        {page === 'dashboard' && <Dashboard />}
        {page === 'kanban' && <Kanban usuario={usuario} />}
        {page === 'clientes' && <Clientes usuario={usuario} />}
        {page === 'atividades' && <Atividades />}
        {page === 'relatorios' && <Relatorios usuario={usuario} />}
        {page === 'usuarios' && usuario.perfil === 'Administrador' && <Usuarios />}
      </main>
    </div>
  )
}

function PageHeader({ title, subtitle, action }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </header>
  )
}

function Dashboard() {
  const [data, setData] = useState(null)
  const [erro, setErro] = useState('')
  const [modal, setModal] = useState(null)
  useEffect(() => { carregar() }, [])
  async function carregar() {
    try { setData(await request('/dashboard')) } catch (err) { setErro(err.message) }
  }
  if (erro) return <div className="alert error">{erro}</div>
  if (!data) return <div className="loading">Carregando dashboard...</div>

  const cards = [
    { key: 'abertas', title: 'Oportunidades abertas', value: data.cards.oportunidadesAbertas, helper: 'Cards em andamento', items: data.cardDetails?.oportunidadesAbertas || [], type: 'oportunidades' },
    { key: 'valor', title: 'Valor em negociação', value: moeda(data.cards.valorNegociacao), helper: 'A partir de proposta enviada', items: data.cardDetails?.valorNegociacao || [], type: 'oportunidades' },
    { key: 'propostas', title: 'Propostas enviadas', value: data.cards.propostasEnviadas, helper: 'Aguardando avanço', items: data.cardDetails?.propostasEnviadas || [], type: 'oportunidades' },
    { key: 'previsao', title: 'Previsão de fechamento', value: moeda(data.cards.previsaoFechamento), helper: 'Pipeline com previsão', items: data.cardDetails?.previsaoFechamento || [], type: 'oportunidades' },
    { key: 'clientesAtivos', title: 'Clientes ativos', value: data.cards.clientesAtivos, helper: 'Base em relacionamento', items: data.cardDetails?.clientesAtivos || [], type: 'clientes' },
    { key: 'atividades7d', title: 'Atividades 7 dias', value: data.cards.atividades7d, helper: 'Ritmo comercial recente', items: data.cardDetails?.atividades7d || [], type: 'atividades' }
  ]

  return (
    <section className="dashboard-executivo">
      <PageHeader title="Dashboard Executivo" subtitle="Indicadores comerciais para decisão rápida e acompanhamento da carteira" />

      <div className="exec-metric-grid">
        {cards.map((card) => <Metric key={card.key} title={card.title} value={card.value} helper={card.helper} onClick={() => setModal(card)} />)}
      </div>

      <div className="dashboard-layout">
        <div className="panel executive-panel funnel-panel">
          <div className="panel-title-row">
            <div>
              <h2>Funil comercial</h2>
              <p>Quantidade e valor por etapa</p>
            </div>
          </div>
          <div className="funnel-list">
            {(data.funilExecutivo || []).map((e) => (
              <button className="funnel-row" key={e.etapa} onClick={() => setModal({ title: e.etapa, value: e.total, type: 'oportunidades', items: e.items || [] })}>
                <span className="funnel-name">{e.etapa}</span>
                <span className="funnel-bar"><i style={{ width: `${Math.max(8, e.percentual || 0)}%` }} /></span>
                <strong>{e.total}</strong>
                <b>{moeda(e.valor)}</b>
              </button>
            ))}
          </div>
        </div>

        <div className="panel executive-panel alerts-panel">
          <div className="panel-title-row">
            <div>
              <h2>Alertas gerenciais</h2>
              <p>Prioridades para ação do gestor</p>
            </div>
          </div>
          <div className="alert-grid">
            {(data.alertas || []).map((a) => (
              <button className={`alert-card ${a.severidade || ''}`} key={a.key} onClick={() => setModal({ title: a.title, value: a.value, type: a.type || 'oportunidades', items: a.items || [] })}>
                <span>{a.title}</span>
                <strong>{a.value}</strong>
                <small>{a.descricao}</small>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dashboard-layout bottom">
        <div className="panel executive-panel">
          <div className="panel-title-row">
            <div>
              <h2>Ranking de vendedores</h2>
              <p>Performance consolidada da carteira</p>
            </div>
          </div>
          <div className="table-wrap compact-table executive-table">
            <table>
              <thead>
                <tr><th>Vendedor</th><th>Abertas</th><th>Propostas</th><th>Valor</th><th>Atividades</th><th>Conversão</th></tr>
              </thead>
              <tbody>
                {(data.rankingVendedores || []).map((v) => (
                  <tr key={v.id || v.nome}>
                    <td><strong>{v.nome}</strong></td>
                    <td>{v.oportunidadesAbertas}</td>
                    <td>{v.propostasEnviadas}</td>
                    <td>{moeda(v.valorPropostas)}</td>
                    <td>{v.atividadesRealizadas}</td>
                    <td>{v.taxaConversao}%</td>
                  </tr>
                ))}
                {(data.rankingVendedores || []).length === 0 && <tr><td colSpan="6" className="empty-row">Sem dados para ranking.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel executive-panel">
          <div className="panel-title-row">
            <div>
              <h2>Clientes — visão consolidada</h2>
              <p>Resumo estratégico, sem listar toda a base</p>
            </div>
          </div>
          <div className="client-summary-grid">
            <button onClick={() => setModal({ title: 'Clientes com oportunidade aberta', value: data.clientesResumo?.comOportunidadeAberta || 0, type: 'clientes', items: data.cardDetails?.clientesComOportunidadeAberta || [] })}><span>Com oportunidade</span><strong>{data.clientesResumo?.comOportunidadeAberta || 0}</strong></button>
            <button onClick={() => setModal({ title: 'Clientes sem oportunidade aberta', value: data.clientesResumo?.semOportunidadeAberta || 0, type: 'clientes', items: data.cardDetails?.clientesSemOportunidadeAberta || [] })}><span>Sem oportunidade</span><strong>{data.clientesResumo?.semOportunidadeAberta || 0}</strong></button>
            <button onClick={() => setModal({ title: 'Clientes ativos', value: data.clientesResumo?.ativos || 0, type: 'clientes', items: data.cardDetails?.clientesAtivos || [] })}><span>Ativos</span><strong>{data.clientesResumo?.ativos || 0}</strong></button>
            <button onClick={() => setModal({ title: 'Novos clientes no mês', value: data.clientesResumo?.novosNoMes || 0, type: 'clientes', items: data.cardDetails?.clientesNovosNoMes || [] })}><span>Novos no mês</span><strong>{data.clientesResumo?.novosNoMes || 0}</strong></button>
          </div>
        </div>
      </div>

      <div className="panel executive-panel last-activities-panel">
        <div className="panel-title-row">
          <div>
            <h2>Últimas atividades</h2>
            <p>Movimentos comerciais recentes</p>
          </div>
        </div>
        <div className="activity-strip">
          {(data.atividades || []).map((a) => (
            <button className="activity-card" key={a.id} onClick={() => setModal({ title: 'Atividade', value: a.tipo, type: 'atividades', items: [a] })}>
              <strong>{a.tipo}</strong>
              <span>{a.cliente?.nomeFantasia || a.cliente?.razaoSocial || '-'}</span>
              <small>{dataBR(a.data)} • {a.responsavel?.nome || '-'}</small>
            </button>
          ))}
          {(data.atividades || []).length === 0 && <p className="muted">Nenhuma atividade recente.</p>}
        </div>
      </div>

      {modal && <DashboardDetalheModal data={modal} onClose={() => setModal(null)} />}
    </section>
  )
}

function Metric({ title, value, helper, onClick }) {
  return <button className="metric executive-metric metric-click" onClick={onClick}><span>{title}</span><strong>{value}</strong><small>{helper || 'Clique para ver detalhes'}</small></button>
}

function DashboardDetalheModal({ data, onClose }) {
  const items = data.items || []
  return (
    <Modal title={`${data.title} (${data.value})`} onClose={onClose} wide>
      {items.length === 0 && <p className="muted">Nenhum registro encontrado para este indicador.</p>}
      {items.length > 0 && (
        <div className="table-wrap compact-table executive-detail-table">
          <table>
            <thead>
              <tr>
                {data.type === 'clientes' ? <><th>Cliente</th><th>Contato</th><th>Telefone</th><th>Segmento</th><th>Proprietário</th><th>Status</th></> : data.type === 'atividades' ? <><th>Data</th><th>Cliente</th><th>Tipo</th><th>Resumo</th><th>Responsável</th></> : <><th>Cliente</th><th>Oportunidade</th><th>Etapa</th><th>Valor</th><th>Responsável</th><th>Previsão</th></>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => data.type === 'clientes' ? (
                <tr key={item.id}><td><strong>{item.nomeFantasia}</strong><br /><small>{item.razaoSocial}</small></td><td>{item.contato || '-'}</td><td>{item.telefone || '-'}</td><td>{item.segmento || '-'}</td><td>{item.vendedor?.nome || item.vendedorNome || '-'}</td><td>{item.status || '-'}</td></tr>
              ) : data.type === 'atividades' ? (
                <tr key={item.id}><td>{dataBR(item.data)}</td><td>{item.cliente?.nomeFantasia || item.cliente?.razaoSocial || '-'}</td><td><strong>{item.tipo}</strong></td><td>{item.resumo || item.observacoes || '-'}</td><td>{item.responsavel?.nome || '-'}</td></tr>
              ) : (
                <tr key={item.id}><td>{item.cliente?.nomeFantasia || item.cliente?.razaoSocial || '-'}</td><td><strong>{item.titulo}</strong></td><td>{item.etapa}</td><td>{moeda(item.valorProposta)}</td><td>{item.vendedor?.nome || '-'}</td><td>{dataBR(item.previsaoFechamento)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

function AcoesMenu({ children }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const close = () => setOpen(false)
  function toggle(e) {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: Math.max(12, r.right - 210) })
    setOpen(!open)
  }
  return (
    <div className="actions-menu">
      <button className="icon-btn" type="button" onClick={toggle}>...</button>
      {open && <>
        <div className="actions-scrim" onClick={(e) => { e.stopPropagation(); close() }} />
        <div className="actions-popover fixed" style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}>{typeof children === 'function' ? children(close) : children}</div>
      </>}
    </div>
  )
}

function Kanban({ usuario }) {
  const [oportunidades, setOportunidades] = useState([])
  const [clientes, setClientes] = useState([])
  const [modal, setModal] = useState(null)
  const [erro, setErro] = useState('')
  useEffect(() => { carregar() }, [])
  async function carregar() {
    try {
      const [ops, cls] = await Promise.all([request('/oportunidades'), request('/clientes')])
      setOportunidades(ops)
      setClientes(cls)
    } catch (err) { setErro(err.message) }
  }
  async function mover(op, etapa) {
    if (usuario.perfil !== 'Administrador' && op.vendedorId !== usuario.id) {
      alert('Esta oportunidade pertence a outro usuário. Somente o responsável ou admin pode alterar.')
      return
    }
    let previsaoFechamento = op.previsaoFechamento || ''
    if (etapaExigePrevisao(etapa) && !previsaoFechamento) {
      previsaoFechamento = prompt('Informe a previsão de fechamento (AAAA-MM-DD):') || ''
      if (!previsaoFechamento) return
    }
    try {
      await request(`/oportunidades/${op.id}`, { method: 'PUT', body: JSON.stringify({ etapa, previsaoFechamento, temperatura: op.temperatura || 'Morno', valorProposta: etapaTemValor(etapa) ? op.valorProposta : null }) })
      await carregar()
    } catch (err) { alert(err.message) }
  }
  async function excluirOportunidade(op) {
    if (!confirm(`Excluir a oportunidade "${op.titulo}"?`)) return
    try {
      await request(`/oportunidades/${op.id}`, { method: 'DELETE' })
      await carregar()
    } catch (err) { alert(err.message) }
  }
  const porEtapa = useMemo(() => Object.fromEntries(ETAPAS.map((e) => [e, oportunidades.filter((o) => o.etapa === e)])), [oportunidades])
  return (
    <section>
      <PageHeader title="Kanban Comercial" subtitle="Cada card representa uma oportunidade. Atividades entram no histórico do card." action={<button className="btn primary" onClick={() => setModal({ tipo: 'oportunidade' })}>Nova oportunidade</button>} />
      {erro && <div className="alert error">{erro}</div>}
      <div className="kanban kanban-compact">
        {ETAPAS.map((etapa) => (
          <div className="kanban-col" key={etapa}>
            <h3>{etapa} <span>{porEtapa[etapa]?.length || 0}</span></h3>
            {(porEtapa[etapa] || []).map((op) => (
              <div className="op-card op-card-compact op-card-mini" key={op.id} onClick={() => setModal({ tipo: 'detalhe', opId: op.id })}>
                <div className="op-card-top">
                  <strong>{op.cliente?.nomeFantasia || op.cliente?.razaoSocial}</strong>
                  <AcoesMenu>{(close) => <>
                    <button type="button" onClick={() => { close(); setModal({ tipo: 'detalhe', opId: op.id }) }}>Abrir</button>
                    {(usuario.perfil === 'Administrador' || op.vendedorId === usuario.id) && <button type="button" className="danger-text" onClick={() => { close(); excluirOportunidade(op) }}>Excluir</button>}
                  </>}</AcoesMenu>
                </div>
                <small>Atualizado: {dataBR(String(op.atualizadoEm || '').slice(0, 10))}</small>
                <b>{op.valorProposta ? moeda(op.valorProposta) : 'Sem valor'}</b>
              </div>
            ))}
          </div>
        ))}
      </div>
      {modal?.tipo === 'oportunidade' && <OportunidadeModal clientes={clientes} onClose={() => setModal(null)} onSaved={() => { setModal(null); carregar() }} />}
      {modal?.tipo === 'detalhe' && <DetalheOportunidade opId={modal.opId} usuario={usuario} onClose={() => setModal(null)} onSaved={carregar} />}
    </section>
  )
}

function ClienteBusca({ clientes, value, onChange }) {
  const [q, setQ] = useState('')
  const selecionado = clientes.find((c) => c.id === value)
  const filtrados = clientes.filter((c) => `${c.nomeFantasia} ${c.razaoSocial} ${c.cnpj || ''} ${c.cidade || ''} ${c.contato || ''}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
  return (
    <div className="autocomplete">
      <input placeholder="Digite nome, CNPJ, cidade ou contato..." value={q || selecionado?.nomeFantasia || ''} onChange={(e) => { setQ(e.target.value); onChange('') }} />
      {q && !value && <div className="suggestions">
        {filtrados.map((c) => <button key={c.id} type="button" onClick={() => { onChange(c.id); setQ('') }}><strong>{c.nomeFantasia}</strong><span>{c.cidade || '-'} • {c.cnpj || 'sem CNPJ'}</span></button>)}
        {filtrados.length === 0 && <span className="empty">Nenhum cliente encontrado.</span>}
      </div>}
    </div>
  )
}

function OportunidadeModal({ clientes, clienteIdInicial = '', onClose, onSaved }) {
  const [form, setForm] = useState({ clienteId: clienteIdInicial, titulo: '', etapa: 'Novo prospect', origem: '', descricao: '', proximaAcao: '', proximaData: '', valorProposta: '', previsaoFechamento: '', temperatura: 'Morno' })
  async function salvar(e) {
    e.preventDefault()
    if (etapaExigePrevisao(form.etapa) && !form.previsaoFechamento) return alert('Previsão de fechamento é obrigatória a partir de Proposta enviada.')
    try { await request('/oportunidades', { method: 'POST', body: JSON.stringify(form) }); onSaved() } catch (err) { alert(err.message) }
  }
  return (
    <Modal title="Nova oportunidade" onClose={onClose}>
      <form className="form-grid" onSubmit={salvar}>
        <label className="span2">Cliente<ClienteBusca clientes={clientes} value={form.clienteId} onChange={(clienteId) => setForm({ ...form, clienteId })} /></label>
        <label>Título<input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Fornecimento de embalagens linha A" /></label>
        <label>Etapa<select value={form.etapa} onChange={(e) => setForm({ ...form, etapa: e.target.value, valorProposta: etapaTemValor(e.target.value) ? form.valorProposta : '' })}>{ETAPAS.map((e) => <option key={e}>{e}</option>)}</select></label>
        {etapaTemValor(form.etapa) && <label>Valor da proposta<input value={form.valorProposta} onChange={(e) => setForm({ ...form, valorProposta: e.target.value })} placeholder="15000,00" /></label>}
        {etapaExigePrevisao(form.etapa) && <label>Previsão de fechamento<input type="date" required value={form.previsaoFechamento} onChange={(e) => setForm({ ...form, previsaoFechamento: e.target.value })} /></label>}
        {etapaExigePrevisao(form.etapa) && <label>Temperatura<select value={form.temperatura} onChange={(e) => setForm({ ...form, temperatura: e.target.value })}>{TEMPERATURAS.map((t) => <option key={t}>{t}</option>)}</select></label>}
        <label>Próxima ação<input value={form.proximaAcao} onChange={(e) => setForm({ ...form, proximaAcao: e.target.value })} /></label>
        <label>Próxima data<input type="date" value={form.proximaData} onChange={(e) => setForm({ ...form, proximaData: e.target.value })} /></label>
        <label className="span2">Descrição<textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></label>
        <div className="actions span2"><button className="btn ghost" type="button" onClick={onClose}>Cancelar</button><button className="btn primary">Salvar</button></div>
      </form>
    </Modal>
  )
}

function DetalheOportunidade({ opId, usuario, onClose, onSaved }) {
  const [op, setOp] = useState(null)
  const [atividade, setAtividade] = useState(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { carregarDetalhe() }, [opId])

  async function carregarDetalhe() {
    try {
      const detalhe = await request(`/oportunidades/${opId}`)
      setOp(detalhe)
      setAtividade({
        clienteId: detalhe.clienteId,
        oportunidadeId: detalhe.id,
        tipo: 'Ligação',
        data: hoje(),
        hora: '',
        resumo: '',
        contato: detalhe.cliente?.contato || '',
        etapaApos: detalhe.etapa,
        valorProposta: detalhe.valorProposta || '',
        previsaoFechamento: detalhe.previsaoFechamento || '',
        temperatura: detalhe.temperatura || 'Morno',
        proximaAcao: '',
        proximaData: ''
      })
    } catch (err) {
      setErro(err.message)
    }
  }

  async function salvarAtividade(e) {
    e.preventDefault()
    if (!op.editavel) return alert('Esta oportunidade pertence a outro usuário. Somente o responsável ou admin pode registrar atividades.')
    if (etapaExigePrevisao(atividade.etapaApos) && !atividade.previsaoFechamento) return alert('Previsão de fechamento é obrigatória a partir de Proposta enviada.')
    setSalvando(true)
    try {
      await request('/atividades', { method: 'POST', body: JSON.stringify(atividade) })
      await carregarDetalhe()
      await onSaved?.()
    } catch (err) {
      alert(err.message)
    } finally {
      setSalvando(false)
    }
  }

  if (erro) return (
    <Modal title="Erro ao abrir oportunidade" onClose={onClose} wide>
      <div className="alert error">{erro}</div>
    </Modal>
  )

  if (!op || !atividade) return (
    <Modal title="Carregando oportunidade..." onClose={onClose} wide>
      <div className="loading">Carregando histórico comercial...</div>
    </Modal>
  )

  return (
    <Modal title={op.cliente?.nomeFantasia || op.titulo} onClose={onClose} wide>
      <div className="detail-head">
        <div><span>Cliente</span><strong>{op.cliente?.nomeFantasia || op.cliente?.razaoSocial}</strong></div>
        <div><span>Oportunidade</span><strong>{op.titulo}</strong></div>
        <div><span>Etapa atual</span><strong>{op.etapa}</strong></div>
        {etapaTemValor(op.etapa) && <div><span>Valor da proposta</span><strong>{moeda(op.valorProposta)}</strong></div>}
        {etapaExigePrevisao(op.etapa) && <div><span>Previsão</span><strong>{dataBR(op.previsaoFechamento)}</strong></div>}
        {etapaExigePrevisao(op.etapa) && <div><span>Temperatura</span><strong>{op.temperatura || 'Morno'}</strong></div>}
      </div>

      <div className="opportunity-summary">
        <p><strong>Contato:</strong> {op.cliente?.contato || '-'} • {op.cliente?.telefone || '-'} • {op.cliente?.email || '-'}</p>
        <p><strong>Próxima ação:</strong> {op.proximaAcao || '-'} {op.proximaData ? `• ${dataBR(op.proximaData)}` : ''}</p>
      </div>

      {!op.editavel && <div className="alert warning">Card bloqueado para edição. Responsável: {op.vendedor?.nome || '-'}. Apenas o admin pode alterar o responsável.</div>}

      <div className="two-col modal-cols">
        <div className="panel flat">
          <h2>Histórico do relacionamento</h2>
          {(op.atividades || []).length === 0 && <p className="muted">Nenhuma atividade registrada ainda. Registre a primeira interação no formulário ao lado.</p>}
          {(op.atividades || []).map((a) => (
            <div className="timeline" key={a.id}>
              <strong>{a.tipo} • {dataBR(a.data)}{a.hora ? ` às ${a.hora}` : ''}</strong>
              <p>{a.resumo || a.observacoes || 'Sem resumo.'}</p>
              <small>
                {a.responsavel?.nome ? `Responsável: ${a.responsavel.nome}` : ''}
                {a.etapaApos ? ` • Etapa após atividade: ${a.etapaApos}` : ''}
                {a.valorProposta ? ` • Valor: ${moeda(a.valorProposta)}` : ''}
                {a.previsaoFechamento ? ` • Previsão: ${dataBR(a.previsaoFechamento)}` : ''}
                {a.temperatura ? ` • Temperatura: ${a.temperatura}` : ''}
              </small>
            </div>
          ))}
        </div>

        <form className="panel flat form-grid" onSubmit={salvarAtividade}>
          <fieldset className="form-fieldset" disabled={!op.editavel}>
          <h2 className="span2">Registrar nova atividade neste card</h2>
          <label>Tipo<select value={atividade.tipo} onChange={(e) => setAtividade({ ...atividade, tipo: e.target.value })}>{TIPOS_ATIVIDADE.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label>Data<input type="date" value={atividade.data} onChange={(e) => setAtividade({ ...atividade, data: e.target.value })} /></label>
          <label>Hora<input type="time" value={atividade.hora} onChange={(e) => setAtividade({ ...atividade, hora: e.target.value })} /></label>
          <label>Contato<input value={atividade.contato} onChange={(e) => setAtividade({ ...atividade, contato: e.target.value })} /></label>
          <label className="span2">Etapa após esta atividade<select value={atividade.etapaApos} onChange={(e) => setAtividade({ ...atividade, etapaApos: e.target.value, valorProposta: etapaTemValor(e.target.value) ? atividade.valorProposta : '' })}>{ETAPAS.map((e) => <option key={e}>{e}</option>)}</select></label>
          {etapaTemValor(atividade.etapaApos) && <label className="span2">Valor da proposta<input value={atividade.valorProposta} onChange={(e) => setAtividade({ ...atividade, valorProposta: e.target.value })} placeholder="Ex.: 15000,00" /></label>}
          {etapaExigePrevisao(atividade.etapaApos) && <label>Previsão de fechamento<input type="date" required value={atividade.previsaoFechamento} onChange={(e) => setAtividade({ ...atividade, previsaoFechamento: e.target.value })} /></label>}
          {etapaExigePrevisao(atividade.etapaApos) && <label>Temperatura<select value={atividade.temperatura} onChange={(e) => setAtividade({ ...atividade, temperatura: e.target.value })}>{TEMPERATURAS.map((t) => <option key={t}>{t}</option>)}</select></label>}
          <label>Próxima ação<input value={atividade.proximaAcao} onChange={(e) => setAtividade({ ...atividade, proximaAcao: e.target.value })} placeholder="Ex.: Retornar ligação" /></label>
          <label>Próxima data<input type="date" value={atividade.proximaData} onChange={(e) => setAtividade({ ...atividade, proximaData: e.target.value })} /></label>
          <label className="span2">Resumo da interação<textarea value={atividade.resumo} onChange={(e) => setAtividade({ ...atividade, resumo: e.target.value })} placeholder="Ex.: Cliente solicitou proposta para fornecimento mensal. Enviado e-mail com detalhes." /></label>
          <button className="btn primary span2" disabled={salvando || !op.editavel}>{salvando ? 'Salvando...' : 'Salvar atividade no histórico'}</button>
          </fieldset>
        </form>
      </div>
    </Modal>
  )
}



function csvEscape(v) {
  const text = String(v ?? '')
  if (/[;\n\r"]/.test(text)) return '"' + text.replaceAll('"', '""') + '"'
  return text
}

function baixarArquivo(nome, conteudo, tipo = 'text/csv;charset=utf-8;') {
  const blob = new Blob(['\ufeff' + conteudo], { type: tipo })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function parseCsv(texto) {
  const linhas = String(texto || '').replace(/^\ufeff/, '').split(/\r?\n/).filter((l) => l.trim())
  if (!linhas.length) return []
  const sep = linhas[0].includes(';') ? ';' : ','
  const parseLinha = (linha) => {
    const out = []
    let atual = ''
    let aspas = false
    for (let i = 0; i < linha.length; i++) {
      const ch = linha[i]
      if (ch === '"' && linha[i + 1] === '"') { atual += '"'; i++; continue }
      if (ch === '"') { aspas = !aspas; continue }
      if (ch === sep && !aspas) { out.push(atual.trim()); atual = ''; continue }
      atual += ch
    }
    out.push(atual.trim())
    return out
  }
  const headers = parseLinha(linhas[0]).map((h) => h.trim().toLowerCase())
  const mapa = {
    'data': 'data',
    'empresa': 'empresa',
    'nome fantasia': 'nomeFantasia',
    'razão social': 'razaoSocial',
    'razao social': 'razaoSocial',
    'cnpj': 'cnpj',
    'nome do contato': 'nomeContato',
    'contato': 'contato',
    'telefone': 'telefone',
    'e-mail': 'email',
    'email': 'email',
    'segmento': 'segmento',
    'cidade': 'cidade',
    'uf': 'estado',
    'estado': 'estado',
    'origem do lead': 'origemLead',
    'origem lead': 'origemLead',
    'status do contato': 'statusContato',
    'status': 'status',
    'próximo follow-up': 'proximoFollowUp',
    'proximo follow-up': 'proximoFollowUp',
    'observações': 'observacoes',
    'observacoes': 'observacoes',
    'vendedor': 'vendedor',
    'responsável': 'responsavel',
    'responsavel': 'responsavel',
  }
  return linhas.slice(1).map((linha) => {
    const cols = parseLinha(linha)
    const item = {}
    headers.forEach((h, i) => {
      const key = mapa[h] || h.replace(/\s+/g, '')
      item[key] = cols[i] || ''
    })
    return item
  }).filter((i) => i.nomeFantasia || i.empresa || i.razaoSocial || i.cnpj || i.email)
}

function Clientes({ usuario }) {
  const [clientes, setClientes] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [q, setQ] = useState('')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [filtros, setFiltros] = useState({ segmento: '', status: '', cidade: '', vendedor: '' })
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(20)
  const [modal, setModal] = useState(null)
  const [modalOp, setModalOp] = useState(null)
  const [modalDetalheCliente, setModalDetalheCliente] = useState(null)
  const [modalDetalheOp, setModalDetalheOp] = useState(null)
  const [selecionados, setSelecionados] = useState([])
  const [novoProprietario, setNovoProprietario] = useState('')
  const fileImportRef = useRef(null)
  const ehAdmin = String(usuario?.perfil || '').toLowerCase().includes('admin')
  const nomeProprietarioCliente = (c) => c.vendedorNome || c.proprietarioNome || c.responsavelNome || c.vendedor?.nome || c.proprietario?.nome || c.responsavel?.nome || '-'

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const cls = await request('/clientes')
    setClientes(Array.isArray(cls) ? cls : [])
    if (ehAdmin) setUsuarios(await request('/usuarios'))
  }

  async function excluir(id) {
    if (!confirm('Excluir cliente e histórico relacionado?')) return
    await request(`/clientes/${id}`, { method: 'DELETE' })
    carregar()
  }



  function baixarModeloClientes() {
    const cabecalhos = ['Empresa', 'Razão Social', 'CNPJ', 'Nome do Contato', 'Telefone', 'E-mail', 'Segmento', 'Cidade', 'UF', 'Origem do Lead', 'Status do Contato', 'Próximo Follow-up', 'Observações', 'Vendedor']
    const exemplo = ['Empresa Exemplo', 'Empresa Exemplo Ltda', '00.000.000/0001-00', 'Compras', '(12) 99999-9999', 'compras@exemplo.com.br', 'Indústria', 'São José dos Campos', 'SP', 'Prospecção', 'Prospect', '25/05/2026', 'Observação inicial', usuario.nome || usuario.usuario || '']
    baixarArquivo('modelo_importacao_clientes.csv', [cabecalhos, exemplo].map((l) => l.map(csvEscape).join(';')).join('\n'))
  }

  function exportarClientes() {
    const cabecalhos = ['Nome Fantasia', 'Razão Social', 'CNPJ', 'Contato', 'Telefone', 'E-mail', 'Segmento', 'Cidade', 'UF', 'Status', 'Origem do Lead', 'Vendedor', 'Última Atualização', 'Observações']
    const linhas = clientesFiltrados.map((c) => [c.nomeFantasia, c.razaoSocial, c.cnpj, c.contato, c.telefone, c.email, c.segmento, c.cidade, c.estado, c.status, c.origemLead, c.vendedorNome, dataBR(String(c.atualizadoEm || '').slice(0, 10)), c.observacoes])
    baixarArquivo('clientes_exportados.csv', [cabecalhos, ...linhas].map((l) => l.map(csvEscape).join(';')).join('\n'))
  }

  async function importarClientesArquivo(e) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    try {
      const texto = await arquivo.text()
      const clientesImportacao = parseCsv(texto)
      if (!clientesImportacao.length) return alert('Arquivo sem clientes válidos para importação.')
      const r = await request('/clientes/importar', { method: 'POST', body: JSON.stringify({ clientes: clientesImportacao }) })
      alert(`Importação concluída. Criados: ${r.criados || 0}. Atualizados: ${r.atualizados || 0}. Duplicados tratados: ${r.duplicados || 0}. Ignorados: ${r.ignorados || 0}.`)
      carregar()
    } catch (err) {
      alert(err.message)
    }
  }

  function toggleSelecionado(id) {
    setSelecionados((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  function toggleTodosPagina() {
    const idsPagina = clientesPagina.map((c) => c.id)
    const todos = idsPagina.every((id) => selecionados.includes(id))
    setSelecionados((prev) => todos ? prev.filter((id) => !idsPagina.includes(id)) : [...new Set([...prev, ...idsPagina])])
  }

  async function alterarProprietarioMassa() {
    if (!ehAdmin) return
    if (!selecionados.length) return alert('Selecione pelo menos um cliente.')
    if (!novoProprietario) return alert('Selecione o novo proprietário.')
    await request('/clientes/proprietario-massa', { method: 'PATCH', body: JSON.stringify({ clienteIds: selecionados, vendedorId: novoProprietario }) })
    alert('Proprietário atualizado nos clientes selecionados.')
    setSelecionados([])
    setNovoProprietario('')
    carregar()
  }

  function limparFiltros() {
    setQ('')
    setFiltros({ segmento: '', status: '', cidade: '', vendedor: '' })
    setPagina(1)
  }

  const opcoes = useMemo(() => {
    const unico = (campo) => [...new Set(clientes.map((c) => c[campo]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)))
    return {
      segmentos: unico('segmento'),
      status: unico('status'),
      cidades: unico('cidade'),
      vendedores: [...new Set(clientes.map((c) => c.vendedorNome).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)))
    }
  }, [clientes])

  const clientesFiltrados = useMemo(() => {
    const termo = q.trim().toLowerCase()
    return clientes.filter((c) => {
      const texto = [c.nomeFantasia, c.razaoSocial, c.cnpj, c.cidade, c.estado, c.contato, c.telefone, c.email, c.segmento, c.vendedorNome]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (termo && !texto.includes(termo)) return false
      if (filtros.segmento && c.segmento !== filtros.segmento) return false
      if (filtros.status && c.status !== filtros.status) return false
      if (filtros.cidade && c.cidade !== filtros.cidade) return false
      if (filtros.vendedor && c.vendedorNome !== filtros.vendedor) return false
      return true
    })
  }, [clientes, q, filtros])

  const totalPaginas = Math.max(1, Math.ceil(clientesFiltrados.length / porPagina))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const inicio = (paginaAtual - 1) * porPagina
  const clientesPagina = clientesFiltrados.slice(inicio, inicio + porPagina)

  useEffect(() => { setPagina(1) }, [q, filtros.segmento, filtros.status, filtros.cidade, filtros.vendedor, porPagina])

  return (
    <section className="clientes-page">
      <PageHeader title="Clientes" subtitle="Cadastro principal da carteira comercial" action={
        <div className="inline-actions">
          <button className="btn ghost" type="button" onClick={baixarModeloClientes}>Baixar modelo</button>
          <button className="btn ghost" type="button" onClick={() => fileImportRef.current?.click()}>Importar</button>
          <button className="btn ghost" type="button" onClick={exportarClientes}>Exportar</button>
          <button className="btn primary" type="button" onClick={() => setModal({})}>Novo cliente</button>
          <input ref={fileImportRef} type="file" accept=".csv,.txt" hidden onChange={importarClientesArquivo} />
        </div>
      } />

      <div className="clients-toolbar compact-card">
        <div className="clients-search-row">
          <input placeholder="Buscar por nome, CNPJ, cidade, contato, telefone, e-mail..." value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn ghost" type="button" onClick={() => setFiltrosAbertos(!filtrosAbertos)}>{filtrosAbertos ? 'Ocultar filtros' : 'Filtros'}</button>
          <button className="btn ghost" type="button" onClick={limparFiltros}>Limpar</button>
        </div>

        {filtrosAbertos && (
          <div className="clients-filters-grid">
            <label>Segmento
              <select value={filtros.segmento} onChange={(e) => setFiltros({ ...filtros, segmento: e.target.value })}>
                <option value="">Todos</option>
                {opcoes.segmentos.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>Status
              <select value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}>
                <option value="">Todos</option>
                {opcoes.status.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>Cidade
              <select value={filtros.cidade} onChange={(e) => setFiltros({ ...filtros, cidade: e.target.value })}>
                <option value="">Todas</option>
                {opcoes.cidades.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>Vendedor
              <select value={filtros.vendedor} onChange={(e) => setFiltros({ ...filtros, vendedor: e.target.value })}>
                <option value="">Todos</option>
                {opcoes.vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="client-list-summary">
        <span>{clientesFiltrados.length} cliente(s) encontrado(s)</span>
        {ehAdmin && (
          <div className="mass-owner-box">
            <span>{selecionados.length} selecionado(s)</span>
            <select value={novoProprietario} onChange={(e) => setNovoProprietario(e.target.value)}>
              <option value="">Novo proprietário</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
            <button className="btn ghost small" type="button" onClick={alterarProprietarioMassa}>Alterar em massa</button>
          </div>
        )}
        <label>Linhas por página
          <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))}>
            <option value={20}>20</option>
            <option value={30}>30</option>
          </select>
        </label>
      </div>

      <div className="table-wrap clients-list clients-list-compact">
        <table className="clients-table-final">
          <thead>
            <tr>
              {ehAdmin && <th className="check-col"><input type="checkbox" checked={clientesPagina.length > 0 && clientesPagina.every((c) => selecionados.includes(c.id))} onChange={toggleTodosPagina} /></th>}
              <th>Nome fantasia</th>
              <th>Contato</th>
              <th>Telefone</th>
              <th>E-mail</th>
              <th>Segmento</th>
              <th>Cidade/UF</th>
              <th>Proprietário</th>
              <th>Últ. atualização</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {clientesPagina.map((c) => (
              <tr key={c.id}>
                {ehAdmin && <td className="check-col"><input type="checkbox" checked={selecionados.includes(c.id)} onChange={() => toggleSelecionado(c.id)} /></td>}
                <td>
                  <button className="link-cell" type="button" onClick={() => setModalDetalheCliente(c.id)}>
                    <strong>{c.nomeFantasia || c.razaoSocial || '-'}</strong>
                    <small>{c.razaoSocial && c.razaoSocial !== c.nomeFantasia ? c.razaoSocial : c.cnpj || ''}</small>
                  </button>
                </td>
                <td>{c.contato || '-'}</td>
                <td>{c.telefone || '-'}</td>
                <td className="truncate-cell" title={c.email || ''}>{c.email || '-'}</td>
                <td>{c.segmento || '-'}</td>
                <td>{c.cidade || '-'} / {c.estado || '-'}</td>
                <td>{nomeProprietarioCliente(c)}</td>
                <td>{dataBR(String(c.atualizadoEm || c.updatedAt || '').slice(0, 10)) || '-'}</td>
                <td className="td-actions single-action">
                  <button className="icon-action" title="Nova oportunidade" type="button" onClick={() => setModalOp({ clienteId: c.id })}>+</button>
                </td>
              </tr>
            ))}
            {clientesPagina.length === 0 && <tr><td colSpan={ehAdmin ? 10 : 9} className="empty-row">Nenhum cliente encontrado para os filtros aplicados.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="pagination-row">
        <button className="btn ghost small" type="button" disabled={paginaAtual <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))}>Anterior</button>
        <span>Página {paginaAtual} de {totalPaginas}</span>
        <button className="btn ghost small" type="button" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}>Próxima</button>
      </div>

      {modal && <ClienteModal cliente={modal.id ? modal : null} usuarios={usuarios} usuario={usuario} onClose={() => setModal(null)} onSaved={() => { setModal(null); carregar() }} />}
      {modalOp && <OportunidadeModal clientes={clientes} clienteIdInicial={modalOp.clienteId} onClose={() => setModalOp(null)} onSaved={() => { setModalOp(null); carregar() }} />}
      {modalDetalheCliente && <ClienteDetalhe clienteId={modalDetalheCliente} usuario={usuario} onClose={() => setModalDetalheCliente(null)} onEditarCliente={(cliente) => { setModalDetalheCliente(null); setModal(cliente); }} onNovaOportunidade={(clienteId) => { setModalDetalheCliente(null); setModalOp({ clienteId }) }} onAbrirOportunidade={(opId) => setModalDetalheOp(opId)} />}
      {modalDetalheOp && <DetalheOportunidade opId={modalDetalheOp} usuario={usuario} onClose={() => setModalDetalheOp(null)} onSaved={carregar} />}
    </section>
  )
}

function ClienteDetalhe({ clienteId, usuario, onClose, onNovaOportunidade, onAbrirOportunidade, onEditarCliente }) {
  const [cliente, setCliente] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => { carregar() }, [clienteId])

  async function carregar() {
    try {
      setErro('')
      setCliente(await request(`/clientes/${clienteId}`))
    } catch (err) {
      setErro(err.message)
    }
  }

  if (erro) return (
    <Modal title="Detalhes do cliente" onClose={onClose} wide>
      <div className="alert error">{erro}</div>
    </Modal>
  )

  if (!cliente) return (
    <Modal title="Detalhes do cliente" onClose={onClose} wide>
      <div className="loading">Carregando cliente...</div>
    </Modal>
  )

  return (
    <Modal title={cliente.nomeFantasia || cliente.razaoSocial} onClose={onClose} wide>
      <div className="section-title-row compact-title-row">
        <div>
          <h2>Dados do cliente</h2>
          <p className="muted">Clique em editar para atualizar os dados cadastrais quando necessário.</p>
        </div>
        <div className="inline-actions">
          <button className="btn ghost" type="button" onClick={() => onEditarCliente(cliente)}>Editar cliente</button>
          <button className="btn primary" type="button" onClick={() => onNovaOportunidade(cliente.id)}>Nova oportunidade</button>
        </div>
      </div>

      <div className="detail-head client-detail-head">
        <div><span>Razão social</span><strong>{cliente.razaoSocial || '-'}</strong></div>
        <div><span>CNPJ</span><strong>{cliente.cnpj || '-'}</strong></div>
        <div><span>Contato</span><strong>{cliente.contato || '-'}</strong></div>
        <div><span>Telefone</span><strong>{cliente.telefone || '-'}</strong></div>
        <div><span>E-mail</span><strong>{cliente.email || '-'}</strong></div>
        <div><span>Segmento</span><strong>{cliente.segmento || '-'}</strong></div>
        <div><span>Cidade/UF</span><strong>{cliente.cidade || '-'} / {cliente.estado || '-'}</strong></div>
        <div><span>Status</span><strong>{cliente.status || '-'}</strong></div>
        <div><span>Última atualização</span><strong>{dataBR(String(cliente.atualizadoEm || cliente.updatedAt || '').slice(0, 10)) || '-'}</strong></div>
      </div>

      <div className="section-title-row compact-title-row">
        <div>
          <h2>Oportunidades abertas deste cliente</h2>
          <p className="muted">Vendedores visualizam somente as próprias oportunidades. Administrador visualiza todas.</p>
        </div>
      </div>

      <div className="table-wrap clean-table client-opps-table compact-table">
        <table>
          <thead>
            <tr><th>Oportunidade</th><th>Etapa</th><th>Valor</th><th>Previsão</th><th>Temperatura</th><th>Responsável</th><th>Última atualização</th><th>Acesso</th></tr>
          </thead>
          <tbody>
            {(cliente.oportunidades || []).map((op) => (
              <tr key={op.id}>
                <td><strong>{op.titulo}</strong><br /><small>{op.descricao || 'Sem descrição'}</small></td>
                <td><span className="pill">{op.etapa}</span></td>
                <td>{op.valorProposta ? moeda(op.valorProposta) : '-'}</td>
                <td>{dataBR(op.previsaoFechamento)}</td>
                <td>{op.temperatura || '-'}</td>
                <td>{op.vendedor?.nome || '-'}</td>
                <td>{dataBR(String(op.atualizadoEm || '').slice(0, 10))}</td>
                <td><button className="btn ghost small" type="button" onClick={() => onAbrirOportunidade(op.id)}>Abrir</button></td>
              </tr>
            ))}
            {(cliente.oportunidades || []).length === 0 && (
              <tr><td colSpan={ehAdmin ? 10 : 9} className="empty-row">Nenhuma oportunidade aberta visível para este usuário.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="section-title-row compact-title-row">
        <div>
          <h2>Atividades registradas</h2>
          <p className="muted">Últimos contatos, ações e follow-ups do relacionamento comercial.</p>
        </div>
      </div>
      <div className="activity-history-list compact-history">
        {(cliente.atividades || []).slice(0, 12).map((a) => (
          <div className="history-item" key={a.id}>
            <strong>{a.tipo} • {dataBR(a.data)}{a.hora ? ` às ${a.hora}` : ''}</strong>
            <p>{a.resumo || a.observacoes || 'Sem resumo.'}</p>
            <small>{a.responsavel?.nome || a.responsavelNome || '-'} {a.etapaApos ? `• Etapa: ${a.etapaApos}` : ''}</small>
          </div>
        ))}
        {(cliente.atividades || []).length === 0 && <div className="empty-row">Nenhuma atividade registrada para este cliente.</div>}
      </div>
    </Modal>
  )
}

function ClienteModal({ cliente, usuarios, usuario, onClose, onSaved }) {
  const [form, setForm] = useState(cliente || { razaoSocial: '', nomeFantasia: '', cnpj: '', segmento: '', cidade: '', estado: '', contato: '', telefone: '', email: '', status: 'Prospect', potencial: 'Médio', vendedorId: usuario.id, observacoes: '' })
  async function salvar(e) {
    e.preventDefault()
    const method = cliente ? 'PUT' : 'POST'
    const path = cliente ? `/clientes/${cliente.id}` : '/clientes'
    try { await request(path, { method, body: JSON.stringify(form) }); onSaved() } catch (err) { alert(err.message) }
  }
  return (
    <Modal title={cliente ? 'Editar cliente' : 'Novo cliente'} onClose={onClose}>
      <form className="form-grid" onSubmit={salvar}>
        <label>Nome fantasia<input value={form.nomeFantasia || ''} onChange={(e) => setForm({ ...form, nomeFantasia: e.target.value })} /></label>
        <label>Razão social<input value={form.razaoSocial || ''} onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })} /></label>
        <label>CNPJ<input value={form.cnpj || ''} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} /></label>
        <label>Segmento<input value={form.segmento || ''} onChange={(e) => setForm({ ...form, segmento: e.target.value })} /></label>
        <label>Cidade<input value={form.cidade || ''} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></label>
        <label>Estado<input value={form.estado || ''} onChange={(e) => setForm({ ...form, estado: e.target.value })} /></label>
        <label>Contato<input value={form.contato || ''} onChange={(e) => setForm({ ...form, contato: e.target.value })} /></label>
        <label>Telefone<input value={form.telefone || ''} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></label>
        <label>E-mail<input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Status<select value={form.status || 'Prospect'} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUS_CLIENTE.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Potencial<select value={form.potencial || 'Médio'} onChange={(e) => setForm({ ...form, potencial: e.target.value })}>{POTENCIAIS.map((p) => <option key={p}>{p}</option>)}</select></label>
        {usuario.perfil === 'Administrador' && <label>Vendedor<select value={form.vendedorId || ''} onChange={(e) => setForm({ ...form, vendedorId: e.target.value })}>{usuarios.filter((u) => u.ativo).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></label>}
        <label className="span2">Observações<textarea value={form.observacoes || ''} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></label>
        <div className="actions span2"><button className="btn ghost" type="button" onClick={onClose}>Cancelar</button><button className="btn primary">Salvar</button></div>
      </form>
    </Modal>
  )
}

function Atividades() {
  const [atividades, setAtividades] = useState([])
  const [filtros, setFiltros] = useState({ q: '', tipo: '', etapa: '', dataInicio: '', dataFim: '' })
  useEffect(() => { carregar() }, [])
  async function carregar() {
    const params = new URLSearchParams()
    Object.entries(filtros).forEach(([k, v]) => { if (v) params.set(k, v) })
    request(`/atividades${params.toString() ? `?${params.toString()}` : ''}`).then(setAtividades).catch((e) => alert(e.message))
  }
  function limpar() {
    setFiltros({ q: '', tipo: '', etapa: '', dataInicio: '', dataFim: '' })
    setTimeout(() => request('/atividades').then(setAtividades).catch((e) => alert(e.message)), 0)
  }
  return (
    <section>
      <PageHeader title="Atividades" subtitle="Consulta do histórico comercial por cliente, oportunidade, responsável, tipo, etapa e período" />
      <div className="filters-panel">
        <input placeholder="Buscar no histórico: cliente, oportunidade, resumo ou responsável..." value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && carregar()} />
        <select value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}><option value="">Todos os tipos</option>{TIPOS_ATIVIDADE.map((t) => <option key={t}>{t}</option>)}</select>
        <select value={filtros.etapa} onChange={(e) => setFiltros({ ...filtros, etapa: e.target.value })}><option value="">Todas as etapas</option>{ETAPAS.map((e) => <option key={e}>{e}</option>)}</select>
        <input type="date" value={filtros.dataInicio} onChange={(e) => setFiltros({ ...filtros, dataInicio: e.target.value })} />
        <input type="date" value={filtros.dataFim} onChange={(e) => setFiltros({ ...filtros, dataFim: e.target.value })} />
        <button className="btn primary" onClick={carregar}>Filtrar</button>
        <button className="btn ghost" onClick={limpar}>Limpar</button>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Oportunidade</th><th>Tipo</th><th>Resumo</th><th>Etapa</th><th>Responsável</th></tr></thead><tbody>{atividades.map((a) => <tr key={a.id}><td>{dataBR(a.data)}</td><td>{a.cliente?.nomeFantasia}</td><td>{a.oportunidade?.titulo || '-'}</td><td>{a.tipo}</td><td>{a.resumo || '-'}</td><td>{a.etapaApos || '-'}</td><td>{a.responsavel?.nome || '-'}</td></tr>)}</tbody></table></div>
    </section>
  )
}


function numeroRelatorio(valor) {
  const n = Number(valor || 0)
  return Number.isFinite(n) ? n : 0
}

function percentualRelatorio(valor) {
  return `${numeroRelatorio(valor).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

function csvEscapeRelatorio(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  return `"${texto.replace(/"/g, '""')}"`
}

function baixarCSVRelatorio(nomeArquivo, linhas, colunas) {
  const header = colunas.map((c) => csvEscapeRelatorio(c.label)).join(';')
  const body = linhas.map((linha) => colunas.map((c) => csvEscapeRelatorio(typeof c.value === 'function' ? c.value(linha) : linha[c.value])).join(';')).join('\n')
  const csv = `\uFEFF${header}\n${body}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function MiniBarChartRelatorio({ title, data, valueKey = 'total', money = false, percent = false }) {
  const max = Math.max(...(data || []).map((d) => numeroRelatorio(d[valueKey])), 1)
  return (
    <div className="report-chart">
      <h3>{title}</h3>
      {(data || []).length === 0 && <p className="muted">Sem dados para os filtros aplicados.</p>}
      {(data || []).map((item) => {
        const val = numeroRelatorio(item[valueKey])
        return (
          <div className="chart-row" key={item.nome}>
            <span>{item.nome}</span>
            <div className="chart-track"><div className="chart-fill" style={{ width: `${Math.max(4, (val / max) * 100)}%` }} /></div>
            <strong>{money ? moeda(val) : percent ? percentualRelatorio(val) : val}</strong>
          </div>
        )
      })}
    </div>
  )
}


function Relatorios({ usuario }) {
  const [data, setData] = useState(null)
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [detalhe, setDetalhe] = useState(null)
  const [filtros, setFiltros] = useState({ vendedorId: '', etapa: '', status: '', temperatura: '', dataInicio: '', dataFim: '', q: '' })

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setErro('')
    setLoading(true)
    try {
      const params = new URLSearchParams()
      Object.entries(filtros).forEach(([k, v]) => { if (v) params.set(k, v) })
      setData(await request(`/relatorios${params.toString() ? `?${params.toString()}` : ''}`))
    } catch (err) {
      setErro(err.message)
    } finally {
      setLoading(false)
    }
  }

  function limpar() {
    const limpo = { vendedorId: '', etapa: '', status: '', temperatura: '', dataInicio: '', dataFim: '', q: '' }
    setFiltros(limpo)
    setTimeout(() => carregar(), 0)
  }

  function abrirDetalhe(title, value, type, items) {
    setDetalhe({ title, value, type, items: items || [] })
  }

  function exportarOportunidades() {
    baixarCSVRelatorio('relatorio_oportunidades.csv', data?.oportunidades || [], [
      { label: 'Cliente', value: (o) => o.cliente?.nomeFantasia || o.cliente?.razaoSocial || '' },
      { label: 'Oportunidade', value: 'titulo' },
      { label: 'Etapa', value: 'etapa' },
      { label: 'Status', value: 'status' },
      { label: 'Temperatura', value: 'temperatura' },
      { label: 'Valor', value: (o) => numeroRelatorio(o.valorProposta).toFixed(2).replace('.', ',') },
      { label: 'Forecast ponderado', value: (o) => numeroRelatorio(o.forecastPonderado).toFixed(2).replace('.', ',') },
      { label: 'Previsão fechamento', value: (o) => dataBR(o.previsaoFechamento) },
      { label: 'Vendedor', value: (o) => o.vendedor?.nome || '' },
      { label: 'Última atualização', value: (o) => dataBR(o.atualizadoEm) }
    ])
  }

  function exportarAtividades() {
    baixarCSVRelatorio('relatorio_atividades.csv', data?.atividades || [], [
      { label: 'Data', value: (a) => dataBR(a.data) },
      { label: 'Cliente', value: (a) => a.cliente?.nomeFantasia || a.cliente?.razaoSocial || '' },
      { label: 'Oportunidade', value: (a) => a.oportunidade?.titulo || '' },
      { label: 'Tipo', value: 'tipo' },
      { label: 'Resumo', value: 'resumo' },
      { label: 'Etapa após', value: 'etapaApos' },
      { label: 'Responsável', value: (a) => a.responsavel?.nome || '' }
    ])
  }

  function exportarClientes() {
    baixarCSVRelatorio('relatorio_clientes_estrategico.csv', data?.clientes || [], [
      { label: 'Nome fantasia', value: 'nomeFantasia' },
      { label: 'Razão social', value: 'razaoSocial' },
      { label: 'Contato', value: 'contato' },
      { label: 'Telefone', value: 'telefone' },
      { label: 'E-mail', value: 'email' },
      { label: 'Segmento', value: 'segmento' },
      { label: 'Cidade', value: 'cidade' },
      { label: 'UF', value: 'estado' },
      { label: 'Status', value: 'statusAtual' },
      { label: 'Proprietário', value: 'vendedorResponsavelAtual' },
      { label: 'Oportunidades abertas', value: 'oportunidadesAbertas' },
      { label: 'Valor negociado', value: (c) => numeroRelatorio(c.valorTotalNegociado).toFixed(2).replace('.', ',') },
      { label: 'Última atualização', value: (c) => dataBR(c.atualizadoEm) }
    ])
  }

  function exportarRanking() {
    baixarCSVRelatorio('relatorio_ranking_vendedores.csv', data?.ranking || [], [
      { label: 'Vendedor', value: 'vendedor' },
      { label: 'Clientes ativos', value: 'clientesAtivos' },
      { label: 'Oportunidades abertas', value: 'oportunidadesAbertas' },
      { label: 'Propostas enviadas', value: 'propostasEnviadas' },
      { label: 'Valor em propostas', value: (r) => numeroRelatorio(r.valorEmPropostas).toFixed(2).replace('.', ',') },
      { label: 'Forecast ponderado', value: (r) => numeroRelatorio(r.forecastPonderado).toFixed(2).replace('.', ',') },
      { label: 'Atividades realizadas', value: 'atividadesRealizadas' },
      { label: 'Taxa conversão', value: (r) => `${r.taxaConversao || 0}%` },
      { label: 'Ticket médio', value: (r) => numeroRelatorio(r.ticketMedio).toFixed(2).replace('.', ',') }
    ])
  }

  const cards = data?.cards || {}
  const funil = data?.funilAnalitico || []
  const forecastTemperatura = data?.forecastTemperatura || []
  const ranking = data?.ranking || []
  const criticas = data?.criticas || []
  const clientesAnalise = data?.clientesAnalise || {}
  const atividadesAnalise = data?.atividadesAnalise || {}

  const kpis = [
    { key: 'receita', title: 'Receita em negociação', value: moeda(cards.receitaNegociacao), helper: 'Pipeline com valor comercial', type: 'oportunidades', items: data?.detalhes?.receitaNegociacao || [] },
    { key: 'forecast', title: 'Forecast ponderado', value: moeda(cards.forecastPonderado), helper: 'Valor ajustado por temperatura', type: 'oportunidades', items: data?.detalhes?.forecastPonderado || [] },
    { key: 'propostas', title: 'Propostas enviadas', value: cards.propostasEnviadas || 0, helper: 'Etapas com proposta/negociação', type: 'oportunidades', items: data?.detalhes?.propostasEnviadas || [] },
    { key: 'abertas', title: 'Oportunidades abertas', value: cards.oportunidadesAbertas || 0, helper: 'Cards em andamento', type: 'oportunidades', items: data?.detalhes?.oportunidadesAbertas || [] },
    { key: 'conversao', title: 'Taxa de conversão', value: `${cards.taxaConversao || 0}%`, helper: 'Ganhas sobre encerradas', type: 'oportunidades', items: data?.detalhes?.conversao || [] },
    { key: 'ticket', title: 'Ticket médio proposta', value: moeda(cards.ticketMedioProposta), helper: 'Média das oportunidades com valor', type: 'oportunidades', items: data?.detalhes?.propostasEnviadas || [] },
    { key: 'ciclo', title: 'Ciclo médio', value: `${cards.cicloMedioDias || 0} dias`, helper: 'Criação até fechamento', type: 'oportunidades', items: data?.detalhes?.cicloMedio || [] },
    { key: 'atividades', title: 'Atividades no período', value: cards.atividadesPeriodo || 0, helper: 'Volume comercial executado', type: 'atividades', items: data?.atividades || [] }
  ]

  return (
    <section className="relatorios-executivos">
      <PageHeader
        title="Relatórios Analíticos"
        subtitle="Análise executiva de funil, forecast, esforço comercial, carteira e oportunidades críticas"
        action={<div className="report-actions"><button className="btn ghost" onClick={exportarOportunidades}>Exportar oportunidades</button><button className="btn ghost" onClick={exportarAtividades}>Exportar atividades</button><button className="btn ghost" onClick={exportarClientes}>Exportar clientes</button><button className="btn primary" onClick={exportarRanking}>Exportar ranking</button></div>}
      />

      <div className="report-filter-panel">
        {usuario.perfil === 'Administrador' && (
          <label>Vendedor
            <select value={filtros.vendedorId} onChange={(e) => setFiltros({ ...filtros, vendedorId: e.target.value })}>
              <option value="">Todos</option>
              {(data?.filtros?.vendedores || []).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </label>
        )}
        <label>Etapa
          <select value={filtros.etapa} onChange={(e) => setFiltros({ ...filtros, etapa: e.target.value })}>
            <option value="">Todas</option>
            {(data?.filtros?.etapas || ETAPAS).map((e) => <option key={e}>{e}</option>)}
          </select>
        </label>
        <label>Status
          <select value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}>
            <option value="">Todos</option>
            {(data?.filtros?.status || ['Aberta', 'Encerrada']).map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>Temperatura
          <select value={filtros.temperatura} onChange={(e) => setFiltros({ ...filtros, temperatura: e.target.value })}>
            <option value="">Todas</option>
            {(data?.filtros?.temperaturas || TEMPERATURAS).map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label>Início<input type="date" value={filtros.dataInicio} onChange={(e) => setFiltros({ ...filtros, dataInicio: e.target.value })} /></label>
        <label>Fim<input type="date" value={filtros.dataFim} onChange={(e) => setFiltros({ ...filtros, dataFim: e.target.value })} /></label>
        <label className="report-search">Busca<input placeholder="Cliente, oportunidade, contato..." value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} /></label>
        <div className="report-filter-buttons">
          <button className="btn primary" onClick={carregar} disabled={loading}>{loading ? 'Carregando...' : 'Aplicar'}</button>
          <button className="btn ghost" onClick={limpar}>Limpar</button>
        </div>
      </div>

      {erro && <div className="alert error">{erro}</div>}
      {!data && !erro && <div className="loading">Carregando relatórios...</div>}

      {data && (
        <>
          <div className="report-kpi-grid">
            {kpis.map((card) => (
              <button className="report-kpi-card" key={card.key} onClick={() => abrirDetalhe(card.title, card.value, card.type, card.items)}>
                <span>{card.title}</span>
                <strong>{card.value}</strong>
                <small>{card.helper}</small>
              </button>
            ))}
          </div>

          <div className="report-grid-main">
            <div className="panel report-panel report-span-2">
              <div className="panel-title-row"><div><h2>Análise de funil</h2><p>Quantidade, valor, participação e tempo parado por etapa</p></div></div>
              <div className="table-wrap compact-table report-table">
                <table>
                  <thead><tr><th>Etapa</th><th>Qtd.</th><th>Valor total</th><th>Valor médio</th><th>% Funil</th><th>Dias parado</th><th>Últ. atividade</th></tr></thead>
                  <tbody>
                    {funil.map((e) => (
                      <tr key={e.etapa} onClick={() => abrirDetalhe(e.etapa, e.total, 'oportunidades', e.items)} className="click-row">
                        <td><strong>{e.etapa}</strong></td><td>{e.total}</td><td>{moeda(e.valorTotal)}</td><td>{moeda(e.valorMedio)}</td><td>{e.percentualFunil}%</td><td>{e.diasMediosParado}d</td><td>{e.ultimaAtividadeMediaDias}d</td>
                      </tr>
                    ))}
                    {!funil.length && <tr><td colSpan="7" className="empty-row">Sem oportunidades no período.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel report-panel">
              <div className="panel-title-row"><div><h2>Forecast por temperatura</h2><p>Probabilidade comercial ponderada</p></div></div>
              <div className="forecast-list">
                {forecastTemperatura.map((t) => (
                  <button key={t.temperatura} onClick={() => abrirDetalhe(`Temperatura ${t.temperatura}`, moeda(t.valorTotal), 'oportunidades', t.items)}>
                    <div><strong>{t.temperatura}</strong><span>{t.total} oportunidade(s) • prob. {t.probabilidade}%</span></div>
                    <b>{moeda(t.forecast)}</b>
                  </button>
                ))}
                {!forecastTemperatura.length && <p className="muted">Sem propostas com temperatura informada.</p>}
              </div>
            </div>
          </div>

          <div className="report-grid-main">
            <div className="panel report-panel">
              <div className="panel-title-row"><div><h2>Ranking comercial</h2><p>Performance por vendedor</p></div></div>
              <div className="table-wrap compact-table report-table">
                <table>
                  <thead><tr><th>Vendedor</th><th>Abertas</th><th>Propostas</th><th>Valor</th><th>Forecast</th><th>Ativ.</th><th>Conv.</th></tr></thead>
                  <tbody>
                    {ranking.map((r) => (
                      <tr key={r.vendedorId || r.vendedor}>
                        <td><strong>{r.vendedor}</strong><br /><small>{r.clientesAtivos || 0} cliente(s) ativo(s)</small></td>
                        <td>{r.oportunidadesAbertas}</td><td>{r.propostasEnviadas}</td><td>{moeda(r.valorEmPropostas)}</td><td>{moeda(r.forecastPonderado)}</td><td>{r.atividadesRealizadas}</td><td>{r.taxaConversao}%</td>
                      </tr>
                    ))}
                    {!ranking.length && <tr><td colSpan="7" className="empty-row">Sem dados para ranking.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel report-panel">
              <div className="panel-title-row"><div><h2>Oportunidades críticas</h2><p>Riscos e pendências que exigem ação</p></div></div>
              <div className="critical-list">
                {criticas.map((c) => (
                  <button key={c.key} className={c.severidade || ''} onClick={() => abrirDetalhe(c.title, c.total, c.type || 'oportunidades', c.items)}>
                    <div><strong>{c.title}</strong><span>{c.descricao}</span></div>
                    <b>{c.total}</b>
                  </button>
                ))}
                {!criticas.length && <p className="muted">Nenhum ponto crítico encontrado.</p>}
              </div>
            </div>
          </div>

          <div className="report-grid-main">
            <div className="panel report-panel">
              <div className="panel-title-row"><div><h2>Clientes — análise estratégica</h2><p>Resumo da carteira sem listar toda a base</p></div></div>
              <div className="client-strategy-grid">
                <button onClick={() => abrirDetalhe('Clientes com oportunidade aberta', clientesAnalise.comOportunidadeAberta || 0, 'clientes', data?.detalhes?.clientesComOportunidadeAberta || [])}><span>Com oportunidade</span><strong>{clientesAnalise.comOportunidadeAberta || 0}</strong></button>
                <button onClick={() => abrirDetalhe('Clientes sem oportunidade aberta', clientesAnalise.semOportunidadeAberta || 0, 'clientes', data?.detalhes?.clientesSemOportunidadeAberta || [])}><span>Sem oportunidade</span><strong>{clientesAnalise.semOportunidadeAberta || 0}</strong></button>
                <button onClick={() => abrirDetalhe('Clientes ativos', clientesAnalise.ativos || 0, 'clientes', data?.detalhes?.clientesAtivos || [])}><span>Ativos</span><strong>{clientesAnalise.ativos || 0}</strong></button>
                <button onClick={() => abrirDetalhe('Clientes perdidos/inativos', clientesAnalise.perdidosInativos || 0, 'clientes', data?.detalhes?.clientesPerdidosInativos || [])}><span>Perdidos/Inativos</span><strong>{clientesAnalise.perdidosInativos || 0}</strong></button>
                <button onClick={() => abrirDetalhe('Novos clientes no período', clientesAnalise.novosPeriodo || 0, 'clientes', data?.detalhes?.clientesNovosPeriodo || [])}><span>Novos período</span><strong>{clientesAnalise.novosPeriodo || 0}</strong></button>
                <button onClick={() => abrirDetalhe('Clientes com follow-up vencido', clientesAnalise.followupVencido || 0, 'clientes', data?.detalhes?.clientesFollowupVencido || [])}><span>Follow-up vencido</span><strong>{clientesAnalise.followupVencido || 0}</strong></button>
              </div>
              <div className="segment-list">
                <h3>Top segmentos</h3>
                {(clientesAnalise.porSegmento || []).slice(0, 6).map((s) => <div key={s.segmento}><span>{s.segmento}</span><strong>{s.total}</strong></div>)}
              </div>
            </div>

            <div className="panel report-panel">
              <div className="panel-title-row"><div><h2>Atividades comerciais</h2><p>Esforço comercial por tipo e por vendedor</p></div></div>
              <div className="activity-analytics">
                <div>
                  <h3>Por tipo</h3>
                  {(atividadesAnalise.porTipo || []).slice(0, 7).map((a) => <button key={a.tipo} onClick={() => abrirDetalhe(a.tipo, a.total, 'atividades', a.items)}><span>{a.tipo}</span><strong>{a.total}</strong></button>)}
                </div>
                <div>
                  <h3>Por vendedor</h3>
                  {(atividadesAnalise.porVendedor || []).slice(0, 7).map((a) => <button key={a.vendedor}><span>{a.vendedor}</span><strong>{a.total}</strong></button>)}
                </div>
              </div>
            </div>
          </div>

          <div className="panel report-panel">
            <div className="panel-title-row"><div><h2>Últimas atividades relevantes</h2><p>Movimentos recentes filtrados no período</p></div></div>
            <div className="table-wrap compact-table report-table">
              <table>
                <thead><tr><th>Data</th><th>Cliente</th><th>Tipo</th><th>Resumo</th><th>Etapa após</th><th>Responsável</th></tr></thead>
                <tbody>
                  {(atividadesAnalise.ultimas || []).slice(0, 12).map((a) => (
                    <tr key={a.id}><td>{dataBR(a.data)}</td><td>{a.cliente?.nomeFantasia || a.cliente?.razaoSocial || '-'}</td><td><strong>{a.tipo}</strong></td><td>{a.resumo || a.observacoes || '-'}</td><td>{a.etapaApos || '-'}</td><td>{a.responsavel?.nome || '-'}</td></tr>
                  ))}
                  {!(atividadesAnalise.ultimas || []).length && <tr><td colSpan="6" className="empty-row">Sem atividades no período.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {detalhe && <RelatorioDetalheModal data={detalhe} onClose={() => setDetalhe(null)} />}
    </section>
  )
}

function RelatorioDetalheModal({ data, onClose }) {
  const items = data.items || []
  return (
    <Modal title={`${data.title} — ${data.value}`} onClose={onClose} wide>
      {items.length === 0 && <p className="muted">Nenhum registro encontrado para este indicador.</p>}
      {items.length > 0 && (
        <div className="table-wrap compact-table report-detail-table">
          <table>
            <thead>
              <tr>
                {data.type === 'clientes' ? <><th>Cliente</th><th>Contato</th><th>Telefone</th><th>Segmento</th><th>Proprietário</th><th>Status</th></> : data.type === 'atividades' ? <><th>Data</th><th>Cliente</th><th>Tipo</th><th>Resumo</th><th>Responsável</th></> : <><th>Cliente</th><th>Oportunidade</th><th>Etapa</th><th>Valor</th><th>Temperatura</th><th>Responsável</th></>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => data.type === 'clientes' ? (
                <tr key={item.id}><td><strong>{item.nomeFantasia || item.razaoSocial}</strong><br /><small>{item.razaoSocial}</small></td><td>{item.contato || '-'}</td><td>{item.telefone || '-'}</td><td>{item.segmento || '-'}</td><td>{item.vendedor?.nome || item.vendedorNome || item.vendedorResponsavelAtual || '-'}</td><td>{item.status || item.statusAtual || '-'}</td></tr>
              ) : data.type === 'atividades' ? (
                <tr key={item.id}><td>{dataBR(item.data)}</td><td>{item.cliente?.nomeFantasia || item.cliente?.razaoSocial || '-'}</td><td><strong>{item.tipo}</strong></td><td>{item.resumo || item.observacoes || '-'}</td><td>{item.responsavel?.nome || '-'}</td></tr>
              ) : (
                <tr key={item.id}><td>{item.cliente?.nomeFantasia || item.cliente?.razaoSocial || '-'}</td><td><strong>{item.titulo}</strong></td><td>{item.etapa}</td><td>{moeda(item.valorProposta)}</td><td>{item.temperatura || '-'}</td><td>{item.vendedor?.nome || '-'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}


function Usuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [modal, setModal] = useState(null)
  useEffect(() => { carregar() }, [])
  async function carregar() { setUsuarios(await request('/usuarios')) }
  async function inativar(id) {
    if (!confirm('Inativar este usuário?')) return
    await request(`/usuarios/${id}`, { method: 'DELETE' })
    carregar()
  }
  return (
    <section>
      <PageHeader title="Usuários" subtitle="Gestão de vendedores e administradores" action={<button className="btn primary" onClick={() => setModal({})}>Novo usuário</button>} />
      <div className="table-wrap"><table><thead><tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Status</th><th></th></tr></thead><tbody>{usuarios.map((u) => <tr key={u.id}><td>{u.nome}</td><td>{u.usuario}</td><td>{u.perfil}</td><td>{u.ativo ? 'Ativo' : 'Inativo'}</td><td><button className="btn ghost" onClick={() => setModal(u)}>Editar</button>{u.ativo && <button className="btn danger" onClick={() => inativar(u.id)}>Inativar</button>}</td></tr>)}</tbody></table></div>
      {modal && <UsuarioModal usuario={modal.id ? modal : null} onClose={() => setModal(null)} onSaved={() => { setModal(null); carregar() }} />}
    </section>
  )
}

function UsuarioModal({ usuario, onClose, onSaved }) {
  const [form, setForm] = useState(usuario || { nome: '', usuario: '', email: '', senha: '', perfil: 'Vendedor', ativo: true })
  async function salvar(e) {
    e.preventDefault()
    const method = usuario ? 'PUT' : 'POST'
    const path = usuario ? `/usuarios/${usuario.id}` : '/usuarios'
    try { await request(path, { method, body: JSON.stringify(form) }); onSaved() } catch (err) { alert(err.message) }
  }
  return (
    <Modal title={usuario ? 'Editar usuário' : 'Novo usuário'} onClose={onClose}>
      <form className="form-grid" onSubmit={salvar}>
        <label>Nome<input value={form.nome || ''} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></label>
        {!usuario && <label>Login<input value={form.usuario || ''} onChange={(e) => setForm({ ...form, usuario: e.target.value })} /></label>}
        <label>E-mail<input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Perfil<select value={form.perfil || 'Vendedor'} onChange={(e) => setForm({ ...form, perfil: e.target.value })}><option>Administrador</option><option>Vendedor</option></select></label>
        <label>Nova senha<input type="password" value={form.senha || ''} onChange={(e) => setForm({ ...form, senha: e.target.value })} placeholder={usuario ? 'Deixe em branco para manter' : ''} /></label>
        <label>Status<select value={String(form.ativo)} onChange={(e) => setForm({ ...form, ativo: e.target.value === 'true' })}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
        <div className="actions span2"><button className="btn ghost" type="button" onClick={onClose}>Cancelar</button><button className="btn primary">Salvar</button></div>
      </form>
    </Modal>
  )
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-backdrop">
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-head"><h2>{title}</h2><button onClick={onClose}>×</button></div>
        {children}
      </div>
    </div>
  )
}

function App() {
  const [usuario, setUsuario] = useState(() => {
    try { return JSON.parse(localStorage.getItem('visitas_user')) } catch { return null }
  })
  const [erroSessao, setErroSessao] = useState('')
  useEffect(() => {
    const handler = () => { setUsuario(null); setErroSessao('Sessão inválida ou expirada.') }
    window.addEventListener('visitas-auth-expirada', handler)
    return () => window.removeEventListener('visitas-auth-expirada', handler)
  }, [])
  function sair() { limparSessao(); setUsuario(null) }
  if (!usuario) return <><Login onLogin={(u) => { setErroSessao(''); setUsuario(u) }} />{erroSessao && <div className="session-alert">{erroSessao}</div>}</>
  return <Shell usuario={usuario} onLogout={sair} />
}

createRoot(document.getElementById('root')).render(<App />)
