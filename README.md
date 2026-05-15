# Sistema de Controle de Visitas Comerciais

MVP pronto para rodar localmente.

## Acessos

Administrador:
- usuário: `admin`
- senha: `admin123`

Vendedor:
- usuário: `vendedor`
- senha: `1234`

## Como rodar

Abra dois terminais.

### Terminal 1 - Backend

```bash
cd backend
npm install
npm run dev
```

API em: `http://localhost:3001`

### Terminal 2 - Frontend

```bash
cd frontend
npm install
npm run dev
```

Sistema em: `http://localhost:5173`

## Funcionalidades

- Login com perfil Administrador e Vendedor
- Cadastro de clientes
- Cadastro de vendedores/usuários pelo administrador
- Agenda de visitas
- Registro de visita realizada
- Check-in e check-out
- Status do cliente pós-visita
- Dashboard com KPIs
- Visão por vendedor
- Permissão: vendedor vê apenas sua carteira e suas visitas

## Persistência

Os dados ficam em `backend/db.json`.

Para zerar ou editar a base manualmente, altere esse arquivo com o backend desligado.
