import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Prisma } from '@prisma/client'
import { prisma } from './prisma.js'

const app = express()
const JWT_SECRET = process.env.JWT_SECRET || 'troque-este-segredo-em-producao'
const FRONTEND_URL = process.env.FRONTEND_URL || '*'

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

app.use(cors({
  origin: FRONTEND_URL === '*' ? true : FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(express.json({ limit: '10mb' }))

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}

function signToken(user) {
  return jwt.sign({ id: user.id, perfil: user.perfil }, JWT_SECRET, { expiresIn: '7d' })
}

function safeUser(user) {
  if (!user) return null
  const { senhaHash, ...safe } = user
  return safe
}

function isAdmin(user) {
  return user?.perfil === 'Administrador'
}

function whereCarteira(user) {
  return isAdmin(user) ? {} : { vendedorId: user.id }
}

function whereOportunidadesVisiveis(user) {
  return isAdmin(user) ? {} : { vendedorId: user.id }
}

function whereAtividadesVisiveis(user) {
  return isAdmin(user) ? {} : {
    OR: [
      { responsavelId: user.id },
      { oportunidade: { vendedorId: user.id } }
    ]
  }
}

function moedaParaDecimal(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const normalizado = String(valor).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
  const numero = Number(normalizado)
  if (!Number.isFinite(numero)) return null
  return new Prisma.Decimal(numero.toFixed(2))
}

function valorSaida(valor) {
  if (valor === null || valor === undefined) return null
  return Number(valor)
}

function normalizarEtapa(etapa) {
  return ETAPAS.includes(etapa) ? etapa : 'Novo prospect'
}

function oportunidadeEncerrada(etapa) {
  return etapa === 'Cliente ativo' || etapa === 'Perdido'
}

function etapaExigePrevisao(etapa) {
  return ETAPAS.indexOf(etapa) >= ETAPAS.indexOf('Proposta enviada') && etapa !== 'Perdido'
}

function etapaTemValor(etapa) {
  return ETAPAS.indexOf(etapa) >= ETAPAS.indexOf('Proposta enviada')
}

function normalizarTemperatura(valor) {
  return ['Frio', 'Morno', 'Quente'].includes(valor) ? valor : 'Morno'
}

function podeEditarOportunidade(user, oportunidade) {
  return isAdmin(user) || oportunidade?.vendedorId === user?.id
}

function limparUsuarioPayload(payload, criando = false) {
  const data = {}
  if (payload.nome !== undefined) data.nome = String(payload.nome || '').trim()
  if (payload.usuario !== undefined) data.usuario = String(payload.usuario || '').trim().toLowerCase()
  if (payload.email !== undefined) data.email = payload.email ? String(payload.email).trim() : null
  if (payload.perfil !== undefined) data.perfil = payload.perfil === 'Administrador' ? 'Administrador' : 'Vendedor'
  if (payload.ativo !== undefined) data.ativo = Boolean(payload.ativo)
  if (!criando) delete data.usuario
  return data
}

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) return res.status(401).json({ erro: 'Não autenticado.' })
    const payload = jwt.verify(token, JWT_SECRET)
    const user = await prisma.usuario.findUnique({ where: { id: payload.id } })
    if (!user || !user.ativo) return res.status(401).json({ erro: 'Usuário inativo ou não encontrado.' })
    req.user = user
    next()
  } catch (_err) {
    return res.status(401).json({ erro: 'Sessão inválida ou expirada.' })
  }
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) return res.status(403).json({ erro: 'Acesso restrito ao administrador.' })
  next()
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'API CRM comercial online com Prisma/Supabase' })
})

app.post('/api/login', asyncHandler(async (req, res) => {
  const login = String(req.body.usuario || '').trim().toLowerCase()
  const senha = String(req.body.senha || '')
  const user = await prisma.usuario.findUnique({ where: { usuario: login } })
  if (!user || !user.ativo) return res.status(401).json({ sucesso: false, erro: 'Usuário ou senha inválidos.' })
  const ok = await bcrypt.compare(senha, user.senhaHash)
  if (!ok) return res.status(401).json({ sucesso: false, erro: 'Usuário ou senha inválidos.' })
  res.json({ sucesso: true, token: signToken(user), usuario: safeUser(user) })
}))

app.get('/api/me', auth, asyncHandler(async (req, res) => {
  res.json({ usuario: safeUser(req.user) })
}))

app.get('/api/opcoes', auth, (_req, res) => {
  res.json({ etapas: ETAPAS, tiposAtividade: TIPOS_ATIVIDADE })
})

// USUÁRIOS - gestão exclusiva Admin
app.get('/api/usuarios', auth, requireAdmin, asyncHandler(async (_req, res) => {
  const usuarios = await prisma.usuario.findMany({ orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] })
  res.json(usuarios.map(safeUser))
}))

app.post('/api/usuarios', auth, requireAdmin, asyncHandler(async (req, res) => {
  const payload = req.body || {}
  if (!payload.nome || !payload.usuario || !payload.senha) {
    return res.status(400).json({ erro: 'Informe nome, usuário e senha.' })
  }
  const data = limparUsuarioPayload(payload, true)
  const existe = await prisma.usuario.findUnique({ where: { usuario: data.usuario } })
  if (existe) return res.status(400).json({ erro: 'Este login já existe.' })
  const novo = await prisma.usuario.create({
    data: { ...data, senhaHash: await bcrypt.hash(String(payload.senha), 10), ativo: payload.ativo ?? true }
  })
  res.status(201).json(safeUser(novo))
}))

app.put('/api/usuarios/:id', auth, requireAdmin, asyncHandler(async (req, res) => {
  const id = req.params.id
  const payload = req.body || {}
  const data = limparUsuarioPayload(payload, false)
  if (payload.senha) data.senhaHash = await bcrypt.hash(String(payload.senha), 10)
  const atualizado = await prisma.usuario.update({ where: { id }, data })
  res.json(safeUser(atualizado))
}))

app.delete('/api/usuarios/:id', auth, requireAdmin, asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ erro: 'Você não pode inativar seu próprio usuário.' })
  await prisma.usuario.update({ where: { id: req.params.id }, data: { ativo: false } })
  res.json({ sucesso: true })
}))

// CLIENTES
app.get('/api/clientes', auth, asyncHandler(async (req, res) => {
  const termo = String(req.query.q || '').trim()
  const status = String(req.query.status || '').trim()
  const vendedorId = String(req.query.vendedorId || '').trim()
  const and = []
  if (status) and.push({ status })
  if (vendedorId && isAdmin(req.user)) and.push({ vendedorId })
  if (termo) {
    and.push({
      OR: ['razaoSocial', 'nomeFantasia', 'cnpj', 'cidade', 'segmento', 'contato', 'email'].map((field) => ({
        [field]: { contains: termo, mode: 'insensitive' }
      }))
    })
  }
  const clientes = await prisma.cliente.findMany({
    where: and.length ? { AND: and } : {},
    include: {
      vendedor: { select: { id: true, nome: true } },
      oportunidades: { where: whereOportunidadesVisiveis(req.user), orderBy: { atualizadoEm: 'desc' }, take: 3 }
    },
    orderBy: { nomeFantasia: 'asc' }
  })
  res.json(clientes.map((c) => ({ ...c, vendedorNome: c.vendedor?.nome || '' })))
}))

