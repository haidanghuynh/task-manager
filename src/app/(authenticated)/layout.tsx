import { SessionProvider } from "@/components/layout/session-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { LangProvider } from "@/lib/i18n";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <LangProvider>
        <div className="min-h-screen bg-gray-50">
          <Sidebar />
          <main className="ml-64 min-h-screen">{children}</main>
        </div>
      </LangProvider>
    </SessionProvider>
  );
}
