import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import ViewerApp from './viewer/ViewerApp'
import PrinterApp from './printer/PrinterApp'
import MobileApp from './mobile/MobileApp'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/viewer"  element={<ViewerApp />} />
        <Route path="/printer" element={<PrinterApp />} />
        <Route path="/mobile"  element={<MobileApp />} />
        <Route path="*" element={<Navigate to="/printer" replace />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>
)