app.get('/api/clientes/:id', auth, asyncHandler(async (req, res) => {
  const filtroOportunidades = isAdmin(req.user)
    ? {}
    : { vendedorId: req.user.id }

  const cliente = await prisma.cliente.findUnique({
    where: { id: req.params.id },
    include: {
      vendedor: { select: { id: true, nome: true } },
      oportunidades: {
        where: filtroOportunidades,
        include: {
          vendedor: { select: { id: true, nome: true } },
          atividades: {
            include: { responsavel: { select: { id: true, nome: true } } },
            orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }],
            take: 5
          }
        },
        orderBy: { atualizadoEm: 'desc' }
      },
      atividades: {
        where: isAdmin(req.user) ? {} : { responsavelId: req.user.id },
        include: { responsavel: { select: { id: true, nome: true } } },
        orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }],
        take: 20
      }
    }
  })
  if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado.' })
  res.json({
    ...cliente,
    oportunidades: (cliente.oportunidades || []).map((o) => ({ ...o, valorProposta: valorSaida(o.valorProposta) }))
  })
}))

app.post('/api/clientes', auth, asyncHandler(async (req, res) => {
  const p = req.body || {}
  if (!p.razaoSocial && !p.nomeFantasia) return res.status(400).json({ erro: 'Informe razão social ou nome fantasia.' })
  const vendedorId = isAdmin(req.user) ? (p.vendedorId || req.user.id) : req.user.id
  const novo = await prisma.cliente.create({
    data: {
      razaoSocial: p.razaoSocial || p.nomeFantasia,
      nomeFantasia: p.nomeFantasia || p.razaoSocial,
      cnpj: p.cnpj || null,
      segmento: p.segmento || null,
      cidade: p.cidade || null,
      estado: p.estado || null,
      endereco: p.endereco || null,
      contato: p.contato || null,
      cargoContato: p.cargoContato || null,
      telefone: p.telefone || null,
      email: p.email || null,
      vendedorId,
      status: p.status || 'Prospect',
      potencial: p.potencial || 'Médio',
      observacoes: p.observacoes || null
    }
  })
  res.status(201).json(novo)
}))

app.put('/api/clientes/:id', auth, asyncHandler(async (req, res) => {
  const cliente = await prisma.cliente.findUnique({ where: { id: req.params.id } })
  if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado.' })
  const permitido = ['razaoSocial', 'nomeFantasia', 'cnpj', 'segmento', 'cidade', 'estado', 'endereco', 'contato', 'cargoContato', 'telefone', 'email', 'status', 'potencial', 'observacoes']
  const data = {}
  for (const k of permitido) if (req.body[k] !== undefined) data[k] = req.body[k] || null
  if (isAdmin(req.user) && req.body.vendedorId) data.vendedorId = req.body.vendedorId
  const atualizado = await prisma.cliente.update({ where: { id: req.params.id }, data })
  res.json(atualizado)
}))

app.delete('/api/clientes/:id', auth, requireAdmin, asyncHandler(async (req, res) => {
  await prisma.cliente.delete({ where: { id: req.params.id } })
  res.json({ sucesso: true })
}))


app.post('/api/clientes/importar', auth, asyncHandler(async (req, res) => {
  const linhas = Array.isArray(req.body?.clientes) ? req.body.clientes : []
  if (!linhas.length) return res.status(400).json({ erro: 'Nenhum cliente recebido para importação.' })

  const usuarios = await prisma.usuario.findMany({ where: { ativo: true } })
  const usuarioPorNome = new Map(usuarios.map((u) => [String(u.nome || '').trim().toLowerCase(), u.id]))
  const usuarioPorUsuario = new Map(usuarios.map((u) => [String(u.usuario || '').trim().toLowerCase(), u.id]))
  const resultado = { criados: 0, atualizados: 0, duplicados: 0, ignorados: 0, erros: [] }

  for (const [idx, bruto] of linhas.entries()) {
    try {
      const nomeFantasia = String(bruto.nomeFantasia || bruto.empresa || bruto.nome || '').trim()
      const razaoSocial = String(bruto.razaoSocial || bruto.razao || nomeFantasia || '').trim()
      const cnpj = String(bruto.cnpj || '').trim()
      const email = String(bruto.email || bruto['e-mail'] || '').trim().toLowerCase()
      const telefone = String(bruto.telefone || bruto.celular || '').trim()
      const contato = String(bruto.contato || bruto.nomeContato || bruto['nome do contato'] || '').trim()
      if (!nomeFantasia && !razaoSocial) {
        resultado.ignorados += 1
        resultado.erros.push({ linha: idx + 2, motivo: 'Sem nome/empresa.' })
        continue
      }

      let vendedorId = req.user.id
      if (isAdmin(req.user)) {
        const vendedorInformado = String(bruto.vendedor || bruto.responsavel || bruto.proprietario || '').trim().toLowerCase()
        vendedorId = usuarioPorNome.get(vendedorInformado) || usuarioPorUsuario.get(vendedorInformado) || req.user.id
      }

      const filtros = []
      if (cnpj) filtros.push({ cnpj })
      if (email && nomeFantasia) filtros.push({ AND: [{ email }, { nomeFantasia }] })
      if (telefone && nomeFantasia) filtros.push({ AND: [{ telefone }, { nomeFantasia }] })
      if (!filtros.length && nomeFantasia) filtros.push({ nomeFantasia })

      const existente = await prisma.cliente.findFirst({ where: { OR: filtros } })
      const data = {
        nomeFantasia: nomeFantasia || razaoSocial,
        razaoSocial: razaoSocial || nomeFantasia,
        cnpj: cnpj || null,
        segmento: String(bruto.segmento || '').trim() || null,
        cidade: String(bruto.cidade || '').trim() || null,
        estado: String(bruto.estado || bruto.uf || '').trim() || null,
        contato: contato || null,
        telefone: telefone || null,
        email: email || null,
        status: String(bruto.status || bruto.statusContato || bruto['status do contato'] || 'Prospect').trim() || 'Prospect',
        origemLead: String(bruto.origemLead || bruto['origem do lead'] || '').trim() || null,
        observacoes: String(bruto.observacoes || bruto.obs || '').trim() || null,
        vendedorId,
        atualizadoEm: new Date()
      }
      if (existente) {
        resultado.duplicados += 1
        await prisma.cliente.update({ where: { id: existente.id }, data })
        resultado.atualizados += 1
      } else {
        await prisma.cliente.create({ data })
        resultado.criados += 1
      }
    } catch (e) {
      resultado.ignorados += 1
      resultado.erros.push({ linha: idx + 2, motivo: e.message })
    }
  }
  res.json(resultado)
}))

