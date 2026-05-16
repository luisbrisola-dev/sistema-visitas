# Sistema de Controle de Visitas Comerciais — versão produção

Stack:
- Frontend: React + Vite
- Backend: Node + Express
- Banco: Supabase PostgreSQL
- ORM: Prisma
- Autenticação: JWT + bcrypt
- Deploy: Vercel

## 1. Banco Supabase

Crie um projeto no Supabase e copie as conexões PostgreSQL:

- DATABASE_URL: conexão pooler/transaction, porta 6543
- DIRECT_URL: conexão direta, porta 5432

No backend, crie um arquivo `.env` baseado em `backend/.env.example`.

## 2. Rodar backend local

```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

Teste:

```txt
http://localhost:3001/api/health
```

Acessos iniciais criados pelo seed:

```txt
admin / admin123
vendedor / 1234
```

## 3. Rodar frontend local

Crie o arquivo `frontend/.env` baseado em `frontend/.env.example`.

```bash
cd frontend
npm install
npm run dev
```

Acesse:

```txt
http://localhost:5173
```

## 4. Deploy backend na Vercel

Crie um projeto separado na Vercel apontando para o mesmo repositório.

Configuração:

```txt
Root Directory: backend
Framework Preset: Other
Build Command: npm run vercel-build
Output Directory: deixe vazio
```

Variáveis de ambiente na Vercel do backend:

```txt
DATABASE_URL
DIRECT_URL
JWT_SECRET
FRONTEND_URL=https://URL-DO-SEU-FRONTEND.vercel.app
```

Depois do deploy, teste:

```txt
https://URL-DO-BACKEND.vercel.app/api/health
```

## 5. Deploy frontend na Vercel

No projeto frontend já existente, configure:

```txt
Root Directory: frontend
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

Variável de ambiente na Vercel do frontend:

```txt
VITE_API_URL=https://URL-DO-BACKEND.vercel.app/api
```

Depois faça redeploy do frontend.

## 6. Fluxo final

```txt
Usuário → Frontend Vercel → Backend Vercel → Supabase PostgreSQL
```

## 7. Observações importantes

- O aviso de usuário/senha foi removido da tela de login.
- As senhas não ficam salvas em texto aberto: são salvas com bcrypt.
- O login usa token JWT.
- Admin visualiza tudo.
- Vendedor visualiza apenas sua carteira e suas visitas.
