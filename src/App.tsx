import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import DashboardPage from './pages/DashboardPage';
import BookingPage from './pages/BookingPage';
import PrivacyPage from './pages/PrivacyPage';

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          {/* Публичные маршруты */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/book/:master_slug" element={<BookingPage />} />

          {/* Защищённые маршруты */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />

          {/* Любой неизвестный маршрут — на главную */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}