app.patch('/api/clientes/proprietario-massa', auth, requireAdmin, asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body?.clienteIds) ? req.body.clienteIds.filter(Boolean) : []
  const vendedorId = req.body?.vendedorId
  if (!ids.length) return res.status(400).json({ erro: 'Nenhum cliente selecionado.' })
  if (!vendedorId) return res.status(400).json({ erro: 'Informe o novo proprietário.' })
  const vendedor = await prisma.usuario.findUnique({ where: { id: vendedorId } })
  if (!vendedor) return res.status(404).json({ erro: 'Vendedor não encontrado.' })
  const result = await prisma.cliente.updateMany({ where: { id: { in: ids } }, data: { vendedorId, atualizadoEm: new Date() } })
  res.json({ ok: true, atualizados: result.count })
}))

// OPORTUNIDADES / KANBAN
app.get('/api/oportunidades', auth, asyncHandler(async (req, res) => {
  const etapa = String(req.query.etapa || '').trim()
  const clienteId = String(req.query.clienteId || '').trim()
  const termo = String(req.query.q || '').trim()
  const and = []
  if (etapa) and.push({ etapa })
  if (clienteId) and.push({ clienteId })
  if (termo) and.push({ OR: [
    { titulo: { contains: termo, mode: 'insensitive' } },
    { cliente: { nomeFantasia: { contains: termo, mode: 'insensitive' } } },
    { cliente: { razaoSocial: { contains: termo, mode: 'insensitive' } } },
    { cliente: { cnpj: { contains: termo, mode: 'insensitive' } } }
  ] })
  and.unshift(whereOportunidadesVisiveis(req.user))
  const oportunidades = await prisma.oportunidade.findMany({
    where: and.length ? { AND: and } : {},
    include: {
      cliente: true,
      vendedor: { select: { id: true, nome: true } },
      atividades: { orderBy: { criadoEm: 'desc' }, take: 5 },
      tarefas: { where: { status: { not: 'Concluída' } }, orderBy: { dataLimite: 'asc' }, take: 3 }
    },
    orderBy: [{ atualizadoEm: 'desc' }]
  })
  res.json(oportunidades.map((o) => ({ ...o, valorProposta: valorSaida(o.valorProposta) })))
}))

app.post('/api/oportunidades', auth, asyncHandler(async (req, res) => {
  const p = req.body || {}
  if (!p.clienteId) return res.status(400).json({ erro: 'Informe o cliente.' })
  const cliente = await prisma.cliente.findUnique({ where: { id: p.clienteId } })
  if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado.' })
  const etapa = normalizarEtapa(p.etapa || 'Novo prospect')
  if (etapaExigePrevisao(etapa) && !p.previsaoFechamento) return res.status(400).json({ erro: 'Previsão de fechamento é obrigatória a partir de Proposta enviada.' })
  const novo = await prisma.oportunidade.create({
    data: {
      clienteId: cliente.id,
      vendedorId: isAdmin(req.user) ? (p.vendedorId || cliente.vendedorId || req.user.id) : req.user.id,
      titulo: p.titulo || `Oportunidade - ${cliente.nomeFantasia}`,
      etapa,
      status: oportunidadeEncerrada(etapa) ? 'Encerrada' : 'Aberta',
      valorProposta: etapaTemValor(etapa) ? moedaParaDecimal(p.valorProposta) : null,
      probabilidade: Number(p.probabilidade || 0),
      origem: p.origem || null,
      descricao: p.descricao || null,
      proximaAcao: p.proximaAcao || null,
      proximaData: p.proximaData || null,
      previsaoFechamento: normalizarDateTimeInput(p.previsaoFechamento),
      temperatura: normalizarTemperatura(p.temperatura),
      encerradaEm: oportunidadeEncerrada(etapa) ? new Date() : null,
      motivoPerda: etapa === 'Perdido' ? (p.motivoPerda || null) : null
    }
  })
  res.status(201).json({ ...novo, valorProposta: valorSaida(novo.valorProposta) })
}))


app.get('/api/oportunidades/:id', auth, asyncHandler(async (req, res) => {
  const oportunidade = await prisma.oportunidade.findUnique({
    where: { id: req.params.id },
    include: {
      cliente: true,
      vendedor: { select: { id: true, nome: true } },
      atividades: {
        include: { responsavel: { select: { id: true, nome: true } } },
        orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }]
      },
      tarefas: {
        where: { status: { not: 'Concluída' } },
        include: { responsavel: { select: { id: true, nome: true } } },
        orderBy: { dataLimite: 'asc' }
      }
    }
  })
  if (!oportunidade) return res.status(404).json({ erro: 'Oportunidade não encontrada.' })
  if (!isAdmin(req.user) && oportunidade.vendedorId !== req.user.id) return res.status(403).json({ erro: 'Você não tem acesso a esta oportunidade.' })
  res.json({ ...oportunidade, editavel: podeEditarOportunidade(req.user, oportunidade), valorProposta: valorSaida(oportunidade.valorProposta) })
}))

app.put('/api/oportunidades/:id', auth, asyncHandler(async (req, res) => {
  const atual = await prisma.oportunidade.findUnique({ where: { id: req.params.id } })
  if (!atual) return res.status(404).json({ erro: 'Oportunidade não encontrada.' })
  if (!podeEditarOportunidade(req.user, atual)) return res.status(403).json({ erro: 'Esta oportunidade pertence a outro usuário. Somente o responsável ou admin pode editar.' })
  const p = req.body || {}
  const etapa = p.etapa ? normalizarEtapa(p.etapa) : atual.etapa
  const data = {}
  for (const k of ['titulo', 'origem', 'descricao', 'proximaAcao', 'proximaData', 'motivoPerda', 'previsaoFechamento']) if (p[k] !== undefined) data[k] = k === 'previsaoFechamento' ? normalizarDateTimeInput(p[k]) : (p[k] || null)
  if (p.temperatura !== undefined) data.temperatura = normalizarTemperatura(p.temperatura)
  if (isAdmin(req.user) && p.vendedorId) data.vendedorId = p.vendedorId
  if (p.etapa !== undefined) {
    data.etapa = etapa
    data.status = oportunidadeEncerrada(etapa) ? 'Encerrada' : 'Aberta'
    data.encerradaEm = oportunidadeEncerrada(etapa) ? new Date() : null
    if (etapa !== 'Perdido') data.motivoPerda = null
  }
  if (etapaExigePrevisao(etapa) && !(p.previsaoFechamento || atual.previsaoFechamento)) return res.status(400).json({ erro: 'Previsão de fechamento é obrigatória a partir de Proposta enviada.' })
  if (p.probabilidade !== undefined) data.probabilidade = Number(p.probabilidade || 0)
  if (p.valorProposta !== undefined) {
    data.valorProposta = etapaTemValor(etapa) ? moedaParaDecimal(p.valorProposta) : null
  } else if (etapa !== atual.etapa && !etapaTemValor(etapa)) {
    data.valorProposta = null
  }
  const atualizado = await prisma.oportunidade.update({ where: { id: req.params.id }, data })
  res.json({ ...atualizado, valorProposta: valorSaida(atualizado.valorProposta) })
}))

