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
    { cidade: { contains: q, mode: 'insensitive' } }
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
        atividades: { orderBy: { criadoEm: 'desc' }, take: 1, include: { responsavel: { select: { id: true, nome: true } } } }
      },
      orderBy: [{ atualizadoEm: 'desc' }],
      take: 1000
    }),
    prisma.atividade.findMany({
      where: whereAt,
      include: { cliente: true, oportunidade: true, responsavel: { select: { id: true, nome: true } } },
      orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }],
      take: 1000
    }),
    prisma.cliente.findMany({
      where: clienteAnd.length ? { AND: clienteAnd } : {},
      include: { vendedor: { select: { id: true, nome: true } } },
      orderBy: { nomeFantasia: 'asc' },
      take: 1000
    })
  ])

  const opsSaida = oportunidades.map((o) => ({
    ...o,
    valorProposta: valorSaida(o.valorProposta),
    ultimaAtividade: o.atividades?.[0] || null
  }))
  const atvsSaida = atividades.map((a) => ({ ...a, valorProposta: valorSaida(a.valorProposta) }))

  const porEtapa = ETAPAS.map((etapa) => ({
    etapa,
    total: opsSaida.filter((o) => o.etapa === etapa).length,
    valor: opsSaida.filter((o) => o.etapa === etapa).reduce((acc, o) => acc + Number(o.valorProposta || 0), 0)
  }))
  const porTemperatura = ['Frio', 'Morno', 'Quente'].map((temperatura) => ({
    temperatura,
    total: opsSaida.filter((o) => o.temperatura === temperatura).length,
    valor: opsSaida.filter((o) => o.temperatura === temperatura).reduce((acc, o) => acc + Number(o.valorProposta || 0), 0)
  }))
  const porTipoAtividade = TIPOS_ATIVIDADE.map((tipo) => ({ tipo, total: atvsSaida.filter((a) => a.tipo === tipo).length }))
  const etapasComValor = ETAPAS.slice(ETAPAS.indexOf('Proposta enviada')).filter((etapa) => etapa !== 'Perdido')
  const oportunidadesValor = opsSaida.filter((o) => etapasComValor.includes(o.etapa))

  const clientesResumo = clientes.map((c) => {
    const opsCliente = opsSaida.filter((o) => o.clienteId === c.id)
    const atvsCliente = atvsSaida.filter((a) => a.clienteId === c.id).slice(0, 5)
    const valorTotal = opsCliente.reduce((acc, o) => acc + Number(o.valorProposta || 0), 0)
    return {
      ...c,
      vendedorNome: c.vendedor?.nome || '',
      oportunidadesAbertas: opsCliente.filter((o) => o.status === 'Aberta').length,
      oportunidadesEncerradas: opsCliente.filter((o) => o.status === 'Encerrada').length,
      ultimasAtividades: atvsCliente,
      valorTotalNegociado: valorTotal,
      statusAtual: c.status,
      vendedoresResponsaveis: [...new Set(opsCliente.map((o) => o.vendedor?.nome).filter(Boolean))],
      vendedorResponsavelAtual: [...new Set(opsCliente.map((o) => o.vendedor?.nome).filter(Boolean))].join(', ')
    }
  })

  const ranking = usuarios.map((u) => {
    const ops = opsSaida.filter((o) => o.vendedorId === u.id)
    const atividadesVend = atvsSaida.filter((a) => a.responsavelId === u.id || a.oportunidade?.vendedorId === u.id)
    const ganhas = ops.filter((o) => o.etapa === 'Cliente ativo').length
    const perdidas = ops.filter((o) => o.etapa === 'Perdido').length
    const encerradas = ganhas + perdidas
    return {
      vendedorId: u.id,
      vendedor: u.nome,
      clientesAtivos: new Set(ops.filter((o) => o.etapa === 'Cliente ativo').map((o) => o.clienteId)).size,
      oportunidadesAbertas: ops.filter((o) => o.status === 'Aberta').length,
      propostasEnviadas: ops.filter((o) => etapasComValor.includes(o.etapa)).length,
      valorEmPropostas: ops.filter((o) => etapasComValor.includes(o.etapa)).reduce((acc, o) => acc + Number(o.valorProposta || 0), 0),
      atividadesRealizadas: atividadesVend.length,
      taxaConversao: encerradas ? Number(((ganhas / encerradas) * 100).toFixed(1)) : 0
    }
  }).sort((a, b) => b.valorEmPropostas - a.valorEmPropostas)

  res.json({
    filtros: {
      vendedores: usuarios,
      etapas: ETAPAS,
      status: ['Aberta', 'Encerrada', 'Cliente ativo', 'Perdido'],
      temperaturas: ['Frio', 'Morno', 'Quente']
    },
    cards: {
      oportunidadesAbertas: opsSaida.filter((o) => o.status === 'Aberta').length,
      oportunidadesEncerradas: opsSaida.filter((o) => o.status === 'Encerrada').length,
      atividades: atvsSaida.length,
      clientes: clientesResumo.length,
      valorTotalNegociado: oportunidadesValor.reduce((acc, o) => acc + Number(o.valorProposta || 0), 0),
      taxaConversao: (() => { const ganhas = opsSaida.filter((o) => o.etapa === 'Cliente ativo').length; const perdidas = opsSaida.filter((o) => o.etapa === 'Perdido').length; return ganhas + perdidas ? Number(((ganhas / (ganhas + perdidas)) * 100).toFixed(1)) : 0 })()
    },
    opcoes: { vendedores: usuarios },
    graficos: {
      porEtapa,
      porTemperatura,
      porTipoAtividade,
      oportunidadesPorEtapa: porEtapa.map((e) => ({ nome: e.etapa, total: e.total })),
      valorPorEtapa: porEtapa.map((e) => ({ nome: e.etapa, valor: e.valor })),
      atividadesPorVendedor: ranking.map((r) => ({ nome: r.vendedor, total: r.atividadesRealizadas })),
      atividadesPorTipo: porTipoAtividade.map((e) => ({ nome: e.tipo, total: e.total })),
      temperaturaOportunidades: porTemperatura.map((e) => ({ nome: e.temperatura, total: e.total })),
      conversaoPorVendedor: ranking.map((r) => ({ nome: r.vendedor, valor: r.taxaConversao }))
    },
    ranking,
    oportunidades: opsSaida,
    atividades: atvsSaida,
    clientes: clientesResumo
  })
}))

