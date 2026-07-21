import { SummaryDashboard } from "./SummaryDashboard";

export function GroupDashboard() {
  return <SummaryDashboard title="Group H&S / Management Dashboard" requirePropertySelector={false} />;
}

export function HotelDashboard() {
  return <SummaryDashboard title="Hotel GM Dashboard" requirePropertySelector />;
}

export function BoardDashboard() {
  return <SummaryDashboard title="Board / Executive Dashboard" requirePropertySelector={false} hideEditing />;
}

export function AdminDashboard() {
  return <SummaryDashboard title="Super Admin Dashboard — System Overview" requirePropertySelector={false} />;
}