app.delete('/api/oportunidades/:id', auth, asyncHandler(async (req, res) => {
  const oportunidade = await prisma.oportunidade.findUnique({ where: { id: req.params.id } })
  if (!oportunidade) return res.status(404).json({ erro: 'Oportunidade não encontrada.' })
  if (!isAdmin(req.user) && oportunidade.vendedorId !== req.user.id) {
    return res.status(403).json({ erro: 'Você não pode excluir esta oportunidade.' })
  }
  await prisma.oportunidade.delete({ where: { id: req.params.id } })
  res.json({ sucesso: true })
}))

// ATIVIDADES
app.get('/api/atividades', auth, asyncHandler(async (req, res) => {
  const oportunidadeId = String(req.query.oportunidadeId || '').trim()
  const clienteId = String(req.query.clienteId || '').trim()
  const tipo = String(req.query.tipo || '').trim()
  const etapa = String(req.query.etapa || '').trim()
  const termo = String(req.query.q || '').trim()
  const dataInicio = String(req.query.dataInicio || '').trim()
  const dataFim = String(req.query.dataFim || '').trim()
  const and = []
  if (oportunidadeId) and.push({ oportunidadeId })
  if (clienteId) and.push({ clienteId })
  if (tipo) and.push({ tipo })
  if (etapa) and.push({ etapaApos: etapa })
  if (dataInicio) and.push({ data: { gte: dataInicio } })
  if (dataFim) and.push({ data: { lte: dataFim } })
  if (termo) {
    and.push({ OR: [
      { resumo: { contains: termo, mode: 'insensitive' } },
      { observacoes: { contains: termo, mode: 'insensitive' } },
      { cliente: { nomeFantasia: { contains: termo, mode: 'insensitive' } } },
      { cliente: { razaoSocial: { contains: termo, mode: 'insensitive' } } },
      { oportunidade: { titulo: { contains: termo, mode: 'insensitive' } } },
      { responsavel: { nome: { contains: termo, mode: 'insensitive' } } }
    ] })
  }
  and.unshift(whereAtividadesVisiveis(req.user))
  const atividades = await prisma.atividade.findMany({
    where: and.length ? { AND: and } : {},
    include: { cliente: true, oportunidade: true, responsavel: { select: { id: true, nome: true } } },
    orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }]
  })
  res.json(atividades.map((a) => ({ ...a, valorProposta: valorSaida(a.valorProposta) })))
}))

app.post('/api/atividades', auth, asyncHandler(async (req, res) => {
  const p = req.body || {}
  if (!p.clienteId) return res.status(400).json({ erro: 'Informe o cliente.' })
  const cliente = await prisma.cliente.findUnique({ where: { id: p.clienteId } })
  if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado.' })
  let oportunidade = null
  if (p.oportunidadeId) {
    oportunidade = await prisma.oportunidade.findUnique({ where: { id: p.oportunidadeId } })
    if (!oportunidade) return res.status(404).json({ erro: 'Oportunidade não encontrada.' })
    if (!podeEditarOportunidade(req.user, oportunidade)) return res.status(403).json({ erro: 'Esta oportunidade pertence a outro usuário. Somente o responsável ou admin pode registrar atividades.' })
  }
  const etapaApos = p.etapaApos ? normalizarEtapa(p.etapaApos) : null
  if (etapaApos && etapaExigePrevisao(etapaApos) && !(p.previsaoFechamento || oportunidade?.previsaoFechamento)) return res.status(400).json({ erro: 'Previsão de fechamento é obrigatória a partir de Proposta enviada.' })
  const valorInformado = p.valorProposta !== undefined && String(p.valorProposta).trim() !== ''
  const valor = etapaTemValor(etapaApos) && valorInformado ? moedaParaDecimal(p.valorProposta) : null
  const atividade = await prisma.atividade.create({
    data: {
      clienteId: cliente.id,
      oportunidadeId: oportunidade?.id || null,
      responsavelId: isAdmin(req.user) ? (p.responsavelId || cliente.vendedorId) : req.user.id,
      tipo: p.tipo || 'Ligação',
      data: p.data || new Date().toISOString().slice(0, 10),
      hora: p.hora || null,
      resumo: p.resumo || null,
      contato: p.contato || null,
      proximaAcao: p.proximaAcao || null,
      proximaData: p.proximaData || null,
      etapaApos,
      valorProposta: valor,
      previsaoFechamento: normalizarDateTimeInput(p.previsaoFechamento),
      temperatura: p.temperatura ? normalizarTemperatura(p.temperatura) : null,
      observacoes: p.observacoes || null
    }
  })
  if (oportunidade && etapaApos) {
    await prisma.oportunidade.update({
      where: { id: oportunidade.id },
      data: {
        etapa: etapaApos,
        status: oportunidadeEncerrada(etapaApos) ? 'Encerrada' : 'Aberta',
        valorProposta: etapaTemValor(etapaApos) ? (valorInformado ? valor : oportunidade.valorProposta) : null,
        proximaAcao: p.proximaAcao || oportunidade.proximaAcao,
        proximaData: p.proximaData || oportunidade.proximaData,
        previsaoFechamento: normalizarDateTimeInput(p.previsaoFechamento) || oportunidade.previsaoFechamento,
        temperatura: p.temperatura ? normalizarTemperatura(p.temperatura) : oportunidade.temperatura,
        encerradaEm: oportunidadeEncerrada(etapaApos) ? new Date() : null
      }
    })
  }
  res.status(201).json({ ...atividade, valorProposta: valorSaida(atividade.valorProposta) })
}))

// TAREFAS
app.get('/api/tarefas', auth, asyncHandler(async (req, res) => {
  const status = String(req.query.status || '').trim()
  const and = [isAdmin(req.user) ? {} : { responsavelId: req.user.id }]
  if (status) and.push({ status })
  const tarefas = await prisma.tarefa.findMany({
    where: and.length ? { AND: and } : {},
    include: { cliente: true, oportunidade: true, responsavel: { select: { id: true, nome: true } } },
    orderBy: [{ status: 'asc' }, { dataLimite: 'asc' }]
  })
  res.json(tarefas)
}))

app.post('/api/tarefas', auth, asyncHandler(async (req, res) => {
  const p = req.body || {}
  if (!p.titulo) return res.status(400).json({ erro: 'Informe o título da tarefa.' })
  const tarefa = await prisma.tarefa.create({
    data: {
      titulo: p.titulo,
      descricao: p.descricao || null,
      clienteId: p.clienteId || null,
      oportunidadeId: p.oportunidadeId || null,
      responsavelId: isAdmin(req.user) ? (p.responsavelId || req.user.id) : req.user.id,
      dataLimite: p.dataLimite || null,
      prioridade: p.prioridade || 'Média',
      status: p.status || 'Pendente'
    }
  })
  res.status(201).json(tarefa)
}))

app.put('/api/tarefas/:id', auth, asyncHandler(async (req, res) => {
  const tarefa = await prisma.tarefa.findUnique({ where: { id: req.params.id } })
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' })
  if (!isAdmin(req.user) && tarefa.responsavelId !== req.user.id) return res.status(403).json({ erro: 'Você não pode editar esta tarefa.' })
  const data = { ...req.body }
  if (data.status === 'Concluída') data.concluidaEm = new Date()
  const atualizada = await prisma.tarefa.update({ where: { id: req.params.id }, data })
  res.json(atualizada)
}))

