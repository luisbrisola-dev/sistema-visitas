import 'dotenv/config'
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma.js';

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'troque-este-segredo-em-producao';
const FRONTEND_URL = process.env.FRONTEND_URL || '*';

app.use(cors({
  origin: FRONTEND_URL === '*' ? true : FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

function signToken(user) {
  return jwt.sign({ id: user.id, perfil: user.perfil }, JWT_SECRET, { expiresIn: '7d' });
}

function safeUser(user) {
  if (!user) return null;
  const { senhaHash, ...safe } = user;
  return safe;
}

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ erro: 'Não autenticado.' });
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await prisma.usuario.findUnique({ where: { id: payload.id } });
    if (!user || !user.ativo) return res.status(401).json({ erro: 'Usuário inativo ou não encontrado.' });
    req.user = user;
    next();
  } catch (_err) {
    return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.perfil !== 'Administrador') {
    return res.status(403).json({ erro: 'Acesso restrito ao administrador.' });
  }
  next();
}

function calcularDuracao(checkinHora, checkoutHora) {
  if (!checkinHora || !checkoutHora) return null;
  const inicio = new Date(checkinHora).getTime();
  const fim = new Date(checkoutHora).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fim) || fim < inicio) return null;
  return Math.round((fim - inicio) / 60000);
}

function whereCarteira(user) {
  return user.perfil === 'Administrador' ? {} : { vendedorId: user.id };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'API de visitas comerciais online com Prisma/Supabase' });
});

async function loginRoute(req, res) {
  const { usuario, senha } = req.body;
  const login = String(usuario || '').trim().toLowerCase();
  const user = await prisma.usuario.findUnique({ where: { usuario: login } });
  if (!user || !user.ativo) return res.status(401).json({ sucesso: false, erro: 'Usuário ou senha inválidos.' });
  const ok = await bcrypt.compare(String(senha || ''), user.senhaHash);
  if (!ok) return res.status(401).json({ sucesso: false, erro: 'Usuário ou senha inválidos.' });
  res.json({ sucesso: true, token: signToken(user), usuario: safeUser(user) });
}

app.post('/api/login', loginRoute);
app.post('/login', loginRoute);

app.get('/api/me', auth, async (req, res) => {
  res.json({ usuario: safeUser(req.user) });
});

app.get('/api/usuarios', auth, requireAdmin, async (_req, res) => {
  const usuarios = await prisma.usuario.findMany({ orderBy: { nome: 'asc' } });
  res.json(usuarios.map(safeUser));
});

app.post('/api/usuarios', auth, requireAdmin, async (req, res) => {
  const payload = req.body;
  if (!payload.nome || !payload.usuario || !payload.senha || !payload.perfil) {
    return res.status(400).json({ erro: 'Informe nome, usuário, senha e perfil.' });
  }
  const login = String(payload.usuario).trim().toLowerCase();
  const existe = await prisma.usuario.findUnique({ where: { usuario: login } });
  if (existe) return res.status(400).json({ erro: 'Login de usuário já cadastrado.' });
  const novo = await prisma.usuario.create({
    data: {
      nome: payload.nome,
      usuario: login,
      senhaHash: await bcrypt.hash(payload.senha, 10),
      perfil: payload.perfil,
      email: payload.email || null,
      ativo: payload.ativo ?? true
    }
  });
  res.status(201).json(safeUser(novo));
});

app.put('/api/usuarios/:id', auth, requireAdmin, async (req, res) => {
  const data = { ...req.body };
  delete data.senha;
  if (req.body.senha) data.senhaHash = await bcrypt.hash(req.body.senha, 10);
  if (data.usuario) data.usuario = String(data.usuario).trim().toLowerCase();
  const user = await prisma.usuario.update({ where: { id: req.params.id }, data });
  res.json(safeUser(user));
});

app.get('/api/clientes', auth, async (req, res) => {
  const termo = String(req.query.q || '').trim();
  const status = String(req.query.status || '').trim();
  const vendedorId = String(req.query.vendedorId || '').trim();
  const and = [whereCarteira(req.user)];
  if (status) and.push({ status });
  if (vendedorId && req.user.perfil === 'Administrador') and.push({ vendedorId });
  if (termo) {
    and.push({
      OR: ['razaoSocial', 'nomeFantasia', 'cnpj', 'cidade', 'segmento', 'contato'].map((field) => ({
        [field]: { contains: termo, mode: 'insensitive' }
      }))
    });
  }
  const clientes = await prisma.cliente.findMany({
    where: { AND: and },
    include: { vendedor: { select: { id: true, nome: true } } },
    orderBy: { nomeFantasia: 'asc' }
  });
  res.json(clientes.map((c) => ({ ...c, vendedorNome: c.vendedor?.nome || '' })));
});