// DASHBOARD
app.get('/api/dashboard', auth, asyncHandler(async (req, res) => {
  const whereCli = {}
  const whereOp = whereOportunidadesVisiveis(req.user)
  const whereAt = whereAtividadesVisiveis(req.user)
  const [clientes, oportunidades, atividades, tarefas] = await Promise.all([
    prisma.cliente.findMany({ where: whereCli, include: { vendedor: { select: { id: true, nome: true } } }, orderBy: { nomeFantasia: 'asc' }, take: 300 }),
    prisma.oportunidade.findMany({ where: whereOp, include: { cliente: true, vendedor: { select: { id: true, nome: true } } }, orderBy: { atualizadoEm: 'desc' }, take: 300 }),
    prisma.atividade.findMany({ where: whereAt, orderBy: { criadoEm: 'desc' }, take: 8, include: { cliente: true, oportunidade: true, responsavel: { select: { id: true, nome: true } } } }),
    prisma.tarefa.findMany({ where: { ...(isAdmin(req.user) ? {} : { responsavelId: req.user.id }), status: { not: 'Concluída' } }, orderBy: { dataLimite: 'asc' }, take: 8, include: { cliente: true } })
  ])
  const porEtapa = ETAPAS.map((etapa) => ({ etapa, total: oportunidades.filter((o) => o.etapa === etapa).length }))
  const etapasComValorDashboard = ETAPAS.slice(ETAPAS.indexOf('Proposta enviada')).filter((etapa) => etapa !== 'Perdido')
  const propostasLista = oportunidades
    .filter((o) => etapasComValorDashboard.includes(o.etapa))
    .map((o) => ({ ...o, valorProposta: valorSaida(o.valorProposta) }))
  const oportunidadesAbertasLista = oportunidades
    .filter((o) => o.status === 'Aberta')
    .map((o) => ({ ...o, valorProposta: valorSaida(o.valorProposta) }))
  const oportunidadesPorEtapa = Object.fromEntries(ETAPAS.map((etapa) => [etapa, oportunidades
    .filter((o) => o.etapa === etapa)
    .map((o) => ({ ...o, valorProposta: valorSaida(o.valorProposta) }))
  ]))
  const valorPropostas = propostasLista.reduce((acc, o) => acc + Number(o.valorProposta || 0), 0)
  res.json({
    cards: {
      clientes: clientes.length,
      oportunidadesAbertas: oportunidadesAbertasLista.length,
      propostasEnviadas: propostasLista.length,
      valorPropostas,
      tarefasPendentes: tarefas.length
    },
    clientesLista: clientes.map((c) => ({ ...c, vendedorNome: c.vendedor?.nome || '' })),
    oportunidadesAbertasLista,
    propostasLista,
    oportunidadesPorEtapa,
    porEtapa,
    atividades,
    tarefas
  })
}))

app.use((err, _req, res, _next) => {
  console.error(err)
  const mensagem = err?.message || 'Erro interno no servidor.'
  res.status(500).json({ erro: mensagem })
})

export default app