// RELATÓRIOS
function normalizarPeriodoData(valor, fim = false) {
  if (!valor) return null
  const texto = String(valor).slice(0, 10)
  const data = new Date(`${texto}T${fim ? '23:59:59.999' : '00:00:00.000'}Z`)
  return Number.isNaN(data.getTime()) ? null : data
}

function normalizarDateTimeInput(valor) {
  if (!valor) return null
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor
  const texto = String(valor).trim()
  if (!texto) return null
  const iso = texto.length <= 10 ? `${texto.slice(0, 10)}T12:00:00.000Z` : texto
  const data = new Date(iso)
  return Number.isNaN(data.getTime()) ? null : data
}

function montarFiltroOportunidadeRelatorio(user, query = {}) {
  const and = [whereOportunidadesVisiveis(user)]
  const vendedorId = String(query.vendedorId || '').trim()
  const etapa = String(query.etapa || '').trim()
  const status = String(query.status || '').trim()
  const temperatura = String(query.temperatura || '').trim()
  const q = String(query.q || '').trim()
  const dataInicio = normalizarPeriodoData(query.dataInicio)
  const dataFim = normalizarPeriodoData(query.dataFim, true)

  if (isAdmin(user) && vendedorId) and.push({ vendedorId })
  if (etapa) and.push({ etapa })
  if (temperatura) and.push({ temperatura })
  if (q) and.push({ OR: [
    { titulo: { contains: q, mode: 'insensitive' } },
    { cliente: { nomeFantasia: { contains: q, mode: 'insensitive' } } },
    { cliente: { razaoSocial: { contains: q, mode: 'insensitive' } } },
    { cliente: { cnpj: { contains: q, mode: 'insensitive' } } },
    { vendedor: { nome: { contains: q, mode: 'insensitive' } } }
  ] })
  if (status) {
    if (['Aberta', 'Encerrada'].includes(status)) and.push({ status })
    else if (ETAPAS.includes(status)) and.push({ etapa: status })
  }
  if (dataInicio || dataFim) {
    const filtroData = {}
    if (dataInicio) filtroData.gte = dataInicio
    if (dataFim) filtroData.lte = dataFim
    and.push({ atualizadoEm: filtroData })
  }
  const limpo = and.filter((x) => Object.keys(x).length)
  return limpo.length ? { AND: limpo } : {}
}

function montarFiltroAtividadeRelatorio(user, query = {}) {
  const and = [whereAtividadesVisiveis(user)]
  const vendedorId = String(query.vendedorId || '').trim()
  const etapa = String(query.etapa || '').trim()
  const temperatura = String(query.temperatura || '').trim()
  const q = String(query.q || '').trim()
  const dataInicio = String(query.dataInicio || '').slice(0, 10)
  const dataFim = String(query.dataFim || '').slice(0, 10)

  if (isAdmin(user) && vendedorId) and.push({ OR: [{ responsavelId: vendedorId }, { oportunidade: { vendedorId } }] })
  if (etapa) and.push({ etapaApos: etapa })
  if (temperatura) and.push({ temperatura })
  if (q) and.push({ OR: [
    { resumo: { contains: q, mode: 'insensitive' } },
    { observacoes: { contains: q, mode: 'insensitive' } },
    { cliente: { nomeFantasia: { contains: q, mode: 'insensitive' } } },
    { cliente: { razaoSocial: { contains: q, mode: 'insensitive' } } },
    { oportunidade: { titulo: { contains: q, mode: 'insensitive' } } },
    { responsavel: { nome: { contains: q, mode: 'insensitive' } } }
  ] })
  if (dataInicio) and.push({ data: { gte: dataInicio } })
  if (dataFim) and.push({ data: { lte: dataFim } })
  const limpo = and.filter((x) => Object.keys(x).length)
  return limpo.length ? { AND: limpo } : {}
}