app.post('/api/clientes', auth, async (req, res) => {
  const payload = req.body;
  if (!payload.razaoSocial && !payload.nomeFantasia) return res.status(400).json({ erro: 'Informe razão social ou nome fantasia.' });
  const vendedorId = req.user.perfil === 'Administrador' ? payload.vendedorId || req.user.id : req.user.id;
  const novo = await prisma.cliente.create({
    data: {
      razaoSocial: payload.razaoSocial || payload.nomeFantasia,
      nomeFantasia: payload.nomeFantasia || payload.razaoSocial,
      cnpj: payload.cnpj || null,
      segmento: payload.segmento || null,
      cidade: payload.cidade || null,
      estado: payload.estado || null,
      endereco: payload.endereco || null,
      contato: payload.contato || null,
      cargoContato: payload.cargoContato || null,
      telefone: payload.telefone || null,
      email: payload.email || null,
      vendedorId,
      status: payload.status || 'Prospect',
      potencial: payload.potencial || 'Médio',
      observacoes: payload.observacoes || null
    }
  });
  res.status(201).json(novo);
});

app.put('/api/clientes/:id', auth, async (req, res) => {
  const cliente = await prisma.cliente.findUnique({ where: { id: req.params.id } });
  if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado.' });
  if (req.user.perfil !== 'Administrador' && cliente.vendedorId !== req.user.id) {
    return res.status(403).json({ erro: 'Você não pode editar este cliente.' });
  }
  const atualizado = await prisma.cliente.update({ where: { id: req.params.id }, data: req.body });
  res.json(atualizado);
});

app.delete('/api/clientes/:id', auth, requireAdmin, async (req, res) => {
  await prisma.cliente.delete({ where: { id: req.params.id } });
  res.json({ sucesso: true });
});

app.get('/api/visitas', auth, async (req, res) => {
  const status = String(req.query.status || '').trim();
  const data = String(req.query.data || '').trim();
  const vendedorId = String(req.query.vendedorId || '').trim();
  const and = [whereCarteira(req.user)];
  if (status) and.push({ status });
  if (data) and.push({ dataAgendada: data });
  if (vendedorId && req.user.perfil === 'Administrador') and.push({ vendedorId });
  const visitas = await prisma.visita.findMany({
    where: { AND: and },
    include: { cliente: true, vendedor: { select: { id: true, nome: true } } },
    orderBy: [{ dataAgendada: 'asc' }, { horaAgendada: 'asc' }]
  });
  res.json(visitas.map((v) => ({ ...v, vendedor: v.vendedor?.nome || '' })));
});

app.post('/api/visitas', auth, async (req, res) => {
  const payload = req.body;
  if (!payload.clienteId || !payload.dataAgendada || !payload.horaAgendada) return res.status(400).json({ erro: 'Informe cliente, data e horário.' });
  const cliente = await prisma.cliente.findUnique({ where: { id: payload.clienteId } });
  if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado.' });
  if (req.user.perfil !== 'Administrador' && cliente.vendedorId !== req.user.id) return res.status(403).json({ erro: 'Cliente não pertence à sua carteira.' });
  const novo = await prisma.visita.create({
    data: {
      clienteId: payload.clienteId,
      vendedorId: req.user.perfil === 'Administrador' ? payload.vendedorId || cliente.vendedorId : req.user.id,
      dataAgendada: payload.dataAgendada,
      horaAgendada: payload.horaAgendada,
      tipoVisita: payload.tipoVisita || 'Prospecção',
      status: payload.status || 'Agendada',
      potencialCompra: payload.potencialCompra || cliente.potencial || 'Médio',
      observacoes: payload.observacoes || null
    }
  });
  res.status(201).json(novo);
});

