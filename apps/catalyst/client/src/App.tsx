import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import { homePathForRoles } from "./lib/nav";
import { Login } from "./pages/Login";
import { AdminDashboard, BoardDashboard, GroupDashboard, HotelDashboard } from "./pages/dashboards";
import { HsoDashboard } from "./pages/HsoDashboard";
import { DepartmentDashboard } from "./pages/DepartmentDashboard";
import { MedicalDashboard } from "./pages/MedicalDashboard";
import { AuditorDashboard } from "./pages/AuditorDashboard";
import { IncidentRegister } from "./pages/IncidentRegister";
import { IncidentDetail } from "./pages/IncidentDetail";
import { CapaRegister } from "./pages/CapaRegister";
import { CapaDetail } from "./pages/CapaDetail";
import { Documents } from "./pages/Documents";
import { Controls } from "./pages/Controls";
import { KpiCentre } from "./pages/KpiCentre";
import { EvidenceMap } from "./pages/EvidenceMap";
import { DataQuality } from "./pages/DataQuality";
import { Reports } from "./pages/Reports";
import { AdminUsers, AdminProperties, AdminSettings } from "./pages/Admin";

function AppRoutes() {
  const { loading, me, offline } = useAuth();

  if (loading) {
    return <div className="sg-loading">Loading SafeGuard…</div>;
  }
  if (!me && !offline) {
    return <Login />;
  }

  const roles = me?.roleCodes ?? [];

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to={homePathForRoles(roles)} replace />} />
        <Route path="/dashboard/admin" element={<AdminDashboard />} />
        <Route path="/dashboard/group" element={<GroupDashboard />} />
        <Route path="/dashboard/hotel" element={<HotelDashboard />} />
        <Route path="/dashboard/hso" element={<HsoDashboard />} />
        <Route path="/dashboard/department" element={<DepartmentDashboard />} />
        <Route path="/dashboard/medical" element={<MedicalDashboard />} />
        <Route path="/dashboard/auditor" element={<AuditorDashboard />} />
        <Route path="/dashboard/board" element={<BoardDashboard />} />

        <Route path="/incidents" element={<IncidentRegister />} />
        <Route path="/incidents/:id" element={<IncidentDetail />} />
        <Route path="/capa" element={<CapaRegister />} />
        <Route path="/capa/:id" element={<CapaDetail />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/controls" element={<Controls />} />
        <Route path="/kpis" element={<KpiCentre />} />
        <Route path="/evidence-map" element={<EvidenceMap />} />
        <Route path="/data-quality" element={<DataQuality />} />
        <Route path="/reports" element={<Reports />} />

        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/properties" element={<AdminProperties />} />
        <Route path="/admin/settings" element={<AdminSettings />} />

        <Route path="*" element={<Navigate to={homePathForRoles(roles)} replace />} />
      </Routes>
    </Layout>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
