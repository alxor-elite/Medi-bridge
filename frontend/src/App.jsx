import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { ScrollToTop } from './components/layout/ScrollToTop'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { ProtectedRoute } from './components/common/ProtectedRoute'
import { Spinner } from './components/ui/Spinner'
import { ROLES } from './lib/constants'

// Public (self-contained: each renders its own navbar/footer or auth shell)
const Landing = lazy(() => import('./pages/public/Landing'))
const Login = lazy(() => import('./pages/public/Login'))
const Register = lazy(() => import('./pages/public/Register'))
const About = lazy(() => import('./pages/public/About'))
const VerificationInfo = lazy(() => import('./pages/public/VerificationInfo'))
const NotFound = lazy(() => import('./pages/public/NotFound'))

// Hospital
const HospitalDashboard = lazy(() => import('./pages/hospital/Dashboard'))
const HospitalSearch = lazy(() => import('./pages/hospital/Search'))
const HospitalSupplierDetails = lazy(() => import('./pages/hospital/SupplierDetails'))
const HospitalMap = lazy(() => import('./pages/hospital/MapPage'))
const HospitalCreateOrder = lazy(() => import('./pages/hospital/CreateOrder'))
const HospitalConfirmation = lazy(() => import('./pages/hospital/ReservationConfirmation'))
const HospitalOrders = lazy(() => import('./pages/hospital/Orders'))
const HospitalOrderTracking = lazy(() => import('./pages/hospital/OrderTracking'))
const HospitalNotifications = lazy(() => import('./pages/hospital/Notifications'))
const HospitalProfile = lazy(() => import('./pages/hospital/Profile'))
const HospitalAssistant = lazy(() => import('./pages/hospital/Assistant'))

// Supplier
const SupplierDashboard = lazy(() => import('./pages/supplier/Dashboard'))
const SupplierInventory = lazy(() => import('./pages/supplier/Inventory'))
const SupplierIncomingOrders = lazy(() => import('./pages/supplier/IncomingOrders'))
const SupplierOrderDetails = lazy(() => import('./pages/supplier/OrderDetails'))
const SupplierEmergencyRequests = lazy(() => import('./pages/supplier/EmergencyRequests'))
const SupplierProfile = lazy(() => import('./pages/supplier/Profile'))

// Admin
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))
const AdminVerificationQueue = lazy(() => import('./pages/admin/VerificationQueue'))
const AdminOrganizations = lazy(() => import('./pages/admin/Organizations'))
const AdminOrganizationDetails = lazy(() => import('./pages/admin/OrganizationDetails'))
const AdminOrderMonitoring = lazy(() => import('./pages/admin/OrderMonitoring'))
const AdminNetworkOverview = lazy(() => import('./pages/admin/NetworkOverview'))
const AdminAuditLogs = lazy(() => import('./pages/admin/AuditLogs'))

function PageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50">
      <Spinner size="lg" label="Loading page" />
    </div>
  )
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/about" element={<About />} />
          <Route path="/verification-info" element={<VerificationInfo />} />

          {/* Hospital */}
          <Route
            path="/hospital"
            element={
              <ProtectedRoute role={ROLES.HOSPITAL}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<HospitalDashboard />} />
            <Route path="search" element={<HospitalSearch />} />
            <Route path="orders" element={<HospitalOrders />} />
            <Route path="orders/:orderId" element={<HospitalOrderTracking />} />
            <Route path="map" element={<HospitalMap />} />
            <Route path="notifications" element={<HospitalNotifications />} />
            <Route path="assistant" element={<HospitalAssistant />} />
            <Route path="profile" element={<HospitalProfile />} />
            <Route path="supplier/:supplierId" element={<HospitalSupplierDetails />} />
            <Route path="create-order" element={<HospitalCreateOrder />} />
            <Route path="confirmation/:orderId" element={<HospitalConfirmation />} />
          </Route>

          {/* Supplier */}
          <Route
            path="/supplier"
            element={
              <ProtectedRoute role={ROLES.SUPPLIER}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<SupplierDashboard />} />
            <Route path="inventory" element={<SupplierInventory />} />
            <Route path="orders" element={<SupplierIncomingOrders />} />
            <Route path="orders/:orderId" element={<SupplierOrderDetails />} />
            <Route path="emergency" element={<SupplierEmergencyRequests />} />
            <Route path="profile" element={<SupplierProfile />} />
          </Route>

          {/* Admin */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute role={ROLES.ADMIN}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="verification" element={<AdminVerificationQueue />} />
            <Route path="organizations" element={<AdminOrganizations />} />
            <Route path="organizations/:id" element={<AdminOrganizationDetails />} />
            <Route path="orders" element={<AdminOrderMonitoring />} />
            <Route path="network" element={<AdminNetworkOverview />} />
            <Route path="audit" element={<AdminAuditLogs />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  )
}
