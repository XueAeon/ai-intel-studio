import { lazy, Suspense } from 'react';
import { Outlet, Navigate } from 'react-router';

import { CONFIG } from 'src/global-config';
import { DashboardLayout } from 'src/layouts/dashboard';

import { LoadingScreen } from 'src/components/loading-screen';

import { AuthGuard } from 'src/auth/guard';

// ----------------------------------------------------------------------

const DashboardHomePage = lazy(() => import('src/pages/dashboard/home'));
const DashboardNewsPage = lazy(() => import('src/pages/dashboard/news'));
const Md2WechatPage = lazy(() => import('src/pages/dashboard/md2wechat'));
const CollectorSummaryPage = lazy(() => import('src/pages/dashboard/collector-summary'));

function SuspenseOutlet() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Outlet />
    </Suspense>
  );
}

const dashboardLayout = () => (
  <DashboardLayout>
    <SuspenseOutlet />
  </DashboardLayout>
);

export const dashboardRoutes = [
  {
    path: 'dashboard',
    element: CONFIG.auth.skip ? dashboardLayout() : <AuthGuard>{dashboardLayout()}</AuthGuard>,
    children: [
      { index: true, element: <Navigate to="home" replace /> },
      { path: 'home', element: <DashboardHomePage /> },
      { path: 'news', element: <DashboardNewsPage /> },
      { path: 'md2wechat', element: <Md2WechatPage /> },
      { path: 'collector-summary', element: <CollectorSummaryPage /> },
      { path: 'booking', element: <Navigate to="/dashboard/home" replace /> },
    ],
  },
];