app.put('/api/visitas/:id', auth, async (req, res) => {
  const visita = await prisma.visita.findUnique({ where: { id: req.params.id } });
  if (!visita) return res.status(404).json({ erro: 'Visita não encontrada.' });
  if (req.user.perfil !== 'Administrador' && visita.vendedorId !== req.user.id) return res.status(403).json({ erro: 'Você não pode editar esta visita.' });
  const data = { ...req.body };
  if (data.checkinHora) data.checkinHora = new Date(data.checkinHora);
  if (data.checkoutHora) data.checkoutHora = new Date(data.checkoutHora);
  const checkin = data.checkinHora ?? visita.checkinHora;
  const checkout = data.checkoutHora ?? visita.checkoutHora;
  data.duracaoMinutos = calcularDuracao(checkin, checkout);
  const statusCliente = data.statusCliente;
  delete data.statusCliente;
  const atualizada = await prisma.visita.update({ where: { id: req.params.id }, data });
  if (statusCliente) await prisma.cliente.update({ where: { id: atualizada.clienteId }, data: { status: statusCliente } });
  res.json(atualizada);
});

app.post('/api/visitas/:id/checkin', auth, async (req, res) => {
  const visita = await prisma.visita.findUnique({ where: { id: req.params.id } });
  if (!visita) return res.status(404).json({ erro: 'Visita não encontrada.' });
  if (req.user.perfil !== 'Administrador' && visita.vendedorId !== req.user.id) return res.status(403).json({ erro: 'Você não pode alterar esta visita.' });
  const atualizada = await prisma.visita.update({ where: { id: req.params.id }, data: { checkinHora: new Date(), status: 'Em andamento' } });
  res.json(atualizada);
});

app.post('/api/visitas/:id/checkout', auth, async (req, res) => {
  const visita = await prisma.visita.findUnique({ where: { id: req.params.id } });
  if (!visita) return res.status(404).json({ erro: 'Visita não encontrada.' });
  if (req.user.perfil !== 'Administrador' && visita.vendedorId !== req.user.id) return res.status(403).json({ erro: 'Você não pode alterar esta visita.' });
  const checkoutHora = new Date();
  const atualizada = await prisma.visita.update({
    where: { id: req.params.id },
    data: { checkoutHora, status: 'Realizada', duracaoMinutos: calcularDuracao(visita.checkinHora, checkoutHora) }
  });
  res.json(atualizada);
});

app.delete('/api/visitas/:id', auth, async (req, res) => {
  const visita = await prisma.visita.findUnique({ where: { id: req.params.id } });
  if (!visita) return res.status(404).json({ erro: 'Visita não encontrada.' });
  if (req.user.perfil !== 'Administrador' && visita.vendedorId !== req.user.id) return res.status(403).json({ erro: 'Você não pode excluir esta visita.' });
  await prisma.visita.delete({ where: { id: req.params.id } });
  res.json({ sucesso: true });
});

app.get('/api/dashboard', auth, async (req, res) => {
  const hoje = new Date().toISOString().slice(0, 10);
  const base = whereCarteira(req.user);
  const [totalClientes, clientesAtivos, prospects, visitasHoje, visitasAgendadas, visitasRealizadas, visitasPendentes, usuarios, proximasVisitas] = await Promise.all([
    prisma.cliente.count({ where: base }),
    prisma.cliente.count({ where: { ...base, status: 'Cliente ativo' } }),
    prisma.cliente.count({ where: { ...base, status: 'Prospect' } }),
    prisma.visita.count({ where: { ...base, dataAgendada: hoje } }),
    prisma.visita.count({ where: { ...base, status: 'Agendada' } }),
    prisma.visita.count({ where: { ...base, status: 'Realizada' } }),
    prisma.visita.count({ where: { ...base, status: { in: ['Agendada', 'Reagendada', 'Em andamento'] } } }),
    prisma.usuario.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } }),
    prisma.visita.findMany({
      where: { ...base, status: { in: ['Agendada', 'Reagendada', 'Em andamento'] } },
      include: { cliente: { select: { nomeFantasia: true } } },
      orderBy: [{ dataAgendada: 'asc' }, { horaAgendada: 'asc' }],
      take: 8
    })
  ]);
  const porVendedor = await Promise.all(
    usuarios.filter((u) => req.user.perfil === 'Administrador' || u.id === req.user.id).map(async (u) => ({
      vendedorId: u.id,
      nome: u.nome,
      visitas: await prisma.visita.count({ where: { vendedorId: u.id } }),
      realizadas: await prisma.visita.count({ where: { vendedorId: u.id, status: 'Realizada' } })
    }))
  );
  res.json({
    totalClientes,
    clientesAtivos,
    prospects,
    visitasHoje,
    visitasAgendadas,
    visitasRealizadas,
    visitasPendentes,
    porVendedor,
    proximasVisitas: proximasVisitas.map((v) => ({ ...v, cliente: v.cliente?.nomeFantasia || 'Cliente não encontrado' }))
  });
});

export default app;
