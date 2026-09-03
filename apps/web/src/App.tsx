import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './lib/auth';
import { AppShell } from './components/AppShell';
import { Spinner } from './components/ui';
import { Login } from './routes/Login';
import { Cadastro } from './routes/Cadastro';
import { Home } from './routes/Home';
import { Perfil } from './routes/Perfil';
import { CompletarCadastro } from './routes/CompletarCadastro';
import { Administradores } from './routes/Administradores';
import { Peladas } from './routes/Peladas';
import { Pelada } from './routes/Pelada';
import { Torneios } from './routes/Torneios';
import { Torneio } from './routes/Torneio';
import { Jogo } from './routes/Jogo';
import { Artilharia } from './routes/Artilharia';
import { NovaOrganizacao } from './routes/NovaOrganizacao';
import { EntrarOrg } from './routes/EntrarOrg';

function Protegida({ children }: { children: ReactNode }) {
  const { usuario, carregando } = useAuth();
  const loc = useLocation();
  if (carregando) {
    return (
      <div className="grid min-h-screen place-items-center text-campo-600">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (!usuario) return <Navigate to="/entrar" state={{ de: loc.pathname }} replace />;
  return <AppShell>{children}</AppShell>;
}

export function App() {
  const { usuario } = useAuth();
  return (
    <Routes>
      <Route path="/entrar" element={usuario ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/cadastro" element={usuario ? <Navigate to="/" replace /> : <Cadastro />} />

      <Route path="/" element={<Protegida><Home /></Protegida>} />
      <Route path="/completar-cadastro" element={<Protegida><CompletarCadastro /></Protegida>} />
      <Route path="/perfil" element={<Protegida><Perfil /></Protegida>} />
      <Route path="/peladas" element={<Protegida><Peladas /></Protegida>} />
      <Route path="/peladas/:peladaId" element={<Protegida><Pelada /></Protegida>} />
      <Route path="/torneios" element={<Protegida><Torneios /></Protegida>} />
      <Route path="/torneios/:torneioId" element={<Protegida><Torneio /></Protegida>} />
      <Route path="/jogos/:jogoId" element={<Protegida><Jogo /></Protegida>} />
      <Route path="/artilharia" element={<Protegida><Artilharia /></Protegida>} />
      <Route path="/nova-organizacao" element={<Protegida><NovaOrganizacao /></Protegida>} />
      <Route path="/org/:orgId/admins" element={<Protegida><Administradores /></Protegida>} />
      <Route path="/entrar-org/:orgId" element={<Protegida><EntrarOrg /></Protegida>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
