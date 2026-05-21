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


async function baixarArquivoAutenticado(path, nomeArquivo) {
  const token = localStorage.getItem('visitas_token')
  const res = await fetch(`${API}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.erro || 'Erro ao baixar arquivo.')
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function arquivoParaBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',').pop())
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
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
    ['dashboard', 'Dashboard'],
    ['kanban', 'Kanban Comercial'],
    ['clientes', 'Clientes'],
    ['atividades', 'Atividades'],
    ['relatorios', 'Relatórios'],
    ...(usuario.perfil === 'Administrador' ? [['usuarios', 'Usuários']] : [])
  ]
  return (
    <div className={`app-shell ${menuAberto ? '' : 'menu-collapsed'}`}>
      <aside className="sidebar">
        <button className="sidebar-toggle" type="button" onClick={() => setMenuAberto(!menuAberto)} title={menuAberto ? 'Ocultar menu' : 'Exibir menu'}>{menuAberto ? '‹' : '›'}</button>
        <div className="logo-row"><span className="logo">VC</span><strong>Controle Comercial</strong></div>
        <nav>
          {menus.map(([id, label]) => (
            <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}>{label}</button>
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
    { key: 'clientes', title: 'Clientes', value: data.cards.clientes, items: data.clientesLista || [], type: 'clientes' },
    { key: 'abertas', title: 'Oportunidades abertas', value: data.cards.oportunidadesAbertas, items: data.oportunidadesAbertasLista || [], type: 'oportunidades' },
    { key: 'propostas', title: 'Propostas enviadas', value: data.cards.propostasEnviadas, items: data.propostasLista || [], type: 'propostas' },
    { key: 'valor', title: 'Valor em propostas', value: moeda(data.cards.valorPropostas), items: data.propostasLista || [], type: 'propostas' }
  ]

  return (
    <section>
      <PageHeader title="Dashboard" subtitle="Visão geral da operação comercial" />
      <div className="metric-grid">
        {cards.map((card) => <Metric key={card.key} title={card.title} value={card.value} onClick={() => setModal(card)} />)}
      </div>
      <div className="two-col">
        <div className="panel">
          <h2>Funil por etapa</h2>
          {data.porEtapa.map((e) => <button className="bar-line clickable-line" key={e.etapa} onClick={() => setModal({ title: e.etapa, value: e.total, type: 'oportunidades', items: (data.oportunidadesPorEtapa || {})[e.etapa] || [] })}><span>{e.etapa}</span><strong>{e.total}</strong></button>)}
        </div>
        <div className="panel">
          <h2>Últimas atividades</h2>
          {data.atividades.length === 0 && <p className="muted">Nenhuma atividade registrada.</p>}
          {data.atividades.map((a) => (
            <div className="mini-item" key={a.id}>
              <strong>{a.tipo}</strong>
              <span>{a.cliente?.nomeFantasia || a.cliente?.razaoSocial} • {dataBR(a.data)}</span>
              <small>Responsável: {a.responsavel?.nome || '-'}</small>
            </div>
          ))}
        </div>
      </div>
      {modal && <DashboardDetalheModal data={modal} onClose={() => setModal(null)} />}
    </section>
  )
}

function Metric({ title, value, onClick }) {
  return <button className="metric metric-click" onClick={onClick}><span>{title}</span><strong>{value}</strong><small>Clique para ver detalhes</small></button>
}

function DashboardDetalheModal({ data, onClose }) {
  const items = data.items || []
  return (
    <Modal title={`${data.title} (${data.value})`} onClose={onClose} wide>
      {items.length === 0 && <p className="muted">Nenhum registro encontrado para este indicador.</p>}
      {items.length > 0 && (
        <div className="table-wrap compact-table">
          <table>
            <thead>
              <tr>
                {data.type === 'clientes' ? <><th>Cliente</th><th>Contato</th><th>Telefone</th><th>E-mail</th><th>Vendedor</th></> : <><th>Cliente</th><th>Oportunidade</th><th>Etapa</th><th>Valor</th><th>Responsável</th><th>Próxima ação</th></>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => data.type === 'clientes' ? (
                <tr key={item.id}><td><strong>{item.nomeFantasia}</strong><br /><small>{item.razaoSocial}</small></td><td>{item.contato || '-'}</td><td>{item.telefone || '-'}</td><td>{item.email || '-'}</td><td>{item.vendedor?.nome || item.vendedorNome || '-'}</td></tr>
              ) : (
                <tr key={item.id}><td>{item.cliente?.nomeFantasia || item.cliente?.razaoSocial || '-'}</td><td><strong>{item.titulo}</strong></td><td>{item.etapa}</td><td>{item.etapa === 'Proposta enviada' ? moeda(item.valorProposta) : '-'}</td><td>{item.vendedor?.nome || '-'}</td><td>{item.proximaAcao || '-'}</td></tr>
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


function Clientes({ usuario }) {
  const [clientes, setClientes] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null)
  const [modalOp, setModalOp] = useState(null)
  const [modalDetalheCliente, setModalDetalheCliente] = useState(null)
  const [modalDetalheOp, setModalDetalheOp] = useState(null)
  const [importando, setImportando] = useState(false)
  const fileImportRef = useRef(null)
  useEffect(() => { carregar() }, [])
  async function carregar() {
    const cls = await request(`/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`)
    setClientes(cls)
    if (usuario.perfil === 'Administrador') setUsuarios(await request('/usuarios'))
  }
  async function excluir(id) {
    if (!confirm('Excluir cliente e histórico relacionado?')) return
    await request(`/clientes/${id}`, { method: 'DELETE' })
    carregar()
  }

  async function baixarModeloClientes() {
    try {
      await baixarArquivoAutenticado('/clientes/modelo-importacao', 'modelo_importacao_clientes.xlsx')
    } catch (err) {
      alert(err.message)
    }
  }

  async function importarClientesArquivo(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setImportando(true)
      const arquivoBase64 = await arquivoParaBase64(file)
      const resultado = await request('/clientes/importar', { method: 'POST', body: JSON.stringify({ arquivoBase64 }) })
      const erros = Array.isArray(resultado.erros) && resultado.erros.length
        ? `\nLinhas com erro: ${resultado.erros.slice(0, 8).map((x) => `linha ${x.linha}: ${x.erro}`).join('; ')}`
        : ''
      alert(`Importação concluída.\nLinhas lidas: ${resultado.lidas || 0}\nCriados: ${resultado.criados || 0}\nAtualizados: ${resultado.atualizados || 0}\nIgnorados: ${resultado.ignorados || 0}${erros}`)
      carregar()
    } catch (err) {
      alert(err.message)
    } finally {
      setImportando(false)
    }
  }

  return (
    <section>
      <PageHeader title="Clientes" subtitle="Cadastro principal da carteira comercial" action={
        <div className="header-actions">
          <button className="btn ghost" onClick={baixarModeloClientes}>Baixar modelo</button>
          <button className="btn ghost" disabled={importando} onClick={() => fileImportRef.current?.click()}>{importando ? 'Importando...' : 'Importar Excel'}</button>
          <button className="btn primary" onClick={() => setModal({})}>Novo cliente</button>
          <input ref={fileImportRef} type="file" accept=".xlsx,.xls,.csv" className="hidden-file" onChange={importarClientesArquivo} />
        </div>
      } />
      <div className="toolbar"><input placeholder="Buscar por nome, CNPJ, cidade, contato..." value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && carregar()} /><button className="btn ghost" onClick={carregar}>Buscar</button></div>
      <div className="table-wrap clients-list">
        <table>
          <thead>
            <tr><th>Nome fantasia</th><th>Contato</th><th>Telefone</th><th>E-mail</th><th>Cidade/UF</th><th>Status</th><th>Vendedor</th><th></th></tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.nomeFantasia}</strong><br /><small>{c.razaoSocial}</small></td>
                <td>{c.contato || '-'}</td>
                <td>{c.telefone || '-'}</td>
                <td>{c.email || '-'}</td>
                <td>{c.cidade || '-'} / {c.estado || '-'}</td>
                <td><span className="pill">{c.status}</span></td>
                <td>{c.vendedorNome || '-'}</td>
                <td className="td-actions">
                  <AcoesMenu>{(close) => <>
                    <button type="button" onClick={() => { close(); setModalDetalheCliente(c.id) }}>Detalhes</button>
                    <button type="button" onClick={() => { close(); setModalOp({ clienteId: c.id }) }}>Nova oportunidade</button>
                    <button type="button" onClick={() => { close(); setModal(c) }}>Editar</button>
                    {usuario.perfil === 'Administrador' && <button type="button" className="danger-text" onClick={() => { close(); excluir(c.id) }}>Excluir</button>}
                  </>}</AcoesMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && <ClienteModal cliente={modal.id ? modal : null} usuarios={usuarios} usuario={usuario} onClose={() => setModal(null)} onSaved={() => { setModal(null); carregar() }} />}
      {modalOp && <OportunidadeModal clientes={clientes} clienteIdInicial={modalOp.clienteId} onClose={() => setModalOp(null)} onSaved={() => { setModalOp(null); carregar() }} />}
      {modalDetalheCliente && <ClienteDetalhe clienteId={modalDetalheCliente} usuario={usuario} onClose={() => setModalDetalheCliente(null)} onNovaOportunidade={(clienteId) => { setModalDetalheCliente(null); setModalOp({ clienteId }) }} onAbrirOportunidade={(opId) => setModalDetalheOp(opId)} />}
      {modalDetalheOp && <DetalheOportunidade opId={modalDetalheOp} usuario={usuario} onClose={() => setModalDetalheOp(null)} onSaved={carregar} />}
    </section>
  )
}

function ClienteDetalhe({ clienteId, usuario, onClose, onNovaOportunidade, onAbrirOportunidade }) {
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
      <div className="detail-head client-detail-head">
        <div><span>Razão social</span><strong>{cliente.razaoSocial || '-'}</strong></div>
        <div><span>Contato</span><strong>{cliente.contato || '-'}</strong></div>
        <div><span>Telefone</span><strong>{cliente.telefone || '-'}</strong></div>
        <div><span>E-mail</span><strong>{cliente.email || '-'}</strong></div>
        <div><span>Cidade/UF</span><strong>{cliente.cidade || '-'} / {cliente.estado || '-'}</strong></div>
        <div><span>Status</span><strong>{cliente.status || '-'}</strong></div>
      </div>

      <div className="section-title-row">
        <div>
          <h2>Oportunidades abertas deste cliente</h2>
          <p className="muted">Vendedores visualizam somente as próprias oportunidades. Administrador visualiza todas.</p>
        </div>
        <button className="btn primary" type="button" onClick={() => onNovaOportunidade(cliente.id)}>Nova oportunidade</button>
      </div>

      <div className="table-wrap clean-table client-opps-table">
        <table>
          <thead>
            <tr><th>Oportunidade</th><th>Etapa</th><th>Valor</th><th>Previsão</th><th>Temperatura</th><th>Responsável</th><th>Última atualização</th><th></th></tr>
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
              <tr><td colSpan="8" className="empty-row">Nenhuma oportunidade aberta visível para este usuário.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

function ClienteModal({ cliente, usuarios, usuario, onClose, onSaved }) {
  const [form, setForm] = useState(cliente || { razaoSocial: '', nomeFantasia: '', cnpj: '', segmento: '', cidade: '', estado: '', contato: '', telefone: '', email: '', origemLead: '', proximoFollowUp: '', status: 'Prospect', potencial: 'Médio', vendedorId: usuario.id, observacoes: '' })
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
        <label>Origem do lead<input value={form.origemLead || ''} onChange={(e) => setForm({ ...form, origemLead: e.target.value })} /></label>
        <label>Próximo follow-up<input type="date" value={form.proximoFollowUp || ''} onChange={(e) => setForm({ ...form, proximoFollowUp: e.target.value })} /></label>
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
  const [filtros, setFiltros] = useState({ vendedorId: '', etapa: '', status: '', temperatura: '', dataInicio: '', dataFim: '', q: '' })
  const [detalhe, setDetalhe] = useState(null)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setErro('')
    setLoading(true)
    try {
      const params = new URLSearchParams()
      Object.entries(filtros).forEach(([k, v]) => { if (v) params.set(k, v) })
      setData(await request(`/relatorios${params.toString() ? `?${params.toString()}` : ''}`))
    } catch (err) { setErro(err.message) }
    finally { setLoading(false) }
  }

  function limpar() {
    setFiltros({ vendedorId: '', etapa: '', status: '', temperatura: '', dataInicio: '', dataFim: '', q: '' })
    setTimeout(() => request('/relatorios').then(setData).catch((err) => setErro(err.message)), 0)
  }

  function exportarOportunidades() {
    baixarCSVRelatorio('oportunidades.csv', data?.oportunidades || [], [
      { label: 'Cliente', value: (o) => o.cliente?.nomeFantasia || o.cliente?.razaoSocial || '' },
      { label: 'Oportunidade', value: 'titulo' },
      { label: 'Vendedor responsável', value: (o) => o.vendedor?.nome || '' },
      { label: 'Etapa', value: 'etapa' },
      { label: 'Status', value: 'status' },
      { label: 'Temperatura', value: 'temperatura' },
      { label: 'Valor', value: (o) => numeroRelatorio(o.valorProposta).toFixed(2).replace('.', ',') },
      { label: 'Previsão de fechamento', value: (o) => dataBR(o.previsaoFechamento) },
      { label: 'Última atividade', value: (o) => o.ultimaAtividade?.tipo || '' },
      { label: 'Atualizado em', value: (o) => dataBR(o.atualizadoEm) }
    ])
  }

  function exportarAtividades() {
    baixarCSVRelatorio('atividades.csv', data?.atividades || [], [
      { label: 'Data', value: (a) => dataBR(a.data) },
      { label: 'Cliente', value: (a) => a.cliente?.nomeFantasia || a.cliente?.razaoSocial || '' },
      { label: 'Oportunidade', value: (a) => a.oportunidade?.titulo || '' },
      { label: 'Tipo', value: 'tipo' },
      { label: 'Resumo', value: 'resumo' },
      { label: 'Etapa após', value: 'etapaApos' },
      { label: 'Valor', value: (a) => numeroRelatorio(a.valorProposta).toFixed(2).replace('.', ',') },
      { label: 'Responsável', value: (a) => a.responsavel?.nome || '' }
    ])
  }

  function exportarClientes() {
    baixarCSVRelatorio('clientes.csv', data?.clientes || [], [
      { label: 'Nome fantasia', value: 'nomeFantasia' },
      { label: 'Razão social', value: 'razaoSocial' },
      { label: 'Contato', value: 'contato' },
      { label: 'Telefone', value: 'telefone' },
      { label: 'E-mail', value: 'email' },
      { label: 'Cidade', value: 'cidade' },
      { label: 'Status atual', value: 'statusAtual' },
      { label: 'Vendedor responsável atual', value: 'vendedorResponsavelAtual' },
      { label: 'Oportunidades abertas', value: (c) => Array.isArray(c.oportunidadesAbertas) ? c.oportunidadesAbertas.length : (c.oportunidadesAbertas || 0) },
      { label: 'Oportunidades encerradas', value: (c) => Array.isArray(c.oportunidadesEncerradas) ? c.oportunidadesEncerradas.length : (c.oportunidadesEncerradas || 0) },
      { label: 'Valor total negociado', value: (c) => numeroRelatorio(c.valorTotalNegociado).toFixed(2).replace('.', ',') }
    ])
  }

  const cards = data?.cards || {}
  const oportunidadesRelatorio = data?.oportunidades || []
  const atividadesRelatorio = data?.atividades || []
  const rankingRelatorio = data?.ranking || []
  const graficosFallback = {
    oportunidadesPorEtapa: ETAPAS.map((etapa) => ({ nome: etapa, total: oportunidadesRelatorio.filter((o) => o.etapa === etapa).length })).filter((e) => e.total > 0),
    valorPorEtapa: ETAPAS.map((etapa) => ({ nome: etapa, valor: oportunidadesRelatorio.filter((o) => o.etapa === etapa).reduce((acc, o) => acc + numeroRelatorio(o.valorProposta), 0) })).filter((e) => e.valor > 0),
    atividadesPorVendedor: rankingRelatorio.map((r) => ({ nome: r.vendedor, total: r.atividadesRealizadas || 0 })).filter((e) => e.total > 0),
    atividadesPorTipo: TIPOS_ATIVIDADE.map((tipo) => ({ nome: tipo, total: atividadesRelatorio.filter((a) => a.tipo === tipo).length })).filter((e) => e.total > 0),
    temperaturaOportunidades: TEMPERATURAS.map((temperatura) => ({ nome: temperatura, total: oportunidadesRelatorio.filter((o) => o.temperatura === temperatura).length })).filter((e) => e.total > 0),
    conversaoPorVendedor: rankingRelatorio.map((r) => ({ nome: r.vendedor, valor: r.taxaConversao || 0 })).filter((e) => e.valor > 0)
  }
  const graficos = Object.fromEntries(Object.entries(graficosFallback).map(([k, fallback]) => {
    const apiData = data?.graficos?.[k]
    return [k, Array.isArray(apiData) && apiData.length ? apiData : fallback]
  }))

  function abrirDetalhe(tipo) {
    if (!data) return
    const mapas = {
      abertas: { titulo: 'Oportunidades abertas', linhas: oportunidadesRelatorio.filter((o) => o.status !== 'Cliente ativo' && o.status !== 'Perdido'), colunas: ['Cliente', 'Oportunidade', 'Vendedor', 'Etapa', 'Temperatura', 'Valor'] },
      encerradas: { titulo: 'Oportunidades encerradas', linhas: oportunidadesRelatorio.filter((o) => o.status === 'Cliente ativo' || o.status === 'Perdido'), colunas: ['Cliente', 'Oportunidade', 'Vendedor', 'Status', 'Valor', 'Última atualização'] },
      valor: { titulo: 'Valor total negociado', linhas: oportunidadesRelatorio.filter((o) => numeroRelatorio(o.valorProposta) > 0), colunas: ['Cliente', 'Oportunidade', 'Vendedor', 'Etapa', 'Valor', 'Previsão'] },
      conversao: { titulo: 'Taxa de conversão por vendedor', linhas: rankingRelatorio, colunas: ['Vendedor', 'Clientes ativos', 'Oportunidades abertas', 'Propostas enviadas', 'Valor em propostas', 'Taxa de conversão'] }
    }
    setDetalhe(mapas[tipo])
  }

  function celulaDetalhe(row, coluna) {
    if (coluna === 'Cliente') return row.cliente?.nomeFantasia || row.nomeFantasia || '-'
    if (coluna === 'Oportunidade') return row.titulo || '-'
    if (coluna === 'Vendedor') return row.vendedor?.nome || row.vendedor || '-'
    if (coluna === 'Etapa') return row.etapa || '-'
    if (coluna === 'Status') return row.status || '-'
    if (coluna === 'Temperatura') return row.temperatura || '-'
    if (coluna === 'Valor' || coluna === 'Valor em propostas') return moeda(row.valorProposta ?? row.valorEmPropostas)
    if (coluna === 'Previsão') return dataBR(row.previsaoFechamento)
    if (coluna === 'Última atualização') return dataBR(row.atualizadoEm)
    if (coluna === 'Clientes ativos') return row.clientesAtivos ?? 0
    if (coluna === 'Oportunidades abertas') return row.oportunidadesAbertas ?? 0
    if (coluna === 'Propostas enviadas') return row.propostasEnviadas ?? 0
    if (coluna === 'Taxa de conversão') return percentualRelatorio(row.taxaConversao || 0)
    return '-'
  }

  return (
    <section>
      <PageHeader title="Relatórios" subtitle="Filtros, gráficos, ranking e exportações da operação comercial" />
      <div className="reports-filters">
        <input placeholder="Buscar cliente, oportunidade, CNPJ, responsável..." value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && carregar()} />
        {usuario.perfil === 'Administrador' && <select value={filtros.vendedorId} onChange={(e) => setFiltros({ ...filtros, vendedorId: e.target.value })}><option value="">Todos os vendedores</option>{(data?.opcoes?.vendedores || []).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}</select>}
        <select value={filtros.etapa} onChange={(e) => setFiltros({ ...filtros, etapa: e.target.value })}><option value="">Todas as etapas</option>{ETAPAS.map((e) => <option key={e}>{e}</option>)}</select>
        <select value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}><option value="">Todos os status</option><option>Aberta</option><option>Encerrada</option><option>Cliente ativo</option><option>Perdido</option></select>
        <select value={filtros.temperatura} onChange={(e) => setFiltros({ ...filtros, temperatura: e.target.value })}><option value="">Todas as temperaturas</option>{TEMPERATURAS.map((t) => <option key={t}>{t}</option>)}</select>
        <input type="date" value={filtros.dataInicio} onChange={(e) => setFiltros({ ...filtros, dataInicio: e.target.value })} />
        <input type="date" value={filtros.dataFim} onChange={(e) => setFiltros({ ...filtros, dataFim: e.target.value })} />
        <button className="btn primary" onClick={carregar} disabled={loading}>{loading ? 'Filtrando...' : 'Filtrar'}</button>
        <button className="btn ghost" onClick={limpar}>Limpar</button>
      </div>
      {erro && <div className="alert error">{erro}</div>}
      {!data && !erro && <div className="loading">Carregando relatórios...</div>}
      {data && <>
        <div className="metric-grid reports-metrics">
          <Metric title="Oportunidades abertas" value={cards.oportunidadesAbertas || 0} onClick={() => abrirDetalhe('abertas')} />
          <Metric title="Oportunidades encerradas" value={cards.oportunidadesEncerradas || 0} onClick={() => abrirDetalhe('encerradas')} />
          <Metric title="Valor total negociado" value={moeda(cards.valorTotalNegociado || 0)} onClick={() => abrirDetalhe('valor')} />
          <Metric title="Taxa de conversão" value={percentualRelatorio(cards.taxaConversao || 0)} onClick={() => abrirDetalhe('conversao')} />
        </div>
        <div className="export-row">
          <button className="btn ghost" onClick={exportarOportunidades}>Exportar oportunidades</button>
          <button className="btn ghost" onClick={exportarAtividades}>Exportar atividades</button>
          <button className="btn ghost" onClick={exportarClientes}>Exportar clientes</button>
        </div>
        <div className="reports-grid">
          <MiniBarChartRelatorio title="Oportunidades por etapa" data={graficos.oportunidadesPorEtapa} />
          <MiniBarChartRelatorio title="Valor por etapa" data={graficos.valorPorEtapa} valueKey="valor" money />
          <MiniBarChartRelatorio title="Atividades por vendedor" data={graficos.atividadesPorVendedor} />
          <MiniBarChartRelatorio title="Atividades por tipo" data={graficos.atividadesPorTipo} />
          <MiniBarChartRelatorio title="Temperatura das oportunidades" data={graficos.temperaturaOportunidades} />
          <MiniBarChartRelatorio title="Conversão por vendedor" data={graficos.conversaoPorVendedor} valueKey="valor" percent />
        </div>
        <div className="panel ranking-panel">
          <h2>Ranking de vendedores</h2>
          <div className="table-wrap compact-table"><table><thead><tr><th>Vendedor</th><th>Clientes ativos</th><th>Oportunidades abertas</th><th>Propostas enviadas</th><th>Valor em propostas</th><th>Atividades realizadas</th><th>Taxa de conversão</th></tr></thead><tbody>{(data.ranking || []).map((r) => <tr key={r.vendedorId}><td><strong>{r.vendedor}</strong></td><td>{r.clientesAtivos}</td><td>{r.oportunidadesAbertas}</td><td>{r.propostasEnviadas}</td><td>{moeda(r.valorEmPropostas)}</td><td>{r.atividadesRealizadas}</td><td>{percentualRelatorio(r.taxaConversao)}</td></tr>)}</tbody></table></div>
        </div>
        <div className="panel">
          <h2>Clientes - visão consolidada</h2>
          <div className="table-wrap compact-table"><table><thead><tr><th>Cliente</th><th>Status atual</th><th>Vendedor responsável da oportunidade</th><th>Oportunidades abertas</th><th>Oportunidades encerradas</th><th>Últimas atividades</th><th>Valor total negociado</th></tr></thead><tbody>{(data.clientes || []).map((c) => <tr key={c.id}><td><strong>{c.nomeFantasia}</strong><br /><small>{c.contato || '-'} • {c.telefone || '-'}</small></td><td>{c.statusAtual}</td><td>{c.vendedorResponsavelAtual || '-'}</td><td>{Array.isArray(c.oportunidadesAbertas) ? c.oportunidadesAbertas.length : (c.oportunidadesAbertas || 0)}</td><td>{Array.isArray(c.oportunidadesEncerradas) ? c.oportunidadesEncerradas.length : (c.oportunidadesEncerradas || 0)}</td><td>{(c.ultimasAtividades || []).slice(0, 2).map((a) => <div key={a.id}><small>{dataBR(a.data)} • {a.tipo}</small></div>)}</td><td>{moeda(c.valorTotalNegociado)}</td></tr>)}</tbody></table></div>
        </div>
        <div className="panel">
          <h2>Oportunidades filtradas</h2>
          <div className="table-wrap compact-table"><table><thead><tr><th>Cliente</th><th>Oportunidade</th><th>Vendedor</th><th>Etapa</th><th>Status</th><th>Temperatura</th><th>Valor</th><th>Previsão</th><th>Última atualização</th></tr></thead><tbody>{(data.oportunidades || []).map((o) => <tr key={o.id}><td>{o.cliente?.nomeFantasia || '-'}</td><td><strong>{o.titulo}</strong></td><td>{o.vendedor?.nome || '-'}</td><td>{o.etapa}</td><td>{o.status}</td><td>{o.temperatura || '-'}</td><td>{moeda(o.valorProposta)}</td><td>{dataBR(o.previsaoFechamento)}</td><td>{dataBR(o.atualizadoEm)}</td></tr>)}</tbody></table></div>
        </div>

        {detalhe && <Modal title={detalhe.titulo} onClose={() => setDetalhe(null)} wide>
          <div className="table-wrap compact-table detail-table"><table><thead><tr>{detalhe.colunas.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{detalhe.linhas.length ? detalhe.linhas.map((linha, idx) => <tr key={linha.id || linha.vendedorId || idx}>{detalhe.colunas.map((c) => <td key={c}>{celulaDetalhe(linha, c)}</td>)}</tr>) : <tr><td colSpan={detalhe.colunas.length}>Sem dados para os filtros aplicados.</td></tr>}</tbody></table></div>
        </Modal>}
      </>}
    </section>
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