app.get('/api/relatorios', auth, asyncHandler(async (req, res) => {
  const whereOp = montarFiltroOportunidadeRelatorio(req.user, req.query)
  const whereAt = montarFiltroAtividadeRelatorio(req.user, req.query)
  const vendedorId = String(req.query.vendedorId || '').trim()
  const q = String(req.query.q || '').trim()
  const dataInicio = normalizarPeriodoData(req.query.dataInicio)
  const dataFim = normalizarPeriodoData(req.query.dataFim, true)

  const clienteAnd = []
  if (isAdmin(req.user) && vendedorId) clienteAnd.push({ vendedorId })
  if (q) clienteAnd.push({ OR: [
    { nomeFantasia: { contains: q, mode: 'insensitive' } },
    { razaoSocial: { contains: q, mode: 'insensitive' } },
    { cnpj: { contains: q, mode: 'insensitive' } },
    { contato: { contains: q, mode: 'insensitive' } },
    { email: { contains: q, mode: 'insensitive' } },
    { cidade: { contains: q, mode: 'insensitive' } },
    { segmento: { contains: q, mode: 'insensitive' } }
  ] })
  if (dataInicio || dataFim) {
    const filtroData = {}
    if (dataInicio) filtroData.gte = dataInicio
    if (dataFim) filtroData.lte = dataFim
    clienteAnd.push({ atualizadoEm: filtroData })
  }

  const [usuarios, oportunidades, atividades, clientes] = await Promise.all([
    isAdmin(req.user)
      ? prisma.usuario.findMany({ where: { ativo: true }, select: { id: true, nome: true, perfil: true }, orderBy: { nome: 'asc' } })
      : prisma.usuario.findMany({ where: { id: req.user.id }, select: { id: true, nome: true, perfil: true } }),
    prisma.oportunidade.findMany({
      where: whereOp,
      include: {
        cliente: true,
        vendedor: { select: { id: true, nome: true } },
        atividades: {
          orderBy: { criadoEm: 'desc' },
          take: 5,
          include: { responsavel: { select: { id: true, nome: true } } }
        }
      },
      orderBy: [{ atualizadoEm: 'desc' }],
      take: 1500
    }),
    prisma.atividade.findMany({
      where: whereAt,
      include: {
        cliente: true,
        oportunidade: { include: { vendedor: { select: { id: true, nome: true } } } },
        responsavel: { select: { id: true, nome: true } }
      },
      orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }],
      take: 1500
    }),
    prisma.cliente.findMany({
      where: clienteAnd.length ? { AND: clienteAnd } : {},
      include: {
        vendedor: { select: { id: true, nome: true } },
        oportunidades: {
          where: whereOportunidadesVisiveis(req.user),
          include: { vendedor: { select: { id: true, nome: true } } },
          orderBy: { atualizadoEm: 'desc' }
        }
      },
      orderBy: { atualizadoEm: 'desc' },
      take: 1500
    })
  ])

  const hojeRef = new Date()
  const diasDesde = (valor) => {
    if (!valor) return 0
    const d = new Date(valor)
    if (Number.isNaN(d.getTime())) return 0
    return Math.max(0, Math.floor((hojeRef.getTime() - d.getTime()) / 86400000))
  }
  const diasEntre = (inicio, fim) => {
    if (!inicio || !fim) return 0
    const a = new Date(inicio)
    const b = new Date(fim)
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
    return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000))
  }
  const probTemperatura = (temperatura, etapa) => {
    if (etapa === 'Cliente ativo') return 100
    if (String(temperatura || '').toLowerCase() === 'quente') return 75
    if (String(temperatura || '').toLowerCase() === 'morno') return 50
    if (String(temperatura || '').toLowerCase() === 'frio') return 25
    return 40
  }
  const media = (arr) => arr.length ? Number((arr.reduce((acc, n) => acc + Number(n || 0), 0) / arr.length).toFixed(1)) : 0

  const opsSaida = oportunidades.map((o) => {
    const valor = valorSaida(o.valorProposta) || 0
    const prob = probTemperatura(o.temperatura, o.etapa)
    const ultimaAtividade = o.atividades?.[0]?.data || o.atividades?.[0]?.criadoEm || null
    return {
      ...o,
      valorProposta: valor,
      forecastPonderado: Number(((valor * prob) / 100).toFixed(2)),
      probabilidadeForecast: prob,
      diasSemAtualizacao: diasDesde(o.atualizadoEm),
      diasSemAtividade: ultimaAtividade ? diasDesde(ultimaAtividade) : diasDesde(o.atualizadoEm),
      diasCiclo: o.encerradaEm ? diasEntre(o.criadoEm, o.encerradaEm) : diasEntre(o.criadoEm, hojeRef)
    }
  })
  const atvsSaida = atividades.map((a) => ({ ...a, valorProposta: valorSaida(a.valorProposta) }))

  const etapasComValor = ETAPAS.slice(ETAPAS.indexOf('Proposta enviada')).filter((etapa) => etapa !== 'Perdido')
  const oportunidadesValor = opsSaida.filter((o) => etapasComValor.includes(o.etapa) && Number(o.valorProposta || 0) > 0)
  const abertas = opsSaida.filter((o) => o.status === 'Aberta' && o.etapa !== 'Perdido' && o.etapa !== 'Cliente ativo')
  const propostas = opsSaida.filter((o) => etapasComValor.includes(o.etapa))
  const ganhas = opsSaida.filter((o) => o.etapa === 'Cliente ativo')
  const perdidas = opsSaida.filter((o) => o.etapa === 'Perdido')
  const encerradas = [...ganhas, ...perdidas]

  const valorTotalPipeline = oportunidadesValor.reduce((acc, o) => acc + Number(o.valorProposta || 0), 0)
  const forecastTotal = oportunidadesValor.reduce((acc, o) => acc + Number(o.forecastPonderado || 0), 0)

  const funilAnalitico = ETAPAS.map((etapa) => {
    const items = opsSaida.filter((o) => o.etapa === etapa)
    const valorTotal = items.reduce((acc, o) => acc + Number(o.valorProposta || 0), 0)
    return {
      etapa,
      total: items.length,
      valorTotal,
      valorMedio: items.length ? Number((valorTotal / items.length).toFixed(2)) : 0,
      percentualFunil: opsSaida.length ? Number(((items.length / opsSaida.length) * 100).toFixed(1)) : 0,
      diasMediosParado: media(items.map((o) => o.diasSemAtualizacao)),
      ultimaAtividadeMediaDias: media(items.map((o) => o.diasSemAtividade)),
      items
    }
  }).filter((e) => e.total > 0)

  const forecastTemperatura = ['Frio', 'Morno', 'Quente'].map((temperatura) => {
    const items = oportunidadesValor.filter((o) => o.temperatura === temperatura)
    const valorTotal = items.reduce((acc, o) => acc + Number(o.valorProposta || 0), 0)
    const probabilidade = probTemperatura(temperatura)
    return {
      temperatura,
      total: items.length,
      valorTotal,
      probabilidade,
      forecast: items.reduce((acc, o) => acc + Number(o.forecastPonderado || 0), 0),
      items
    }
  }).filter((t) => t.total > 0)

  const porTipoAtividade = TIPOS_ATIVIDADE.map((tipo) => {
    const items = atvsSaida.filter((a) => a.tipo === tipo)
    return { tipo, total: items.length, items }
  }).filter((a) => a.total > 0)

  const porVendedorAtividade = usuarios.map((u) => {
    const items = atvsSaida.filter((a) => a.responsavelId === u.id || a.oportunidade?.vendedorId === u.id)
    return { vendedor: u.nome, total: items.length, items }
  }).filter((a) => a.total > 0).sort((a, b) => b.total - a.total)

  const clientesResumo = clientes.map((c) => {
    const opsCliente = opsSaida.filter((o) => o.clienteId === c.id)
    const abertasCliente = opsCliente.filter((o) => o.status === 'Aberta' && o.etapa !== 'Perdido' && o.etapa !== 'Cliente ativo')
    const valorTotal = opsCliente.reduce((acc, o) => acc + Number(o.valorProposta || 0), 0)
    const followupVencido = opsCliente.some((o) => o.proximaData && new Date(o.proximaData) < hojeRef && o.status === 'Aberta')
    return {
      ...c,
      vendedorNome: c.vendedor?.nome || '',
      oportunidadesAbertas: abertasCliente.length,
      oportunidadesEncerradas: opsCliente.filter((o) => o.status === 'Encerrada' || o.etapa === 'Cliente ativo' || o.etapa === 'Perdido').length,
      valorTotalNegociado: valorTotal,
      statusAtual: c.status,
      vendedorResponsavelAtual: c.vendedor?.nome || '',
      followupVencido
    }
  })

  const clientesComOportunidadeAberta = clientesResumo.filter((c) => c.oportunidadesAbertas > 0)
  const clientesSemOportunidadeAberta = clientesResumo.filter((c) => !c.oportunidadesAbertas)
  const clientesAtivos = clientesResumo.filter((c) => c.status === 'Cliente ativo' || c.oportunidades?.some((o) => o.etapa === 'Cliente ativo'))
  const clientesPerdidosInativos = clientesResumo.filter((c) => ['Perdido', 'Inativo'].includes(c.status))
  const clientesNovosPeriodo = clientesResumo.filter((c) => {
    if (!dataInicio && !dataFim) return diasDesde(c.criadoEm) <= 30
    const criado = new Date(c.criadoEm)
    return (!dataInicio || criado >= dataInicio) && (!dataFim || criado <= dataFim)
  })
  const clientesFollowupVencido = clientesResumo.filter((c) => c.followupVencido)

  const segmentos = {}
  clientesResumo.forEach((c) => {
    const key = c.segmento || 'Sem segmento'
    segmentos[key] = (segmentos[key] || 0) + 1
  })

  const ranking = usuarios.map((u) => {
    const ops = opsSaida.filter((o) => o.vendedorId === u.id)
    const atividadesVend = atvsSaida.filter((a) => a.responsavelId === u.id || a.oportunidade?.vendedorId === u.id)
    const ganhasVend = ops.filter((o) => o.etapa === 'Cliente ativo').length
    const perdidasVend = ops.filter((o) => o.etapa === 'Perdido').length
    const encerradasVend = ganhasVend + perdidasVend
    const propostasVend = ops.filter((o) => etapasComValor.includes(o.etapa))
    const valorEmPropostas = propostasVend.reduce((acc, o) => acc + Number(o.valorProposta || 0), 0)
    return {
      vendedorId: u.id,
      vendedor: u.nome,
      clientesAtivos: clientesAtivos.filter((c) => c.vendedorId === u.id).length,
      oportunidadesAbertas: ops.filter((o) => o.status === 'Aberta' && o.etapa !== 'Cliente ativo' && o.etapa !== 'Perdido').length,
      propostasEnviadas: propostasVend.length,
      valorEmPropostas,
      forecastPonderado: propostasVend.reduce((acc, o) => acc + Number(o.forecastPonderado || 0), 0),
      atividadesRealizadas: atividadesVend.length,
      taxaConversao: encerradasVend ? Number(((ganhasVend / encerradasVend) * 100).toFixed(1)) : 0,
      ticketMedio: propostasVend.length ? Number((valorEmPropostas / propostasVend.length).toFixed(2)) : 0
    }
  }).sort((a, b) => b.valorEmPropostas - a.valorEmPropostas)

  const propostasSemAtividade = propostas.filter((o) => o.diasSemAtividade >= 7 && o.status === 'Aberta')
  const previsaoVencida = propostas.filter((o) => o.previsaoFechamento && new Date(o.previsaoFechamento) < hojeRef && o.status === 'Aberta')
  const quentesSemProximaAcao = propostas.filter((o) => o.temperatura === 'Quente' && !o.proximaAcao && o.status === 'Aberta')
  const negociacaoSemAtualizacao = opsSaida.filter((o) => ['Em negociação', 'Aguardando retorno'].includes(o.etapa) && o.diasSemAtualizacao >= 7)
  const clientesSemContatoRecente = clientesComOportunidadeAberta.filter((c) => {
    const atividadesCliente = atvsSaida.filter((a) => a.clienteId === c.id)
    if (!atividadesCliente.length) return true
    return Math.min(...atividadesCliente.map((a) => diasDesde(a.data || a.criadoEm))) >= 15
  })

  res.json({
    filtros: {
      vendedores: usuarios,
      etapas: ETAPAS,
      status: ['Aberta', 'Encerrada'],
      temperaturas: ['Frio', 'Morno', 'Quente']
    },
    cards: {
      receitaNegociacao: valorTotalPipeline,
      forecastPonderado: forecastTotal,
      propostasEnviadas: propostas.length,
      oportunidadesAbertas: abertas.length,
      taxaConversao: encerradas.length ? Number(((ganhas.length / encerradas.length) * 100).toFixed(1)) : 0,
      ticketMedioProposta: oportunidadesValor.length ? Number((valorTotalPipeline / oportunidadesValor.length).toFixed(2)) : 0,
      cicloMedioDias: media(encerradas.map((o) => o.diasCiclo)),
      atividadesPeriodo: atvsSaida.length
    },
    funilAnalitico,
    forecastTemperatura,
    ranking,
    criticas: [
      { key: 'propostasSemAtividade', title: 'Propostas sem atividade', total: propostasSemAtividade.length, descricao: 'Sem atividade há 7 dias ou mais', severidade: 'warning', type: 'oportunidades', items: propostasSemAtividade },
      { key: 'previsaoVencida', title: 'Previsões vencidas', total: previsaoVencida.length, descricao: 'Previsão de fechamento anterior a hoje', severidade: 'danger', type: 'oportunidades', items: previsaoVencida },
      { key: 'quentesSemProximaAcao', title: 'Quentes sem próxima ação', total: quentesSemProximaAcao.length, descricao: 'Oportunidades quentes sem plano de avanço', severidade: 'danger', type: 'oportunidades', items: quentesSemProximaAcao },
      { key: 'negociacaoSemAtualizacao', title: 'Negociação parada', total: negociacaoSemAtualizacao.length, descricao: 'Em negociação/retorno sem atualização há 7 dias', severidade: 'warning', type: 'oportunidades', items: negociacaoSemAtualizacao },
      { key: 'clientesSemContatoRecente', title: 'Clientes sem contato recente', total: clientesSemContatoRecente.length, descricao: 'Clientes com oportunidade aberta sem contato recente', severidade: 'info', type: 'clientes', items: clientesSemContatoRecente }
    ],
    clientesAnalise: {
      total: clientesResumo.length,
      comOportunidadeAberta: clientesComOportunidadeAberta.length,
      semOportunidadeAberta: clientesSemOportunidadeAberta.length,
      ativos: clientesAtivos.length,
      perdidosInativos: clientesPerdidosInativos.length,
      novosPeriodo: clientesNovosPeriodo.length,
      followupVencido: clientesFollowupVencido.length,
      porSegmento: Object.entries(segmentos).map(([segmento, total]) => ({ segmento, total })).sort((a, b) => b.total - a.total)
    },
    atividadesAnalise: {
      porTipo: porTipoAtividade,
      porVendedor: porVendedorAtividade,
      ultimas: atvsSaida.slice(0, 20)
    },
    detalhes: {
      receitaNegociacao: oportunidadesValor,
      forecastPonderado: oportunidadesValor,
      propostasEnviadas: propostas,
      oportunidadesAbertas: abertas,
      conversao: encerradas,
      cicloMedio: encerradas,
      clientesComOportunidadeAberta,
      clientesSemOportunidadeAberta,
      clientesAtivos,
      clientesPerdidosInativos,
      clientesNovosPeriodo,
      clientesFollowupVencido
    },
    graficos: {
      funilAnalitico,
      forecastTemperatura,
      atividadesPorTipo: porTipoAtividade,
      atividadesPorVendedor: porVendedorAtividade
    },
    oportunidades: opsSaida,
    atividades: atvsSaida,
    clientes: clientesResumo
  })
}))


