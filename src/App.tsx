import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import ChatDrawer from './components/ChatDrawer'
import Login from './pages/Login'
import Register from './pages/Register'
import Home from './pages/Home'
import AddItem from './pages/AddItem'
import ComparePrices from './pages/ComparePrices'
import TelegramSetup from './pages/TelegramSetup'

export default function App() {
  const [showChat, setShowChat] = useState(false)

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Home onOpenChat={() => setShowChat(true)} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/add-item"
            element={
              <ProtectedRoute>
                <AddItem />
              </ProtectedRoute>
            }
          />
          <Route
            path="/compare"
            element={
              <ProtectedRoute>
                <ComparePrices />
              </ProtectedRoute>
            }
          />
          <Route
            path="/telegram-setup"
            element={
              <ProtectedRoute>
                <TelegramSetup />
              </ProtectedRoute>
            }
          />

          {/* Catch all → home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {/* Chat drawer lives outside Routes so it never unmounts */}
        <ChatDrawer isOpen={showChat} onClose={() => setShowChat(false)} />
      </BrowserRouter>
    </AuthProvider>
  )
}
