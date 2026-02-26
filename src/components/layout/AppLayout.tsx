import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <div className="flex h-screen min-h-[400px] min-w-[600px] bg-warm-50 dark:bg-warm-900">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6 text-warm-900 dark:text-warm-50">
        <Outlet />
      </main>
    </div>
  );
}