// DASHBOARD
app.get('/api/dashboard', auth, asyncHandler(async (req, res) => {
  const whereOp = whereOportunidadesVisiveis(req.user)
  const whereAt = whereAtividadesVisiveis(req.user)
  const hojeISO = new Date().toISOString().slice(0, 10)
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const seteDiasAtrasISO = seteDiasAtras.toISOString().slice(0, 10)
  const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [clientes, oportunidadesRaw, atividadesRecentes, atividadesPeriodo, usuarios] = await Promise.all([
    prisma.cliente.findMany({
      include: { vendedor: { select: { id: true, nome: true } }, oportunidades: { where: whereOp, select: { id: true, status: true, etapa: true } } },
      orderBy: { atualizadoEm: 'desc' },
      take: 1000
    }),
    prisma.oportunidade.findMany({
      where: whereOp,
      include: { cliente: true, vendedor: { select: { id: true, nome: true } } },
      orderBy: [{ atualizadoEm: 'desc' }],
      take: 1000
    }),
    prisma.atividade.findMany({
      where: whereAt,
      orderBy: { criadoEm: 'desc' },
      take: 10,
      include: { cliente: true, oportunidade: true, responsavel: { select: { id: true, nome: true } } }
    }),
    prisma.atividade.findMany({
      where: { AND: [whereAt, { data: { gte: seteDiasAtrasISO } }] },
      orderBy: { criadoEm: 'desc' },
      take: 200,
      include: { cliente: true, oportunidade: true, responsavel: { select: { id: true, nome: true } } }
    }),
    prisma.usuario.findMany({ where: isAdmin(req.user) ? { ativo: true } : { id: req.user.id }, select: { id: true, nome: true } })
  ])

  const oportunidades = oportunidadesRaw.map((o) => ({ ...o, valorProposta: valorSaida(o.valorProposta) }))
  const abertas = oportunidades.filter((o) => o.status === 'Aberta' && o.etapa !== 'Perdido')
  const propostasEnviadas = oportunidades.filter((o) => o.etapa === 'Proposta enviada')
  const etapasComValorDashboard = ETAPAS.slice(ETAPAS.indexOf('Proposta enviada')).filter((etapa) => etapa !== 'Perdido')
  const valorNegociacaoLista = oportunidades.filter((o) => etapasComValorDashboard.includes(o.etapa))
  const valorNegociacao = valorNegociacaoLista.reduce((acc, o) => acc + Number(o.valorProposta || 0), 0)
  const previsaoFechamentoLista = valorNegociacaoLista.filter((o) => o.previsaoFechamento).sort((a, b) => new Date(a.previsaoFechamento) - new Date(b.previsaoFechamento))
  const previsaoFechamento = previsaoFechamentoLista.reduce((acc, o) => acc + Number(o.valorProposta || 0), 0)

  const clientesAtivos = clientes.filter((c) => c.status === 'Cliente ativo' || (c.oportunidades || []).some((o) => o.etapa === 'Cliente ativo'))
  const clientesComOportunidadeAberta = clientes.filter((c) => (c.oportunidades || []).some((o) => o.status === 'Aberta'))
  const clientesSemOportunidadeAberta = clientes.filter((c) => !(c.oportunidades || []).some((o) => o.status === 'Aberta'))
  const clientesNovosNoMes = clientes.filter((c) => new Date(c.criadoEm) >= trintaDiasAtras)

  const funilExecutivoBase = ETAPAS.map((etapa) => {
    const items = oportunidades.filter((o) => o.etapa === etapa)
    return { etapa, total: items.length, valor: items.reduce((acc, o) => acc + Number(o.valorProposta || 0), 0), items }
  })
  const maxEtapa = Math.max(1, ...funilExecutivoBase.map((e) => e.total))
  const funilExecutivo = funilExecutivoBase.map((e) => ({ ...e, percentual: Math.round((e.total / maxEtapa) * 100) }))

  const semMovimentacao = abertas.filter((o) => new Date(o.atualizadoEm) < seteDiasAtras)
  const propostasSemRetorno = propostasEnviadas.filter((o) => new Date(o.atualizadoEm) < seteDiasAtras)
  const followupsVencidos = abertas.filter((o) => o.proximaData && String(o.proximaData).slice(0, 10) < hojeISO)

  const rankingVendedores = usuarios.map((u) => {
    const ops = oportunidades.filter((o) => o.vendedorId === u.id)
    const atvs = atividadesPeriodo.filter((a) => a.responsavelId === u.id || a.oportunidade?.vendedorId === u.id)
    const ganhas = ops.filter((o) => o.etapa === 'Cliente ativo').length
    const perdidas = ops.filter((o) => o.etapa === 'Perdido').length
    const encerradas = ganhas + perdidas
    return {
      id: u.id,
      nome: u.nome,
      oportunidadesAbertas: ops.filter((o) => o.status === 'Aberta').length,
      propostasEnviadas: ops.filter((o) => o.etapa === 'Proposta enviada').length,
      valorPropostas: ops.filter((o) => etapasComValorDashboard.includes(o.etapa)).reduce((acc, o) => acc + Number(o.valorProposta || 0), 0),
      atividadesRealizadas: atvs.length,
      taxaConversao: encerradas ? Math.round((ganhas / encerradas) * 100) : 0
    }
  }).sort((a, b) => b.valorPropostas - a.valorPropostas)

  res.json({
    cards: {
      oportunidadesAbertas: abertas.length,
      valorNegociacao,
      propostasEnviadas: propostasEnviadas.length,
      previsaoFechamento,
      clientesAtivos: clientesAtivos.length,
      atividades7d: atividadesPeriodo.length
    },
    cardDetails: {
      oportunidadesAbertas: abertas.slice(0, 80),
      valorNegociacao: valorNegociacaoLista.slice(0, 80),
      propostasEnviadas: propostasEnviadas.slice(0, 80),
      previsaoFechamento: previsaoFechamentoLista.slice(0, 80),
      clientesAtivos: clientesAtivos.slice(0, 80).map((c) => ({ ...c, vendedorNome: c.vendedor?.nome || '' })),
      atividades7d: atividadesPeriodo.slice(0, 80),
      clientesComOportunidadeAberta: clientesComOportunidadeAberta.slice(0, 80).map((c) => ({ ...c, vendedorNome: c.vendedor?.nome || '' })),
      clientesSemOportunidadeAberta: clientesSemOportunidadeAberta.slice(0, 80).map((c) => ({ ...c, vendedorNome: c.vendedor?.nome || '' })),
      clientesNovosNoMes: clientesNovosNoMes.slice(0, 80).map((c) => ({ ...c, vendedorNome: c.vendedor?.nome || '' }))
    },
    clientesResumo: {
      total: clientes.length,
      comOportunidadeAberta: clientesComOportunidadeAberta.length,
      semOportunidadeAberta: clientesSemOportunidadeAberta.length,
      ativos: clientesAtivos.length,
      novosNoMes: clientesNovosNoMes.length
    },
    funilExecutivo,
    alertas: [
      { key: 'semMovimentacao', title: 'Sem movimentação', value: semMovimentacao.length, descricao: 'Oportunidades há mais de 7 dias sem atualização', severidade: semMovimentacao.length ? 'warning' : 'ok', type: 'oportunidades', items: semMovimentacao.slice(0, 80) },
      { key: 'followupsVencidos', title: 'Follow-ups vencidos', value: followupsVencidos.length, descricao: 'Próximas ações com data vencida', severidade: followupsVencidos.length ? 'danger' : 'ok', type: 'oportunidades', items: followupsVencidos.slice(0, 80) },
      { key: 'propostasSemRetorno', title: 'Propostas sem retorno', value: propostasSemRetorno.length, descricao: 'Propostas paradas há mais de 7 dias', severidade: propostasSemRetorno.length ? 'warning' : 'ok', type: 'oportunidades', items: propostasSemRetorno.slice(0, 80) },
      { key: 'clientesSemOportunidade', title: 'Clientes sem oportunidade', value: clientesSemOportunidadeAberta.length, descricao: 'Base sem card comercial aberto', severidade: clientesSemOportunidadeAberta.length ? 'neutral' : 'ok', type: 'clientes', items: clientesSemOportunidadeAberta.slice(0, 80).map((c) => ({ ...c, vendedorNome: c.vendedor?.nome || '' })) }
    ],
    rankingVendedores,
    atividades: atividadesRecentes
  })
}))

app.use((err, _req, res, _next) => {
  console.error(err)
  const mensagem = err?.message || 'Erro interno no servidor.'
  res.status(500).json({ erro: mensagem })
})

export default app
